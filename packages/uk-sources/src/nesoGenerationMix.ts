import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * Half-hourly Great Britain generation by fuel, from the National Energy
 * System Operator's open data portal. Keyless: the CKAN datastore search
 * answers without a key, and the portal publishes under the NESO Open Data
 * Licence.
 *
 * The portal moved house. The dataset was first published at
 * <https://data.nationalgrideso.com/>, which no longer resolves now the GB
 * system operator trades as NESO. The same datasets are served from
 * <https://api.neso.energy/>, which is what this adapter reads.
 */
export const NESO_GENERATION_MIX_SOURCE_ID = 'neso-generation-mix';

/** The portal's CKAN API root. */
export const NESO_DATA_PORTAL_API_BASE_URL = 'https://api.neso.energy';

/** The datastore search call every read of the portal is built from. */
export const NESO_DATASTORE_SEARCH_URL = `${NESO_DATA_PORTAL_API_BASE_URL}/api/3/action/datastore_search`;

/** The "Historic GB Generation Mix" resource: one row per half hour since 2009. */
export const NESO_GENERATION_MIX_RESOURCE_ID = 'f93d1835-75bc-43e5-84ad-12472b180a98';

/** Half hours in the default window: seven whole days. */
export const DEFAULT_NESO_GENERATION_MIX_HALF_HOURS = 336;

/**
 * The most half hours one read asks for. The datastore will answer with more,
 * but a window past ten weeks stops being the recent picture the summary is
 * for, and the whole window is held in memory to be rolled up.
 */
export const MAX_NESO_GENERATION_MIX_HALF_HOURS = 3360;

/**
 * Every fuel the resource reports, in the order the portal lists the columns.
 * `WIND_EMB` is embedded wind: turbines on the distribution networks, counted
 * separately from the transmission-connected `WIND`.
 */
export const NESO_GENERATION_FUELS = [
  'GAS',
  'COAL',
  'NUCLEAR',
  'WIND',
  'WIND_EMB',
  'HYDRO',
  'IMPORTS',
  'BIOMASS',
  'OTHER',
  'SOLAR',
  'STORAGE',
] as const;

/** One of the fuel columns the resource carries. */
export type NesoGenerationFuel = (typeof NESO_GENERATION_FUELS)[number];

/** One fuel's reading for one half hour. */
export interface NesoGenerationFuelReading {
  fuel: NesoGenerationFuel;
  /** The portal's own number for that fuel over the half hour, in megawatts. */
  megawatts: number;
}

/** One half hour of the series, with the row the portal holds for it. */
export interface NesoGenerationHalfHour {
  /** Start of the half hour, as the portal writes it: `2026-10-17T16:00:00`. */
  datetime: string;
  /** What the portal says the half hour generated in total, in megawatts. */
  totalMegawatts: number;
  /** The half hour's carbon intensity, in grams of CO2 per kilowatt hour. */
  carbonIntensity: number;
  /** The half hour's low-carbon output, as the portal counts it, in megawatts. */
  lowCarbonMegawatts: number;
  /** Output per fuel, in the order of {@link NESO_GENERATION_FUELS}. */
  fuels: NesoGenerationFuelReading[];
}

/** One fuel rolled up across the window. */
export interface NesoGenerationFuelShare {
  fuel: NesoGenerationFuel;
  /** Mean output over the window, in megawatts, rounded to a whole number. */
  averageMegawatts: number;
  /** The most the fuel reached in any half hour of the window. */
  peakMegawatts: number;
  /** Its share of the window's total generation, to one decimal place. */
  sharePercent: number;
}

/** A window of half hours, rolled up into the numbers a page prints. */
export interface NesoGenerationMixWindow {
  /** Half hours the window holds. */
  halfHourCount: number;
  /** Start of the oldest half hour in the window. */
  firstHalfHourAt: string;
  /** Start of the newest half hour in the window. */
  lastHalfHourAt: string;
  /** Mean total generation over the window, in megawatts. */
  averageTotalMegawatts: number;
  /** Mean carbon intensity over the window, in gCO2/kWh. */
  averageCarbonIntensity: number;
  /** Share of the window's generation the portal counts as low carbon. */
  lowCarbonSharePercent: number;
  /** Mean output per fuel, largest first. */
  fuelShares: NesoGenerationFuelShare[];
  /** The half hour with the lowest carbon intensity. */
  cleanestHalfHour: NesoGenerationHalfHour;
  /** The half hour with the highest carbon intensity. */
  dirtiestHalfHour: NesoGenerationHalfHour;
  /** Every half hour in the window, oldest first. */
  halfHours: NesoGenerationHalfHour[];
}

