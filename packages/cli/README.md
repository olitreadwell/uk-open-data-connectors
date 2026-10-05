# @uk-open-data-connectors/connectors-cli

A `ukdata` command line tool that prints UK open data as JSON, so any language can shell out to it.

## What this package does

- Ships the `ukdata` command line tool.
- Prints JSON to stdout and errors to stderr.
- Exposes the `uk-sources` adapters to scripts, shells, and other languages.
- Covers five commands: `sources`, `probe`, `flood-stations`, `flood-readings`, and `ons-datasets`.
- Needs no API keys, because every UK source is keyless.

## Install

```sh
npm install @uk-open-data-connectors/connectors-cli
```

## Quick start

```sh
npx -y --package @uk-open-data-connectors/connectors-cli ukdata sources
```

## Commands

| Command | What it does |
| ------- | ------------ |
| `ukdata sources` | Lists every adapter with its id, name, auth, and description. |
| `ukdata probe <id>` | Runs a live fetch against one adapter and prints the probe result. |
| `ukdata flood-stations [--limit <n>]` | Lists Environment Agency monitoring stations. |
| `ukdata flood-readings [--station <ref>] [--limit <n>]` | Lists recent water levels for one station, newest first, with a summary. |
| `ukdata ons-datasets [--limit <n>]` | Lists the ONS dataset catalogue, with a summary. |
| `ukdata help` | Shows the help text. |

## Notes and limits

- Output is JSON on stdout. Errors are plain text on stderr.
- The exit code is 0 on success and 1 on failure.
- `ukdata` with no command prints the help text and exits 0.
- `flood-readings` defaults to station `1029TH`.
- `--limit` must be a positive whole number.
- The short flags are `-l` for `--limit`, `-s` for `--station`, and `-h` for `--help`.
- The tool falls back to a committed fixture when the live call fails, because the library does. Run `ukdata probe <id>` to check freshness.
- Every UK source is keyless. The CLI never accepts a key from a caller.
- The bin is `ukdata`. The package builds with `tsc -p tsconfig.build.json` into `dist`.

## Data sources and licences

This package reads the adapters in `@uk-open-data-connectors/uk-sources`. That package lists every publisher, source URL, and data licence, see [the uk-sources README](../uk-sources/README.md#data-sources-and-licences).

Most data carries the Open Government Licence v3. The two TfL adapters carry TfL Open Data. The carbon intensity series carries Creative Commons Attribution 4.0. The Parliament seat counts carry the Open Parliament Licence v3.0.

## Package licence

MIT. See LICENSE.

## Links

- npm: <https://www.npmjs.com/package/@uk-open-data-connectors/connectors-cli>
- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/cli>
- docs: [Repository README](../../README.md)
