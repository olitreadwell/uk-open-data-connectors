import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Gazette's notice feed. Keyless, and Crown copyright free to use under
 * the Open Government Licence v3.0, except for personal data.
 */
export const GAZETTE_NOTICES_SOURCE_ID = 'gazette-notices';

/** The JSON form of the all-notices Atom feed. */
export const GAZETTE_NOTICES_URL = 'https://www.thegazette.co.uk/all-notices/notice/data.json';

/** One notice in The Gazette. */
export interface GazetteNotice {
  id: string;
  noticeCode: string | null;
  title: string;
  publishedAt: string | null;
  updatedAt: string | null;
  url: string | null;
  categories: string[];
  latitude: number | null;
  longitude: number | null;
  /** The feed's HTML summary, which can be shortened with an ellipsis. */
  contentHtml: string | null;
}

/** One page of Gazette notices. */
export interface GazetteNoticePage {
  totalCount: number;
  page: number;
  pageSize: number;
  notices: GazetteNotice[];
}

const GAZETTE_LINK_SCHEMA = z.object({
  '@href': z.string().min(1),
  '@rel': z.string().optional(),
});

const GAZETTE_CATEGORY_SCHEMA = z.union([
  z.object({ '@term': z.string() }),
  z.array(z.object({ '@term': z.string() })),
]);

const GAZETTE_ENTRY_SCHEMA = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  'f:notice-code': z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  content: z.string().optional(),
  category: GAZETTE_CATEGORY_SCHEMA.nullable().optional(),
  'geo:Point': z
    .object({
      'geo:lat': z.string().optional(),
      'geo:long': z.string().optional(),
    })
    .nullable()
    .optional(),
  link: z.array(GAZETTE_LINK_SCHEMA),
});

const GAZETTE_PAGE_SCHEMA = z.object({
  'f:total': z.union([z.string(), z.number()]),
  'f:page-number': z.union([z.string(), z.number()]),
  'f:page-size': z.union([z.string(), z.number()]),
  entry: z.array(GAZETTE_ENTRY_SCHEMA).optional(),
});

/** Reads the total, page, or page size the feed writes as text. */
function readCount(value: string | number, field: string): number {
  const count = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(count)) {
    throw new UkSourceParseError(
      GAZETTE_NOTICES_SOURCE_ID,
      `the feed wrote ${JSON.stringify(value)} for ${field}`
    );
  }
  return count;
}

/** Turns the feed's one-or-many category value into a list. */
function readCategories(
  value: z.infer<typeof GAZETTE_CATEGORY_SCHEMA> | null | undefined
): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => entry['@term']);
}

/** Reads the public notice page from the feed's links. */
function readNoticeUrl(links: z.infer<typeof GAZETTE_LINK_SCHEMA>[]): string | null {
  const link = links.find(
    (entry) => !entry['@href'].includes('/id/') && /\/notice\/\d+$/.test(entry['@href'])
  );
  return link?.['@href'] ?? null;
}

/** Reads a latitude or longitude, or null when the feed left it out. */
function readCoordinate(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const coordinate = Number.parseFloat(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

/**
 * Builds a Gazette notice feed URL.
 *
 * @param options - search text, publication date range, and page number
 * @param options.query - free-text search
 * @param options.startDate - earliest publication date, as YYYY-MM-DD
 * @param options.endDate - latest publication date, as YYYY-MM-DD
 * @param options.page - one-based page number
 * @returns the absolute JSON feed URL
 */
export function buildGazetteNoticesUrl(
  options: { query?: string; startDate?: string; endDate?: string; page?: number } = {}
): string {
  const page = options.page ?? 1;
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(`page must be a positive whole number, got ${String(page)}`);
  }
  const url = new URL(GAZETTE_NOTICES_URL);
  const query = options.query?.trim() ?? '';
  if (query !== '') {
    url.searchParams.set('text', query);
  }
  const startDate = options.startDate?.trim() ?? '';
  if (startDate !== '') {
    url.searchParams.set('start-publish-date', startDate);
  }
  const endDate = options.endDate?.trim() ?? '';
  if (endDate !== '') {
    url.searchParams.set('end-publish-date', endDate);
  }
  if (page > 1) {
    url.searchParams.set('results-page', String(page));
  }
  return url.href;
}

/**
 * Parses one page of the Gazette notice feed.
 *
 * @param payload - the JSON feed, or the committed fixture of one
 * @returns the notices on the page and the feed's total count
 */
export function parseGazetteNotices(payload: unknown): GazetteNoticePage {
  const parsed = GAZETTE_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(GAZETTE_NOTICES_SOURCE_ID, parsed.error.message);
  }
  const page = readCount(parsed.data['f:page-number'], 'f:page-number');
  const pageSize = readCount(parsed.data['f:page-size'], 'f:page-size');
  const notices = (parsed.data.entry ?? []).map((entry) => ({
    id: entry.id,
    noticeCode: entry['f:notice-code'] ?? null,
    title: entry.title,
    publishedAt: entry.published ?? null,
    updatedAt: entry.updated ?? null,
    url: readNoticeUrl(entry.link),
    categories: readCategories(entry.category),
    latitude: readCoordinate(entry['geo:Point']?.['geo:lat']),
    longitude: readCoordinate(entry['geo:Point']?.['geo:long']),
    contentHtml: entry.content ?? null,
  }));
  return {
    totalCount: readCount(parsed.data['f:total'], 'f:total'),
    page,
    pageSize,
    notices,
  };
}

/**
 * Reads one page of Gazette notices.
 *
 * @param options - search text, publication date range, page, and fetch override
 * @returns the notices on the requested page
 */
export async function fetchGazetteNotices(
  options: {
    query?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<GazetteNoticePage> {
  const response = await httpGet(
    GAZETTE_NOTICES_SOURCE_ID,
    buildGazetteNoticesUrl({
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.startDate === undefined ? {} : { startDate: options.startDate }),
      ...(options.endDate === undefined ? {} : { endDate: options.endDate }),
      ...(options.page === undefined ? {} : { page: options.page }),
    }),
    {
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      headers: { accept: 'application/json' },
    }
  );
  return parseGazetteNotices(await response.json());
}

/** The Gazette's official public record, keyless and under the Open Government Licence. */
export const gazetteNoticesAdapter: UkDataAdapter<GazetteNoticePage> = {
  id: GAZETTE_NOTICES_SOURCE_ID,
  name: 'The Gazette notices',
  auth: 'none',
  description:
    'The latest notices in the UK official public record, with their notice codes and dates.',
  fetchLive: (options) =>
    fetchGazetteNotices(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseGazetteNotices,
  loadFixture: () => parseGazetteNotices(readFixtureJson('gazette-notices-2026-11-08.json')),
};
