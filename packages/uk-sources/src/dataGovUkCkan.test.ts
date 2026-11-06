import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildDataGovUkPackageSearchUrl,
  DATA_GOV_UK_CKAN_SOURCE_ID,
  dataGovUkCkanAdapter,
  fetchDataGovUkPackages,
  parseDataGovUkPackages,
  summarizeDataGovUkPackages,
} from './dataGovUkCkan.js';
import { UkSourceApiError, UkSourceParseError } from './errors.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const PACKAGES_FIXTURE = readFixtureJson('data-gov-uk-ckan-2026-11-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseDataGovUkPackages', () => {
  it('parses a committed CKAN package search page', () => {
    const page = parseDataGovUkPackages(PACKAGES_FIXTURE);

    expect(page.totalCount).toBe(3875);
    expect(page.datasets).toHaveLength(2);
    expect(page.datasets[0]).toEqual({
      name: 'york-flood-alleviation-scheme-fas-flood-cells',
      title: 'York Flood Alleviation Scheme (FAS) Flood Cells',
      publisher: 'Environment Agency',
      licenceId: 'uk-ogl',
      licenceTitle: 'UK Open Government Licence (OGL)',
      licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      resourceCount: 3,
      modifiedAt: '2020-09-29T14:11:54.471758',
      tags: ['OpenData', 'York', 'defence', 'flood', 'flood control', 'flood protection'],
    });
    expect(page.datasets[1]).toMatchObject({
      name: 'flooding2',
      publisher: 'Calderdale Metropolitan Borough Council',
      licenceId: null,
      licenceTitle: null,
      licenceUrl: null,
      resourceCount: 7,
      tags: [],
    });
  });

  it('turns an absent publisher, licence, and modification stamp into nulls', () => {
    const page = parseDataGovUkPackages({
      success: true,
      result: {
        count: 1,
        results: [
          {
            name: 'minimal',
            title: 'Minimal package',
            license_id: '',
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
    expect(() => parseDataGovUkPackages({ success: false, result: {} })).toThrow(
      UkSourceParseError
    );
  });
});

describe('buildDataGovUkPackageSearchUrl', () => {
  it('encodes a query and page size', () => {
    const url = new URL(buildDataGovUkPackageSearchUrl({ query: 'flood risk', limit: 3 }));

    expect(url.origin + url.pathname).toBe('https://www.data.gov.uk/api/3/action/package_search');
    expect(url.searchParams.get('q')).toBe('flood risk');
    expect(url.searchParams.get('rows')).toBe('3');
    expect(url.searchParams.has('start')).toBe(false);
  });

  it('omits an empty query', () => {
    const url = new URL(buildDataGovUkPackageSearchUrl());

    expect(url.searchParams.get('rows')).toBe('10');
    expect(url.searchParams.has('q')).toBe(false);
  });
});

describe('summarizeDataGovUkPackages', () => {
  it('counts publishers and licences on the page', () => {
    expect(summarizeDataGovUkPackages(parseDataGovUkPackages(PACKAGES_FIXTURE))).toEqual({
      datasetCount: 2,
      publisherCount: 2,
      licenceCounts: [
        { licenceId: 'uk-ogl', datasetCount: 1 },
        { licenceId: null, datasetCount: 1 },
      ],
    });
  });
});

describe('fetchDataGovUkPackages', () => {
  it('fetches and parses a searched page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(PACKAGES_FIXTURE));
    });

    const page = await fetchDataGovUkPackages({ query: 'flood', limit: 2, fetchImpl });

    expect(page.datasets).toHaveLength(2);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('q')).toBe('flood');
    expect(requested.searchParams.get('rows')).toBe('2');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchDataGovUkPackages({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('dataGovUkCkanAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(dataGovUkCkanAdapter.id).toBe(DATA_GOV_UK_CKAN_SOURCE_ID);
    expect(dataGovUkCkanAdapter.auth).toBe('none');
    expect(dataGovUkCkanAdapter.loadFixture().datasets).toHaveLength(2);
  });
});
