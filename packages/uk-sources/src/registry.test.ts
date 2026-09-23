import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getUkDataSource,
  probeAllUkDataSources,
  probeUkDataSource,
  UK_DATA_SOURCES,
} from './registry';
import type { UkDataAdapter } from './types';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

function firstSource(): UkDataAdapter<unknown> {
  const source = UK_DATA_SOURCES[0];
  if (source === undefined) {
    throw new Error('expected at least one registered source');
  }
  return source;
}

/** Answers each registered source with its own committed fixture. */
function fixtureFetchImpl(): typeof globalThis.fetch {
  const fetchFixture = async (input: string | URL | Request): Promise<Response> => {
    const target =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(target).hostname === 'api.beta.ons.gov.uk') {
      return jsonResponse(readFixtureJson('ons-datasets.json'));
    }
    if (target.includes('/readings')) {
      return jsonResponse(readFixtureJson('flood-station-readings.json'));
    }
    return jsonResponse(readFixtureJson('flood-stations.json'));
  };
  return vi.fn(fetchFixture);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registry', () => {
  it('registers the Environment Agency and ONS adapters', () => {
    expect(UK_DATA_SOURCES.map((source) => source.id)).toEqual([
      'flood-stations',
      'flood-readings',
      'ons-datasets',
    ]);
  });

  it('looks up a source adapter by id', () => {
    expect(getUkDataSource('flood-readings')?.name).toContain('Environment Agency');
    expect(getUkDataSource('ons-datasets')?.name).toContain('Office for National Statistics');
    expect(getUkDataSource('does-not-exist')).toBeUndefined();
  });

  it('probes a source with a live fetch and reports ok', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(readFixtureJson('flood-stations.json')));
    vi.stubGlobal('fetch', fetchImpl);
    const probe = await probeUkDataSource(firstSource());
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe('ok');
    expect(probe.sample).toContain('notation');
  });

  it('reports a failed probe without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 }))
    );
    const probe = await probeUkDataSource(firstSource());
    expect(probe.ok).toBe(false);
    expect(probe.status).toContain('HTTP 500');
  });

  it('probes every registered source', async () => {
    vi.stubGlobal('fetch', fixtureFetchImpl());
    const probes = await probeAllUkDataSources();
    expect(probes).toHaveLength(UK_DATA_SOURCES.length);
    expect(probes.every((probe) => probe.ok)).toBe(true);
  });
});
