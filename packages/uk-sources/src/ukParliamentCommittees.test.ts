import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildUkParliamentCommitteeUrl,
  fetchUkParliamentCommittees,
  parseUkParliamentCommittees,
  UK_PARLIAMENT_COMMITTEE_ENTITY,
  UK_PARLIAMENT_COMMITTEE_SOURCE_ID,
  UK_PARLIAMENT_ODATA_BASE_URL,
  ukParliamentCommitteesAdapter,
} from './ukParliamentCommittees.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const COMMITTEES_FIXTURE = readFixtureJson('uk-parliament-committees-2026-11-08.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUkParliamentCommitteeUrl', () => {
  it('asks for a named page of committees ordered by name', () => {
    const url = new URL(buildUkParliamentCommitteeUrl({ limit: 20 }));

    expect(url.origin + url.pathname).toBe(
      `${UK_PARLIAMENT_ODATA_BASE_URL}/${UK_PARLIAMENT_COMMITTEE_ENTITY}`
    );
    expect(url.searchParams.get('$top')).toBe('20');
    expect(url.searchParams.get('$orderby')).toBe('FormalBodyName');
    expect(url.searchParams.has('$skip')).toBe(false);
  });

  it('adds an offset when the caller asks for a later page', () => {
    const url = new URL(buildUkParliamentCommitteeUrl({ limit: 5, offset: 10 }));

    expect(url.searchParams.get('$top')).toBe('5');
    expect(url.searchParams.get('$skip')).toBe('10');
  });

  it('rejects a non-positive page size', () => {
    expect(() => buildUkParliamentCommitteeUrl({ limit: 0 })).toThrow(RangeError);
  });
});

describe('parseUkParliamentCommittees', () => {
  it('parses the committed committee page', () => {
    const page = parseUkParliamentCommittees(COMMITTEES_FIXTURE);

    expect(page.committees).toHaveLength(20);
    expect(page.currentCount).toBe(10);
    expect(page.endedCount).toBe(10);
    expect(page.committees[0]).toEqual({
      localId: '0RLkImU2',
      name: 'Accomodation & Works',
      remit: null,
      mnisId: '1',
      startDate: '1900-01-01T00:00:00Z',
      endDate: '2010-05-06T00:00:00+01:00',
      isCurrent: false,
    });
    expect(page.committees[19]?.name).toBe('Consolidation etc. Bills (Joint Committee)');
  });

  it('turns an absent remit and member id into nulls', () => {
    const page = parseUkParliamentCommittees({
      value: [
        {
          LocalId: 'abc123',
          FormalBodyName: 'Example Committee',
          FormalBodyStartDate: '2026-01-01T00:00:00Z',
          FormalBodyEndDate: null,
        },
      ],
    });

    expect(page.committees[0]).toMatchObject({ remit: null, mnisId: null, isCurrent: true });
  });

  it('rejects a payload without a committee list', () => {
    expect(() => parseUkParliamentCommittees({ value: null })).toThrow(UkSourceParseError);
  });

  it('rejects a committee without an id or name', () => {
    expect(() => parseUkParliamentCommittees({ value: [{ FormalBodyName: 'No id' }] })).toThrow(
      UkSourceParseError
    );
    expect(() => parseUkParliamentCommittees({ value: [{ LocalId: 'abc' }] })).toThrow(
      UkSourceParseError
    );
  });

  it('rejects the same committee listed twice', () => {
    const row = {
      LocalId: 'abc123',
      FormalBodyName: 'Example Committee',
      FormalBodyStartDate: '2026-01-01T00:00:00Z',
      FormalBodyEndDate: null,
    };

    expect(() => parseUkParliamentCommittees({ value: [row, row] })).toThrow(/more than once/);
  });
});

describe('fetchUkParliamentCommittees', () => {
  it('fetches and parses a committee page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(COMMITTEES_FIXTURE));
    });

    const page = await fetchUkParliamentCommittees({ limit: 20, fetchImpl });

    expect(page.committees).toHaveLength(20);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('$top')).toBe('20');
    expect(requested.searchParams.get('$orderby')).toBe('FormalBodyName');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchUkParliamentCommittees({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('ukParliamentCommitteesAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(ukParliamentCommitteesAdapter.id).toBe(UK_PARLIAMENT_COMMITTEE_SOURCE_ID);
    expect(ukParliamentCommitteesAdapter.auth).toBe('none');
    expect(ukParliamentCommitteesAdapter.loadFixture().committees).toHaveLength(20);
  });
});
