import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchLondonDatastorePackages,
  LONDON_DATASTORE_SOURCE_ID,
  londonDatastoreAdapter,
  parseLondonDatastorePackages,
  summarizeLondonDatastorePackages,
} from './londonDatastore.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const PACKAGES_FIXTURE = readFixtureJson('london-datastore-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseLondonDatastorePackages', () => {
  it('parses the committed CKAN package list', () => {
    const packages = parseLondonDatastorePackages(PACKAGES_FIXTURE);
    expect(packages).toHaveLength(1305);
    expect(packages[0]?.name).toBe('emxgp');
  });

  it('rejects a payload without a result array', () => {
    expect(() => parseLondonDatastorePackages({ success: false, error: {} })).toThrow(
      UkSourceParseError
    );
  });
});

describe('summarizeLondonDatastorePackages', () => {
  it('counts the catalogue', () => {
    expect(
      summarizeLondonDatastorePackages(parseLondonDatastorePackages(PACKAGES_FIXTURE))
    ).toEqual({ packageCount: 1305 });
  });
});

describe('fetchLondonDatastorePackages', () => {
  it('fetches and parses the catalogue', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(PACKAGES_FIXTURE));
    });
    const packages = await fetchLondonDatastorePackages({ fetchImpl });
    expect(packages.length).toBeGreaterThan(0);
    expect(requestedUrls[0]).toContain('/api/3/action/package_list');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchLondonDatastorePackages({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('londonDatastoreAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(londonDatastoreAdapter.id).toBe(LONDON_DATASTORE_SOURCE_ID);
    expect(londonDatastoreAdapter.auth).toBe('none');
    expect(londonDatastoreAdapter.loadFixture().length).toBe(1305);
  });
});
