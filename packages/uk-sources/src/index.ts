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
/** British Geological Survey OpenGeoscience WMS capabilities (keyless). */
export {
  BGS_WMS_CAPABILITIES_URL,
  BGS_WMS_SOURCE_ID,
  bgsWmsAdapter,
  fetchBgsWmsCapabilities,
  parseBgsWmsCapabilities,
} from './bgsWms.js';
/** BGS WMS types. */
export type { BgsWmsCapabilities, BgsWmsGeographicBounds, BgsWmsLayer } from './bgsWms.js';
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
/** Data.gov.uk CKAN catalogue, the UK government open data index (keyless). */
export {
  buildDataGovUkPackageSearchUrl,
  DATA_GOV_UK_CKAN_SOURCE_ID,
  DATA_GOV_UK_PACKAGE_SEARCH_LIMIT,
  DATA_GOV_UK_PACKAGE_SEARCH_URL,
  dataGovUkCkanAdapter,
  fetchDataGovUkPackages,
  parseDataGovUkPackages,
  summarizeDataGovUkPackages,
} from './dataGovUkCkan.js';
/** Data.gov.uk catalogue types. */
export type {
  DataGovUkDataset,
  DataGovUkLicenceCount,
  DataGovUkPackagePage,
  DataGovUkPackageSummary,
} from './dataGovUkCkan.js';
/** Elexon BMRS settlement system prices by settlement day (keyless). */
export {
  buildElexonSystemPricesUrl,
  ELEXON_BMRS_API_BASE_URL,
  ELEXON_SYSTEM_PRICES_PATH,
  ELEXON_SYSTEM_PRICES_SOURCE_ID,
  elexonSystemPricesAdapter,
  fetchElexonSystemPrices,
  formatElexonSettlementDate,
  parseElexonSystemPrices,
} from './elexonSystemPrices.js';
/** Elexon system price types. */
export type { ElexonSystemPriceDay, ElexonSystemPricePeriod } from './elexonSystemPrices.js';
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
/** API error detail type. */
export type { UkSourceApiErrorDetails } from './errors.js';
/** Find a Tender procurement notices, published by the Crown Commercial Service (keyless). */
export {
  FIND_A_TENDER_RELEASE_LIMIT,
  FIND_A_TENDER_RELEASE_PACKAGES_URL,
  FIND_A_TENDER_SOURCE_ID,
  fetchFindATenderReleases,
  findATenderAdapter,
  parseFindATenderReleases,
  summarizeFindATenderReleases,
} from './findATender.js';
/** Find a Tender types. */
export type {
  FindATenderRelease,
  FindATenderReleasePage,
  FindATenderStatusCount,
  FindATenderSummary,
} from './findATender.js';
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
/** The Gazette notice feed (keyless). */
export {
  buildGazetteNoticesUrl,
  fetchGazetteNotices,
  GAZETTE_NOTICES_SOURCE_ID,
  GAZETTE_NOTICES_URL,
  gazetteNoticesAdapter,
  parseGazetteNotices,
} from './gazetteNotices.js';
/** Gazette notice types. */
export type { GazetteNotice, GazetteNoticePage } from './gazetteNotices.js';
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
/** GOV.UK Content API pages, with taxons and publishing organisations (keyless). */
export {
  buildGovUkContentUrl,
  DEFAULT_GOV_UK_CONTENT_PATH,
  fetchGovUkContent,
  GOV_UK_CONTENT_API_BASE_URL,
  GOV_UK_CONTENT_SOURCE_ID,
  govUkContentAdapter,
  parseGovUkContent,
} from './govUkContent.js';
/** GOV.UK content types. */
export type { GovUkContentLink, GovUkContentRecord } from './govUkContent.js';
/** legislation.gov.uk search feed (keyless). */
export {
  buildLegislationSearchUrl,
  DEFAULT_LEGISLATION_QUERY,
  fetchLegislationSearch,
  LEGISLATION_SEARCH_SOURCE_ID,
  LEGISLATION_SEARCH_URL,
  legislationSearchAdapter,
  parseLegislationSearch,
} from './legislationSearch.js';
/** legislation.gov.uk search types. */
export type { LegislationSearchPage, LegislationSearchResult } from './legislationSearch.js';
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
/** NESO Data Portal catalogue (keyless). */
export {
  buildNesoCatalogueUrl,
  DEFAULT_NESO_CATALOGUE_LIMIT,
  fetchNesoCatalogue,
  NESO_CATALOGUE_SEARCH_URL,
  NESO_CATALOGUE_SOURCE_ID,
  nesoCatalogueAdapter,
  parseNesoCatalogue,
} from './nesoCatalogue.js';
/** NESO catalogue types. */
export type { NesoCatalogueDataset, NesoCataloguePage } from './nesoCatalogue.js';
/** National Energy System Operator half-hourly generation mix (keyless). */
export {
  buildNesoGenerationMixUrl,
  DEFAULT_NESO_GENERATION_MIX_HALF_HOURS,
  fetchNesoGenerationMixWindow,
  MAX_NESO_GENERATION_MIX_HALF_HOURS,
  NESO_DATA_PORTAL_API_BASE_URL,
  NESO_DATASTORE_SEARCH_URL,
  NESO_GENERATION_FUELS,
  NESO_GENERATION_MIX_RESOURCE_ID,
  NESO_GENERATION_MIX_SOURCE_ID,
  nesoGenerationMixAdapter,
  parseNesoGenerationMix,
} from './nesoGenerationMix.js';
/** Generation mix types. */
export type {
  NesoGenerationFuel,
  NesoGenerationFuelReading,
  NesoGenerationFuelShare,
  NesoGenerationHalfHour,
  NesoGenerationMixWindow,
} from './nesoGenerationMix.js';
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
/** ONS Open Geography Portal search (keyless). */
export {
  buildOnsGeographySearchUrl,
  DEFAULT_ONS_GEOGRAPHY_LIMIT,
  fetchOnsGeographyDatasets,
  ONS_GEOGRAPHY_SEARCH_URL,
  ONS_GEOGRAPHY_SOURCE_ID,
  onsGeographyAdapter,
  parseOnsGeographyDatasets,
} from './onsGeography.js';
/** ONS geography types. */
export type { OnsGeographyDataset, OnsGeographyPage } from './onsGeography.js';
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
  POLICE_CRIME_MONTH_ATTEMPTS,
  POLICE_CRIME_MONTH_RETRY_DELAY_MS,
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
  TFL_LINE_STATUS_MAX_ATTEMPTS,
  TFL_LINE_STATUS_RETRY_DELAY_MS,
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
/** UK Parliament committees from the Parliament OData API (keyless). */
export {
  buildUkParliamentCommitteeUrl,
  DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT,
  fetchUkParliamentCommittees,
  parseUkParliamentCommittees,
  UK_PARLIAMENT_COMMITTEE_ENTITY,
  UK_PARLIAMENT_COMMITTEE_SOURCE_ID,
  UK_PARLIAMENT_ODATA_BASE_URL,
  ukParliamentCommitteesAdapter,
} from './ukParliamentCommittees.js';
/** UK Parliament committee types. */
export type { UkParliamentCommittee, UkParliamentCommitteePage } from './ukParliamentCommittees.js';
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
/** UKRI Gateway to Research awards (keyless). */
export {
  buildUkriGtrAwardsUrl,
  DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE,
  fetchUkriGtrAwards,
  MAX_UKRI_GTR_AWARD_PAGE_SIZE,
  parseUkriGtrAwards,
  UKRI_GTR_API_BASE_URL,
  UKRI_GTR_AWARDS_PATH,
  UKRI_GTR_AWARDS_SOURCE_ID,
  ukriGtrAwardsAdapter,
} from './ukriGtrAwards.js';
/** UKRI Gateway to Research types. */
export type { UkriGtrAward, UkriGtrAwardPage, UkriGtrPersonName } from './ukriGtrAwards.js';
/** The uniform adapter registry and probe helpers. */
export {
  UK_DATA_SOURCES,
  getUkDataSource,
  probeAllUkDataSources,
  probeUkDataSource,
} from './registry.js';
/** Shared adapter contract types. */
export type { UkDataAdapter, UkFetchOptions, UkSourceAuth, UkSourceProbe } from './types.js';

/** API key normalization shared by adapters, the API, and the CLI. */
export { normalizeSourceApiKey } from './apiKey.js';
/** The shared HTTP layer every adapter fetch goes through. */
export { httpGet, USER_AGENT, DEFAULT_TIMEOUT_MS } from './http.js';
/** Shared HTTP layer types. */
export type { HttpGetOptions } from './http.js';
