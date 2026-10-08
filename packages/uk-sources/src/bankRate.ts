import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureText } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Bank of England's official Bank Rate, published in the Bank's
 * Interactive Statistical Database (IADB). Keyless: the database answers
 * without a key, and the series is the one the Bank's own statistics pages
 * read: <https://www.bankofengland.co.uk/statistics>.
 */
export const BANK_RATE_SOURCE_ID = 'bank-rate';

/** The IADB series code for the daily official Bank Rate. */
export const BANK_RATE_SERIES_CODE = 'IUDBEDR';

/** The IADB CSV endpoint, before the query string is added. */
export const BANK_RATE_CSV_URL =
  'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp';

/**
 * First date the database holds for the daily series, in the database's own
 * query format. Asking for an earlier start returns the database's error
 * page rather than a CSV, so the adapter never asks for one.
 */
export const BANK_RATE_FIRST_QUERY_DATE = '02/Jan/1975';

/** One date reading: the rate that stood on that day. */
export interface BankRateObservation {
  /** ISO date, e.g. "1975-01-02". */
  date: string;
  /** The rate on that day, in per cent per year. */
  ratePercent: number;
}

/** One unbroken run at a single level. */
export interface BankRateSpell {
  startDate: string;
  endDate: string;
  ratePercent: number;
  /** Calendar days from the first reading to the last, both counted. */
  dayCount: number;
}

/** Rolled-up shape of the whole series. */
export interface BankRateSummary {
  /** Daily readings the series carried. */
  observationCount: number;
  /** Times the rate moved to a new level. */
  changeCount: number;
  /** How many levels the series has stood at. */
  levelCount: number;
  firstObservation: BankRateObservation;
  latestObservation: BankRateObservation;
  /** Highest level the series reached, and when it lasted. */
  highestSpell: BankRateSpell;
  /** Lowest level the series reached, and when it lasted. */
  lowestSpell: BankRateSpell;
  /** The longest run at one level. */
  longestSpell: BankRateSpell;
  /** Every run at one level, oldest first. */
  spells: BankRateSpell[];
}

/** The two CSV columns the database writes: date then series code. */
const BANK_RATE_CSV_COLUMNS = 2;
const CSV_DATE_COLUMN = 0;
const CSV_RATE_COLUMN = 1;

/** Milliseconds in a day, for turning a date span into a day count. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** The three-letter month names the database writes, January first. */
const BANK_RATE_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Month numbers by the name the database writes, e.g. "Jan" to "01". */
const BANK_RATE_MONTHS: Record<string, string> = Object.fromEntries(
  BANK_RATE_MONTH_NAMES.map((name, index) => [name, String(index + 1).padStart(2, '0')])
);

/** Splits a CSV body into rows, tolerating CRLF line endings and a blank tail. */
function splitCsvRows(csvText: string): string[] {
  return csvText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row !== '');
}

/**
 * Formats a day the way an IADB query string wants it, e.g. "28/Sep/2026".
 *
 * @param day - the day to format
 * @returns the day as DD/Mon/YYYY, read in UTC
 */
export function formatBankRateQueryDate(day: Date): string {
  const month = BANK_RATE_MONTH_NAMES[day.getUTCMonth()];
  const dayOfMonth = String(day.getUTCDate()).padStart(2, '0');
  if (month === undefined) {
    throw new UkSourceParseError(BANK_RATE_SOURCE_ID, 'the query date fell outside a year');
  }
  return `${dayOfMonth}/${month}/${String(day.getUTCFullYear())}`;
}

/**
 * Builds the CSV URL for the Bank Rate series, from the series start to a day.
 *
 * @param toQueryDate - the last day to ask for, in the database's DD/Mon/YYYY format
 * @returns the full CSV URL
 */
export function buildBankRateCsvUrl(toQueryDate: string): string {
  const url = new URL(BANK_RATE_CSV_URL);
  url.searchParams.set('csv.x', 'yes');
  url.searchParams.set('Datefrom', BANK_RATE_FIRST_QUERY_DATE);
  url.searchParams.set('Dateto', toQueryDate);
  url.searchParams.set('SeriesCodes', BANK_RATE_SERIES_CODE);
  url.searchParams.set('CSVF', 'TN');
  url.searchParams.set('UsingCodes', 'Y');
  url.searchParams.set('VPD', 'Y');
  url.searchParams.set('VFD', 'N');
  return url.href;
}

/**
 * Converts one database date, e.g. "02 Jan 1975", to an ISO date.
 *
 * @param value - the date as the database writes it
 * @returns the same day as YYYY-MM-DD
 */
function parseObservationDate(value: string): string {
  const parts = value.split(' ');
  const [dayPart, monthPart, yearPart] = parts;
  const month = monthPart === undefined ? undefined : BANK_RATE_MONTHS[monthPart];
  if (
    parts.length !== 3 ||
    dayPart === undefined ||
    month === undefined ||
    yearPart === undefined
  ) {
    throw new UkSourceParseError(BANK_RATE_SOURCE_ID, `"${value}" is not a database date`);
  }
  const day = dayPart.padStart(2, '0');
  if (!/^\d{2}$/.test(day) || !/^\d{4}$/.test(yearPart)) {
    throw new UkSourceParseError(BANK_RATE_SOURCE_ID, `"${value}" is not a database date`);
  }
  return `${yearPart}-${month}-${day}`;
}

