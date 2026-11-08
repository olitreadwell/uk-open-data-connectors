import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildElexonSystemPricesUrl,
  ELEXON_BMRS_API_BASE_URL,
  ELEXON_SYSTEM_PRICES_SOURCE_ID,
  elexonSystemPricesAdapter,
  fetchElexonSystemPrices,
  formatElexonSettlementDate,
  parseElexonSystemPrices,
} from './elexonSystemPrices.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const SYSTEM_PRICES_FIXTURE = readFixtureJson('elexon-system-prices-2026-11-08.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatElexonSettlementDate', () => {
  it('formats the UK settlement date', () => {
    expect(formatElexonSettlementDate(new Date('2026-11-08T12:00:00Z'))).toBe('2026-11-08');
  });

  it('uses the UK date after midnight UTC in summer', () => {
    expect(formatElexonSettlementDate(new Date('2026-07-05T23:30:00Z'))).toBe('2026-07-06');
  });
});

describe('buildElexonSystemPricesUrl', () => {
  it('builds the settlement-day system price URL', () => {
    expect(buildElexonSystemPricesUrl('2026-11-06')).toBe(
      `${ELEXON_BMRS_API_BASE_URL}/balancing/settlement/system-prices/2026-11-06`
    );
  });

  it('rejects a date in another format', () => {
    expect(() => buildElexonSystemPricesUrl('06/11/2026')).toThrow(RangeError);
  });

  it('rejects a date that is not on the calendar', () => {
    expect(() => buildElexonSystemPricesUrl('2026-02-31')).toThrow(RangeError);
  });
});

describe('parseElexonSystemPrices', () => {
  it('parses the committed settlement-day page', () => {
    const page = parseElexonSystemPrices(SYSTEM_PRICES_FIXTURE);

    expect(page.dataset).toBe('DISEBSP');
    expect(page.settlementDate).toBe('2026-11-06');
    expect(page.periods).toHaveLength(6);
    expect(page.periods[0]).toEqual({
      settlementPeriod: 1,
      startTime: '2026-11-06T00:00:00Z',
      createdDateTime: '2026-11-07T00:44:34Z',
      systemSellPrice: expect.closeTo(198.41, 12),
      systemBuyPrice: expect.closeTo(198.41, 12),
      priceDerivationCode: 'P',
      netImbalanceVolume: expect.closeTo(138.67324644459299, 12),
      totalAcceptedOfferVolume: expect.closeTo(695.083363366013, 12),
      totalAcceptedBidVolume: expect.closeTo(-656.6771702220736, 12),
    });
    expect(page.periods[5]?.settlementPeriod).toBe(6);
  });

  it('rejects a payload with no settlement periods', () => {
    expect(() =>
      parseElexonSystemPrices({ metadata: { datasets: ['DISEBSP'] }, data: [] })
    ).toThrow(UkSourceParseError);
  });

  it('rejects rows from more than one settlement day', () => {
    const payload = structuredClone(SYSTEM_PRICES_FIXTURE) as {
      data: { settlementDate: string }[];
    };
    payload.data[1] = { ...payload.data[1], settlementDate: '2026-11-07' };

    expect(() => parseElexonSystemPrices(payload)).toThrow(/more than one settlement date/);
  });

  it('rejects a repeated settlement period', () => {
    const payload = structuredClone(SYSTEM_PRICES_FIXTURE) as {
      data: { settlementPeriod: number }[];
    };
    payload.data[1] = { ...payload.data[1], settlementPeriod: 1 };

    expect(() => parseElexonSystemPrices(payload)).toThrow(/listed more than once/);
  });

  it('rejects a row without a numeric price', () => {
    expect(() =>
      parseElexonSystemPrices({
        metadata: { datasets: ['DISEBSP'] },
        data: [{ settlementDate: '2026-11-06', settlementPeriod: 1, systemSellPrice: 'nope' }],
      })
    ).toThrow(UkSourceParseError);
  });
});

describe('fetchElexonSystemPrices', () => {
  it('fetches and parses a settlement day', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(SYSTEM_PRICES_FIXTURE));
    });

    const page = await fetchElexonSystemPrices({ date: '2026-11-06', fetchImpl });

    expect(page.periods).toHaveLength(6);
    expect(requestedUrls).toEqual([
      `${ELEXON_BMRS_API_BASE_URL}/balancing/settlement/system-prices/2026-11-06`,
    ]);
  });

  it('defaults to yesterday in UK time across the autumn clock change', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(SYSTEM_PRICES_FIXTURE));
    });

    await fetchElexonSystemPrices({ now: new Date('2026-10-25T23:30:00Z'), fetchImpl });

    expect(requestedUrls).toEqual([
      `${ELEXON_BMRS_API_BASE_URL}/balancing/settlement/system-prices/2026-10-24`,
    ]);
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 }));

    await expect(fetchElexonSystemPrices({ date: '2026-11-06', fetchImpl })).rejects.toThrow(
      UkSourceApiError
    );
  });
});

describe('elexonSystemPricesAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(elexonSystemPricesAdapter.id).toBe(ELEXON_SYSTEM_PRICES_SOURCE_ID);
    expect(elexonSystemPricesAdapter.auth).toBe('none');
    expect(elexonSystemPricesAdapter.loadFixture().periods).toHaveLength(6);
  });
});
