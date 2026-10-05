# @uk-open-data-connectors/uk-sources

Uniform TypeScript adapters for UK public data sources. Every adapter has the
same shape: a live fetch, a strict parse, and a committed fixture fallback so
builds work offline.

## Adapters

| id                         | Source                              | Auth | What it does                                                 |
| -------------------------- | ----------------------------------- | ---- | ------------------------------------------------------------ |
| `flood-stations`           | Environment Agency flood-monitoring | none | Monitoring stations with river and catchment                 |
| `flood-readings`           | Environment Agency flood-monitoring | none | Recent water levels for one station, newest first            |
| `ons-datasets`             | ONS beta API dataset catalogue      | none | Every dataset the ONS lists, with its state and stamp        |
| `food-hygiene-authorities` | Food Standards Agency food hygiene  | none | Every local authority register, with its establishment count |
| `tfl-bike-points`          | Transport for London cycle hire     | none | Every Santander Cycles docking station, with docking points and docked bikes |
| `planning-datasets`        | Planning Data platform (MHCLG)      | none | Every planning dataset, with the records published behind it |
| `ancient-woodland`         | Natural England ancient woodland    | none | Ancient woodland polygons for England, counted by type and size |
| `bank-rate`                | Bank of England Bank Rate           | none | The daily official Bank Rate, one reading per business day since 1975 |
| `police-crimes`            | Home Office police.uk               | none | Street-level crime within a mile of a point, counted by crime type and outcome |
| `carbon-intensity`         | National Energy System Operator     | none | Half-hourly carbon intensity for Great Britain, with the window's cleanest and dirtiest half hours |
| `parliament-seats`         | UK Parliament Members API           | none | Seats each party holds in the Commons, with the members counted behind them |
| `postcode-lookup`          | postcodes.io (ONS and OS data)      | none | One postcode's country, region, wards, and coordinates |
| `explore-education-statistics` | Department for Education       | none | The most recent statistics releases, with their publish stamps |
| `london-datastore`         | Greater London Authority            | none | Every dataset on the London Datastore |
| `tna-discovery`            | The National Archives               | none | Catalogue records matching a search, with the total hit count |
| `ukhsa-dashboard`          | UK Health Security Agency           | none | Metric points for new HIV diagnoses in England |
| `nomis`                    | ONS Nomis                           | none | SDMX dataset definitions, with maintenance status and keywords |
| `fingertips-indicators`    | Office for Health Improvement and Disparities | none | Public health indicator metadata, with unit, type, and data source |
| `find-a-tender`            | Cabinet Office                      | none | Recent procurement notices as OCDS 1.1 releases |
| `tfl-line-status`          | Transport for London                | none | Live status of every Tube line, with disruption reasons |
| `public-health-scotland`   | Public Health Scotland              | none | Every dataset on the Public Health Scotland CKAN portal |
| `nhsbsa-ckan`              | NHS Business Services Authority     | none | Every dataset on the NHSBSA CKAN portal |

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

The Parliament seat adapter uses the UK Parliament Members API,
<https://members-api.parliament.uk/api/Parties/StateOfTheParties>, which
answers without a key. It is the current state of the parties in each house,
with the seats a party holds and the members counted behind them, published
under the Open Parliament Licence v3.0:
<https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/>.
The call needs a house and a date, so the adapter asks for the caller's own
date rather than a fixed one.

Eleven more keyless adapters landed on 2026-10-05: `postcode-lookup` reads
one postcode from postcodes.io, `explore-education-statistics` reads the
Department for Education's most recent releases, `london-datastore` and
`public-health-scotland` and `nhsbsa-ckan` read CKAN catalogues, `tna-discovery`
searches The National Archives catalogue, `ukhsa-dashboard` reads UKHSA metric
points, `nomis` reads the ONS Nomis SDMX catalogue, `fingertips-indicators`
reads OHID indicator metadata, `find-a-tender` reads OCDS procurement notices,
and `tfl-line-status` reads live Tube status. Endpoints, exact curl commands,
capture date, and licences are in `docs/CONNECTOR_DISCOVERY.md`.

