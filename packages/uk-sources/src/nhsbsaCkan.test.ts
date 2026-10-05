import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchNhsbsaCkanPackages,
  NHSBSA_CKAN_SOURCE_ID,
  nhsbsaCkanAdapter,
  parseNhsbsaCkanPackages,
  summarizeNhsbsaCkanPackages,
} from './nhsbsaCkan.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const PACKAGES_FIXTURE = readFixtureJson('nhsbsa-ckan-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseNhsbsaCkanPackages', () => {
  it('parses the committed CKAN package list', () => {
    const datasets = parseNhsbsaCkanPackages(PACKAGES_FIXTURE);
    expect(datasets).toHaveLength(2172);
    expect(datasets[0]?.name).toBe('03449');
  });

  it('rejects a payload without a result array', () => {
    expect(() => parseNhsbsaCkanPackages({ success: false })).toThrow(UkSourceParseError);
  });
});

describe('summarizeNhsbsaCkanPackages', () => {
  it('counts the catalogue', () => {
    expect(summarizeNhsbsaCkanPackages(parseNhsbsaCkanPackages(PACKAGES_FIXTURE))).toEqual({
      packageCount: 2172,
    });
  });
});

describe('fetchNhsbsaCkanPackages', () => {
  it('fetches and parses the catalogue', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(PACKAGES_FIXTURE));
    });
    const datasets = await fetchNhsbsaCkanPackages({ fetchImpl });
    expect(datasets).toHaveLength(2172);
    expect(requestedUrls[0]).toContain('opendata.nhsbsa.net/api/3/action/package_list');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchNhsbsaCkanPackages({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('nhsbsaCkanAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(nhsbsaCkanAdapter.id).toBe(NHSBSA_CKAN_SOURCE_ID);
    expect(nhsbsaCkanAdapter.auth).toBe('none');
    expect(nhsbsaCkanAdapter.loadFixture()).toHaveLength(2172);
  });
});
