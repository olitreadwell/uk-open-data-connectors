import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * Elexon's Balancing Mechanism Reporting Service (BMRS) Insights Solution.
 * Keyless, under the BMRS open data licence:
 * <https://www.elexon.co.uk/bsc/operations-settlement/bsc-central-services/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/>
 */
export const ELEXON_SYSTEM_PRICES_SOURCE_ID = 'elexon-system-prices';

/** Root of the BMRS Insights Solution API. */
export const ELEXON_BMRS_API_BASE_URL = 'https://data.elexon.co.uk/bmrs/api/v1';

/** The settlement system prices path, which takes a settlement date. */
export const ELEXON_SYSTEM_PRICES_PATH = 'balancing/settlement/system-prices';

/** One settlement period's system prices and imbalance volumes. */
export interface ElexonSystemPricePeriod {
  settlementPeriod: number;
  startTime: string;
  createdDateTime: string;
  systemSellPrice: number;
  systemBuyPrice: number;
  priceDerivationCode: string;
  netImbalanceVolume: number;
  totalAcceptedOfferVolume: number;
  totalAcceptedBidVolume: number;
}

/** One settlement day of system prices. */
export interface ElexonSystemPriceDay {
  dataset: string;
  settlementDate: string;
  periods: ElexonSystemPricePeriod[];
}

const SETTLEMENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SYSTEM_PRICE_ROW_SCHEMA = z.object({
  settlementDate: z.string().regex(SETTLEMENT_DATE_PATTERN),
  settlementPeriod: z.number().int().min(1).max(50),
  startTime: z.string(),
  createdDateTime: z.string(),
  systemSellPrice: z.number(),
  systemBuyPrice: z.number(),
  priceDerivationCode: z.string(),
  netImbalanceVolume: z.number(),
  totalAcceptedOfferVolume: z.number(),
  totalAcceptedBidVolume: z.number(),
});

const SYSTEM_PRICE_PAGE_SCHEMA = z.object({
  metadata: z.object({
    datasets: z.array(z.string().min(1)).min(1),
  }),
  data: z.array(SYSTEM_PRICE_ROW_SCHEMA).min(1),
});

/**
 * Formats an instant as the UK settlement date the API takes.
 *
 * @param date - the instant to format
 * @returns the date as `YYYY-MM-DD` in UK local time
 */
export function formatElexonSettlementDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/London',
  }).format(date);
}

/**
 * Returns the UK calendar date before the one that contains the instant.
 *
 * @param date - the instant to step back from
 * @returns the previous UK date as `YYYY-MM-DD`
 */
function previousUkSettlementDate(date: Date): string {
  const [year, month, day] = formatElexonSettlementDate(date).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError('the current UK date could not be read');
  }
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/**
 * Builds the system prices URL for one settlement day.
 *
 * @param settlementDate - the settlement date as `YYYY-MM-DD`
 * @returns the absolute BMRS URL
 */
export function buildElexonSystemPricesUrl(settlementDate: string): string {
  if (!SETTLEMENT_DATE_PATTERN.test(settlementDate)) {
    throw new RangeError(`settlementDate must be YYYY-MM-DD, got ${settlementDate}`);
  }
  const parsedDate = new Date(`${settlementDate}T00:00:00Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== settlementDate
  ) {
    throw new RangeError(`settlementDate is not a real date: ${settlementDate}`);
  }
  return `${ELEXON_BMRS_API_BASE_URL}/${ELEXON_SYSTEM_PRICES_PATH}/${settlementDate}`;
}

/**
 * Parses one settlement day of BMRS system prices.
 *
 * @param payload - the API response, or the committed fixture of one
 * @returns the dataset id, settlement date, and every period on the page
 */
export function parseElexonSystemPrices(payload: unknown): ElexonSystemPriceDay {
  const parsed = SYSTEM_PRICE_PAGE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(ELEXON_SYSTEM_PRICES_SOURCE_ID, parsed.error.message);
  }
  const firstRow = parsed.data.data[0];
  if (firstRow === undefined) {
    throw new UkSourceParseError(ELEXON_SYSTEM_PRICES_SOURCE_ID, 'the day carried no periods');
  }
  const settlementDate = firstRow.settlementDate;
  const dataset = parsed.data.metadata.datasets[0];
  if (dataset === undefined) {
    throw new UkSourceParseError(ELEXON_SYSTEM_PRICES_SOURCE_ID, 'metadata carried no dataset id');
  }
  const seenPeriods = new Set<number>();
  const periods = parsed.data.data.map((row) => {
    if (row.settlementDate !== settlementDate) {
      throw new UkSourceParseError(
        ELEXON_SYSTEM_PRICES_SOURCE_ID,
        `the page carries more than one settlement date: ${settlementDate} and ${row.settlementDate}`
      );
    }
    if (seenPeriods.has(row.settlementPeriod)) {
      throw new UkSourceParseError(
        ELEXON_SYSTEM_PRICES_SOURCE_ID,
        `settlement period ${String(row.settlementPeriod)} is listed more than once`
      );
    }
    seenPeriods.add(row.settlementPeriod);
    return {
      settlementPeriod: row.settlementPeriod,
      startTime: row.startTime,
      createdDateTime: row.createdDateTime,
      systemSellPrice: row.systemSellPrice,
      systemBuyPrice: row.systemBuyPrice,
      priceDerivationCode: row.priceDerivationCode,
      netImbalanceVolume: row.netImbalanceVolume,
      totalAcceptedOfferVolume: row.totalAcceptedOfferVolume,
      totalAcceptedBidVolume: row.totalAcceptedBidVolume,
    };
  });
  return {
    dataset,
    settlementDate,
    periods,
  };
}

/**
 * Reads one settlement day of system prices from the BMRS API.
 *
 * @param options - settlement date or a clock, and an optional fetch implementation
 * @param options.date - the settlement date as `YYYY-MM-DD`; defaults to yesterday in UK time
 * @param options.now - the clock used for the default date
 * @param options.fetchImpl - fetch override, used by tests
 * @returns the settlement day and its periods
 */
export async function fetchElexonSystemPrices(
  options: { date?: string; now?: Date; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<ElexonSystemPriceDay> {
  const { now = new Date(), fetchImpl = globalThis.fetch } = options;
  const date = options.date ?? previousUkSettlementDate(now);
  const response = await httpGet(ELEXON_SYSTEM_PRICES_SOURCE_ID, buildElexonSystemPricesUrl(date), {
    fetchImpl,
    headers: { accept: 'application/json' },
  });
  return parseElexonSystemPrices(await response.json());
}

/** Elexon BMRS settlement system prices, keyless. */
export const elexonSystemPricesAdapter: UkDataAdapter<ElexonSystemPriceDay> = {
  id: ELEXON_SYSTEM_PRICES_SOURCE_ID,
  name: 'Elexon BMRS settlement system prices',
  auth: 'none',
  description: 'Settlement system buy and sell prices for one Great Britain settlement day.',
  fetchLive: (options) =>
    fetchElexonSystemPrices(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseElexonSystemPrices,
  loadFixture: () =>
    parseElexonSystemPrices(readFixtureJson('elexon-system-prices-2026-11-08.json')),
};
