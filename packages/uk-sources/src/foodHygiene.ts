import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Food Standards Agency food hygiene register list. Keyless, published by
 * the FSA under the Open Government Licence v3.
 *
 * The endpoint only answers when the FSA's version header is sent with it:
 * called bare it returns HTTP 404 with "The API 'Authorities' doesn't exist".
 */
export const FSA_AUTHORITIES_URL = 'https://api.ratings.food.gov.uk/Authorities/basic';

/** Header the FSA food hygiene API requires on every request. */
export const FSA_API_VERSION_HEADER = 'x-api-version';

/** Version of the FSA API this adapter speaks. Version 1 no longer answers. */
export const FSA_API_VERSION = '2';

/** How many of the largest registers the summary keeps by default. */
export const DEFAULT_LARGEST_AUTHORITY_LIMIT = 10;

/**
 * Which scheme a register runs. The Food Hygiene Rating Scheme (FHRS) covers
 * England, Wales, and Northern Ireland. The Food Hygiene Information Scheme
 * (FHIS) covers Scotland, where premises are rated pass or improve.
 */
export type FoodHygieneScheme = 'fhrs' | 'fhis';

/** One local authority's food hygiene register, as the FSA lists it. */
export interface FoodHygieneAuthority {
  localAuthorityId: number;
  /** The FSA's own code for the authority, which it publishes as a string. */
  localAuthorityCode: string;
  localAuthorityName: string;
  /** How many establishments the register holds. */
  establishmentCount: number;
  scheme: FoodHygieneScheme;
}

/** Rolled-up counts across every register the FSA publishes. */
export interface FoodHygieneSummary {
  authorityCount: number;
  /** Establishments summed across every register. */
  establishmentCount: number;
  fhrsAuthorityCount: number;
  fhisAuthorityCount: number;
  /** The registers holding the most establishments, largest first. */
  largestAuthorities: FoodHygieneAuthority[];
}

const FSA_AUTHORITY_SCHEMA = z.object({
  LocalAuthorityId: z.number(),
  LocalAuthorityIdCode: z.string(),
  Name: z.string(),
  EstablishmentCount: z.number(),
  SchemeType: z.number(),
});

const FSA_AUTHORITIES_RESPONSE_SCHEMA = z.object({
  authorities: z.array(FSA_AUTHORITY_SCHEMA),
});

/** Scheme codes the FSA API uses: 1 is FHRS, 2 is FHIS. */
const FSA_SCHEME_BY_TYPE: Record<number, FoodHygieneScheme> = { 1: 'fhrs', 2: 'fhis' };

/** Maps the API's scheme code, naming the register when the code is new. */
function readFoodHygieneScheme(schemeType: number, localAuthorityName: string): FoodHygieneScheme {
  const scheme = FSA_SCHEME_BY_TYPE[schemeType];
  if (scheme === undefined) {
    throw new UkSourceParseError(
      'fsa-food-hygiene',
      `unknown scheme type ${schemeType} on ${localAuthorityName}`
    );
  }
  return scheme;
}

/**
 * Parses an FSA /Authorities payload into registers.
 *
 * @param payload - the raw JSON body from the register endpoint
 * @returns one flattened register per local authority
 */
export function parseFoodHygieneAuthorities(payload: unknown): FoodHygieneAuthority[] {
  const parsed = FSA_AUTHORITIES_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('fsa-food-hygiene', parsed.error.message);
  }
  return parsed.data.authorities.map((authority) => ({
    localAuthorityId: authority.LocalAuthorityId,
    localAuthorityCode: authority.LocalAuthorityIdCode,
    localAuthorityName: authority.Name,
    establishmentCount: authority.EstablishmentCount,
    scheme: readFoodHygieneScheme(authority.SchemeType, authority.Name),
  }));
}

/**
 * Totals the registers and keeps the largest ones.
 *
 * @param authorities - registers from {@link parseFoodHygieneAuthorities}
 * @param largestAuthorityLimit - how many registers to keep in `largestAuthorities`
 * @returns register, establishment, and scheme counts plus the largest registers
 */
export function summarizeFoodHygieneAuthorities(
  authorities: FoodHygieneAuthority[],
  largestAuthorityLimit: number = DEFAULT_LARGEST_AUTHORITY_LIMIT
): FoodHygieneSummary {
  const largestAuthorities = [...authorities]
    .sort(
      (left, right) =>
        right.establishmentCount - left.establishmentCount ||
        left.localAuthorityName.localeCompare(right.localAuthorityName)
    )
    .slice(0, largestAuthorityLimit);

  return {
    authorityCount: authorities.length,
    establishmentCount: authorities.reduce(
      (total, authority) => total + authority.establishmentCount,
      0
    ),
    fhrsAuthorityCount: authorities.filter((authority) => authority.scheme === 'fhrs').length,
    fhisAuthorityCount: authorities.filter((authority) => authority.scheme === 'fhis').length,
    largestAuthorities,
  };
}

/**
 * Lists every local authority food hygiene register from the FSA.
 *
 * @param options - an optional fetch implementation
 * @returns the registers the endpoint returns
 */
export async function fetchFoodHygieneAuthorities(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<FoodHygieneAuthority[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(FSA_AUTHORITIES_URL, {
    headers: { [FSA_API_VERSION_HEADER]: FSA_API_VERSION },
  });
  if (!response.ok) {
    throw new UkSourceApiError('fsa-food-hygiene', `HTTP ${response.status} listing registers`);
  }
  return parseFoodHygieneAuthorities(await response.json());
}

/** Food Standards Agency food hygiene register adapter, keyless. */
export const foodHygieneAuthoritiesAdapter: UkDataAdapter<FoodHygieneAuthority[]> = {
  id: 'food-hygiene-authorities',
  name: 'Food Standards Agency food hygiene registers',
  auth: 'none',
  description: 'Every local authority food hygiene register, with its establishment count.',
  fetchLive: (options) =>
    fetchFoodHygieneAuthorities(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseFoodHygieneAuthorities,
  loadFixture: () => parseFoodHygieneAuthorities(readFixtureJson('food-hygiene-authorities.json')),
};
