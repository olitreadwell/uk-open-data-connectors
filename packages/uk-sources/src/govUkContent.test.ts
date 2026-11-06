import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildGovUkContentUrl,
  DEFAULT_GOV_UK_CONTENT_PATH,
  fetchGovUkContent,
  GOV_UK_CONTENT_API_BASE_URL,
  GOV_UK_CONTENT_SOURCE_ID,
  govUkContentAdapter,
  parseGovUkContent,
} from './govUkContent.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const CONTENT_FIXTURE = readFixtureJson('gov-uk-content-2026-11-07.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildGovUkContentUrl', () => {
  it('adds a leading slash to a bare content path', () => {
    expect(buildGovUkContentUrl('government/how-government-works')).toBe(
      'https://www.gov.uk/api/content/government/how-government-works'
    );
  });

  it('removes a trailing slash and keeps a leading one', () => {
    expect(buildGovUkContentUrl('/government/how-government-works/')).toBe(
      'https://www.gov.uk/api/content/government/how-government-works'
    );
  });

  it('keeps the root content item at the base URL', () => {
    expect(buildGovUkContentUrl('/')).toBe(GOV_UK_CONTENT_API_BASE_URL);
  });
});

describe('parseGovUkContent', () => {
  it('parses the committed content item', () => {
    const record = parseGovUkContent(CONTENT_FIXTURE);

    expect(record.contentId).toBe('f56cfe74-8e5c-432d-bfcf-fd2521c5919c');
    expect(record.basePath).toBe('/government/how-government-works');
    expect(record.webUrl).toBe('https://www.gov.uk/government/how-government-works');
    expect(record.title).toBe('How government works');
    expect(record.documentType).toBe('how_government_works');
    expect(record.phase).toBe('live');
    expect(record.firstPublishedAt).toBe('2016-04-07T14:16:57+01:00');
    expect(record.publicUpdatedAt).toBe('2026-11-05T15:30:20+00:00');
    expect(record.isWithdrawn).toBe(false);
    expect(record.taxons).toEqual([
      {
        title: 'Democracy',
        basePath: '/government/democracy',
        webUrl: 'https://www.gov.uk/government/democracy',
      },
      {
        title: 'Government',
        basePath: '/government/all',
        webUrl: 'https://www.gov.uk/government/all',
      },
    ]);
    expect(record.organisations).toEqual([]);
    expect(record.availableTranslationCount).toBe(1);
  });

  it('merges organisations with the primary publishing organisation', () => {
    const record = parseGovUkContent({
      ...(CONTENT_FIXTURE as Record<string, unknown>),
      links: {
        organisations: [
          { title: 'Cabinet Office', base_path: '/government/organisations/cabinet-office' },
        ],
        primary_publishing_organisation: [
          { title: 'Cabinet Office', base_path: '/government/organisations/cabinet-office' },
        ],
      },
    });

    expect(record.organisations).toEqual([
      {
        title: 'Cabinet Office',
        basePath: '/government/organisations/cabinet-office',
        webUrl: 'https://www.gov.uk/government/organisations/cabinet-office',
      },
    ]);
  });

  it('reads a withdrawn notice as a withdrawn item', () => {
    const record = parseGovUkContent({
      ...(CONTENT_FIXTURE as Record<string, unknown>),
      withdrawn_notice: { withdrawn_at: '2026-01-01T00:00:00Z', explanation: 'Replaced' },
    });

    expect(record.isWithdrawn).toBe(true);
  });

  it('rejects a payload without a content id or document type', () => {
    expect(() => parseGovUkContent({ base_path: '/government' })).toThrow(UkSourceParseError);
  });
});

describe('fetchGovUkContent', () => {
  it('fetches and parses one content item', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(CONTENT_FIXTURE));
    });

    const record = await fetchGovUkContent({ fetchImpl });

    expect(record.title).toBe('How government works');
    expect(requestedUrls).toEqual([`${GOV_UK_CONTENT_API_BASE_URL}${DEFAULT_GOV_UK_CONTENT_PATH}`]);
  });

  it('fetches a caller-supplied content path', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(CONTENT_FIXTURE)));

    await fetchGovUkContent({ path: '/government/democracy/', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.gov.uk/api/content/government/democracy',
      expect.any(Object)
    );
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));

    await expect(fetchGovUkContent({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('govUkContentAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(govUkContentAdapter.id).toBe(GOV_UK_CONTENT_SOURCE_ID);
    expect(govUkContentAdapter.auth).toBe('none');
    expect(govUkContentAdapter.loadFixture().title).toBe('How government works');
  });
});
