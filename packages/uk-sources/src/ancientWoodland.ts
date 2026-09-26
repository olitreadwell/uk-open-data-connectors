import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Natural England's Ancient Woodland (England) polygons, served from the Defra
 * ArcGIS estate. The layer behind the Ancient Woodland Inventory: land that
 * has carried continuous woodland cover since at least 1600. Keyless, and
 * published under the Open Government Licence v3.
 */
export const ANCIENT_WOODLAND_QUERY_URL =
  'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Ancient_Woodland_England/FeatureServer/0/query';

/** The dataset's page on the Natural England open data hub. */
export const ANCIENT_WOODLAND_DATASET_URL =
  'https://naturalengland-defra.opendata.arcgis.com/datasets/ancient-woodland-england';

/** The source id these errors and probes carry. */
export const ANCIENT_WOODLAND_SOURCE_ID = 'ancient-woodland';

/** The three woodland types the layer's STATUS field uses. */
export type AncientWoodlandCategoryId = 'asnw' | 'paws' | 'awp';

/** One woodland type in the layer, with the name Natural England gives it. */
export interface AncientWoodlandCategory {
  id: AncientWoodlandCategoryId;
  /** The value the layer writes in its STATUS field. */
  status: string;
  label: string;
  description: string;
}

/**
 * The layer's own abbreviations, spelled out: Ancient Semi-Natural Woodland,
 * Plantation on an Ancient Woodland Site, and Ancient Wood Pasture.
 */
export const ANCIENT_WOODLAND_CATEGORIES: readonly AncientWoodlandCategory[] = [
  {
    id: 'asnw',
    status: 'ASNW',
    label: 'Ancient semi-natural woodland',
    description: 'Native tree and shrub cover that has never been cleared and replanted.',
  },
  {
    id: 'paws',
    status: 'PAWS',
    label: 'Plantation on ancient woodland',
    description:
      'Woodland that was felled and replanted, often with conifers, on ground that has been wooded since 1600.',
  },
  {
    id: 'awp',
    status: 'AWP',
    label: 'Ancient wood pasture',
    description: 'Wooded ground grazed by livestock or deer, usually with veteran trees.',
  },
];

/** One size band the profile counts woodland records into. */
export interface AncientWoodlandSizeBandDefinition {
  label: string;
  /** Lower bound in hectares, inclusive. */
  minHectares: number;
  /** Upper bound in hectares, exclusive; absent on the open top band. */
  maxHectares?: number;
  /** The where clause this band asks the layer for. */
  where: string;
}

/**
 * The size bands the profile counts records into, smallest first. The first
 * band is open at the bottom because a handful of records carry areas below
 * the 0.25 hectare mapping threshold.
 */
export const ANCIENT_WOODLAND_SIZE_BANDS: readonly AncientWoodlandSizeBandDefinition[] = [
  { label: 'Under 1 hectare', minHectares: 0, maxHectares: 1, where: 'AREA < 1' },
  { label: '1 to 2 hectares', minHectares: 1, maxHectares: 2, where: 'AREA >= 1 AND AREA < 2' },
  { label: '2 to 5 hectares', minHectares: 2, maxHectares: 5, where: 'AREA >= 2 AND AREA < 5' },
  {
    label: '5 to 10 hectares',
    minHectares: 5,
    maxHectares: 10,
    where: 'AREA >= 5 AND AREA < 10',
  },
  {
    label: '10 to 20 hectares',
    minHectares: 10,
    maxHectares: 20,
    where: 'AREA >= 10 AND AREA < 20',
  },
  {
    label: '20 to 50 hectares',
    minHectares: 20,
    maxHectares: 50,
    where: 'AREA >= 20 AND AREA < 50',
  },
  {
    label: '50 to 100 hectares',
    minHectares: 50,
    maxHectares: 100,
    where: 'AREA >= 50 AND AREA < 100',
  },
  { label: '100 hectares or more', minHectares: 100, where: 'AREA >= 100' },
];

/** One size band with the records the layer returned for it. */
export interface AncientWoodlandSizeBand {
  label: string;
  minHectares: number;
  maxHectares?: number;
  recordCount: number;
  /** Records in this band, counted by woodland type. */
  categoryCounts: Record<AncientWoodlandCategoryId, number>;
}

/** Everything the ancient woodland story draws, counted by the layer itself. */
export interface AncientWoodlandProfile {
  recordCount: number;
  totalHectares: number;
  largestRecordHectares: number;
  averageRecordHectares: number;
  /** Records per woodland type across the whole layer. */
  categoryCounts: Record<AncientWoodlandCategoryId, number>;
  /** Hectares per woodland type across the whole layer. */
  categoryHectares: Record<AncientWoodlandCategoryId, number>;
  /** One entry per size band, smallest first. */
  sizeBands: AncientWoodlandSizeBand[];
}

