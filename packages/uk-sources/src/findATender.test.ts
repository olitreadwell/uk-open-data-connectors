import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchFindATenderReleases,
  FIND_A_TENDER_SOURCE_ID,
  findATenderAdapter,
  parseFindATenderReleases,
  summarizeFindATenderReleases,
} from './findATender.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const RELEASES_FIXTURE = readFixtureJson('find-a-tender-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseFindATenderReleases', () => {
  it('parses the committed OCDS release package', () => {
    const page = parseFindATenderReleases(RELEASES_FIXTURE);
    expect(page.version).toBe('1.1');
    expect(page.uri).toContain('ocdsReleasePackages');
    expect(page.releases).toHaveLength(10);
    const first = page.releases[0];
    expect(first?.ocid).toBe('ocds-h6vhtk-061392');
    expect(first?.id).toBe('093691-2026');
    expect(first?.tags).toEqual(['award', 'contract']);
    expect(first?.tenderStatus).toBe('complete');
    expect(first?.procurementMethod).toBe('open');
    expect(first?.buyerName).toBe('Velindre University NHS Trust');
    expect(first?.tenderTitle.length).toBeGreaterThan(0);
  });

  it('turns an absent tender into empty fields', () => {
    const page = parseFindATenderReleases({
      uri: 'u',
      version: '1.1',
      publishedDate: '2026-10-05T00:00:00+01:00',
      releases: [{ ocid: 'a', id: 'b', date: '2026-10-05T00:00:00+01:00' }],
    });
    expect(page.releases[0]).toMatchObject({
      tags: [],
      tenderTitle: '',
      tenderStatus: '',
      procurementMethod: '',
      buyerName: '',
      tenderValueAmount: null,
    });
  });

  it('rejects a payload without releases', () => {
    expect(() => parseFindATenderReleases({ version: '1.1' })).toThrow(UkSourceParseError);
  });
});

describe('summarizeFindATenderReleases', () => {
  it('counts the page by tender status', () => {
    expect(summarizeFindATenderReleases(parseFindATenderReleases(RELEASES_FIXTURE))).toEqual({
      releaseCount: 10,
      unsetStatusCount: 1,
      statusCounts: [
        { status: 'complete', releaseCount: 7 },
        { status: 'active', releaseCount: 2 },
      ],
    });
  });
});

describe('fetchFindATenderReleases', () => {
  it('fetches and parses the release packages', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(RELEASES_FIXTURE));
    });
    const page = await fetchFindATenderReleases({ limit: 10, fetchImpl });
    expect(page.releases).toHaveLength(10);
    expect(requestedUrls[0]).toContain('ocdsReleasePackages?limit=10');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchFindATenderReleases({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('findATenderAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(findATenderAdapter.id).toBe(FIND_A_TENDER_SOURCE_ID);
    expect(findATenderAdapter.auth).toBe('none');
    expect(findATenderAdapter.loadFixture().releases).toHaveLength(10);
  });
});
