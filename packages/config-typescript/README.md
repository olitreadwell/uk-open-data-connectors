# @uk-open-data-connectors/config-typescript

Internal package. It is not published to npm.

Shared TypeScript compiler configuration for the packages in this repo.

## What this package does

- Ships two JSON compiler configs, `base.json` and `library.json`.
- Turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and other strict checks.
- Adds build output settings for a library package in `library.json`.
- Gives every package in the repo one TypeScript baseline.
- Tracks TypeScript 6.0.3.

## Install

This package is private. It is consumed as a workspace dependency inside this repo.

```sh
npm install
```

## Quick start

```json
{
  "extends": "@uk-open-data-connectors/config-typescript/library.json",
  "compilerOptions": {
    "rootDir": ".",
    "types": ["vitest/globals", "node"]
  },
  "include": ["src/**/*.ts", "vitest.config.ts", "eslint.config.mjs"],
  "exclude": ["node_modules", "coverage"]
}
```

## Exports

| Export | What it ships |
| ------ | ------------- |
| `@uk-open-data-connectors/config-typescript/base.json` | The shared strict compiler options. |
| `@uk-open-data-connectors/config-typescript/library.json` | The base options plus `jsx`, `outDir`, `rootDir`, the `@/*` path alias, and library include and exclude globs. |

## Notes and limits

- The package is private. It is not published to npm.
- The package ships two JSON files. It has no `exports` map, so a consumer extends the file path directly.
- `base.json` excludes `node_modules`, `dist`, `.next`, and `.turbo`.
- `library.json` excludes test, spec, and story files from the build.
- The toolchain is TypeScript 6.0.3.

## Data sources and licences

None. This package ships no data.

## Package licence

MIT. See LICENSE.

## Links

- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/config-typescript>
- docs: [Architecture](../../docs/ARCHITECTURE.md)
