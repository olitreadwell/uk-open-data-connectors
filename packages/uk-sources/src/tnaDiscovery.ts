import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Discovery, The National Archives' catalogue search API. Keyless, and the
 * catalogue metadata is published under the Open Government Licence v3.
 */
export const TNA_DISCOVERY_SOURCE_ID = 'tna-discovery';

/** Base URL for the Discovery record search. */
export const TNA_DISCOVERY_SEARCH_URL =
  'https://discovery.nationalarchives.gov.uk/API/search/records';

/**
 * The header Discovery expects for a JSON answer. On 2026-10-05 the endpoint
 * also answered JSON without it, but the adapter sends it either way.
 */
export const TNA_DISCOVERY_ACCEPT_HEADER = 'application/json';

/** The search term the adapter asks for when the caller does not name one. */
export const DEFAULT_TNA_DISCOVERY_QUERY = 'test';

/** One catalogue record Discovery returns for a search. */
export interface TnaDiscoveryRecord {
  id: string;
  /** The archive's own reference, such as a catalogue piece number. */
  reference: string;
  title: string;
  description: string;
  /** The date range the record covers, as the archive writes it. */
  coveringDates: string;
  /** Depth in the catalogue hierarchy, or null when the record leaves it out. */
  catalogueLevel: number | null;
  /** The department code the record belongs to, or "" when unset. */
  department: string;
  /** Repositories holding the record. */
  heldBy: string[];
}

/** One page of Discovery search results plus the total hit count. */
export interface TnaDiscoverySearchResult {
  /** Total records matching the query, not just this page. */
  totalCount: number;
  records: TnaDiscoveryRecord[];
}

/** Rolled-up view of one Discovery search page. */
export interface TnaDiscoverySearchSummary {
  recordCount: number;
  totalCount: number;
}

const TNA_DISCOVERY_RECORD_SCHEMA = z.object({
  id: z.string(),
  reference: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  coveringDates: z.string().nullable().optional(),
  catalogueLevel: z.number().nullable().optional(),
  department: z.string().nullable().optional(),
  heldBy: z.array(z.string()).nullable().optional(),
});

const TNA_DISCOVERY_SEARCH_SCHEMA = z.object({
  records: z.array(TNA_DISCOVERY_RECORD_SCHEMA),
  count: z.number(),
});

/**
 * Builds a Discovery record search URL for one query.
 *
 * @param query - the free-text search term
 * @returns the record search URL
 */
export function buildTnaDiscoverySearchUrl(query: string): string {
  return `${TNA_DISCOVERY_SEARCH_URL}?sps.searchQuery=${encodeURIComponent(query)}`;
}

/**
 * Parses a Discovery record search payload.
 *
 * @param payload - the raw JSON body from the record search endpoint
 * @returns the page of catalogue records plus the total hit count
 */
export function parseTnaDiscoveryRecords(payload: unknown): TnaDiscoverySearchResult {
  const parsed = TNA_DISCOVERY_SEARCH_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('tna-discovery', parsed.error.message);
  }
  return {
    totalCount: parsed.data.count,
    records: parsed.data.records.map((record) => ({
      id: record.id,
      reference: record.reference ?? '',
      title: record.title ?? '',
      description: record.description ?? '',
      coveringDates: record.coveringDates ?? '',
      catalogueLevel: record.catalogueLevel ?? null,
      department: record.department ?? '',
      heldBy: record.heldBy ?? [],
    })),
  };
}

/**
 * Sums one Discovery search page.
 *
 * @param result - a page from {@link parseTnaDiscoveryRecords}
 * @returns the page size and the total hit count
 */
export function summarizeTnaDiscoverySearch(
  result: TnaDiscoverySearchResult
): TnaDiscoverySearchSummary {
  return { recordCount: result.records.length, totalCount: result.totalCount };
}

/**
 * Searches the Discovery catalogue for one query.
 *
 * @param options - the search term and an optional fetch implementation
 * @returns the page of records the search endpoint returns
 */
export async function fetchTnaDiscoveryRecords(
  options: { query?: string; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<TnaDiscoverySearchResult> {
  const { query = DEFAULT_TNA_DISCOVERY_QUERY, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet('tna-discovery', buildTnaDiscoverySearchUrl(query), {
    fetchImpl,
    headers: { Accept: TNA_DISCOVERY_ACCEPT_HEADER },
  });
  return parseTnaDiscoveryRecords(await response.json());
}

/** The National Archives Discovery catalogue search, keyless. */
export const tnaDiscoveryAdapter: UkDataAdapter<TnaDiscoverySearchResult> = {
  id: TNA_DISCOVERY_SOURCE_ID,
  name: 'The National Archives Discovery catalogue search',
  auth: 'none',
  description: `Catalogue records matching "${DEFAULT_TNA_DISCOVERY_QUERY}", with the total hit count.`,
  fetchLive: (options) =>
    fetchTnaDiscoveryRecords(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseTnaDiscoveryRecords,
  loadFixture: () => parseTnaDiscoveryRecords(readFixtureJson('tna-discovery-2026-10-05.json')),
};
