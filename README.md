# UK Open Data Connectors

TypeScript connectors for UK public data, with language-agnostic wrappers so you can use them from any language (Python, R, Julia, curl, whatever you like).

Every connector is keyless today. There are no API keys to request and no secrets to keep.

## Packages

| Package | What it is |
| ------- | ---------- |
| `@uk-open-data-connectors/uk-sources` | Uniform adapters for UK public data sources. Eleven so far: the Environment Agency flood-monitoring station list and readings, the ONS dataset catalogue, the FSA food hygiene registers, Transport for London's cycle hire docking stations, the Planning Data platform's dataset catalogue, Natural England's ancient woodland layer, the Bank of England's daily Bank Rate, Home Office police.uk recorded crime, the National Energy System Operator's half-hourly carbon intensity, and the UK Parliament state of the parties, all keyless with live probes and offline fixtures |
| `@uk-open-data-connectors/connectors-api` | HTTP wrapper with an OpenAPI spec and Swagger UI, so any language can call the connectors over HTTP |
| `@uk-open-data-connectors/connectors-cli` | `ukdata` command line tool that prints JSON to stdout, so any language can shell out to it |
| `python/` (`nzdata` on PyPI) | Python port carried over from the NZ origin. Still NZ sources, see Language ports |
| `ruby/` (`nzdata` gem) | Ruby port carried over from the NZ origin. Still NZ sources, see Language ports |


## Connectors

Eleven adapters in `@uk-open-data-connectors/uk-sources`, all keyless. Most carry
Open Government Licence v3 data; the TfL one carries TfL Open Data, and the
carbon intensity series is Creative Commons Attribution 4.0 under the
operator's own terms, while the Parliament seat counts carry the Open
Parliament Licence v3.

| id | Source | Keyless? | Example command |
| --- | ------ | -------- | --------------- |
| `flood-stations` | Environment Agency flood-monitoring stations, with river and catchment | Yes | `npx tsx packages/cli/src/cli.ts probe flood-stations` |
| `flood-readings` | Recent water levels for one station, newest first | Yes | `npx tsx packages/cli/src/cli.ts probe flood-readings` |
| `ons-datasets` | Office for National Statistics dataset catalogue | Yes | `npx tsx packages/cli/src/cli.ts probe ons-datasets` |
| `food-hygiene-authorities` | FSA food hygiene registers, with establishment counts | Yes | `npx tsx packages/cli/src/cli.ts probe food-hygiene-authorities` |
| `tfl-bike-points` | TfL Santander Cycles docking stations, with docking points and docked bikes | Yes | `npx tsx packages/cli/src/cli.ts probe tfl-bike-points` |
| `planning-datasets` | Planning Data platform datasets, with the records published behind each one | Yes | `npx tsx packages/cli/src/cli.ts probe planning-datasets` |
| `ancient-woodland` | Natural England ancient woodland polygons for England, counted by type and size | Yes | `npx tsx packages/cli/src/cli.ts probe ancient-woodland` |
| `bank-rate` | Bank of England official Bank Rate, one reading per business day since 1975 | Yes | `npx tsx packages/cli/src/cli.ts probe bank-rate` |
| `police-crimes` | Home Office police.uk recorded crime within a mile of a point, counted by crime type and outcome | Yes | `npx tsx packages/cli/src/cli.ts probe police-crimes` |
| `carbon-intensity` | National Energy System Operator half-hourly carbon intensity for Great Britain | Yes | `npx tsx packages/cli/src/cli.ts probe carbon-intensity` |
| `parliament-seats` | UK Parliament seats each party holds in the House of Commons | Yes | `npx tsx packages/cli/src/cli.ts probe parliament-seats` |

Sources that look obvious for a UK repo and are not usable as they stand:

- `api.ons.gov.uk` was retired on 2024-11-25. Every path now answers with a
  plain-text decommission notice, so an entry that still points at it returns
  HTTP 200 while serving nothing usable.
- `data.gov.uk/api/3/action/...` redirects to an HTML landing page, so the
  CKAN API is no longer at that path.

The live ONS beta API at `api.beta.ons.gov.uk/v1` answers with JSON and backs
the `ons-datasets` adapter. The FSA Food Hygiene Rating Scheme API at
`api.ratings.food.gov.uk` answers keyless as long as the call carries the
`x-api-version: 2` header, and backs `food-hygiene-authorities`.

The TfL Unified API at `api.tfl.gov.uk` answers keyless too, and backs
`tfl-bike-points`. TfL asks for an app key above the free rate limit, so the
adapter takes one as an optional `apiKey` and sends it as `app_key`.

The Planning Data platform at `www.planning.data.gov.uk` answers keyless as
well, and backs `planning-datasets`. The catalogue call returns every dataset
and pipeline table the platform lists, with a record count for each; the
adapter keeps the entries the platform marks as datasets.

The Home Office police.uk API at `data.police.uk` answers keyless and backs
`police-crimes`. It holds the last 36 months of street-level crime, published
by the 44 forces of England, Wales and Northern Ireland; Police Scotland
publishes elsewhere, so nothing here covers Scotland. Its street-level
endpoints answer for everything within a mile of a point, so the adapter
counts around one point and cannot ask for a smaller radius. Calls are made
one month at a time, well inside the API's limit of 15 requests a second.

