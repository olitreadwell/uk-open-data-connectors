# Agent context

Handoff context for a fresh agent thread working in this repo. Read
`AGENTS.md` first, then this file, then `docs/ARCHITECTURE.md` if you need
the full map.

## What this repo is

TypeScript connectors for UK public data. `packages/uk-sources` is the source
of truth for the adapters, `packages/api` exposes them over HTTP, and
`packages/cli` exposes them as `ukdata`.

npm workspaces, one package per concern.

## Current state

- `main` is the integration branch. Pull requests target `main`.
- Twenty-four UK adapters, all keyless. Eleven shipped earlier (Environment
  Agency flood-monitoring, ONS dataset catalogue, FSA food hygiene, TfL cycle
  hire, Planning Data, Natural England ancient woodland, Bank of England Bank
  Rate, police.uk crime, carbon intensity, Parliament seats). Eleven more
  landed on 2026-10-05: `postcode-lookup`, `explore-education-statistics`,
  `london-datastore`, `tna-discovery`, `ukhsa-dashboard`, `nomis`,
  `fingertips-indicators`, `find-a-tender`, `tfl-line-status`,
  `public-health-scotland`, and `nhsbsa-ckan`, plus `neso-generation-mix` on
  2026-10-18, and `data-gov-uk-ckan` on 2026-11-05. Licences and endpoints are
  in `docs/CONNECTOR_DISCOVERY.md`.
- Adapters live in `packages/uk-sources/src/*.ts` next to their tests, with
  committed fixtures in `packages/uk-sources/src/fixtures/`. New fixtures are
  dated in their filenames.
- Twenty-three of the 24 adapters fetch through `httpGet` in
  `packages/uk-sources/src/http.ts`: one `User-Agent`, a 30 second timeout, and
  `retryable` set on HTTP 429, HTTP 5xx and network failures. A caller-supplied
  `User-Agent` replaces the default. The carbon intensity adapter calls `fetch`
  directly, with no shared `User-Agent`, timeout, or `retryable` signal. The
  TfL line status adapter and the police street crime month calls retry
  transient failures; the others make one attempt per call.
- `npm run check` is green. The Nomis fixture is a documented trim of the
  1,617-definition live catalogue; the adapter reads the whole live response.
- The NZ Python and Ruby copies were removed on 2026-11-05. The MCP server
  now exposes a named tool for every library query, and `probe_sources`
  only probes the ids it is given.

## Commands

```sh
npm run check          # format + lint + type-check + tests with coverage
npm run test:smoke     # live tests against real APIs (needs RUN_SMOKE=1)
```

## Quality gates

- No `console.log` in committed code (warn/error allowed)
- No `any` escape hatches
- Every exported function has an explicit return type
- Every export has a doc comment above it
- 60% coverage threshold per package, enforced by `npm run check`
- Never fabricate a data source, a stat, or a "this worked" claim
- Fixtures are real snapshots from the live APIs, dated in their filenames

## Conventions

- Adapters live in `packages/uk-sources`, and fetches use `httpGet` unless a
  source needs its own transport
- HTTP wrapper is `packages/api`, CLI is `packages/cli`
- `normalizeSourceApiKey` trims an optional key, so a key set to an empty
  string is treated as unset
- Every UK source is keyless. Any future key is read from env only,
  server-side, and the API and CLI never accept keys from callers
- Tests never hit the network unless `RUN_SMOKE=1` is set
- Test files sit next to their source file (`onsDatasets.test.ts` tests
  `onsDatasets.ts`)
- Use 2-3 word, domain-prefixed names for exports (`getUkDataSource`, not
  `get`)
- Pick one spelling per concept and use it everywhere
- A new UK source lands in `packages/uk-sources` and is wired into the API,
  the CLI, and the OpenAPI contract test in the same change

## Open items

1. Vendoring: `uk-data-lab` runs `scripts/sync-connectors.mjs` against this
   repo. That script matches the package name this repo used before the scope
   rename, so the daily loop cannot vendor this package until the script is
   updated for the `@uk-open-data-connectors` scope.
2. `api.ons.gov.uk` is still not usable as it stands. It retired on 2024-11-25.
   The Public Health Scotland portal is occasionally flaky (504 or reset), so
   the nightly smoke run can fail on it now and then.
3. Watch the nightly smoke workflow after any adapter change.
4. TS versioning is manual (no changesets); documented in `docs/RELEASING.md`.

## Docs index

- `AGENTS.md` - agent instructions and repo map
- `docs/ARCHITECTURE.md` - how the pieces fit together
- `docs/SECURITY.md` - key handling and security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - versioning and tags
- `docs/AGENT_CONTEXT.md` - this file
