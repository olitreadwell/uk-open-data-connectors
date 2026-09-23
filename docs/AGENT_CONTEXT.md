# Agent context

Handoff context for a fresh agent thread working in this repo. Read
`AGENTS.md` first, then this file, then `docs/ARCHITECTURE.md` if you need
the full map.

## What this repo is

TypeScript connectors for UK public data. One design, three languages:
`packages/uk-sources` is the source of truth for the adapters, `packages/api`
exposes them over HTTP, and `packages/cli` exposes them as `ukdata`. The
Python and Ruby ports still cover the New Zealand connectors they were
ported from.

npm workspaces, one package per concern.

## Current state

- `main` is the integration branch. Pull requests target `main`.
- Three UK adapters, all keyless: `flood-stations` and `flood-readings`
  (Environment Agency flood-monitoring API, Open Government Licence v3) and
  `ons-datasets` (ONS beta API dataset catalogue).
- Adapters live in `packages/uk-sources/src/*.ts` next to their tests, with
  committed fixtures in `packages/uk-sources/src/fixtures/`.
- Working tree clean; `npm run check` green.

## Commands

```sh
npm run check          # format + lint + type-check + tests with coverage
npm run test:smoke     # live tests against real APIs (needs RUN_SMOKE=1)
cd python && .venv/bin/ruff check src tests && .venv/bin/mypy && .venv/bin/pytest
cd ruby && bundle exec rake check
```

## Quality gates

- No `console.log` in committed code (warn/error allowed)
- No `any` escape hatches
- Every exported function has an explicit return type
- Every export has a doc comment above it
- 60% coverage threshold per package, enforced by `npm run check`
- Python: `ruff` + `mypy` + pytest coverage gate, deps pinned in `uv.lock`
- Ruby: `rubocop` + SimpleCov gate via `bundle exec rake check`
- Never fabricate a data source, a stat, or a "this worked" claim
- Fixtures are real snapshots from the live APIs, dated in their filenames

## Conventions

- Adapters live in `packages/uk-sources`
- HTTP wrapper is `packages/api`, CLI is `packages/cli`
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
   updated for the `@open-data-connectors` scope.
2. More UK sources are candidates once they are verified live. Two that are
   not usable as they stand: `api.ons.gov.uk` (retired 2024-11-25) and the
   CKAN API path on `data.gov.uk`.
3. Watch the nightly smoke workflow after any adapter change.
4. TS versioning is manual (no changesets); documented in `docs/RELEASING.md`.

## Docs index

- `AGENTS.md` - agent instructions and repo map
- `docs/ARCHITECTURE.md` - how the pieces fit together
- `docs/SECURITY.md` - key handling and security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - versioning and tags
- `docs/AGENT_CONTEXT.md` - this file
