# @uk-open-data-connectors/config-eslint

Internal package. It is not published to npm.

Shared ESLint configuration for the packages in this repo, for JavaScript and TypeScript code.

## What this package does

- Exports a flat ESLint config for TypeScript and JavaScript packages.
- Turns on strict type-checked rules and JSDoc checks.
- Bans `console.log`, except `warn` and `error`.
- Bans `any`.
- Keeps import and unused-variable rules consistent across packages.

## Install

This package is private. It is consumed as a workspace dependency inside this repo.

```sh
npm install
```

## Quick start

```js
// eslint.config.mjs
import config from '@uk-open-data-connectors/config-eslint/base';

export default config;
```

## Exports

| Export | What it ships |
| ------ | ------------- |
| `@uk-open-data-connectors/config-eslint/base` | The base flat config. It applies `js.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, and the repo's rule overrides. |

## Notes and limits

- The package is private. It is not published to npm.
- It ships one config file, `base.js`, as an ES module.
- The peer dependencies are `eslint` 9.39.5 and `typescript` 6.0.3.
- Packages in this repo add `@uk-open-data-connectors/config-eslint` to `devDependencies` as `*`.
- The base config expects a TypeScript project. The consuming package sets `parserOptions.tsconfigRootDir` and `parserOptions.projectService`.

## Data sources and licences

None. This package ships no data.

## Package licence

MIT. See LICENSE.

## Links

- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/config-eslint>
- docs: [Architecture](../../docs/ARCHITECTURE.md)
