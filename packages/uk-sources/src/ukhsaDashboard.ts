import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The UK Health Security Agency data dashboard API. Keyless, published under
 * the Open Government Licence v3.
 */
export const UKHSA_DASHBOARD_SOURCE_ID = 'ukhsa-dashboard';

/** Root of the UKHSA data dashboard API. */
export const UKHSA_DASHBOARD_API_BASE_URL = 'https://api.ukhsa-dashboard.data.gov.uk';

/**
 * The metric the adapter reads: new HIV diagnoses in England, a country-level
 * annual series the dashboard publishes with real counts.
 */
export const UKHSA_DASHBOARD_METRIC_PATH =
  '/themes/infectious_disease/sub_themes/bloodborne/topics/HIV' +
  '/geography_types/Nation/geographies/England/metrics/HIV_cases_newDiagnoses';

/** How many metric points the adapter asks for per page by default. */
export const UKHSA_DASHBOARD_PAGE_SIZE = 10;

/** One metric point from the UKHSA dashboard. */
export interface UkhsaMetricPoint {
  theme: string;
  subTheme: string;
  topic: string;
  geographyType: string;
  geography: string;
  /** ONS geography code for the area, or "" when the API leaves it out. */
  geographyCode: string;
  metric: string;
  metricGroup: string;
  stratum: string;
  /** "all" for the whole population, otherwise a named subgroup. */
  sex: string;
  age: string;
  year: number;
  /** Calendar month, 1 to 12, or null for a point that is not monthly. */
  month: number | null;
  /** Epidemiological week, or null for a point that is not weekly. */
  epiweek: number | null;
  /** The point's date, ISO 8601. */
  date: string;
  /** The measured value, or null where the API publishes none. */
  metricValue: number | null;
  /** True while the dashboard flags the point as still settling. */
  inReportingDelayPeriod: boolean;
}

/** One page of UKHSA metric points plus the API's total count. */
export interface UkhsaMetricPage {
  /** Total points the API holds for the metric, not just this page. */
  totalCount: number;
  points: UkhsaMetricPoint[];
}

/** Rolled-up view of one page of UKHSA metric points. */
export interface UkhsaMetricSummary {
  pointCount: number;
  totalCount: number;
  /** Earliest and latest dates on the page, "" when the page is empty. */
  firstDate: string;
  lastDate: string;
  /** The value on the latest point, or null when the page is empty. */
  latestValue: number | null;
}

const UKHSA_METRIC_POINT_SCHEMA = z.object({
  theme: z.string(),
  sub_theme: z.string(),
  topic: z.string(),
  geography_type: z.string(),
  geography: z.string(),
  geography_code: z.string().nullable().optional(),
  metric: z.string(),
  metric_group: z.string().nullable().optional(),
  stratum: z.string().nullable().optional(),
  sex: z.string(),
  age: z.string(),
  year: z.number(),
  month: z.number().nullable().optional(),
  epiweek: z.number().nullable().optional(),
  date: z.string(),
  metric_value: z.number().nullable().optional(),
  in_reporting_delay_period: z.boolean(),
});

const UKHSA_METRIC_PAGE_SCHEMA = z.object({
  count: z.number(),
  results: z.array(UKHSA_METRIC_POINT_SCHEMA),
});

/**
 * Builds the metric URL for one page size.
 *
 * @param pageSize - how many metric points to ask for
 * @returns the metric endpoint URL
 */
export function buildUkhsaMetricUrl(pageSize: number): string {
  return `${UKHSA_DASHBOARD_API_BASE_URL}${UKHSA_DASHBOARD_METRIC_PATH}?page_size=${pageSize}`;
}

/**
 * Parses a UKHSA dashboard metric payload.
 *
 * @param payload - the raw JSON body from the metric endpoint
 * @returns the page of metric points plus the API's total count
 */
export function parseUkhsaMetricPoints(payload: unknown): UkhsaMetricPage {
  const parsed = UKHSA_METRIC_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('ukhsa-dashboard', parsed.error.message);
  }
  return {
    totalCount: parsed.data.count,
    points: parsed.data.results.map((point) => ({
      theme: point.theme,
      subTheme: point.sub_theme,
      topic: point.topic,
      geographyType: point.geography_type,
      geography: point.geography,
      geographyCode: point.geography_code ?? '',
      metric: point.metric,
      metricGroup: point.metric_group ?? '',
      stratum: point.stratum ?? '',
      sex: point.sex,
      age: point.age,
      year: point.year,
      month: point.month ?? null,
      epiweek: point.epiweek ?? null,
      date: point.date,
      metricValue: point.metric_value ?? null,
      inReportingDelayPeriod: point.in_reporting_delay_period,
    })),
  };
}

/**
 * Sums one page of UKHSA metric points.
 *
 * @param page - a page from {@link parseUkhsaMetricPoints}
 * @returns point counts, the date range on the page, and the latest value
 */
export function summarizeUkhsaMetricPoints(page: UkhsaMetricPage): UkhsaMetricSummary {
  let firstDate = '';
  let lastDate = '';
  let latestValue: number | null = null;
  for (const point of page.points) {
    if (firstDate === '' || point.date < firstDate) {
      firstDate = point.date;
    }
    if (point.date >= lastDate) {
      lastDate = point.date;
      latestValue = point.metricValue;
    }
  }
  return {
    pointCount: page.points.length,
    totalCount: page.totalCount,
    firstDate,
    lastDate,
    latestValue,
  };
}

/**
 * Reads one page of UKHSA dashboard metric points.
 *
 * @param options - page size and an optional fetch implementation
 * @returns the page of metric points the endpoint returns
 */
export async function fetchUkhsaMetricPoints(
  options: { pageSize?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<UkhsaMetricPage> {
  const { pageSize = UKHSA_DASHBOARD_PAGE_SIZE, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet('ukhsa-dashboard', buildUkhsaMetricUrl(pageSize), { fetchImpl });
  return parseUkhsaMetricPoints(await response.json());
}

/** UK Health Security Agency data dashboard metric points, keyless. */
export const ukhsaDashboardAdapter: UkDataAdapter<UkhsaMetricPage> = {
  id: UKHSA_DASHBOARD_SOURCE_ID,
  name: 'UK Health Security Agency data dashboard',
  auth: 'none',
  description: 'New HIV diagnoses in England, as annual counts from the UKHSA dashboard.',
  fetchLive: (options) =>
    fetchUkhsaMetricPoints(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseUkhsaMetricPoints,
  loadFixture: () => parseUkhsaMetricPoints(readFixtureJson('ukhsa-dashboard-2026-10-05.json')),
};
