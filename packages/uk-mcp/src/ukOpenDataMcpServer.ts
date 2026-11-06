import {
  fetchAncientWoodlandProfile,
  fetchBankRateObservations,
  fetchCarbonIntensityWindow,
  fetchExploreEducationPublications,
  fetchFindATenderReleases,
  fetchFingertipsIndicators,
  fetchFloodStationReadings,
  fetchFloodStations,
  fetchFoodHygieneAuthorities,
  fetchLondonDatastorePackages,
  fetchNesoGenerationMixWindow,
  fetchNhsbsaCkanPackages,
  fetchNomisDatasetDefinitions,
  fetchOnsDatasets,
  fetchParliamentSeats,
  fetchPlanningDatasets,
  fetchPoliceCrimeCategories,
  fetchPoliceCrimeMonths,
  fetchPoliceCrimeSummary,
  fetchPostcodeLookup,
  fetchPublicHealthScotlandDatasets,
  fetchTflBikePoints,
  fetchTflLineStatuses,
  fetchTnaDiscoveryRecords,
  fetchUkhsaMetricPoints,
  getUkDataSource,
  probeAllUkDataSources,
  UK_DATA_SOURCES,
} from '@uk-open-data-connectors/uk-sources';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createSourceMcpServer, type SourceQueryTool } from './createSourceMcpServer.js';
import { readPackageVersion } from './packageVersion.js';

/** What this server calls itself in the MCP handshake. */
export const UK_MCP_SERVER_NAME = 'uk-open-data';

/** Version reported in the MCP handshake, read from package.json. */
export const UK_MCP_SERVER_VERSION = readPackageVersion();

