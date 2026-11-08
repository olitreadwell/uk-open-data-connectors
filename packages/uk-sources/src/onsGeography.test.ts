import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import {
  buildOnsGeographySearchUrl,
  DEFAULT_ONS_GEOGRAPHY_LIMIT,
  fetchOnsGeographyDatasets,
  ONS_GEOGRAPHY_SEARCH_URL,
  ONS_GEOGRAPHY_SOURCE_ID,
  onsGeographyAdapter,
  parseOnsGeographyDatasets,
} from './onsGeography.js';

const ONS_FIXTURE = readFixtureJson('ons-geography-2026-11-08.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildOnsGeographySearchUrl', () => {
  it('asks for the default page size', () => {
    const url = new URL(buildOnsGeographySearchUrl());

    expect(url.origin + url.pathname).toBe(ONS_GEOGRAPHY_SEARCH_URL);
    expect(url.searchParams.get('limit')).toBe(String(DEFAULT_ONS_GEOGRAPHY_LIMIT));
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.has('startindex')).toBe(false);
  });

  it('encodes a query and start index', () => {
    const url = new URL(buildOnsGeographySearchUrl({ query: 'output areas', startIndex: 21 }));

    expect(url.searchParams.get('q')).toBe('output areas');
    expect(url.searchParams.get('startindex')).toBe('21');
  });

  it('rejects a non-positive limit', () => {
    expect(() => buildOnsGeographySearchUrl({ limit: 0 })).toThrow(RangeError);
  });

  it('rejects a negative start index', () => {
    expect(() => buildOnsGeographySearchUrl({ startIndex: -1 })).toThrow(RangeError);
  });
});

describe('parseOnsGeographyDatasets', () => {
  it('parses the committed GeoJSON search page', () => {
    const page = parseOnsGeographyDatasets(ONS_FIXTURE);

    expect(page.totalCount).toBe(3497);
    expect(page.returnedCount).toBe(2);
    expect(page.nextStartIndex).toBe(3);
    expect(page.datasets).toHaveLength(2);
    expect(page.datasets[0]).toEqual({
      id: '7d4a6791cfe643f7a23f5141e1f4cc4f',
      title: 'Parish to Ward to Local Authority District (December 2026) Lookup in EW',
      type: 'Feature Service',
      owner: 'ONSGeography_data',
      url: 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/PAR26_WD26_LAD26_EW_LU/FeatureServer',
      description: expect.stringContaining('This is a lookup file between civil parishes'),
      licence: 'custom',
      licenceInfo: 'https://www.ons.gov.uk/methodology/geography/licences',
      tags: expect.arrayContaining(['2026', 'LUP_PAR_WD_LAD', 'Wards']),
      createdAt: '2026-11-05T07:00:27.000Z',
      modifiedAt: '2026-11-05T07:20:09.000Z',
      geometryType: 'Polygon',
    });
    expect(page.datasets[1]?.title).toBe('Combined Authorities (December 2025) Boundaries EN BFC');
  });

  it('turns absent metadata and paging links into nulls and an empty list', () => {
    const page = parseOnsGeographyDatasets({
      type: 'FeatureCollection',
      features: [
        {
          id: 'example',
          properties: { title: 'Example dataset' },
        },
      ],
      numberMatched: 1,
      numberReturned: 1,
    });

    expect(page.nextStartIndex).toBeNull();
    expect(page.datasets[0]).toMatchObject({
      type: null,
      owner: null,
      url: null,
      description: null,
      licence: null,
      licenceInfo: null,
      tags: [],
      createdAt: null,
      modifiedAt: null,
      geometryType: null,
    });
  });

  it('rejects a payload that is not a GeoJSON feature collection', () => {
    expect(() => parseOnsGeographyDatasets({ type: 'FeatureCollection' })).toThrow(
      UkSourceParseError
    );
  });

  it('rejects a feature without a title', () => {
    expect(() =>
      parseOnsGeographyDatasets({
        type: 'FeatureCollection',
        features: [{ id: 'example', properties: {} }],
        numberMatched: 1,
        numberReturned: 1,
      })
    ).toThrow(UkSourceParseError);
  });
});

describe('fetchOnsGeographyDatasets', () => {
  it('fetches and parses a search page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(ONS_FIXTURE));
    });

    const page = await fetchOnsGeographyDatasets({ query: 'wards', limit: 2, fetchImpl });

    expect(page.datasets).toHaveLength(2);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('q')).toBe('wards');
    expect(requested.searchParams.get('limit')).toBe('2');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchOnsGeographyDatasets({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('onsGeographyAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(onsGeographyAdapter.id).toBe(ONS_GEOGRAPHY_SOURCE_ID);
    expect(onsGeographyAdapter.auth).toBe('none');
    expect(onsGeographyAdapter.loadFixture().datasets).toHaveLength(2);
  });
});
