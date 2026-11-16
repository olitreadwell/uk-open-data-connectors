import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * HM Land Registry Linked Data, the Price Paid Data transaction records.
 * Keyless, and the Price Paid Data carries the Open Government Licence v3.
 */
export const LAND_REGISTRY_PRICE_PAID_SOURCE_ID = 'hm-land-registry-price-paid';

/** The linked data API endpoint for Price Paid transaction records. */
export const LAND_REGISTRY_PRICE_PAID_URL =
  'https://landregistry.data.gov.uk/data/ppi/transaction-record.json';

/** The postcode the adapter reads when a caller does not name one. */
export const DEFAULT_LAND_REGISTRY_POSTCODE = 'M1 1AE';

/** How many transaction records the adapter asks for by default. */
export const DEFAULT_LAND_REGISTRY_PAGE_SIZE = 20;

/** The property types Price Paid Data uses. */
export type LandRegistryPropertyType =
  'detached' | 'semi-detached' | 'terraced' | 'flat-maisonette' | 'other';

/** The order to read transaction dates in. */
export type LandRegistryPricePaidOrder = 'newest' | 'oldest';

/** One property address as Price Paid Data publishes it. */
export interface LandRegistryAddress {
  /** Primary addressable object name, such as the house number. */
  paon: string | null;
  /** Secondary addressable object name, such as a flat number. */
  saon: string | null;
  street: string | null;
  locality: string | null;
  town: string | null;
  district: string | null;
  county: string | null;
  postcode: string | null;
}

/** One Price Paid transaction record. */
export interface LandRegistryPricePaidTransaction {
  /** The transaction id, the stable key HM Land Registry publishes. */
  id: string;
  /** The linked data record URL. */
  recordUrl: string | null;
  /** The sale completion date, as an ISO 8601 date. */
  transactionDate: string;
  /** The price paid in pounds sterling. */
  pricePaid: number;
  /** The property type label, such as `flat-maisonette`. */
  propertyType: string | null;
  /** The estate type label, such as `Leasehold`. */
  estateType: string | null;
  /** True for a newly built property, when the record says. */
  newBuild: boolean | null;
  /** The record status label, such as `Add`. */
  recordStatus: string | null;
  /** The transaction category label, such as `Standard price paid transaction`. */
  transactionCategory: string | null;
  address: LandRegistryAddress;
}

/** One page of Price Paid transaction records. */
export interface LandRegistryPricePaidPage {
  /** The one-based page number. */
  page: number;
  /** The page size the response reports. */
  itemsPerPage: number;
  /** True when the linked data API carries a link to another page. */
  hasNextPage: boolean;
  nextPageUrl: string | null;
  transactions: LandRegistryPricePaidTransaction[];
}

/** Options for a Price Paid transaction query. */
export interface LandRegistryPricePaidOptions {
  /** The full postcode to read. Defaults to {@link DEFAULT_LAND_REGISTRY_POSTCODE}. */
  postcode?: string;
  /** Only transactions of this property type. */
  propertyType?: LandRegistryPropertyType;
  /** Earliest completion date, as YYYY-MM-DD, inclusive. */
  fromDate?: string;
  /** Latest completion date, as YYYY-MM-DD, inclusive. */
  toDate?: string;
  /** Page size. Defaults to {@link DEFAULT_LAND_REGISTRY_PAGE_SIZE}. */
  limit?: number;
  /** One-based page number. Defaults to 1. */
  page?: number;
  /** Date order. Defaults to newest first. */
  order?: LandRegistryPricePaidOrder;
  fetchImpl?: typeof globalThis.fetch;
}

const PROPERTY_TYPE_TERMS: Record<LandRegistryPropertyType, string> = {
  detached: 'detached',
  'semi-detached': 'semi-detached',
  terraced: 'terraced',
  'flat-maisonette': 'flat-maisonette',
  other: 'otherPropertyType',
};

