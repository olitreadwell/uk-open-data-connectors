import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchPublicHealthScotlandDatasets,
  parsePublicHealthScotlandDatasets,
  PUBLIC_HEALTH_SCOTLAND_SOURCE_ID,
  publicHealthScotlandAdapter,
  summarizePublicHealthScotlandDatasets,
} from './publicHealthScotland.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const PACKAGES_FIXTURE = readFixtureJson('public-health-scotland-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePublicHealthScotlandDatasets', () => {
  it('parses the committed CKAN package list', () => {
    const datasets = parsePublicHealthScotlandDatasets(PACKAGES_FIXTURE);
    expect(datasets).toHaveLength(105);
    expect(datasets[0]?.name).toBe('18-weeks-referral-to-treatment');
  });

  it('rejects a payload without a result array', () => {
    expect(() => parsePublicHealthScotlandDatasets({ success: false })).toThrow(UkSourceParseError);
  });
});

describe('summarizePublicHealthScotlandDatasets', () => {
  it('counts the catalogue', () => {
    expect(
      summarizePublicHealthScotlandDatasets(parsePublicHealthScotlandDatasets(PACKAGES_FIXTURE))
    ).toEqual({ packageCount: 105 });
  });
});

describe('fetchPublicHealthScotlandDatasets', () => {
  it('fetches and parses the catalogue', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(PACKAGES_FIXTURE));
    });
    const datasets = await fetchPublicHealthScotlandDatasets({ fetchImpl });
    expect(datasets).toHaveLength(105);
    expect(requestedUrls[0]).toContain('opendata.nhs.scot/api/3/action/package_list');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchPublicHealthScotlandDatasets({ fetchImpl })).rejects.toThrow(
      UkSourceApiError
    );
  });
});

describe('publicHealthScotlandAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(publicHealthScotlandAdapter.id).toBe(PUBLIC_HEALTH_SCOTLAND_SOURCE_ID);
    expect(publicHealthScotlandAdapter.auth).toBe('none');
    expect(publicHealthScotlandAdapter.loadFixture()).toHaveLength(105);
  });
});
