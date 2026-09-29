import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildCarbonIntensityWindowUrl,
  carbonIntensityAdapter,
  CARBON_INTENSITY_RANGE_URL,
  fetchCarbonIntensityWindow,
  formatCarbonIntensityInstant,
  parseCarbonIntensityWindow,
  resolveCarbonIntensityWindow,
  validateCarbonIntensityWindow,
} from './carbonIntensity';
import { UkSourceParseError } from './errors';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

/** One response period, in the shape the API writes it. */
function period(options: {
  from: string;
  to: string;
  actual: number | null;
  index?: string;
}): unknown {
  return {
    from: options.from,
    to: options.to,
    intensity: { forecast: 100, actual: options.actual, index: options.index ?? 'low' },
  };
}

/** Two whole days of readings, starting at midnight UTC. */
function twoDayPayload(): unknown {
  const data: unknown[] = [];
  const start = Date.parse('2026-09-01T00:00:00Z');
  for (let index = 0; index < 96; index += 1) {
    const from = new Date(start + index * 30 * 60 * 1000);
    data.push(
      period({
        from: formatCarbonIntensityInstant(from),
        to: formatCarbonIntensityInstant(new Date(from.getTime() + 30 * 60 * 1000)),
        actual: 100 + index,
      })
    );
  }
  return { data };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe('resolveCarbonIntensityWindow', () => {
  it('ends the default window at the start of today UTC', () => {
    expect(resolveCarbonIntensityWindow({ now: new Date('2026-09-29T21:41:00Z') })).toEqual({
      from: '2026-08-30T00:00Z',
      to: '2026-09-29T00:00Z',
    });
  });

  it('refuses a window the API would reject', () => {
    expect(() => resolveCarbonIntensityWindow({ windowDays: 31 })).toThrow(UkSourceParseError);
    expect(() => resolveCarbonIntensityWindow({ windowDays: 0 })).toThrow(UkSourceParseError);
    expect(() => resolveCarbonIntensityWindow({ windowDays: 1.5 })).toThrow(UkSourceParseError);
  });
});

describe('validateCarbonIntensityWindow', () => {
  it('accepts a window that starts and ends on the half hour', () => {
    expect(
      validateCarbonIntensityWindow({ from: '2026-08-30T00:00Z', to: '2026-09-29T00:00Z' })
    ).toEqual({ from: '2026-08-30T00:00Z', to: '2026-09-29T00:00Z' });
  });

  it('refuses a window that is not whole half hours', () => {
    expect(() =>
      validateCarbonIntensityWindow({ from: '2026-08-30T00:00Z', to: '2026-09-29T00:15Z' })
    ).toThrow(/not a whole number of half hours/);
  });

  it('refuses a window that runs past the limit', () => {
    expect(() =>
      validateCarbonIntensityWindow({ from: '2026-08-01T00:00Z', to: '2026-09-29T00:00Z' })
    ).toThrow(/longer than 30 days/);
  });

  it('refuses a window with no start or end, or one that runs backwards', () => {
    expect(() => validateCarbonIntensityWindow({ from: '2026-08-30T00:00Z' })).toThrow(
      /both a start and an end/
    );
    expect(() =>
      validateCarbonIntensityWindow({ from: '2026-09-29T00:00Z', to: '2026-08-30T00:00Z' })
    ).toThrow(/before it starts/);
    expect(() =>
      validateCarbonIntensityWindow({ from: 'yesterday', to: '2026-08-30T00:00Z' })
    ).toThrow(/expected instants/);
  });
});

describe('buildCarbonIntensityWindowUrl', () => {
  it('puts the window in the path', () => {
    expect(
      buildCarbonIntensityWindowUrl({ from: '2026-08-30T00:00Z', to: '2026-09-29T00:00Z' })
    ).toBe(`${CARBON_INTENSITY_RANGE_URL}/2026-08-30T00:00Z/2026-09-29T00:00Z`);
  });
});

describe('parseCarbonIntensityWindow', () => {
  it('counts the committed 30-day window', () => {
    const window = parseCarbonIntensityWindow(readFixtureJson('carbon-intensity.json'));
    expect(window.periodCount).toBe(1440);
    expect(window.dayCount).toBe(30);
    expect(window.firstPeriodFrom).toBe('2026-08-29T23:00Z');
    expect(window.lastPeriodTo).toBe('2026-09-28T23:00Z');
    expect(window.averageIntensity).toBe(108);
    expect(window.lowestPeriod.intensity).toBe(27);
    expect(window.highestPeriod.intensity).toBe(235);
    expect(window.bandCounts).toEqual([
      { index: 'very low', periodCount: 0 },
      { index: 'low', periodCount: 634 },
      { index: 'moderate', periodCount: 621 },
      { index: 'high', periodCount: 183 },
      { index: 'very high', periodCount: 2 },
    ]);
  });

  it('keeps the readings oldest first', () => {
    const window = parseCarbonIntensityWindow(twoDayPayload());
    expect(window.periodCount).toBe(96);
    expect(window.dayCount).toBe(2);
    expect(window.periods[0]?.from).toBe('2026-09-01T00:00Z');
    expect(window.periods.at(-1)?.to).toBe('2026-09-03T00:00Z');
    expect(window.lowestPeriod.intensity).toBe(100);
    expect(window.highestPeriod.intensity).toBe(195);
  });

  it('refuses a half hour with no settled reading', () => {
    expect(() =>
      parseCarbonIntensityWindow({
        data: [
          period({ from: '2026-09-01T00:00Z', to: '2026-09-01T00:30Z', actual: null }),
          period({ from: '2026-09-01T00:30Z', to: '2026-09-01T01:00Z', actual: 90 }),
        ],
      })
    ).toThrow(/carries no settled reading/);
  });

  it('refuses a grade the band list does not carry', () => {
    expect(() =>
      parseCarbonIntensityWindow({
        data: [
          period({
            from: '2026-09-01T00:00Z',
            to: '2026-09-01T00:30Z',
            actual: 90,
            index: 'extremely low',
          }),
        ],
      })
    ).toThrow(/unrecognised intensity grade/);
  });

  it('refuses a period that does not run for half an hour', () => {
    expect(() =>
      parseCarbonIntensityWindow({
        data: [period({ from: '2026-09-01T00:00Z', to: '2026-09-01T01:00Z', actual: 90 })],
      })
    ).toThrow(/runs for 60 minutes/);
  });

  it('refuses readings that do not move forwards', () => {
    const first = period({ from: '2026-09-01T00:00Z', to: '2026-09-01T00:30Z', actual: 90 });
    expect(() => parseCarbonIntensityWindow({ data: [first, first] })).toThrow(
      /do not move forwards/
    );
  });

  it('refuses a window with no readings', () => {
    expect(() => parseCarbonIntensityWindow({ data: [] })).toThrow(/returned no readings/);
  });
});

describe('fetchCarbonIntensityWindow', () => {
  it('asks for whole days and drops the half hour that ends at the window start', async () => {
    const payload = {
      data: [
        period({ from: '2026-08-31T23:30Z', to: '2026-09-01T00:00Z', actual: 120 }),
        period({ from: '2026-09-01T00:00Z', to: '2026-09-01T00:30Z', actual: 121 }),
        period({ from: '2026-09-01T00:30Z', to: '2026-09-01T01:00Z', actual: 122 }),
      ],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const window = await fetchCarbonIntensityWindow({
      windowDays: 1,
      now: new Date('2026-09-02T09:00:00Z'),
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${CARBON_INTENSITY_RANGE_URL}/2026-09-01T00:00Z/2026-09-02T00:00Z`,
      { headers: { accept: 'application/json' } }
    );
    expect(window.periodCount).toBe(2);
    expect(window.firstPeriodFrom).toBe('2026-09-01T00:00Z');
  });

  it('reads an explicit window instead of a whole number of days', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    await expect(
      fetchCarbonIntensityWindow({
        from: '2026-08-30T00:00Z',
        to: '2026-08-30T01:15Z',
        fetchImpl,
      })
    ).rejects.toThrow(/not a whole number of half hours/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports an HTTP failure as a source error', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchCarbonIntensityWindow({ fetchImpl })).rejects.toThrow(/HTTP 503/);
  });
});

describe('carbonIntensityAdapter', () => {
  it('loads the committed window for offline builds', () => {
    expect(carbonIntensityAdapter.loadFixture().periodCount).toBe(1440);
  });

  it('parses a payload through the adapter', () => {
    expect(carbonIntensityAdapter.parse(twoDayPayload()).dayCount).toBe(2);
  });

  it('reads live through the supplied fetch implementation', async () => {
    // The default window ends at the start of today, so it trims a reading or
    // two from either end of the committed snapshot. The count is a range
    // rather than a number for that reason.
    const fetchImpl = vi.fn(async () => jsonResponse(readFixtureJson('carbon-intensity.json')));
    const window = await carbonIntensityAdapter.fetchLive({ fetchImpl });
    expect(window.periodCount).toBeGreaterThan(1400);
    expect(window.periods[0]?.from).toBe('2026-08-30T00:00Z');
  });
});
