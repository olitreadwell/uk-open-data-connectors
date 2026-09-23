/** Errors shared by every UK source adapter. */
export { UkSourceApiError, UkSourceError, UkSourceParseError } from './errors.js';
/** Environment Agency flood-monitoring stations and readings (keyless). */
export {
  DEFAULT_FLOOD_STATION_REFERENCE,
  fetchFloodStationReadings,
  fetchFloodStations,
  floodReadingsAdapter,
  floodStationsAdapter,
  parseFloodReadings,
  parseFloodStations,
  summarizeFloodReadings,
} from './floodMonitoring.js';
/** Flood-monitoring types. */
export type {
  FloodMeasure,
  FloodReading,
  FloodReadingSummary,
  FloodStation,
} from './floodMonitoring.js';
/** Office for National Statistics dataset catalogue (keyless). */
export {
  fetchOnsDatasets,
  onsDatasetsAdapter,
  ONS_DATASETS_LIMIT,
  ONS_DATASETS_URL,
  parseOnsDatasets,
  summarizeOnsDatasets,
} from './onsDatasets.js';
/** ONS catalogue types. */
export type { OnsDatasetRecord, OnsDatasetSummary, OnsDatasetYearCount } from './onsDatasets.js';
/** The uniform adapter registry and probe helpers. */
export {
  UK_DATA_SOURCES,
  getUkDataSource,
  probeAllUkDataSources,
  probeUkDataSource,
} from './registry.js';
/** Shared adapter contract types. */
export type { UkDataAdapter, UkFetchOptions, UkSourceAuth, UkSourceProbe } from './types.js';
