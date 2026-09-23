import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The ONS beta API dataset catalogue. Keyless, published by the Office for
 * National Statistics under the Open Government Licence v3.
 */
export const ONS_DATASETS_URL = 'https://api.beta.ons.gov.uk/v1/datasets?limit=1000';

/**
 * How many records the catalogue call asks for. The endpoint answers with its
 * whole catalogue well below this, so the limit is a ceiling, not a page size.
 */
export const ONS_DATASETS_LIMIT = 1000;

/** One dataset record as the ONS beta API lists it in the catalogue. */
export interface OnsDatasetRecord {
  id: string;
  title: string;
  /** Publication state the API reports, such as "published". */
  state: string;
  /** The API's own last-updated stamp for this record, ISO 8601. */
  lastUpdatedIso: string;
  /** The national-statistic flag, or null when the record leaves it out. */
  isNationalStatistic: boolean | null;
  keywords: string[];
  /** Topic path from the record's taxonomy link, or "" when it has none. */
  topicPath: string;
}

/** Catalogue records counted by the year in their last-updated stamp. */
export interface OnsDatasetYearCount {
  /** Calendar year taken from the stamp, as a four digit string. */
  year: string;
  datasetCount: number;
}

/** Rolled-up counts across the ONS dataset catalogue. */
export interface OnsDatasetSummary {
  datasetCount: number;
  nationalStatisticCount: number;
  /** Records that carry no national-statistic flag at all. */
  unflaggedCount: number;
  /** Records per last-updated year, oldest year first. */
  yearCounts: OnsDatasetYearCount[];
}

const ONS_DATASET_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  state: z.string(),
  last_updated: z.string(),
  national_statistic: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
  links: z.object({ taxonomy: z.object({ href: z.string() }).optional() }).optional(),
});

const ONS_DATASETS_RESPONSE_SCHEMA = z.object({
  items: z.array(ONS_DATASET_SCHEMA),
});

const ONS_TAXONOMY_PREFIX = 'https://api.beta.ons.gov.uk/v1/';

/** Strips the API prefix from a taxonomy link so the topic path is readable. */
function readTopicPath(href: string | undefined): string {
  if (href === undefined) {
    return '';
  }
  return href.startsWith(ONS_TAXONOMY_PREFIX) ? href.slice(ONS_TAXONOMY_PREFIX.length) : href;
}

/**
 * Parses an ONS beta API /datasets payload into catalogue records.
 *
 * @param payload - the raw JSON body from the catalogue endpoint
 * @returns one flattened record per dataset
 */
export function parseOnsDatasets(payload: unknown): OnsDatasetRecord[] {
  const parsed = ONS_DATASETS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('ons-datasets', parsed.error.message);
  }
  return parsed.data.items.map((item) => ({
    id: item.id,
    title: item.title,
    state: item.state,
    lastUpdatedIso: item.last_updated,
    isNationalStatistic: item.national_statistic ?? null,
    keywords: item.keywords ?? [],
    topicPath: readTopicPath(item.links?.taxonomy?.href),
  }));
}

/**
 * Counts the catalogue by national-statistic flag and by last-updated year.
 *
 * @param records - dataset records from {@link parseOnsDatasets}
 * @returns dataset, flag, and per-year counts
 */
export function summarizeOnsDatasets(records: OnsDatasetRecord[]): OnsDatasetSummary {
  const countByYear = new Map<string, number>();
  let nationalStatisticCount = 0;
  let unflaggedCount = 0;
  for (const record of records) {
    if (record.isNationalStatistic === true) {
      nationalStatisticCount += 1;
    } else if (record.isNationalStatistic === null) {
      unflaggedCount += 1;
    }
    const year = record.lastUpdatedIso.slice(0, 4);
    if (year !== '') {
      countByYear.set(year, (countByYear.get(year) ?? 0) + 1);
    }
  }

  const yearCounts: OnsDatasetYearCount[] = [...countByYear.entries()]
    .map(([year, datasetCount]) => ({ year, datasetCount }))
    .sort((left, right) => left.year.localeCompare(right.year));

  return {
    datasetCount: records.length,
    nationalStatisticCount,
    unflaggedCount,
    yearCounts,
  };
}

/**
 * Lists datasets from the ONS beta API catalogue.
 *
 * @param options - record limit and an optional fetch implementation
 * @returns the catalogue records the endpoint returns
 */
export async function fetchOnsDatasets(
  options: { limit?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<OnsDatasetRecord[]> {
  const { limit = ONS_DATASETS_LIMIT, fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(`https://api.beta.ons.gov.uk/v1/datasets?limit=${limit}`);
  if (!response.ok) {
    throw new UkSourceApiError('ons-datasets', `HTTP ${response.status} listing datasets`);
  }
  return parseOnsDatasets(await response.json());
}

/** ONS beta API dataset catalogue adapter, keyless. */
export const onsDatasetsAdapter: UkDataAdapter<OnsDatasetRecord[]> = {
  id: 'ons-datasets',
  name: 'Office for National Statistics dataset catalogue',
  auth: 'none',
  description: 'Every dataset the ONS beta API lists, with its state and last-updated stamp.',
  fetchLive: (options) =>
    fetchOnsDatasets(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseOnsDatasets,
  loadFixture: () => parseOnsDatasets(readFixtureJson('ons-datasets.json')),
};
