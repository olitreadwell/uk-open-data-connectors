import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchPlanningDatasets,
  parsePlanningDatasets,
  planningDatasetsAdapter,
  PLANNING_DATASETS_URL,
  summarizePlanningDatasets,
} from './planningDatasets.js';

/** One catalogue entry with only the fields the parser needs. */
function dataset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dataset: 'listed-building',
    name: 'Listed building',
    'entity-count': 382270,
    realm: 'dataset',
    themes: ['heritage'],
    typology: 'geography',
    phase: 'beta',
    licence: 'ogl3',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePlanningDatasets', () => {
  it('parses the dataset fixture', () => {
    const datasets = planningDatasetsAdapter.loadFixture();
    expect(datasets).toHaveLength(6);
    expect(datasets[0]?.dataset).toBe('title-boundary');
    expect(datasets[0]?.entityCount).toBe(22740586);
    expect(datasets[0]?.themes).toEqual(['administrative', 'housing']);
  });

  it('keeps datasets and drops the pipeline tables the same file lists', () => {
    const datasets = parsePlanningDatasets({
      datasets: [dataset(), dataset({ dataset: 'column', realm: 'configuration' })],
    });
    expect(datasets.map((entry) => entry.dataset)).toEqual(['listed-building']);
  });

  it('defaults the optional fields a sparse entry leaves out', () => {
    const [entry] = parsePlanningDatasets({
      datasets: [
        {
          dataset: 'london-square',
          name: 'London square',
          'entity-count': 0,
          realm: 'dataset',
        },
      ],
    });
    expect(entry).toEqual({
      dataset: 'london-square',
      name: 'London square',
      entityCount: 0,
      themes: [],
      typology: '',
      phase: '',
      licence: '',
    });
  });

  it('rejects a payload that is not a dataset catalogue', () => {
    expect(() => parsePlanningDatasets({ items: [] })).toThrow(UkSourceParseError);
    expect(() => parsePlanningDatasets('nope')).toThrow(UkSourceParseError);
  });

  it('rejects an entry whose record count is not a number', () => {
    expect(() =>
      parsePlanningDatasets({ datasets: [dataset({ 'entity-count': '382270' })] })
    ).toThrow(/entity-count/);
  });
});

describe('summarizePlanningDatasets', () => {
  it('totals the catalogue and counts the datasets with no records', () => {
    const summary = summarizePlanningDatasets(planningDatasetsAdapter.loadFixture());
    expect(summary.datasetCount).toBe(6);
    expect(summary.entityCount).toBe(22740586 + 780636 + 382270 + 273047 + 44373);
    expect(summary.emptyDatasetCount).toBe(1);
  });

  it('puts the largest datasets first and honours the limit', () => {
    const summary = summarizePlanningDatasets(planningDatasetsAdapter.loadFixture(), 3);
    expect(summary.largestDatasets.map((entry) => entry.dataset)).toEqual([
      'title-boundary',
      'flood-risk-zone',
      'listed-building',
    ]);
  });

  it('sorts equal record counts by name', () => {
    const summary = summarizePlanningDatasets(
      parsePlanningDatasets({
        datasets: [
          dataset({ dataset: 'tree', name: 'Tree', 'entity-count': 10 }),
          dataset({ dataset: 'ancient-woodland', name: 'Ancient woodland', 'entity-count': 10 }),
        ],
      })
    );
    expect(summary.largestDatasets.map((entry) => entry.name)).toEqual([
      'Ancient woodland',
      'Tree',
    ]);
  });

  it('handles an empty catalogue', () => {
    expect(summarizePlanningDatasets([])).toEqual({
      datasetCount: 0,
      entityCount: 0,
      emptyDatasetCount: 0,
      largestDatasets: [],
    });
  });
});

describe('fetchPlanningDatasets', () => {
  it('reads the catalogue from the dataset endpoint', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ datasets: [dataset()] }), { status: 200 })
    );
    const datasets = await fetchPlanningDatasets({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(PLANNING_DATASETS_URL);
    expect(datasets).toHaveLength(1);
  });

  it('throws an API error when the endpoint refuses the call', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchPlanningDatasets({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });

  it('fetches the catalogue through the adapter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ datasets: [dataset()] }), { status: 200 }))
    );
    const datasets = await planningDatasetsAdapter.fetchLive();
    expect(datasets[0]?.dataset).toBe('listed-building');
  });

  it('describes the adapter as keyless', () => {
    expect(planningDatasetsAdapter.id).toBe('planning-datasets');
    expect(planningDatasetsAdapter.auth).toBe('none');
    expect(planningDatasetsAdapter.name).toContain('Ministry of Housing');
  });
});
