import { describe, expect, it } from 'vitest';

import {
  fetchFloodStationReadings,
  fetchFloodStations,
  fetchOnsDatasets,
  probeUkDataSource,
} from '@open-data-connectors/uk-sources';
import type {
  FloodReading,
  FloodStation,
  OnsDatasetRecord,
  UkDataAdapter,
} from '@open-data-connectors/uk-sources';

import { createConnectorsApp } from './index';

/** Bourton Dickler on the River Dikler, the station every stub answers with. */
const BOURTON_DICKLER: FloodStation = {
  id: 'http://environment.data.gov.uk/flood-monitoring/id/stations/1029TH',
  notation: '1029TH',
  label: 'Bourton Dickler',
  riverName: 'River Dikler',
  catchmentName: 'Cotswolds',
  latitude: 51.873,
  longitude: -1.771,
  measures: [
    {
      id: 'http://environment.data.gov.uk/flood-monitoring/id/measures/1029TH-level-stage-i-15_min-m',
      parameter: 'level',
      parameterName: 'Water Level',
      qualifier: 'Stage',
      unitName: 'm',
      periodSeconds: 900,
    },
  ],
};

const READING_AT_0900: FloodReading = {
  measureId:
    'http://environment.data.gov.uk/flood-monitoring/id/measures/1029TH-level-stage-i-15_min-m',
  dateTime: '2026-09-23T09:00:00Z',
  value: 0.19,
};

const READING_AT_0915: FloodReading = {
  measureId: READING_AT_0900.measureId,
  dateTime: '2026-09-23T09:15:00Z',
  value: 0.24,
};

const BABIES_BORN: OnsDatasetRecord = {
  id: 'babies-born-in-england-and-wales',
  title: 'Babies born in England and Wales',
  state: 'published',
  lastUpdatedIso: '2024-07-10T08:53:21.000Z',
  isNationalStatistic: true,
  keywords: ['births'],
  topicPath: 'topics/peoplepopulationandcommunity/birthsdeathsandmarriages',
};

const CONSUMER_PRICES: OnsDatasetRecord = {
  id: 'consumer-prices-indices',
  title: 'Consumer prices indices',
  state: 'published',
  lastUpdatedIso: '2023-11-15T09:30:00.000Z',
  isNationalStatistic: null,
  keywords: [],
  topicPath: '',
};

const stubProbe: typeof probeUkDataSource = async (adapter: UkDataAdapter<unknown>) => ({
  id: adapter.id,
  name: adapter.name,
  auth: adapter.auth,
  ok: true,
  status: 'ok',
});

const stubStations: typeof fetchFloodStations = async () => [BOURTON_DICKLER];

const stubReadings: typeof fetchFloodStationReadings = async () => [
  READING_AT_0900,
  READING_AT_0915,
];

const stubDatasets: typeof fetchOnsDatasets = async () => [BABIES_BORN, CONSUMER_PRICES];

function createTestApp(): ReturnType<typeof createConnectorsApp> {
  return createConnectorsApp({
    probeFn: stubProbe,
    fetchFloodStations: stubStations,
    fetchFloodStationReadings: stubReadings,
    fetchOnsDatasets: stubDatasets,
  });
}

