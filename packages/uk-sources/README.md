# @nzlab/uk-sources

Uniform TypeScript adapters for UK public data sources. Every adapter has the
same shape: a live fetch, a strict parse, and a committed fixture fallback so
builds work offline.

The package scope is still `@nzlab` because the rest of this repo is a
scaffold of the NZ connectors repo. Renaming every scope to `@uklab` is a
separate change.

## Adapters

| id               | Source                                      | Auth | What it does                                     |
| ---------------- | ------------------------------------------- | ---- | ------------------------------------------------ |
| `flood-stations` | Environment Agency flood-monitoring         | none | Monitoring stations with river and catchment     |
| `flood-readings` | Environment Agency flood-monitoring         | none | Recent water levels for one station, newest first |

Both use the Environment Agency flood-monitoring API, keyless, under the Open
Government Licence v3: <https://environment.data.gov.uk/flood-monitoring/doc/reference>

Note on sources that look obvious but are not usable: `api.ons.gov.uk` was
retired on 2024-11-25 and now answers every request with a decommission notice.
The ONS beta API at `api.beta.ons.gov.uk/v1` is still live, and is the next
adapter to add.

## Usage

```ts
import { fetchFloodStationReadings, summarizeFloodReadings } from '@nzlab/uk-sources';

const readings = await fetchFloodStationReadings('1029TH', { limit: 96 });
const summary = summarizeFloodReadings(readings);
console.log(summary.latest?.value, summary.trend);
```

## Tests

Unit tests run against the committed fixtures in `src/fixtures`, offline.

```bash
npm run test --workspace @nzlab/uk-sources
npm run test:smoke --workspace @nzlab/uk-sources   # hits the live API
```