/** The named-function tools the UK library can answer. */
const UK_QUERY_TOOLS: SourceQueryTool[] = [
  {
    name: 'uk_ancient_woodland',
    title: 'Ancient woodland in England',
    description:
      'Ancient woodland polygons for England, counted by woodland type and by size band. Keyless.',
    inputSchema: {},
    run: async () => fetchAncientWoodlandProfile(),
  },
  {
    name: 'uk_bank_rate',
    title: 'Bank of England Bank Rate',
    description:
      'The daily official Bank Rate from 2 January 1975 to the latest published day. Keyless.',
    inputSchema: {},
    run: async () => fetchBankRateObservations(),
  },
  {
    name: 'uk_carbon_intensity',
    title: 'Electricity carbon intensity',
    description:
      'Half-hourly carbon intensity for the GB electricity grid over a window. Keyless. Pass from and to as ISO timestamps, or windowDays for a rolling window.',
    inputSchema: {
      windowDays: z.number().int().min(1).max(14).optional().describe('Rolling window length.'),
      from: z.string().optional().describe('ISO timestamp for the start of the window.'),
      to: z.string().optional().describe('ISO timestamp for the end of the window.'),
    },
    run: async (args) => fetchCarbonIntensityWindow(dropUndefined(args)),
  },
  {
    name: 'uk_flood_station_readings',
    title: 'Flood station readings',
    description:
      'Recent water level readings for one Environment Agency monitoring station, newest first. Keyless.',
    inputSchema: {
      stationReference: z
        .string()
        .optional()
        .describe('Station reference. Defaults to the Thames.'),
      limit: z.number().int().min(1).max(1000).optional().describe('Reading cap. Defaults to 96.'),
    },
    run: async (args) =>
      fetchFloodStationReadings(
        stringOrUndefined(args.stationReference),
        typeof args.limit === 'number' ? { limit: args.limit } : {}
      ),
  },
  {
    name: 'uk_flood_stations',
    title: 'Flood monitoring stations',
    description:
      'Environment Agency monitoring stations with their river, catchment, and measures. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional().describe('Station cap. Defaults to 25.'),
    },
    run: async (args) =>
      fetchFloodStations(typeof args.limit === 'number' ? { limit: args.limit } : {}),
  },
  {
    name: 'uk_food_hygiene_authorities',
    title: 'Food hygiene registers',
    description:
      'Every local authority food hygiene register with its establishment count, from the Food Standards Agency. Keyless.',
    inputSchema: {},
    run: async () => fetchFoodHygieneAuthorities(),
  },
  {
    name: 'uk_ons_datasets',
    title: 'ONS dataset catalogue',
    description:
      'Every dataset the ONS beta API lists, with its state and last-updated stamp. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional().describe('Dataset cap.'),
    },
    run: async (args) =>
      fetchOnsDatasets(typeof args.limit === 'number' ? { limit: args.limit } : {}),
  },
  {
    name: 'uk_parliament_seats',
    title: 'UK Parliament state of the parties',
    description:
      'Seats held by each party in the House of Commons, or the Lords with house=2. Keyless.',
    inputSchema: {
      house: z.number().int().min(1).max(2).optional().describe('1 for Commons, 2 for Lords.'),
      forDate: z.string().optional().describe('Date to read the state of the parties for.'),
    },
    run: async (args) => {
      const house = typeof args.house === 'number' ? args.house : undefined;
      const forDate = stringOrUndefined(args.forDate);
      return fetchParliamentSeats({
        ...(house === undefined ? {} : { house }),
        ...(forDate === undefined ? {} : { forDate }),
      });
    },
  },
  {
    name: 'uk_planning_datasets',
    title: 'Planning Data platform datasets',
    description:
      'Every dataset the MHCLG Planning Data platform lists, with the records behind it. Keyless.',
    inputSchema: {},
    run: async () => fetchPlanningDatasets(),
  },
  {
    name: 'uk_police_crime_categories',
    title: 'Police crime categories',
    description: 'The crime types the Home Office police.uk API publishes. Keyless.',
    inputSchema: {},
    run: async () => fetchPoliceCrimeCategories(),
  },
  {
    name: 'uk_police_crime_months',
    title: 'Police crime months',
    description: 'The months the Home Office police.uk API has published. Keyless.',
    inputSchema: {},
    run: async () => fetchPoliceCrimeMonths(),
  },
  {
    name: 'uk_police_crime_summary',
    title: 'Recorded crime near a point',
    description:
      'Recorded crime near a latitude and longitude, summarised across the latest published months. Keyless.',
    inputSchema: {
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .optional()
        .describe('Latitude. Defaults to central London.'),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .optional()
        .describe('Longitude. Defaults to central London.'),
      monthCount: z.number().int().min(1).max(12).optional().describe('How many months to cover.'),
    },
    run: async (args) => {
      const latitude = typeof args.latitude === 'number' ? args.latitude : undefined;
      const longitude = typeof args.longitude === 'number' ? args.longitude : undefined;
      const monthCount = typeof args.monthCount === 'number' ? args.monthCount : undefined;
      return fetchPoliceCrimeSummary({
        ...(latitude === undefined ? {} : { latitude }),
        ...(longitude === undefined ? {} : { longitude }),
        ...(monthCount === undefined ? {} : { monthCount }),
      });
    },
  },
  {
    name: 'uk_tfl_bike_points',
    title: 'Santander Cycles docking stations',
    description:
      'Every TfL Santander Cycles docking station with its docking points and docked bikes. Keyless.',
    inputSchema: {
      apiKey: z.string().optional().describe('TfL app key, for a higher rate limit.'),
    },
    run: async (args) => {
      const apiKey = stringOrUndefined(args.apiKey);
      return fetchTflBikePoints(apiKey === undefined ? {} : { apiKey });
    },
  },
  {
    name: 'uk_neso_generation_mix',
    title: 'NESO generation mix',
    description:
      'Half-hourly electricity generation by fuel for the GB grid, with each fuel share. Keyless.',
    inputSchema: {
      halfHours: z
        .number()
        .int()
        .min(1)
        .max(3360)
        .optional()
        .describe('How many half-hour periods to read. Defaults to 336, or seven days.'),
      resourceId: z.string().optional().describe('NESO datastore resource id override.'),
    },
    run: async (args) => {
      const halfHours = typeof args.halfHours === 'number' ? args.halfHours : undefined;
      const resourceId = stringOrUndefined(args.resourceId);
      return fetchNesoGenerationMixWindow({
        ...(halfHours === undefined ? {} : { halfHours }),
        ...(resourceId === undefined ? {} : { resourceId }),
      });
    },
  },
  {
    name: 'uk_tfl_line_status',
    title: 'TfL line status',
    description: 'Current status of every London Underground (Tube) service. Keyless.',
    inputSchema: {
      apiKey: z.string().optional().describe('TfL app key, for a higher rate limit.'),
    },
    run: async (args) => {
      const apiKey = stringOrUndefined(args.apiKey);
      return fetchTflLineStatuses(apiKey === undefined ? {} : { apiKey });
    },
  },
  {
    name: 'uk_postcode_lookup',
    title: 'Postcode lookup',
    description:
      'Resolves a UK postcode to its coordinates, administrative areas, and constituency. Keyless.',
    inputSchema: {
      postcode: z.string().optional().describe('UK postcode. Defaults to SW1A 1AA.'),
    },
    run: async (args) => fetchPostcodeLookup(stringOrUndefined(args.postcode)),
  },
  {
    name: 'uk_nomis_datasets',
    title: 'Nomis dataset catalogue',
    description: 'Every dataset definition in the Nomis SDMX catalogue. Keyless.',
    inputSchema: {},
    run: async () => fetchNomisDatasetDefinitions(),
  },
  {
    name: 'uk_tna_discovery',
    title: 'The National Archives Discovery search',
    description:
      'Searches The National Archives Discovery catalogue and returns record metadata. Keyless.',
    inputSchema: {
      query: z.string().optional().describe('Search terms. Defaults to "test".'),
    },
    run: async (args) => {
      const query = stringOrUndefined(args.query);
      return fetchTnaDiscoveryRecords(query === undefined ? {} : { query });
    },
  },
  {
    name: 'uk_ukhsa_metrics',
    title: 'UKHSA dashboard metrics',
    description:
      'One page of metric points from the UK Health Security Agency data dashboard. Keyless.',
    inputSchema: {
      pageSize: z.number().int().min(1).max(365).optional().describe('Point cap.'),
    },
    run: async (args) => {
      const pageSize = typeof args.pageSize === 'number' ? args.pageSize : undefined;
      return fetchUkhsaMetricPoints(pageSize === undefined ? {} : { pageSize });
    },
  },
  {
    name: 'uk_london_datastore',
    title: 'London Datastore catalogue',
    description: 'Every package in the London Datastore catalogue. Keyless.',
    inputSchema: {},
    run: async () => fetchLondonDatastorePackages(),
  },
  {
    name: 'uk_nhsbsa_catalogue',
    title: 'NHSBSA open data catalogue',
    description: 'Every dataset in the NHS Business Services Authority CKAN catalogue. Keyless.',
    inputSchema: {},
    run: async () => fetchNhsbsaCkanPackages(),
  },
  {
    name: 'uk_public_health_scotland',
    title: 'Public Health Scotland catalogue',
    description: 'Every dataset in the Public Health Scotland open data catalogue. Keyless.',
    inputSchema: {},
    run: async () => fetchPublicHealthScotlandDatasets(),
  },
  {
    name: 'uk_find_a_tender',
    title: 'Find a Tender notices',
    description:
      'Recent procurement releases from Find a Tender, the UK public procurement service. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe('Release cap.'),
    },
    run: async (args) => {
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return fetchFindATenderReleases(limit === undefined ? {} : { limit });
    },
  },
  {
    name: 'uk_fingertips_indicators',
    title: 'Fingertips indicators',
    description:
      'Public health indicator metadata from OHID Fingertips. Keyless. Pass indicatorIds to read specific indicators.',
    inputSchema: {
      indicatorIds: z
        .array(z.number().int())
        .min(1)
        .optional()
        .describe('Fingertips indicator ids. Defaults to a small starter set.'),
    },
    run: async (args) => {
      const indicatorIds = Array.isArray(args.indicatorIds)
        ? args.indicatorIds.filter((id): id is number => typeof id === 'number')
        : undefined;
      return fetchFingertipsIndicators(
        indicatorIds === undefined || indicatorIds.length === 0 ? {} : { indicatorIds }
      );
    },
  },
  {
    name: 'uk_explore_education',
    title: 'Explore Education Statistics publications',
    description:
      'One page of Department for Education publications from Explore Education Statistics. Keyless.',
    inputSchema: {
      page: z.number().int().min(1).optional().describe('Page number, starting at 1.'),
      pageSize: z.number().int().min(1).max(100).optional().describe('Page size.'),
    },
    run: async (args) => {
      const page = typeof args.page === 'number' ? args.page : undefined;
      const pageSize = typeof args.pageSize === 'number' ? args.pageSize : undefined;
      return fetchExploreEducationPublications({
        ...(page === undefined ? {} : { page }),
        ...(pageSize === undefined ? {} : { pageSize }),
      });
    },
  },
];

