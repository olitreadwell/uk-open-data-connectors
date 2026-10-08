import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * postcodes.io, a free keyless lookup over ONS and Ordnance Survey postcode
 * data published under the Open Government Licence v3. The service itself is
 * a third party, not a government API: the postcode data is OGL, the lookup
 * and the geocoding around it are postcodes.io's own.
 */
export const POSTCODE_LOOKUP_SOURCE_ID = 'postcode-lookup';

/** Base URL for the postcodes.io single postcode lookup. */
export const POSTCODES_IO_BASE_URL = 'https://api.postcodes.io/postcodes/';

/** The postcode the adapter looks up when the caller does not name one. */
export const DEFAULT_POSTCODE_QUERY = 'SW1A1AA';

/** One postcode and the administrative areas it falls inside. */
export interface PostcodeLookupRecord {
  /** The postcode as the service formats it, letters and digits spaced. */
  postcode: string;
  country: string;
  /** English region or devolved nation region, or null when unset. */
  region: string | null;
  adminDistrict: string | null;
  adminWard: string | null;
  parliamentaryConstituency: string | null;
  latitude: number;
  longitude: number;
  /** The NHS area the postcode sits in, or null when unset. */
  nhsHa: string | null;
}

const POSTCODE_RESULT_SCHEMA = z.object({
  postcode: z.string(),
  country: z.string(),
  region: z.string().nullable().optional(),
  admin_district: z.string().nullable().optional(),
  admin_ward: z.string().nullable().optional(),
  parliamentary_constituency: z.string().nullable().optional(),
  latitude: z.number(),
  longitude: z.number(),
  nhs_ha: z.string().nullable().optional(),
});

const POSTCODE_LOOKUP_SCHEMA = z.object({
  status: z.number(),
  result: POSTCODE_RESULT_SCHEMA,
});

/**
 * Builds the postcodes.io lookup URL for one postcode.
 *
 * @param postcode - the postcode to look up, spaced or unspaced
 * @returns the single postcode lookup URL
 */
export function buildPostcodeLookupUrl(postcode: string): string {
  return `${POSTCODES_IO_BASE_URL}${encodeURIComponent(postcode)}`;
}

/**
 * Parses a postcodes.io single postcode payload.
 *
 * @param payload - the raw JSON body from the lookup endpoint
 * @returns the postcode record the service returns
 */
export function parsePostcodeLookup(payload: unknown): PostcodeLookupRecord {
  const parsed = POSTCODE_LOOKUP_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('postcode-lookup', parsed.error.message);
  }
  const result = parsed.data.result;
  return {
    postcode: result.postcode,
    country: result.country,
    region: result.region ?? null,
    adminDistrict: result.admin_district ?? null,
    adminWard: result.admin_ward ?? null,
    parliamentaryConstituency: result.parliamentary_constituency ?? null,
    latitude: result.latitude,
    longitude: result.longitude,
    nhsHa: result.nhs_ha ?? null,
  };
}

/**
 * Looks up one postcode. The service answers 404 for an unknown postcode,
 * which becomes an API error like any other failed request.
 *
 * @param postcode - the postcode to look up, default SW1A 1AA
 * @param options - an optional fetch implementation
 * @returns the postcode record the service returns
 */
export async function fetchPostcodeLookup(
  postcode: string = DEFAULT_POSTCODE_QUERY,
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<PostcodeLookupRecord> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await httpGet('postcode-lookup', buildPostcodeLookupUrl(postcode), {
    fetchImpl,
  });
  return parsePostcodeLookup(await response.json());
}

/** postcodes.io single postcode lookup, keyless. */
export const postcodeLookupAdapter: UkDataAdapter<PostcodeLookupRecord> = {
  id: POSTCODE_LOOKUP_SOURCE_ID,
  name: 'postcodes.io postcode lookup',
  auth: 'none',
  description: `One postcode's country, region, wards, and coordinates, default ${DEFAULT_POSTCODE_QUERY}.`,
  fetchLive: (options) =>
    fetchPostcodeLookup(
      DEFAULT_POSTCODE_QUERY,
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parsePostcodeLookup,
  loadFixture: () => parsePostcodeLookup(readFixtureJson('postcode-lookup-2026-10-05.json')),
};
