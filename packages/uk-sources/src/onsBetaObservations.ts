import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/** The ONS beta API observations adapter, keyless and published under the OGL. */
export const ONS_BETA_OBSERVATIONS_SOURCE_ID = 'ons-beta-observations';

/** The ONS beta API root. */
export const ONS_BETA_API_BASE_URL = 'https://api.beta.ons.gov.uk/v1';

/** The dataset the adapter reads when the caller names none. */
export const DEFAULT_ONS_BETA_DATASET_ID = 'wellbeing-quarterly';

/** The edition the adapter uses when the caller supplies a version but no edition. */
export const DEFAULT_ONS_BETA_EDITION = 'time-series';

/** The default ONS wellbeing query: good life satisfaction across the whole UK series. */
export const DEFAULT_ONS_BETA_DIMENSIONS: Readonly<Record<string, string>> = {
  time: '*',
  geography: 'K02000001',
  estimate: 'good',
  measureofwellbeing: 'life-satisfaction',
  seasonaladjustment: 'non-seasonal-adjustment',
};

/** One dimension value attached to an observation. */
export interface OnsBetaObservationDimension {
  id: string;
  label: string;
}

/** One observation row returned by the ONS beta API. */
export interface OnsBetaObservation {
  /** Dimension names and values that vary within this query result. */
  dimensions: Record<string, OnsBetaObservationDimension>;
  /** Source-provided labels such as confidence bounds. */
  metadata: Record<string, string>;
  /** The value exactly as the API returns it; blank means not available. */
  observation: string;
  /** The observation as a finite number, or null when the source value is not numeric. */
  numericValue: number | null;
}

/** One page of ONS beta API observations plus its dataset reference. */
export interface OnsBetaObservationPage {
  datasetId: string;
  edition: string;
  version: number;
  /** The API's unit, or null when the response leaves it out. */
  unitOfMeasure: string | null;
  totalObservations: number;
  observations: OnsBetaObservation[];
}

/** Options for an ONS beta API observations request. */
export interface OnsBetaObservationOptions {
  datasetId?: string;
  edition?: string;
  version?: number;
  dimensions?: Record<string, string>;
  fetchImpl?: typeof globalThis.fetch;
}

/** Options for building one observations URL. */
export interface OnsBetaObservationUrlOptions {
  datasetId?: string;
  edition?: string;
  version: number;
  dimensions?: Record<string, string>;
}

interface OnsBetaVersionReference {
  datasetId: string;
  edition: string;
  version: number;
}

const ONS_BETA_DATASET_SCHEMA = z.object({
  links: z.object({
    latest_version: z.object({ href: z.string() }),
  }),
});

const ONS_BETA_DIMENSION_SCHEMA = z.object({
  id: z.string(),
  label: z.string().optional(),
});

const ONS_BETA_OBSERVATION_SCHEMA = z.object({
  dimensions: z.record(z.string(), ONS_BETA_DIMENSION_SCHEMA).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  observation: z.string(),
});

const ONS_BETA_OBSERVATIONS_SCHEMA = z.object({
  links: z.object({
    version: z.object({ href: z.string() }),
  }),
  observations: z.array(ONS_BETA_OBSERVATION_SCHEMA),
  total_observations: z.number().int().nonnegative(),
  unit_of_measure: z.string().optional(),
});

const ONS_BETA_VERSION_HREF = /\/datasets\/([^/]+)\/editions\/([^/]+)\/versions\/(\d+)/;

/** Reads the dataset, edition, and version out of a beta API version link. */
function parseOnsBetaVersionReference(href: string): OnsBetaVersionReference {
  const match = ONS_BETA_VERSION_HREF.exec(href);
  if (match === null) {
    throw new UkSourceParseError(
      ONS_BETA_OBSERVATIONS_SOURCE_ID,
      `could not read dataset, edition, and version from ${href}`
    );
  }
  return {
    datasetId: decodeURIComponent(match[1] ?? ''),
    edition: decodeURIComponent(match[2] ?? ''),
    version: Number(match[3]),
  };
}

/** Turns one source value into a number when the whole string is numeric. */
function readNumericValue(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Requires a non-empty path segment. */
function requirePathSegment(name: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new RangeError(`${name} must not be empty`);
  }
  return trimmed;
}

/**
 * Builds one ONS beta API observations URL.
 *
 * @param options - dataset, edition, version, and dimension filter
 * @returns the absolute observations URL
 */
