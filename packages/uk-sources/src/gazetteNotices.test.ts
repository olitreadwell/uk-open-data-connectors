import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import {
  buildGazetteNoticesUrl,
  fetchGazetteNotices,
  GAZETTE_NOTICES_SOURCE_ID,
  GAZETTE_NOTICES_URL,
  gazetteNoticesAdapter,
  parseGazetteNotices,
} from './gazetteNotices.js';

const NOTICES_FIXTURE = readFixtureJson('gazette-notices-2026-11-08.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildGazetteNoticesUrl', () => {
  it('builds the default notice feed URL', () => {
    const url = new URL(buildGazetteNoticesUrl());

    expect(url.origin + url.pathname).toBe(GAZETTE_NOTICES_URL);
    expect(url.search).toBe('');
  });

  it('encodes a text query, publication dates, and page', () => {
    const url = new URL(
      buildGazetteNoticesUrl({
        query: 'insolvency notices',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        page: 2,
      })
    );

    expect(url.searchParams.get('text')).toBe('insolvency notices');
    expect(url.searchParams.get('start-publish-date')).toBe('2026-11-01');
    expect(url.searchParams.get('end-publish-date')).toBe('2026-11-02');
    expect(url.searchParams.get('results-page')).toBe('2');
  });

  it('rejects a page below one', () => {
    expect(() => buildGazetteNoticesUrl({ page: 0 })).toThrow(RangeError);
  });
});

describe('parseGazetteNotices', () => {
  it('parses the committed notice feed', () => {
    const page = parseGazetteNotices(NOTICES_FIXTURE);

    expect(page.totalCount).toBe(4_889_773);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(10);
    expect(page.notices).toHaveLength(3);
    expect(page.notices[0]).toEqual({
      id: 'https://www.thegazette.co.uk/id/notice/5247115',
      noticeCode: '1209',
      title: 'Northern Ireland Assembly',
      publishedAt: '2026-11-07T12:00:08',
      updatedAt: '2026-11-07T12:00:09Z',
      url: 'https://www.thegazette.co.uk/notice/5247115',
      categories: ['Northern Ireland Assembly'],
      latitude: null,
      longitude: null,
      contentHtml: expect.stringContaining('NORTHERN IRELAND'),
    });
    expect(page.notices[1]).toMatchObject({
      noticeCode: '2603',
      title: 'RED HIRE AND SALES LTD',
      categories: ['Notice of Disclaimer'],
      latitude: 51.37474,
      longitude: 0.082817,
    });
  });

  it('reads a category list and an absent location', () => {
    const page = parseGazetteNotices({
      'f:total': '1',
      'f:page-number': '1',
      'f:page-size': '10',
      entry: [
        {
          id: 'https://www.thegazette.co.uk/id/notice/1',
          title: 'Example notice',
          category: [{ '@term': 'Planning' }, { '@term': 'Other' }],
          link: [{ '@href': 'https://www.thegazette.co.uk/notice/1' }],
        },
      ],
    });

    expect(page.notices[0]).toMatchObject({
      categories: ['Planning', 'Other'],
      latitude: null,
      longitude: null,
      publishedAt: null,
      updatedAt: null,
      contentHtml: null,
    });
  });

  it('rejects a payload without the feed totals', () => {
    expect(() => parseGazetteNotices({ entry: [] })).toThrow(UkSourceParseError);
  });

  it('rejects a notice without a title', () => {
    expect(() =>
      parseGazetteNotices({
        'f:total': '1',
        'f:page-number': '1',
        'f:page-size': '10',
        entry: [{ id: 'https://www.thegazette.co.uk/id/notice/1' }],
      })
    ).toThrow(UkSourceParseError);
  });
});

describe('fetchGazetteNotices', () => {
  it('fetches and parses a notice page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(NOTICES_FIXTURE));
    });

    const page = await fetchGazetteNotices({ query: 'insolvency', page: 2, fetchImpl });

    expect(page.notices).toHaveLength(3);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('text')).toBe('insolvency');
    expect(requested.searchParams.get('results-page')).toBe('2');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchGazetteNotices({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('gazetteNoticesAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(gazetteNoticesAdapter.id).toBe(GAZETTE_NOTICES_SOURCE_ID);
    expect(gazetteNoticesAdapter.auth).toBe('none');
    expect(gazetteNoticesAdapter.loadFixture().notices).toHaveLength(3);
  });
});
