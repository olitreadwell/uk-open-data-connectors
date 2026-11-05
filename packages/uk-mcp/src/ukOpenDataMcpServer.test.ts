import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { UK_DATA_SOURCES } from '@uk-open-data-connectors/uk-sources';
import { describe, expect, it, vi } from 'vitest';

import { createUkOpenDataMcpServer } from './ukOpenDataMcpServer.js';

/** Connects a client to a server over the in-memory transport pair. */
async function connectClient(
  server: ReturnType<typeof createUkOpenDataMcpServer>
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** Reads the first text block out of a tool result. */
function firstText(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.find((entry) => entry.type === 'text')?.text ?? '';
}

describe('createUkOpenDataMcpServer', () => {
  it('reports the package.json version in the handshake', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    const client = await connectClient(createUkOpenDataMcpServer());
    expect(client.getServerVersion()?.version).toBe(manifest.version);
  });

  it('advertises the country query tool', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain('uk_parliament_seats');
  });

  it('advertises a named tool for every library query', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual([
      'list_sources',
      'probe_sources',
      'fetch_source',
      'uk_ancient_woodland',
      'uk_bank_rate',
      'uk_carbon_intensity',
      'uk_flood_station_readings',
      'uk_flood_stations',
      'uk_food_hygiene_authorities',
      'uk_ons_datasets',
      'uk_parliament_seats',
      'uk_planning_datasets',
      'uk_police_crime_categories',
      'uk_police_crime_months',
      'uk_police_crime_summary',
      'uk_tfl_bike_points',
      'uk_neso_generation_mix',
      'uk_tfl_line_status',
      'uk_postcode_lookup',
      'uk_nomis_datasets',
      'uk_tna_discovery',
      'uk_ukhsa_metrics',
      'uk_london_datastore',
      'uk_nhsbsa_catalogue',
      'uk_public_health_scotland',
      'uk_find_a_tender',
      'uk_fingertips_indicators',
      'uk_explore_education',
    ]);
  });

  it('rejects an unknown source id', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const result = await client.callTool({
      name: 'probe_sources',
      arguments: { ids: ['not-a-source'] },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(firstText(result)).toContain('not-a-source');
  });

  it('lists every source in the country registry', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const result = await client.callTool({ name: 'list_sources', arguments: {} });

    const sources = JSON.parse(firstText(result)) as { id: string }[];
    expect(sources).toHaveLength(UK_DATA_SOURCES.length);
    expect(sources.every((source) => source.id.length > 0)).toBe(true);
  });

  it('defaults postcode lookup when the postcode is missing or blank', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetchImpl);
    const client = await connectClient(createUkOpenDataMcpServer());

    await client.callTool({ name: 'uk_postcode_lookup', arguments: {} });
    expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).pathname).toBe('/postcodes/SW1A1AA');

    await client.callTool({ name: 'uk_postcode_lookup', arguments: { postcode: '   ' } });
    expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).pathname).toBe('/postcodes/SW1A1AA');

    vi.unstubAllGlobals();
  });

  it('uses the default Fingertips indicators and rejects an empty list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('down', { status: 500 }));
    vi.stubGlobal('fetch', fetchImpl);
    const client = await connectClient(createUkOpenDataMcpServer());

    await client.callTool({ name: 'uk_fingertips_indicators', arguments: {} });
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get('indicator_ids')).toBe('90366');

    fetchImpl.mockClear();
    const empty = await client.callTool({
      name: 'uk_fingertips_indicators',
      arguments: { indicatorIds: [] },
    });
    expect((empty as { isError?: boolean }).isError).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

/** Arguments a tool needs before its handler will run at all. */
const REQUIRED_ARGS: Record<string, Record<string, unknown>> = {};

/** Every tool called with every optional argument filled in. */
const FULL_ARGS: Record<string, Record<string, unknown>> = {
  probe_sources: { ids: ['ons-datasets'] },
  fetch_source: { id: 'ons-datasets', apiKey: 'k' },
  uk_carbon_intensity: { windowDays: 3 },
  uk_flood_station_readings: { stationReference: '1029TH', limit: 10 },
  uk_flood_stations: { limit: 10 },
  uk_ons_datasets: { limit: 10 },
  uk_parliament_seats: { house: 2, forDate: '2026-01-01' },
  uk_police_crime_summary: { latitude: 51.5, longitude: -0.1, monthCount: 3 },
  uk_tfl_bike_points: { apiKey: 'k' },
  uk_neso_generation_mix: { halfHours: 12, resourceId: 'x' },
  uk_tfl_line_status: { apiKey: 'k' },
  uk_postcode_lookup: { postcode: 'SW1A 1AA' },
  uk_nomis_datasets: {},
  uk_tna_discovery: { query: 'treasury' },
  uk_ukhsa_metrics: { pageSize: 10 },
  uk_london_datastore: {},
  uk_nhsbsa_catalogue: {},
  uk_public_health_scotland: {},
  uk_find_a_tender: { limit: 5 },
  uk_fingertips_indicators: { indicatorIds: [1, 2] },
  uk_explore_education: { page: 1, pageSize: 10 },
};

describe('every advertised tool', () => {
  it('fails cleanly when the upstream API answers with a 500, with and without arguments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 500 })));
    const client = await connectClient(createUkOpenDataMcpServer());

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const argumentSets = [REQUIRED_ARGS[tool.name] ?? {}, FULL_ARGS[tool.name] ?? {}];
      for (const args of argumentSets) {
        const result = await client.callTool({ name: tool.name, arguments: args });
        const isError = (result as { isError?: boolean }).isError === true;
        expect((result as { content?: unknown }).content, tool.name).toBeDefined();
        if (tool.name === 'list_sources') {
          expect(isError, tool.name).toBe(false);
        } else if (tool.name === 'probe_sources') {
          expect(isError, tool.name).toBe(false);
          const probes = JSON.parse(firstText(result)) as { ok: boolean }[];
          expect(probes.length, tool.name).toBeGreaterThan(0);
          expect(
            probes.every((probe) => !probe.ok),
            tool.name
          ).toBe(true);
        } else {
          expect(isError, tool.name).toBe(true);
        }
      }
    }

    vi.unstubAllGlobals();
  }, 60_000);
});
