import { describe, expect, it } from 'vitest';

import { createConnectorsApp } from './index';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

// The Environment Agency API answers in 5 to 20 seconds per call, well past
// vitest's 5 second default.
const LIVE_PROBE_TIMEOUT_MS = 60_000;

describe.skipIf(!RUN_SMOKE)('live API smoke test', () => {
  it('lists every source through the API', async () => {
    const app = createConnectorsApp({});
    const res = await app.request('/api/sources');
    expect(res.status).toBe(200);
    const sources = (await res.json()) as Array<{ id: string }>;
    expect(sources.map((source) => source.id)).toEqual([
      'flood-stations',
      'flood-readings',
      'ons-datasets',
    ]);
  });

  it(
    'lists live flood-monitoring stations',
    async () => {
      const app = createConnectorsApp({});
      const res = await app.request('/api/flood/stations?limit=5');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { stations: Array<{ notation: string }> };
      expect(body.stations.length).toBeGreaterThan(0);
      expect(body.stations[0]?.notation.length).toBeGreaterThan(0);
    },
    LIVE_PROBE_TIMEOUT_MS
  );

  it(
    'reads live readings for the default station',
    async () => {
      const app = createConnectorsApp({});
      const res = await app.request('/api/flood/readings');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        station: string;
        summary: { count: number };
        readings: Array<{ value: number }>;
      };
      expect(body.station).toBe('1029TH');
      expect(body.summary.count).toBeGreaterThan(0);
    },
    LIVE_PROBE_TIMEOUT_MS
  );

  it(
    'lists the live ONS dataset catalogue',
    async () => {
      const app = createConnectorsApp({});
      const res = await app.request('/api/ons/datasets?limit=10');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        summary: { datasetCount: number };
        records: Array<{ id: string }>;
      };
      expect(body.summary.datasetCount).toBe(10);
      expect(body.records[0]?.id.length).toBeGreaterThan(0);
    },
    LIVE_PROBE_TIMEOUT_MS
  );

  it(
    'probes every keyless source through the API',
    async () => {
      const app = createConnectorsApp({});
      const list = await app.request('/api/sources');
      const sources = (await list.json()) as Array<{ id: string }>;
      for (const source of sources) {
        const res = await app.request(`/api/sources/${source.id}/probe`);
        expect(res.status).toBe(200);
        const probe = (await res.json()) as { ok: boolean; status: string };
        expect(probe.ok, `${source.id}: ${probe.status}`).toBe(true);
      }
    },
    LIVE_PROBE_TIMEOUT_MS
  );
});
