import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UkDataAdapter } from './types.js';

/**
 * The Natural England Open Data Geoportal's DCAT catalogue. Keyless, and it
 * lists the protected sites, habitats, species, and landscape datasets Natural
 * England publishes for England.
 */
export const NATURAL_ENGLAND_DATASETS_URL =
  'https://naturalengland-defra.opendata.arcgis.com/api/feed/dcat-us/1.1.json';

/** The source id these errors and probes carry. */
export const NATURAL_ENGLAND_DATASETS_SOURCE_ID = 'natural-england-datasets';

/** How many of the newest datasets the summary keeps by default. */
export const DEFAULT_NEWEST_DATASET_LIMIT = 10;

/** The licence families the portal's catalogue carries. */
export type NaturalEnglandLicence =
  | 'ogl'
  | 'non-commercial-government-licence'
  | 'natural-england-terms'
  | 'creative-commons-attribution'
  | 'unstated'
  | 'other';

/** Every licence family, in the order the summary lists them. */
const NATURAL_ENGLAND_LICENCES: readonly NaturalEnglandLicence[] = [
  'ogl',
  'non-commercial-government-licence',
  'natural-england-terms',
  'creative-commons-attribution',
  'unstated',
  'other',
];

/** One download or API link for a dataset. */
export interface NaturalEnglandDistribution {
  /** The distribution title, such as `CSV` or `ArcGIS GeoService`. */
  title: string;
  /** The format label, such as `CSV`, `GeoJSON`, or `Web Page`. */
  format: string;
  /** The download or service URL, or "" when the feed leaves it out. */
  url: string;
}

/** One dataset in the Natural England open data catalogue. */
export interface NaturalEnglandDataset {
  /** The ArcGIS item identifier, including its sublayer when it has one. */
  id: string;
  /** The bare ArcGIS item id, or null when the identifier has none. */
  itemId: string | null;
  title: string;
  /** The dataset description as plain text. */
  description: string;
  /** The dataset's page on the Natural England geoportal. */
  landingPage: string;
  keywords: string[];
  /** The publication date, as an ISO 8601 instant, or null when unset. */
  issued: string | null;
  /** The last update, as an ISO 8601 instant, or null when unset. */
  modified: string | null;
  publisher: string;
  /** The licence family the portal's text names. */
  licence: NaturalEnglandLicence;
  /** The portal's licence text as plain text, or null when it states none. */
  licenceText: string | null;
  /** The unique data formats, with `Web Page` left out. */
  formats: string[];
  distributions: NaturalEnglandDistribution[];
}

/** One format count in the catalogue summary. */
export interface NaturalEnglandFormatCount {
  format: string;
  datasetCount: number;
}

/** Rolled-up shape of the Natural England dataset catalogue. */
export interface NaturalEnglandDatasetSummary {
  datasetCount: number;
  licenceCounts: Record<NaturalEnglandLicence, number>;
  /** Data formats ranked by how many datasets publish them, largest first. */
  formatCounts: NaturalEnglandFormatCount[];
  /** The datasets updated most recently, newest first. */
  newestDatasets: NaturalEnglandDataset[];
}

const DISTRIBUTION_SCHEMA = z.object({
  title: z.string().optional(),
  format: z.string().optional(),
  accessURL: z.string().optional(),
});

const DATASET_SCHEMA = z.object({
  identifier: z.string().nullable().optional(),
  landingPage: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  keyword: z.array(z.string().nullable()).optional(),
  issued: z.string().nullable().optional(),
  modified: z.string().nullable().optional(),
  publisher: z.object({ name: z.string().optional() }).optional(),
  license: z.string().nullable().optional(),
  distribution: z.array(DISTRIBUTION_SCHEMA).optional(),
});

const CATALOGUE_SCHEMA = z.object({
  dataset: z.array(DATASET_SCHEMA),
});

const HTML_ENTITY_PATTERN = /&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi;

/**
 * Replaces the handful of HTML entities the portal writes. Each entity is
 * replaced once, so a double-escaped entity stays escaped rather than turning
 * into markup.
 */
function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY_PATTERN, (entity, name: string) => {
    switch (name.toLowerCase()) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      case 'nbsp':
        return ' ';
      default:
        if (name.startsWith('#x') || name.startsWith('#X')) {
          return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
        }
        return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    }
  });
}

