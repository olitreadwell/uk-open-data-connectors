# @open-data-connectors/uk-sources

Uniform TypeScript adapters for UK public data sources. Every adapter has the
same shape: a live fetch, a strict parse, and a committed fixture fallback so
builds work offline.

## Adapters

| id               | Source                              | Auth | What it does                                      |
| ---------------- | ----------------------------------- | ---- | ------------------------------------------------- |
| `flood-stations` | Environment Agency flood-monitoring | none | Monitoring stations with river and catchment      |
| `flood-readings` | Environment Agency flood-monitoring | none | Recent water levels for one station, newest first |
| `ons-datasets`   | ONS beta API dataset catalogue      | none | Every dataset the ONS lists, with its state and stamp |

The flood-monitoring adapters use `environment.data.gov.uk` under the Open
Government Licence v3:
<https://environment.data.gov.uk/flood-monitoring/doc/reference>

The ONS adapter uses the beta API behind the ONS website rebuild,
<https://api.beta.ons.gov.uk/v1/datasets>, also keyless and under the Open
Government Licence v3.

Note on sources that look obvious but are not usable: `api.ons.gov.uk` was
retired on 2024-11-25 and now answers every request with a decommission notice.
The beta API at `api.beta.ons.gov.uk/v1` replaced it for dataset metadata,
editions, versions, and observations.

## Usage

```ts
import { fetchFloodStationReadings, summarizeFloodReadings } from '@open-data-connectors/uk-sources';
import { fetchOnsDatasets, summarizeOnsDatasets } from '@open-data-connectors/uk-sources';

const readings = await fetchFloodStationReadings('1029TH', { limit: 96 });
const summary = summarizeFloodReadings(readings);
console.log(summary.latest?.value, summary.trend);

const catalogue = summarizeOnsDatasets(await fetchOnsDatasets());
console.log(catalogue.datasetCount, catalogue.yearCounts);
```

## Tests

Unit tests run against the committed fixtures in `src/fixtures`, offline.

```bash
npm run test --workspace @open-data-connectors/uk-sources
npm run test:smoke --workspace @open-data-connectors/uk-sources   # hits the live APIs
```