const PROPERTY_TYPE_NAMES: LandRegistryPropertyType[] = [
  'detached',
  'semi-detached',
  'terraced',
  'flat-maisonette',
  'other',
];

const POSTCODE_PATTERN = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TRANSACTION_DATE_PATTERN = /^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/;

const MONTH_INDEXES = new Map<string, number>([
  ['jan', 0],
  ['feb', 1],
  ['mar', 2],
  ['apr', 3],
  ['may', 4],
  ['jun', 5],
  ['jul', 6],
  ['aug', 7],
  ['sep', 8],
  ['oct', 9],
  ['nov', 10],
  ['dec', 11],
]);

const LAND_REGISTRY_TEXT_SCHEMA = z.union([z.string(), z.array(z.string())]);
const LAND_REGISTRY_LABEL_VALUE_SCHEMA = z.object({ _value: z.string().min(1) });
const LAND_REGISTRY_LABEL_SCHEMA = z.union([
  z.string(),
  LAND_REGISTRY_LABEL_VALUE_SCHEMA,
  z.array(LAND_REGISTRY_LABEL_VALUE_SCHEMA),
]);

const LAND_REGISTRY_RESOURCE_SCHEMA = z.object({
  _about: z.string().optional(),
  label: LAND_REGISTRY_LABEL_SCHEMA.optional(),
  prefLabel: LAND_REGISTRY_LABEL_SCHEMA.optional(),
});

const LAND_REGISTRY_ADDRESS_SCHEMA = z
  .object({
    _about: z.string().optional(),
    paon: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    saon: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    street: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    locality: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    town: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    district: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    county: LAND_REGISTRY_TEXT_SCHEMA.optional(),
    postcode: LAND_REGISTRY_TEXT_SCHEMA.optional(),
  })
  .optional();

const LAND_REGISTRY_TRANSACTION_SCHEMA = z.object({
  _about: z.string().optional(),
  transactionId: z.string().min(1),
  transactionDate: z.string().min(1),
  pricePaid: z.number().nonnegative(),
  newBuild: z.boolean().optional(),
  propertyType: LAND_REGISTRY_RESOURCE_SCHEMA.optional(),
  estateType: LAND_REGISTRY_RESOURCE_SCHEMA.optional(),
  recordStatus: LAND_REGISTRY_RESOURCE_SCHEMA.optional(),
  transactionCategory: LAND_REGISTRY_RESOURCE_SCHEMA.optional(),
  propertyAddress: LAND_REGISTRY_ADDRESS_SCHEMA,
});

const LAND_REGISTRY_PAGE_SCHEMA = z.object({
  result: z.object({
    items: z.array(LAND_REGISTRY_TRANSACTION_SCHEMA).optional(),
    itemsPerPage: z.number().int().nonnegative().optional(),
    page: z.number().int().nonnegative().optional(),
    next: z.string().optional(),
  }),
});

/** Reads a field the API writes as one string or a list of strings. */
function readText(value: string | string[] | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const text = (Array.isArray(value) ? value.join(' / ') : value).trim();
  return text === '' ? null : text;
}

/** Reads the first human label from a linked data resource. */
function readLabel(value: z.infer<typeof LAND_REGISTRY_LABEL_SCHEMA> | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return readText(value);
  }
  const entries = Array.isArray(value) ? value : [value];
  const labels = entries.map((entry) => entry._value.trim()).filter((label) => label !== '');
  return labels.length === 0 ? null : labels.join(' / ');
}

