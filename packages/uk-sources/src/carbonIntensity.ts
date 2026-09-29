import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Half-hourly carbon intensity for Great Britain's electricity grid, from the
 * National Energy System Operator's Carbon Intensity API. Every call answers
 * without a key, and the API's own terms place the data under the Creative
 * Commons Attribution 4.0 licence: <https://carbonintensity.org.uk/>
 */
export const CARBON_INTENSITY_SOURCE_ID = 'carbon-intensity';

/** Root every call here is built from. */
export const CARBON_INTENSITY_API_BASE_URL = 'https://api.carbonintensity.org.uk';

/** Half-hourly readings between two instants. */
export const CARBON_INTENSITY_RANGE_URL = `${CARBON_INTENSITY_API_BASE_URL}/intensity`;

/**
 * The API refuses a range longer than 31 days ("The date range you have
 * specified is greater than 31 days"). The window stays a day inside that.
 */
export const CARBON_INTENSITY_MAX_WINDOW_DAYS = 30;

/** How many complete days the default window covers. */
export const DEFAULT_CARBON_INTENSITY_WINDOW_DAYS = 30;

/** How long one reading covers. */
export const CARBON_INTENSITY_PERIOD_MINUTES = 30;

/** Milliseconds in a day, for turning a window length into an instant. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** Milliseconds in the half hour one reading covers. */
const MILLISECONDS_PER_PERIOD = CARBON_INTENSITY_PERIOD_MINUTES * 60 * 1000;

/** Half-hour readings in a whole day. */
const PERIODS_PER_DAY = (24 * 60) / CARBON_INTENSITY_PERIOD_MINUTES;

/**
 * The grades the API puts each half hour in, lowest intensity first. They are
 * the operator's own words: "The index is a measure of the Carbon Intensity
 * represented on a scale between 'very low', 'low', 'moderate', 'high', 'very
 * high'."
 */
export const CARBON_INTENSITY_INDEX_BANDS = [
  'very low',
  'low',
  'moderate',
  'high',
  'very high',
] as const;

/** One of the grades the API labels a half hour with. */
export type CarbonIntensityIndex = (typeof CARBON_INTENSITY_INDEX_BANDS)[number];

/** One half hour of the series, with the reading the API holds for it. */
export interface CarbonIntensityPeriod {
  /** Start of the half hour, as an ISO instant in UTC. */
  from: string;
  /** End of the half hour, as an ISO instant in UTC. */
  to: string;
  /** The estimated actual intensity over the half hour, in gCO2/kWh. */
  intensity: number;
  /** The grade the API puts that reading in. */
  index: CarbonIntensityIndex;
}

/** How many half hours the window holds at one grade. */
export interface CarbonIntensityBandCount {
  index: CarbonIntensityIndex;
  periodCount: number;
}

/** A window of half-hourly readings, rolled up into the numbers a page prints. */
export interface CarbonIntensityWindow {
  /** Half hours the window holds. */
  periodCount: number;
  /** Complete days the window covers. */
  dayCount: number;
  /** Start of the oldest half hour in the window. */
  firstPeriodFrom: string;
  /** End of the newest half hour in the window. */
  lastPeriodTo: string;
  /** Mean intensity across the window, rounded to a whole number. */
  averageIntensity: number;
  /** The cleanest half hour in the window. */
  lowestPeriod: CarbonIntensityPeriod;
  /** The dirtiest half hour in the window. */
  highestPeriod: CarbonIntensityPeriod;
  /** Half hours per grade, lowest grade first. */
  bandCounts: CarbonIntensityBandCount[];
  /** Every reading, oldest first. */
  periods: CarbonIntensityPeriod[];
}

const CARBON_INTENSITY_RESPONSE_SCHEMA = z.object({
  data: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      intensity: z.object({
        forecast: z.number().nullable(),
        actual: z.number().nullable(),
        index: z.string(),
      }),
    })
  ),
});

const CARBON_INTENSITY_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;

/** Milliseconds for an ISO instant, or NaN when the string is not one. */
function instantMilliseconds(instant: string): number {
  return CARBON_INTENSITY_INSTANT_PATTERN.test(instant) ? Date.parse(instant) : Number.NaN;
}

/**
 * Writes a Date as the ISO instant the API takes in its path, e.g.
 * `2026-08-30T00:00Z`.
 *
 * @param date - the instant to write
 * @returns the instant as `YYYY-MM-DDThh:mmZ`
 */
