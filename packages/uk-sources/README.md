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
| `tfl-bike-points`           | Transport for London cycle hire     | none | Every Santander Cycles docking station, with docking points and docked bikes |
| `planning-datasets`        | Planning Data platform (MHCLG)      | none | Every planning dataset, with the records published behind it |
| `ancient-woodland`         | Natural England ancient woodland    | none | Ancient woodland polygons for England, counted by type and size |
| `bank-rate`                | Bank of England Bank Rate           | none | The daily official Bank Rate, one reading per business day since 1975 |
| `police-crimes`            | Home Office police.uk               | none | Street-level crime within a mile of a point, counted by crime type and outcome |
| `carbon-intensity`         | National Energy System Operator     | none | Half-hourly carbon intensity for Great Britain, with the window's cleanest and dirtiest half hours |

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

The Planning Data platform adapter uses the dataset catalogue behind
<https://www.planning.data.gov.uk/dataset>, <https://www.planning.data.gov.uk/dataset.json>,
which answers without a key under the Open Government Licence v3. The file
lists datasets alongside the platform's pipeline configuration and provenance
tables, so the adapter keeps the entries whose `realm` is `dataset`.

The ancient woodland adapter uses Natural England's Ancient Woodland (England)
layer on the Defra ArcGIS estate,
<https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Ancient_Woodland_England/FeatureServer/0>,
which answers without a key under the Open Government Licence v3. The layer
carries more than fifty thousand polygons, past ArcGIS's page size, so the
adapter reads the counts from the service's own statistics queries instead of
downloading the features.

The Bank Rate adapter uses the Bank of England's Interactive Statistical
Database (IADB),
<https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp>,
which answers without a key. The daily series, `IUDBEDR`, starts on 2 January
1975; asking for an earlier start returns the database's error page instead of
a CSV, so the adapter starts there. The Bank's published terms place
reproduction of Database data under the Open Government Licence v3:
<https://www.bankofengland.co.uk/legal>.

The recorded crime adapter uses the Home Office police.uk API,
<https://data.police.uk/api/crimes-street/all-crime>, which answers without a
key under the Open Government Licence v3. It holds the last 36 months of
street-level crime from the 44 forces of England, Wales and Northern Ireland,
so nothing here covers Scotland. A call takes a point and returns everything
within a mile of it, which is why the adapter counts around one point rather
than a boundary, and it asks for one month at a time to stay inside the API's
limit of 15 requests a second.

The docking station adapter uses TfL's Unified API,
<https://api.tfl.gov.uk/BikePoint>, which answers without a key. TfL asks for
an app key above the free rate limit, so `fetchTflBikePoints` takes an optional
key and sends it as the `app_key` query parameter. The data is published as TfL
Open Data: <https://tfl.gov.uk/info-for/open-data-users/>.

The carbon intensity adapter uses the National Energy System Operator's Carbon
Intensity API, <https://api.carbonintensity.org.uk/intensity>, which answers
without a key. It is the official half-hourly series for Great Britain, with a
reading and a grade for every half hour, and the API's own terms place the data
under the Creative Commons Attribution 4.0 licence:
<https://terms.carbonintensity.org.uk/>. The API refuses a range longer than 31
days, so the adapter reads whole days and asks for a window that ends at the
start of today, which keeps every reading in it a settled one.

Note on sources that look obvious but are not usable: `api.ons.gov.uk` was
retired on 2024-11-25 and now answers every request with a decommission notice.
The beta API at `api.beta.ons.gov.uk/v1` replaced it for dataset metadata,
editions, versions, and observations.

## Usage

```ts
import {
  fetchAncientWoodlandProfile,
  fetchFloodStationReadings,
  summarizeFloodReadings,
} from '@nzlab/uk-sources';
import { fetchOnsDatasets, summarizeOnsDatasets } from '@nzlab/uk-sources';
import { fetchFoodHygieneAuthorities, summarizeFoodHygieneAuthorities } from '@nzlab/uk-sources';
import { fetchTflBikePoints, summarizeTflBikePoints } from '@nzlab/uk-sources';
import { fetchCarbonIntensityWindow } from '@nzlab/uk-sources';

const readings = await fetchFloodStationReadings('1029TH', { limit: 96 });
const summary = summarizeFloodReadings(readings);
console.log(summary.latest?.value, summary.trend);

const catalogue = summarizeOnsDatasets(await fetchOnsDatasets());
console.log(catalogue.datasetCount, catalogue.yearCounts);

const registers = summarizeFoodHygieneAuthorities(await fetchFoodHygieneAuthorities());
console.log(registers.authorityCount, registers.establishmentCount);

const docks = summarizeTflBikePoints(await fetchTflBikePoints());
console.log(docks.stationCount, docks.dockCount, docks.largestStations[0]?.name);

const planning = summarizePlanningDatasets(await fetchPlanningDatasets());
console.log(planning.datasetCount, planning.entityCount, planning.emptyDatasetCount);

const woodland = await fetchAncientWoodlandProfile();
console.log(woodland.recordCount, woodland.totalHectares, woodland.sizeBands[0]?.recordCount);

const intensity = await fetchCarbonIntensityWindow();
console.log(intensity.periodCount, intensity.averageIntensity, intensity.lowestPeriod.intensity);
```

## Tests

Unit tests run against the committed fixtures in `src/fixtures`, offline.

```bash
npm run test --workspace @nzlab/uk-sources
npm run test:smoke --workspace @nzlab/uk-sources   # hits the live APIs
```
