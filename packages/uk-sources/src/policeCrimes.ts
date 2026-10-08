import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Street-level recorded crime from the Home Office's police.uk open data API.
 * Every police force in England, Wales and Northern Ireland publishes to it,
 * keyless and monthly, under the Open Government Licence v3:
 * <https://data.police.uk/docs/>
 */
export const POLICE_CRIMES_SOURCE_ID = 'police-crimes';

/** The API root every call here is built from. */
export const POLICE_API_BASE_URL = 'https://data.police.uk/api';

/** Street-level crime within a mile of a point, for one published month. */
export const POLICE_STREET_CRIMES_URL = `${POLICE_API_BASE_URL}/crimes-street/all-crime`;

/** The months the API holds, newest first, with the forces behind each. */
export const POLICE_STREET_DATES_URL = `${POLICE_API_BASE_URL}/crimes-street-dates`;

/** The crime types the API uses, with the label it gives each one. */
export const POLICE_CRIME_CATEGORIES_URL = `${POLICE_API_BASE_URL}/crime-categories`;

/**
 * The radius the API answers for. Its street-level endpoints take a point and
 * return everything within one mile of it; there is no way to ask for less.
 */
export const POLICE_STREET_CRIMES_RADIUS_MILES = 1;

/** How many published months the summary covers by default. */
export const DEFAULT_POLICE_CRIME_MONTH_COUNT = 12;

/** The point the story counts around, and the name the page gives it. */
export const DEFAULT_POLICE_CRIME_LOCATION = {
  label: 'Leeds city centre',
  latitude: 53.7997,
  longitude: -1.5492,
} as const;

/** A point the API answers for, with the name the page shows. */
export interface PoliceCrimeLocation {
  label: string;
  latitude: number;
  longitude: number;
}

/** One crime type the API uses. */
export interface PoliceCrimeCategory {
  /** The value records carry, e.g. "violent-crime". */
  slug: string;
  /** The label the API gives it, e.g. "Violence and sexual offences". */
  name: string;
}

/** One crime type with the records counted against it. */
export interface PoliceCategoryCount {
  slug: string;
  name: string;
  recordCount: number;
}

/** One outcome with the records that ended in it. */
export interface PoliceOutcomeCount {
  /** The API's outcome label, or null when the record carries no outcome yet. */
  outcome: string | null;
  recordCount: number;
}

/** One published month with its records counted by type. */
export interface PoliceMonthCount {
  /** The month as YYYY-MM. */
  month: string;
  recordCount: number;
  /** Record counts for this month, biggest first. */
  categoryCounts: PoliceCategoryCount[];
}

/** Everything the recorded crime story draws. */
export interface PoliceCrimeSummary {
  /** How many published months the window covers. */
  monthCount: number;
  recordCount: number;
  /** Oldest month in the window. */
  firstMonth: string;
  /** Newest month in the window. */
  latestMonth: string;
  /** Record counts across the whole window, biggest first. */
  categoryCounts: PoliceCategoryCount[];
  /** Outcome counts across the whole window, biggest first. */
  outcomeCounts: PoliceOutcomeCount[];
  /** One entry per month, oldest first. */
  months: PoliceMonthCount[];
  busiestMonth: PoliceMonthCount;
  quietestMonth: PoliceMonthCount;
  topCategory: PoliceCategoryCount;
  topOutcome: PoliceOutcomeCount;
}

/** The raw API responses one summary is parsed from. */
export interface PoliceCrimeResponses {
  /** The `/crime-categories` response. */
  categories: unknown;
  /** One `/crimes-street/all-crime` response per month, newest first. */
  months: { month: string; records: unknown }[];
}

const POLICE_CATEGORY_SCHEMA = z.object({ url: z.string(), name: z.string() });

const POLICE_RECORD_SCHEMA = z.object({
  month: z.string(),
  category: z.string(),
  // The API writes no outcome at all for offences still without one.
  outcome_status: z.object({ category: z.string() }).nullable().optional(),
});

const POLICE_RESPONSES_SCHEMA = z.object({
  categories: z.array(POLICE_CATEGORY_SCHEMA),
  months: z.array(z.object({ month: z.string(), records: z.array(POLICE_RECORD_SCHEMA) })),
});

const POLICE_DATES_SCHEMA = z.array(z.object({ date: z.string() }));

const POLICE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Counts records per crime type, biggest first, ties broken by label. */
function countByCategory(
  records: { category: string }[],
  namesBySlug: Map<string, string>
): PoliceCategoryCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, recordCount]) => ({
      slug,
      name: namesBySlug.get(slug) ?? slug,
      recordCount,
    }))
    .sort(
      (left, right) => right.recordCount - left.recordCount || left.name.localeCompare(right.name)
    );
}

