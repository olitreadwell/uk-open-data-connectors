import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import {
  DEFAULT_FLOOD_STATION_REFERENCE,
  fetchFloodStationReadings,
  fetchFloodStations,
  summarizeFloodReadings,
} from '@open-data-connectors/uk-sources';

/** Most stations the listing route will return in one call. */
const MAX_STATION_LIMIT = 500;

/** Most readings the readings route will return in one call. */
const MAX_READING_LIMIT = 2000;

const stationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_STATION_LIMIT).optional(),
});

const readingsQuerySchema = z.object({
  station: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_READING_LIMIT).optional(),
});

/** Options for the flood-monitoring routes. */
export interface FloodMonitoringRouteOptions {
  fetchStations?: typeof fetchFloodStations;
  fetchReadings?: typeof fetchFloodStationReadings;
}

/**
 * Routes that wrap the Environment Agency flood-monitoring adapters.
 *
 * @param options - Optional fetch overrides for tests.
 * @returns A Hono app with the flood station and readings routes.
 */
export function createFloodMonitoringRoutes(options: FloodMonitoringRouteOptions = {}): Hono {
  const app = new Hono();
  const fetchStations = options.fetchStations ?? fetchFloodStations;
  const fetchReadings = options.fetchReadings ?? fetchFloodStationReadings;

  app.get('/flood/stations', zValidator('query', stationsQuerySchema), async (c) => {
    const { limit } = c.req.valid('query');
    const stations = await fetchStations(limit === undefined ? {} : { limit });
    return c.json({ stations });
  });

  app.get('/flood/readings', zValidator('query', readingsQuerySchema), async (c) => {
    const { station, limit } = c.req.valid('query');
    const stationReference = station ?? DEFAULT_FLOOD_STATION_REFERENCE;
    const readings = await fetchReadings(stationReference, limit === undefined ? {} : { limit });
    return c.json({
      station: stationReference,
      summary: summarizeFloodReadings(readings),
      readings,
    });
  });

  return app;
}