/** Narrows an unknown tool argument to a non-blank string. */
function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Drops undefined values so `exactOptionalPropertyTypes` stays satisfied. */
function dropUndefined(args: Record<string, unknown>): {
  windowDays?: number;
  from?: string;
  to?: string;
} {
  const { windowDays } = args;
  const from = stringOrUndefined(args.from);
  const to = stringOrUndefined(args.to);
  return {
    ...(typeof windowDays === 'number' ? { windowDays } : {}),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

/**
 * Builds the UK MCP server: the 25 keyless UK sources, plus 25 named query
 * tools.
 *
 * @returns an MCP server ready to connect to a transport
 */
export function createUkOpenDataMcpServer(): McpServer {
  return createSourceMcpServer({
    serverName: UK_MCP_SERVER_NAME,
    serverVersion: UK_MCP_SERVER_VERSION,
    listSources: () =>
      UK_DATA_SOURCES.map((source) => ({
        id: source.id,
        name: source.name,
        auth: source.auth,
        description: source.description,
      })),
    probeSources: async (ids) => {
      const probes = await probeAllUkDataSources(ids === undefined ? {} : { ids });
      return probes.map((probe) => ({
        id: probe.id,
        name: probe.name,
        auth: probe.auth,
        ok: probe.ok,
        status: probe.status,
        ...(probe.sample === undefined ? {} : { sample: probe.sample }),
      }));
    },
    fetchSource: async (id, options) => {
      const adapter = getUkDataSource(id);
      if (adapter === undefined) {
        throw new Error(`No UK source with id "${id}". Call list_sources for the ids.`);
      }
      return adapter.fetchLive(options?.apiKey === undefined ? {} : { apiKey: options.apiKey });
    },
    queryTools: UK_QUERY_TOOLS,
  });
}
