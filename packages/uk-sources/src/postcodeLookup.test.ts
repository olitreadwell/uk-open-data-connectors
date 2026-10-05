import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildPostcodeLookupUrl,
  fetchPostcodeLookup,
  parsePostcodeLookup,
  POSTCODE_LOOKUP_SOURCE_ID,
  postcodeLookupAdapter,
} from './postcodeLookup.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const POSTCODE_FIXTURE = readFixtureJson('postcode-lookup-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildPostcodeLookupUrl', () => {
  it('encodes the postcode into the lookup URL', () => {
    expect(buildPostcodeLookupUrl('SW1A 1AA')).toBe(
      'https://api.postcodes.io/postcodes/SW1A%201AA'
    );
  });
});

describe('parsePostcodeLookup', () => {
  it('parses the committed fixture', () => {
    const record = parsePostcodeLookup(POSTCODE_FIXTURE);
    expect(record.postcode).toBe('SW1A 1AA');
    expect(record.country).toBe('England');
    expect(record.region).toBe('London');
    expect(record.adminDistrict).toBe('Westminster');
    expect(record.adminWard).toBe("St James's");
    expect(record.parliamentaryConstituency).toBe('Cities of London and Westminster');
    expect(typeof record.latitude).toBe('number');
    expect(typeof record.longitude).toBe('number');
  });

  it('turns absent optional areas into nulls', () => {
    const record = parsePostcodeLookup({
      status: 200,
      result: { postcode: 'AB1 2CD', country: 'Scotland', latitude: 57.1, longitude: -2.1 },
    });
    expect(record.region).toBeNull();
    expect(record.adminDistrict).toBeNull();
    expect(record.nhsHa).toBeNull();
  });

  it('rejects a payload without a result', () => {
    expect(() => parsePostcodeLookup({ status: 404, error: 'Invalid postcode' })).toThrow(
      UkSourceParseError
    );
  });
});

describe('fetchPostcodeLookup', () => {
  it('fetches and parses one postcode', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(POSTCODE_FIXTURE));
    });
    const record = await fetchPostcodeLookup('SW1A 1AA', { fetchImpl });
    expect(record.postcode).toBe('SW1A 1AA');
    expect(requestedUrls[0]).toContain('/postcodes/SW1A%201AA');
  });

  it('throws an API error when the service rejects the postcode', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));
    await expect(fetchPostcodeLookup('ZZ1 1ZZ', { fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('postcodeLookupAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(postcodeLookupAdapter.id).toBe(POSTCODE_LOOKUP_SOURCE_ID);
    expect(postcodeLookupAdapter.auth).toBe('none');
    expect(postcodeLookupAdapter.loadFixture().postcode).toBe('SW1A 1AA');
  });
});