/** The raw layer responses one profile is parsed from. */
export interface AncientWoodlandResponses {
  /** Count, sum, max, and average over the whole layer. */
  totals: unknown;
  /** Count and area per woodland type over the whole layer. */
  categoryTotals: unknown;
  /** One grouped count response per entry in {@link ANCIENT_WOODLAND_SIZE_BANDS}. */
  sizeBandCounts: unknown[];
}

const ARCGIS_STATISTICS_RESPONSE_SCHEMA = z.object({
  features: z.array(z.object({ attributes: z.record(z.unknown()) })),
});

const ANCIENT_WOODLAND_RESPONSES_SCHEMA = z.object({
  totals: ARCGIS_STATISTICS_RESPONSE_SCHEMA,
  categoryTotals: ARCGIS_STATISTICS_RESPONSE_SCHEMA,
  sizeBandCounts: z.array(ARCGIS_STATISTICS_RESPONSE_SCHEMA),
});

/** The ArcGIS error body, which arrives with HTTP 200 rather than a 4xx. */
const ARCGIS_ERROR_SCHEMA = z.object({
  error: z.object({ message: z.string().optional() }),
});

/** Every category starts at zero, so a missing type reads as none rather than undefined. */
function emptyCategoryRecord(): Record<AncientWoodlandCategoryId, number> {
  return { asnw: 0, paws: 0, awp: 0 };
}

/** Looks up the woodland type behind one STATUS value, or throws when it is new. */
function categoryIdForStatus(status: unknown): AncientWoodlandCategoryId {
  const match = ANCIENT_WOODLAND_CATEGORIES.find((category) => category.status === status);
  if (match === undefined) {
    throw new UkSourceParseError(
      ANCIENT_WOODLAND_SOURCE_ID,
      `unrecognised woodland status ${JSON.stringify(status)}`
    );
  }
  return match.id;
}

/** Reads one numeric attribute, naming it when the layer left it out. */
function readNumberAttribute(attributes: Record<string, unknown>, name: string): number {
  const raw = attributes[name];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new UkSourceParseError(
      ANCIENT_WOODLAND_SOURCE_ID,
      `expected a number in "${name}", got ${JSON.stringify(raw)}`
    );
  }
  return raw;
}

/** Reads the single row of a whole-layer statistics response. */
function readAttributeRows(
  response: z.infer<typeof ARCGIS_STATISTICS_RESPONSE_SCHEMA>
): Record<string, unknown>[] {
  return response.features.map((feature) => feature.attributes);
}

/**
 * Adds up the layer's counts and woodland types from its own statistics.
 *
 * The size bands are asked for one at a time, so the parser checks that they
 * add up to the layer's own total before trusting them: a query that silently
 * drops records would otherwise show as a short bar rather than an error.
 *
 * @param payload - the raw responses, or the committed fixture of them
 * @returns record, area, and size-band counts for the layer
 */
export function parseAncientWoodlandProfile(payload: unknown): AncientWoodlandProfile {
  const parsed = ANCIENT_WOODLAND_RESPONSES_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(ANCIENT_WOODLAND_SOURCE_ID, parsed.error.message);
  }
  const { totals, categoryTotals, sizeBandCounts } = parsed.data;
  if (sizeBandCounts.length !== ANCIENT_WOODLAND_SIZE_BANDS.length) {
    throw new UkSourceParseError(
      ANCIENT_WOODLAND_SOURCE_ID,
      `expected ${ANCIENT_WOODLAND_SIZE_BANDS.length} size band responses, got ${sizeBandCounts.length}`
    );
  }

  const totalsRow = readAttributeRows(totals)[0];
  if (totalsRow === undefined) {
    throw new UkSourceParseError(ANCIENT_WOODLAND_SOURCE_ID, 'the totals query returned no rows');
  }
  const recordCount = readNumberAttribute(totalsRow, 'recordCount');

  const categoryCounts = emptyCategoryRecord();
  const categoryHectares = emptyCategoryRecord();
  for (const row of readAttributeRows(categoryTotals)) {
    const categoryId = categoryIdForStatus(row.STATUS);
    categoryCounts[categoryId] = readNumberAttribute(row, 'recordCount');
    categoryHectares[categoryId] = readNumberAttribute(row, 'hectares');
  }

  const sizeBands: AncientWoodlandSizeBand[] = ANCIENT_WOODLAND_SIZE_BANDS.map(
    (definition, index) => {
      const response = sizeBandCounts[index];
      if (response === undefined) {
        throw new UkSourceParseError(
          ANCIENT_WOODLAND_SOURCE_ID,
          `no response for the "${definition.label}" band`
        );
      }
      const bandCounts = emptyCategoryRecord();
      for (const row of readAttributeRows(response)) {
        bandCounts[categoryIdForStatus(row.STATUS)] = readNumberAttribute(row, 'recordCount');
      }
      const bandTotal = ANCIENT_WOODLAND_CATEGORIES.reduce(
        (total, category) => total + bandCounts[category.id],
        0
      );
      return {
        label: definition.label,
        minHectares: definition.minHectares,
        ...(definition.maxHectares === undefined ? {} : { maxHectares: definition.maxHectares }),
        recordCount: bandTotal,
        categoryCounts: bandCounts,
      };
    }
  );

  const bandRecordCount = sizeBands.reduce((total, band) => total + band.recordCount, 0);
  if (bandRecordCount !== recordCount) {
    throw new UkSourceParseError(
      ANCIENT_WOODLAND_SOURCE_ID,
      `the size bands hold ${bandRecordCount} records against a layer total of ${recordCount}`
    );
  }

  return {
    recordCount,
    totalHectares: readNumberAttribute(totalsRow, 'hectares'),
    largestRecordHectares: readNumberAttribute(totalsRow, 'largestHectares'),
    averageRecordHectares: readNumberAttribute(totalsRow, 'averageHectares'),
    categoryCounts,
    categoryHectares,
    sizeBands,
  };
}

