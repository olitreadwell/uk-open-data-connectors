# CLAUDE.md

Stack notes for this repo. `AGENTS.md` holds the conventions and quality
gates; this file covers the toolchain.

- Node 22.17.1. `.nvmrc` is the source of truth.
- npm workspaces with a committed `package-lock.json`. CI runs `npm ci`,
  and so does the Docker build.
- TypeScript 6.0.3, ESM only. `packages/config-typescript` turns on
  `strict` and `noUncheckedIndexedAccess`.
- `packages/uk-sources` and `packages/cli` build with
  `tsc -p tsconfig.build.json`. `packages/api` runs from source under
  `tsx` and has no build step.
- Tests run on Vitest 3.2.7. Coverage gates live in each package's
  `vitest.config.ts` (v8, 60% for lines, functions, branches and
  statements).
- The HTTP layer is Hono. The OpenAPI document is
  `packages/api/src/openapi.ts`, served at `/openapi.json`, with Swagger UI
  at `/docs`.
- The Dockerfile builds the API image, listens on port 8787, and checks
  `/health`.
- `python/` and `ruby/` are the NZ ports. UK changes stay in `packages/`.
