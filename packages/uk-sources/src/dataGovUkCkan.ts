import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Data.gov.uk CKAN catalogue, the UK government's public open data
 * index. Keyless, and licences vary by dataset.
 */
export const DATA_GOV_UK_CKAN_SOURCE_ID = 'data-gov-uk-ckan';

/**
 * The CKAN package_search call. The data.gov.uk host answers with a redirect
 * to the CKAN service, which fetch follows on its own.
 */
export const DATA_GOV_UK_PACKAGE_SEARCH_URL = 'https://www.data.gov.uk/api/3/action/package_search';

/** How many datasets the adapter asks for by default. */
export const DATA_GOV_UK_PACKAGE_SEARCH_LIMIT = 10;

/** One dataset from a Data.gov.uk package search page. */
export interface DataGovUkDataset {
  /** CKAN package name, the identifier used in every other CKAN call. */
  name: string;
  title: string;
  /** Publishing organisation, or null when CKAN has none. */
  publisher: string | null;
  /** Licence identifier from the package metadata, or null when unset. */
  licenceId: string | null;
  /** Human-readable licence title from the package metadata, or null when unset. */
  licenceTitle: string | null;
  /** Licence URL from the package metadata, or null when unset. */
  licenceUrl: string | null;
  resourceCount: number;
  /** When CKAN last changed the package metadata. */
  modifiedAt: string | null;
  tags: string[];
}

/** One page of datasets plus the total number matching the search. */
export interface DataGovUkPackagePage {
  /** Every dataset matching the search, not just this page. */
  totalCount: number;
  datasets: DataGovUkDataset[];
}

/** Count of datasets carrying one licence identifier. */
export interface DataGovUkLicenceCount {
  licenceId: string | null;
  datasetCount: number;
}

/** Rolled-up view of one page of Data.gov.uk datasets. */
export interface DataGovUkPackageSummary {
  datasetCount: number;
  publisherCount: number;
  licenceCounts: DataGovUkLicenceCount[];
}

const DATA_GOV_UK_DATASET_SCHEMA = z.object({
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

const DATA_GOV_UK_PACKAGE_SEARCH_SCHEMA = z.object({
  success: z.literal(true),
  result: z.object({
    count: z.number().int().nonnegative(),
    results: z.array(DATA_GOV_UK_DATASET_SCHEMA),
  }),
});

/**
 * Turns optional CKAN text into a trimmed value or null.
 *
 * @param value - the optional text from the payload
 * @returns the text, or null when CKAN left it blank
 */
function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

/**
 * Builds a Data.gov.uk package search URL.
 *
 * @param options - optional free-text query and page size
 * @param options.limit - how many datasets to ask for
 * @param options.query - free-text catalogue search
 * @returns the absolute package search URL
 */
export function buildDataGovUkPackageSearchUrl(
  options: { limit?: number; query?: string } = {}
): string {
  const { limit = DATA_GOV_UK_PACKAGE_SEARCH_LIMIT, query } = options;
  const url = new URL(DATA_GOV_UK_PACKAGE_SEARCH_URL);
  url.searchParams.set('rows', String(limit));
  const trimmedQuery = query?.trim() ?? '';
  if (trimmedQuery !== '') {
    url.searchParams.set('q', trimmedQuery);
  }
  return url.href;
}

/**
 * Parses a Data.gov.uk package search payload.
 *
 * @param payload - the raw JSON body from the CKAN package_search call
 * @returns one page of datasets and the total match count
 */
export function parseDataGovUkPackages(payload: unknown): DataGovUkPackagePage {
  const parsed = DATA_GOV_UK_PACKAGE_SEARCH_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(DATA_GOV_UK_CKAN_SOURCE_ID, parsed.error.message);
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
 * Counts publishers and licences on one page of datasets.
 *
 * @param page - a page from {@link parseDataGovUkPackages}
 * @returns page counts with the most common licence first
 */
export function summarizeDataGovUkPackages(page: DataGovUkPackagePage): DataGovUkPackageSummary {
  const publishers = new Set<string>();
  const countByLicence = new Map<string | null, number>();
  for (const dataset of page.datasets) {
    if (dataset.publisher !== null) {
      publishers.add(dataset.publisher);
    }
    countByLicence.set(dataset.licenceId, (countByLicence.get(dataset.licenceId) ?? 0) + 1);
  }
  const licenceCounts: DataGovUkLicenceCount[] = [...countByLicence.entries()]
    .map(([licenceId, datasetCount]) => ({ licenceId, datasetCount }))
    .sort((left, right) => {
      if (left.datasetCount !== right.datasetCount) {
        return right.datasetCount - left.datasetCount;
      }
      if (left.licenceId === null) {
        return 1;
      }
      if (right.licenceId === null) {
        return -1;
      }
      return left.licenceId.localeCompare(right.licenceId);
    });
  return { datasetCount: page.datasets.length, publisherCount: publishers.size, licenceCounts };
}

/**
 * Searches the Data.gov.uk catalogue for one page of datasets.
 *
 * @param options - optional query, page size, and fetch implementation
 * @param options.limit - how many datasets to ask for
 * @param options.query - free-text catalogue search
 * @param options.fetchImpl - fetch override, used by tests
 * @returns the datasets on the requested page
 */
export async function fetchDataGovUkPackages(
  options: { limit?: number; query?: string; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<DataGovUkPackagePage> {
  const { limit = DATA_GOV_UK_PACKAGE_SEARCH_LIMIT, query, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(
    DATA_GOV_UK_CKAN_SOURCE_ID,
    buildDataGovUkPackageSearchUrl({ limit, ...(query === undefined ? {} : { query }) }),
    { fetchImpl }
  );
  return parseDataGovUkPackages(await response.json());
}

/** Data.gov.uk CKAN catalogue, keyless. */
export const dataGovUkCkanAdapter: UkDataAdapter<DataGovUkPackagePage> = {
  id: DATA_GOV_UK_CKAN_SOURCE_ID,
  name: 'Data.gov.uk CKAN catalogue',
  auth: 'none',
  description: 'Search the UK government open data catalogue hosted on Data.gov.uk.',
  fetchLive: (options) =>
    fetchDataGovUkPackages(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseDataGovUkPackages,
  loadFixture: () => parseDataGovUkPackages(readFixtureJson('data-gov-uk-ckan-2026-11-05.json')),
};
