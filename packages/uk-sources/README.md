# @uk-open-data-connectors/uk-sources

Uniform TypeScript adapters for 22 UK public data sources, for JavaScript and TypeScript developers.

## What this package does

- Ships one adapter for each of 22 UK public data sources.
- Gives every adapter the same shape: a live fetch, a strict parse, and a committed fixture fallback.
- Lets you build and test offline, because each adapter falls back to a fixture when the live call fails.
- Exposes a registry (`UK_DATA_SOURCES`) and probe helpers (`probeUkDataSource`, `probeAllUkDataSources`).
- Needs no API keys. One adapter takes an optional app key.

## Install

```sh
npm install @uk-open-data-connectors/uk-sources
```

## Quick start

```ts
import { fetchFloodStationReadings, summarizeFloodReadings } from '@uk-open-data-connectors/uk-sources';

const readings = await fetchFloodStationReadings('1029TH', { limit: 96 });
const summary = summarizeFloodReadings(readings);
console.log(summary.latest?.value, summary.trend);
```

## Adapters

| id | Source | Auth | What it does |
| --- | ------ | ---- | ------------ |
| `flood-stations` | Environment Agency | none | Monitoring stations with their river, catchment, and measures. |
| `flood-readings` | Environment Agency | none | Recent water levels for one station, newest first. |
| `ons-datasets` | Office for National Statistics (ONS) | none | The dataset catalogue, with state and last-updated stamp. |
| `food-hygiene-authorities` | Food Standards Agency (FSA) | none | Every local authority food hygiene register, with its establishment count. |
| `tfl-bike-points` | Transport for London (TfL) | optional app key | Every Santander Cycles docking station, with docking points and docked bikes. |
| `planning-datasets` | Planning Data platform (MHCLG) | none | Every dataset, with the records published behind it. |
| `ancient-woodland` | Natural England | none | Ancient woodland polygons for England, counted by type and size. |
| `bank-rate` | Bank of England | none | The daily official Bank Rate, one reading per business day since 1975. |
| `police-crimes` | Home Office police.uk | none | Street-level crime within a mile of a point, counted by type and outcome. |
| `carbon-intensity` | National Energy System Operator (NESO) | none | Half-hourly carbon intensity for Great Britain, with the cleanest and dirtiest half hours. |
| `parliament-seats` | UK Parliament | none | Seats each party holds in the Commons, with the members counted behind them. |
| `postcode-lookup` | postcodes.io (ONS and Ordnance Survey data) | none | One postcode's country, region, wards, and coordinates. |
| `explore-education-statistics` | Department for Education (DfE) | none | The most recent statistics releases, with their publish stamps. |
| `london-datastore` | Greater London Authority (GLA) | none | Every dataset on the London Datastore. |
| `tna-discovery` | The National Archives | none | Catalogue records matching a search, with the total hit count. |
| `ukhsa-dashboard` | UK Health Security Agency (UKHSA) | none | Annual counts of new HIV diagnoses in England. |
| `nomis` | ONS Nomis | none | SDMX dataset definitions, with maintenance status and keywords. |
| `fingertips-indicators` | Office for Health Improvement and Disparities (OHID) | none | Public health indicator metadata, with unit, type, and data source. |
| `find-a-tender` | Cabinet Office | none | Recent procurement notices as OCDS 1.1 releases. |
| `tfl-line-status` | Transport for London (TfL) | optional app key | Live status of every Tube line, with disruption reasons. |
| `public-health-scotland` | Public Health Scotland | none | Every dataset on the Public Health Scotland CKAN portal. |
| `nhsbsa-ckan` | NHS Business Services Authority (NHSBSA) | none | Every dataset on the NHSBSA CKAN portal. |

## Notes and limits

- All 22 adapters are keyless. `fetchTflBikePoints` and `fetchTflLineStatuses` take an optional `apiKey`, sent as the `app_key` query parameter.
- Each adapter falls back to a committed fixture when the live call fails. A returned value can be stale. Call `probeUkDataSource` before you quote a number.
- The fixtures in `src/fixtures` are real snapshots from the live APIs. The newer files carry their capture date in the filename.
- Tests never reach the network unless `RUN_SMOKE=1` is set. The smoke test hits the real endpoints and needs no keys.
- `api.ons.gov.uk` was retired on 2024-11-25. Every path answers HTTP 200 with a plain-text decommission notice, so a naive health check reads it as healthy. The `ons-datasets` adapter uses `api.beta.ons.gov.uk/v1` instead.
- `data.gov.uk/api/3/action/...` redirects to an HTML landing page. The CKAN API is no longer at that path.
- The FSA endpoint answers only with the `x-api-version: 2` header. Without it the endpoint returns HTTP 404. The adapter sends the header.
- The Planning Data file lists datasets and pipeline tables. The adapter keeps the entries whose `realm` is `dataset`.
- The ancient woodland layer holds more than 50,000 polygons, past the ArcGIS page size. The adapter reads the service statistics queries instead of the features.
- The Bank Rate daily series is `IUDBEDR` and starts on 2 January 1975. An earlier start returns the database error page instead of a CSV.
- police.uk holds the last 36 months of street-level crime from the 44 forces of England, Wales, and Northern Ireland. Police Scotland publishes elsewhere, so nothing here covers Scotland.
- A police.uk street-level call covers everything within a mile of a point. The adapter cannot ask for a smaller radius. It asks one month at a time, inside the API limit of 15 requests per second.
- The carbon intensity API refuses a range longer than 31 days. The adapter reads whole days and asks for a window that ends at the start of today.
- The Parliament call takes a house (1 for the Commons, 2 for the Lords) and a date. The response does not echo the date or the house back.
- A vacant seat appears as its own party, named `Vacant`, with one seat and no members behind it. The summary keeps it in `seats` and reports the gap per row as `unallocatedSeatCount`.
- `backgroundColour` and `foregroundColour` are null for some parties, including the Speaker. A chart needs its own fallback colour.
- The Parliament call can be slow. A request in this repo timed out after 25 seconds, and the next one answered in two.
- The Nomis catalogue returns 1,617 dataset definitions in about 5.4 MB of JSON. The committed fixture keeps the first 25 definitions. The adapter reads the whole live catalogue.
- The Public Health Scotland portal is occasionally flaky. Calls can answer 200, answer 504, or reset the connection. The adapter has no retry, so a smoke run can fail on this source now and then.
- The London Datastore call answers a 307 redirect. Node's `fetch` follows it, so the adapter keeps the documented path.
- The Discovery adapter sends `Accept: application/json`, because the API documents the header.
- `postcode-lookup` reads from postcodes.io, a third-party service. It is not a government API, though it serves ONS and Ordnance Survey postcode data under the Open Government Licence v3.
- Only the Find a Tender `license` field, the NHSBSA `OGL-UK-3.0` metadata, and the Public Health Scotland `uk-ogl` metadata were read directly from the service. The other licences come from the publishers' standard terms.
- The eleven adapters added on 2026-10-05 were probed live on that day.

