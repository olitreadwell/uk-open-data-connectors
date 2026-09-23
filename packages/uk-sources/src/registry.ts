import { floodReadingsAdapter, floodStationsAdapter } from './floodMonitoring';
import { foodHygieneAuthoritiesAdapter } from './foodHygiene';
import { onsDatasetsAdapter } from './onsDatasets';
import type { UkDataAdapter, UkFetchOptions, UkSourceProbe } from './types';

/** Every UK data source behind the uniform adapter interface. */
export const UK_DATA_SOURCES: UkDataAdapter<unknown>[] = [
  floodStationsAdapter,
  floodReadingsAdapter,
  onsDatasetsAdapter,
  foodHygieneAuthoritiesAdapter,
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

/** Probes every registered source in parallel, with optional per-source keys. */
export async function probeAllUkDataSources(options?: {
  apiKey?: string;
  apiKeys?: Record<string, string>;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<UkSourceProbe[]> {
  const { apiKey, apiKeys, fetchImpl } = options ?? {};
  return Promise.all(
    UK_DATA_SOURCES.map((source) => {
      const key = apiKeys?.[source.id] ?? apiKey;
      return probeUkDataSource(source, {
        ...(key === undefined ? {} : { apiKey: key }),
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      });
    })
  );
}
