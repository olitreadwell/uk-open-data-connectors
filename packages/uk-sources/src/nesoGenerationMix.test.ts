import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceParseError } from './errors.js';
import {
  buildNesoGenerationMixUrl,
  DEFAULT_NESO_GENERATION_MIX_HALF_HOURS,
  fetchNesoGenerationMixWindow,
  MAX_NESO_GENERATION_MIX_HALF_HOURS,
  NESO_DATASTORE_SEARCH_URL,
  NESO_GENERATION_FUELS,
  NESO_GENERATION_MIX_RESOURCE_ID,
  nesoGenerationMixAdapter,
  parseNesoGenerationMix,
} from './nesoGenerationMix.js';
import type { NesoGenerationFuel } from './nesoGenerationMix.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * One record shaped like the portal's. The fuel columns are the ones a caller
 * passes, gas and zero for the rest, and the row's total is their sum, so the
 * shares the summary works out are the shares this helper put in.
 */
function buildRecord(
  datetime: string,
  overrides: Partial<Record<NesoGenerationFuel, number>> & {
    carbonIntensity?: number;
    lowCarbon?: number;
  } = {}
): unknown {
  const { carbonIntensity = 120, lowCarbon = 18000, ...fuelOverrides } = overrides;
  const fuels = Object.fromEntries(
    NESO_GENERATION_FUELS.map((fuel) => [fuel, fuelOverrides[fuel] ?? (fuel === 'GAS' ? 1000 : 0)])
  );
  return {
    DATETIME: datetime,
    GENERATION: Object.values(fuels).reduce((sum, megawatts) => sum + megawatts, 0),
    CARBON_INTENSITY: carbonIntensity,
    LOW_CARBON: lowCarbon,
    ...fuels,
  };
}

/** A two-half-hour payload, newest first, the way the datastore answers. */
function buildPayload(records: unknown[]): unknown {
  return { success: true, result: { total: records.length, records } };
}

const WINDOW_FIXTURE = buildPayload([
  buildRecord('2026-10-17T01:00:00', {
    GAS: 5000,
    WIND: 3000,
    NUCLEAR: 4000,
    carbonIntensity: 90,
    lowCarbon: 7000,
  }),
  buildRecord('2026-10-17T00:30:00', {
    GAS: 9000,
    WIND: 1000,
    NUCLEAR: 4000,
    carbonIntensity: 150,
    lowCarbon: 5000,
  }),
]);

