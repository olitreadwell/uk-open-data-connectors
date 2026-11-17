import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Office of Rail and Road (ORR) data portal. Keyless, and the portal's
 * rail statistics carry the Open Government Licence v3 unless a table says
 * otherwise.
 */
export const ORR_DATA_PORTAL_SOURCE_ID = 'orr-data-portal';

/** Root of the ORR Data API. */
export const ORR_DATA_API_BASE_URL = 'https://api.dataportal.orr.gov.uk';

/** The metadata endpoint that lists every available theme and table. */
export const ORR_METADATA_PATH = '/api/metadata';

/** One rail statistics table in the ORR data portal catalogue. */
export interface OrrDataTableSummary {
  /** The theme (schema) name, such as `performance` or `usage`. */
  theme: string;
  /** The public table id, such as `3114a`. */
  table: string;
  /** The warehouse table name ORR publishes, such as `performance__3114a`. */
  apiTableName: string;
  /** Plain-language description of what the table contains. */
  description: string;
  /** Row count when the metadata reports one, otherwise null. */
  rowCount: number | null;
  /** Last update stamp when the metadata reports one, otherwise null. */
  lastUpdated: string | null;
}

/** Every rail statistics table the ORR data portal exposes. */
export interface OrrDataPortalCatalogue {
  /** Number of distinct themes in the catalogue. */
  themeCount: number;
  /** Number of tables in the catalogue. */
  tableCount: number;
  /** Theme names in the order the metadata first lists them. */
  themes: string[];
  tables: OrrDataTableSummary[];
}

const ORR_METADATA_VALUE_SCHEMA = z.union([z.string(), z.number(), z.null()]);

const ORR_METADATA_SCHEMA = z.object({
  statusCode: z.number().int(),
  message: z.string().nullable().optional(),
  columnNames: z.array(z.string().min(1)).min(1),
  dataRows: z.array(z.array(ORR_METADATA_VALUE_SCHEMA)),
});

const REQUIRED_METADATA_COLUMNS = [
  'theme',
  'table',
  'api_table_name',
  'description',
  'row_count',
  'last_updated',
] as const;

/** Builds the metadata URL that lists every ORR theme and table. */
export function buildOrrMetadataUrl(): string {
  return `${ORR_DATA_API_BASE_URL}${ORR_METADATA_PATH}`;
}

/** Maps a metadata column name onto its position in each row. */
function buildColumnIndexes(columns: string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  for (const [index, column] of columns.entries()) {
    if (indexes.has(column)) {
      throw new UkSourceParseError(
        ORR_DATA_PORTAL_SOURCE_ID,
        `the metadata lists the column ${JSON.stringify(column)} more than once`
      );
    }
    indexes.set(column, index);
  }
  return indexes;
}

/** Reads one required metadata value as trimmed text. */
function readRequiredText(value: string | number | null, column: string): string {
  const text = value === null ? '' : String(value).trim();
  if (text === '') {
    throw new UkSourceParseError(
      ORR_DATA_PORTAL_SOURCE_ID,
      `the metadata row has no ${JSON.stringify(column)} value`
    );
  }
  return text;
}

/** Reads an optional metadata text value, treating blank as absent. */
function readOptionalText(value: string | number | null): string | null {
  const text = value === null ? '' : String(value).trim();
  return text === '' ? null : text;
}

/** Reads an optional row count, rejecting values that are not whole numbers. */
function readOptionalCount(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0) {
      return value;
    }
    throw new UkSourceParseError(
      ORR_DATA_PORTAL_SOURCE_ID,
      `the metadata wrote ${JSON.stringify(value)} for row_count`
    );
  }
  const text = value.trim();
  if (text === '') {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    throw new UkSourceParseError(
      ORR_DATA_PORTAL_SOURCE_ID,
      `the metadata wrote ${JSON.stringify(value)} for row_count`
    );
  }
  return Number(text);
}

/**
 * Parses the ORR metadata response into a catalogue of rail statistics tables.
 *
 * @param payload - the metadata response, or the committed fixture of one
 * @returns every theme and table ORR currently lists
 * @throws {UkSourceParseError} when the payload is not an ORR metadata response
 */
export function parseOrrDataPortalCatalogue(payload: unknown): OrrDataPortalCatalogue {
  const parsed = ORR_METADATA_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(ORR_DATA_PORTAL_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.statusCode !== 200) {
    throw new UkSourceParseError(
      ORR_DATA_PORTAL_SOURCE_ID,
      `the metadata response reported status ${String(parsed.data.statusCode)}`
    );
  }
  const columns = parsed.data.columnNames;
  const indexes = buildColumnIndexes(columns);
  for (const required of REQUIRED_METADATA_COLUMNS) {
    if (!indexes.has(required)) {
      throw new UkSourceParseError(
        ORR_DATA_PORTAL_SOURCE_ID,
        `the metadata is missing the ${JSON.stringify(required)} column`
      );
    }
  }
  const read = (row: (string | number | null)[], column: string): string | number | null => {
    const index = indexes.get(column);
    if (index === undefined) {
      throw new UkSourceParseError(
        ORR_DATA_PORTAL_SOURCE_ID,
        `the metadata is missing the ${JSON.stringify(column)} column`
      );
    }
    return row[index] ?? null;
  };
  const themes: string[] = [];
  const seenThemes = new Set<string>();
  const tables = parsed.data.dataRows.map((row) => {
    if (row.length !== columns.length) {
      throw new UkSourceParseError(
        ORR_DATA_PORTAL_SOURCE_ID,
        `a metadata row has ${String(row.length)} values for ${String(columns.length)} columns`
      );
    }
    const theme = readRequiredText(read(row, 'theme'), 'theme');
    const table = readRequiredText(read(row, 'table'), 'table');
    const apiTableName = readRequiredText(read(row, 'api_table_name'), 'api_table_name');
    const description = readRequiredText(read(row, 'description'), 'description');
    if (!seenThemes.has(theme)) {
      seenThemes.add(theme);
      themes.push(theme);
    }
    return {
      theme,
      table,
      apiTableName,
      description,
      rowCount: readOptionalCount(read(row, 'row_count')),
      lastUpdated: readOptionalText(read(row, 'last_updated')),
    };
  });
  return {
    themeCount: themes.length,
    tableCount: tables.length,
    themes,
    tables,
  };
}

/**
 * Reads the ORR data portal catalogue.
 *
 * @param options - optional fetch implementation
 * @param options.fetchImpl - fetch override, used by tests
 * @returns every theme and table the portal currently lists
 */
export async function fetchOrrDataPortalCatalogue(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<OrrDataPortalCatalogue> {
  const response = await httpGet(ORR_DATA_PORTAL_SOURCE_ID, buildOrrMetadataUrl(), {
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    headers: { accept: 'application/json' },
  });
  return parseOrrDataPortalCatalogue(await response.json());
}

/** Office of Rail and Road data portal catalogue, keyless. */
export const orrDataPortalAdapter: UkDataAdapter<OrrDataPortalCatalogue> = {
  id: ORR_DATA_PORTAL_SOURCE_ID,
  name: 'Office of Rail and Road data portal',
  auth: 'none',
  description:
    'Rail performance and usage tables from the Office of Rail and Road data portal, with each table id and description.',
  fetchLive: (options) =>
    fetchOrrDataPortalCatalogue(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseOrrDataPortalCatalogue,
  loadFixture: () =>
    parseOrrDataPortalCatalogue(readFixtureJson('orr-data-portal-2026-11-17.json')),
};