/** Turns the feed's HTML descriptions and licence text into plain text. */
function readPlainText(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return decodeHtmlEntities(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Names the licence family a portal licence text belongs to.
 *
 * @param value - the portal's `license` text, or null when it states none
 * @returns the licence family the text names
 */
export function classifyNaturalEnglandLicence(
  value: string | null | undefined
): NaturalEnglandLicence {
  const text = readPlainText(value);
  if (text === '' || text.toLowerCase() === 'null') {
    return 'unstated';
  }
  if (/open government licence/i.test(text)) {
    return 'ogl';
  }
  if (/non-commercial government licence/i.test(text)) {
    return 'non-commercial-government-licence';
  }
  if (
    /natural england/i.test(text) &&
    /(terms of use|maps and data|information and data)/i.test(text)
  ) {
    return 'natural-england-terms';
  }
  if (/creative ?commons/i.test(text) || /creativecommons\.org\/licenses\/by\//i.test(text)) {
    return 'creative-commons-attribution';
  }
  return 'other';
}

/** Reads the ArcGIS item id from a catalogue identifier URL. */
function readItemId(identifier: string | null | undefined): string | null {
  if (identifier === null || identifier === undefined) {
    return null;
  }
  const match = /[?&]id=([^&]+)/.exec(identifier);
  return match === null ? null : decodeURIComponent(match[1] ?? '');
}

/**
 * Parses a Natural England DCAT feed into dataset records.
 *
 * The hub writes its own pages into the same feed as `dcat:Dataset` entries.
 * Real data entries carry a `/datasets/` landing page, so the parser keeps
 * those and drops the pages for contact details, accessibility, and cookies.
 *
 * @param payload - the raw JSON body from the DCAT feed
 * @returns one entry per dataset, in the order the portal lists them
 */
export function parseNaturalEnglandDatasets(payload: unknown): NaturalEnglandDataset[] {
  const parsed = CATALOGUE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(NATURAL_ENGLAND_DATASETS_SOURCE_ID, parsed.error.message);
  }
  return parsed.data.dataset
    .filter((entry) => entry.landingPage.includes('/datasets/'))
    .map((entry) => {
      const licenceText = readPlainText(entry.license);
      const distributions = (entry.distribution ?? []).map((distribution) => ({
        title: distribution.title ?? '',
        format: distribution.format ?? '',
        url: distribution.accessURL ?? '',
      }));
      const formats = [...new Set(distributions.map((distribution) => distribution.format))].filter(
        (format) => format !== '' && format !== 'Web Page'
      );
      return {
        id: entry.identifier ?? entry.landingPage,
        itemId: readItemId(entry.identifier),
        title: entry.title,
        description: readPlainText(entry.description),
        landingPage: entry.landingPage,
        keywords: (entry.keyword ?? []).filter(
          (keyword): keyword is string => keyword !== null && keyword.trim() !== ''
        ),
        issued: entry.issued ?? null,
        modified: entry.modified ?? null,
        publisher: entry.publisher?.name ?? '',
        licence: classifyNaturalEnglandLicence(entry.license),
        licenceText:
          licenceText === '' || licenceText.toLowerCase() === 'null' ? null : licenceText,
        formats,
        distributions,
      };
    });
}

/**
 * Totals the catalogue by licence and format, and keeps the newest datasets.
 *
 * @param datasets - datasets from {@link parseNaturalEnglandDatasets}
 * @param newestDatasetLimit - how many to keep in `newestDatasets`
 * @returns dataset, licence, and format counts plus the newest datasets
 * @throws {RangeError} when the newest dataset limit is not a positive whole number
 */
export function summarizeNaturalEnglandDatasets(
  datasets: NaturalEnglandDataset[],
  newestDatasetLimit: number = DEFAULT_NEWEST_DATASET_LIMIT
): NaturalEnglandDatasetSummary {
  if (!Number.isInteger(newestDatasetLimit) || newestDatasetLimit < 1) {
    throw new RangeError(
      `newestDatasetLimit must be a positive whole number, got ${String(newestDatasetLimit)}`
    );
  }
  const licenceCounts = Object.fromEntries(
    NATURAL_ENGLAND_LICENCES.map((licence) => [licence, 0])
  ) as Record<NaturalEnglandLicence, number>;
  const formatDatasetCounts = new Map<string, number>();
  for (const dataset of datasets) {
    licenceCounts[dataset.licence] += 1;
    for (const format of dataset.formats) {
      formatDatasetCounts.set(format, (formatDatasetCounts.get(format) ?? 0) + 1);
    }
  }
  const formatCounts = [...formatDatasetCounts.entries()]
    .map(([format, datasetCount]) => ({ format, datasetCount }))
    .sort(
      (left, right) =>
        right.datasetCount - left.datasetCount || left.format.localeCompare(right.format)
    );
  const newestDatasets = [...datasets]
    .sort((left, right) => {
      if (left.modified === null && right.modified === null) {
        return left.title.localeCompare(right.title);
      }
      if (left.modified === null) {
        return 1;
      }
      if (right.modified === null) {
        return -1;
      }
      return right.modified.localeCompare(left.modified) || left.title.localeCompare(right.title);
    })
    .slice(0, newestDatasetLimit);
  return {
    datasetCount: datasets.length,
    licenceCounts,
    formatCounts,
    newestDatasets,
  };
}

/**
 * Lists every dataset on the Natural England geoportal.
 *
 * @param options - an optional fetch implementation
 * @returns the datasets the DCAT feed returns
 */
export async function fetchNaturalEnglandDatasets(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<NaturalEnglandDataset[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await httpGet(NATURAL_ENGLAND_DATASETS_SOURCE_ID, NATURAL_ENGLAND_DATASETS_URL, {
    fetchImpl,
    headers: { accept: 'application/json' },
  });
  return parseNaturalEnglandDatasets(await response.json());
}

/** Natural England open data catalogue, keyless and published on the geoportal. */
export const naturalEnglandDatasetsAdapter: UkDataAdapter<NaturalEnglandDataset[]> = {
  id: NATURAL_ENGLAND_DATASETS_SOURCE_ID,
  name: 'Natural England open data catalogue',
  auth: 'none',
  description:
    'Every dataset on the Natural England Open Data Geoportal, with its licence, formats, and last update.',
  fetchLive: (options) =>
    fetchNaturalEnglandDatasets(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseNaturalEnglandDatasets,
  loadFixture: () =>
    parseNaturalEnglandDatasets(readFixtureJson('natural-england-datasets-2026-11-20.json')),
};
