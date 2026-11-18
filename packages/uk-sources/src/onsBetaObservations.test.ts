import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildOnsBetaObservationsUrl,
  DEFAULT_ONS_BETA_DATASET_ID,
  fetchOnsBetaObservations,
  ONS_BETA_OBSERVATIONS_SOURCE_ID,
  onsBetaObservationsAdapter,
  parseOnsBetaObservations,
} from './onsBetaObservations.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

const OBSERVATIONS_FIXTURE = readFixtureJson('ons-beta-observations-2026-11-19.json');
const DATASETS_FIXTURE = readFixtureJson('ons-datasets.json') as {
  items: Array<{ id: string; links?: { latest_version?: { href: string } } }>;
};

/** Picks the dataset detail record out of the committed catalogue fixture. */
function datasetDetail(id: string): unknown {
  const item = DATASETS_FIXTURE.items.find((entry) => entry.id === id);
  if (item === undefined) {
    throw new Error(`fixture has no dataset ${id}`);
  }
  return item;
}

describe('parseOnsBetaObservations', () => {
  it('parses the committed observations snapshot into rows', () => {
    const page = parseOnsBetaObservations(OBSERVATIONS_FIXTURE);

    expect(page.datasetId).toBe('wellbeing-quarterly');
    expect(page.edition).toBe('time-series');
    expect(page.version).toBe(9);
    expect(page.unitOfMeasure).toBe('Percentage');
    expect(page.totalObservations).toBe(49);
    expect(page.observations).toHaveLength(3);

    const first = page.observations[0];
    expect(first?.observation).toBe('52.60');
    expect(first?.numericValue).toBe(52.6);
    expect(first?.dimensions.Time).toEqual({ id: '2017-q3', label: '2017 Q3' });
    expect(first?.metadata).toEqual({ LCL: '51.9', UCL: '53.3' });
  });

  it('keeps a blank observation as text with no numeric value', () => {
    const page = parseOnsBetaObservations({
      links: {
        version: {
          href: 'https://api.beta.ons.gov.uk/v1/datasets/weekly-deaths-region/editions/time-series/versions/121',
        },
      },
      observations: [{ observation: '' }],
      total_observations: 1,
    });

    expect(page.datasetId).toBe('weekly-deaths-region');
    expect(page.version).toBe(121);
    expect(page.unitOfMeasure).toBeNull();
    expect(page.observations[0]).toEqual({
      dimensions: {},
      metadata: {},
      observation: '',
      numericValue: null,
    });
  });

  it('rejects a payload without an observations array', () => {
    expect(() =>
      parseOnsBetaObservations({
        links: {
          version: {
            href: 'https://api.beta.ons.gov.uk/v1/datasets/wellbeing-quarterly/editions/time-series/versions/9',
          },
        },
        total_observations: 0,
      })
    ).toThrow(UkSourceParseError);
  });

  it('rejects a payload without a version link', () => {
    expect(() => parseOnsBetaObservations({ observations: [], total_observations: 0 })).toThrow(
      UkSourceParseError
    );
  });
});

describe('buildOnsBetaObservationsUrl', () => {
  it('builds the default wellbeing query', () => {
    const url = new URL(buildOnsBetaObservationsUrl({ version: 9 }));

    expect(url.pathname).toBe(
      '/v1/datasets/wellbeing-quarterly/editions/time-series/versions/9/observations'
    );
    expect(url.searchParams.get('time')).toBe('*');
    expect(url.searchParams.get('geography')).toBe('K02000001');
    expect(url.searchParams.get('estimate')).toBe('good');
    expect(url.searchParams.get('measureofwellbeing')).toBe('life-satisfaction');
    expect(url.searchParams.get('seasonaladjustment')).toBe('non-seasonal-adjustment');
  });

  it('encodes a custom dataset, edition, and dimension filter', () => {
    const url = new URL(
      buildOnsBetaObservationsUrl({
        datasetId: 'weekly deaths',
        edition: 'time series',
        version: 121,
        dimensions: { time: '2025', geography: 'E92000001' },
      })
    );

    expect(url.pathname).toBe(
      '/v1/datasets/weekly%20deaths/editions/time%20series/versions/121/observations'
    );
    expect(url.searchParams.get('time')).toBe('2025');
    expect(url.searchParams.get('geography')).toBe('E92000001');
  });

  it('rejects a version that is not a positive whole number', () => {
    expect(() => buildOnsBetaObservationsUrl({ version: 0 })).toThrow(RangeError);
  });
});

describe('fetchOnsBetaObservations', () => {
  it('resolves the latest version before reading observations', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requestedUrls.push(target);
      return target.endsWith(`/v1/datasets/${DEFAULT_ONS_BETA_DATASET_ID}`)
        ? jsonResponse(datasetDetail(DEFAULT_ONS_BETA_DATASET_ID))
        : jsonResponse(OBSERVATIONS_FIXTURE);
    });

    const page = await fetchOnsBetaObservations({ fetchImpl });

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toBe('https://api.beta.ons.gov.uk/v1/datasets/wellbeing-quarterly');
    const observationsUrl = new URL(requestedUrls[1] ?? '');
    expect(observationsUrl.pathname).toBe(
      '/v1/datasets/wellbeing-quarterly/editions/time-series/versions/9/observations'
    );
    expect(observationsUrl.searchParams.get('time')).toBe('*');
    expect(page.observations).toHaveLength(3);
  });

  it('uses a caller-supplied version without another lookup', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requestedUrls.push(target);
      return jsonResponse(OBSERVATIONS_FIXTURE);
    });

    await fetchOnsBetaObservations({
      datasetId: 'wellbeing-quarterly',
      edition: 'time-series',
      version: 9,
      dimensions: { time: '2023-q1' },
      fetchImpl,
    });

    expect(requestedUrls).toHaveLength(1);
    const url = new URL(requestedUrls[0] ?? '');
    expect(url.searchParams.get('time')).toBe('2023-q1');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(
      fetchOnsBetaObservations({ datasetId: 'wellbeing-quarterly', version: 9, fetchImpl })
    ).rejects.toThrow(UkSourceApiError);
  });
});

describe('onsBetaObservationsAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(onsBetaObservationsAdapter.id).toBe(ONS_BETA_OBSERVATIONS_SOURCE_ID);
    expect(onsBetaObservationsAdapter.auth).toBe('none');
    expect(onsBetaObservationsAdapter.loadFixture().observations).toHaveLength(3);
  });
});
