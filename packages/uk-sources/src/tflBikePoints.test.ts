import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchTflBikePoints,
  parseTflBikePoints,
  summarizeTflBikePoints,
  tflBikePointsAdapter,
  TFL_BIKE_POINTS_URL,
} from './tflBikePoints.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const BIKE_POINTS_FIXTURE = readFixtureJson('tfl-bike-points.json');

/** The station properties the parser reads, as TfL writes them. */
const STATION_PROPERTIES: { key: string; value: string }[] = [
  { key: 'NbDocks', value: '20' },
  { key: 'NbBikes', value: '5' },
  { key: 'NbEBikes', value: '1' },
  { key: 'NbEmptyDocks', value: '15' },
  { key: 'Temporary', value: 'false' },
  { key: 'RemovalDate', value: '' },
];

/** One station with only the fields the parser needs. */
function place(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'BikePoints_1',
    commonName: 'Example Dock',
    additionalProperties: STATION_PROPERTIES.map((property) => ({ ...property })),
    ...overrides,
  };
}

/** One station with a single property value changed. */
function withProperty(key: string, value: string): Record<string, unknown> {
  return place({
    additionalProperties: STATION_PROPERTIES.map((property) =>
      property.key === key ? { key, value } : { ...property }
    ),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseTflBikePoints', () => {
  it('parses the docking station fixture', () => {
    const stations = parseTflBikePoints(BIKE_POINTS_FIXTURE);
    expect(stations).toHaveLength(6);
    expect(stations[0]?.id).toMatch(/^BikePoints_\d+$/);
    expect(stations[0]?.dockCount).toBeGreaterThan(0);
    expect(stations[0]?.emptyDockCount).toBeGreaterThanOrEqual(0);
  });

  it('reads the dock, bike, and empty dock counts out of the property list', () => {
    const stations = parseTflBikePoints([place()]);
    expect(stations[0]).toEqual({
      id: 'BikePoints_1',
      name: 'Example Dock',
      dockCount: 20,
      bikeCount: 5,
      electricBikeCount: 1,
      emptyDockCount: 15,
      temporary: false,
    });
  });

  it('reads the temporary flag the way TfL writes it', () => {
    const [station] = parseTflBikePoints([withProperty('Temporary', 'true')]);
    expect(station?.temporary).toBe(true);
  });

  it('drops a station TfL has marked for removal', () => {
    const stations = parseTflBikePoints([
      withProperty('RemovalDate', '2026-08-01T00:00:00'),
      place({ id: 'BikePoints_2', commonName: 'Still Open' }),
    ]);
    expect(stations.map((station) => station.name)).toEqual(['Still Open']);
  });

  it('tidies the spacing TfL leaves around commas in station names', () => {
    const [station] = parseTflBikePoints([place({ commonName: 'River Street , Clerkenwell' })]);
    expect(station?.name).toBe('River Street, Clerkenwell');
  });

  it('names the station when a dock count is missing', () => {
    const missing = place({
      commonName: 'Broken Dock',
      additionalProperties: [{ key: 'NbBikes', value: '5' }],
    });
    expect(() => parseTflBikePoints([missing])).toThrow(/no NbDocks on Broken Dock/);
  });

  it('rejects a dock count that is not a number', () => {
    expect(() => parseTflBikePoints([withProperty('NbDocks', 'not a number')])).toThrow(
      UkSourceParseError
    );
  });

  it('throws when the payload is not a station list', () => {
    expect(() => parseTflBikePoints({ places: [] })).toThrow(UkSourceParseError);
    expect(() => parseTflBikePoints(null)).toThrow(UkSourceParseError);
  });
});

describe('summarizeTflBikePoints', () => {
  const stations = parseTflBikePoints(BIKE_POINTS_FIXTURE);

  it('totals the stations, their docking points, and their bikes', () => {
    const summary = summarizeTflBikePoints(stations);
    expect(summary.stationCount).toBe(6);
    expect(summary.dockCount).toBe(205);
    expect(summary.bikeCount).toBe(76);
    expect(summary.electricBikeCount).toBe(4);
  });

  it('puts the biggest dock at the top of the largest stations', () => {
    const summary = summarizeTflBikePoints(stations);
    expect(summary.largestStations[0]?.name).toBe('Jubilee Plaza, Canary Wharf');
    expect(summary.largestStations[0]?.dockCount).toBe(63);
    expect(summary.largestStations).toHaveLength(6);
  });

  it('breaks a tie on the station name so the order is stable', () => {
    const tied = parseTflBikePoints([
      place({ id: 'BikePoints_7', commonName: 'Zed Dock' }),
      place({ id: 'BikePoints_8', commonName: 'Aa Dock' }),
    ]);
    expect(summarizeTflBikePoints(tied).largestStations.map((station) => station.name)).toEqual([
      'Aa Dock',
      'Zed Dock',
    ]);
  });

  it('caps the largest list at the requested size', () => {
    expect(summarizeTflBikePoints(stations, 2).largestStations).toHaveLength(2);
  });

  it('returns zeroed counts for an empty station list', () => {
    expect(summarizeTflBikePoints([])).toEqual({
      stationCount: 0,
      dockCount: 0,
      bikeCount: 0,
      electricBikeCount: 0,
      largestStations: [],
    });
  });
});

describe('fetchTflBikePoints', () => {
  it('parses the reply from the keyless endpoint', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(BIKE_POINTS_FIXTURE), { status: 200 })
    );
    const stations = await fetchTflBikePoints({ fetchImpl });
    expect(stations).toHaveLength(6);
    expect(fetchImpl).toHaveBeenCalledWith(TFL_BIKE_POINTS_URL);
  });

  it('sends the app key as a query parameter when one is given', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(BIKE_POINTS_FIXTURE), { status: 200 })
    );
    await fetchTflBikePoints({ apiKey: 'abc 123', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(`${TFL_BIKE_POINTS_URL}?app_key=abc%20123`);
  });

  it('throws an API error when the endpoint refuses the call', async () => {
    const fetchImpl = vi.fn(async () => new Response('too many requests', { status: 429 }));
    await expect(fetchTflBikePoints({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('tflBikePointsAdapter', () => {
  it('describes itself as a keyless source', () => {
    expect(tflBikePointsAdapter.id).toBe('tfl-bike-points');
    expect(tflBikePointsAdapter.auth).toBe('none');
    expect(tflBikePointsAdapter.name).toContain('Transport for London');
  });

  it('loads the committed fixture when it is asked for one', () => {
    expect(tflBikePointsAdapter.loadFixture()).toHaveLength(6);
  });
});
