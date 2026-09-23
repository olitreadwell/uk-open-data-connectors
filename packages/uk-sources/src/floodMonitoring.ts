import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/** One measure a station publishes, such as water level at 15 minute steps. */
export interface FloodMeasure {
  id: string;
  parameter: string;
  parameterName: string;
  qualifier: string;
  unitName: string;
  periodSeconds: number;
}

/** One monitoring station in the Environment Agency network. */
export interface FloodStation {
  id: string;
  notation: string;
  label: string;
  riverName: string;
  catchmentName: string;
  latitude: number;
  longitude: number;
  measures: FloodMeasure[];
}

/** One reading from a station measure. */
export interface FloodReading {
  measureId: string;
  dateTime: string;
  value: number;
}

/** Rolled-up facts about a run of readings. */
export interface FloodReadingSummary {
  count: number;
  latest: FloodReading | undefined;
  earliest: FloodReading | undefined;
  minValue: number | undefined;
  maxValue: number | undefined;
  trend: 'rising' | 'falling' | 'steady' | 'unknown';
}

/**
 * Station the readings adapter probes by default: Bourton Dickler on the
 * River Dikler, which publishes level readings every 15 minutes.
 */
export const DEFAULT_FLOOD_STATION_REFERENCE = '1029TH';

/** How close two readings must be to count as steady, in metres. */
const STEADY_LEVEL_TOLERANCE_METRES = 0.01;

const FLOOD_MEASURE_SCHEMA = z.object({
  '@id': z.string(),
  parameter: z.string(),
  parameterName: z.string(),
  qualifier: z.string(),
  unitName: z.string(),
  period: z.number().optional(),
});

const FLOOD_STATION_SCHEMA = z.object({
  '@id': z.string(),
  notation: z.string(),
  label: z.string(),
  riverName: z.string().optional(),
  catchmentName: z.string().optional(),
  lat: z.number(),
  long: z.number(),
  measures: z.array(FLOOD_MEASURE_SCHEMA).optional(),
});

const FLOOD_STATIONS_RESPONSE_SCHEMA = z.object({
  items: z.array(FLOOD_STATION_SCHEMA),
});

const FLOOD_READING_SCHEMA = z.object({
  '@id': z.string(),
  dateTime: z.string(),
  measure: z.string(),
  value: z.number(),
});

const FLOOD_READINGS_RESPONSE_SCHEMA = z.object({
  items: z.array(FLOOD_READING_SCHEMA),
});

/** Parses an Environment Agency /id/stations payload into stations. */
export function parseFloodStations(payload: unknown): FloodStation[] {
  const parsed = FLOOD_STATIONS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('flood-monitoring', parsed.error.message);
  }
  return parsed.data.items.map((station) => ({
    id: station['@id'],
    notation: station.notation,
    label: station.label,
    riverName: station.riverName ?? '',
    catchmentName: station.catchmentName ?? '',
    latitude: station.lat,
    longitude: station.long,
    measures: (station.measures ?? []).map((measure) => ({
      id: measure['@id'],
      parameter: measure.parameter,
      parameterName: measure.parameterName,
      qualifier: measure.qualifier,
      unitName: measure.unitName,
      periodSeconds: measure.period ?? 0,
    })),
  }));
}

/** Parses an Environment Agency /readings payload into readings. */
export function parseFloodReadings(payload: unknown): FloodReading[] {
  const parsed = FLOOD_READINGS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('flood-monitoring', parsed.error.message);
  }
  return parsed.data.items.map((reading) => ({
    measureId: reading.measure,
    dateTime: reading.dateTime,
    value: reading.value,
  }));
}

/** Summarizes a run of readings: count, ends, range, and direction. */
export function summarizeFloodReadings(readings: FloodReading[]): FloodReadingSummary {
  if (readings.length === 0) {
    return {
      count: 0,
      latest: undefined,
      earliest: undefined,
      minValue: undefined,
      maxValue: undefined,
      trend: 'unknown',
    };
  }
  const ordered = [...readings].sort((left, right) => left.dateTime.localeCompare(right.dateTime));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const values = ordered.map((reading) => reading.value);
  const movement = last !== undefined && first !== undefined ? last.value - first.value : 0;
  const trend =
    Math.abs(movement) <= STEADY_LEVEL_TOLERANCE_METRES
      ? 'steady'
      : movement > 0
        ? 'rising'
        : 'falling';
  return {
    count: ordered.length,
    latest: last,
    earliest: first,
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
    trend,
  };
}

/**
 * Lists monitoring stations from the Environment Agency flood-monitoring
 * API. Keyless, Open Government Licence v3.
 */
export async function fetchFloodStations(
  options: { limit?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<FloodStation[]> {
  const { limit = 25, fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(
    `https://environment.data.gov.uk/flood-monitoring/id/stations?_limit=${limit}`
  );
  if (!response.ok) {
    throw new UkSourceApiError('flood-monitoring', `HTTP ${response.status} listing stations`);
  }
  return parseFloodStations(await response.json());
}

/**
 * Reads the most recent readings for one station. `_sorted` returns the
 * newest first, so the first item is the current level.
 */
export async function fetchFloodStationReadings(
  stationReference: string = DEFAULT_FLOOD_STATION_REFERENCE,
  options: { limit?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<FloodReading[]> {
  const { limit = 96, fetchImpl = globalThis.fetch } = options;
  const url =
    `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationReference}` +
    `/readings?_limit=${limit}&_sorted`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UkSourceApiError('flood-monitoring', `HTTP ${response.status} reading station`);
  }
  return parseFloodReadings(await response.json());
}

/** Flood-monitoring station list adapter, keyless. */
export const floodStationsAdapter: UkDataAdapter<FloodStation[]> = {
  id: 'flood-stations',
  name: 'Environment Agency flood-monitoring stations',
  auth: 'none',
  description: 'Monitoring stations with their river, catchment, and published measures.',
  fetchLive: (options) =>
    fetchFloodStations(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseFloodStations,
  loadFixture: () => parseFloodStations(readFixtureJson('flood-stations.json')),
};

/** Flood-monitoring readings adapter for the default station, keyless. */
export const floodReadingsAdapter: UkDataAdapter<FloodReading[]> = {
  id: 'flood-readings',
  name: 'Environment Agency flood-monitoring readings',
  auth: 'none',
  description: 'Recent water level readings for one station, newest first.',
  fetchLive: (options) =>
    fetchFloodStationReadings(
      DEFAULT_FLOOD_STATION_REFERENCE,
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseFloodReadings,
  loadFixture: () => parseFloodReadings(readFixtureJson('flood-station-readings.json')),
};
