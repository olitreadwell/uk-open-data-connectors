import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The NESO Data Portal catalogue. Keyless, and the portal reports the NESO
 * Open Data Licence as `ESO` on its packages.
 */
export const NESO_CATALOGUE_SOURCE_ID = 'neso-catalogue';

/** The CKAN package search behind the NESO Data Portal. */
export const NESO_CATALOGUE_SEARCH_URL = 'https://api.neso.energy/api/3/action/package_search';

/** How many datasets the adapter asks for by default. */
export const DEFAULT_NESO_CATALOGUE_LIMIT = 20;

/** One dataset in the NESO Data Portal catalogue. */
export interface NesoCatalogueDataset {
  /** CKAN package name, the identifier used in the portal's other calls. */
  name: string;
  title: string;
  /** Publishing team on the portal, or null when the package has none. */
  publisher: string | null;
  licenceId: string | null;
  licenceTitle: string | null;
  licenceUrl: string | null;
  resourceCount: number;
  modifiedAt: string | null;
  tags: string[];
}

/** One page of NESO catalogue datasets. */
export interface NesoCataloguePage {
  totalCount: number;
  datasets: NesoCatalogueDataset[];
}

const NESO_DATASET_SCHEMA = z.object({
  name: z.string().min(1),
  title: z.string(),
  license_id: z.string().nullable().optional(),
  license_title: z.string().nullable().optional(),
  license_url: z.string().nullable().optional(),
  metadata_modified: z.string().nullable().optional(),
  num_resources: z.number().int().nonnegative(),
  organization: z
    .object({
      title: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  tags: z
    .array(z.object({ name: z.string() }))
    .nullable()
    .optional(),
});

const NESO_CATALOGUE_SCHEMA = z.object({
  success: z.literal(true),
  result: z.object({
    count: z.number().int().nonnegative(),
    results: z.array(NESO_DATASET_SCHEMA),
  }),
});

/** Turns optional CKAN text into a trimmed value or null. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

/**
 * Builds a NESO catalogue search URL.
 *
 * @param options - free-text query, page size, and start offset
 * @param options.query - free-text catalogue search
 * @param options.limit - how many datasets to ask for
 * @param options.start - how many matches to skip
 * @returns the absolute CKAN package search URL
 */
export function buildNesoCatalogueUrl(
  options: { limit?: number; query?: string; start?: number } = {}
): string {
  const limit = options.limit ?? DEFAULT_NESO_CATALOGUE_LIMIT;
  const start = options.start ?? 0;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive whole number, got ${String(limit)}`);
  }
  if (!Number.isInteger(start) || start < 0) {
    throw new RangeError(`start must be a whole number of zero or more, got ${String(start)}`);
  }
  const url = new URL(NESO_CATALOGUE_SEARCH_URL);
  url.searchParams.set('rows', String(limit));
  const query = options.query?.trim() ?? '';
  if (query !== '') {
    url.searchParams.set('q', query);
  }
  if (start > 0) {
    url.searchParams.set('start', String(start));
  }
  return url.href;
}

/**
 * Parses one page of NESO catalogue datasets.
 *
 * @param payload - the raw JSON body from the CKAN package search
 * @returns the datasets on the page and the total match count
 */
export function parseNesoCatalogue(payload: unknown): NesoCataloguePage {
  const parsed = NESO_CATALOGUE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(NESO_CATALOGUE_SOURCE_ID, parsed.error.message);
  }
  return {
    totalCount: parsed.data.result.count,
    datasets: parsed.data.result.results.map((dataset) => ({
      name: dataset.name,
      title: dataset.title,
      publisher: normalizeOptionalText(dataset.organization?.title),
      licenceId: normalizeOptionalText(dataset.license_id),
      licenceTitle: normalizeOptionalText(dataset.license_title),
      licenceUrl: normalizeOptionalText(dataset.license_url),
      resourceCount: dataset.num_resources,
      modifiedAt: dataset.metadata_modified ?? null,
      tags: dataset.tags?.map((tag) => tag.name) ?? [],
    })),
  };
}

/**
 * Searches the NESO Data Portal catalogue.
 *
 * @param options - free-text query, page size, start offset, and fetch override
 * @returns the datasets on the requested page
 */
export async function fetchNesoCatalogue(
  options: {
    limit?: number;
    query?: string;
    start?: number;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<NesoCataloguePage> {
  const response = await httpGet(
    NESO_CATALOGUE_SOURCE_ID,
    buildNesoCatalogueUrl({
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.start === undefined ? {} : { start: options.start }),
    }),
    {
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      headers: { accept: 'application/json' },
    }
  );
  return parseNesoCatalogue(await response.json());
}

/** NESO Data Portal catalogue, keyless and under the NESO Open Data Licence. */
export const nesoCatalogueAdapter: UkDataAdapter<NesoCataloguePage> = {
  id: NESO_CATALOGUE_SOURCE_ID,
  name: 'NESO Data Portal catalogue',
  auth: 'none',
  description:
    'The National Energy System Operator open data catalogue, with licence and resource counts.',
  fetchLive: (options) =>
    fetchNesoCatalogue(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseNesoCatalogue,
  loadFixture: () => parseNesoCatalogue(readFixtureJson('neso-catalogue-2026-11-08.json')),
};