The Carbon Intensity API at `api.carbonintensity.org.uk` answers keyless and
backs `carbon-intensity`. It is the official half-hourly series for Great
Britain, with a reading for every half hour and a grade for each one. A range
is read in one call, and the API refuses a range longer than 31 days, so the
adapter asks for 30 complete days ending at the start of today.

The Members API at `members-api.parliament.uk` answers keyless and backs
`parliament-seats`. Its state-of-the-parties call takes a house (1 for the
Commons, 2 for the Lords) and a date, and returns each party with the seats it
holds and the members counted behind them. Parliament publishes the data under
the Open Parliament Licence v3.0.

### Adapter examples

Each probe prints a JSON summary with the probe `id`, `name`, `auth`, an
`ok` or `status` line, and a `sample` of the live data.

```sh
# Environment Agency - monitoring stations, with river and catchment
npx tsx packages/cli/src/cli.ts probe flood-stations
```

```sh
# Environment Agency - recent water levels for a station
npx tsx packages/cli/src/cli.ts flood-readings --station 1029TH --limit 8
```

```sh
# ONS - the dataset catalogue with counts by year and national-statistic flag
npx tsx packages/cli/src/cli.ts ons-datasets --limit 20
```

## Language-agnostic access

### HTTP API

```sh
npm install
npm run dev:api        # http://localhost:8787
```

- `GET /health` - health check
- `GET /metrics` - request counts in Prometheus format
- `GET /openapi.json` - machine-readable OpenAPI spec (generate clients in any language from this)
- `GET /docs` - Swagger UI
- `GET /api/sources` - list every adapter
- `GET /api/sources/:id/probe` - live probe one source
- `GET /api/flood/stations?limit=25` - Environment Agency monitoring stations
- `GET /api/flood/readings?station=1029TH&limit=96` - recent water levels, newest first
- `GET /api/ons/datasets?limit=1000` - ONS dataset catalogue with a yearly summary

```sh
curl 'http://localhost:8787/api/flood/readings'
```

### CLI

```sh
npx tsx packages/cli/src/cli.ts sources
npx tsx packages/cli/src/cli.ts probe flood-stations
npx tsx packages/cli/src/cli.ts flood-stations --limit 5
npx tsx packages/cli/src/cli.ts flood-readings --station 1029TH
npx tsx packages/cli/src/cli.ts ons-datasets --limit 1000
```

Output goes to stdout as JSON, errors go to stderr, and the exit code is 0 on success.

## Quick start (TypeScript)

```sh
npm install
npm run check
```

```ts
import {
  fetchFloodStationReadings,
  fetchOnsDatasets,
  summarizeFloodReadings,
  summarizeOnsDatasets,
  UK_DATA_SOURCES,
} from '@uk-open-data-connectors/uk-sources';

const readings = await fetchFloodStationReadings('1029TH', { limit: 96 });
console.log(summarizeFloodReadings(readings).trend);

const catalogue = summarizeOnsDatasets(await fetchOnsDatasets());
console.log(catalogue.datasetCount, catalogue.yearCounts.length);

console.log(UK_DATA_SOURCES.map((source) => source.id).join(', '));
```

## Environment variables

| Variable | Needed for | Where to get it |
| -------- | ---------- | --------------- |
| `SENTRY_DSN` | Error tracking (optional, off by default) | sentry.io |
| `CORS_ORIGIN` | Restricting browser access to `/api` (default: any origin) | your own deployment |
| `RATE_LIMIT_MAX` | Per-IP request budget for `/api` (default: 60 per minute) | your own deployment |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (default: 60000) | your own deployment |
| `PORT` | Port the API listens on (default: 8787) | your own deployment |

Copy `.env.example` to `.env` and fill in your own values.

## Testing

```sh
npm run check          # format + lint + type-check + build + unit tests with coverage
npm run test:smoke     # live smoke tests against the real APIs
```

Unit tests use committed fixture snapshots pulled from the live APIs, so they run offline. Smoke tests are opt-in via `RUN_SMOKE=1`, need no keys, and hit the real endpoints.

## Language ports

`python/` and `ruby/` are the Python and Ruby ports carried over from the NZ
origin of this repo. They still implement the NZ `nzdata` surface, and they
are not UK connectors yet. Both keep their own quality gates in CI (`ruff` +
`mypy` + pytest for Python, `rubocop` + SimpleCov for Ruby). See each
directory's README for quickstarts and publishing steps.

## Run the API in Docker

The `Dockerfile` at the repo root runs the HTTP API on port `8787` with a non-root user and a health check.

```sh
docker build -t uk-connectors .
docker run -p 8787:8787 uk-connectors
```

## Documentation

- `docs/ARCHITECTURE.md` - how the pieces fit together, in plain language
- `docs/SECURITY.md` - key handling and the security checklist
- `docs/GLOSSARY.md` - plain-language definitions of every term
- `docs/RELEASING.md` - how versions, tags, and publishing work

## Contributing

See `CONTRIBUTING.md` for how to set up the repo, run the checks, and
open a pull request.

## License

MIT
