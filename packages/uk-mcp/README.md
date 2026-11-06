# @uk-open-data-connectors/uk-mcp

An MCP server that gives Claude, ChatGPT, and other MCP clients access to 25 UK open data sources.

## What this package does

- Runs a Model Context Protocol (MCP) server over the UK connector library.
- Lists every source, probes each one live, and fetches one source by id.
- Adds 25 named query tools, plus `list_sources`, `probe_sources`, and `fetch_source`.
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
| `probe_sources` | Live fetch against each requested source, so you know the answer is live data. |
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
| `uk_neso_generation_mix` | Half-hourly GB generation by fuel, with each fuel share. |
| `uk_tfl_line_status` | Current status of every London Underground service. |
| `uk_postcode_lookup` | Coordinates and administrative areas for a UK postcode. |
| `uk_nomis_datasets` | Dataset definitions from the Nomis SDMX catalogue. |
| `uk_tna_discovery` | Search The National Archives Discovery catalogue. |
| `uk_ukhsa_metrics` | Metric points from the UKHSA data dashboard. |
| `uk_london_datastore` | The London Datastore package catalogue. |
| `uk_nhsbsa_catalogue` | The NHSBSA CKAN dataset catalogue. |
| `uk_public_health_scotland` | The Public Health Scotland dataset catalogue. |
| `uk_find_a_tender` | Recent Find a Tender procurement releases. |
| `uk_fingertips_indicators` | Public health indicator metadata from Fingertips. |
| `uk_explore_education` | Department for Education publications, one page at a time. |

## Notes and limits

- `probe_sources` takes optional `ids` and probes only those sources. A failed live fetch returns an error; fixtures are never a silent fallback.
- The server speaks stdio. A remote client, such as a ChatGPT connector, needs a tunnel in front of the local process.
- Add it to Claude Code with `claude mcp add uk-open-data -- npx -y --package @uk-open-data-connectors/uk-mcp uk-open-data-mcp`.
- For Claude Desktop, add the same command to `claude_desktop_config.json`.
- `uk_flood_station_readings` takes `stationReference` and `limit`. The limit is 1 to 1000 and defaults to 96. The station defaults to `1029TH`.
- `uk_flood_stations` takes a `limit` of 1 to 1000. The default is 25.
- `uk_ons_datasets` takes a `limit` of 1 to 1000.
- `uk_carbon_intensity` takes `windowDays` (1 to 14), or `from` and `to` as ISO timestamps.
- `uk_parliament_seats` takes `house` (1 for the Commons, 2 for the Lords) and `forDate`.
- `uk_police_crime_summary` takes `latitude`, `longitude`, and `monthCount` (1 to 12). The point defaults to central London.
- Only `uk_tfl_bike_points`, `uk_tfl_line_status`, and `fetch_source` take an `apiKey`, for a higher TfL rate limit.
- The bin is `uk-open-data-mcp`, and the entry point is `dist/stdio.js`.

## Data sources and licences

This package reads the adapters in `@uk-open-data-connectors/uk-sources`. That package lists every publisher, source URL, and data licence, see [the uk-sources README](../uk-sources/README.md#data-sources-and-licences).

Most data carries the Open Government Licence v3. The two TfL adapters carry TfL Open Data. The carbon intensity series carries Creative Commons Attribution 4.0. The Parliament seat counts carry the Open Parliament Licence v3.0. The NESO generation mix carries the NESO Open Data Licence. Data.gov.uk licences vary by dataset. The postcode lookup uses postcodes.io, a third-party service that serves ONS and Ordnance Survey data.

## Package licence

MIT. See LICENSE.

## Links

- npm: <https://www.npmjs.com/package/@uk-open-data-connectors/uk-mcp>
- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/uk-mcp>
- docs: [Architecture](../../docs/ARCHITECTURE.md)
