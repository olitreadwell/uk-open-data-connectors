import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bankRateAdapter,
  BANK_RATE_SERIES_CODE,
  buildBankRateCsvUrl,
  buildBankRateSpells,
  fetchBankRateObservations,
  formatBankRateQueryDate,
  parseBankRateCsv,
  summarizeBankRateSeries,
} from './bankRate';
import { UkSourceApiError, UkSourceParseError } from './errors';

/** One CSV body in the shape the database returns. */
function csvFor(rows: string[]): string {
  return ['DATE,IUDBEDR', ...rows].join('\r\n') + '\r\n';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatBankRateQueryDate', () => {
  it('formats a day the way an IADB query string wants it', () => {
    expect(formatBankRateQueryDate(new Date('2026-09-28T00:00:00Z'))).toBe('28/Sep/2026');
    expect(formatBankRateQueryDate(new Date('1975-01-02T12:00:00Z'))).toBe('02/Jan/1975');
  });
});

describe('buildBankRateCsvUrl', () => {
  it('asks for the whole series up to the given day', () => {
    const url = new URL(buildBankRateCsvUrl('28/Sep/2026'));
    expect(url.hostname).toBe('www.bankofengland.co.uk');
    expect(url.searchParams.get('SeriesCodes')).toBe(BANK_RATE_SERIES_CODE);
    expect(url.searchParams.get('Datefrom')).toBe('02/Jan/1975');
    expect(url.searchParams.get('Dateto')).toBe('28/Sep/2026');
    expect(url.searchParams.get('csv.x')).toBe('yes');
  });
});

describe('parseBankRateCsv', () => {
  it('parses the committed fixture into daily readings', () => {
    const observations = bankRateAdapter.loadFixture();
    expect(observations).toHaveLength(13077);
    expect(observations[0]).toEqual({ date: '1975-01-02', ratePercent: 11.5 });
    expect(observations.at(-1)?.date).toBe('2026-09-24');
    expect(observations.at(-1)?.ratePercent).toBe(3.75);
  });

  it('reads the date and the rate out of each row', () => {
    const observations = parseBankRateCsv(
      csvFor(['02 Jan 1975,11.5', '03 Jan 1975,11.5', '06 Jan 1975,12'])
    );
    expect(observations).toEqual([
      { date: '1975-01-02', ratePercent: 11.5 },
      { date: '1975-01-03', ratePercent: 11.5 },
      { date: '1975-01-06', ratePercent: 12 },
    ]);
  });

  it('rejects a body that is not the Bank Rate series', () => {
    expect(() => parseBankRateCsv('DATE,IUDBEDR,OTHER\r\n')).toThrow(UkSourceParseError);
    expect(() => parseBankRateCsv('"<html>"')).toThrow(/does not name/);
  });

  it('rejects a row that is not a date and a rate', () => {
    expect(() => parseBankRateCsv(csvFor(['02 Jan 1975,11.5,extra']))).toThrow(/date and a rate/);
  });

  it('rejects a date it cannot read', () => {
    expect(() => parseBankRateCsv(csvFor(['02 January 1975,11.5']))).toThrow(/database date/);
    expect(() => parseBankRateCsv(csvFor(['2 Jan 197x,11.5']))).toThrow(/database date/);
  });

  it('rejects a row with no rate rather than reading it as zero', () => {
    expect(() => parseBankRateCsv(csvFor(['02 Jan 1975,']))).toThrow(/carries no rate/);
    expect(() => parseBankRateCsv(csvFor(['02 Jan 1975,steady']))).toThrow(/carries no rate/);
  });

  it('rejects a body whose dates run backwards or repeat', () => {
    expect(() => parseBankRateCsv(csvFor(['02 Jan 1975,11.5', '02 Jan 1975,11.5']))).toThrow(
      /does not follow/
    );
    expect(() => parseBankRateCsv(csvFor(['06 Jan 1975,11.5', '02 Jan 1975,11.5']))).toThrow(
      /does not follow/
    );
  });

  it('rejects a body with no readings', () => {
    expect(() => parseBankRateCsv('DATE,IUDBEDR\r\n')).toThrow(/no readings/);
  });
});

