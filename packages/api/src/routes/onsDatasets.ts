import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { fetchOnsDatasets, summarizeOnsDatasets } from '@open-data-connectors/uk-sources';

/** Most dataset records the route will return in one call. */
const MAX_DATASET_LIMIT = 1000;

const datasetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_DATASET_LIMIT).optional(),
});

/** Options for the ONS dataset catalogue routes. */
export interface OnsDatasetsRouteOptions {
  fetchDatasets?: typeof fetchOnsDatasets;
}

/**
 * Route that wraps the ONS beta API dataset catalogue.
 *
 * @param options - Optional fetch override for tests.
 * @returns A Hono app with the ONS dataset catalogue route.
 */
export function createOnsDatasetsRoutes(options: OnsDatasetsRouteOptions = {}): Hono {
  const app = new Hono();
  const fetchDatasets = options.fetchDatasets ?? fetchOnsDatasets;

  app.get('/ons/datasets', zValidator('query', datasetsQuerySchema), async (c) => {
    const { limit } = c.req.valid('query');
    const records = await fetchDatasets(limit === undefined ? {} : { limit });
    return c.json({ summary: summarizeOnsDatasets(records), records });
  });

  return app;
}
