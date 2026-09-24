import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Transport for London's Santander Cycles docking station list. Keyless: the
 * endpoint answers without an app key, and TfL asks for one only above the
 * free rate limit. Published as TfL Open Data.
 */
export const TFL_BIKE_POINTS_URL = 'https://api.tfl.gov.uk/BikePoint';

/** How many of the largest docking stations the summary keeps by default. */
export const DEFAULT_LARGEST_STATION_LIMIT = 10;

/** One Santander Cycles docking station, as TfL lists it. */
export interface DockingStation {
  id: string;
  /** TfL's own station name, with the spacing around commas tidied. */
  name: string;
  /** Docking points the station has, empty or full. */
  dockCount: number;
  /** Bikes docked at the time of the call. */
  bikeCount: number;
  /** Electric bikes among the docked bikes. */
  electricBikeCount: number;
  emptyDockCount: number;
  /** True for TfL's pop-up stations, which come and go with events. */
  temporary: boolean;
}

/** Rolled-up counts across every docking station TfL lists. */
export interface DockingStationSummary {
  stationCount: number;
  /** Docking points summed across every station. */
  dockCount: number;
  bikeCount: number;
  electricBikeCount: number;
  /** The stations with the most docking points, largest first. */
  largestStations: DockingStation[];
}

const TFL_PLACE_SCHEMA = z.object({
  id: z.string(),
  commonName: z.string(),
  additionalProperties: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
});

const TFL_PLACES_SCHEMA = z.array(TFL_PLACE_SCHEMA);

/** The station fields this adapter reads out of TfL's key/value property list. */
const DOCK_COUNT_KEY = 'NbDocks';
const BIKE_COUNT_KEY = 'NbBikes';
const ELECTRIC_BIKE_COUNT_KEY = 'NbEBikes';
const EMPTY_DOCK_COUNT_KEY = 'NbEmptyDocks';
const TEMPORARY_KEY = 'Temporary';
const REMOVAL_DATE_KEY = 'RemovalDate';

/**
 * Indexes TfL's key/value property list for one station.
 *
 * @param station - one place from the BikePoint payload
 * @returns the station's properties by key
 */
function readProperties(station: z.infer<typeof TFL_PLACE_SCHEMA>): Map<string, string> {
  return new Map(station.additionalProperties.map((property) => [property.key, property.value]));
}

/**
 * Reads one numeric property, naming the station when it is missing.
 *
 * @param properties - the station's properties
 * @param key - the property key to read
 * @param stationName - the station name, for the error message
 * @returns the property as a number
 */
function readCountProperty(
  properties: Map<string, string>,
  key: string,
  stationName: string
): number {
  const raw = properties.get(key);
  if (raw === undefined || raw.trim() === '') {
    throw new UkSourceParseError('tfl-bike-points', `no ${key} on ${stationName}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UkSourceParseError(
      'tfl-bike-points',
      `${key} "${raw}" on ${stationName} is not a number`
    );
  }
  return value;
}

/**
 * Tidies the spacing TfL leaves around commas in station names, so
 * "River Street , Clerkenwell" reads as "River Street, Clerkenwell". The words
 * are TfL's own.
 *
 * @param name - the station name as TfL publishes it
 * @returns the name with collapsed spaces and tidy commas
 */
function tidyStationName(name: string): string {
  return name.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
}

/**
 * Parses a TfL BikePoint payload into docking stations.
 *
 * Stations TfL has marked for removal are dropped: they still appear in the
 * list after they close, and they carry no docking points to count.
 *
 * @param payload - the raw JSON body from the BikePoint endpoint
 * @returns one docking station per live station in the payload
 */
export function parseTflBikePoints(payload: unknown): DockingStation[] {
  const parsed = TFL_PLACES_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('tfl-bike-points', parsed.error.message);
  }

  const stations: DockingStation[] = [];
  for (const place of parsed.data) {
    const name = tidyStationName(place.commonName);
    const properties = readProperties(place);
    if ((properties.get(REMOVAL_DATE_KEY) ?? '').trim() !== '') {
      continue;
    }
    stations.push({
      id: place.id,
      name,
      dockCount: readCountProperty(properties, DOCK_COUNT_KEY, name),
      bikeCount: readCountProperty(properties, BIKE_COUNT_KEY, name),
      electricBikeCount: readCountProperty(properties, ELECTRIC_BIKE_COUNT_KEY, name),
      emptyDockCount: readCountProperty(properties, EMPTY_DOCK_COUNT_KEY, name),
      temporary: properties.get(TEMPORARY_KEY) === 'true',
    });
  }
  return stations;
}

/**
 * Totals the network and keeps the largest stations.
 *
 * @param stations - stations from {@link parseTflBikePoints}
 * @param largestStationLimit - how many stations to keep in `largestStations`
 * @returns station, dock, and bike counts plus the largest stations
 */
export function summarizeTflBikePoints(
  stations: DockingStation[],
  largestStationLimit: number = DEFAULT_LARGEST_STATION_LIMIT
): DockingStationSummary {
  const largestStations = [...stations]
    .sort((left, right) => right.dockCount - left.dockCount || left.name.localeCompare(right.name))
    .slice(0, largestStationLimit);

  return {
    stationCount: stations.length,
    dockCount: stations.reduce((total, station) => total + station.dockCount, 0),
    bikeCount: stations.reduce((total, station) => total + station.bikeCount, 0),
    electricBikeCount: stations.reduce((total, station) => total + station.electricBikeCount, 0),
    largestStations,
  };
}

/**
 * Lists every Santander Cycles docking station from TfL.
 *
 * @param options - an optional app key and fetch implementation
 * @returns the docking stations the endpoint returns
 */
export async function fetchTflBikePoints(
  options: { apiKey?: string; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<DockingStation[]> {
  const { apiKey, fetchImpl = globalThis.fetch } = options;
  const url =
    apiKey === undefined
      ? TFL_BIKE_POINTS_URL
      : `${TFL_BIKE_POINTS_URL}?app_key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UkSourceApiError(
      'tfl-bike-points',
      `HTTP ${response.status} listing docking stations`
    );
  }
  return parseTflBikePoints(await response.json());
}

/** Transport for London Santander Cycles docking stations, keyless. */
export const tflBikePointsAdapter: UkDataAdapter<DockingStation[]> = {
  id: 'tfl-bike-points',
  name: 'Transport for London Santander Cycles docking stations',
  auth: 'none',
  description: 'Every Santander Cycles docking station, with its docking points and docked bikes.',
  fetchLive: (options) =>
    fetchTflBikePoints({
      ...(options?.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseTflBikePoints,
  loadFixture: () => parseTflBikePoints(readFixtureJson('tfl-bike-points.json')),
};
