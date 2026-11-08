import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The UK Research and Innovation Gateway to Research (GTR) API. Keyless,
 * and the GTR terms say the service is open and free to use:
 * <https://gtr.ukri.org/terms-of-use-for-gtr>
 */
export const UKRI_GTR_AWARDS_SOURCE_ID = 'ukri-gtr-awards';

/** Root of the version 3 GTR API. */
export const UKRI_GTR_API_BASE_URL = 'https://gtr.ukri.org/api/v3';

/** The GTR awards path. */
export const UKRI_GTR_AWARDS_PATH = 'awards';

/** The smallest page the GTR API accepts. */
export const DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE = 20;

/** The largest page the GTR API accepts. */
export const MAX_UKRI_GTR_AWARD_PAGE_SIZE = 100;

/** The name of a GTR lead person, when the award carries one. */
export interface UkriGtrPersonName {
  firstName: string | null;
  surname: string | null;
  preferredName: string | null;
}

/** One UKRI-funded award from the GTR API. */
export interface UkriGtrAward {
  id: string;
  projectTitle: string;
  projectStatus: string;
  grantRefNumber: string;
  grantCategory: string;
  fundingOrgName: string;
  fundingOrgLongName: string;
  leadOrgId: string;
  leadOrgName: string;
  leadOrgRegion: string | null;
  leadOrgRole: string;
  startDate: string | null;
  endDate: string | null;
  totalGrantValue: number | null;
  leadPersonId: string | null;
  leadPersonName: UkriGtrPersonName | null;
  projectPath: string;
  apiUrl: string;
}

/** One page of GTR awards and the paging metadata the API returned. */
export interface UkriGtrAwardPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  lastDataRefreshDate: string;
  awards: UkriGtrAward[];
}

const PERSON_NAME_SCHEMA = z.object({
  firstName: z.string().nullable().optional(),
  surname: z.string().nullable().optional(),
  preferredName: z.string().nullable().optional(),
});

