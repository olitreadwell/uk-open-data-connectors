import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Find a Tender, the UK's post-Brexit public procurement service run by the
 * Cabinet Office. Keyless, and the notices are published under the Open
 * Government Licence v3, matching the licence the payload itself carries.
 */
export const FIND_A_TENDER_SOURCE_ID = 'find-a-tender';

/** The OCDS 1.1 release packages endpoint. */
export const FIND_A_TENDER_RELEASE_PACKAGES_URL =
  'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';

/** How many release packages the adapter asks for by default. */
export const FIND_A_TENDER_RELEASE_LIMIT = 10;

/** One Open Contracting Data Standard release, as Find a Tender publishes it. */
export interface FindATenderRelease {
  /** Open Contracting identifier shared by every release of one tender. */
  ocid: string;
  /** The release id, unique within the tender. */
  id: string;
  /** When the release was published, ISO 8601 with an offset. */
  date: string;
  /** Release tags, such as "tender", "award", or "contractAmendment". */
  tags: string[];
  tenderTitle: string;
  /** Tender status, such as "active" or "complete", or "" when unset. */
  tenderStatus: string;
  procurementMethod: string;
  buyerName: string;
  /** The tender value amount, or null when the release leaves it out. */
  tenderValueAmount: number | null;
}

/** One page of OCDS releases plus the package metadata around them. */
export interface FindATenderReleasePage {
  /** The package URI the service echoes back, including its own cursor. */
  uri: string;
  version: string;
  publishedDate: string;
  releases: FindATenderRelease[];
}

/** Release counts by tender status. */
export interface FindATenderStatusCount {
  status: string;
  releaseCount: number;
}

/** Rolled-up view of one page of Find a Tender releases. */
export interface FindATenderSummary {
  releaseCount: number;
  /** Releases with an unset tender status. */
  unsetStatusCount: number;
  statusCounts: FindATenderStatusCount[];
}

const FIND_A_TENDER_RELEASE_SCHEMA = z.object({
  ocid: z.string(),
  id: z.string(),
  date: z.string(),
  tag: z.array(z.string()).optional(),
  tender: z
    .object({
      title: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      procurementMethod: z.string().nullable().optional(),
      value: z.object({ amount: z.number().nullable().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
  buyer: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
});

const FIND_A_TENDER_RELEASE_PACKAGE_SCHEMA = z.object({
  uri: z.string(),
  version: z.string(),
  publishedDate: z.string(),
  releases: z.array(FIND_A_TENDER_RELEASE_SCHEMA),
});

/**
 * Parses an OCDS release packages payload into releases.
 *
 * @param payload - the raw JSON body from the release packages endpoint
 * @returns the releases plus the package metadata
 */
export function parseFindATenderReleases(payload: unknown): FindATenderReleasePage {
  const parsed = FIND_A_TENDER_RELEASE_PACKAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('find-a-tender', parsed.error.message);
  }
  return {
    uri: parsed.data.uri,
    version: parsed.data.version,
    publishedDate: parsed.data.publishedDate,
    releases: parsed.data.releases.map((release) => ({
      ocid: release.ocid,
      id: release.id,
      date: release.date,
      tags: release.tag ?? [],
      tenderTitle: release.tender?.title ?? '',
      tenderStatus: release.tender?.status ?? '',
      procurementMethod: release.tender?.procurementMethod ?? '',
      buyerName: release.buyer?.name ?? '',
      tenderValueAmount: release.tender?.value?.amount ?? null,
    })),
  };
}

/**
 * Counts the releases on one page by tender status.
 *
 * @param page - a page from {@link parseFindATenderReleases}
 * @returns the release count and a per-status breakdown, most releases first
 */
export function summarizeFindATenderReleases(page: FindATenderReleasePage): FindATenderSummary {
  const countByStatus = new Map<string, number>();
  let unsetStatusCount = 0;
  for (const release of page.releases) {
    if (release.tenderStatus === '') {
      unsetStatusCount += 1;
      continue;
    }
    countByStatus.set(release.tenderStatus, (countByStatus.get(release.tenderStatus) ?? 0) + 1);
  }
  const statusCounts: FindATenderStatusCount[] = [...countByStatus.entries()]
    .map(([status, releaseCount]) => ({ status, releaseCount }))
    .sort(
      (left, right) =>
        right.releaseCount - left.releaseCount || left.status.localeCompare(right.status)
    );
  return { releaseCount: page.releases.length, unsetStatusCount, statusCounts };
}

/**
 * Lists the most recent Find a Tender release packages.
 *
 * @param options - release limit and an optional fetch implementation
 * @returns the releases the endpoint returns
 */
export async function fetchFindATenderReleases(
  options: { limit?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<FindATenderReleasePage> {
  const { limit = FIND_A_TENDER_RELEASE_LIMIT, fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(`${FIND_A_TENDER_RELEASE_PACKAGES_URL}?limit=${limit}`);
  if (!response.ok) {
    throw new UkSourceApiError('find-a-tender', `HTTP ${response.status} listing releases`);
  }
  return parseFindATenderReleases(await response.json());
}

/** Find a Tender OCDS release packages, keyless. */
export const findATenderAdapter: UkDataAdapter<FindATenderReleasePage> = {
  id: FIND_A_TENDER_SOURCE_ID,
  name: 'Find a Tender OCDS release packages',
  auth: 'none',
  description: 'The most recent public procurement notices Find a Tender publishes.',
  fetchLive: (options) =>
    fetchFindATenderReleases(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseFindATenderReleases,
  loadFixture: () => parseFindATenderReleases(readFixtureJson('find-a-tender-2026-10-05.json')),
};