/** Counts records per outcome, biggest first, ties broken by label. */
function countByOutcome(records: { outcomeCategory: string | null }[]): PoliceOutcomeCount[] {
  const counts = new Map<string, PoliceOutcomeCount>();
  for (const record of records) {
    const key = record.outcomeCategory ?? '';
    const existing = counts.get(key);
    if (existing === undefined) {
      counts.set(key, { outcome: record.outcomeCategory, recordCount: 1 });
    } else {
      existing.recordCount += 1;
    }
  }
  return [...counts.values()].sort(
    (left, right) =>
      right.recordCount - left.recordCount ||
      (left.outcome ?? '').localeCompare(right.outcome ?? '')
  );
}

/**
 * Parses the API responses behind one window into the counts the chart draws.
 *
 * The API writes one record per offence, so the counts come from the same read
 * the page renders. Every check here is one the page would otherwise show as a
 * wrong number: a month that came back empty, a record filed under a month
 * other than the one it was asked for, or a crime type the category list does
 * not carry all throw rather than quietly changing the totals.
 *
 * @param payload - the raw responses, or the committed fixture of them
 * @returns the counts, with months oldest first
 */
export function parsePoliceCrimeSummary(payload: unknown): PoliceCrimeSummary {
  const parsed = POLICE_RESPONSES_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(POLICE_CRIMES_SOURCE_ID, parsed.error.message);
  }
  const { categories, months } = parsed.data;
  if (months.length === 0) {
    throw new UkSourceParseError(POLICE_CRIMES_SOURCE_ID, 'the window covers no months');
  }

  const namesBySlug = new Map<string, string>();
  for (const category of categories) {
    if (!namesBySlug.has(category.url)) {
      namesBySlug.set(category.url, category.name);
    }
  }

  const oldestFirst = [...months].sort((left, right) => left.month.localeCompare(right.month));
  for (const [index, entry] of oldestFirst.entries()) {
    if (!POLICE_MONTH_PATTERN.test(entry.month)) {
      throw new UkSourceParseError(
        POLICE_CRIMES_SOURCE_ID,
        `expected a month as YYYY-MM, got ${JSON.stringify(entry.month)}`
      );
    }
    const previous = oldestFirst[index - 1];
    if (previous?.month === entry.month) {
      throw new UkSourceParseError(POLICE_CRIMES_SOURCE_ID, `two answers for ${entry.month}`);
    }
    if (entry.records.length === 0) {
      throw new UkSourceParseError(
        POLICE_CRIMES_SOURCE_ID,
        `the API returned no records for ${entry.month}`
      );
    }
  }

  const allRecords: { category: string; outcomeCategory: string | null }[] = [];
  const monthCounts: PoliceMonthCount[] = oldestFirst.map((entry) => {
    const records = entry.records.map((record) => {
      if (record.month !== entry.month) {
        throw new UkSourceParseError(
          POLICE_CRIMES_SOURCE_ID,
          `a record filed under ${entry.month} carries the month ${record.month}`
        );
      }
      if (!namesBySlug.has(record.category)) {
        throw new UkSourceParseError(
          POLICE_CRIMES_SOURCE_ID,
          `unrecognised crime type ${JSON.stringify(record.category)}`
        );
      }
      return {
        category: record.category,
        outcomeCategory: record.outcome_status?.category ?? null,
      };
    });
    allRecords.push(...records);
    return {
      month: entry.month,
      recordCount: records.length,
      categoryCounts: countByCategory(records, namesBySlug),
    };
  });

  const byMonthSize = [...monthCounts].sort(
    (left, right) => right.recordCount - left.recordCount || left.month.localeCompare(right.month)
  );
  const categoryCounts = countByCategory(allRecords, namesBySlug);
  const outcomeCounts = countByOutcome(allRecords);
  const busiestMonth = byMonthSize[0];
  const quietestMonth = byMonthSize.at(-1);
  const topCategory = categoryCounts[0];
  const topOutcome = outcomeCounts[0];
  const firstMonth = monthCounts[0];
  const latestMonth = monthCounts.at(-1);
  if (
    busiestMonth === undefined ||
    quietestMonth === undefined ||
    topCategory === undefined ||
    topOutcome === undefined ||
    firstMonth === undefined ||
    latestMonth === undefined
  ) {
    throw new UkSourceParseError(POLICE_CRIMES_SOURCE_ID, 'the window holds no counts');
  }

  return {
    monthCount: monthCounts.length,
    recordCount: allRecords.length,
    firstMonth: firstMonth.month,
    latestMonth: latestMonth.month,
    categoryCounts,
    outcomeCounts,
    months: monthCounts,
    busiestMonth,
    quietestMonth,
    topCategory,
    topOutcome,
  };
}

