import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The NHS Business Services Authority open data portal, served by CKAN.
 * Keyless, published under the Open Government Licence v3.
 */
export const NHSBSA_CKAN_SOURCE_ID = 'nhsbsa-ckan';

/** The CKAN package_list call on the NHSBSA portal. */
export const NHSBSA_CKAN_PACKAGE_LIST_URL = 'https://opendata.nhsbsa.net/api/3/action/package_list';

/** One dataset in the NHSBSA catalogue. */
export interface NhsbsaDataset {
  /** CKAN package name, the identifier used in every other CKAN call. */
  name: string;
}

/** Rolled-up view of the NHSBSA catalogue. */
export interface NhsbsaCkanSummary {
  packageCount: number;
}

const NHSBSA_CKAN_PACKAGE_LIST_SCHEMA = z.object({
  success: z.boolean(),
  result: z.array(z.string()),
});

/**
 * Parses an NHSBSA package_list payload.
 *
 * @param payload - the raw JSON body from the CKAN package_list call
 * @returns one entry per dataset in the catalogue
 */
export function parseNhsbsaCkanPackages(payload: unknown): NhsbsaDataset[] {
  const parsed = NHSBSA_CKAN_PACKAGE_LIST_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('nhsbsa-ckan', parsed.error.message);
  }
  return parsed.data.result.map((name) => ({ name }));
}

/**
 * Counts the NHSBSA catalogue.
 *
 * @param datasets - dataset names from {@link parseNhsbsaCkanPackages}
 * @returns the number of datasets listed
 */
export function summarizeNhsbsaCkanPackages(datasets: NhsbsaDataset[]): NhsbsaCkanSummary {
  return { packageCount: datasets.length };
}

/**
 * Lists every dataset in the NHSBSA catalogue.
 *
 * @param options - an optional fetch implementation
 * @returns the package names the catalogue returns
 */
export async function fetchNhsbsaCkanPackages(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<NhsbsaDataset[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(NHSBSA_CKAN_PACKAGE_LIST_URL);
  if (!response.ok) {
    throw new UkSourceApiError('nhsbsa-ckan', `HTTP ${response.status} listing packages`);
  }
  return parseNhsbsaCkanPackages(await response.json());
}

/** NHS Business Services Authority open data catalogue, keyless. */
export const nhsbsaCkanAdapter: UkDataAdapter<NhsbsaDataset[]> = {
  id: NHSBSA_CKAN_SOURCE_ID,
  name: 'NHS Business Services Authority open data catalogue',
  auth: 'none',
  description: 'Every dataset the NHS Business Services Authority publishes on its CKAN portal.',
  fetchLive: (options) =>
    fetchNhsbsaCkanPackages(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseNhsbsaCkanPackages,
  loadFixture: () => parseNhsbsaCkanPackages(readFixtureJson('nhsbsa-ckan-2026-10-05.json')),
};