describe('buildBankRateSpells', () => {
  it('collapses consecutive readings at one level into a single spell', () => {
    const spells = buildBankRateSpells(
      parseBankRateCsv(csvFor(['02 Jan 1975,11.5', '03 Jan 1975,11.5', '06 Jan 1975,12']))
    );
    expect(spells).toEqual([
      { startDate: '1975-01-02', endDate: '1975-01-03', ratePercent: 11.5, dayCount: 2 },
      { startDate: '1975-01-06', endDate: '1975-01-06', ratePercent: 12, dayCount: 1 },
    ]);
  });

  it('counts calendar days across a weekend gap, both ends included', () => {
    const spells = buildBankRateSpells(
      parseBankRateCsv(csvFor(['02 Jan 1975,11.5', '06 Jan 1975,11.5']))
    );
    expect(spells[0]?.dayCount).toBe(5);
  });
});

describe('summarizeBankRateSeries', () => {
  it('summarises the committed fixture', () => {
    const summary = summarizeBankRateSeries(bankRateAdapter.loadFixture());
    expect(summary.observationCount).toBe(13077);
    expect(summary.changeCount).toBe(258);
    expect(summary.levelCount).toBe(114);
    expect(summary.firstObservation.date).toBe('1975-01-02');
    expect(summary.latestObservation.date).toBe('2026-09-24');
  });

  it('finds the highest, lowest, and longest spell in the fixture', () => {
    const summary = summarizeBankRateSeries(bankRateAdapter.loadFixture());
    expect(summary.highestSpell).toEqual({
      startDate: '1979-11-15',
      endDate: '1980-07-02',
      ratePercent: 17,
      dayCount: 231,
    });
    expect(summary.lowestSpell.ratePercent).toBe(0.1);
    expect(summary.lowestSpell.startDate).toBe('2020-03-19');
    expect(summary.longestSpell).toEqual({
      startDate: '2009-03-05',
      endDate: '2016-08-03',
      ratePercent: 0.5,
      dayCount: 2709,
    });
  });

  it('keeps the spell list in date order', () => {
    const { spells } = summarizeBankRateSeries(bankRateAdapter.loadFixture());
    expect(spells).toHaveLength(259);
    expect(spells[0]?.startDate).toBe('1975-01-02');
    expect(spells.at(-1)?.ratePercent).toBe(3.75);
  });

  it('rejects an empty series', () => {
    expect(() => summarizeBankRateSeries([])).toThrow(UkSourceParseError);
  });
});

describe('fetchBankRateObservations', () => {
  const NOW = new Date('2026-09-28T06:00:00Z');

  it('asks the database for the series up to today', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(csvFor(['02 Jan 1975,11.5']));
    });
    const observations = await fetchBankRateObservations({ fetchImpl, now: NOW });
    expect(observations).toEqual([{ date: '1975-01-02', ratePercent: 11.5 }]);
    expect(requestedUrls).toHaveLength(1);
    const calledUrl = new URL(String(requestedUrls[0]));
    expect(calledUrl.searchParams.get('Dateto')).toBe('28/Sep/2026');
  });

  it('throws when the database answers with an error status', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }));
    await expect(fetchBankRateObservations({ fetchImpl, now: NOW })).rejects.toThrow(
      UkSourceApiError
    );
  });

  it('throws when the database answers with its error page instead of a CSV', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>ErrorPage</html>'));
    await expect(fetchBankRateObservations({ fetchImpl, now: NOW })).rejects.toThrow(
      UkSourceParseError
    );
  });
});

describe('bankRateAdapter', () => {
  it('describes the source it wraps', () => {
    expect(bankRateAdapter.id).toBe('bank-rate');
    expect(bankRateAdapter.name).toContain('Bank of England');
    expect(bankRateAdapter.auth).toBe('none');
  });

  it('parses the payload it is handed', () => {
    expect(bankRateAdapter.parse(csvFor(['02 Jan 1975,11.5']))).toEqual([
      { date: '1975-01-02', ratePercent: 11.5 },
    ]);
  });
});