/**
 * Builds the street-level crime URL for one point and one month.
 *
 * @param options - where to count, and which month to ask for
 * @returns the full query URL
 */
export function buildPoliceStreetCrimesUrl(options: {
  latitude: number;
  longitude: number;
  month: string;
}): string {
  const url = new URL(POLICE_STREET_CRIMES_URL);
  url.searchParams.set('lat', String(options.latitude));
  url.searchParams.set('lng', String(options.longitude));
  url.searchParams.set('date', options.month);
  return url.href;
}

/**
 * Lists the months the API holds street-level crime for, newest first.
 *
 * @param options - an optional fetch implementation
 * @returns the published months as YYYY-MM
 */
export async function fetchPoliceCrimeMonths(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<string[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(POLICE_CRIMES_SOURCE_ID, POLICE_STREET_DATES_URL, { fetchImpl });
  const parsed = POLICE_DATES_SCHEMA.safeParse(await response.json());
  if (!parsed.success) {
    throw new UkSourceParseError(POLICE_CRIMES_SOURCE_ID, parsed.error.message);
  }
  const months = parsed.data
    .map((entry) => entry.date)
    .filter((month) => POLICE_MONTH_PATTERN.test(month));
  if (months.length === 0) {
    throw new UkSourceParseError(POLICE_CRIMES_SOURCE_ID, 'the API listed no published months');
  }
  return months;
}

/**
 * Reads the crime types the API uses.
 *
 * @param options - an optional fetch implementation
 * @returns one entry per crime type
 */
export async function fetchPoliceCrimeCategories(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<unknown> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(POLICE_CRIMES_SOURCE_ID, POLICE_CRIME_CATEGORIES_URL, {
    fetchImpl,
  });
  return response.json();
}

/** One month's raw records, or a throw naming the month that failed. */
async function fetchPoliceStreetCrimeRecords(options: {
  latitude: number;
  longitude: number;
  month: string;
  fetchImpl: typeof globalThis.fetch;
}): Promise<unknown> {
  const url = buildPoliceStreetCrimesUrl(options);
  const response = await options.fetchImpl(url);
  if (!response.ok) {
    throw new UkSourceApiError(
      POLICE_CRIMES_SOURCE_ID,
      `HTTP ${response.status} reading ${options.month}`
    );
  }
  return response.json();
}

/**
 * Counts recorded crime within a mile of a point over the latest months.
 *
 * The months are read one at a time rather than in one burst, because the API
 * is free to use and rate-limited per caller. A window of a year is 13 calls.
 *
 * @param options - where to count, how many months, and an optional fetch implementation
 * @returns the counts for the window
 */
export async function fetchPoliceCrimeSummary(
  options: {
    latitude?: number;
    longitude?: number;
    monthCount?: number;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<PoliceCrimeSummary> {
  const {
    latitude = DEFAULT_POLICE_CRIME_LOCATION.latitude,
    longitude = DEFAULT_POLICE_CRIME_LOCATION.longitude,
    monthCount = DEFAULT_POLICE_CRIME_MONTH_COUNT,
    fetchImpl = globalThis.fetch,
  } = options;

  const published = await fetchPoliceCrimeMonths({ fetchImpl });
  const months = published.slice(0, monthCount);
  const categories = await fetchPoliceCrimeCategories({ fetchImpl });
  const responses: { month: string; records: unknown }[] = [];
  for (const month of months) {
    responses.push({
      month,
      records: await fetchPoliceStreetCrimeRecords({ latitude, longitude, month, fetchImpl }),
    });
  }
  return parsePoliceCrimeSummary({ categories, months: responses });
}

/** Home Office street-level recorded crime, keyless. */
export const policeCrimesAdapter: UkDataAdapter<PoliceCrimeSummary> = {
  id: POLICE_CRIMES_SOURCE_ID,
  name: 'Home Office police.uk recorded crime',
  auth: 'none',
  description:
    'Street-level crime recorded within a mile of a point, counted by crime type and by outcome.',
  fetchLive: (options) =>
    fetchPoliceCrimeSummary({
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parsePoliceCrimeSummary,
  loadFixture: () => parsePoliceCrimeSummary(readFixtureJson('police-crimes.json')),
};
