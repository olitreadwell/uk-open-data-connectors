import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors';
import {
  buildPoliceStreetCrimesUrl,
  fetchPoliceCrimeMonths,
  fetchPoliceCrimeSummary,
  parsePoliceCrimeSummary,
  policeCrimesAdapter,
  POLICE_STREET_CRIMES_URL,
} from './policeCrimes';

/** The two crime types every test here counts. */
const TEST_CATEGORIES = [
  { url: 'violent-crime', name: 'Violence and sexual offences' },
  { url: 'shoplifting', name: 'Shoplifting' },
];

/** One offence in the shape the API writes it. */
function crimeRecord(month: string, category: string, outcome?: string): unknown {
  return {
    month,
    category,
    ...(outcome === undefined ? {} : { outcome_status: { category: outcome } }),
  };
}

/** A responses bundle in the shape the parser takes. */
function responsesBundle(months: { month: string; records: unknown[] }[]): Record<string, unknown> {
  return { categories: TEST_CATEGORIES, months };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildPoliceStreetCrimesUrl', () => {
  it('asks for one month within a mile of a point', () => {
    const url = new URL(
      buildPoliceStreetCrimesUrl({ latitude: 53.7997, longitude: -1.5492, month: '2026-07' })
    );
    expect(url.origin + url.pathname).toBe(POLICE_STREET_CRIMES_URL);
    expect(url.searchParams.get('lat')).toBe('53.7997');
    expect(url.searchParams.get('lng')).toBe('-1.5492');
    expect(url.searchParams.get('date')).toBe('2026-07');
  });
});

describe('parsePoliceCrimeSummary', () => {
  it('reads the committed fixture into one month of counts', () => {
    const summary = policeCrimesAdapter.loadFixture();
    expect(summary.monthCount).toBe(1);
    expect(summary.recordCount).toBe(1417);
    expect(summary.firstMonth).toBe('2026-07');
    expect(summary.latestMonth).toBe('2026-07');
    expect(summary.topCategory).toEqual({
      slug: 'violent-crime',
      name: 'Violence and sexual offences',
      recordCount: 419,
    });
    expect(summary.categoryCounts[1]).toEqual({
      slug: 'shoplifting',
      name: 'Shoplifting',
      recordCount: 297,
    });
    expect(summary.categoryCounts).toHaveLength(14);
    expect(summary.months[0]?.recordCount).toBe(1417);
    expect(summary.busiestMonth.month).toBe('2026-07');
    expect(summary.quietestMonth.month).toBe('2026-07');
  });

  it('counts the most common outcome in the fixture', () => {
    const summary = policeCrimesAdapter.loadFixture();
    expect(summary.topOutcome).toEqual({ outcome: 'Under investigation', recordCount: 808 });
  });

  it('orders the months oldest first whatever order they arrive in', () => {
    const summary = parsePoliceCrimeSummary(
      responsesBundle([
        { month: '2026-07', records: [crimeRecord('2026-07', 'shoplifting')] },
        { month: '2026-06', records: [crimeRecord('2026-06', 'shoplifting')] },
        { month: '2026-05', records: [crimeRecord('2026-05', 'violent-crime')] },
      ])
    );
    expect(summary.months.map((month) => month.month)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(summary.firstMonth).toBe('2026-05');
    expect(summary.latestMonth).toBe('2026-07');
  });

  it('counts offences the API has no outcome for yet as their own bucket', () => {
    const summary = parsePoliceCrimeSummary(
      responsesBundle([
        {
          month: '2026-07',
          records: [
            crimeRecord('2026-07', 'shoplifting', 'Under investigation'),
            crimeRecord('2026-07', 'shoplifting'),
            crimeRecord('2026-07', 'violent-crime'),
          ],
        },
      ])
    );
    expect(summary.outcomeCounts).toEqual([
      { outcome: null, recordCount: 2 },
      { outcome: 'Under investigation', recordCount: 1 },
    ]);
  });

  it('counts a month against the crime types within it', () => {
    const summary = parsePoliceCrimeSummary(
      responsesBundle([
        {
          month: '2026-07',
          records: [
            crimeRecord('2026-07', 'shoplifting'),
            crimeRecord('2026-07', 'shoplifting'),
            crimeRecord('2026-07', 'violent-crime'),
          ],
        },
        { month: '2026-06', records: [crimeRecord('2026-06', 'violent-crime')] },
      ])
    );
    // Two records each, so the tie falls back to the crime type name.
    expect(summary.categoryCounts).toEqual([
      { slug: 'shoplifting', name: 'Shoplifting', recordCount: 2 },
      { slug: 'violent-crime', name: 'Violence and sexual offences', recordCount: 2 },
    ]);
    expect(summary.recordCount).toBe(4);
  });

  it('names the busiest and quietest month in the window', () => {
    const summary = parsePoliceCrimeSummary(
      responsesBundle([
        { month: '2026-07', records: [crimeRecord('2026-07', 'shoplifting')] },
        {
          month: '2026-06',
          records: [
            crimeRecord('2026-06', 'shoplifting'),
            crimeRecord('2026-06', 'violent-crime'),
            crimeRecord('2026-06', 'violent-crime'),
          ],
        },
      ])
    );
    expect(summary.busiestMonth.month).toBe('2026-06');
    expect(summary.busiestMonth.recordCount).toBe(3);
    expect(summary.quietestMonth.month).toBe('2026-07');
  });

  it('throws when a record is filed under a month other than its own', () => {
    expect(() =>
      parsePoliceCrimeSummary(
        responsesBundle([{ month: '2026-07', records: [crimeRecord('2026-06', 'shoplifting')] }])
      )
    ).toThrow(UkSourceParseError);
  });

  it('throws when a record carries a crime type the category list does not have', () => {
    expect(() =>
      parsePoliceCrimeSummary(
        responsesBundle([{ month: '2026-07', records: [crimeRecord('2026-07', 'arson')] }])
      )
    ).toThrow(/unrecognised crime type/);
  });

  it('throws when a month comes back empty', () => {
    expect(() =>
      parsePoliceCrimeSummary(
        responsesBundle([
          { month: '2026-07', records: [crimeRecord('2026-07', 'shoplifting')] },
          { month: '2026-06', records: [] },
        ])
      )
    ).toThrow(/no records for 2026-06/);
  });

  it('throws when the same month arrives twice', () => {
    expect(() =>
      parsePoliceCrimeSummary(
        responsesBundle([
          { month: '2026-07', records: [crimeRecord('2026-07', 'shoplifting')] },
          { month: '2026-07', records: [crimeRecord('2026-07', 'shoplifting')] },
        ])
      )
    ).toThrow(/two answers for 2026-07/);
  });

  it('throws when no month arrives at all', () => {
    expect(() => parsePoliceCrimeSummary(responsesBundle([]))).toThrow(/covers no months/);
  });

  it('throws when a month is not written as YYYY-MM', () => {
    expect(() =>
      parsePoliceCrimeSummary(
        responsesBundle([
          { month: 'July 2026', records: [crimeRecord('July 2026', 'shoplifting')] },
        ])
      )
    ).toThrow(UkSourceParseError);
  });

  it('throws when the payload is not the shape the API returns', () => {
    expect(() => parsePoliceCrimeSummary({ months: [] })).toThrow(UkSourceParseError);
  });
});

describe('fetchPoliceCrimeMonths', () => {
  it('lists the published months in the order the API gives them', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ date: '2026-07', 'stop-and-search': [] }, { date: '2026-06' }])
    );
    await expect(fetchPoliceCrimeMonths({ fetchImpl })).resolves.toEqual(['2026-07', '2026-06']);
  });

  it('throws when the API answers with an error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    await expect(fetchPoliceCrimeMonths({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });

  it('throws when the payload is not a list of months', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ months: ['2026-07'] }));
    await expect(fetchPoliceCrimeMonths({ fetchImpl })).rejects.toThrow(UkSourceParseError);
  });

  it('throws when the API lists no usable months', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ date: 'sometime' }]));
    await expect(fetchPoliceCrimeMonths({ fetchImpl })).rejects.toThrow(/no published months/);
  });
});

