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
/** Department for Education Explore Education Statistics publications (keyless). */
export {
  buildExploreEducationPublicationsUrl,
  EXPLORE_EDUCATION_PUBLICATIONS_PAGE_SIZE,
  EXPLORE_EDUCATION_PUBLICATIONS_URL,
  EXPLORE_EDUCATION_STATISTICS_SOURCE_ID,
  exploreEducationStatisticsAdapter,
  fetchExploreEducationPublications,
  parseExploreEducationPublications,
  summarizeExploreEducationPublications,
} from './exploreEducationStatistics.js';
/** Explore Education Statistics types. */
export type {
  ExploreEducationPublication,
  ExploreEducationPublicationsPage,
  ExploreEducationPublicationsSummary,
} from './exploreEducationStatistics.js';
/** Errors shared by every UK source adapter. */
export { UkSourceApiError, UkSourceError, UkSourceParseError } from './errors.js';
/** Fingertips public health indicator metadata, published by OHID (keyless). */
export {
  buildFingertipsIndicatorUrl,
  DEFAULT_FINGERTIPS_INDICATOR_IDS,
  fetchFingertipsIndicators,
  FINGERTIPS_INDICATOR_METADATA_URL,
  FINGERTIPS_INDICATORS_SOURCE_ID,
  fingertipsIndicatorsAdapter,
  parseFingertipsIndicators,
  summarizeFingertipsIndicators,
} from './fingertipsIndicators.js';
/** Fingertips indicator types. */
export type {
  FingertipsIndicatorMetadata,
  FingertipsIndicatorsSummary,
} from './fingertipsIndicators.js';
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
/** London Datastore catalogue, published by the Greater London Authority (keyless). */
export {
  fetchLondonDatastorePackages,
  LONDON_DATASTORE_PACKAGE_LIST_URL,
  LONDON_DATASTORE_SOURCE_ID,
  londonDatastoreAdapter,
  parseLondonDatastorePackages,
  summarizeLondonDatastorePackages,
} from './londonDatastore.js';
/** London Datastore types. */
export type { LondonDatastorePackage, LondonDatastoreSummary } from './londonDatastore.js';
/** NHS Business Services Authority open data catalogue (keyless). */
export {
  fetchNhsbsaCkanPackages,
  NHSBSA_CKAN_PACKAGE_LIST_URL,
  NHSBSA_CKAN_SOURCE_ID,
  nhsbsaCkanAdapter,
  parseNhsbsaCkanPackages,
  summarizeNhsbsaCkanPackages,
} from './nhsbsaCkan.js';
/** NHSBSA catalogue types. */
export type { NhsbsaCkanSummary, NhsbsaDataset } from './nhsbsaCkan.js';
/** Nomis SDMX dataset catalogue, run by the ONS (keyless). */
export {
  fetchNomisDatasetDefinitions,
  NOMIS_DATASET_DEFINITIONS_URL,
  NOMIS_KEYWORDS_ANNOTATION,
  NOMIS_LAST_UPDATED_ANNOTATION,
  NOMIS_SOURCE_ID,
  NOMIS_STATUS_ANNOTATION,
  NOMIS_UNITS_ANNOTATION,
  nomisAdapter,
  parseNomisDatasetDefinitions,
  summarizeNomisDatasetDefinitions,
} from './nomis.js';
/** Nomis catalogue types. */
export type { NomisCatalogSummary, NomisDatasetDefinition, NomisStatusCount } from './nomis.js';
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
/** UK Parliament state of the parties in the Commons and the Lords (keyless). */
export {
  buildParliamentSeatsUrl,
  fetchParliamentSeats,
  formatParliamentQueryDate,
  parliamentSeatsAdapter,
  parseParliamentPartySeats,
  parseParliamentSeats,
  PARLIAMENT_COMMONS_HOUSE,
  PARLIAMENT_LORDS_HOUSE,
  PARLIAMENT_MEMBERS_API_BASE_URL,
  PARLIAMENT_SEATS_SOURCE_ID,
  PARLIAMENT_STATE_OF_PARTIES_PATH,
  summarizeParliamentPartySeats,
} from './parliamentSeats.js';
/** Parliament seat types. */
export type {
  ParliamentHouse,
  ParliamentParty,
  ParliamentPartySeats,
  ParliamentSeatSummary,
} from './parliamentSeats.js';
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
/** postcodes.io single postcode lookup (keyless, third-party service, OGL data). */
export {
  buildPostcodeLookupUrl,
  DEFAULT_POSTCODE_QUERY,
  fetchPostcodeLookup,
  parsePostcodeLookup,
  POSTCODE_LOOKUP_SOURCE_ID,
  POSTCODES_IO_BASE_URL,
  postcodeLookupAdapter,
} from './postcodeLookup.js';
/** Postcode lookup types. */
export type { PostcodeLookupRecord } from './postcodeLookup.js';
/** Public Health Scotland open data catalogue (keyless). */
export {
  fetchPublicHealthScotlandDatasets,
  PUBLIC_HEALTH_SCOTLAND_PACKAGE_LIST_URL,
  PUBLIC_HEALTH_SCOTLAND_SOURCE_ID,
  parsePublicHealthScotlandDatasets,
  publicHealthScotlandAdapter,
  summarizePublicHealthScotlandDatasets,
} from './publicHealthScotland.js';
/** Public Health Scotland catalogue types. */
export type {
  PublicHealthScotlandDataset,
  PublicHealthScotlandSummary,
} from './publicHealthScotland.js';
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
/** Transport for London Tube line status (keyless). */
export {
  fetchTflLineStatuses,
  parseTflLineStatuses,
  summarizeTflLineStatuses,
  TFL_LINE_STATUS_GOOD_SERVICE_SEVERITY,
  TFL_LINE_STATUS_SOURCE_ID,
  TFL_LINE_STATUS_URL,
  tflLineStatusAdapter,
} from './tflLineStatus.js';
/** Tube line status types. */
export type { TflLineStatus, TflLineStatusSummary } from './tflLineStatus.js';
/** The National Archives Discovery catalogue search (keyless). */
export {
  buildTnaDiscoverySearchUrl,
  DEFAULT_TNA_DISCOVERY_QUERY,
  fetchTnaDiscoveryRecords,
  parseTnaDiscoveryRecords,
  summarizeTnaDiscoverySearch,
  TNA_DISCOVERY_ACCEPT_HEADER,
  TNA_DISCOVERY_SEARCH_URL,
  TNA_DISCOVERY_SOURCE_ID,
  tnaDiscoveryAdapter,
} from './tnaDiscovery.js';
/** Discovery search types. */
export type {
  TnaDiscoveryRecord,
  TnaDiscoverySearchResult,
  TnaDiscoverySearchSummary,
} from './tnaDiscovery.js';
/** UK Health Security Agency data dashboard metric points (keyless). */
export {
  buildUkhsaMetricUrl,
  fetchUkhsaMetricPoints,
  parseUkhsaMetricPoints,
  summarizeUkhsaMetricPoints,
  UKHSA_DASHBOARD_API_BASE_URL,
  UKHSA_DASHBOARD_METRIC_PATH,
  UKHSA_DASHBOARD_PAGE_SIZE,
  UKHSA_DASHBOARD_SOURCE_ID,
  ukhsaDashboardAdapter,
} from './ukhsaDashboard.js';
/** UKHSA dashboard types. */
export type { UkhsaMetricPage, UkhsaMetricPoint, UkhsaMetricSummary } from './ukhsaDashboard.js';
/** The uniform adapter registry and probe helpers. */
export {
  UK_DATA_SOURCES,
  getUkDataSource,
  probeAllUkDataSources,
  probeUkDataSource,
} from './registry.js';
/** Shared adapter contract types. */
export type { UkDataAdapter, UkFetchOptions, UkSourceAuth, UkSourceProbe } from './types.js';
