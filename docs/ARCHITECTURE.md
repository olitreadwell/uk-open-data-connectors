# Architecture

Plain-language map of this repo. If you are new here, start with
`README.md`, then read this file.

## What this repo is

One design, one language.

- TypeScript: the source of truth. UK adapters, HTTP API, CLI.

## The pieces

| Piece | Location | What it does |
| ----- | -------- | ------------ |
| Source adapters | `packages/uk-sources` | One adapter per UK public data source |
| HTTP API | `packages/api` | Exposes the connectors over HTTP |
| CLI | `packages/cli` | Exposes the connectors on the command line |
| Config packages | `packages/config-eslint`, `packages/config-typescript` | Shared lint and TypeScript settings |

## How a request flows

Every adapter speaks one interface (`UkDataAdapter`). It knows how to:
1. describe itself (`id`, `name`, `auth`, `description`)
2. fetch live data (`fetchLive`)
3. parse the response into plain objects

The HTTP API and the CLI call the same adapters. They never call the
endpoints directly. This is what "one design" means.

Twenty-four of the 25 adapters fetch through the shared helper in
`packages/uk-sources/src/http.ts`. It sets one `User-Agent`
(`uk-open-data-connectors (Language=TypeScript)`), aborts after 30 seconds, and
marks HTTP 429, HTTP 5xx and network failures as `retryable` on the thrown
`UkSourceApiError`, with the HTTP status attached. Adapters pass their own
headers (the FSA API version header, the Discovery `Accept` header) and the
helper merges them. The carbon intensity adapter calls `fetch` directly, so it
has no shared `User-Agent`, timeout, or `retryable` flag. The TfL line status
adapter and the police street crime month calls ask the helper to retry
transient failures.

Registered adapters:

| id | Source | What it returns |
| --- | ------ | --------------- |
| `flood-stations` | Environment Agency flood-monitoring | Monitoring stations, with river and catchment |
| `flood-readings` | Environment Agency flood-monitoring | Recent water levels for one station, newest first |
| `ons-datasets` | ONS beta API dataset catalogue | Dataset records, with state, stamp, and national-statistic flag |
| `data-gov-uk-ckan` | Data.gov.uk CKAN catalogue | A search page of datasets, with publisher, licence, and resource count |
| `gov-uk-content` | GOV.UK Content API | One GOV.UK page, with taxons, organisations, and dates |

## Summaries built into the adapters

Two adapters answer with a summary next to the raw rows, so callers do not
have to recompute the same figures:

- `summarizeFloodReadings` gives the count, the time range, the latest value,
  and whether the trend is rising, falling, or steady.
- `summarizeOnsDatasets` gives the dataset count, the count flagged as
  national statistics, the count with no flag, and a count per last-updated
  year.

The API returns both the summary and the records. The CLI prints the same
shape as JSON.

## Keyless first

Every UK source works without an API key. Keys are read from the environment
only. The API and CLI never accept keys from callers, and keys are never
committed to the repo.

## Tests use fixtures

Tests never touch the network unless you set `RUN_SMOKE=1`.

Each adapter has committed fixtures in `src/fixtures/`. A fixture is a real
snapshot of a live API response, for example
`packages/uk-sources/src/fixtures/flood-stations.json`.

Why: tests run fast, offline, and give the same answer on every machine.

## Testing strategy

| Kind | Where | When it runs |
| --- | --- | --- |
| Unit tests | `src/*.test.ts` next to each source file | `npm run check` |
| Integration tests | `packages/api/src/app.test.ts` | `npm run check` |
| E2E tests | `packages/api/src/e2e.test.ts` | `npm run check` |
| Live smoke tests | `*.test.ts` gated on `RUN_SMOKE=1` | opt-in, or nightly CI |
| Contract test | `packages/api/src/openapi.contract.test.ts` | `npm run check` |

## Where quality gates live

- Coverage threshold 60% per package: `vitest.config.ts`
- Lint: ESLint
- Type check: `tsc`
- CI: `.github/workflows/ci.yml`, `.github/workflows/smoke.yml`

## Documentation index

- `README.md` - quickstart and commands
- `docs/ARCHITECTURE.md` - this file
- `docs/CONNECTOR_DISCOVERY.md` - what has been checked live, and the sources that did not work
- `docs/SECURITY.md` - keys, audits, and the security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - how versions and tags work
- `docs/AGENT_CONTEXT.md` - handoff context for an agent working in this repo
- `COUNTRY.md` - adapter status and what is not usable