Note on sources that look obvious but are not usable: `api.ons.gov.uk` was
retired on 2024-11-25 and now answers every request with a decommission notice.
The beta API at `api.beta.ons.gov.uk/v1` replaced it for dataset metadata,
editions, versions, and observations.

## Usage

```ts
import { fetchFloodStationReadings, summarizeFloodReadings } from '@uk-open-data-connectors/uk-sources';
import { fetchOnsDatasets, summarizeOnsDatasets } from '@uk-open-data-connectors/uk-sources';
import { fetchFoodHygieneAuthorities, summarizeFoodHygieneAuthorities } from '@uk-open-data-connectors/uk-sources';
import { fetchTflBikePoints, summarizeTflBikePoints } from '@uk-open-data-connectors/uk-sources';
import { fetchPlanningDatasets, summarizePlanningDatasets } from '@uk-open-data-connectors/uk-sources';
import { fetchAncientWoodlandProfile } from '@uk-open-data-connectors/uk-sources';
import { fetchBankRateObservations, summarizeBankRateSeries } from '@uk-open-data-connectors/uk-sources';
import { fetchPoliceCrimeSummary } from '@uk-open-data-connectors/uk-sources';
import { fetchCarbonIntensityWindow } from '@uk-open-data-connectors/uk-sources';
import { fetchParliamentSeats } from '@uk-open-data-connectors/uk-sources';

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

const seats = await fetchParliamentSeats();
console.log(seats.seatCount, seats.partyCount, seats.largestParty.party.name);
```

## UK Parliament seats

`fetchParliamentSeats` reads the state of the parties in the House of Commons
and returns the seat counts a page can print.

```ts
import { fetchParliamentSeats } from '@uk-open-data-connectors/uk-sources';

const seats = await fetchParliamentSeats();
// { seatCount: 650, partyCount: 18, majorityThreshold: 326, ... }
console.log(seats.largestParty.party.name, seats.largestParty.seatCount);
```

The payload is validated with this schema before anything is counted:

```ts
const PARLIAMENT_PARTY_SCHEMA = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  abbreviation: z.string().nullable(),
  backgroundColour: z.string().nullable(),
  foregroundColour: z.string().nullable(),
  isIndependentParty: z.boolean(),
});

const PARLIAMENT_SEAT_COUNT_SCHEMA = z.object({
  male: z.number().int().nonnegative().nullable(),
  female: z.number().int().nonnegative().nullable(),
  nonBinary: z.number().int().nonnegative().nullable(),
  total: z.number().int(),
  party: PARLIAMENT_PARTY_SCHEMA.nullable(),
});

const PARLIAMENT_RESPONSE_SCHEMA = z.object({
  items: z.array(z.object({ value: PARLIAMENT_SEAT_COUNT_SCHEMA.nullable() })).nullable(),
});
```

The public surface also carries `buildParliamentSeatsUrl(house, forDate)` for
a specific house and date, `formatParliamentQueryDate(date)` for the
`YYYY-MM-DD` the path takes, and `parseParliamentSeats(payload)` /
`summarizeParliamentPartySeats(seats)` for parsing a payload or a list of
parties on its own. `PARLIAMENT_COMMONS_HOUSE` is 1 and
`PARLIAMENT_LORDS_HOUSE` is 2.

Quirks worth knowing before you build on this:

- A vacant seat appears as its own party, named `Vacant`, with one seat and
  no members behind it. The summary keeps it in `seats` and reports the gap
  per row as `unallocatedSeatCount`, so `male + female + nonBinary` can sit
  below `seatCount`.
- `backgroundColour` and `foregroundColour` are null for a few parties,
  including the Speaker, so a chart needs its own fallback colour rather than
  reading the field straight.
- The house is a path segment, not a query parameter: 1 is the Commons and 2
  is the Lords, and the same call returns peers for house 2.
- The call can be slow. One request here timed out at 25 seconds and the next
  answered in two, so give it a generous timeout and keep a committed fixture
  fallback.
- The date is part of the call, so a page that wants "today" has to send its
  own date; the response does not echo the date or the house back.

## Tests

Unit tests run against the committed fixtures in `src/fixtures`, offline.

```bash
npm run test --workspace @uk-open-data-connectors/uk-sources
npm run test:smoke --workspace @uk-open-data-connectors/uk-sources   # hits the live APIs
```
