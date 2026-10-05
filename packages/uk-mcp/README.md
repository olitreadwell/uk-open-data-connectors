# @uk-open-data-connectors/uk-mcp

An MCP server that gives Claude, ChatGPT, and other MCP clients access to 22 UK open data sources.

## What this package does

- Runs a Model Context Protocol (MCP) server over the UK connector library.
- Lists every source, probes each one live, and fetches one source by id.
- Adds 13 tools, one for each named fetch function in `uk-sources`.
- Speaks stdio, so Claude Code and Claude Desktop can start it directly.
- Needs no keys, because every UK source is keyless.

## Install

```sh
npm install @uk-open-data-connectors/uk-mcp
```

## Quick start

```sh
npx -y --package @uk-open-data-connectors/uk-mcp uk-open-data-mcp
```

The server speaks stdio and waits for an MCP client.

## Tools

| Tool | What it does |
| ---- | ------------ |
| `list_sources` | Every source, with the id the other tools take. |
| `probe_sources` | Live fetch against each source, so you know a number is real and not a stale fixture. |
| `fetch_source` | One source through its adapter. Takes an optional `apiKey`. |
| `uk_ancient_woodland` | Ancient woodland in England, by type and size band. |
| `uk_bank_rate` | The Bank of England Bank Rate, daily since 1975. |
| `uk_carbon_intensity` | Half-hourly GB grid carbon intensity over a window. |
| `uk_flood_station_readings` | Recent water levels at one Environment Agency monitoring station. |
| `uk_flood_stations` | Environment Agency monitoring stations, with river and catchment. |
| `uk_food_hygiene_authorities` | Local authority food hygiene registers and establishment counts. |
| `uk_ons_datasets` | The ONS beta API dataset catalogue. |
| `uk_parliament_seats` | Seats by party in the Commons or the Lords. |
| `uk_planning_datasets` | MHCLG Planning Data platform datasets. |
| `uk_police_crime_categories` | Crime types published by police.uk. |
| `uk_police_crime_months` | Months published by police.uk. |
| `uk_police_crime_summary` | Recorded crime near a point, across recent months. |
| `uk_tfl_bike_points` | TfL Santander Cycles docking stations. |

## Notes and limits

- `probe_sources` matters more than it looks. Every adapter falls back to a committed fixture when the upstream API is slow, so a build never fails on a flaky government host. A number can be months old without anyone noticing. Probe first when freshness matters.
- The server speaks stdio. A remote client, such as a ChatGPT connector, needs a tunnel in front of the local process.
- Add it to Claude Code with `claude mcp add uk-open-data -- npx -y --package @uk-open-data-connectors/uk-mcp uk-open-data-mcp`.
- For Claude Desktop, add the same command to `claude_desktop_config.json`.
- `uk_flood_station_readings` takes `stationReference` and `limit`. The limit is 1 to 1000 and defaults to 96. The station defaults to `1029TH`.
- `uk_flood_stations` takes a `limit` of 1 to 1000. The default is 25.
- `uk_ons_datasets` takes a `limit` of 1 to 1000.
- `uk_carbon_intensity` takes `windowDays` (1 to 14), or `from` and `to` as ISO timestamps.
- `uk_parliament_seats` takes `house` (1 for the Commons, 2 for the Lords) and `forDate`.
- `uk_police_crime_summary` takes `latitude`, `longitude`, and `monthCount` (1 to 12). The point defaults to central London.
- Only `uk_tfl_bike_points` and `fetch_source` take an `apiKey`, for a higher TfL rate limit.
- The bin is `uk-open-data-mcp`, and the entry point is `dist/stdio.js`.

## Data sources and licences

This package reads the adapters in `@uk-open-data-connectors/uk-sources`. That package lists every publisher, source URL, and data licence, see [the uk-sources README](../uk-sources/README.md#data-sources-and-licences).

Most data carries the Open Government Licence v3. The two TfL adapters carry TfL Open Data. The carbon intensity series carries Creative Commons Attribution 4.0. The Parliament seat counts carry the Open Parliament Licence v3.0. The postcode lookup uses postcodes.io, a third-party service that serves ONS and Ordnance Survey data.

## Package licence

MIT. See LICENSE.

## Links

- npm: <https://www.npmjs.com/package/@uk-open-data-connectors/uk-mcp>
- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/uk-mcp>
- docs: [Architecture](../../docs/ARCHITECTURE.md)
