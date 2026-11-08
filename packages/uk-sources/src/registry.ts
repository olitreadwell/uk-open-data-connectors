import { ancientWoodlandAdapter } from './ancientWoodland.js';
import { bankRateAdapter } from './bankRate.js';
import { bgsWmsAdapter } from './bgsWms.js';
import { carbonIntensityAdapter } from './carbonIntensity.js';
import { dataGovUkCkanAdapter } from './dataGovUkCkan.js';
import { elexonSystemPricesAdapter } from './elexonSystemPrices.js';
import { exploreEducationStatisticsAdapter } from './exploreEducationStatistics.js';
import { findATenderAdapter } from './findATender.js';
import { fingertipsIndicatorsAdapter } from './fingertipsIndicators.js';
import { floodReadingsAdapter, floodStationsAdapter } from './floodMonitoring.js';
import { foodHygieneAuthoritiesAdapter } from './foodHygiene.js';
import { gazetteNoticesAdapter } from './gazetteNotices.js';
import { govUkContentAdapter } from './govUkContent.js';
import { legislationSearchAdapter } from './legislationSearch.js';
import { londonDatastoreAdapter } from './londonDatastore.js';
import { nesoCatalogueAdapter } from './nesoCatalogue.js';
import { nesoGenerationMixAdapter } from './nesoGenerationMix.js';
import { nhsbsaCkanAdapter } from './nhsbsaCkan.js';
import { nomisAdapter } from './nomis.js';
import { onsGeographyAdapter } from './onsGeography.js';
import { onsDatasetsAdapter } from './onsDatasets.js';
import { parliamentSeatsAdapter } from './parliamentSeats.js';
import { planningDatasetsAdapter } from './planningDatasets.js';
import { policeCrimesAdapter } from './policeCrimes.js';
import { postcodeLookupAdapter } from './postcodeLookup.js';
import { publicHealthScotlandAdapter } from './publicHealthScotland.js';
import { tflBikePointsAdapter } from './tflBikePoints.js';
import { tflLineStatusAdapter } from './tflLineStatus.js';
import { tnaDiscoveryAdapter } from './tnaDiscovery.js';
import { ukParliamentCommitteesAdapter } from './ukParliamentCommittees.js';
import { ukhsaDashboardAdapter } from './ukhsaDashboard.js';
import { ukriGtrAwardsAdapter } from './ukriGtrAwards.js';
import type { UkDataAdapter, UkFetchOptions, UkSourceProbe } from './types.js';

/** Every UK data source behind the uniform adapter interface. */
export const UK_DATA_SOURCES: UkDataAdapter<unknown>[] = [
  floodStationsAdapter,
  floodReadingsAdapter,
  onsDatasetsAdapter,
  foodHygieneAuthoritiesAdapter,
  tflBikePointsAdapter,
  planningDatasetsAdapter,
  ancientWoodlandAdapter,
  bankRateAdapter,
  policeCrimesAdapter,
  carbonIntensityAdapter,
  parliamentSeatsAdapter,
  postcodeLookupAdapter,
  exploreEducationStatisticsAdapter,
  londonDatastoreAdapter,
  tnaDiscoveryAdapter,
  ukhsaDashboardAdapter,
  nomisAdapter,
  fingertipsIndicatorsAdapter,
  findATenderAdapter,
  tflLineStatusAdapter,
  publicHealthScotlandAdapter,
  nhsbsaCkanAdapter,
  nesoGenerationMixAdapter,
  dataGovUkCkanAdapter,
  govUkContentAdapter,
  ukParliamentCommitteesAdapter,
  elexonSystemPricesAdapter,
  ukriGtrAwardsAdapter,
  legislationSearchAdapter,
  gazetteNoticesAdapter,
  onsGeographyAdapter,
  nesoCatalogueAdapter,
  bgsWmsAdapter,
];

/** Looks up a source adapter by id. */
export function getUkDataSource<T>(id: string): UkDataAdapter<T> | undefined {
  return UK_DATA_SOURCES.find((source) => source.id === id) as UkDataAdapter<T> | undefined;
}

/** Probes one source with a live fetch and reports the outcome. */
export async function probeUkDataSource<T>(
  adapter: UkDataAdapter<T>,
  options?: { apiKey?: string; fetchImpl?: typeof globalThis.fetch }
): Promise<UkSourceProbe> {
  try {
    const fetchOptions: UkFetchOptions = {
      ...(options?.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    };
    const data = await adapter.fetchLive(fetchOptions);
    return {
      id: adapter.id,
      name: adapter.name,
      auth: adapter.auth,
      ok: true,
      status: 'ok',
      sample: JSON.stringify(data).slice(0, 120),
    };
  } catch (error) {
    return {
      id: adapter.id,
      name: adapter.name,
      auth: adapter.auth,
      ok: false,
      status: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Probes the requested sources in parallel, with optional per-source keys. */
export async function probeAllUkDataSources(options?: {
  apiKey?: string;
  apiKeys?: Record<string, string>;
  fetchImpl?: typeof globalThis.fetch;
  ids?: string[];
}): Promise<UkSourceProbe[]> {
  const { apiKey, apiKeys, fetchImpl, ids } = options ?? {};
  if (ids !== undefined) {
    const known = new Set(UK_DATA_SOURCES.map((source) => source.id));
    const unknown = [...new Set(ids.filter((id) => !known.has(id)))];
    if (unknown.length > 0) {
      const noun = unknown.length === 1 ? 'id' : 'ids';
      const list = unknown.map((id) => `"${id}"`).join(', ');
      throw new Error(`Unknown UK source ${noun} ${list}. Call list_sources for the ids.`);
    }
  }
  const wanted = ids === undefined ? undefined : new Set(ids);
  return Promise.all(
    UK_DATA_SOURCES.filter((source) => wanted === undefined || wanted.has(source.id)).map(
      (source) => {
        const key = apiKeys?.[source.id] ?? apiKey;
        return probeUkDataSource(source, {
          ...(key === undefined ? {} : { apiKey: key }),
          ...(fetchImpl === undefined ? {} : { fetchImpl }),
        });
      }
    )
  );
}
