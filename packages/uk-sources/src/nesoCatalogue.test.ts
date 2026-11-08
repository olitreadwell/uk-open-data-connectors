import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import {
  buildNesoCatalogueUrl,
  DEFAULT_NESO_CATALOGUE_LIMIT,
  fetchNesoCatalogue,
  NESO_CATALOGUE_SEARCH_URL,
  NESO_CATALOGUE_SOURCE_ID,
  nesoCatalogueAdapter,
  parseNesoCatalogue,
} from './nesoCatalogue.js';

const CATALOGUE_FIXTURE = readFixtureJson('neso-catalogue-2026-11-08.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildNesoCatalogueUrl', () => {
  it('asks for the default page size', () => {
    const url = new URL(buildNesoCatalogueUrl());

    expect(url.origin + url.pathname).toBe(NESO_CATALOGUE_SEARCH_URL);
    expect(url.searchParams.get('rows')).toBe(String(DEFAULT_NESO_CATALOGUE_LIMIT));
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.has('start')).toBe(false);
  });

  it('encodes a query, page size, and start offset', () => {
    const url = new URL(buildNesoCatalogueUrl({ query: 'wind forecast', limit: 3, start: 6 }));

    expect(url.searchParams.get('q')).toBe('wind forecast');
    expect(url.searchParams.get('rows')).toBe('3');
    expect(url.searchParams.get('start')).toBe('6');
  });

  it('rejects a non-positive limit', () => {
    expect(() => buildNesoCatalogueUrl({ limit: 0 })).toThrow(RangeError);
  });
});

describe('parseNesoCatalogue', () => {
  it('parses the committed catalogue page', () => {
    const page = parseNesoCatalogue(CATALOGUE_FIXTURE);

    expect(page.totalCount).toBe(131);
    expect(page.datasets).toHaveLength(1);
    expect(page.datasets[0]).toEqual({
      name: 'upcoming-trades',
      title: 'Upcoming trades',
      publisher: 'Trading',
      licenceId: 'ESO',
      licenceTitle: 'NESO Open Data Licence',
      licenceUrl: 'https://www.neso.energy/data-portal/ngeso-open-licence',
      resourceCount: 1,
      modifiedAt: '2026-11-08T09:30:13.510453',
      tags: ['Balancing', 'Energy', 'Subscribable', 'System', 'Trades'],
    });
  });

  it('turns blank licence and publisher metadata into nulls', () => {
    const page = parseNesoCatalogue({
      success: true,
      result: {
        count: 1,
        results: [
          {
            name: 'minimal',
            title: 'Minimal dataset',
            license_id: '',
            license_title: null,
            license_url: null,
            metadata_modified: null,
            num_resources: 0,
            organization: null,
            tags: null,
          },
        ],
      },
    });

    expect(page.datasets[0]).toMatchObject({
      publisher: null,
      licenceId: null,
      licenceTitle: null,
      licenceUrl: null,
      modifiedAt: null,
      tags: [],
    });
  });

  it('rejects an unsuccessful CKAN response', () => {
    expect(() => parseNesoCatalogue({ success: false, result: {} })).toThrow(UkSourceParseError);
  });
});

describe('fetchNesoCatalogue', () => {
  it('fetches and parses a catalogue page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(CATALOGUE_FIXTURE));
    });

    const page = await fetchNesoCatalogue({ query: 'wind', limit: 2, fetchImpl });

    expect(page.datasets).toHaveLength(1);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('q')).toBe('wind');
    expect(requested.searchParams.get('rows')).toBe('2');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchNesoCatalogue({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('nesoCatalogueAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(nesoCatalogueAdapter.id).toBe(NESO_CATALOGUE_SOURCE_ID);
    expect(nesoCatalogueAdapter.auth).toBe('none');
    expect(nesoCatalogueAdapter.loadFixture().datasets).toHaveLength(1);
  });
});