export function formatCarbonIntensityInstant(date: Date): string {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/**
 * Works out the window a build reads: whole UTC days, ending at the start of
 * today, so every reading in it is settled rather than a forecast.
 *
 * @param options - how many days, and the clock to measure back from
 * @returns the window's start and end as ISO instants
 */
export function resolveCarbonIntensityWindow(options: { windowDays?: number; now?: Date } = {}): {
  from: string;
  to: string;
} {
  const windowDays = options.windowDays ?? DEFAULT_CARBON_INTENSITY_WINDOW_DAYS;
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      `a window of ${String(windowDays)} days is not a whole number of days`
    );
  }
  if (windowDays > CARBON_INTENSITY_MAX_WINDOW_DAYS) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      `the API refuses a range longer than ${String(CARBON_INTENSITY_MAX_WINDOW_DAYS)} days`
    );
  }
  const now = options.now ?? new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - windowDays * MILLISECONDS_PER_DAY);
  return { from: formatCarbonIntensityInstant(from), to: formatCarbonIntensityInstant(to) };
}

/**
 * Checks a window a caller passed in rather than one the adapter worked out.
 *
 * The API refuses a range longer than 31 days and answers in half hours, so a
 * window that is not a whole number of half hours, or that runs past the
 * limit, throws here rather than at the API.
 *
 * @param window - the start and end a caller asked for
 * @returns the same window, once it has been checked
 */
export function validateCarbonIntensityWindow(window: {
  from?: string | undefined;
  to?: string | undefined;
}): {
  from: string;
  to: string;
} {
  const { from, to } = window;
  if (from === undefined || to === undefined) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      'a window needs both a start and an end'
    );
  }
  const fromMilliseconds = instantMilliseconds(from);
  const toMilliseconds = instantMilliseconds(to);
  if (Number.isNaN(fromMilliseconds) || Number.isNaN(toMilliseconds)) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      `expected instants as YYYY-MM-DDThh:mmZ, got ${from} and ${to}`
    );
  }
  const span = toMilliseconds - fromMilliseconds;
  if (span <= 0) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      `the window ends at ${to}, before it starts at ${from}`
    );
  }
  if (span % MILLISECONDS_PER_PERIOD !== 0) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      `the window ${from} to ${to} is not a whole number of half hours`
    );
  }
  if (span > CARBON_INTENSITY_MAX_WINDOW_DAYS * MILLISECONDS_PER_DAY) {
    throw new UkSourceParseError(
      CARBON_INTENSITY_SOURCE_ID,
      `the API refuses a range longer than ${String(CARBON_INTENSITY_MAX_WINDOW_DAYS)} days`
    );
  }
  return { from, to };
}

/**
 * Builds the URL for one window of half-hourly readings.
 *
 * @param window - the start and end of the window, as ISO instants
 * @returns the full range URL
 */
export function buildCarbonIntensityWindowUrl(window: { from: string; to: string }): string {
  return `${CARBON_INTENSITY_RANGE_URL}/${window.from}/${window.to}`;
}

/** Counts the half hours the window holds at each grade, lowest grade first. */
function countByBand(periods: CarbonIntensityPeriod[]): CarbonIntensityBandCount[] {
  return CARBON_INTENSITY_INDEX_BANDS.map((index) => ({
    index,
    periodCount: periods.filter((period) => period.index === index).length,
  }));
}

/**
 * Parses a range response into the readings the page draws.
 *
 * Every check here is one the page would otherwise show as a wrong number: a
 * half hour with no settled reading, a period that does not run for half an
 * hour, an instant that does not move forwards, or a grade the API's own band
 * list does not carry all throw rather than quietly changing the counts.
 *
 * @param payload - the range response, or the committed fixture of one
 * @returns every reading in the window, oldest first, with its totals
 */