// One line per fuel column the resource carries, spelled out rather than
// built from NESO_GENERATION_FUELS, so the parsed record is typed with those
// keys and a renamed or missing column fails at the schema.
const NESO_GENERATION_MIX_RESPONSE_SCHEMA = z.object({
  success: z.boolean(),
  result: z.object({
    total: z.number(),
    records: z.array(
      z.object({
        DATETIME: z.string(),
        GENERATION: z.number(),
        CARBON_INTENSITY: z.number(),
        LOW_CARBON: z.number(),
        GAS: z.number(),
        COAL: z.number(),
        NUCLEAR: z.number(),
        WIND: z.number(),
        WIND_EMB: z.number(),
        HYDRO: z.number(),
        IMPORTS: z.number(),
        BIOMASS: z.number(),
        OTHER: z.number(),
        SOLAR: z.number(),
        STORAGE: z.number(),
      })
    ),
  }),
});

/** The portal writes datetimes to the minute, at the start of a half hour. */
const NESO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00$/;

/** Milliseconds in a half hour, for checking one reading runs to the next. */
const MILLISECONDS_PER_HALF_HOUR = 30 * 60 * 1000;

/** Rounds a share to one decimal place. */
function toSharePercent(part: number, whole: number): number {
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * Builds the URL for one window of half hours.
 *
 * The datastore answers newest first, which is the order a page wants when it
 * is showing the last few days, and the parse puts the window back in time
 * order before rolling it up.
 *
 * @param options - how many half hours to ask for, and which resource
 * @returns the datastore search URL, with its query already encoded
 */
export function buildNesoGenerationMixUrl(
  options: { halfHours?: number; resourceId?: string } = {}
): string {
  const halfHours = options.halfHours ?? DEFAULT_NESO_GENERATION_MIX_HALF_HOURS;
  if (!Number.isInteger(halfHours) || halfHours < 1) {
    throw new UkSourceParseError(
      NESO_GENERATION_MIX_SOURCE_ID,
      `a window of ${String(halfHours)} half hours is not a whole number of half hours`
    );
  }
  if (halfHours > MAX_NESO_GENERATION_MIX_HALF_HOURS) {
    throw new UkSourceParseError(
      NESO_GENERATION_MIX_SOURCE_ID,
      `this adapter reads at most ${String(MAX_NESO_GENERATION_MIX_HALF_HOURS)} half hours at a time`
    );
  }
  const resourceId = options.resourceId ?? NESO_GENERATION_MIX_RESOURCE_ID;
  const query = new URLSearchParams({
    resource_id: resourceId,
    sort: 'DATETIME desc',
    limit: String(halfHours),
  });
  return `${NESO_DATASTORE_SEARCH_URL}?${query.toString()}`;
}

/** Rolls a window of half hours up into the numbers the page prints. */
function summarizeNesoGenerationMix(halfHours: NesoGenerationHalfHour[]): NesoGenerationMixWindow {
  const firstHalfHour = halfHours[0];
  const lastHalfHour = halfHours.at(-1);
  if (firstHalfHour === undefined || lastHalfHour === undefined) {
    throw new UkSourceParseError(NESO_GENERATION_MIX_SOURCE_ID, 'the window holds no half hours');
  }

  let totalMegawatts = 0;
  let carbonIntensityTotal = 0;
  let lowCarbonMegawatts = 0;
  const megawattsByFuel = new Map<NesoGenerationFuel, number>(
    NESO_GENERATION_FUELS.map((fuel) => [fuel, 0])
  );
  const peakByFuel = new Map<NesoGenerationFuel, number>(
    NESO_GENERATION_FUELS.map((fuel) => [fuel, Number.NEGATIVE_INFINITY])
  );

  for (const halfHour of halfHours) {
    totalMegawatts += halfHour.totalMegawatts;
    carbonIntensityTotal += halfHour.carbonIntensity;
    lowCarbonMegawatts += halfHour.lowCarbonMegawatts;
    for (const reading of halfHour.fuels) {
      megawattsByFuel.set(
        reading.fuel,
        (megawattsByFuel.get(reading.fuel) ?? 0) + reading.megawatts
      );
      peakByFuel.set(reading.fuel, Math.max(peakByFuel.get(reading.fuel) ?? 0, reading.megawatts));
    }
  }

  const halfHourCount = halfHours.length;
  const fuelShares = NESO_GENERATION_FUELS.map((fuel) => ({
    fuel,
    averageMegawatts: Math.round((megawattsByFuel.get(fuel) ?? 0) / halfHourCount),
    peakMegawatts: peakByFuel.get(fuel) ?? 0,
    sharePercent: toSharePercent(megawattsByFuel.get(fuel) ?? 0, totalMegawatts),
  })).sort((left, right) => right.averageMegawatts - left.averageMegawatts);

  const cleanestHalfHour = halfHours.reduce((cleanest, halfHour) =>
    halfHour.carbonIntensity < cleanest.carbonIntensity ? halfHour : cleanest
  );
  const dirtiestHalfHour = halfHours.reduce((dirtiest, halfHour) =>
    halfHour.carbonIntensity > dirtiest.carbonIntensity ? halfHour : dirtiest
  );

  return {
    halfHourCount,
    firstHalfHourAt: firstHalfHour.datetime,
    lastHalfHourAt: lastHalfHour.datetime,
    averageTotalMegawatts: Math.round(totalMegawatts / halfHourCount),
    averageCarbonIntensity: Math.round(carbonIntensityTotal / halfHourCount),
    lowCarbonSharePercent: toSharePercent(lowCarbonMegawatts, totalMegawatts),
    fuelShares,
    cleanestHalfHour,
    dirtiestHalfHour,
    halfHours,
  };
}

/**
 * Parses a datastore response into the readings the page draws.
 *
 * Every check here is one the page would otherwise show as a wrong number: a
 * datetime that is not on a half-hour boundary, two rows for the same half
 * hour, a fuel or total that is missing, or a row where the portal's own
 * generation figure is not a positive number. Anything that fails throws
 * rather than quietly joining the totals.
 *
 * @param payload - the datastore response, or the committed fixture of one
 * @returns every half hour in the window, oldest first, with its totals
 */
export function parseNesoGenerationMix(payload: unknown): NesoGenerationMixWindow {
  const parsed = NESO_GENERATION_MIX_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(NESO_GENERATION_MIX_SOURCE_ID, parsed.error.message);
  }
  if (!parsed.data.success) {
    throw new UkSourceParseError(NESO_GENERATION_MIX_SOURCE_ID, 'the datastore reported a failure');
  }
  const records = parsed.data.result.records;
  if (records.length === 0) {
    throw new UkSourceParseError(
      NESO_GENERATION_MIX_SOURCE_ID,
      'the window returned no half hours'
    );
  }

  const seen = new Set<string>();
  const halfHours = records.map((record) => {
    if (!NESO_DATETIME_PATTERN.test(record.DATETIME)) {
      throw new UkSourceParseError(
        NESO_GENERATION_MIX_SOURCE_ID,
        `expected a half hour as YYYY-MM-DDThh:mm:00, got ${JSON.stringify(record.DATETIME)}`
      );
    }
    if (seen.has(record.DATETIME)) {
      throw new UkSourceParseError(
        NESO_GENERATION_MIX_SOURCE_ID,
        `two rows for the half hour starting ${record.DATETIME}`
      );
    }
    seen.add(record.DATETIME);
    if (record.GENERATION <= 0) {
      throw new UkSourceParseError(
        NESO_GENERATION_MIX_SOURCE_ID,
        `the half hour starting ${record.DATETIME} generated ${String(record.GENERATION)} MW`
      );
    }
    if (record.CARBON_INTENSITY <= 0) {
      throw new UkSourceParseError(
        NESO_GENERATION_MIX_SOURCE_ID,
        `the half hour starting ${record.DATETIME} carries no carbon intensity`
      );
    }
    return {
      datetime: record.DATETIME,
      totalMegawatts: record.GENERATION,
      carbonIntensity: record.CARBON_INTENSITY,
      lowCarbonMegawatts: record.LOW_CARBON,
      fuels: NESO_GENERATION_FUELS.map((fuel) => ({ fuel, megawatts: record[fuel] })),
    };
  });

  halfHours.sort((left, right) => left.datetime.localeCompare(right.datetime));
  for (let index = 1; index < halfHours.length; index += 1) {
    const previous = halfHours[index - 1];
    const current = halfHours[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const gap = Date.parse(current.datetime) - Date.parse(previous.datetime);
    if (gap !== MILLISECONDS_PER_HALF_HOUR) {
      throw new UkSourceParseError(
        NESO_GENERATION_MIX_SOURCE_ID,
        `the readings jump from ${previous.datetime} to ${current.datetime}`
      );
    }
  }

  return summarizeNesoGenerationMix(halfHours);
}

/**
 * Reads the most recent half hours of Great Britain's generation mix.
 *
 * @param options - how many half hours to ask for, and an optional fetch implementation
 * @returns every half hour in the read window, oldest first, with its totals
 */
export async function fetchNesoGenerationMixWindow(
  options: {
    halfHours?: number;
    resourceId?: string;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<NesoGenerationMixWindow> {
  const url = buildNesoGenerationMixUrl({
    ...(options.halfHours === undefined ? {} : { halfHours: options.halfHours }),
    ...(options.resourceId === undefined ? {} : { resourceId: options.resourceId }),
  });
  const response = await httpGet(NESO_GENERATION_MIX_SOURCE_ID, url, {
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
  return parseNesoGenerationMix(await response.json());
}

/** National Energy System Operator generation mix, half-hourly and keyless. */
export const nesoGenerationMixAdapter: UkDataAdapter<NesoGenerationMixWindow> = {
  id: NESO_GENERATION_MIX_SOURCE_ID,
  name: 'National Energy System Operator generation mix',
  auth: 'none',
  description:
    'Half-hourly Great Britain generation by fuel, with the cleanest and dirtiest half hours in the window.',
  fetchLive: (options) =>
    fetchNesoGenerationMixWindow({
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseNesoGenerationMix,
  loadFixture: () => parseNesoGenerationMix(readFixtureJson('neso-generation-mix-2026-10-18.json')),
};
