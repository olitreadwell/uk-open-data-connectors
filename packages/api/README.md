# @uk-open-data-connectors/connectors-api

Internal package. It is not published to npm.

An HTTP wrapper over the UK open data connectors, with an OpenAPI spec and Swagger UI.

## What this package does

- Serves the UK connectors over HTTP with Hono.
- Publishes an OpenAPI 3.0 document at `/openapi.json` and Swagger UI at `/docs`.
- Adds rate limiting, CORS, request logs, and Prometheus metrics.
- Reports errors to Sentry when `SENTRY_DSN` is set.
- Reads no keys, because every UK source is keyless.

## Install

This package is private. It runs from TypeScript source inside this repo, under `tsx`. There is no build step.

```sh
npm install
```

## Quick start

```sh
npm install
npm run dev:api
curl 'http://localhost:8787/api/sources'
```

## Endpoints

| Method | Path | What it does |
| ------ | ---- | ------------ |
| GET | `/openapi.json` | The OpenAPI 3.0 document. |
| GET | `/docs` | Swagger UI for the document. |
| GET | `/health` | Health check. Answers 200 when the service is up. |
| GET | `/metrics` | Request counters in Prometheus text format. |
| GET | `/api/sources` | Every adapter, with its id, name, auth, and description. |
| GET | `/api/sources/{id}/probe` | A live probe of one source. Answers 404 for an unknown id. |
| GET | `/api/flood/stations?limit=25` | Environment Agency monitoring stations. `limit` is 1 to 500 and defaults to 25. |
| GET | `/api/flood/readings?station=1029TH&limit=96` | Recent water levels for one station, newest first. `limit` is 1 to 2000 and defaults to 96. |
| GET | `/api/ons/datasets?limit=1000` | The ONS dataset catalogue, with a yearly summary. `limit` is 1 to 1000 and defaults to 1000. |

## Notes and limits

- The default port is 8787. Set `PORT` to change it.
- `/api` routes allow any origin by default. Set `CORS_ORIGIN` to restrict them.
- The rate limit is 60 requests per minute per IP. Set `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` to change it.
- Sentry is off unless `SENTRY_DSN` is set.
- Errors are JSON. An unknown route answers `{"error":"not_found"}` with 404. An unhandled error answers `{"error":"internal_error"}` with 500.
- The API reads the `uk-sources` adapters. A failed live call falls back to a committed fixture, so a number can be stale.
- The package is private. It is not published to npm.

## Data sources and licences

This package reads the adapters in `@uk-open-data-connectors/uk-sources`. That package lists every publisher, source URL, and data licence, see [the uk-sources README](../uk-sources/README.md#data-sources-and-licences).

Most data carries the Open Government Licence v3. The two TfL adapters carry TfL Open Data. The carbon intensity series carries Creative Commons Attribution 4.0. The Parliament seat counts carry the Open Parliament Licence v3.0.

## Package licence

MIT. See LICENSE.

## Links

- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/api>
- docs: [Architecture](../../docs/ARCHITECTURE.md)
