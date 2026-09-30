/** Natural England ancient woodland polygons for England (keyless). */
export {
  ANCIENT_WOODLAND_CATEGORIES,
  ANCIENT_WOODLAND_DATASET_URL,
  ANCIENT_WOODLAND_QUERY_URL,
  ANCIENT_WOODLAND_SIZE_BANDS,
  ANCIENT_WOODLAND_SOURCE_ID,
  ancientWoodlandAdapter,
  fetchAncientWoodlandProfile,
  parseAncientWoodlandProfile,
} from './ancientWoodland.js';
/** Ancient woodland types. */
export type {
  AncientWoodlandCategory,
  AncientWoodlandCategoryId,
  AncientWoodlandProfile,
  AncientWoodlandResponses,
  AncientWoodlandSizeBand,
  AncientWoodlandSizeBandDefinition,
} from './ancientWoodland.js';
/** Bank of England Bank Rate, the daily official rate since 1975 (keyless). */
export {
  bankRateAdapter,
  BANK_RATE_CSV_URL,
  BANK_RATE_FIRST_QUERY_DATE,
  BANK_RATE_SERIES_CODE,
  BANK_RATE_SOURCE_ID,
  buildBankRateCsvUrl,
  buildBankRateSpells,
  fetchBankRateObservations,
  formatBankRateQueryDate,
  parseBankRateCsv,
  summarizeBankRateSeries,
} from './bankRate.js';
/** Bank Rate types. */
export type { BankRateObservation, BankRateSpell, BankRateSummary } from './bankRate.js';
/** National Energy System Operator half-hourly carbon intensity (keyless). */
export {
  buildCarbonIntensityWindowUrl,
  carbonIntensityAdapter,
  CARBON_INTENSITY_API_BASE_URL,
  CARBON_INTENSITY_INDEX_BANDS,
  CARBON_INTENSITY_MAX_WINDOW_DAYS,
  CARBON_INTENSITY_PERIOD_MINUTES,
  CARBON_INTENSITY_RANGE_URL,
  CARBON_INTENSITY_SOURCE_ID,
  DEFAULT_CARBON_INTENSITY_WINDOW_DAYS,
  fetchCarbonIntensityWindow,
  formatCarbonIntensityInstant,
  parseCarbonIntensityWindow,
  resolveCarbonIntensityWindow,
} from './carbonIntensity.js';
/** Carbon intensity types. */
export type {
  CarbonIntensityBandCount,
  CarbonIntensityIndex,
  CarbonIntensityPeriod,
  CarbonIntensityWindow,
} from './carbonIntensity.js';
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
/** Food Standards Agency food hygiene registers (keyless). */
export {
  DEFAULT_LARGEST_AUTHORITY_LIMIT,
  fetchFoodHygieneAuthorities,
  foodHygieneAuthoritiesAdapter,
  FSA_API_VERSION,
  FSA_API_VERSION_HEADER,
  FSA_AUTHORITIES_URL,
  parseFoodHygieneAuthorities,
  summarizeFoodHygieneAuthorities,
} from './foodHygiene.js';
/** Food hygiene register types. */
export type { FoodHygieneAuthority, FoodHygieneScheme, FoodHygieneSummary } from './foodHygiene.js';
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
/** Planning Data platform dataset catalogue, published by MHCLG (keyless). */
export {
  DEFAULT_LARGEST_DATASET_LIMIT,
  fetchPlanningDatasets,
  parsePlanningDatasets,
  planningDatasetsAdapter,
  PLANNING_DATASET_REALM,
  PLANNING_DATASETS_URL,
  summarizePlanningDatasets,
} from './planningDatasets.js';
/** Planning dataset types. */
export type { PlanningDataset, PlanningDatasetSummary } from './planningDatasets.js';
/** Home Office police.uk street-level recorded crime (keyless). */
export {
  buildPoliceStreetCrimesUrl,
  DEFAULT_POLICE_CRIME_LOCATION,
  DEFAULT_POLICE_CRIME_MONTH_COUNT,
  fetchPoliceCrimeCategories,
  fetchPoliceCrimeMonths,
  fetchPoliceCrimeSummary,
  parsePoliceCrimeSummary,
  policeCrimesAdapter,
  POLICE_API_BASE_URL,
  POLICE_CRIME_CATEGORIES_URL,
  POLICE_CRIMES_SOURCE_ID,
  POLICE_STREET_CRIMES_RADIUS_MILES,
  POLICE_STREET_CRIMES_URL,
  POLICE_STREET_DATES_URL,
} from './policeCrimes.js';
/** Recorded crime types. */
export type {
  PoliceCategoryCount,
  PoliceCrimeCategory,
  PoliceCrimeLocation,
  PoliceCrimeResponses,
  PoliceCrimeSummary,
  PoliceMonthCount,
  PoliceOutcomeCount,
} from './policeCrimes.js';
/** Transport for London Santander Cycles docking stations (keyless). */
export {
  DEFAULT_LARGEST_STATION_LIMIT,
  fetchTflBikePoints,
  parseTflBikePoints,
  summarizeTflBikePoints,
  tflBikePointsAdapter,
  TFL_BIKE_POINTS_URL,
} from './tflBikePoints.js';
/** Docking station types. */
export type { DockingStation, DockingStationSummary } from './tflBikePoints.js';
/** The uniform adapter registry and probe helpers. */
export {
  UK_DATA_SOURCES,
  getUkDataSource,
  probeAllUkDataSources,
  probeUkDataSource,
} from './registry.js';
/** Shared adapter contract types. */
export type { UkDataAdapter, UkFetchOptions, UkSourceAuth, UkSourceProbe } from './types.js';
