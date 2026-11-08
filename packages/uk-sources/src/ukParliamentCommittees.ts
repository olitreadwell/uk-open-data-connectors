import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The UK Parliament OData service. Keyless, published under the Open
 * Parliament Licence v3.0:
 * <https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/>
 */
export const UK_PARLIAMENT_COMMITTEE_SOURCE_ID = 'uk-parliament-committees';

/** Root of the Parliament OData service. */
export const UK_PARLIAMENT_ODATA_BASE_URL = 'https://api.parliament.uk/odata';

/** The OData entity set that lists parliamentary committees. */
export const UK_PARLIAMENT_COMMITTEE_ENTITY = 'ParliamentaryCommittee';

/** How many committees the adapter asks for by default. */
export const DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT = 20;

/** One parliamentary committee as the OData service lists it. */
export interface UkParliamentCommittee {
  localId: string;
  name: string;
  remit: string | null;
  mnisId: string | null;
  startDate: string | null;
  endDate: string | null;
  /** True when the source has no end date for the committee. */
  isCurrent: boolean;
}

/** One page of parliamentary committees and its current and ended counts. */
export interface UkParliamentCommitteePage {
  committees: UkParliamentCommittee[];
  currentCount: number;
  endedCount: number;
}

const COMMITTEE_ROW_SCHEMA = z.object({
  LocalId: z.string().min(1),
  FormalBodyName: z.string().min(1),
  FormalBodyRemit: z.string().nullable().optional(),
  FormalBodyMnisId: z.string().nullable().optional(),
  FormalBodyStartDate: z.string().nullable().optional(),
  FormalBodyEndDate: z.string().nullable().optional(),
});

const COMMITTEE_PAGE_SCHEMA = z.object({
  value: z.array(COMMITTEE_ROW_SCHEMA),
});

/**
 * Builds the OData URL for one page of parliamentary committees.
 *
 * @param options - page size and optional offset
 * @param options.limit - how many committees to ask for
 * @param options.offset - how many committees to skip
 * @returns the absolute OData URL
 */
export function buildUkParliamentCommitteeUrl(
  options: { limit?: number; offset?: number } = {}
): string {
  const limit = options.limit ?? DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT;
  const offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive whole number, got ${String(limit)}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError(`offset must be a whole number of zero or more, got ${String(offset)}`);
  }
  const url = new URL(`${UK_PARLIAMENT_ODATA_BASE_URL}/${UK_PARLIAMENT_COMMITTEE_ENTITY}`);
  url.searchParams.set('$top', String(limit));
  url.searchParams.set('$orderby', 'FormalBodyName');
  if (offset > 0) {
    url.searchParams.set('$skip', String(offset));
  }
  return url.href;
}

/**
 * Parses one OData page of parliamentary committees.
 *
 * @param payload - the OData response, or the committed fixture of one
 * @returns the committees on the page, with current and ended counts
 */
export function parseUkParliamentCommittees(payload: unknown): UkParliamentCommitteePage {
  const parsed = COMMITTEE_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(UK_PARLIAMENT_COMMITTEE_SOURCE_ID, parsed.error.message);
  }
  const seenIds = new Set<string>();
  const committees = parsed.data.value.map((row) => {
    if (seenIds.has(row.LocalId)) {
      throw new UkSourceParseError(
        UK_PARLIAMENT_COMMITTEE_SOURCE_ID,
        `${row.FormalBodyName} is listed more than once (${row.LocalId})`
      );
    }
    seenIds.add(row.LocalId);
    const endDate = row.FormalBodyEndDate ?? null;
    return {
      localId: row.LocalId,
      name: row.FormalBodyName,
      remit: row.FormalBodyRemit ?? null,
      mnisId: row.FormalBodyMnisId ?? null,
      startDate: row.FormalBodyStartDate ?? null,
      endDate,
      isCurrent: endDate === null,
    };
  });
  const currentCount = committees.filter((committee) => committee.isCurrent).length;
  return {
    committees,
    currentCount,
    endedCount: committees.length - currentCount,
  };
}

/**
 * Reads one page of parliamentary committees from the Parliament OData service.
 *
 * @param options - page size, offset, and an optional fetch implementation
 * @param options.limit - how many committees to ask for
 * @param options.offset - how many committees to skip
 * @param options.fetchImpl - fetch override, used by tests
 * @returns the committees on the requested page
 */
export async function fetchUkParliamentCommittees(
  options: { limit?: number; offset?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<UkParliamentCommitteePage> {
  const { limit, offset, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(
    UK_PARLIAMENT_COMMITTEE_SOURCE_ID,
    buildUkParliamentCommitteeUrl({
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    }),
    { fetchImpl, headers: { accept: 'application/json' } }
  );
  return parseUkParliamentCommittees(await response.json());
}

/** UK Parliament committee listings, keyless and under the Open Parliament Licence. */
export const ukParliamentCommitteesAdapter: UkDataAdapter<UkParliamentCommitteePage> = {
  id: UK_PARLIAMENT_COMMITTEE_SOURCE_ID,
  name: 'UK Parliament committees',
  auth: 'none',
  description: 'Parliamentary committees, with their remit, start date, and end date.',
  fetchLive: (options) =>
    fetchUkParliamentCommittees(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseUkParliamentCommittees,
  loadFixture: () =>
    parseUkParliamentCommittees(readFixtureJson('uk-parliament-committees-2026-11-08.json')),
};
