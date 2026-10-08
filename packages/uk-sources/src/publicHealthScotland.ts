import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Public Health Scotland's open data portal, served by CKAN. Keyless, and the
 * datasets are published under the Open Government Licence v3.
 */
export const PUBLIC_HEALTH_SCOTLAND_SOURCE_ID = 'public-health-scotland';

/** The CKAN package_list call on the Public Health Scotland portal. */
export const PUBLIC_HEALTH_SCOTLAND_PACKAGE_LIST_URL =
  'https://www.opendata.nhs.scot/api/3/action/package_list';

/** One dataset in the Public Health Scotland catalogue. */
export interface PublicHealthScotlandDataset {
  /** CKAN package name, the identifier used in every other CKAN call. */
  name: string;
}

/** Rolled-up view of the Public Health Scotland catalogue. */
export interface PublicHealthScotlandSummary {
  packageCount: number;
}

const PUBLIC_HEALTH_SCOTLAND_PACKAGE_LIST_SCHEMA = z.object({
  success: z.boolean(),
  result: z.array(z.string()),
});

/**
 * Parses a Public Health Scotland package_list payload.
 *
 * @param payload - the raw JSON body from the CKAN package_list call
 * @returns one entry per dataset in the catalogue
 */
export function parsePublicHealthScotlandDatasets(payload: unknown): PublicHealthScotlandDataset[] {
  const parsed = PUBLIC_HEALTH_SCOTLAND_PACKAGE_LIST_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('public-health-scotland', parsed.error.message);
  }
  return parsed.data.result.map((name) => ({ name }));
}

/**
 * Counts the Public Health Scotland catalogue.
 *
 * @param datasets - dataset names from {@link parsePublicHealthScotlandDatasets}
 * @returns the number of datasets listed
 */
export function summarizePublicHealthScotlandDatasets(
  datasets: PublicHealthScotlandDataset[]
): PublicHealthScotlandSummary {
  return { packageCount: datasets.length };
}

/**
 * Lists every dataset in the Public Health Scotland catalogue.
 *
 * @param options - an optional fetch implementation
 * @returns the package names the catalogue returns
 */
export async function fetchPublicHealthScotlandDatasets(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<PublicHealthScotlandDataset[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(
    'public-health-scotland',
    PUBLIC_HEALTH_SCOTLAND_PACKAGE_LIST_URL,
    { fetchImpl }
  );
  return parsePublicHealthScotlandDatasets(await response.json());
}

/** Public Health Scotland open data catalogue, keyless. */
export const publicHealthScotlandAdapter: UkDataAdapter<PublicHealthScotlandDataset[]> = {
  id: PUBLIC_HEALTH_SCOTLAND_SOURCE_ID,
  name: 'Public Health Scotland open data catalogue',
  auth: 'none',
  description: 'Every dataset Public Health Scotland publishes on its open data portal.',
  fetchLive: (options) =>
    fetchPublicHealthScotlandDatasets(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parsePublicHealthScotlandDatasets,
  loadFixture: () =>
    parsePublicHealthScotlandDatasets(readFixtureJson('public-health-scotland-2026-10-05.json')),
};