export function parseCarbonIntensityWindow(payload: unknown): CarbonIntensityWindow {
  const parsed = CARBON_INTENSITY_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(CARBON_INTENSITY_SOURCE_ID, parsed.error.message);
  }
  const responses = parsed.data.data;
  if (responses.length === 0) {
    throw new UkSourceParseError(CARBON_INTENSITY_SOURCE_ID, 'the window returned no readings');
  }

  const bands = new Set<string>(CARBON_INTENSITY_INDEX_BANDS);
  let previousFrom = Number.NEGATIVE_INFINITY;
  const periods = responses.map((response) => {
    const from = instantMilliseconds(response.from);
    const to = instantMilliseconds(response.to);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      throw new UkSourceParseError(
        CARBON_INTENSITY_SOURCE_ID,
        `expected an instant as YYYY-MM-DDThh:mmZ, got ${JSON.stringify(response.from)}`
      );
    }
    if (to - from !== MILLISECONDS_PER_PERIOD) {
      throw new UkSourceParseError(
        CARBON_INTENSITY_SOURCE_ID,
        `the half hour starting ${response.from} runs for ${String((to - from) / 60_000)} minutes`
      );
    }
    if (from <= previousFrom) {
      throw new UkSourceParseError(
        CARBON_INTENSITY_SOURCE_ID,
        `the readings do not move forwards at ${response.from}`
      );
    }
    previousFrom = from;
    if (response.intensity.actual === null) {
      throw new UkSourceParseError(
        CARBON_INTENSITY_SOURCE_ID,
        `the half hour starting ${response.from} carries no settled reading`
      );
    }
    if (!bands.has(response.intensity.index)) {
      throw new UkSourceParseError(
        CARBON_INTENSITY_SOURCE_ID,
        `unrecognised intensity grade ${JSON.stringify(response.intensity.index)}`
      );
    }
    return {
      from: response.from,
      to: response.to,
      intensity: response.intensity.actual,
      index: response.intensity.index as CarbonIntensityIndex,
    };
  });

  const total = periods.reduce((sum, period) => sum + period.intensity, 0);
  const lowestPeriod = periods.reduce((lowest, period) =>
    period.intensity < lowest.intensity ? period : lowest
  );
  const highestPeriod = periods.reduce((highest, period) =>
    period.intensity > highest.intensity ? period : highest
  );
  const firstPeriod = periods[0];
  const lastPeriod = periods.at(-1);
  if (firstPeriod === undefined || lastPeriod === undefined) {
    throw new UkSourceParseError(CARBON_INTENSITY_SOURCE_ID, 'the window holds no readings');
  }

  return {
    periodCount: periods.length,
    dayCount: Math.floor(periods.length / PERIODS_PER_DAY),
    firstPeriodFrom: firstPeriod.from,
    lastPeriodTo: lastPeriod.to,
    averageIntensity: Math.round(total / periods.length),
    lowestPeriod,
    highestPeriod,
    bandCounts: countByBand(periods),
    periods,
  };
}

/** One window of half-hourly readings, or a throw naming what failed. */
async function fetchCarbonIntensityPayload(options: {
  from: string;
  to: string;
  fetchImpl: typeof globalThis.fetch;
}): Promise<unknown> {
  const url = buildCarbonIntensityWindowUrl({ from: options.from, to: options.to });
  const response = await options.fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new UkSourceApiError(CARBON_INTENSITY_SOURCE_ID, `HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

/**
 * Reads a window of half-hourly carbon intensity.
 *
 * The range endpoint also returns the half hour that ends at the window's
 * start, so the first response is dropped: without that, the window is a half
 * hour longer than the whole days it claims to cover.
 *
 * A caller can also pass the window's own start and end, which is how a page
 * aligns the window to whole days in its own time zone rather than to UTC.
 *
 * @param options - how many days, or an explicit window, and an optional fetch implementation
 * @returns every reading in the window, oldest first, with its totals
 */
export async function fetchCarbonIntensityWindow(
  options: {
    windowDays?: number;
    now?: Date;
    from?: string | undefined;
    to?: string | undefined;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<CarbonIntensityWindow> {
  const { from, to } =
    options.from === undefined && options.to === undefined
      ? resolveCarbonIntensityWindow(options)
      : validateCarbonIntensityWindow({ from: options.from, to: options.to });
  const payload = await fetchCarbonIntensityPayload({
    from,
    to,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  });
  const parsed = CARBON_INTENSITY_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(CARBON_INTENSITY_SOURCE_ID, parsed.error.message);
  }
  const windowStart = Date.parse(from);
  return parseCarbonIntensityWindow({
    data: parsed.data.data.filter((response) => instantMilliseconds(response.from) >= windowStart),
  });
}

/** National Energy System Operator half-hourly carbon intensity, keyless. */
export const carbonIntensityAdapter: UkDataAdapter<CarbonIntensityWindow> = {
  id: CARBON_INTENSITY_SOURCE_ID,
  name: 'National Energy System Operator carbon intensity',
  auth: 'none',
  description:
    'Half-hourly carbon intensity for Great Britain, with the cleanest and dirtiest half hours in the window.',
  fetchLive: (options) =>
    fetchCarbonIntensityWindow({
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseCarbonIntensityWindow,
  loadFixture: () => parseCarbonIntensityWindow(readFixtureJson('carbon-intensity.json')),
};
