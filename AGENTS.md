# Agent instructions

TypeScript connectors for UK public data, with Python and Ruby ports that
still track the New Zealand connectors they came from. npm workspaces, one
package per concern. Read `docs/ARCHITECTURE.md` for the plain-language map,
`docs/GLOSSARY.md` for terms.

## Repo map

- `packages/uk-sources` - one adapter per UK data source (Environment
  Agency flood-monitoring stations and readings, ONS dataset catalogue)
- `packages/api` - HTTP wrapper (Hono), OpenAPI spec, Swagger UI
- `packages/cli` - `ukdata` command line tool
- `packages/config-eslint`, `packages/config-typescript` - shared config
- `python/` - Python port of the NZ connectors (`nzdata` on PyPI)
- `ruby/` - Ruby port of the NZ connectors (`nzdata` gem)
- `docs/` - architecture, security, glossary, releasing

## Commands

```sh
npm run check          # format + lint + type-check + tests with coverage
npm run test:smoke     # live tests against real APIs (needs RUN_SMOKE=1)
cd python && .venv/bin/ruff check src tests && .venv/bin/mypy && .venv/bin/pytest
cd ruby && bundle exec rake check
```

Run `npm run check` before finishing any TypeScript change. Python and
Ruby changes run their own gates.

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
- The HTTP wrapper is `packages/api`, the CLI is `packages/cli`
- Every UK source is keyless. Any future key is read from env only,
  server-side, and the API and CLI never accept keys from callers
- Tests never hit the network unless `RUN_SMOKE=1` is set
- Test files sit next to their source file (`client.test.ts` tests
  `client.ts`)
- Use 2-3 word, domain-prefixed names for exports
  (`getUkDataSource`, not `get`)
- Pick one spelling per concept and use it everywhere (`dataflowId`, not
  `dataset` in one place and `flow` in another)
- The Python and Ruby ports are still the NZ ones. Say so in any change
  that touches the shared design, or port them.

## Docs for humans and agents

- `docs/ARCHITECTURE.md` - how the pieces fit together
- `docs/SECURITY.md` - key handling and security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - versioning and tags
- `docs/AGENT_CONTEXT.md` - handoff context for new agent threads
- `CONTRIBUTING.md` - how to contribute, set up, and open a PR

Write docs in plain language. Short sentences. Define acronyms on first
use. The audience includes ESL readers and neurodivergent readers.
