# Architecture

Plain-language map of this repo. If you are new here, start with
`README.md`, then read this file.

## What this repo is

One design, three languages, with the TypeScript side covering UK sources.

- TypeScript: the source of truth. UK adapters, HTTP API, CLI.
- Python: a port of the New Zealand connectors (`python/`, package name
  `nzdata`).
- Ruby: a port of the New Zealand connectors (`ruby/`, gem name `nzdata`).

The TypeScript packages describe UK public data. The ports are older and
still describe NZ public data; porting them is separate work.

## The pieces

| Piece | Location | What it does |
| ----- | -------- | ------------ |
| Source adapters | `packages/uk-sources` | One adapter per UK public data source |
| HTTP API | `packages/api` | Exposes the connectors over HTTP |
| CLI | `packages/cli` | Exposes the connectors on the command line |
| Config packages | `packages/config-eslint`, `packages/config-typescript` | Shared lint and TypeScript settings |
| Python port | `python/` | NZ adapters in Python |
| Ruby port | `ruby/` | NZ adapters in Ruby |

## How a request flows

Every adapter speaks one interface (`UkDataAdapter`). It knows how to:
1. describe itself (`id`, `name`, `auth`, `description`)
2. fetch live data (`fetchLive`)
3. parse the response into plain objects

The HTTP API and the CLI call the same adapters. They never call the
endpoints directly. This is what "one design" means.

Registered adapters:

| id | Source | What it returns |
| --- | ------ | --------------- |
| `flood-stations` | Environment Agency flood-monitoring | Monitoring stations, with river and catchment |
| `flood-readings` | Environment Agency flood-monitoring | Recent water levels for one station, newest first |
| `ons-datasets` | ONS beta API dataset catalogue | Dataset records, with state, stamp, and national-statistic flag |

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

## Fixtures instead of the live network

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

The Python and Ruby ports mirror this with their own fixture-based tests and
opt-in smoke tests.

## Where quality gates live

- Coverage threshold 60% per package: `vitest.config.ts` (TypeScript),
  `pyproject.toml` (Python), `spec_helper.rb` (Ruby)
- Lint: ESLint (TypeScript), `ruff` (Python), `rubocop` (Ruby)
- Type check: `tsc` (TypeScript), `mypy` (Python)
- CI: `.github/workflows/ci.yml`, `.github/workflows/smoke.yml`

## Documentation index

- `README.md` - quickstart and commands
- `docs/ARCHITECTURE.md` - this file
- `docs/SECURITY.md` - keys, audits, and the security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - how versions and tags work
