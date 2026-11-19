import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  classifyNaturalEnglandLicence,
  fetchNaturalEnglandDatasets,
  naturalEnglandDatasetsAdapter,
  NATURAL_ENGLAND_DATASETS_URL,
  parseNaturalEnglandDatasets,
  summarizeNaturalEnglandDatasets,
} from './naturalEnglandDatasets.js';

/** One DCAT dataset entry with only the fields the parser reads. */
function dataset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '@type': 'dcat:Dataset',
    identifier: 'https://www.arcgis.com/home/item.html?id=abc123&sublayer=0',
    landingPage: 'https://naturalengland-defra.opendata.arcgis.com/datasets/Defra::example',
    title: 'Example dataset',
    description: '<p>First line.</p><p>Second &amp; third.</p>',
    keyword: ['Natural England', 'habitats'],
    issued: '2020-01-01T00:00:00.000Z',
    modified: '2026-10-21T00:00:00.000Z',
    publisher: { name: 'Defra group ArcGIS Online organisation' },
    accessLevel: 'public',
    license: 'Use of this data is subject to the Open Government Licence',
    distribution: [
      {
        '@type': 'dcat:Distribution',
        title: 'ArcGIS Hub Dataset',
        format: 'Web Page',
        mediaType: 'text/html',
        accessURL: 'https://naturalengland-defra.opendata.arcgis.com/datasets/Defra::example',
      },
      {
        '@type': 'dcat:Distribution',
        title: 'CSV',
        format: 'CSV',
        mediaType: 'text/csv',
        accessURL: 'https://example.test/example.csv',
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseNaturalEnglandDatasets', () => {
  it('parses the committed fixture', () => {
    const datasets = naturalEnglandDatasetsAdapter.loadFixture();
    expect(datasets).toHaveLength(3);
    expect(datasets[1]?.title).toBe('GCN Risk Zones (North and East Yorkshire)');
    expect(datasets[1]?.licence).toBe('natural-england-terms');
    expect(datasets[2]?.licence).toBe('non-commercial-government-licence');
    expect(datasets[0]?.licence).toBe('ogl');
    expect(datasets[0]?.formats).not.toContain('Web Page');
    expect(datasets[0]?.formats).toContain('CSV');
  });

  it('keeps the item id from the ArcGIS identifier', () => {
    const [entry] = parseNaturalEnglandDatasets({ dataset: [dataset()] });
    expect(entry?.id).toBe('https://www.arcgis.com/home/item.html?id=abc123&sublayer=0');
    expect(entry?.itemId).toBe('abc123');
  });

  it('drops the hub site pages the same feed lists as datasets', () => {
    const datasets = parseNaturalEnglandDatasets({
      dataset: [
        dataset(),
        dataset({
          title: 'Contact Us',
          landingPage: 'https://naturalengland-defra.opendata.arcgis.com/pages/Defra::contact-us',
        }),
      ],
    });
    expect(datasets.map((entry) => entry.title)).toEqual(['Example dataset']);
  });

  it('turns the description HTML into plain text', () => {
    const [entry] = parseNaturalEnglandDatasets({ dataset: [dataset()] });
    expect(entry?.description).toBe('First line. Second & third.');
  });

  it('defaults the fields a sparse entry leaves out', () => {
    const [entry] = parseNaturalEnglandDatasets({
      dataset: [
        dataset({
          identifier: undefined,
          description: undefined,
          keyword: undefined,
          issued: undefined,
          modified: undefined,
          publisher: undefined,
          license: null,
          distribution: undefined,
        }),
      ],
    });
    expect(entry).toEqual({
      id: 'https://naturalengland-defra.opendata.arcgis.com/datasets/Defra::example',
      itemId: null,
      title: 'Example dataset',
      description: '',
      landingPage: 'https://naturalengland-defra.opendata.arcgis.com/datasets/Defra::example',
      keywords: [],
      issued: null,
      modified: null,
      publisher: '',
      licence: 'unstated',
      licenceText: null,
      formats: [],
      distributions: [],
    });
  });

  it('keeps one entry per format and distribution', () => {
    const [entry] = parseNaturalEnglandDatasets({
      dataset: [
        dataset({
          distribution: [
            { format: 'CSV', accessURL: 'https://example.test/one.csv' },
            { format: 'CSV', accessURL: 'https://example.test/two.csv' },
            { format: 'GeoJSON', accessURL: 'https://example.test/example.geojson' },
          ],
        }),
      ],
    });
    expect(entry?.formats).toEqual(['CSV', 'GeoJSON']);
    expect(entry?.distributions).toHaveLength(3);
    expect(entry?.distributions[1]?.url).toBe('https://example.test/two.csv');
  });

  it('rejects a payload that is not a DCAT catalogue', () => {
    expect(() => parseNaturalEnglandDatasets({ items: [] })).toThrow(UkSourceParseError);
    expect(() => parseNaturalEnglandDatasets('nope')).toThrow(UkSourceParseError);
  });
});

