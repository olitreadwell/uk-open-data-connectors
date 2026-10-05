import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The London Datastore, the Greater London Authority's open data catalogue,
 * served by CKAN. Keyless, published under the Open Government Licence v3.
 */
export const LONDON_DATASTORE_SOURCE_ID = 'london-datastore';

/**
 * The CKAN package_list call. The service answers a 307 redirect from this
 * path to /api/action/package_list, which fetch follows on its own.
 */
export const LONDON_DATASTORE_PACKAGE_LIST_URL =
  'https://data.london.gov.uk/api/3/action/package_list';

/** One dataset in the London Datastore catalogue. */
export interface LondonDatastorePackage {
  /** CKAN package name, the identifier used in every other CKAN call. */
  name: string;
}

/** Rolled-up view of the London Datastore catalogue. */
export interface LondonDatastoreSummary {
  packageCount: number;
}

const LONDON_DATASTORE_PACKAGE_LIST_SCHEMA = z.object({
  success: z.boolean(),
  result: z.array(z.string()),
});

/**
 * Parses a London Datastore package_list payload.
 *
 * @param payload - the raw JSON body from the CKAN package_list call
 * @returns one entry per dataset in the catalogue
 */
export function parseLondonDatastorePackages(payload: unknown): LondonDatastorePackage[] {
  const parsed = LONDON_DATASTORE_PACKAGE_LIST_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('london-datastore', parsed.error.message);
  }
  return parsed.data.result.map((name) => ({ name }));
}

/**
 * Counts the London Datastore catalogue.
 *
 * @param packages - package names from {@link parseLondonDatastorePackages}
 * @returns the number of datasets listed
 */
export function summarizeLondonDatastorePackages(
  packages: LondonDatastorePackage[]
): LondonDatastoreSummary {
  return { packageCount: packages.length };
}

/**
 * Lists every dataset in the London Datastore catalogue.
 *
 * @param options - an optional fetch implementation
 * @returns the package names the catalogue returns
 */
export async function fetchLondonDatastorePackages(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<LondonDatastorePackage[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(LONDON_DATASTORE_PACKAGE_LIST_URL);
  if (!response.ok) {
    throw new UkSourceApiError('london-datastore', `HTTP ${response.status} listing packages`);
  }
  return parseLondonDatastorePackages(await response.json());
}

/** London Datastore catalogue, keyless. */
export const londonDatastoreAdapter: UkDataAdapter<LondonDatastorePackage[]> = {
  id: LONDON_DATASTORE_SOURCE_ID,
  name: 'London Datastore dataset catalogue',
  auth: 'none',
  description: 'Every dataset the Greater London Authority lists on the London Datastore.',
  fetchLive: (options) =>
    fetchLondonDatastorePackages(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseLondonDatastorePackages,
  loadFixture: () =>
    parseLondonDatastorePackages(readFixtureJson('london-datastore-2026-10-05.json')),
};
