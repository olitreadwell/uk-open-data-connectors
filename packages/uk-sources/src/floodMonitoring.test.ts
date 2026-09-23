import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { UkSourceParseError } from './errors.js';
import {
  fetchFloodStationReadings,
  fetchFloodStations,
  parseFloodReadings,
  parseFloodStations,
  summarizeFloodReadings,
} from './floodMonitoring.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const STATIONS_FIXTURE = readFixtureJson('flood-stations.json');
const READINGS_FIXTURE = readFixtureJson('flood-station-readings.json');

describe('parseFloodStations', () => {
  it('parses the station fixture into stations with their measures', () => {
    const stations = parseFloodStations(STATIONS_FIXTURE);
    expect(stations.length).toBeGreaterThan(0);
    const first = stations[0];
    expect(first?.notation).toMatch(/^[0-9A-Z]+$/);
    expect(first?.label.length).toBeGreaterThan(0);
    expect(first?.latitude).toBeGreaterThan(49);
    expect(first?.latitude).toBeLessThan(61);
    expect(first?.measures.length).toBeGreaterThan(0);
    expect(first?.measures[0]?.parameterName.length).toBeGreaterThan(0);
  });

  it('rejects a payload without an items array', () => {
    expect(() => parseFloodStations({ meta: {} })).toThrow(UkSourceParseError);
  });
});

describe('parseFloodReadings', () => {
  it('parses the readings fixture into readings', () => {
    const readings = parseFloodReadings(READINGS_FIXTURE);
    expect(readings.length).toBeGreaterThan(0);
    const first = readings[0];
    expect(first?.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof first?.value).toBe('number');
    expect(first?.measureId).toContain('/measures/');
  });

  it('rejects a payload where a value is not a number', () => {
    const broken = {
      items: [{ '@id': 'x', dateTime: '2026-01-01T00:00:00Z', measure: 'y', value: 'high' }],
    };
    expect(() => parseFloodReadings(broken)).toThrow(UkSourceParseError);
  });
});

describe('summarizeFloodReadings', () => {
  it('orders by time and reports count, ends, range, and trend', () => {
    const summary = summarizeFloodReadings(parseFloodReadings(READINGS_FIXTURE));
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.latest?.dateTime).toBeDefined();
    expect(summary.earliest?.dateTime).toBeDefined();
    const { minValue, maxValue } = summary;
    if (minValue === undefined || maxValue === undefined) {
      throw new Error('expected a spread between the lowest and highest reading');
    }
    expect(minValue).toBeLessThanOrEqual(maxValue);
    expect(['rising', 'falling', 'steady']).toContain(summary.trend);
  });

  it('reports rising when the latest reading is above the earliest', () => {
    const summary = summarizeFloodReadings([
      { measureId: 'm', dateTime: '2026-01-01T00:00:00Z', value: 1 },
      { measureId: 'm', dateTime: '2026-01-01T01:00:00Z', value: 2 },
    ]);
    expect(summary.trend).toBe('rising');
  });

  it('reports falling when the latest reading is below the earliest', () => {
    const summary = summarizeFloodReadings([
      { measureId: 'm', dateTime: '2026-01-01T00:00:00Z', value: 2 },
      { measureId: 'm', dateTime: '2026-01-01T01:00:00Z', value: 1 },
    ]);
    expect(summary.trend).toBe('falling');
  });

  it('reports steady when the level barely moves', () => {
    const summary = summarizeFloodReadings([
      { measureId: 'm', dateTime: '2026-01-01T00:00:00Z', value: 1 },
      { measureId: 'm', dateTime: '2026-01-01T01:00:00Z', value: 1.001 },
    ]);
    expect(summary.trend).toBe('steady');
  });

  it('reports nothing for an empty run', () => {
    const summary = summarizeFloodReadings([]);
    expect(summary.count).toBe(0);
    expect(summary.trend).toBe('unknown');
    expect(summary.latest).toBeUndefined();
  });
});

describe('fetch helpers', () => {
  it('requests stations with the requested limit and parses the reply', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(STATIONS_FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const stations = await fetchFloodStations({ limit: 2, fetchImpl });
    expect(stations.length).toBeGreaterThan(0);
    expect(seen[0]).toContain('_limit=2');
  });

  it('requests sorted readings for the named station', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify(READINGS_FIXTURE), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    await fetchFloodStationReadings('1029TH', { limit: 6, fetchImpl });
    expect(seen[0]).toContain('/stations/1029TH/readings');
    expect(seen[0]).toContain('_sorted');
  });

  it('raises an API error on a non-200 reply', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(fetchFloodStations({ fetchImpl })).rejects.toThrow(/HTTP 503/);
  });
});
