import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildOrrMetadataUrl,
  fetchOrrDataPortalCatalogue,
  ORR_DATA_PORTAL_SOURCE_ID,
  orrDataPortalAdapter,
  parseOrrDataPortalCatalogue,
} from './orrDataPortal.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

const CATALOGUE_FIXTURE = readFixtureJson('orr-data-portal-2026-11-17.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildOrrMetadataUrl', () => {
  it('builds the ORR metadata endpoint', () => {
    expect(buildOrrMetadataUrl()).toBe('https://api.dataportal.orr.gov.uk/api/metadata');
  });
});

describe('parseOrrDataPortalCatalogue', () => {
  it('parses the committed metadata response', () => {
    const catalogue = parseOrrDataPortalCatalogue(CATALOGUE_FIXTURE);

    expect(catalogue.tableCount).toBe(31);
    expect(catalogue.themeCount).toBe(2);
    expect(catalogue.themes).toEqual(['performance', 'usage']);
    expect(catalogue.tables[0]).toEqual({
      theme: 'performance',
      table: '3114a',
      apiTableName: 'performance__3114a',
      description:
        'This data shows the percentage of trains in each railway period (4 weeks) arriving at their destination within the Public Performance Measure (10 minutes for long-distance operators, 5 minutes for all others) for train operators, sectors and nations within Great Britain.',
      rowCount: null,
      lastUpdated: null,
    });
    expect(catalogue.tables.at(-1)).toMatchObject({
      theme: 'usage',
      table: '1362',
      apiTableName: 'usage__1362',
    });
  });

  it('reads row counts and update stamps when the metadata supplies them', () => {
    const catalogue = parseOrrDataPortalCatalogue({
      statusCode: 200,
      message: 'SUCCEEDED',
      columnNames: ['theme', 'table', 'api_table_name', 'description', 'row_count', 'last_updated'],
      dataRows: [['usage', '1214', 'usage__1214', 'Travel revenue.', '33', '2026-11-17T00:00:00Z']],
    });

    expect(catalogue.tables).toEqual([
      {
        theme: 'usage',
        table: '1214',
        apiTableName: 'usage__1214',
        description: 'Travel revenue.',
        rowCount: 33,
        lastUpdated: '2026-11-17T00:00:00Z',
      },
    ]);
  });

  it('rejects a response without the metadata columns the adapter needs', () => {
    expect(() =>
      parseOrrDataPortalCatalogue({
        statusCode: 200,
        columnNames: ['theme', 'table', 'description'],
        dataRows: [['usage', '1214', 'Travel revenue.']],
      })
    ).toThrow(UkSourceParseError);
  });

  it('rejects a row whose width does not match the column list', () => {
    expect(() =>
      parseOrrDataPortalCatalogue({
        statusCode: 200,
        columnNames: [
          'theme',
          'table',
          'api_table_name',
          'description',
          'row_count',
          'last_updated',
        ],
        dataRows: [['usage', '1214', 'usage__1214', 'Travel revenue.']],
      })
    ).toThrow(UkSourceParseError);
  });

  it('rejects duplicate column names and unsuccessful responses', () => {
    expect(() =>
      parseOrrDataPortalCatalogue({
        statusCode: 200,
        columnNames: ['theme', 'theme', 'table', 'api_table_name', 'description'],
        dataRows: [['usage', 'usage', '1214', 'usage__1214', 'Travel revenue.']],
      })
    ).toThrow(UkSourceParseError);

    expect(() => parseOrrDataPortalCatalogue({ statusCode: 500, dataRows: [] })).toThrow(
      UkSourceParseError
    );
  });
});

describe('fetchOrrDataPortalCatalogue', () => {
  it('sends an Accept header and parses the metadata response', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(CATALOGUE_FIXTURE)
    );

    const catalogue = await fetchOrrDataPortalCatalogue({ fetchImpl });

    expect(catalogue.tableCount).toBe(31);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall?.[0]).toBe('https://api.dataportal.orr.gov.uk/api/metadata');
    expect(firstCall?.[1]?.headers).toMatchObject({
      accept: 'application/json',
      'user-agent': 'uk-open-data-connectors (Language=TypeScript)',
    });
  });

  it('throws the shared API error when the live endpoint fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchOrrDataPortalCatalogue({ fetchImpl })).rejects.toBeInstanceOf(
      UkSourceApiError
    );
  });
});

describe('orrDataPortalAdapter', () => {
  it('describes a keyless ORR source and loads its fixture', () => {
    expect(orrDataPortalAdapter.id).toBe(ORR_DATA_PORTAL_SOURCE_ID);
    expect(orrDataPortalAdapter.auth).toBe('none');
    expect(orrDataPortalAdapter.name).toContain('Office of Rail and Road');
    expect(orrDataPortalAdapter.loadFixture().tableCount).toBe(31);
  });
});
