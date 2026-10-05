import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildExploreEducationPublicationsUrl,
  EXPLORE_EDUCATION_STATISTICS_SOURCE_ID,
  exploreEducationStatisticsAdapter,
  fetchExploreEducationPublications,
  parseExploreEducationPublications,
  summarizeExploreEducationPublications,
} from './exploreEducationStatistics.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const PUBLICATIONS_FIXTURE = readFixtureJson('explore-education-statistics-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildExploreEducationPublicationsUrl', () => {
  it('carries the page and page size', () => {
    expect(buildExploreEducationPublicationsUrl(2, 25)).toBe(
      'https://api.education.gov.uk/statistics/v1/publications?page=2&pageSize=25'
    );
  });
});

describe('parseExploreEducationPublications', () => {
  it('parses the committed fixture with its paging counts', () => {
    const page = parseExploreEducationPublications(PUBLICATIONS_FIXTURE);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.totalResults).toBe(25);
    expect(page.totalPages).toBe(2);
    expect(page.publications).toHaveLength(20);
    expect(page.publications[0]?.slug).toBe('pupil-absence-in-schools-in-england');
    expect(page.publications[0]?.lastPublishedIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects a payload without paging', () => {
    expect(() => parseExploreEducationPublications({ results: [] })).toThrow(UkSourceParseError);
  });
});

describe('summarizeExploreEducationPublications', () => {
  it('reports the page count and the newest publish stamp', () => {
    const summary = summarizeExploreEducationPublications(
      parseExploreEducationPublications(PUBLICATIONS_FIXTURE)
    );
    expect(summary.publicationCount).toBe(20);
    expect(summary.totalResults).toBe(25);
    expect(summary.latestPublishedIso).toBe('2026-09-24T08:30:10+00:00');
  });

  it('handles an empty page', () => {
    expect(
      summarizeExploreEducationPublications({
        page: 1,
        pageSize: 20,
        totalResults: 0,
        totalPages: 0,
        publications: [],
      })
    ).toEqual({ publicationCount: 0, totalResults: 0, latestPublishedIso: '' });
  });
});

describe('fetchExploreEducationPublications', () => {
  it('fetches and parses the publications page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(PUBLICATIONS_FIXTURE));
    });
    const page = await fetchExploreEducationPublications({ page: 1, pageSize: 20, fetchImpl });
    expect(page.publications).toHaveLength(20);
    expect(requestedUrls[0]).toContain('/publications?page=1&pageSize=20');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 }));
    await expect(fetchExploreEducationPublications({ fetchImpl })).rejects.toThrow(
      UkSourceApiError
    );
  });
});

describe('exploreEducationStatisticsAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(exploreEducationStatisticsAdapter.id).toBe(EXPLORE_EDUCATION_STATISTICS_SOURCE_ID);
    expect(exploreEducationStatisticsAdapter.auth).toBe('none');
    expect(exploreEducationStatisticsAdapter.loadFixture().totalResults).toBe(25);
  });
});
