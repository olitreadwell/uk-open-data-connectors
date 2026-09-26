import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANCIENT_WOODLAND_SIZE_BANDS,
  ANCIENT_WOODLAND_SOURCE_ID,
  ancientWoodlandAdapter,
  fetchAncientWoodlandProfile,
  parseAncientWoodlandProfile,
} from './ancientWoodland.js';
import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';

const FIXTURE = readFixtureJson('ancient-woodland.json');

/** A responses bundle with one band's counts replaced. */
function withBandCounts(
  bundle: Record<string, unknown>,
  bandIndex: number,
  counts: { recordCount: number; hectares: number; STATUS: string }[]
): Record<string, unknown> {
  const sizeBandCounts = [...(bundle.sizeBandCounts as unknown[])];
  sizeBandCounts[bandIndex] = {
    features: counts.map((attributes) => ({ attributes })),
  };
  return { ...bundle, sizeBandCounts };
}

/** An ArcGIS statistics response with a single row. */
function statisticsResponse(attributes: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ features: [{ attributes }] }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseAncientWoodlandProfile', () => {
  it('reads the layer totals out of the committed fixture', () => {
    const profile = parseAncientWoodlandProfile(FIXTURE);
    expect(profile.recordCount).toBeGreaterThan(50_000);
    expect(profile.totalHectares).toBeGreaterThan(300_000);
    expect(profile.largestRecordHectares).toBeLessThan(profile.totalHectares);
    expect(profile.averageRecordHectares).toBeGreaterThan(0);
  });

  it('counts every record into a size band', () => {
    const profile = parseAncientWoodlandProfile(FIXTURE);
    const bandTotal = profile.sizeBands.reduce((total, band) => total + band.recordCount, 0);
    expect(bandTotal).toBe(profile.recordCount);
    expect(profile.sizeBands).toHaveLength(ANCIENT_WOODLAND_SIZE_BANDS.length);
  });

  it('counts every record into a woodland type', () => {
    const profile = parseAncientWoodlandProfile(FIXTURE);
    const categoryTotal = Object.values(profile.categoryCounts).reduce(
      (total, count) => total + count,
      0
    );
    expect(categoryTotal).toBe(profile.recordCount);
    expect(profile.categoryCounts.paws + profile.categoryCounts.asnw).toBeGreaterThan(
      profile.categoryCounts.awp
    );
  });

  it('keeps the woodland types behind each size band', () => {
    const profile = parseAncientWoodlandProfile(FIXTURE);
    for (const band of profile.sizeBands) {
      const categoryTotal = Object.values(band.categoryCounts).reduce(
        (total, count) => total + count,
        0
      );
      expect(categoryTotal).toBe(band.recordCount);
    }
  });

  it('throws when the bands do not add up to the layer total', () => {
    const tampered = withBandCounts(FIXTURE as Record<string, unknown>, 0, [
      { recordCount: 1, hectares: 10, STATUS: 'ASNW' },
    ]);
    expect(() => parseAncientWoodlandProfile(tampered)).toThrow(UkSourceParseError);
  });

  it('throws when a size band response is missing', () => {
    const bundle = { ...(FIXTURE as Record<string, unknown>), sizeBandCounts: [] };
    expect(() => parseAncientWoodlandProfile(bundle)).toThrow(UkSourceParseError);
  });

  it('throws on a woodland type the layer has not used before', () => {
    const tampered = withBandCounts(FIXTURE as Record<string, unknown>, 0, [
      { recordCount: 14_725, hectares: 5_000, STATUS: 'NEW' },
    ]);
    expect(() => parseAncientWoodlandProfile(tampered)).toThrow(UkSourceParseError);
  });

  it('throws on a payload that is not a statistics bundle', () => {
    expect(() => parseAncientWoodlandProfile({ datasets: [] })).toThrow(UkSourceParseError);
  });
});

describe('fetchAncientWoodlandProfile', () => {
  it('asks the layer once for the totals and once per size band', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url =
        input instanceof URL ? input : new URL(input instanceof Request ? input.url : input);
      const grouped = url.searchParams.get('groupByFieldsForStatistics');
      const where = url.searchParams.get('where');
      if (grouped !== null) {
        if (where === '1=1') {
          return statisticsResponse({ recordCount: 2, hectares: 3, STATUS: 'ASNW' });
        }
        const bandCount = where === 'AREA >= 100' ? 2 : 0;
        return new Response(
          JSON.stringify({
            features: [
              { attributes: { recordCount: bandCount, hectares: 3, STATUS: 'ASNW' } },
              { attributes: { recordCount: 0, hectares: 0, STATUS: 'PAWS' } },
              { attributes: { recordCount: 0, hectares: 0, STATUS: 'AWP' } },
            ],
          }),
          { status: 200 }
        );
      }
      return statisticsResponse({
        recordCount: 2,
        hectares: 3,
        largestHectares: 2,
        averageHectares: 1.5,
      });
    });

    const profile = await fetchAncientWoodlandProfile({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2 + ANCIENT_WOODLAND_SIZE_BANDS.length);
    expect(profile.recordCount).toBeGreaterThanOrEqual(0);
    expect(profile.categoryCounts.asnw).toBeGreaterThan(0);
  });

  it('throws an API error when the layer refuses the call', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchAncientWoodlandProfile({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });

  it('throws an API error when the layer answers with an error body', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid field' } }), { status: 200 })
    );
    await expect(fetchAncientWoodlandProfile({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('ancientWoodlandAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('the adapter should not fetch to load a fixture');
    });
    vi.stubGlobal('fetch', fetchImpl);
    const profile = ancientWoodlandAdapter.loadFixture();
    expect(profile.recordCount).toBeGreaterThan(50_000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('describes the source as Natural England, keyless', () => {
    expect(ancientWoodlandAdapter.id).toBe(ANCIENT_WOODLAND_SOURCE_ID);
    expect(ancientWoodlandAdapter.auth).toBe('none');
    expect(ancientWoodlandAdapter.name).toContain('Natural England');
  });
});
