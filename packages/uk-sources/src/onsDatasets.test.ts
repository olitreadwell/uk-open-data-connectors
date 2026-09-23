import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchOnsDatasets,
  onsDatasetsAdapter,
  parseOnsDatasets,
  summarizeOnsDatasets,
} from './onsDatasets.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const DATASETS_FIXTURE = readFixtureJson('ons-datasets.json');

/** One catalogue item with only the fields the parser needs. */
function datasetItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'example-dataset',
    title: 'Example dataset',
    state: 'published',
    last_updated: '2023-12-13T09:40:24.204Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseOnsDatasets', () => {
  it('parses the catalogue fixture into records', () => {
    const records = parseOnsDatasets(DATASETS_FIXTURE);
    expect(records.length).toBeGreaterThan(0);
    const first = records[0];
    expect(first?.id.length).toBeGreaterThan(0);
    expect(first?.title.length).toBeGreaterThan(0);
    expect(first?.state).toBe('published');
    expect(first?.lastUpdatedIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof first?.isNationalStatistic).toBe('boolean');
    expect(Array.isArray(first?.keywords)).toBe(true);
  });

  it('keeps a record that leaves out the national-statistic flag', () => {
    const records = parseOnsDatasets({ items: [datasetItem()] });
    expect(records[0]?.isNationalStatistic).toBeNull();
    expect(records[0]?.keywords).toEqual([]);
    expect(records[0]?.topicPath).toBe('');
  });

  it('reads the topic path out of the taxonomy link', () => {
    const records = parseOnsDatasets({
      items: [
        datasetItem({
          links: {
            taxonomy: {
              href: 'https://api.beta.ons.gov.uk/v1/peoplepopulationandcommunity/wellbeing',
            },
          },
        }),
      ],
    });
    expect(records[0]?.topicPath).toBe('peoplepopulationandcommunity/wellbeing');
  });

  it('keeps a taxonomy link that is not on the ONS host', () => {
    const records = parseOnsDatasets({
      items: [datasetItem({ links: { taxonomy: { href: 'https://example.test/topic' } } })],
    });
    expect(records[0]?.topicPath).toBe('https://example.test/topic');
  });

  it('rejects a payload without an items array', () => {
    expect(() => parseOnsDatasets({ count: 3 })).toThrow(UkSourceParseError);
  });

  it('rejects an item missing its last-updated stamp', () => {
    expect(() =>
      parseOnsDatasets({ items: [{ id: 'a', title: 'A', state: 'published' }] })
    ).toThrow(UkSourceParseError);
  });
});

describe('summarizeOnsDatasets', () => {
  it('counts datasets by last-updated year, oldest first', () => {
    const summary = summarizeOnsDatasets(
      parseOnsDatasets({
        items: [
          datasetItem({ id: 'a', last_updated: '2026-01-05T00:00:00.000Z' }),
          datasetItem({ id: 'b', last_updated: '2023-06-05T00:00:00.000Z' }),
          datasetItem({ id: 'c', last_updated: '2023-07-05T00:00:00.000Z' }),
          datasetItem({ id: 'd', last_updated: '2024-02-05T00:00:00.000Z' }),
        ],
      })
    );
    expect(summary.datasetCount).toBe(4);
    expect(summary.yearCounts).toEqual([
      { year: '2023', datasetCount: 2 },
      { year: '2024', datasetCount: 1 },
      { year: '2026', datasetCount: 1 },
    ]);
  });

  it('separates flagged, unflagged, and unmarked records', () => {
    const summary = summarizeOnsDatasets(
      parseOnsDatasets({
        items: [
          datasetItem({ id: 'a', national_statistic: true }),
          datasetItem({ id: 'b', national_statistic: true }),
          datasetItem({ id: 'c', national_statistic: false }),
          datasetItem({ id: 'd' }),
        ],
      })
    );
    expect(summary.nationalStatisticCount).toBe(2);
    expect(summary.unflaggedCount).toBe(1);
  });

  it('handles an empty catalogue', () => {
    expect(summarizeOnsDatasets([])).toEqual({
      datasetCount: 0,
      nationalStatisticCount: 0,
      unflaggedCount: 0,
      yearCounts: [],
    });
  });
});

describe('fetchOnsDatasets', () => {
  it('fetches and parses the catalogue', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(DATASETS_FIXTURE));
    });
    const records = await fetchOnsDatasets({ fetchImpl });
    expect(records.length).toBeGreaterThan(0);
    expect(requestedUrls.join(' ')).toContain('/v1/datasets?limit=');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchOnsDatasets({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('onsDatasetsAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(onsDatasetsAdapter.id).toBe('ons-datasets');
    expect(onsDatasetsAdapter.auth).toBe('none');
    expect(onsDatasetsAdapter.loadFixture().length).toBeGreaterThan(0);
  });
});
