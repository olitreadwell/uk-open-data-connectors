import {
  fetchAncientWoodlandProfile,
  fetchBankRateObservations,
  fetchCarbonIntensityWindow,
  fetchFloodStationReadings,
  fetchFloodStations,
  fetchFoodHygieneAuthorities,
  fetchOnsDatasets,
  fetchParliamentSeats,
  fetchPlanningDatasets,
  fetchPoliceCrimeCategories,
  fetchPoliceCrimeMonths,
  fetchPoliceCrimeSummary,
  fetchTflBikePoints,
  getUkDataSource,
  probeAllUkDataSources,
  UK_DATA_SOURCES,
} from '@uk-open-data-connectors/uk-sources';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createSourceMcpServer, type SourceQueryTool } from './createSourceMcpServer.js';

/** What this server calls itself in the MCP handshake. */
export const UK_MCP_SERVER_NAME = 'uk-open-data';

/** Version reported in the MCP handshake. Kept in step with package.json. */
export const UK_MCP_SERVER_VERSION = '0.1.0';

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
        typeof args.stationReference === 'string' ? args.stationReference : undefined,
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
      const forDate = typeof args.forDate === 'string' ? args.forDate : undefined;
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
    run: async (args) =>
      fetchTflBikePoints(typeof args.apiKey === 'string' ? { apiKey: args.apiKey } : {}),
  },
];

/** Drops undefined values so `exactOptionalPropertyTypes` stays satisfied. */
function dropUndefined(args: Record<string, unknown>): {
  windowDays?: number;
  from?: string;
  to?: string;
} {
  const { windowDays, from, to } = args;
  return {
    ...(typeof windowDays === 'number' ? { windowDays } : {}),
    ...(typeof from === 'string' ? { from } : {}),
    ...(typeof to === 'string' ? { to } : {}),
  };
}

/**
 * Builds the UK MCP server: the 11 keyless UK sources, plus one tool per named
 * function in the connector library.
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
      const probes = await probeAllUkDataSources();
      const wanted = ids === undefined || ids.length === 0 ? undefined : new Set(ids);
      return probes
        .filter((probe) => wanted === undefined || wanted.has(probe.id))
        .map((probe) => ({
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