/**
 * Parses an IADB CSV body into daily Bank Rate readings.
 *
 * The CSV carries one row per business day, oldest first, with the date in
 * the first column and the rate in the second. Dates must run forwards: a
 * body that repeats or reorders a day would quietly break the spell counts.
 *
 * @param csvText - the raw CSV body from the IADB endpoint
 * @returns one observation per day the database returned
 */
export function parseBankRateCsv(csvText: string): BankRateObservation[] {
  const rows = splitCsvRows(csvText);
  const header = rows[0]?.split(',') ?? [];
  if (header[CSV_RATE_COLUMN] !== BANK_RATE_SERIES_CODE) {
    throw new UkSourceParseError(
      BANK_RATE_SOURCE_ID,
      `the CSV header does not name the ${BANK_RATE_SERIES_CODE} series`
    );
  }

  const observations: BankRateObservation[] = [];
  for (const row of rows.slice(1)) {
    const columns = row.split(',');
    if (columns.length !== BANK_RATE_CSV_COLUMNS) {
      throw new UkSourceParseError(BANK_RATE_SOURCE_ID, `"${row}" is not a date and a rate`);
    }
    const date = parseObservationDate(columns[CSV_DATE_COLUMN] ?? '');
    const rawRate = (columns[CSV_RATE_COLUMN] ?? '').trim();
    const rate = Number(rawRate);
    if (rawRate === '' || !Number.isFinite(rate)) {
      throw new UkSourceParseError(BANK_RATE_SOURCE_ID, `"${row}" carries no rate`);
    }
    const previous = observations.at(-1);
    if (previous !== undefined && previous.date >= date) {
      throw new UkSourceParseError(BANK_RATE_SOURCE_ID, `${date} does not follow ${previous.date}`);
    }
    observations.push({ date, ratePercent: rate });
  }

  if (observations.length === 0) {
    throw new UkSourceParseError(BANK_RATE_SOURCE_ID, 'the CSV carried no readings');
  }
  return observations;
}

/**
 * Days between two ISO dates, counting both ends.
 *
 * @param startDate - the first day of the run
 * @param endDate - the last day of the run
 * @returns how many calendar days the run covers
 */
function countDaysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / MILLISECONDS_PER_DAY) + 1;
}

/**
 * Collapses the daily readings into the runs the rate held one level for.
 *
 * @param observations - daily readings, oldest first
 * @returns one spell per unbroken level, oldest first
 */
export function buildBankRateSpells(observations: BankRateObservation[]): BankRateSpell[] {
  const spells: BankRateSpell[] = [];
  for (const observation of observations) {
    const open = spells.at(-1);
    if (open?.ratePercent === observation.ratePercent) {
      open.endDate = observation.date;
      open.dayCount = countDaysBetween(open.startDate, observation.date);
      continue;
    }
    spells.push({
      startDate: observation.date,
      endDate: observation.date,
      ratePercent: observation.ratePercent,
      dayCount: 1,
    });
  }
  return spells;
}

/**
 * Totals the series and finds its highest, lowest, and longest spells.
 *
 * @param observations - daily readings, oldest first
 * @returns counts, the first and last readings, and the spells
 */
export function summarizeBankRateSeries(observations: BankRateObservation[]): BankRateSummary {
  const spells = buildBankRateSpells(observations);
  const firstObservation = observations[0];
  const latestObservation = observations.at(-1);
  const firstSpell = spells[0];
  const lastSpell = spells.at(-1);
  if (
    firstObservation === undefined ||
    latestObservation === undefined ||
    firstSpell === undefined ||
    lastSpell === undefined
  ) {
    throw new UkSourceParseError(BANK_RATE_SOURCE_ID, 'the series carried no readings');
  }

  let highestSpell = firstSpell;
  let lowestSpell = firstSpell;
  let longestSpell = firstSpell;
  for (const spell of spells) {
    if (spell.ratePercent > highestSpell.ratePercent) {
      highestSpell = spell;
    }
    if (spell.ratePercent < lowestSpell.ratePercent) {
      lowestSpell = spell;
    }
    if (spell.dayCount > longestSpell.dayCount) {
      longestSpell = spell;
    }
  }

  return {
    observationCount: observations.length,
    changeCount: spells.length - 1,
    levelCount: new Set(spells.map((spell) => spell.ratePercent)).size,
    firstObservation,
    latestObservation,
    highestSpell,
    lowestSpell,
    longestSpell,
    spells,
  };
}

/**
 * Reads the Bank Rate series from the Bank of England's database.
 *
 * The database answers with the whole series up to the day asked for, so the
 * call runs to today rather than to a fixed end date.
 *
 * @param options - an optional fetch implementation and an optional "today"
 * @returns one observation per day the database returned
 */
export async function fetchBankRateObservations(
  options: { fetchImpl?: typeof globalThis.fetch; now?: Date } = {}
): Promise<BankRateObservation[]> {
  const { fetchImpl = globalThis.fetch, now = new Date() } = options;
  const url = buildBankRateCsvUrl(formatBankRateQueryDate(now));
  const response = await httpGet(BANK_RATE_SOURCE_ID, url, { fetchImpl });
  return parseBankRateCsv(await response.text());
}

/** Bank of England Bank Rate readings, keyless, one row per business day. */
export const bankRateAdapter: UkDataAdapter<BankRateObservation[]> = {
  id: BANK_RATE_SOURCE_ID,
  name: 'Bank of England Bank Rate',
  auth: 'none',
  description: 'The daily official Bank Rate, from 2 January 1975 to the latest published day.',
  fetchLive: (options) =>
    fetchBankRateObservations(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseBankRateCsv,
  loadFixture: () => parseBankRateCsv(readFixtureText('bank-rate.csv')),
};
