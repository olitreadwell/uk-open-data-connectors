/** OpenAPI 3.0 document for the connectors API. Served at /openapi.json. */
export const OPEN_API_DOCUMENT = {
  openapi: '3.0.3',
  info: {
    title: 'UK Open Data Connectors',
    version: '0.1.0',
    description:
      'Language-agnostic HTTP wrapper over UK public data connectors. ' +
      'Every endpoint is keyless and reads from the live source API.',
  },
  paths: {
    '/openapi.json': {
      get: {
        summary: 'OpenAPI specification',
        responses: { '200': { description: 'OpenAPI 3.0 document' } },
      },
    },
    '/docs': {
      get: {
        summary: 'Swagger UI',
        responses: { '200': { description: 'HTML page' } },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'Service is up' } },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus metrics',
        responses: {
          '200': { description: 'Request counters in Prometheus text format' },
        },
      },
    },
    '/api/sources': {
      get: {
        summary: 'List every data source adapter',
        responses: {
          '200': { description: 'Adapter list' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/sources/{id}/probe': {
      get: {
        summary: 'Live probe one source',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Probe result' },
          '400': { description: 'Missing or invalid source id' },
          '404': { description: 'Unknown source id' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/flood/stations': {
      get: {
        summary: 'List Environment Agency flood-monitoring stations',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 25 },
          },
        ],
        responses: {
          '200': { description: 'Monitoring stations with river, catchment, and measures' },
          '400': { description: 'Invalid limit' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/flood/readings': {
      get: {
        summary: 'Recent water level readings for one station, newest first',
        parameters: [
          {
            name: 'station',
            in: 'query',
            schema: { type: 'string', default: '1029TH' },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 2000, default: 96 },
          },
        ],
        responses: {
          '200': { description: 'Readings plus a count, range, and trend summary' },
          '400': { description: 'Invalid station or limit' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/ons/datasets': {
      get: {
        summary: 'List the ONS beta API dataset catalogue',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 1000, default: 1000 },
          },
        ],
        responses: {
          '200': {
            description: 'Catalogue records plus counts by year and national-statistic flag',
          },
          '400': { description: 'Invalid limit' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
  },
} as const;