## Data sources and licences

This package reads 22 sources from UK public bodies and one third-party service. Most data carries the Open Government Licence v3. The two TfL adapters carry TfL Open Data. The carbon intensity series carries Creative Commons Attribution 4.0. The Parliament seat counts carry the Open Parliament Licence v3.0.

| Adapter | Publisher | Source URL | Data licence |
| ------- | --------- | ---------- | ------------ |
| `flood-stations` | Environment Agency | <https://environment.data.gov.uk/flood-monitoring/id/stations> | Open Government Licence v3 |
| `flood-readings` | Environment Agency | <https://environment.data.gov.uk/flood-monitoring/id/stations/{reference}/readings> | Open Government Licence v3 |
| `ons-datasets` | Office for National Statistics | <https://api.beta.ons.gov.uk/v1/datasets> | Open Government Licence v3 |
| `food-hygiene-authorities` | Food Standards Agency | <https://api.ratings.food.gov.uk/Authorities/basic> | Open Government Licence v3 |
| `tfl-bike-points` | Transport for London | <https://api.tfl.gov.uk/BikePoint> | TfL Open Data |
| `planning-datasets` | MHCLG Planning Data platform | <https://www.planning.data.gov.uk/dataset.json> | Open Government Licence v3 |
| `ancient-woodland` | Natural England | <https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Ancient_Woodland_England/FeatureServer/0/query> | Open Government Licence v3 |
| `bank-rate` | Bank of England | <https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp> | Open Government Licence v3 under the Bank's terms |
| `police-crimes` | Home Office police.uk | <https://data.police.uk/api/crimes-street/all-crime> | Open Government Licence v3 |
| `carbon-intensity` | National Energy System Operator | <https://api.carbonintensity.org.uk/intensity> | Creative Commons Attribution 4.0 |
| `parliament-seats` | UK Parliament | <https://members-api.parliament.uk/api/Parties/StateOfTheParties> | Open Parliament Licence v3.0 |
| `postcode-lookup` | postcodes.io (ONS and Ordnance Survey data) | <https://api.postcodes.io/postcodes/SW1A1AA> | Open Government Licence v3 |
| `explore-education-statistics` | Department for Education | <https://api.education.gov.uk/statistics/v1/publications> | Open Government Licence v3 |
| `london-datastore` | Greater London Authority | <https://data.london.gov.uk/api/3/action/package_list> | Open Government Licence v3 by default, individual datasets can differ |
| `tna-discovery` | The National Archives | <https://discovery.nationalarchives.gov.uk/API/search/records> | Open Government Licence v3 |
| `ukhsa-dashboard` | UK Health Security Agency | <https://api.ukhsa-dashboard.data.gov.uk/themes/infectious_disease/sub_themes/bloodborne/topics/HIV/geography_types/Nation/geographies/England/metrics/HIV_cases_newDiagnoses> | Open Government Licence v3 |
| `nomis` | ONS Nomis | <https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json> | Open Government Licence v3 |
| `fingertips-indicators` | Office for Health Improvement and Disparities | <https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id> | Open Government Licence v3 |
| `find-a-tender` | Cabinet Office | <https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages> | Open Government Licence v3 |
| `tfl-line-status` | Transport for London | <https://api.tfl.gov.uk/Line/Mode/tube/Status> | TfL Open Data |
| `public-health-scotland` | Public Health Scotland | <https://www.opendata.nhs.scot/api/3/action/package_list> | Open Government Licence v3, the portal reports `uk-ogl` |
| `nhsbsa-ckan` | NHS Business Services Authority | <https://opendata.nhsbsa.net/api/3/action/package_list> | Open Government Licence v3, the portal reports `OGL-UK-3.0` |

## Package licence

MIT. See LICENSE.

## Links

- npm: <https://www.npmjs.com/package/@uk-open-data-connectors/uk-sources>
- source: <https://github.com/olitreadwell/uk-open-data-connectors/tree/main/packages/uk-sources>
- docs: [Connector discovery](../../docs/CONNECTOR_DISCOVERY.md)
