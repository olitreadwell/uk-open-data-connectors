import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildUkriGtrAwardsUrl,
  DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE,
  fetchUkriGtrAwards,
  parseUkriGtrAwards,
  UKRI_GTR_API_BASE_URL,
  UKRI_GTR_AWARDS_SOURCE_ID,
  ukriGtrAwardsAdapter,
} from './ukriGtrAwards.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const AWARDS_FIXTURE = readFixtureJson('ukri-gtr-awards-2026-11-08.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUkriGtrAwardsUrl', () => {
  it('asks for the newest awards first', () => {
    const url = new URL(buildUkriGtrAwardsUrl());

    expect(url.origin + url.pathname).toBe(`${UKRI_GTR_API_BASE_URL}/awards`);
    expect(url.searchParams.get('size')).toBe(String(DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE));
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('sortfield')).toBe('startDate');
    expect(url.searchParams.get('sortorder')).toBe('D');
    expect(url.searchParams.has('query')).toBe(false);
  });

  it('encodes a search query and page size', () => {
    const url = new URL(buildUkriGtrAwardsUrl({ query: 'quantum sensing', page: 3, pageSize: 40 }));

    expect(url.searchParams.get('query')).toBe('quantum sensing');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('size')).toBe('40');
  });

  it('rejects a page size outside the API range', () => {
    expect(() => buildUkriGtrAwardsUrl({ pageSize: 19 })).toThrow(RangeError);
    expect(() => buildUkriGtrAwardsUrl({ pageSize: 101 })).toThrow(RangeError);
  });

  it('rejects a page below one', () => {
    expect(() => buildUkriGtrAwardsUrl({ page: 0 })).toThrow(RangeError);
  });
});

describe('parseUkriGtrAwards', () => {
  it('parses the committed award page', () => {
    const page = parseUkriGtrAwards(AWARDS_FIXTURE);

    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.totalCount).toBe(191069);
    expect(page.totalPages).toBe(500);
    expect(page.lastDataRefreshDate).toBe('2026-11-02');
    expect(page.awards).toHaveLength(3);
    expect(page.awards[0]).toEqual({
      id: '124cef68-f9c9-421e-a25d-036cf2cd4b08',
      projectTitle:
        'Does the time of day that exercise is performed influence glycaemic outcomes across different phases of the menstrual cycle?',
      projectStatus: 'Active',
      grantRefNumber: '2932165',
      grantCategory: 'Studentship',
      fundingOrgName: 'BBSRC',
      fundingOrgLongName: 'BBSRC',
      leadOrgId: '489de625-3d22-4fbf-bdc9-6a244edeabbd',
      leadOrgName: 'University of Aberdeen',
      leadOrgRegion: 'Scotland',
      leadOrgRole: 'LEAD_RO',
      startDate: '2028-09-30T00:00:00Z',
      endDate: '2028-09-30T00:00:00Z',
      totalGrantValue: null,
      leadPersonId: null,
      leadPersonName: null,
      projectPath: '/find-research-and-innovation/project/124cef68-f9c9-421e-a25d-036cf2cd4b08',
      apiUrl: 'https://gtr.ukri.org/api/v3/awards/124cef68-f9c9-421e-a25d-036cf2cd4b08',
    });
    expect(page.awards[2]?.projectTitle).toBe('Improving Cell-Based Immunotherapy');
  });

  it('names the lead person when the award carries one', () => {
    const payload = structuredClone(AWARDS_FIXTURE) as {
      awardList: { awardListItem: Record<string, unknown> }[];
    };
    const first = payload.awardList[0]?.awardListItem;
    if (first === undefined) {
      throw new Error('fixture changed');
    }
    first.leadPersonId = 'person-1';
    first.leadPersonName = { firstName: 'Ada', surname: 'Lovelace', preferredName: 'Ada Lovelace' };

    const page = parseUkriGtrAwards(payload);

    expect(page.awards[0]?.leadPersonId).toBe('person-1');
    expect(page.awards[0]?.leadPersonName).toEqual({
      firstName: 'Ada',
      surname: 'Lovelace',
      preferredName: 'Ada Lovelace',
    });
  });

  it('rejects a payload without the award list', () => {
    expect(() => parseUkriGtrAwards({ awardList: null })).toThrow(UkSourceParseError);
  });

  it('rejects the same award listed twice', () => {
    const payload = structuredClone(AWARDS_FIXTURE) as {
      awardList: { awardListItem: unknown }[];
    };
    const first = payload.awardList[0];
    if (first === undefined) {
      throw new Error('fixture changed');
    }
    payload.awardList[1] = structuredClone(first);

    expect(() => parseUkriGtrAwards(payload)).toThrow(/more than once/);
  });
});

describe('fetchUkriGtrAwards', () => {
  it('fetches and parses an award page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(AWARDS_FIXTURE));
    });

    const page = await fetchUkriGtrAwards({ query: 'quantum', fetchImpl });

    expect(page.awards).toHaveLength(3);
    const requested = new URL(requestedUrls[0] ?? '');
    expect(requested.searchParams.get('query')).toBe('quantum');
    expect(requested.searchParams.get('sortfield')).toBe('startDate');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchUkriGtrAwards({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('ukriGtrAwardsAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(ukriGtrAwardsAdapter.id).toBe(UKRI_GTR_AWARDS_SOURCE_ID);
    expect(ukriGtrAwardsAdapter.auth).toBe('none');
    expect(ukriGtrAwardsAdapter.loadFixture().awards).toHaveLength(3);
  });
});