describe('classifyNaturalEnglandLicence', () => {
  it('names each licence the portal publishes', () => {
    expect(classifyNaturalEnglandLicence('Subject to the Open Government Licence v3')).toBe('ogl');
    expect(
      classifyNaturalEnglandLicence(
        'Use of this data is subject to the Non-Commercial Government Licence'
      )
    ).toBe('non-commercial-government-licence');
    expect(
      classifyNaturalEnglandLicence(
        "Use of this data is subject to Natural England's Terms of Use Licence"
      )
    ).toBe('natural-england-terms');
    expect(classifyNaturalEnglandLicence('https://creativecommons.org/licenses/by/4.0')).toBe(
      'creative-commons-attribution'
    );
  });

  it('falls back to unstated or other', () => {
    expect(classifyNaturalEnglandLicence(null)).toBe('unstated');
    expect(classifyNaturalEnglandLicence('')).toBe('unstated');
    expect(classifyNaturalEnglandLicence('null')).toBe('unstated');
    expect(classifyNaturalEnglandLicence('Ask the publisher')).toBe('other');
  });
});

describe('summarizeNaturalEnglandDatasets', () => {
  it('counts datasets by licence and format', () => {
    const summary = summarizeNaturalEnglandDatasets(naturalEnglandDatasetsAdapter.loadFixture());
    expect(summary.datasetCount).toBe(3);
    expect(summary.licenceCounts).toEqual({
      ogl: 1,
      'non-commercial-government-licence': 1,
      'natural-england-terms': 1,
      'creative-commons-attribution': 0,
      unstated: 0,
      other: 0,
    });
    expect(summary.formatCounts.find((entry) => entry.format === 'ZIP')).toEqual({
      format: 'ZIP',
      datasetCount: 3,
    });
    expect(summary.formatCounts.some((entry) => entry.format === 'Web Page')).toBe(false);
  });

  it('lists the newest datasets first and honours the limit', () => {
    const summary = summarizeNaturalEnglandDatasets(
      parseNaturalEnglandDatasets({
        dataset: [
          dataset({ title: 'Older', modified: '2020-01-01T00:00:00.000Z' }),
          dataset({ title: 'Newest', modified: '2026-01-01T00:00:00.000Z' }),
          dataset({ title: 'Undated', modified: null }),
        ],
      }),
      2
    );
    expect(summary.newestDatasets.map((entry) => entry.title)).toEqual(['Newest', 'Older']);
  });

  it('rejects a limit that is not a positive whole number', () => {
    expect(() => summarizeNaturalEnglandDatasets([], 0)).toThrow(RangeError);
    expect(() => summarizeNaturalEnglandDatasets([], 1.5)).toThrow(RangeError);
  });

  it('handles an empty catalogue', () => {
    expect(summarizeNaturalEnglandDatasets([])).toEqual({
      datasetCount: 0,
      licenceCounts: {
        ogl: 0,
        'non-commercial-government-licence': 0,
        'natural-england-terms': 0,
        'creative-commons-attribution': 0,
        unstated: 0,
        other: 0,
      },
      formatCounts: [],
      newestDatasets: [],
    });
  });
});

describe('fetchNaturalEnglandDatasets', () => {
  it('reads the catalogue from the DCAT feed', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ dataset: [dataset()] }), { status: 200 })
    );
    const datasets = await fetchNaturalEnglandDatasets({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(NATURAL_ENGLAND_DATASETS_URL, expect.anything());
    expect(datasets).toHaveLength(1);
  });

  it('throws an API error when the feed refuses the call', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchNaturalEnglandDatasets({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });

  it('fetches the catalogue through the adapter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ dataset: [dataset()] }), { status: 200 }))
    );
    const datasets = await naturalEnglandDatasetsAdapter.fetchLive();
    expect(datasets[0]?.title).toBe('Example dataset');
  });

  it('describes the adapter as keyless', () => {
    expect(naturalEnglandDatasetsAdapter.id).toBe('natural-england-datasets');
    expect(naturalEnglandDatasetsAdapter.auth).toBe('none');
    expect(naturalEnglandDatasetsAdapter.name).toContain('Natural England');
  });
});
