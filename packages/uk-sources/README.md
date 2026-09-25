# @nzlab/uk-sources

Uniform TypeScript adapters for UK public data sources. Every adapter has the
same shape: a live fetch, a strict parse, and a committed fixture fallback so
builds work offline.

The package scope is still `@nzlab` because the rest of this repo is a
scaffold of the NZ connectors repo. Renaming every scope to `@uklab` is a
separate change.

## Adapters

| id                         | Source                              | Auth | What it does                                                 |
| -------------------------- | ----------------------------------- | ---- | ------------------------------------------------------------ |
| `flood-stations`           | Environment Agency flood-monitoring | none | Monitoring stations with river and catchment                 |
| `flood-readings`           | Environment Agency flood-monitoring | none | Recent water levels for one station, newest first            |
| `ons-datasets`             | ONS beta API dataset catalogue      | none | Every dataset the ONS lists, with its state and stamp        |
| `food-hygiene-authorities` | Food Standards Agency food hygiene  | none | Every local authority register, with its establishment count |

The flood-monitoring adapters use `environment.data.gov.uk` under the Open
Government Licence v3:
<https://environment.data.gov.uk/flood-monitoring/doc/reference>

The ONS adapter uses the beta API behind the ONS website rebuild,
<https://api.beta.ons.gov.uk/v1/datasets>, also keyless and under the Open
Government Licence v3.

The food hygiene adapter uses the FSA Food Hygiene Rating Scheme API,
<https://api.ratings.food.gov.uk/Authorities/basic>, also keyless and under the
Open Government Licence v3. It answers only with the version header the FSA
asks for, `x-api-version: 2`; without it the endpoint returns HTTP 404.

Note on sources that look obvious but are not usable: `api.ons.gov.uk` was
retired on 2024-11-25 and now answers every request with a decommission notice.
The beta API at `api.beta.ons.gov.uk/v1` replaced it for dataset metadata,
editions, versions, and observations.

## Usage

```ts
import { fetchFloodStationReadings, summarizeFloodReadings } from '@nzlab/uk-sources';
import { fetchOnsDatasets, summarizeOnsDatasets } from '@nzlab/uk-sources';
import { fetchFoodHygieneAuthorities, summarizeFoodHygieneAuthorities } from '@nzlab/uk-sources';

const readings = await fetchFloodStationReadings('1029TH', { limit: 96 });
const summary = summarizeFloodReadings(readings);
console.log(summary.latest?.value, summary.trend);

const catalogue = summarizeOnsDatasets(await fetchOnsDatasets());
console.log(catalogue.datasetCount, catalogue.yearCounts);

const registers = summarizeFoodHygieneAuthorities(await fetchFoodHygieneAuthorities());
console.log(registers.authorityCount, registers.establishmentCount);
```

## Tests

Unit tests run against the committed fixtures in `src/fixtures`, offline.

```bash
npm run test --workspace @nzlab/uk-sources
npm run test:smoke --workspace @nzlab/uk-sources   # hits the live APIs
```
