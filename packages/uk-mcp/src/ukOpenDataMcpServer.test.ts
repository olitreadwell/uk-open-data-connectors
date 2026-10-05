import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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
  it('advertises the country query tool', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain('uk_parliament_seats');
  });

  it('lists every source in the country registry', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const result = await client.callTool({ name: 'list_sources', arguments: {} });

    const sources = JSON.parse(firstText(result)) as { id: string }[];
    expect(sources).toHaveLength(UK_DATA_SOURCES.length);
    expect(sources.every((source) => source.id.length > 0)).toBe(true);
  });

  it('names a source that is not in the registry', async () => {
    const client = await connectClient(createUkOpenDataMcpServer());

    const result = await client.callTool({
      name: 'fetch_source',
      arguments: { id: 'not-a-real-source' },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(firstText(result)).toContain('not-a-real-source');
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
        expect((result as { content?: unknown }).content, tool.name).toBeDefined();
      }
    }

    vi.unstubAllGlobals();
  }, 60_000);
});