describe('createConnectorsApp', () => {
  it('answers the health check', async () => {
    const app = createTestApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      name: 'uk-open-data-connectors',
    });
  });

  it('serves the OpenAPI document', async () => {
    const app = createTestApp();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(doc.paths['/api/sources']).toBeDefined();
    expect(doc.paths['/api/ons/datasets']).toBeDefined();
  });

  it('serves the Swagger UI at /docs', async () => {
    const app = createTestApp();
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('swagger');
  });

  it('lists every adapter with id, name, auth, and description', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources');
    expect(res.status).toBe(200);
    const sources = (await res.json()) as Array<{
      id: string;
      name: string;
      auth: string;
      description: string;
    }>;
    expect(sources.map((source) => source.id)).toEqual([
      'flood-stations',
      'flood-readings',
      'ons-datasets',
    ]);
    for (const source of sources) {
      expect(source.name.length).toBeGreaterThan(0);
      expect(source.auth).toBe('none');
      expect(source.description.length).toBeGreaterThan(0);
    }
  });

  it('probes a known source', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources/flood-stations/probe');
    expect(res.status).toBe(200);
    const probe = (await res.json()) as { id: string; ok: boolean };
    expect(probe.id).toBe('flood-stations');
    expect(probe.ok).toBe(true);
  });

  it('returns 404 for an unknown source', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources/not-a-source/probe');
    expect(res.status).toBe(404);
  });

  it('rejects a malformed probe id', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources/%20/probe');
    expect(res.status).toBe(400);
  });

  it('lists flood-monitoring stations', async () => {
    const app = createTestApp();
    const res = await app.request('/api/flood/stations?limit=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stations: FloodStation[] };
    expect(body.stations).toHaveLength(1);
    expect(body.stations[0]?.notation).toBe('1029TH');
    expect(body.stations[0]?.riverName).toBe('River Dikler');
  });

  it('reads the default flood-monitoring station', async () => {
    const app = createTestApp();
    const res = await app.request('/api/flood/readings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      station: string;
      summary: { count: number; trend: string; latest: { value: number } };
      readings: FloodReading[];
    };
    expect(body.station).toBe('1029TH');
    expect(body.summary.count).toBe(2);
    expect(body.summary.trend).toBe('rising');
    expect(body.summary.latest.value).toBe(0.24);
  });

  it('reads a named flood-monitoring station', async () => {
    const app = createTestApp();
    const res = await app.request('/api/flood/readings?station=1029TH&limit=2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { station: string; readings: FloodReading[] };
    expect(body.station).toBe('1029TH');
    expect(body.readings).toHaveLength(2);
  });

  it('rejects a flood station limit outside the allowed range', async () => {
    const app = createTestApp();
    const res = await app.request('/api/flood/stations?limit=0');
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric flood reading limit', async () => {
    const app = createTestApp();
    const res = await app.request('/api/flood/readings?limit=lots');
    expect(res.status).toBe(400);
  });

  it('returns the ONS catalogue with its summary', async () => {
    const app = createTestApp();
    const res = await app.request('/api/ons/datasets?limit=2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: {
        datasetCount: number;
        nationalStatisticCount: number;
        unflaggedCount: number;
        yearCounts: Array<{ year: string; datasetCount: number }>;
      };
      records: OnsDatasetRecord[];
    };
    expect(body.records).toHaveLength(2);
    expect(body.summary.datasetCount).toBe(2);
    expect(body.summary.nationalStatisticCount).toBe(1);
    expect(body.summary.unflaggedCount).toBe(1);
    expect(body.summary.yearCounts).toEqual([
      { year: '2023', datasetCount: 1 },
      { year: '2024', datasetCount: 1 },
    ]);
  });

  it('rejects an ONS limit above the catalogue ceiling', async () => {
    const app = createTestApp();
    const res = await app.request('/api/ons/datasets?limit=5000');
    expect(res.status).toBe(400);
  });

  it('allows cross-origin reads on /api routes by default', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources', {
      headers: { origin: 'https://example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('honors a configured CORS origin', async () => {
    const app = createConnectorsApp({ corsOrigin: 'https://app.example.com' });
    const res = await app.request('/api/sources', {
      headers: { origin: 'https://app.example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
  });

  it('omits CORS headers for origins outside the configured allowlist', async () => {
    const app = createConnectorsApp({ corsOrigin: 'https://app.example.com' });
    const res = await app.request('/api/sources', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers OPTIONS preflight for /api routes', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sources', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.com' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('rate limits /api routes per client', async () => {
    const app = createConnectorsApp({ rateLimit: { maxRequests: 2, windowMs: 60_000 } });
    await app.request('/api/sources', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    await app.request('/api/sources', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const limited = await app.request('/api/sources', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });
});