/** Checks a YYYY-MM-DD date that the linked data API can filter on. */
function assertIsoDate(value: string, field: string): void {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new RangeError(
      `${field} must be a date written as YYYY-MM-DD, got ${JSON.stringify(value)}`
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${field} is not a real calendar date, got ${JSON.stringify(value)}`);
  }
}

/** Turns a Price Paid date such as `Fri, 17 May 1996` into an ISO date. */
function readTransactionDate(value: string): string {
  const match = TRANSACTION_DATE_PATTERN.exec(value.trim());
  if (match === null) {
    throw new UkSourceParseError(
      LAND_REGISTRY_PRICE_PAID_SOURCE_ID,
      `the record wrote ${JSON.stringify(value)} for transactionDate`
    );
  }
  const day = Number(match[1]);
  const month = MONTH_INDEXES.get((match[2] ?? '').toLowerCase());
  const year = Number(match[3]);
  if (month === undefined) {
    throw new UkSourceParseError(
      LAND_REGISTRY_PRICE_PAID_SOURCE_ID,
      `the record wrote ${JSON.stringify(value)} for transactionDate`
    );
  }
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    throw new UkSourceParseError(
      LAND_REGISTRY_PRICE_PAID_SOURCE_ID,
      `the record wrote ${JSON.stringify(value)} for transactionDate`
    );
  }
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Puts a UK postcode into the single-space form the linked data API matches.
 *
 * The API matches the full postcode exactly, so `m11ae` and `M1  1AE` both
 * return nothing. Normalising here accepts what a person or a CSV column
 * usually holds.
 *
 * @param postcode - a full UK postcode, with or without its space
 * @returns the upper-case postcode with one space before the inward code
 * @throws {RangeError} when the value is not a full UK postcode
 */
export function normalizeLandRegistryPostcode(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase().replace(/\s+/g, '');
  if (!POSTCODE_PATTERN.test(cleaned)) {
    throw new RangeError(`postcode is not a full UK postcode, got ${JSON.stringify(postcode)}`);
  }
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
}

/**
 * Builds a Price Paid transaction query URL.
 *
 * A query always names a postcode. A sorted read of the whole dataset takes
 * longer than the API's gateway allows, so the adapter filters first and the
 * default postcode keeps the live probe fast.
 *
 * @param options - postcode, property type, date bounds, page size, and order
 * @returns the absolute linked data API URL
 * @throws {RangeError} when an option is outside what the API accepts
 */
export function buildLandRegistryPricePaidUrl(options: LandRegistryPricePaidOptions = {}): string {
  const limit = options.limit ?? DEFAULT_LAND_REGISTRY_PAGE_SIZE;
  const page = options.page ?? 1;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive whole number, got ${String(limit)}`);
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(`page must be a positive whole number, got ${String(page)}`);
  }
  const propertyType = options.propertyType;
  const propertyTerm = propertyType === undefined ? undefined : PROPERTY_TYPE_TERMS[propertyType];
  if (propertyType !== undefined && propertyTerm === undefined) {
    throw new RangeError(
      `propertyType must be one of ${PROPERTY_TYPE_NAMES.join(', ')}, got ${JSON.stringify(propertyType)}`
    );
  }
  const fromDate = options.fromDate;
  if (fromDate !== undefined) {
    assertIsoDate(fromDate, 'fromDate');
  }
  const toDate = options.toDate;
  if (toDate !== undefined) {
    assertIsoDate(toDate, 'toDate');
  }
  const url = new URL(LAND_REGISTRY_PRICE_PAID_URL);
  url.searchParams.set('_pageSize', String(limit));
  url.searchParams.set(
    '_sort',
    options.order === 'oldest' ? 'transactionDate' : '-transactionDate'
  );
  if (page > 1) {
    url.searchParams.set('_page', String(page - 1));
  }
  url.searchParams.set(
    'propertyAddress.postcode',
    normalizeLandRegistryPostcode(options.postcode ?? DEFAULT_LAND_REGISTRY_POSTCODE)
  );
  if (propertyTerm !== undefined) {
    url.searchParams.set(
      'propertyType',
      `http://landregistry.data.gov.uk/def/common/${propertyTerm}`
    );
  }
  if (fromDate !== undefined) {
    url.searchParams.set('min-transactionDate', fromDate);
  }
  if (toDate !== undefined) {
    url.searchParams.set('max-transactionDate', toDate);
  }
  return url.href;
}

