import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchNomisDatasetDefinitions,
  NOMIS_SOURCE_ID,
  nomisAdapter,
  parseNomisDatasetDefinitions,
  summarizeNomisDatasetDefinitions,
} from './nomis.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const NOMIS_FIXTURE = readFixtureJson('nomis-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseNomisDatasetDefinitions', () => {
  it('parses the committed definition catalogue fixture', () => {
    const definitions = parseNomisDatasetDefinitions(NOMIS_FIXTURE);
    expect(definitions).toHaveLength(25);
    const first = definitions[0];
    expect(first?.id).toBe('NM_1_1');
    expect(first?.name).toBe("Jobseeker's Allowance with rates and proportions");
    expect(first?.agencyId).toBe('NOMIS');
    expect(first?.version).toBe(1);
    expect(first?.uri).toBe('Nm-1d1');
    expect(first?.status).toBe('Current (being actively updated)');
    expect(first?.keywords).toBe('Claimants,JSA,Rates');
    expect(first?.units).toBe('Persons');
    expect(first?.lastUpdated).toBe('2026-09-15 07:00:00');
  });

  it('turns missing annotations and descriptions into defaults', () => {
    const definitions = parseNomisDatasetDefinitions({
      structure: {
        keyfamilies: {
          keyfamily: [{ agencyid: 'NOMIS', id: 'NM_9_9', uri: 'x', version: 1 }],
        },
      },
    });
    expect(definitions[0]).toEqual({
      id: 'NM_9_9',
      name: '',
      agencyId: 'NOMIS',
      version: 1,
      uri: 'x',
      status: '',
      keywords: '',
      units: '',
      lastUpdated: '',
    });
  });

  it('reads a null annotation value as an empty string', () => {
    const definitions = parseNomisDatasetDefinitions({
      structure: {
        keyfamilies: {
          keyfamily: [
            {
              agencyid: 'NOMIS',
              id: 'NM_1233_1',
              uri: 'Nm-1233d1',
              version: 1,
              annotations: {
                annotation: [
                  {
                    annotationtitle: 'Status',
                    annotationtext: 'Historical (not actively being updated)',
                  },
                  { annotationtitle: 'MetadataText1', annotationtext: null },
                ],
              },
            },
          ],
        },
      },
    });
    expect(definitions[0]?.status).toBe('Historical (not actively being updated)');
    expect(definitions[0]?.keywords).toBe('');
  });

  it('handles a catalogue with no definitions', () => {
    expect(parseNomisDatasetDefinitions({ structure: { keyfamilies: null } })).toEqual([]);
  });

  it('rejects a payload without a structure', () => {
    expect(() => parseNomisDatasetDefinitions({ header: {} })).toThrow(UkSourceParseError);
  });
});

describe('summarizeNomisDatasetDefinitions', () => {
  it('counts definitions by status, most datasets first', () => {
    const summary = summarizeNomisDatasetDefinitions(parseNomisDatasetDefinitions(NOMIS_FIXTURE));
    expect(summary.datasetCount).toBe(25);
    expect(summary.statusCounts).toEqual([
      { status: 'Current (being actively updated)', datasetCount: 13 },
      { status: 'Historical (not actively being updated)', datasetCount: 12 },
    ]);
  });
});

describe('fetchNomisDatasetDefinitions', () => {
  it('fetches and parses the definition catalogue', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(NOMIS_FIXTURE));
    });
    const definitions = await fetchNomisDatasetDefinitions({ fetchImpl });
    expect(definitions).toHaveLength(25);
    expect(requestedUrls[0]).toContain('/dataset/def.sdmx.json');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 504 }));
    await expect(fetchNomisDatasetDefinitions({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('nomisAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(nomisAdapter.id).toBe(NOMIS_SOURCE_ID);
    expect(nomisAdapter.auth).toBe('none');
    expect(nomisAdapter.loadFixture()).toHaveLength(25);
  });
});
