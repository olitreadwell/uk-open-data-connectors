import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildTnaDiscoverySearchUrl,
  fetchTnaDiscoveryRecords,
  parseTnaDiscoveryRecords,
  summarizeTnaDiscoverySearch,
  TNA_DISCOVERY_SOURCE_ID,
  tnaDiscoveryAdapter,
} from './tnaDiscovery.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const SEARCH_FIXTURE = readFixtureJson('tna-discovery-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildTnaDiscoverySearchUrl', () => {
  it('encodes the query into the search URL', () => {
    expect(buildTnaDiscoverySearchUrl('parish register')).toBe(
      'https://discovery.nationalarchives.gov.uk/API/search/records?sps.searchQuery=parish%20register'
    );
  });
});

describe('parseTnaDiscoveryRecords', () => {
  it('parses the committed search response', () => {
    const result = parseTnaDiscoveryRecords(SEARCH_FIXTURE);
    expect(result.totalCount).toBe(140410);
    expect(result.records).toHaveLength(15);
    const first = result.records[0];
    expect(first?.id).toBe('b5c88a12-8e4c-4d56-933d-d1854fbb91a5');
    expect(first?.reference).toBe('NEWLAND TEST');
    expect(first?.title.length).toBeGreaterThan(0);
    expect(first?.coveringDates).toBe('1591-1787');
    expect(first?.catalogueLevel).toBe(1);
    expect(first?.heldBy).toEqual(['John Goodchild Collection']);
  });

  it('turns absent fields into empty strings', () => {
    const result = parseTnaDiscoveryRecords({
      count: 1,
      records: [{ id: 'abc' }],
    });
    expect(result.records[0]).toEqual({
      id: 'abc',
      reference: '',
      title: '',
      description: '',
      coveringDates: '',
      catalogueLevel: null,
      department: '',
      heldBy: [],
    });
  });

  it('rejects a payload without records', () => {
    expect(() => parseTnaDiscoveryRecords({ count: 0 })).toThrow(UkSourceParseError);
  });
});

describe('summarizeTnaDiscoverySearch', () => {
  it('reports the page size and the total hit count', () => {
    expect(summarizeTnaDiscoverySearch(parseTnaDiscoveryRecords(SEARCH_FIXTURE))).toEqual({
      recordCount: 15,
      totalCount: 140410,
    });
  });
});

describe('fetchTnaDiscoveryRecords', () => {
  it('searches with the JSON accept header', async () => {
    const requestedHeaders: Record<string, string>[] = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestedHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return new Response(JSON.stringify(SEARCH_FIXTURE));
    });
    const result = await fetchTnaDiscoveryRecords({ query: 'test', fetchImpl });
    expect(result.records).toHaveLength(15);
    expect(requestedHeaders[0]?.Accept).toBe('application/json');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 502 }));
    await expect(fetchTnaDiscoveryRecords({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('tnaDiscoveryAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(tnaDiscoveryAdapter.id).toBe(TNA_DISCOVERY_SOURCE_ID);
    expect(tnaDiscoveryAdapter.auth).toBe('none');
    expect(tnaDiscoveryAdapter.loadFixture().records).toHaveLength(15);
  });
});
