import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Office for Health Improvement and Disparities public health profiles,
 * published by Fingertips. Keyless, under the Open Government Licence v3.
 */
export const FINGERTIPS_INDICATORS_SOURCE_ID = 'fingertips-indicators';

/** Base URL for the Fingertips indicator metadata call. */
export const FINGERTIPS_INDICATOR_METADATA_URL =
  'https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id';

/** The indicator the adapter reads when the caller does not name one. */
export const DEFAULT_FINGERTIPS_INDICATOR_IDS: number[] = [90366];

/** One public health indicator and the metadata behind it. */
export interface FingertipsIndicatorMetadata {
  indicatorId: number;
  name: string;
  /** The body that produced the figures, such as the ONS. */
  dataSource: string;
  /** The unit the indicator counts in, or "" when Fingertips leaves it out. */
  unitLabel: string;
  /** The measure type, such as "Life expectancy". */
  valueType: string;
  /** The year basis, such as "Calendar". */
  yearType: string;
  /** When Fingertips last uploaded data, or "" when unset. */
  lastUploadedAt: string;
  /** Fingertips' override stamp for the last change, or "" when unset. */
  latestChangeTimestampOverride: string;
}

/** Rolled-up view of the indicators a call returns. */
export interface FingertipsIndicatorsSummary {
  indicatorCount: number;
  /** The distinct data sources behind the indicators, sorted. */
  dataSources: string[];
}

const FINGERTIPS_INDICATOR_SCHEMA = z.object({
  IID: z.number(),
  LatestChangeTimestampOverride: z.string().nullable().optional(),
  Unit: z.object({ Label: z.string() }).nullable().optional(),
  YearType: z.object({ Name: z.string() }).nullable().optional(),
  ValueType: z.object({ Name: z.string() }).nullable().optional(),
  Descriptive: z
    .object({ Name: z.string(), DataSource: z.string().nullable().optional() })
    .nullable()
    .optional(),
  DataChange: z.object({ LastUploadedAt: z.string().nullable().optional() }).nullable().optional(),
});

/** Indicator metadata keyed by indicator id, as Fingertips returns it. */
const FINGERTIPS_INDICATORS_SCHEMA = z.record(z.string(), FINGERTIPS_INDICATOR_SCHEMA);

/**
 * Builds the Fingertips indicator metadata URL for a set of indicator ids.
 *
 * @param indicatorIds - the indicator ids to read
 * @returns the metadata URL, ids comma-separated
 */
export function buildFingertipsIndicatorUrl(indicatorIds: number[]): string {
  return `${FINGERTIPS_INDICATOR_METADATA_URL}?indicator_ids=${indicatorIds.join(',')}`;
}

/**
 * Parses a Fingertips indicator metadata payload.
 *
 * @param payload - the raw JSON body from the metadata endpoint
 * @returns one entry per indicator the payload carries
 */
export function parseFingertipsIndicators(payload: unknown): FingertipsIndicatorMetadata[] {
  const parsed = FINGERTIPS_INDICATORS_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('fingertips-indicators', parsed.error.message);
  }
  return Object.values(parsed.data).map((indicator) => ({
    indicatorId: indicator.IID,
    name: indicator.Descriptive?.Name ?? '',
    dataSource: indicator.Descriptive?.DataSource ?? '',
    unitLabel: indicator.Unit?.Label ?? '',
    valueType: indicator.ValueType?.Name ?? '',
    yearType: indicator.YearType?.Name ?? '',
    lastUploadedAt: indicator.DataChange?.LastUploadedAt ?? '',
    latestChangeTimestampOverride: indicator.LatestChangeTimestampOverride ?? '',
  }));
}

/**
 * Sums the indicators a call returns.
 *
 * @param indicators - indicators from {@link parseFingertipsIndicators}
 * @returns the indicator count and the distinct data sources behind them
 */
export function summarizeFingertipsIndicators(
  indicators: FingertipsIndicatorMetadata[]
): FingertipsIndicatorsSummary {
  const dataSources = [...new Set(indicators.map((indicator) => indicator.dataSource))]
    .filter((dataSource) => dataSource !== '')
    .sort((left, right) => left.localeCompare(right));
  return { indicatorCount: indicators.length, dataSources };
}

/**
 * Reads metadata for a set of Fingertips public health indicators.
 *
 * @param options - indicator ids and an optional fetch implementation
 * @returns the indicator metadata the endpoint returns
 */
export async function fetchFingertipsIndicators(
  options: { indicatorIds?: number[]; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<FingertipsIndicatorMetadata[]> {
  const { indicatorIds = DEFAULT_FINGERTIPS_INDICATOR_IDS, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(
    'fingertips-indicators',
    buildFingertipsIndicatorUrl(indicatorIds),
    { fetchImpl }
  );
  return parseFingertipsIndicators(await response.json());
}

/** Fingertips public health indicator metadata, keyless. */
export const fingertipsIndicatorsAdapter: UkDataAdapter<FingertipsIndicatorMetadata[]> = {
  id: FINGERTIPS_INDICATORS_SOURCE_ID,
  name: 'Office for Health Improvement and Disparities Fingertips indicators',
  auth: 'none',
  description:
    'Metadata for the public health indicators Fingertips publishes, with their sources.',
  fetchLive: (options) =>
    fetchFingertipsIndicators(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseFingertipsIndicators,
  loadFixture: () =>
    parseFingertipsIndicators(readFixtureJson('fingertips-indicators-2026-10-05.json')),
};
