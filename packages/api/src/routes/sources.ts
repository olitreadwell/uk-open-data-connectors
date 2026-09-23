import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { UK_DATA_SOURCES, probeUkDataSource } from '@open-data-connectors/uk-sources';

const probeParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});

/** Options for the source listing and probe routes. */
export interface SourcesRouteOptions {
  probeFn?: typeof probeUkDataSource;
}

/**
 * Routes that list and probe the uniform UK data source adapters.
 *
 * @param options - Optional probe function override.
 * @returns A Hono app with the source listing and probe routes.
 */
export function createSourcesRoutes(options: SourcesRouteOptions = {}): Hono {
  const app = new Hono();
  const probeFn = options.probeFn ?? probeUkDataSource;

  app.get('/sources', (c) => {
    const sources = UK_DATA_SOURCES.map((source) => ({
      id: source.id,
      name: source.name,
      auth: source.auth,
      description: source.description,
    }));
    return c.json(sources);
  });

  app.get('/sources/:id/probe', zValidator('param', probeParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const adapter = UK_DATA_SOURCES.find((source) => source.id === id);
    if (adapter === undefined) {
      const NOT_FOUND = 404;
      return c.json({ error: `Unknown source: ${id}` }, NOT_FOUND);
    }
    const probe = await probeFn(adapter);
    return c.json(probe);
  });

  return app;
}
