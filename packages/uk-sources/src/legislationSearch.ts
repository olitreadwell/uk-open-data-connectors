import { UkSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import { httpGet } from './http.js';
import { stripMarkup } from './text.js';
import type { UkDataAdapter } from './types.js';

/**
 * The legislation.gov.uk search feed. Keyless, and published under the Open
 * Government Licence v3.
 */
export const LEGISLATION_SEARCH_SOURCE_ID = 'legislation-search';

/** The Atom feed behind a legislation.gov.uk search. */
export const LEGISLATION_SEARCH_URL = 'https://www.legislation.gov.uk/search/data.feed';

/** The search term the adapter asks for when a caller gives none. */
export const DEFAULT_LEGISLATION_QUERY = 'environment';

/** One Act, order, or regulation in a search result. */
export interface LegislationSearchResult {
  /** The legislation.gov.uk identifier URI. */
  id: string;
  /** The title in English, or the first title when no English span is present. */
  title: string;
  /** The Welsh title when the feed carries one. */
  titleWelsh: string | null;
  /** The canonical page for the version the search matched. */
  url: string | null;
  /** The legislation type, such as `UnitedKingdomPublicGeneralAct`. */
  type: string | null;
  year: number | null;
  number: number | null;
  updatedAt: string | null;
  publishedAt: string | null;
  /** Subject headings the feed carries, in feed order. */
  subjects: string[];
  /** The English summary when the entry has one. */
  summary: string | null;
}

/** One page of legislation.gov.uk search results. */
export interface LegislationSearchPage {
  query: string;
  page: number;
  itemsPerPage: number;
  /** Pages after this one, as the feed reports them. */
  morePages: number;
  results: LegislationSearchResult[];
}

/** Reads the text of the first tag with this name. */
function readTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return match?.[1] ?? null;
}

/** Reads an attribute from the first tag with this name. */
function readAttribute(block: string, tag: string, attribute: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*?\\b${attribute}="([^"]*)"`, 'i').exec(block);
  return match?.[1] ?? null;
}

/** Reads a whole number from the first tag with this name. */
function readNumberTag(block: string, tag: string): number | null {
  const raw = readTag(block, tag);
  if (raw === null) {
    return null;
  }
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) ? value : null;
}

/** Reads every subject heading from an entry. */
function readSubjects(entry: string): string[] {
  const subjects = [...entry.matchAll(/<ukm:Subject\b[^>]*\bValue="([^"]*)"/gi)].map(
    (match) => match[1] ?? ''
  );
  return [...new Set(subjects.filter((subject) => subject !== ''))];
}

/** Reads the first text in one language from an XHTML title or summary. */
function readLanguageText(markup: string, language: string): string | null {
  const match = new RegExp(
    `<span\\b[^>]*xml:lang="${language}"[^>]*>([\\s\\S]*?)</span>`,
    'i'
  ).exec(markup);
  const text = stripMarkup(match?.[1] ?? '');
  return text === '' ? null : text;
}

/** Reads the first unqualified link in an entry, which is its canonical page. */
function readCanonicalUrl(entry: string): string | null {
  for (const match of entry.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attributes = match[1] ?? '';
    if (!/\brel=/.test(attributes)) {
      const href = /(?:^|\s)href="([^"]*)"/i.exec(attributes)?.[1];
      if (href !== undefined) {
        return href;
      }
    }
  }
  return null;
}

/** Reads the English summary, falling back to the whole summary text. */
function readSummary(entry: string): string | null {
  const summary = readTag(entry, 'summary');
  if (summary === null) {
    return null;
  }
  const english = /<p\b[^>]*xml:lang="en"[^>]*>([\s\S]*?)<\/p>/i.exec(summary)?.[1];
  const text = stripMarkup(english ?? summary);
  return text === '' ? null : text;
}

/** Reads the id of the entry, or throws when the feed omitted it. */
function readEntryId(entry: string, index: number): string {
  const id = stripMarkup(readTag(entry, 'id') ?? '');
  if (id === '') {
    throw new UkSourceParseError(
      LEGISLATION_SEARCH_SOURCE_ID,
      `search result ${String(index + 1)} has no id`
    );
  }
  return id;
}