describe('parseNesoGenerationMix', () => {
  it('reads the committed generation mix fixture', () => {
    const window = nesoGenerationMixAdapter.loadFixture();
    expect(window.halfHourCount).toBe(336);
    expect(window.firstHalfHourAt).toBe('2026-10-10T16:30:00');
    expect(window.lastHalfHourAt).toBe('2026-10-17T16:00:00');
    expect(window.fuelShares).toHaveLength(NESO_GENERATION_FUELS.length);
    expect(window.averageTotalMegawatts).toBeGreaterThan(0);
  });

  it('orders the half hours oldest first, whatever order the datastore answers in', () => {
    const window = parseNesoGenerationMix(WINDOW_FIXTURE);
    expect(window.halfHours.map((halfHour) => halfHour.datetime)).toEqual([
      '2026-10-17T00:30:00',
      '2026-10-17T01:00:00',
    ]);
    expect(window.firstHalfHourAt).toBe('2026-10-17T00:30:00');
    expect(window.lastHalfHourAt).toBe('2026-10-17T01:00:00');
  });

  it('rolls the window up into fuel shares that add up to the total', () => {
    const window = parseNesoGenerationMix(WINDOW_FIXTURE);
    const shareTotal = window.fuelShares.reduce((sum, share) => sum + share.sharePercent, 0);
    expect(shareTotal).toBeCloseTo(100, 1);
    expect(window.fuelShares[0]?.fuel).toBe('GAS');
    expect(window.fuelShares[0]?.peakMegawatts).toBe(9000);
    expect(window.fuelShares[0]?.averageMegawatts).toBe(7000);
    expect(window.fuelShares[0]?.sharePercent).toBe(53.8);
    expect(window.fuelShares.slice(0, 3).map((share) => share.fuel)).toEqual([
      'GAS',
      'NUCLEAR',
      'WIND',
    ]);
    expect(window.averageTotalMegawatts).toBe(13000);
    expect(window.averageCarbonIntensity).toBe(120);
    expect(window.lowCarbonSharePercent).toBe(46.2);
  });

  it('picks the cleanest and dirtiest half hours by carbon intensity', () => {
    const window = parseNesoGenerationMix(WINDOW_FIXTURE);
    expect(window.cleanestHalfHour.datetime).toBe('2026-10-17T01:00:00');
    expect(window.dirtiestHalfHour.datetime).toBe('2026-10-17T00:30:00');
  });

  it('rejects a payload the portal did not answer with', () => {
    expect(() => parseNesoGenerationMix({ success: true, result: { records: [] } })).toThrow(
      UkSourceParseError
    );
    expect(() => parseNesoGenerationMix({ success: false })).toThrow(UkSourceParseError);
  });

  it('rejects a datetime that is not on a half-hour boundary', () => {
    expect(() =>
      parseNesoGenerationMix(buildPayload([buildRecord('2026-10-17T00:31:00')]))
    ).toThrow(UkSourceParseError);
  });

  it('rejects two rows for the same half hour', () => {
    expect(() =>
      parseNesoGenerationMix(
        buildPayload([buildRecord('2026-10-17T00:30:00'), buildRecord('2026-10-17T00:30:00')])
      )
    ).toThrow(/two rows/);
  });

  it('rejects a window with a half hour missing', () => {
    expect(() =>
      parseNesoGenerationMix(
        buildPayload([buildRecord('2026-10-17T02:00:00'), buildRecord('2026-10-17T00:30:00')])
      )
    ).toThrow(/jump/);
  });

  it('rejects a half hour that generated nothing', () => {
    const record = buildRecord('2026-10-17T00:30:00') as Record<string, unknown>;
    expect(() => parseNesoGenerationMix(buildPayload([{ ...record, GENERATION: 0 }]))).toThrow(
      /generated 0 MW/
    );
  });

  it('rejects a half hour with no carbon intensity', () => {
    const record = buildRecord('2026-10-17T00:30:00') as Record<string, unknown>;
    expect(() =>
      parseNesoGenerationMix(buildPayload([{ ...record, CARBON_INTENSITY: 0 }]))
    ).toThrow(/carbon intensity/);
  });

  it('rejects a fuel column the portal left out', () => {
    const record = buildRecord('2026-10-17T00:30:00') as Record<string, unknown>;
    delete record.WIND_EMB;
    expect(() => parseNesoGenerationMix(buildPayload([record]))).toThrow(UkSourceParseError);
  });
});

describe('buildNesoGenerationMixUrl', () => {
  it('asks the datastore for the newest half hours first', () => {
    const url = new URL(buildNesoGenerationMixUrl({ halfHours: 48 }));
    expect(`${url.origin}${url.pathname}`).toBe(NESO_DATASTORE_SEARCH_URL);
    expect(url.searchParams.get('resource_id')).toBe(NESO_GENERATION_MIX_RESOURCE_ID);
    expect(url.searchParams.get('sort')).toBe('DATETIME desc');
    expect(url.searchParams.get('limit')).toBe('48');
  });

  it('defaults to a week of half hours', () => {
    expect(buildNesoGenerationMixUrl()).toContain(
      `limit=${String(DEFAULT_NESO_GENERATION_MIX_HALF_HOURS)}`
    );
  });

  it('refuses a window that is not a whole number of half hours', () => {
    expect(() => buildNesoGenerationMixUrl({ halfHours: 0 })).toThrow(UkSourceParseError);
    expect(() => buildNesoGenerationMixUrl({ halfHours: 1.5 })).toThrow(UkSourceParseError);
  });

  it('refuses a window longer than the adapter reads', () => {
    expect(() =>
      buildNesoGenerationMixUrl({ halfHours: MAX_NESO_GENERATION_MIX_HALF_HOURS + 1 })
    ).toThrow(/at most/);
  });
});

describe('fetchNesoGenerationMixWindow', () => {
  it('reads the portal with no key and parses what comes back', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(WINDOW_FIXTURE));
    });

    const window = await fetchNesoGenerationMixWindow({ halfHours: 2, fetchImpl });

    expect(requestedUrls[0]).toContain(NESO_DATASTORE_SEARCH_URL);
    expect(requestedUrls[0]).not.toContain('api_key');
    expect(window.halfHourCount).toBe(2);
  });
});
