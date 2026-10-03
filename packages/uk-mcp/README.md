# @uk-open-data-connectors/uk-mcp

An MCP server over the UK open data connector library. Point Claude
Code, Claude Desktop, or a ChatGPT connector at it and the model can list the
sources, check which ones are answering, and pull real data.

Every source in this library is keyless. Nothing here needs an account.

## Tools

| Tool                          | What it does                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `list_sources`                | Every source, with the id the other tools take.                                       |
| `probe_sources`               | Live fetch against each source, so you know a number is real and not a stale fixture. |
| `fetch_source`                | One source through its adapter.                                                       |
| `uk_ancient_woodland`         | Ancient woodland in England, by type and size band.                                   |
| `uk_bank_rate`                | The Bank of England Bank Rate, daily since 1975.                                      |
| `uk_carbon_intensity`         | Half-hourly GB grid carbon intensity over a window.                                   |
| `uk_flood_station_readings`   | Recent water levels at one EA monitoring station.                                     |
| `uk_flood_stations`           | EA monitoring stations with river and catchment.                                      |
| `uk_food_hygiene_authorities` | Local authority food hygiene registers and establishment counts.                      |
| `uk_ons_datasets`             | The ONS beta API dataset catalogue.                                                   |
| `uk_parliament_seats`         | Seats by party in the Commons or the Lords.                                           |
| `uk_planning_datasets`        | MHCLG Planning Data platform datasets.                                                |
| `uk_police_crime_categories`  | Crime types published by police.uk.                                                   |
| `uk_police_crime_months`      | Months published by police.uk.                                                        |
| `uk_police_crime_summary`     | Recorded crime near a point, across recent months.                                    |
| `uk_tfl_bike_points`          | TfL Santander Cycles docking stations.                                                |

`probe_sources` matters more than it looks. Every adapter falls back to a
committed fixture when the upstream API is slow, so a build never fails on a
flaky government host. That also means a number can be months old without
anyone noticing. Probe first when the freshness of the answer matters.

## Running it

```sh
npm install
npm run build
node dist/stdio.js
```

The bin is `uk-open-data-mcp`, so a global install gives you:

```sh
npx @uk-open-data-connectors/uk-mcp
```

## Wiring it into Claude Code

```sh
claude mcp add uk-open-data -- node /absolute/path/to/packages/uk-mcp/dist/stdio.js
```

Or in `.mcp.json` at the root of whatever project you want it in:

```json
{
  "mcpServers": {
    "uk-open-data": {
      "command": "node",
      "args": ["/absolute/path/to/packages/uk-mcp/dist/stdio.js"]
    }
  }
}
```

## Wiring it into Claude Desktop

Add the same block to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS).

## Wiring it into ChatGPT

ChatGPT connectors take a remote MCP endpoint, so this stdio server needs a
tunnel in front of it:

```sh
npx @modelcontextprotocol/inspector node dist/stdio.js   # inspect and test locally
cloudflared tunnel --url http://localhost:PORT            # then point the connector at it
```

## Adding a tool

Wrap the named function from `@$uk-open-data-connectors/uk-sources`, not the
adapter's `fetchLive()`. `fetchLive()` takes no query parameters, so a tool
built on it can only ever return the adapter's default slice. The named
functions carry the real parameters.

Add one entry to `UK_QUERY_TOOLS` in
`src/ukOpenDataMcpServer.ts`, rebuild, and the tool appears.