/** Reads the title pair from an entry. */
function readTitles(entry: string, index: number): { title: string; titleWelsh: string | null } {
  const rawTitle = readTag(entry, 'title');
  if (rawTitle === null) {
    throw new UkSourceParseError(
      LEGISLATION_SEARCH_SOURCE_ID,
      `search result ${String(index + 1)} has no title`
    );
  }
  const titleWelsh = readLanguageText(rawTitle, 'cy');
  const english = readLanguageText(rawTitle, 'en');
  const title = english ?? stripMarkup(rawTitle);
  if (title === '') {
    throw new UkSourceParseError(
      LEGISLATION_SEARCH_SOURCE_ID,
      `search result ${String(index + 1)} has no title`
    );
  }
  return { title, titleWelsh };
}

/**
 * Builds a legislation.gov.uk search feed URL.
 *
 * @param options - search term and page number
 * @param options.query - free-text search term
 * @param options.page - one-based page number
 * @returns the absolute Atom feed URL
 */
export function buildLegislationSearchUrl(options: { query?: string; page?: number } = {}): string {
  const query =
    options.query?.trim() === ''
      ? DEFAULT_LEGISLATION_QUERY
      : (options.query ?? DEFAULT_LEGISLATION_QUERY);
  const page = options.page ?? 1;
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(`page must be a positive whole number, got ${String(page)}`);
  }
  const url = new URL(LEGISLATION_SEARCH_URL);
  url.searchParams.set('text', query);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.href;
}

/**
 * Parses a legislation.gov.uk search feed.
 *
 * @param payload - the Atom response, or the committed fixture of one
 * @returns the results on the page, with the feed's own paging values
 */
export function parseLegislationSearch(payload: string): LegislationSearchPage {
  if (!/<feed\b/i.test(payload)) {
    throw new UkSourceParseError(LEGISLATION_SEARCH_SOURCE_ID, 'the response is not an Atom feed');
  }
  const queryTag = /<openSearch:Query\b[^>]*>/i.exec(payload)?.[0] ?? '';
  const query = readAttribute(queryTag, 'openSearch:Query', 'searchTerms') ?? '';
  const results = [...payload.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(
    (match, index) => {
      const entry = match[1] ?? '';
      const { title, titleWelsh } = readTitles(entry, index);
      const year = readAttribute(entry, 'ukm:Year', 'Value');
      const number = readAttribute(entry, 'ukm:Number', 'Value');
      return {
        id: readEntryId(entry, index),
        title,
        titleWelsh,
        url: readCanonicalUrl(entry),
        type: readAttribute(entry, 'ukm:DocumentMainType', 'Value'),
        year: year === null ? null : Number.parseInt(year, 10),
        number: number === null ? null : Number.parseInt(number, 10),
        updatedAt: readTag(entry, 'updated')?.trim() ?? null,
        publishedAt: readTag(entry, 'published')?.trim() ?? null,
        subjects: readSubjects(entry),
        summary: readSummary(entry),
      } satisfies LegislationSearchResult;
    }
  );
  return {
    query,
    page: readNumberTag(payload, 'leg:page') ?? 1,
    itemsPerPage: readNumberTag(payload, 'openSearch:itemsPerPage') ?? 0,
    morePages: readNumberTag(payload, 'leg:morePages') ?? 0,
    results,
  };
}

/**
 * Reads one page of legislation.gov.uk search results.
 *
 * @param options - search term, page number, and an optional fetch implementation
 * @returns the results on the requested page
 */
export async function fetchLegislationSearch(
  options: { query?: string; page?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<LegislationSearchPage> {
  const response = await httpGet(
    LEGISLATION_SEARCH_SOURCE_ID,
    buildLegislationSearchUrl({
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.page === undefined ? {} : { page: options.page }),
    }),
    {
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      headers: { accept: 'application/atom+xml' },
    }
  );
  return parseLegislationSearch(await response.text());
}

/** legislation.gov.uk search results, keyless and under the Open Government Licence. */
export const legislationSearchAdapter: UkDataAdapter<LegislationSearchPage> = {
  id: LEGISLATION_SEARCH_SOURCE_ID,
  name: 'legislation.gov.uk search',
  auth: 'none',
  description: 'Search the UK statute book for Acts, orders, and regulations.',
  fetchLive: (options) =>
    fetchLegislationSearch(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => {
    if (typeof payload !== 'string') {
      throw new UkSourceParseError(LEGISLATION_SEARCH_SOURCE_ID, 'expected an Atom feed as text');
    }
    return parseLegislationSearch(payload);
  },
  loadFixture: () => parseLegislationSearch(readFixtureText('legislation-search-2026-11-08.xml')),
};