describe('fetchPoliceCrimeSummary', () => {
  /** Answers the three endpoints the window needs, one month at a time. */
  function windowFetchImpl(): ReturnType<typeof vi.fn> {
    return vi.fn(async (input: string | URL | Request) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(target);
      if (url.pathname.endsWith('/crimes-street-dates')) {
        return jsonResponse([{ date: '2026-07' }, { date: '2026-06' }, { date: '2026-05' }]);
      }
      if (url.pathname.endsWith('/crime-categories')) {
        return jsonResponse(TEST_CATEGORIES);
      }
      const month = url.searchParams.get('date') ?? '';
      return jsonResponse([crimeRecord(month, 'shoplifting')]);
    });
  }

  it('asks for the newest months one at a time', async () => {
    const fetchImpl = windowFetchImpl();
    const summary = await fetchPoliceCrimeSummary({
      latitude: 53.7997,
      longitude: -1.5492,
      monthCount: 2,
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });

    const crimeCalls = fetchImpl.mock.calls
      .map((call) => new URL(String(call[0])))
      .filter((url) => url.pathname.endsWith('/crimes-street/all-crime'))
      .map((url) => url.searchParams.get('date'));
    expect(crimeCalls).toEqual(['2026-07', '2026-06']);
    expect(summary.months.map((month) => month.month)).toEqual(['2026-06', '2026-07']);
    expect(summary.recordCount).toBe(2);
  });

  it('throws when a month in the window cannot be read', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      if (url.pathname.endsWith('/crimes-street-dates')) {
        return jsonResponse([{ date: '2026-07' }]);
      }
      if (url.pathname.endsWith('/crime-categories')) {
        return jsonResponse(TEST_CATEGORIES);
      }
      return jsonResponse({}, 500);
    });
    await expect(
      fetchPoliceCrimeSummary({
        monthCount: 1,
        fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow(/HTTP 500 reading 2026-07/);
  });

  it('throws when the crime type list cannot be read', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      if (url.pathname.endsWith('/crimes-street-dates')) {
        return jsonResponse([{ date: '2026-07' }]);
      }
      return jsonResponse({}, 500);
    });
    await expect(
      fetchPoliceCrimeSummary({
        monthCount: 1,
        fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow(/HTTP 500 listing the crime types/);
  });
});

describe('policeCrimesAdapter', () => {
  it('carries the source id the registry looks it up by', () => {
    expect(policeCrimesAdapter.id).toBe('police-crimes');
    expect(policeCrimesAdapter.auth).toBe('none');
  });

  it('fetches the window through the given fetch implementation', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      if (url.pathname.endsWith('/crimes-street-dates')) {
        return jsonResponse([{ date: '2026-07' }]);
      }
      if (url.pathname.endsWith('/crime-categories')) {
        return jsonResponse(TEST_CATEGORIES);
      }
      return jsonResponse([crimeRecord('2026-07', 'violent-crime')]);
    });
    const summary = await policeCrimesAdapter.fetchLive({
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });
    expect(summary.recordCount).toBe(1);
    expect(summary.topCategory.name).toBe('Violence and sexual offences');
  });
});