/**
 * Parses a page of Price Paid transaction records.
 *
 * @param payload - the linked data API response, or the committed fixture of one
 * @returns the transactions on the page, with dates as ISO 8601 dates
 * @throws {UkSourceParseError} when the payload is not a linked data page
 */
export function parseLandRegistryPricePaid(payload: unknown): LandRegistryPricePaidPage {
  const parsed = LAND_REGISTRY_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(LAND_REGISTRY_PRICE_PAID_SOURCE_ID, parsed.error.message);
  }
  const transactions = (parsed.data.result.items ?? []).map((item) => ({
    id: item.transactionId,
    recordUrl: item._about ?? null,
    transactionDate: readTransactionDate(item.transactionDate),
    pricePaid: item.pricePaid,
    propertyType: readLabel(item.propertyType?.prefLabel ?? item.propertyType?.label),
    estateType: readLabel(item.estateType?.prefLabel ?? item.estateType?.label),
    newBuild: item.newBuild ?? null,
    recordStatus: readLabel(item.recordStatus?.prefLabel ?? item.recordStatus?.label),
    transactionCategory: readLabel(
      item.transactionCategory?.prefLabel ?? item.transactionCategory?.label
    ),
    address: {
      paon: readText(item.propertyAddress?.paon),
      saon: readText(item.propertyAddress?.saon),
      street: readText(item.propertyAddress?.street),
      locality: readText(item.propertyAddress?.locality),
      town: readText(item.propertyAddress?.town),
      district: readText(item.propertyAddress?.district),
      county: readText(item.propertyAddress?.county),
      postcode: readText(item.propertyAddress?.postcode),
    },
  }));
  const nextPageUrl = parsed.data.result.next ?? null;
  return {
    page: (parsed.data.result.page ?? 0) + 1,
    itemsPerPage: parsed.data.result.itemsPerPage ?? transactions.length,
    hasNextPage: nextPageUrl !== null,
    nextPageUrl,
    transactions,
  };
}

/**
 * Reads one page of Price Paid transaction records.
 *
 * @param options - postcode, property type, date bounds, page, and fetch override
 * @returns the transactions on the requested page
 */
export async function fetchLandRegistryPricePaidTransactions(
  options: LandRegistryPricePaidOptions = {}
): Promise<LandRegistryPricePaidPage> {
  const response = await httpGet(
    LAND_REGISTRY_PRICE_PAID_SOURCE_ID,
    buildLandRegistryPricePaidUrl({
      ...(options.postcode === undefined ? {} : { postcode: options.postcode }),
      ...(options.propertyType === undefined ? {} : { propertyType: options.propertyType }),
      ...(options.fromDate === undefined ? {} : { fromDate: options.fromDate }),
      ...(options.toDate === undefined ? {} : { toDate: options.toDate }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.page === undefined ? {} : { page: options.page }),
      ...(options.order === undefined ? {} : { order: options.order }),
    }),
    {
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      headers: { accept: 'application/json' },
    }
  );
  return parseLandRegistryPricePaid(await response.json());
}

/** HM Land Registry Price Paid Data, keyless and under the Open Government Licence. */
export const landRegistryPricePaidAdapter: UkDataAdapter<LandRegistryPricePaidPage> = {
  id: LAND_REGISTRY_PRICE_PAID_SOURCE_ID,
  name: 'HM Land Registry Price Paid Data',
  auth: 'none',
  description:
    'Sold property prices for one UK postcode, with address, property type, and completion date.',
  fetchLive: (options) =>
    fetchLandRegistryPricePaidTransactions(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseLandRegistryPricePaid,
  loadFixture: () =>
    parseLandRegistryPricePaid(readFixtureJson('hm-land-registry-price-paid-2026-11-17.json')),
};
