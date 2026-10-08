import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Department for Education's Explore Education Statistics publications
 * API. Keyless, published under the Open Government Licence v3.
 */
export const EXPLORE_EDUCATION_STATISTICS_SOURCE_ID = 'explore-education-statistics';

/** Base URL for the Explore Education Statistics publications endpoint. */
export const EXPLORE_EDUCATION_PUBLICATIONS_URL =
  'https://api.education.gov.uk/statistics/v1/publications';

/** How many publications the adapter asks for per page by default. */
export const EXPLORE_EDUCATION_PUBLICATIONS_PAGE_SIZE = 20;

/** One published statistics release as the API lists it. */
export interface ExploreEducationPublication {
  id: string;
  title: string;
  /** URL-safe identifier, unique across releases. */
  slug: string;
  summary: string;
  /** Publication stamp the API reports, ISO 8601 with an offset. */
  lastPublishedIso: string;
}

/** One page of the publications catalogue plus the API's paging counts. */
export interface ExploreEducationPublicationsPage {
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  publications: ExploreEducationPublication[];
}

/** Rolled-up view of one publications page. */
export interface ExploreEducationPublicationsSummary {
  publicationCount: number;
  /** Total releases the API holds, not just this page. */
  totalResults: number;
  /** The most recent publish stamp on this page, or "" when the page is empty. */
  latestPublishedIso: string;
}

const EXPLORE_EDUCATION_PUBLICATION_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  summary: z.string().nullable().optional(),
  lastPublished: z.string(),
});

const EXPLORE_EDUCATION_PUBLICATIONS_SCHEMA = z.object({
  paging: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalResults: z.number(),
    totalPages: z.number(),
  }),
  results: z.array(EXPLORE_EDUCATION_PUBLICATION_SCHEMA),
});

/**
 * Builds a publications URL for one page.
 *
 * @param page - one-based page number
 * @param pageSize - records per page
 * @returns the publications catalogue URL
 */
export function buildExploreEducationPublicationsUrl(page: number, pageSize: number): string {
  return `${EXPLORE_EDUCATION_PUBLICATIONS_URL}?page=${page}&pageSize=${pageSize}`;
}

/**
 * Parses an Explore Education Statistics publications payload.
 *
 * @param payload - the raw JSON body from the publications endpoint
 * @returns the page of publications plus the API's paging counts
 */
export function parseExploreEducationPublications(
  payload: unknown
): ExploreEducationPublicationsPage {
  const parsed = EXPLORE_EDUCATION_PUBLICATIONS_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('explore-education-statistics', parsed.error.message);
  }
  return {
    page: parsed.data.paging.page,
    pageSize: parsed.data.paging.pageSize,
    totalResults: parsed.data.paging.totalResults,
    totalPages: parsed.data.paging.totalPages,
    publications: parsed.data.results.map((publication) => ({
      id: publication.id,
      title: publication.title,
      slug: publication.slug,
      summary: publication.summary ?? '',
      lastPublishedIso: publication.lastPublished,
    })),
  };
}

/**
 * Sums one publications page.
 *
 * @param page - a page from {@link parseExploreEducationPublications}
 * @returns publication counts and the newest publish stamp on the page
 */
export function summarizeExploreEducationPublications(
  page: ExploreEducationPublicationsPage
): ExploreEducationPublicationsSummary {
  let latestPublishedIso = '';
  let latestPublishedEpoch = Number.NEGATIVE_INFINITY;
  for (const publication of page.publications) {
    const epoch = Date.parse(publication.lastPublishedIso);
    if (Number.isFinite(epoch) && epoch > latestPublishedEpoch) {
      latestPublishedEpoch = epoch;
      latestPublishedIso = publication.lastPublishedIso;
    }
  }
  return {
    publicationCount: page.publications.length,
    totalResults: page.totalResults,
    latestPublishedIso,
  };
}

/**
 * Lists one page of Explore Education Statistics publications.
 *
 * @param options - page, page size, and an optional fetch implementation
 * @returns the page of publications the endpoint returns
 */
export async function fetchExploreEducationPublications(
  options: {
    page?: number;
    pageSize?: number;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<ExploreEducationPublicationsPage> {
  const {
    page = 1,
    pageSize = EXPLORE_EDUCATION_PUBLICATIONS_PAGE_SIZE,
    fetchImpl = globalThis.fetch,
  } = options;
  const response = await httpGet(
    'explore-education-statistics',
    buildExploreEducationPublicationsUrl(page, pageSize),
    { fetchImpl }
  );
  return parseExploreEducationPublications(await response.json());
}

/** Explore Education Statistics publications, keyless. */
export const exploreEducationStatisticsAdapter: UkDataAdapter<ExploreEducationPublicationsPage> = {
  id: EXPLORE_EDUCATION_STATISTICS_SOURCE_ID,
  name: 'Department for Education Explore Education Statistics publications',
  auth: 'none',
  description: 'The most recent statistics releases the Department for Education has published.',
  fetchLive: (options) =>
    fetchExploreEducationPublications(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseExploreEducationPublications,
  loadFixture: () =>
    parseExploreEducationPublications(
      readFixtureJson('explore-education-statistics-2026-10-05.json')
    ),
};