/** One ArcGIS statistics query: what to filter, what to ask for, how to group. */
interface ArcgisStatisticsQuery {
  where: string;
  statistics: { statisticType: string; onStatisticField: string; outStatisticFieldName: string }[];
  groupByField?: string;
}

/** Count and area per group, the shape every query here asks for. */
const COUNT_AND_AREA_STATISTICS: ArcgisStatisticsQuery['statistics'] = [
  { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'recordCount' },
  { statisticType: 'sum', onStatisticField: 'AREA', outStatisticFieldName: 'hectares' },
];

/** Count, area, largest, and average over the whole layer. */
const LAYER_TOTALS_STATISTICS: ArcgisStatisticsQuery['statistics'] = [
  ...COUNT_AND_AREA_STATISTICS,
  { statisticType: 'max', onStatisticField: 'AREA', outStatisticFieldName: 'largestHectares' },
  { statisticType: 'avg', onStatisticField: 'AREA', outStatisticFieldName: 'averageHectares' },
];

/** Runs one statistics query, turning ArcGIS's 200-with-an-error into a throw. */
async function queryArcgisStatistics(
  fetchImpl: typeof globalThis.fetch,
  query: ArcgisStatisticsQuery
): Promise<unknown> {
  const url = new URL(ANCIENT_WOODLAND_QUERY_URL);
  url.searchParams.set('where', query.where);
  url.searchParams.set('outStatistics', JSON.stringify(query.statistics));
  if (query.groupByField !== undefined) {
    url.searchParams.set('groupByFieldsForStatistics', query.groupByField);
  }
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UkSourceApiError(
      ANCIENT_WOODLAND_SOURCE_ID,
      `HTTP ${response.status} querying the ancient woodland layer`
    );
  }
  const payload: unknown = await response.json();
  const arcgisError = ARCGIS_ERROR_SCHEMA.safeParse(payload);
  if (arcgisError.success) {
    throw new UkSourceApiError(
      ANCIENT_WOODLAND_SOURCE_ID,
      arcgisError.data.error.message ?? 'the layer rejected a statistics query'
    );
  }
  return payload;
}

/**
 * Counts England's ancient woodland from Natural England's own layer.
 *
 * The layer holds more than fifty thousand polygons, well past ArcGIS's page
 * size, so the counts come from the service's statistics rather than from a
 * download: one query for the layer totals, one for the woodland types, and
 * one per size band.
 *
 * @param options - an optional fetch implementation
 * @returns record, area, and size-band counts for the layer
 */
export async function fetchAncientWoodlandProfile(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<AncientWoodlandProfile> {
  const { fetchImpl = globalThis.fetch } = options;
  const [totals, categoryTotals, ...sizeBandCounts] = await Promise.all([
    queryArcgisStatistics(fetchImpl, { where: '1=1', statistics: LAYER_TOTALS_STATISTICS }),
    queryArcgisStatistics(fetchImpl, {
      where: '1=1',
      statistics: COUNT_AND_AREA_STATISTICS,
      groupByField: 'STATUS',
    }),
    ...ANCIENT_WOODLAND_SIZE_BANDS.map((band) =>
      queryArcgisStatistics(fetchImpl, {
        where: band.where,
        statistics: COUNT_AND_AREA_STATISTICS,
        groupByField: 'STATUS',
      })
    ),
  ]);
  return parseAncientWoodlandProfile({ totals, categoryTotals, sizeBandCounts });
}

/** Natural England's ancient woodland layer for England, keyless. */
export const ancientWoodlandAdapter: UkDataAdapter<AncientWoodlandProfile> = {
  id: ANCIENT_WOODLAND_SOURCE_ID,
  name: 'Natural England ancient woodland (England)',
  auth: 'none',
  description: 'Ancient woodland polygons for England, counted by woodland type and by size.',
  fetchLive: (options) =>
    fetchAncientWoodlandProfile({
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseAncientWoodlandProfile,
  loadFixture: () => parseAncientWoodlandProfile(readFixtureJson('ancient-woodland.json')),
};
