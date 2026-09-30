import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANCIENT_WOODLAND_SIZE_BANDS } from './ancientWoodland';
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

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
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
    if (new URL(target).hostname === 'api.ratings.food.gov.uk') {
      return jsonResponse(readFixtureJson('food-hygiene-authorities.json'));
    }
    if (new URL(target).hostname === 'api.tfl.gov.uk') {
      return jsonResponse(readFixtureJson('tfl-bike-points.json'));
    }
    if (new URL(target).hostname === 'www.planning.data.gov.uk') {
      return jsonResponse(readFixtureJson('planning-datasets.json'));
    }
    if (new URL(target).hostname === 'www.bankofengland.co.uk') {
      return new Response(readFixtureText('bank-rate.csv'), { status: 200 });
    }
    if (new URL(target).hostname === 'services.arcgis.com') {
      return jsonResponse(ancientWoodlandResponse(new URL(target)));
    }
    if (new URL(target).hostname === 'api.carbonintensity.org.uk') {
      return jsonResponse(readFixtureJson('carbon-intensity.json'));
    }
    if (new URL(target).hostname === 'data.police.uk') {
      return jsonResponse(policeResponse(new URL(target)));
    }
    if (target.includes('/readings')) {
      return jsonResponse(readFixtureJson('flood-station-readings.json'));
    }
    return jsonResponse(readFixtureJson('flood-stations.json'));
  };
  return vi.fn(fetchFixture);
}

/** Answers one ancient woodland statistics query from the fixture bundle. */
function ancientWoodlandResponse(url: URL): unknown {
  const fixture = readFixtureJson('ancient-woodland.json') as {
    totals: unknown;
    categoryTotals: unknown;
    sizeBandCounts: unknown[];
  };
  const grouped = url.searchParams.get('groupByFieldsForStatistics');
  if (grouped === null) {
    return fixture.totals;
  }
  const where = url.searchParams.get('where');
  if (where === '1=1') {
    return fixture.categoryTotals;
  }
  const bandIndex = ANCIENT_WOODLAND_SIZE_BANDS.findIndex((band) => band.where === where);
  return fixture.sizeBandCounts[bandIndex];
}

/** Answers one police.uk call from the recorded crime fixture bundle. */
function policeResponse(url: URL): unknown {
  const fixture = readFixtureJson('police-crimes.json') as {
    categories: unknown;
    months: { month: string; records: unknown }[];
  };
  if (url.pathname.endsWith('/crime-categories')) {
    return fixture.categories;
  }
  if (url.pathname.endsWith('/crimes-street-dates')) {
    return fixture.months.map((month) => ({ date: month.month }));
  }
  const month = url.searchParams.get('date');
  return fixture.months.find((entry) => entry.month === month)?.records ?? [];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registry', () => {
  it('registers every UK source adapter', () => {
    expect(UK_DATA_SOURCES.map((source) => source.id)).toEqual([
      'flood-stations',
      'flood-readings',
      'ons-datasets',
      'food-hygiene-authorities',
      'tfl-bike-points',
      'planning-datasets',
      'ancient-woodland',
      'bank-rate',
      'police-crimes',
      'carbon-intensity',
    ]);
  });

  it('looks up a source adapter by id', () => {
    expect(getUkDataSource('flood-readings')?.name).toContain('Environment Agency');
    expect(getUkDataSource('ons-datasets')?.name).toContain('Office for National Statistics');
    expect(getUkDataSource('food-hygiene-authorities')?.name).toContain('Food Standards Agency');
    expect(getUkDataSource('tfl-bike-points')?.name).toContain('Transport for London');
    expect(getUkDataSource('planning-datasets')?.name).toContain('Ministry of Housing');
    expect(getUkDataSource('ancient-woodland')?.name).toContain('Natural England');
    expect(getUkDataSource('bank-rate')?.name).toContain('Bank of England');
    expect(getUkDataSource('police-crimes')?.name).toContain('Home Office');
    expect(getUkDataSource('carbon-intensity')?.name).toContain('National Energy System Operator');
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
