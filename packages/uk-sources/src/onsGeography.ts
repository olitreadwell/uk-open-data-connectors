import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import { stripMarkup } from './text.js';
import type { UkDataAdapter } from './types.js';

/**
 * The ONS Open Geography Portal search API. Keyless, and the portal says its
 * boundary data carries the Open Government Licence v3.
 */
export const ONS_GEOGRAPHY_SOURCE_ID = 'ons-geography';

/** The GeoJSON search endpoint behind the portal. */
export const ONS_GEOGRAPHY_SEARCH_URL =
  'https://geoportal.statistics.gov.uk/api/search/v1/collections/all/items';

/** How many geography datasets the adapter asks for by default. */
export const DEFAULT_ONS_GEOGRAPHY_LIMIT = 20;

/** One geography dataset from the ONS portal search. */
export interface OnsGeographyDataset {
  id: string;
  title: string;
  /** The ArcGIS item type, such as `Feature Service`. */
  type: string | null;
  owner: string | null;
  url: string | null;
  /** The dataset description with its HTML removed. */
  description: string | null;
  /** The licence identifier the portal carries, such as `custom`. */
  licence: string | null;
  /** The licence text or link with its HTML removed. */
  licenceInfo: string | null;
  tags: string[];
  createdAt: string | null;
  modifiedAt: string | null;
  geometryType: string | null;
}

/** One page of ONS geography datasets. */
export interface OnsGeographyPage {
  totalCount: number;
  returnedCount: number;
  /** Start index for the next page, when the response carries one. */
  nextStartIndex: number | null;
  datasets: OnsGeographyDataset[];
}

const ONS_FEATURE_SCHEMA = z.object({
  id: z.string().min(1),
  geometry: z.object({ type: z.string() }).nullable().optional(),
  properties: z.object({
    title: z.string().min(1),
    type: z.string().optional(),
    owner: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    licenseInfo: z.string().optional(),
    tags: z.array(z.string()).optional(),
    created: z.number().optional(),
    modified: z.number().optional(),
  }),
});

const ONS_PAGE_SCHEMA = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(ONS_FEATURE_SCHEMA),
  numberMatched: z.number().int().nonnegative(),
  numberReturned: z.number().int().nonnegative(),
  links: z
    .array(
      z.object({
        rel: z.string(),
        href: z.string(),
      })
    )
    .optional(),
});

/** Turns optional portal text into a trimmed value or null. */
function readOptionalText(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}

/** Turns an epoch millisecond stamp into an ISO timestamp. */
function readIsoTimestamp(value: number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

/** Reads the next page start index from the GeoJSON links. */
function readNextStartIndex(links: { rel: string; href: string }[] | undefined): number | null {
  const next = links?.find((link) => link.rel === 'next');
  if (next === undefined) {
    return null;
  }
  const startIndex = Number.parseInt(new URL(next.href).searchParams.get('startindex') ?? '', 10);
  return Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : null;
}

/**
 * Builds an ONS geography search URL.
 *
 * @param options - page size, free-text query, and start index
 * @param options.limit - how many datasets to ask for
 * @param options.query - free-text search
 * @param options.startIndex - number of matches to skip
 * @returns the absolute GeoJSON search URL
 */
export function buildOnsGeographySearchUrl(
  options: { limit?: number; query?: string; startIndex?: number } = {}
): string {
  const limit = options.limit ?? DEFAULT_ONS_GEOGRAPHY_LIMIT;
  const startIndex = options.startIndex ?? 0;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive whole number, got ${String(limit)}`);
  }
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    throw new RangeError(
      `startIndex must be a whole number of zero or more, got ${String(startIndex)}`
    );
  }
  const url = new URL(ONS_GEOGRAPHY_SEARCH_URL);
  url.searchParams.set('limit', String(limit));
  const query = options.query?.trim() ?? '';
  if (query !== '') {
    url.searchParams.set('q', query);
  }
  if (startIndex > 0) {
    url.searchParams.set('startindex', String(startIndex));
  }
  return url.href;
}

/**
 * Parses a page of ONS geography search results.
 *
 * @param payload - the GeoJSON response, or the committed fixture of one
 * @returns the datasets on the page and the portal's total match count
 */
export function parseOnsGeographyDatasets(payload: unknown): OnsGeographyPage {
  const parsed = ONS_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(ONS_GEOGRAPHY_SOURCE_ID, parsed.error.message);
  }
  return {
    totalCount: parsed.data.numberMatched,
    returnedCount: parsed.data.numberReturned,
    nextStartIndex: readNextStartIndex(parsed.data.links),
    datasets: parsed.data.features.map((feature) => ({
      id: feature.id,
      title: feature.properties.title,
      type: readOptionalText(feature.properties.type),
      owner: readOptionalText(feature.properties.owner),
      url: readOptionalText(feature.properties.url),
      description: readOptionalText(stripMarkup(feature.properties.description ?? '')),
      licence: readOptionalText(feature.properties.license),
      licenceInfo: readOptionalText(stripMarkup(feature.properties.licenseInfo ?? '')),
      tags: feature.properties.tags?.filter((tag) => tag !== '') ?? [],
      createdAt: readIsoTimestamp(feature.properties.created),
      modifiedAt: readIsoTimestamp(feature.properties.modified),
      geometryType: feature.geometry?.type ?? null,
    })),
  };
}

/**
 * Reads one page of ONS geography datasets.
 *
 * @param options - page size, search query, start index, and fetch override
 * @returns the datasets on the requested page
 */
export async function fetchOnsGeographyDatasets(
  options: {
    limit?: number;
    query?: string;
    startIndex?: number;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<OnsGeographyPage> {
  const response = await httpGet(
    ONS_GEOGRAPHY_SOURCE_ID,
    buildOnsGeographySearchUrl({
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.startIndex === undefined ? {} : { startIndex: options.startIndex }),
    }),
    {
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      headers: { accept: 'application/geo+json' },
    }
  );
  return parseOnsGeographyDatasets(await response.json());
}

/** ONS Open Geography Portal datasets, keyless and under the Open Government Licence. */
export const onsGeographyAdapter: UkDataAdapter<OnsGeographyPage> = {
  id: ONS_GEOGRAPHY_SOURCE_ID,
  name: 'ONS Open Geography Portal',
  auth: 'none',
  description: 'Boundary and geography datasets for UK statistics, with tags and download links.',
  fetchLive: (options) =>
    fetchOnsGeographyDatasets(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseOnsGeographyDatasets,
  loadFixture: () => parseOnsGeographyDatasets(readFixtureJson('ons-geography-2026-11-08.json')),
};