const AWARD_ITEM_SCHEMA = z.object({
  id: z.string().min(1),
  projectTitle: z.string().min(1),
  projectStatus: z.string(),
  grantRefNumber: z.string(),
  grantCategory: z.string(),
  fundingOrgName: z.string(),
  fundingOrgLongName: z.string(),
  leadOrgId: z.string(),
  leadOrgName: z.string(),
  leadOrgRegion: z.string().nullable().optional(),
  leadOrgRole: z.string(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  totalGrantValue: z.number().nullable().optional(),
  leadPersonId: z.string().nullable().optional(),
  leadPersonName: PERSON_NAME_SCHEMA.nullable().optional(),
  href: z.string(),
  uiPath: z.string(),
});

const AWARD_PAGE_SCHEMA = z.object({
  awardList: z.array(z.object({ awardListItem: AWARD_ITEM_SCHEMA })),
  paging: z.object({
    page: z.number().int().positive(),
    size: z.number().int().positive(),
    totalSize: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
  common: z.object({
    lastDataRefreshDate: z.string(),
  }),
});

/**
 * Builds a GTR awards URL for one page of the newest awards.
 *
 * @param options - keyword query, page number, and page size
 * @param options.query - free-text award search
 * @param options.page - page number, starting at 1
 * @param options.pageSize - records per page, from 20 to 100
 * @returns the absolute GTR awards URL
 */
export function buildUkriGtrAwardsUrl(
  options: { query?: string; page?: number; pageSize?: number } = {}
): string {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE;
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(`page must be a whole number of one or more, got ${String(page)}`);
  }
  if (
    !Number.isInteger(pageSize) ||
    pageSize < DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE ||
    pageSize > MAX_UKRI_GTR_AWARD_PAGE_SIZE
  ) {
    throw new RangeError(
      `pageSize must be a whole number from ${String(DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE)} to ${String(MAX_UKRI_GTR_AWARD_PAGE_SIZE)}, got ${String(pageSize)}`
    );
  }
  const url = new URL(`${UKRI_GTR_API_BASE_URL}/${UKRI_GTR_AWARDS_PATH}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(pageSize));
  url.searchParams.set('sortfield', 'startDate');
  url.searchParams.set('sortorder', 'D');
  const query = options.query?.trim() ?? '';
  if (query !== '') {
    url.searchParams.set('query', query);
  }
  return url.href;
}

/**
 * Parses one page of GTR awards.
 *
 * @param payload - the API response, or the committed fixture of one
 * @returns the awards and the paging metadata
 */
export function parseUkriGtrAwards(payload: unknown): UkriGtrAwardPage {
  const parsed = AWARD_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(UKRI_GTR_AWARDS_SOURCE_ID, parsed.error.message);
  }
  const seenIds = new Set<string>();
  const awards = parsed.data.awardList.map((entry) => {
    const award = entry.awardListItem;
    if (seenIds.has(award.id)) {
      throw new UkSourceParseError(
        UKRI_GTR_AWARDS_SOURCE_ID,
        `${award.projectTitle} is listed more than once (${award.id})`
      );
    }
    seenIds.add(award.id);
    const person = award.leadPersonName;
    return {
      id: award.id,
      projectTitle: award.projectTitle,
      projectStatus: award.projectStatus,
      grantRefNumber: award.grantRefNumber,
      grantCategory: award.grantCategory,
      fundingOrgName: award.fundingOrgName,
      fundingOrgLongName: award.fundingOrgLongName,
      leadOrgId: award.leadOrgId,
      leadOrgName: award.leadOrgName,
      leadOrgRegion: award.leadOrgRegion ?? null,
      leadOrgRole: award.leadOrgRole,
      startDate: award.startDate ?? null,
      endDate: award.endDate ?? null,
      totalGrantValue: award.totalGrantValue ?? null,
      leadPersonId: award.leadPersonId ?? null,
      leadPersonName:
        person === undefined || person === null
          ? null
          : {
              firstName: person.firstName ?? null,
              surname: person.surname ?? null,
              preferredName: person.preferredName ?? null,
            },
      projectPath: award.uiPath,
      apiUrl: award.href,
    };
  });
  return {
    page: parsed.data.paging.page,
    pageSize: parsed.data.paging.size,
    totalCount: parsed.data.paging.totalSize,
    totalPages: parsed.data.paging.totalPages,
    lastDataRefreshDate: parsed.data.common.lastDataRefreshDate,
    awards,
  };
}

/**
 * Reads one page of GTR awards, newest start date first.
 *
 * @param options - optional query, page, page size, and fetch implementation
 * @param options.query - free-text award search
 * @param options.page - page number, starting at 1
 * @param options.pageSize - records per page, from 20 to 100
 * @param options.fetchImpl - fetch override, used by tests
 * @returns the awards on the requested page
 */
export async function fetchUkriGtrAwards(
  options: {
    query?: string;
    page?: number;
    pageSize?: number;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<UkriGtrAwardPage> {
  const { query, page, pageSize, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(
    UKRI_GTR_AWARDS_SOURCE_ID,
    buildUkriGtrAwardsUrl({
      ...(query === undefined ? {} : { query }),
      ...(page === undefined ? {} : { page }),
      ...(pageSize === undefined ? {} : { pageSize }),
    }),
    { fetchImpl, headers: { accept: 'application/json' } }
  );
  return parseUkriGtrAwards(await response.json());
}

/** UKRI Gateway to Research awards, keyless. */
export const ukriGtrAwardsAdapter: UkDataAdapter<UkriGtrAwardPage> = {
  id: UKRI_GTR_AWARDS_SOURCE_ID,
  name: 'UKRI Gateway to Research awards',
  auth: 'none',
  description:
    'UKRI-funded research awards, newest start date first, with their lead organisation.',
  fetchLive: (options) =>
    fetchUkriGtrAwards(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseUkriGtrAwards,
  loadFixture: () => parseUkriGtrAwards(readFixtureJson('ukri-gtr-awards-2026-11-08.json')),
};
