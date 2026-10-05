import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Nomis, the Office for National Statistics' online labour-market database,
 * run with the University of Durham. Keyless, published under the Open
 * Government Licence v3.
 */
export const NOMIS_SOURCE_ID = 'nomis';

/**
 * The SDMX dataset definitions catalogue. It carries one definition per
 * dataset, with the dimensions and annotations behind it.
 */
export const NOMIS_DATASET_DEFINITIONS_URL =
  'https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json';

/** Annotation titles this adapter reads out of each dataset definition. */
export const NOMIS_STATUS_ANNOTATION = 'Status';
export const NOMIS_KEYWORDS_ANNOTATION = 'Keywords';
export const NOMIS_UNITS_ANNOTATION = 'Units';
export const NOMIS_LAST_UPDATED_ANNOTATION = 'LastUpdated';

/** One dataset definition from the Nomis SDMX catalogue. */
export interface NomisDatasetDefinition {
  /** Nomis dataset id, such as NM_1_1. */
  id: string;
  name: string;
  agencyId: string;
  version: number;
  /** The API's own URI slug for the dataset. */
  uri: string;
  /** Maintenance status, such as "Current (being actively updated)". */
  status: string;
  /** Comma-separated keywords the catalogue tags the dataset with. */
  keywords: string;
  /** The units the dataset counts in, or "" when the catalogue leaves them out. */
  units: string;
  /** The catalogue's own last-updated stamp, or "" when it leaves it out. */
  lastUpdated: string;
}

/** Dataset definitions counted by their catalogue status. */
export interface NomisStatusCount {
  status: string;
  datasetCount: number;
}

/** Rolled-up view of the Nomis dataset catalogue. */
export interface NomisCatalogSummary {
  datasetCount: number;
  statusCounts: NomisStatusCount[];
}

// The catalogue types most annotation values as text, but some count values
// are numbers and a few MetadataText entries are null. Both appear in the
// live catalogue, so the schema accepts all three.
const NOMIS_ANNOTATION_SCHEMA = z.object({
  annotationtitle: z.string(),
  annotationtext: z.union([z.string(), z.number(), z.boolean()]).nullable(),
});

const NOMIS_KEYFAMILY_SCHEMA = z.object({
  agencyid: z.string(),
  id: z.string(),
  uri: z.string(),
  version: z.number(),
  annotations: z
    .object({ annotation: z.array(NOMIS_ANNOTATION_SCHEMA) })
    .nullable()
    .optional(),
  name: z.object({ value: z.string() }).nullable().optional(),
  description: z.object({ value: z.string() }).nullable().optional(),
});

const NOMIS_DATASET_DEFINITIONS_SCHEMA = z.object({
  structure: z.object({
    keyfamilies: z
      .object({ keyfamily: z.array(NOMIS_KEYFAMILY_SCHEMA) })
      .nullable()
      .optional(),
  }),
});

/** Turns an annotation value the catalogue types loosely into a string. */
function readAnnotationText(value: string | number | boolean | null): string {
  if (value === null) {
    return '';
  }
  return typeof value === 'string' ? value : String(value);
}

/** Reads one named annotation off a dataset definition, or "" when absent. */
function readAnnotation(
  annotations: { annotationtitle: string; annotationtext: string | number | boolean | null }[],
  title: string
): string {
  const match = annotations.find((annotation) => annotation.annotationtitle === title);
  return match === undefined ? '' : readAnnotationText(match.annotationtext);
}

/**
 * Parses a Nomis SDMX dataset definitions payload.
 *
 * @param payload - the raw JSON body from the definitions catalogue
 * @returns one definition per dataset the catalogue lists
 */
export function parseNomisDatasetDefinitions(payload: unknown): NomisDatasetDefinition[] {
  const parsed = NOMIS_DATASET_DEFINITIONS_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('nomis', parsed.error.message);
  }
  const keyfamilies = parsed.data.structure.keyfamilies?.keyfamily ?? [];
  return keyfamilies.map((keyfamily) => {
    const annotations = keyfamily.annotations?.annotation ?? [];
    return {
      id: keyfamily.id,
      name: keyfamily.name?.value ?? '',
      agencyId: keyfamily.agencyid,
      version: keyfamily.version,
      uri: keyfamily.uri,
      status: readAnnotation(annotations, NOMIS_STATUS_ANNOTATION),
      keywords: readAnnotation(annotations, NOMIS_KEYWORDS_ANNOTATION),
      units: readAnnotation(annotations, NOMIS_UNITS_ANNOTATION),
      lastUpdated: readAnnotation(annotations, NOMIS_LAST_UPDATED_ANNOTATION),
    };
  });
}

/**
 * Counts the catalogue by dataset status.
 *
 * @param definitions - definitions from {@link parseNomisDatasetDefinitions}
 * @returns the dataset count and a per-status breakdown, most datasets first
 */
export function summarizeNomisDatasetDefinitions(
  definitions: NomisDatasetDefinition[]
): NomisCatalogSummary {
  const countByStatus = new Map<string, number>();
  for (const definition of definitions) {
    countByStatus.set(definition.status, (countByStatus.get(definition.status) ?? 0) + 1);
  }
  const statusCounts: NomisStatusCount[] = [...countByStatus.entries()]
    .map(([status, datasetCount]) => ({ status, datasetCount }))
    .sort(
      (left, right) =>
        right.datasetCount - left.datasetCount || left.status.localeCompare(right.status)
    );
  return { datasetCount: definitions.length, statusCounts };
}

/**
 * Lists every dataset definition in the Nomis SDMX catalogue.
 *
 * @param options - an optional fetch implementation
 * @returns the definitions the catalogue returns
 */
export async function fetchNomisDatasetDefinitions(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<NomisDatasetDefinition[]> {
  const { fetchImpl = globalThis.fetch } = options;
  const response = await fetchImpl(NOMIS_DATASET_DEFINITIONS_URL);
  if (!response.ok) {
    throw new UkSourceApiError('nomis', `HTTP ${response.status} listing dataset definitions`);
  }
  return parseNomisDatasetDefinitions(await response.json());
}

/** Nomis SDMX dataset definitions, keyless. */
export const nomisAdapter: UkDataAdapter<NomisDatasetDefinition[]> = {
  id: NOMIS_SOURCE_ID,
  name: 'Nomis SDMX dataset catalogue',
  auth: 'none',
  description: 'Every dataset definition the ONS Nomis catalogue publishes, with its status.',
  fetchLive: (options) =>
    fetchNomisDatasetDefinitions(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseNomisDatasetDefinitions,
  loadFixture: () => parseNomisDatasetDefinitions(readFixtureJson('nomis-2026-10-05.json')),
};
