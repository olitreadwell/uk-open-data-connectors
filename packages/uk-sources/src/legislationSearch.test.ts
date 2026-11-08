import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import {
  buildLegislationSearchUrl,
  DEFAULT_LEGISLATION_QUERY,
  fetchLegislationSearch,
  LEGISLATION_SEARCH_SOURCE_ID,
  LEGISLATION_SEARCH_URL,
  legislationSearchAdapter,
  parseLegislationSearch,
} from './legislationSearch.js';

const FEED_FIXTURE = readFixtureText('legislation-search-2026-11-08.xml');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildLegislationSearchUrl', () => {
  it('builds a search feed URL with the default query', () => {
    const url = new URL(buildLegislationSearchUrl());

    expect(url.origin + url.pathname).toBe(LEGISLATION_SEARCH_URL);
    expect(url.searchParams.get('text')).toBe(DEFAULT_LEGISLATION_QUERY);
    expect(url.searchParams.has('page')).toBe(false);
  });

  it('encodes a custom query and page', () => {
    const url = new URL(buildLegislationSearchUrl({ query: 'air quality', page: 3 }));

    expect(url.searchParams.get('text')).toBe('air quality');
    expect(url.searchParams.get('page')).toBe('3');
  });

  it('rejects a page below one', () => {
    expect(() => buildLegislationSearchUrl({ page: 0 })).toThrow(RangeError);
  });
});

describe('parseLegislationSearch', () => {
  it('parses the committed search feed', () => {
    const page = parseLegislationSearch(FEED_FIXTURE);

    expect(page.query).toBe('environment');
    expect(page.page).toBe(1);
    expect(page.itemsPerPage).toBe(20);
    expect(page.morePages).toBe(12);
    expect(page.results).toHaveLength(2);
    expect(page.results[0]).toEqual({
      id: 'http://www.legislation.gov.uk/id/wsi/2013/755',
      title: 'The Natural Resources Body for Wales (Functions) Order 2013',
      titleWelsh: 'Gorchymyn Corff Adnoddau Naturiol Cymru (Swyddogaethau) 2013',
      url: 'http://www.legislation.gov.uk/wsi/2013/755/2020-12-31',
      type: 'WelshStatutoryInstrument',
      year: 2013,
      number: 755,
      updatedAt: '2026-09-14T20:20:31Z',
      publishedAt: '2013-04-19T13:30:01.373Z',
      subjects: ['PUBLIC BODIES', 'ENVIRONMENTAL PROTECTION', 'FORESTRY', 'COUNTRYSIDE'],
      summary: expect.stringContaining('The Natural Resources Body for Wales'),
    });
    expect(page.results[1]).toMatchObject({
      id: 'http://www.legislation.gov.uk/id/ssi/2025/165',
      title: 'The Environmental Authorisations (Scotland) Amendment Regulations 2025',
      titleWelsh: null,
      type: 'ScottishStatutoryInstrument',
      year: 2025,
      number: 165,
    });
  });

  it('reads a feed with no entries as an empty page', () => {
    const feed = FEED_FIXTURE.slice(0, FEED_FIXTURE.indexOf('<entry>')) + '</feed>';

    const page = parseLegislationSearch(feed);

    expect(page.results).toEqual([]);
  });

  it('rejects a payload that is not an Atom feed', () => {
    expect(() => parseLegislationSearch('<html><body>Not found</body></html>')).toThrow(
      UkSourceParseError
    );
  });

  it('rejects an entry without a title', () => {
    expect(() =>
      parseLegislationSearch(
        '<feed><openSearch:itemsPerPage>20</openSearch:itemsPerPage><entry><id>http://example.test/id/1</id></entry></feed>'
      )
    ).toThrow(/title/);
  });
});

describe('fetchLegislationSearch', () => {
  it('fetches and parses the search feed', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(FEED_FIXTURE, { headers: { 'content-type': 'application/atom+xml' } });
    });

    const page = await fetchLegislationSearch({ query: 'environment', page: 2, fetchImpl });

    expect(page.results).toHaveLength(2);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('text')).toBe('environment');
    expect(requested.searchParams.get('page')).toBe('2');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchLegislationSearch({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('legislationSearchAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(legislationSearchAdapter.id).toBe(LEGISLATION_SEARCH_SOURCE_ID);
    expect(legislationSearchAdapter.auth).toBe('none');
    expect(legislationSearchAdapter.loadFixture().results).toHaveLength(2);
  });
});
