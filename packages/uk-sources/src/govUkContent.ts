import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The GOV.UK Content API. Keyless, published by the Government Digital Service
 * under the Open Government Licence v3.
 */
export const GOV_UK_CONTENT_API_BASE_URL = 'https://www.gov.uk/api/content';

/** The source id used by the registry, the API, and the CLI. */
export const GOV_UK_CONTENT_SOURCE_ID = 'gov-uk-content';

/** The content item read when a caller does not name a path. */
export const DEFAULT_GOV_UK_CONTENT_PATH = '/government/how-government-works';

const GOV_UK_CONTENT_WEB_BASE_URL = 'https://www.gov.uk';

/** One linked GOV.UK page, such as a taxon or an organisation. */
export interface GovUkContentLink {
  title: string | null;
  basePath: string;
  webUrl: string;
}

/** One GOV.UK content item, flattened from the Content API response. */
export interface GovUkContentRecord {
  contentId: string;
  basePath: string;
  webUrl: string;
  title: string | null;
  description: string | null;
  documentType: string;
  schemaName: string;
  locale: string;
  phase: string | null;
  firstPublishedAt: string | null;
  publicUpdatedAt: string | null;
  updatedAt: string | null;
  isWithdrawn: boolean;
  taxons: GovUkContentLink[];
  organisations: GovUkContentLink[];
  availableTranslationCount: number;
}

const GOV_UK_CONTENT_LINK_SCHEMA = z.object({
  title: z.string().nullable().optional(),
  base_path: z.string(),
  web_url: z.string().optional(),
});

const GOV_UK_CONTENT_SCHEMA = z.object({
  content_id: z.string(),
  base_path: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  document_type: z.string(),
  schema_name: z.string(),
  locale: z.string(),
  phase: z.string().optional(),
  first_published_at: z.string().nullable().optional(),
  public_updated_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  withdrawn_notice: z.record(z.string(), z.unknown()).optional(),
  links: z
    .object({
      taxons: z.array(GOV_UK_CONTENT_LINK_SCHEMA).optional(),
      organisations: z.array(GOV_UK_CONTENT_LINK_SCHEMA).optional(),
      primary_publishing_organisation: z.array(GOV_UK_CONTENT_LINK_SCHEMA).optional(),
      available_translations: z.array(GOV_UK_CONTENT_LINK_SCHEMA).optional(),
    })
    .optional(),
});

type GovUkContentLinkPayload = z.infer<typeof GOV_UK_CONTENT_LINK_SCHEMA>;

/** Turns a content path into a web URL, with or without a leading slash. */
function buildGovUkWebUrl(basePath: string): string {
  return basePath === '/'
    ? `${GOV_UK_CONTENT_WEB_BASE_URL}/`
    : `${GOV_UK_CONTENT_WEB_BASE_URL}${basePath}`;
}

/** Flattens one linked content item into a title, path, and web URL. */
function toContentLink(link: GovUkContentLinkPayload): GovUkContentLink {
  return {
    title: link.title ?? null,
    basePath: link.base_path,
    webUrl: link.web_url ?? buildGovUkWebUrl(link.base_path),
  };
}

/** Removes duplicate links and keeps the first occurrence of each path. */
function dedupeContentLinks(links: GovUkContentLink[]): GovUkContentLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.basePath)) {
      return false;
    }
    seen.add(link.basePath);
    return true;
  });
}

/** Normalises a content path so every caller reaches the same URL. */
function normalizeContentPath(contentPath: string): string {
  const trimmed = contentPath.trim();
  if (trimmed === '' || trimmed === '/') {
    return '/';
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

/**
 * Builds a Content API URL for one piece of GOV.UK content.
 *
 * @param contentPath - a GOV.UK path such as `/government/how-government-works`
 * @returns the absolute Content API URL
 */
export function buildGovUkContentUrl(contentPath: string = DEFAULT_GOV_UK_CONTENT_PATH): string {
  const normalized = normalizeContentPath(contentPath);
  return normalized === '/'
    ? GOV_UK_CONTENT_API_BASE_URL
    : `${GOV_UK_CONTENT_API_BASE_URL}${encodeURI(normalized)}`;
}

/**
 * Parses one GOV.UK Content API payload into a flat content record.
 *
 * @param payload - the raw JSON body from a Content API path
 * @returns the content item, its taxons, and its publishing organisations
 */
export function parseGovUkContent(payload: unknown): GovUkContentRecord {
  const parsed = GOV_UK_CONTENT_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(GOV_UK_CONTENT_SOURCE_ID, parsed.error.message);
  }
  const content = parsed.data;
  const links = content.links ?? {};
  const organisations = dedupeContentLinks([
    ...(links.organisations ?? []).map(toContentLink),
    ...(links.primary_publishing_organisation ?? []).map(toContentLink),
  ]);

  return {
    contentId: content.content_id,
    basePath: content.base_path,
    webUrl: buildGovUkWebUrl(content.base_path),
    title: content.title ?? null,
    description: content.description ?? null,
    documentType: content.document_type,
    schemaName: content.schema_name,
    locale: content.locale,
    phase: content.phase ?? null,
    firstPublishedAt: content.first_published_at ?? null,
    publicUpdatedAt: content.public_updated_at ?? null,
    updatedAt: content.updated_at ?? null,
    isWithdrawn:
      content.withdrawn_notice !== undefined && Object.keys(content.withdrawn_notice).length > 0,
    taxons: (links.taxons ?? []).map(toContentLink),
    organisations,
    availableTranslationCount: links.available_translations?.length ?? 0,
  };
}

/**
 * Reads one content item from the GOV.UK Content API.
 *
 * @param options - a GOV.UK path and an optional fetch implementation
 * @returns the parsed content record
 */
export async function fetchGovUkContent(
  options: { path?: string; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<GovUkContentRecord> {
  const { path: contentPath = DEFAULT_GOV_UK_CONTENT_PATH, fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(GOV_UK_CONTENT_SOURCE_ID, buildGovUkContentUrl(contentPath), {
    fetchImpl,
  });
  return parseGovUkContent(await response.json());
}

/** GOV.UK Content API adapter, keyless. */
export const govUkContentAdapter: UkDataAdapter<GovUkContentRecord> = {
  id: GOV_UK_CONTENT_SOURCE_ID,
  name: 'GOV.UK Content API',
  auth: 'none',
  description: 'One GOV.UK page, with its taxons and publishing organisations.',
  fetchLive: (options) =>
    fetchGovUkContent(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseGovUkContent,
  loadFixture: () => parseGovUkContent(readFixtureJson('gov-uk-content-2026-11-07.json')),
};
