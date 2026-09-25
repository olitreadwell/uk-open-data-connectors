import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Planning Data platform's dataset catalogue, published by the Ministry of
 * Housing, Communities and Local Government. Keyless, and the same feed the
 * platform's own datasets page reads:
 * <https://www.planning.data.gov.uk/dataset>
 */
export const PLANNING_DATASETS_URL = 'https://www.planning.data.gov.uk/dataset.json';

/** How many of the largest datasets the summary keeps by default. */
export const DEFAULT_LARGEST_DATASET_LIMIT = 10;

/**
 * The realm value that marks a dataset entry. The same file also carries the
 * platform's pipeline configuration, data specifications, and provenance
 * tables, which are not datasets and hold no records.
 */
export const PLANNING_DATASET_REALM = 'dataset';

/** One dataset the platform lists, with the records published behind it. */
export interface PlanningDataset {
  /** Dataset identifier, the value the API takes in its `dataset=` parameter. */
  dataset: string;
  name: string;
  /** Records published for this dataset; 0 while it is still being built. */
  entityCount: number;
  themes: string[];
  typology: string;
  phase: string;
  licence: string;
}

/** Rolled-up shape of the platform's dataset list. */
export interface PlanningDatasetSummary {
  datasetCount: number;
  /** Records summed across every dataset. */
  entityCount: number;
  /** Datasets listed with no records published yet. */
  emptyDatasetCount: number;
  /** The datasets holding the most records, largest first. */
  largestDatasets: PlanningDataset[];
}

// Only the fields the summary reads are required. The catalogue grows fields
// as the platform does, and a new or missing optional field on one entry
// should not take the whole list down with it.
const PLANNING_DATASET_SCHEMA = z.object({
  dataset: z.string(),
  name: z.string(),
  'entity-count': z.number(),
  realm: z.string(),
  themes: z.array(z.string()).optional(),
  typology: z.string().optional(),
  phase: z.string().optional(),
  licence: z.string().optional(),
});

const PLANNING_DATASETS_RESPONSE_SCHEMA = z.object({
  datasets: z.array(PLANNING_DATASET_SCHEMA),
});

/**
 * Parses a Planning Data /dataset.json payload into datasets.
 *
 * @param payload - the raw JSON body from the dataset catalogue
 * @returns one entry per dataset, in the order the platform lists them
 */
export function parsePlanningDatasets(payload: unknown): PlanningDataset[] {
  const parsed = PLANNING_DATASETS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('planning-datasets', parsed.error.message);
  }
  return parsed.data.datasets
    .filter((entry) => entry.realm === PLANNING_DATASET_REALM)
    .map((entry) => ({
      dataset: entry.dataset,
      name: entry.name,
      entityCount: entry['entity-count'],
      themes: entry.themes ?? [],
      typology: entry.typology ?? '',
      phase: entry.phase ?? '',
      licence: entry.licence ?? '',
    }));
}

/**
 * Totals the catalogue and keeps the datasets holding the most records.
 *
 * @param datasets - datasets from {@link parsePlanningDatasets}
 * @param largestDatasetLimit - how many to keep in `largestDatasets`
 * @returns dataset, record, and empty-dataset counts plus the largest datasets
 */
export function summarizePlanningDatasets(
  datasets: PlanningDataset[],
  largestDatasetLimit: number = DEFAULT_LARGEST_DATASET_LIMIT
): PlanningDatasetSummary {
  const largestDatasets = [...datasets]
    .sort(
      (left, right) => right.entityCount - left.entityCount || left.name.localeCompare(right.name)
    )
    .slice(0, largestDatasetLimit);

  return {
    datasetCount: datasets.length,
    entityCount: datasets.reduce((total, dataset) => total + dataset.entityCount, 0),
    emptyDatasetCount: datasets.filter((dataset) => dataset.entityCount === 0).length,
    largestDatasets,
  };
}

/**
 * Lists every dataset on the Planning Data platform.
 *
 * @param options - an optional fetch implementation
 * @returns the datasets the catalogue returns
 */
export async function fetchPlanningDatasets(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<PlanningDataset[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(PLANNING_DATASETS_URL);
  if (!response.ok) {
    throw new UkSourceApiError('planning-datasets', `HTTP ${response.status} listing datasets`);
  }
  return parsePlanningDatasets(await response.json());
}

/** Planning Data platform datasets, published by MHCLG and keyless. */
export const planningDatasetsAdapter: UkDataAdapter<PlanningDataset[]> = {
  id: 'planning-datasets',
  name: 'Ministry of Housing, Communities and Local Government planning datasets',
  auth: 'none',
  description: 'Every dataset the Planning Data platform lists, with the records behind it.',
  fetchLive: (options) =>
    fetchPlanningDatasets(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parsePlanningDatasets,
  loadFixture: () => parsePlanningDatasets(readFixtureJson('planning-datasets.json')),
};