export function buildOnsBetaObservationsUrl(options: OnsBetaObservationUrlOptions): string {
  const datasetId = requirePathSegment(
    'datasetId',
    options.datasetId ?? DEFAULT_ONS_BETA_DATASET_ID
  );
  const edition = requirePathSegment('edition', options.edition ?? DEFAULT_ONS_BETA_EDITION);
  if (!Number.isInteger(options.version) || options.version < 1) {
    throw new RangeError(`version must be a positive whole number, got ${String(options.version)}`);
  }
  const dimensions = options.dimensions ?? DEFAULT_ONS_BETA_DIMENSIONS;
  const url = new URL(
    `${ONS_BETA_API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}/editions/${encodeURIComponent(edition)}/versions/${options.version}/observations`
  );
  for (const [name, value] of Object.entries(dimensions)) {
    url.searchParams.set(
      requirePathSegment('dimension name', name),
      requirePathSegment('dimension value', value)
    );
  }
  return url.href;
}

/**
 * Parses one ONS beta API observations response.
 *
 * @param payload - the raw JSON body from the observations endpoint
 * @returns the dataset reference, unit, and observation rows
 */
export function parseOnsBetaObservations(payload: unknown): OnsBetaObservationPage {
  const parsed = ONS_BETA_OBSERVATIONS_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(ONS_BETA_OBSERVATIONS_SOURCE_ID, parsed.error.message);
  }
  const reference = parseOnsBetaVersionReference(parsed.data.links.version.href);
  return {
    ...reference,
    unitOfMeasure: parsed.data.unit_of_measure ?? null,
    totalObservations: parsed.data.total_observations,
    observations: parsed.data.observations.map((observation) => ({
      dimensions: Object.fromEntries(
        Object.entries(observation.dimensions ?? {}).map(([name, dimension]) => [
          name,
          { id: dimension.id, label: dimension.label ?? dimension.id },
        ])
      ),
      metadata: observation.metadata ?? {},
      observation: observation.observation,
      numericValue: readNumericValue(observation.observation),
    })),
  };
}

/** Reads the latest edition and version from one dataset detail response. */
async function fetchOnsBetaVersionReference(
  datasetId: string,
  fetchImpl: typeof globalThis.fetch
): Promise<OnsBetaVersionReference> {
  const url = `${ONS_BETA_API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}`;
  const response = await httpGet(ONS_BETA_OBSERVATIONS_SOURCE_ID, url, { fetchImpl });
  const parsed = ONS_BETA_DATASET_SCHEMA.safeParse(await response.json());
  if (!parsed.success) {
    throw new UkSourceParseError(ONS_BETA_OBSERVATIONS_SOURCE_ID, parsed.error.message);
  }
  return parseOnsBetaVersionReference(parsed.data.links.latest_version.href);
}

/**
 * Fetches observations from the latest version of an ONS beta API dataset.
 *
 * @param options - dataset, optional version, dimension filter, and fetch implementation
 * @returns the dataset reference, unit, and observation rows
 */
export async function fetchOnsBetaObservations(
  options: OnsBetaObservationOptions = {}
): Promise<OnsBetaObservationPage> {
  const datasetId = options.datasetId ?? DEFAULT_ONS_BETA_DATASET_ID;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let edition = options.edition ?? DEFAULT_ONS_BETA_EDITION;
  let version = options.version;
  if (version === undefined) {
    const latest = await fetchOnsBetaVersionReference(datasetId, fetchImpl);
    edition = latest.edition;
    version = latest.version;
  }
  const url = buildOnsBetaObservationsUrl({
    datasetId,
    edition,
    version,
    ...(options.dimensions === undefined ? {} : { dimensions: options.dimensions }),
  });
  const response = await httpGet(ONS_BETA_OBSERVATIONS_SOURCE_ID, url, { fetchImpl });
  return parseOnsBetaObservations(await response.json());
}

/** ONS beta API observations adapter, keyless. */
export const onsBetaObservationsAdapter: UkDataAdapter<OnsBetaObservationPage> = {
  id: ONS_BETA_OBSERVATIONS_SOURCE_ID,
  name: 'Office for National Statistics beta API observations',
  auth: 'none',
  description:
    'Observations from the latest version of one ONS beta API dataset, filtered by dimension.',
  fetchLive: (options) =>
    fetchOnsBetaObservations(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseOnsBetaObservations,
  loadFixture: () =>
    parseOnsBetaObservations(readFixtureJson('ons-beta-observations-2026-11-19.json')),
};
