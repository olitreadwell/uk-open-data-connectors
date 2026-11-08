# Connector discovery

Notes on which UK sources this repo uses, and which obvious ones do not work
as they stand. Every endpoint below was checked against the live service
before an adapter was written. The eleven adapters added on 2026-10-05 were
probed again that day.

## In use

| id | Source | Endpoint | Keyless? |
| --- | ------ | -------- | -------- |
| `ancient-woodland` | Natural England | `https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Ancient_Woodland_England/FeatureServer/0/query` | Yes |
| `bank-rate` | Bank of England | `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp` | Yes |
| `carbon-intensity` | National Energy System Operator | `https://api.carbonintensity.org.uk/intensity/{from}/{to}` | Yes |
| `data-gov-uk-ckan` | Government Digital Service | `https://www.data.gov.uk/api/3/action/package_search?q={query}&rows={limit}` | Yes |
| `explore-education-statistics` | Department for Education | `https://api.education.gov.uk/statistics/v1/publications` | Yes |
| `find-a-tender` | Cabinet Office | `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages` | Yes |
| `fingertips-indicators` | Office for Health Improvement and Disparities | `https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id` | Yes |
| `flood-readings` | Environment Agency flood-monitoring | `https://environment.data.gov.uk/flood-monitoring/id/stations/{reference}/readings` | Yes |
| `flood-stations` | Environment Agency flood-monitoring | `https://environment.data.gov.uk/flood-monitoring/id/stations` | Yes |
| `food-hygiene-authorities` | Food Standards Agency | `https://api.ratings.food.gov.uk/Authorities/basic` | Yes |
| `gov-uk-content` | GOV.UK Content API | `https://www.gov.uk/api/content/{path}` | Yes |
| `london-datastore` | Greater London Authority | `https://data.london.gov.uk/api/3/action/package_list` | Yes |
| `nhsbsa-ckan` | NHS Business Services Authority | `https://opendata.nhsbsa.net/api/3/action/package_list` | Yes |
| `neso-generation-mix` | National Energy System Operator | `https://api.neso.energy/api/3/action/datastore_search?resource_id={resource}&sort=DATETIME+desc&limit={halfHours}` | Yes |
| `nomis` | ONS Nomis | `https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json` | Yes |
| `ons-datasets` | ONS beta API | `https://api.beta.ons.gov.uk/v1/datasets` | Yes |
| `parliament-seats` | UK Parliament | `https://members-api.parliament.uk/api/Parties/StateOfTheParties/{house}` | Yes |
| `planning-datasets` | MHCLG Planning Data | `https://www.planning.data.gov.uk/dataset.json` | Yes |
| `police-crimes` | Home Office police.uk | `https://data.police.uk/api/crimes-street/all-crime` | Yes |
| `postcode-lookup` | postcodes.io (ONS and Ordnance Survey data) | `https://api.postcodes.io/postcodes/{postcode}` | Yes |
| `public-health-scotland` | Public Health Scotland | `https://www.opendata.nhs.scot/api/3/action/package_list` | Yes |
| `tfl-bike-points` | Transport for London | `https://api.tfl.gov.uk/BikePoint` | Yes |
| `tfl-line-status` | Transport for London | `https://api.tfl.gov.uk/Line/Mode/tube/Status` | Yes |
| `tna-discovery` | The National Archives | `https://discovery.nationalarchives.gov.uk/API/search/records` | Yes |
| `ukhsa-dashboard` | UK Health Security Agency | `https://api.ukhsa-dashboard.data.gov.uk/themes/.../metrics/{metric}` | Yes |
| `uk-parliament-committees` | UK Parliament | `https://api.parliament.uk/odata/ParliamentaryCommittee` | Yes |
| `elexon-system-prices` | Elexon BMRS Insights Solution | `https://data.elexon.co.uk/bmrs/api/v1/balancing/settlement/system-prices/{settlementDate}` | Yes |
| `ukri-gtr-awards` | UKRI Gateway to Research | `https://gtr.ukri.org/api/v3/awards` | Yes |

Adapters keep a committed fixture in `packages/uk-sources/src/fixtures/` so
tests run offline, plus a smoke test gated on `RUN_SMOKE=1` that hits the
live endpoint.

## Added 2026-11-08

Three keyless adapters, for the UK Parliament OData API, Elexon's Balancing
Mechanism Reporting Service (BMRS) Insights Solution, and the UKRI Gateway to
Research (GTR) API. Every request below returned HTTP 200 with JSON and no key
on 2026-11-08.

```sh
# uk-parliament-committees: one page of committees, ordered by name
curl -sS -g -H 'Accept: application/json' \
  'https://api.parliament.uk/odata/ParliamentaryCommittee?$top=20&$orderby=FormalBodyName'

# elexon-system-prices: settlement system prices for one settlement day
curl -sS -H 'Accept: application/json' \
  'https://data.elexon.co.uk/bmrs/api/v1/balancing/settlement/system-prices/2026-11-06'

# ukri-gtr-awards: the newest awards, one page of 20
curl -sS -H 'Accept: application/json' \
  'https://gtr.ukri.org/api/v3/awards?size=20&page=1&sortfield=startDate&sortorder=D'
```

| Adapter | Fixture | Licence |
| --- | --- | --- |
| `uk-parliament-committees` | `uk-parliament-committees-2026-11-08.json` (20 committees, 10 with no end date) | Open Parliament Licence v3.0 |
| `elexon-system-prices` | `elexon-system-prices-2026-11-08.json` (the first 6 of 48 settlement periods for 2026-11-06) | BMRS open data licence |
| `ukri-gtr-awards` | `ukri-gtr-awards-2026-11-08.json` (the first 3 of 20 awards from the newest-start-date page) | UKRI Gateway to Research terms of use |

Live adapter probes run from the worktree on 2026-11-08:

```sh
npx tsx packages/cli/src/cli.ts probe uk-parliament-committees
npx tsx packages/cli/src/cli.ts probe elexon-system-prices
npx tsx packages/cli/src/cli.ts probe ukri-gtr-awards
```

Each command returned `"ok": true` and `"status": "ok"`. The Elexon probe
used the default settlement date of 2026-11-07 and returned dataset
`DISEBSP`. The GTR probe returned page 1, page size 20, 191,069 awards,
500 pages, and refresh date 2026-11-02.

What was verified live on 2026-11-08, and what was not:

- The Parliament OData page answered HTTP 200 with JSON and no key. It held 20
  committees ordered by name, from `Accomodation & Works` to `Consolidation
  etc. Bills (Joint Committee)`. Ten rows had a null `FormalBodyEndDate`; ten
  had an end date. The live adapter probe returned `ok`.
- The OData response does not carry a total count on this request. Adding
  `$count=true` returned the `$top` value instead of a count, so the adapter
  does not ask for or report a total.
- The Elexon system price call answered HTTP 200 with JSON and no key. A call
  for 2026-11-06 returned dataset `DISEBSP` and 48 settlement periods, from
  period 1 to period 48. A recheck for 2026-11-07 also returned 48 periods.
  The live adapter probe used its default of yesterday in UK time and returned
  settlement date 2026-11-07 with `ok`.
- BMRS metadata reported one dataset, `DISEBSP`, for the captured response.
  The adapter returns that dataset id and the core price, imbalance-volume,
  and accepted-volume fields for each period.
- The GTR awards page answered HTTP 200 with JSON and no key. It held 20
  awards, reported 191,069 awards in total across 500 pages, and reported a
  last data refresh date of 2026-11-02. The live adapter probe returned `ok`
  with the same totals.
- The old GTR API path `/api/content/search/project` answered HTTP 404. The
  current API is `/api/v3`, and its OpenAPI document at
  <https://gtr.ukri.org/openapi.yaml> answered HTTP 200 on 2026-11-08. The
  adapter uses `/api/v3/awards`.
- GTR accepts page sizes from 20 to 100. The adapter asks for 20, newest start
  date first. The fixture keeps the first 3 awards of that 20-award page; its
  paging metadata still says 20, because that is what the live response said.
- The Parliament and GTR APIs did not expose per-record licence fields on
  these calls. The licences above come from the publishers' pages. Elexon's
  licence page asks for the attribution `Contains BMRS data © Elexon Limited
  copyright and database right [year]` with a link to the licence where
  possible.

## Added 2026-11-07

One keyless adapter, for the GOV.UK Content API. The API answers one content
item per path. It has no listing endpoint, so the adapter takes a path and
defaults to `/government/how-government-works`. The request below returned
HTTP 200 with JSON on 2026-11-07.

```sh
# gov-uk-content: the default content item
curl -sS 'https://www.gov.uk/api/content/government/how-government-works'
```

| Adapter | Fixture | Licence |
| --- | --- | --- |
| `gov-uk-content` | `gov-uk-content-2026-11-07.json` (the "How government works" page) | Open Government Licence v3 |

What was verified live on 2026-11-07, and what was not:

- The content call answered HTTP 200 with JSON and no key.
- The response carried the content id, base path, title, document type,
  schema name, locale, phase, and published and updated stamps the adapter
  returns.
- The page carried two taxons and one available translation.
- The adapter was probed through its own live fetch after the fixture was
  captured. It returned the same title and content id.
- The API has no search or list endpoint. A caller must already know a GOV.UK
  path, or read one from the page links.

## Added 2026-11-05

One keyless adapter, for the Data.gov.uk CKAN catalogue. The candidate URL
`https://data.gov.uk/api/3/action/package_search` answers with a redirect
chain to `https://ckan.publishing.service.gov.uk/`, which serves the JSON API.
The request below returned HTTP 200 with JSON on 2026-11-05.

```sh
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

# data-gov-uk-ckan: a catalogue search for flood datasets
curl -sSL -H "User-Agent: $UA" \
  'https://www.data.gov.uk/api/3/action/package_search?q=flood&rows=2'
```

| Adapter | Fixture | Licence |
| --- | --- | --- |
| `data-gov-uk-ckan` | `data-gov-uk-ckan-2026-11-05.json` (the first 2 of 3,875 matches for "flood") | Varies by dataset. The first package reports `uk-ogl`; the second has no `license_id`, which the adapter returns as `null`. |

What was verified live on 2026-11-05, and what was not:

- The `package_search` call answered HTTP 200 with JSON and no key.
- A search with no query reported 59,912 packages in the catalogue.
- The search for "flood" reported 3,875 matches.
- Package metadata carried the title, organisation, licence id, resource
  count, modification stamp, and tags the adapter returns.
- The adapter was probed through its own live fetch after the fixture was
  captured. It returned the same two package names.
- The redirect chain was not treated as a stable contract. The adapter keeps
  the documented Data.gov.uk path and lets `fetch` follow redirects.

## Added 2026-10-18

One keyless adapter, for the National Energy System Operator's open data
portal. The portal moved house: candidates list
`https://data.nationalgrideso.com/`, a domain that no longer resolves now the
GB system operator trades as NESO. The same CKAN API answers at
`https://api.neso.energy/`, which is what the adapter reads. The request below
returned HTTP 200 with JSON on 2026-10-18.

```sh
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

# neso-generation-mix: the newest week of the Historic GB Generation Mix
# resource, newest half hour first
curl -sSL -H "User-Agent: $UA" \
  'https://api.neso.energy/api/3/action/datastore_search?resource_id=f93d1835-75bc-43e5-84ad-12472b180a98&sort=DATETIME%20desc&limit=336'
```

| Adapter | Fixture | Licence |
| --- | --- | --- |
| `neso-generation-mix` | `neso-generation-mix-2026-10-18.json` (336 half hours, 10 October 16:30 to 17 October 16:00) | The NESO Open Data Licence. The portal's package metadata reports `license_id: ESO` and points at <https://www.neso.energy/data-portal/ngeso-open-licence>. |

What was verified live on 2026-10-18, and what was not:

- The datastore search answered HTTP 200 with JSON and no key, and the
  resource held 311,937 half hours back to 2009.
- The newest week held no missing half hours, which is the window the adapter
  reads by default.
- `https://data.nationalgrideso.com/` did not resolve at all. Nothing here
  was checked against the retired domain.
- The portal also serves a CSV of each resource. The adapter reads the
  datastore instead, so one request can sort and window the series.

## Added 2026-10-05

Eleven keyless adapters, one per source. Every request below returned HTTP
200 with JSON on 2026-10-05, sent with a browser User-Agent. Run them from a
shell to reproduce the committed fixture.

```sh
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

# postcode-lookup: one postcode, keyless
curl -sSL -H "User-Agent: $UA" 'https://api.postcodes.io/postcodes/SW1A1AA'

# explore-education-statistics: most recent DfE releases
curl -sSL -H "User-Agent: $UA" 'https://api.education.gov.uk/statistics/v1/publications?page=1&pageSize=20'

# london-datastore: GLA catalogue. Answers a 307 to /api/action/package_list,
# which fetch follows on its own
curl -sSL -H "User-Agent: $UA" 'https://data.london.gov.uk/api/3/action/package_list'

# tna-discovery: The National Archives catalogue search
curl -sSL -H "User-Agent: $UA" -H 'Accept: application/json' \
  'https://discovery.nationalarchives.gov.uk/API/search/records?sps.searchQuery=test'

# ukhsa-dashboard: new HIV diagnoses in England, a real annual series
curl -sSL -H "User-Agent: $UA" 'https://api.ukhsa-dashboard.data.gov.uk/themes/infectious_disease/sub_themes/bloodborne/topics/HIV/geography_types/Nation/geographies/England/metrics/HIV_cases_newDiagnoses?page_size=10'

# nomis: SDMX dataset definitions
curl -sSL -H "User-Agent: $UA" 'https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json'

# fingertips-indicators: OHID indicator metadata
curl -sSL -H "User-Agent: $UA" 'https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id?indicator_ids=90366'

# find-a-tender: OCDS 1.1 release packages
curl -sSL -H "User-Agent: $UA" 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=10'

# tfl-line-status: live Tube status
curl -sSL -H "User-Agent: $UA" 'https://api.tfl.gov.uk/Line/Mode/tube/Status'

# public-health-scotland: CKAN catalogue
curl -sSL -H "User-Agent: $UA" 'https://www.opendata.nhs.scot/api/3/action/package_list'

# nhsbsa-ckan: CKAN catalogue
curl -sSL -H "User-Agent: $UA" 'https://opendata.nhsbsa.net/api/3/action/package_list'
```

| Adapter | Fixture | Licence |
| --- | --- | --- |
| `postcode-lookup` | `postcode-lookup-2026-10-05.json` | Open Government Licence v3 for the ONS and Ordnance Survey postcode data. postcodes.io is a third-party service, not a government API. |
| `explore-education-statistics` | `explore-education-statistics-2026-10-05.json` | Open Government Licence v3 (Department for Education). |
| `london-datastore` | `london-datastore-2026-10-05.json` | Open Government Licence v3 as the Greater London Authority's default. Individual datasets can carry their own terms. |
| `tna-discovery` | `tna-discovery-2026-10-05.json` | Open Government Licence v3 (The National Archives). |
| `ukhsa-dashboard` | `ukhsa-dashboard-2026-10-05.json` | Open Government Licence v3 (UK Health Security Agency). |
| `nomis` | `nomis-2026-10-05.json` | Open Government Licence v3 (ONS Nomis). |
| `fingertips-indicators` | `fingertips-indicators-2026-10-05.json` | Open Government Licence v3 (Office for Health Improvement and Disparities). |
| `find-a-tender` | `find-a-tender-2026-10-05.json` | Open Government Licence v3. The payload itself carries the OGL v3 URL in its `license` field. |
| `tfl-line-status` | `tfl-line-status-2026-10-05.json` | TfL Open Data. |
| `public-health-scotland` | `public-health-scotland-2026-10-05.json` | Open Government Licence v3. Package metadata on the portal reports `uk-ogl`. |
| `nhsbsa-ckan` | `nhsbsa-ckan-2026-10-05.json` | Open Government Licence v3. Package metadata on the portal reports `OGL-UK-3.0`. |

What was verified live on 2026-10-05, and what was not:

- Every endpoint above answered HTTP 200 with JSON and no key.
- The London Datastore call answers a 307 redirect. Node's `fetch` follows
  it, so the adapter keeps the documented path.
- Discovery answered JSON with the `Accept: application/json` header, and on
  that day it also answered JSON without the header. The adapter sends the
  header anyway, because the API documents it.
- The Nomis catalogue returns 1,617 dataset definitions in about 5.4 MB of
  JSON. The committed fixture keeps the first 25 definitions (about 100 KB)
  so the repository stays usable. The adapter reads the whole live catalogue,
  and its schema accepts the null annotation values the full catalogue carries
  and the trimmed fixture does not.
- The Public Health Scotland portal is occasionally flaky. During the
  2026-10-05 checks it answered 200 on some calls and 504, or reset the
  connection, on others with no change to the request. A later call returned
  all 105 packages. The adapter has no retry; expect the nightly smoke run to
  see this source fail now and then.
- Licences come from the publishers' standard terms. Only Find a Tender's
  `license` field, the NHSBSA `OGL-UK-3.0` package metadata, and the Public
  Health Scotland `uk-ogl` package metadata were read directly from the
  service on 2026-10-05. The NESO `ESO` package metadata was read on
  2026-10-18. The other licences were not read from the API on those dates.

## Ruled out

| Source | State | Why |
| ------ | ----- | --- |
| `api.ons.gov.uk` | RETIRED | Retired on 2024-11-25. Every path answers with a plain-text decommission notice while still returning HTTP 200, so a naive health check reads it as healthy. Use `api.beta.ons.gov.uk/v1` instead. |

## Licences and attribution

The MIT licence in this repo covers the code, not the data. Most of the
publishers here release under the Open Government Licence v3, which asks for
attribution. The exceptions are listed in the table.

| Adapter | Publisher | Licence |
| --- | --- | --- |
| `flood-stations`, `flood-readings` | Environment Agency | Open Government Licence v3, returned as `licence` with `publisher` on every record |
| `ons-datasets` | Office for National Statistics | Open Government Licence v3 |
| `food-hygiene-authorities` | Food Standards Agency | Open Government Licence v3 |
| `tfl-bike-points`, `tfl-line-status` | Transport for London | TfL Open Data, the operator's own terms |
| `planning-datasets` | Planning Data, MHCLG | Open Government Licence v3, returned as `licence` with the source `attribution` on every dataset |
| `ancient-woodland` | Natural England | Open Government Licence v3 |
| `bank-rate` | Bank of England | Check the Bank's statistics terms; the Bank publishes most series under the Open Government Licence v3 |
| `police-crimes` | Home Office police.uk | Open Government Licence v3 |
| `carbon-intensity` | National Energy System Operator | Creative Commons Attribution 4.0, under the operator's own terms |
| `parliament-seats` | UK Parliament | Open Parliament Licence v3 |
| `postcode-lookup` | postcodes.io, a third party | Serves Open Government Licence postcode data from the ONS and Ordnance Survey |
| `explore-education-statistics` | Department for Education | Open Government Licence v3 |
| `london-datastore` | Greater London Authority | Open Government Licence v3 |
| `tna-discovery` | The National Archives | Open Government Licence v3 |
| `ukhsa-dashboard` | UK Health Security Agency | Open Government Licence v3 |
| `nomis` | Office for National Statistics | Open Government Licence v3 |
| `fingertips-indicators` | Office for Health Improvement and Disparities | Open Government Licence v3 |
| `find-a-tender` | Cabinet Office | Open Government Licence v3, returned as `licence` with `publisher` on every release |
| `public-health-scotland` | Public Health Scotland | Open Government Licence v3 |
| `nhsbsa-ckan` | NHS Business Services Authority | Open Government Licence v3 |
| `neso-generation-mix` | National Energy System Operator | The NESO Open Data Licence, the portal reports `ESO` for every package on it |
| `data-gov-uk-ckan` | Government Digital Service | Varies by dataset. The adapter returns each package's `licenceId`, `licenceTitle`, `licenceUrl` and `publisher`, and blank licence values become `null`. |
| `gov-uk-content` | Government Digital Service | Open Government Licence v3 |
| `uk-parliament-committees` | UK Parliament | Open Parliament Licence v3.0 |
| `elexon-system-prices` | Elexon | BMRS open data licence, with the attribution `Contains BMRS data © Elexon Limited copyright and database right [year]` |
| `ukri-gtr-awards` | UK Research and Innovation | UKRI Gateway to Research terms of use; the terms page says the service is open and free to use |

Five adapters return source-supplied licence and attribution metadata per
record. `flood-stations` and `flood-readings` copy `meta.publisher` and
`meta.licence` onto each record. `find-a-tender` copies the package publisher
and `license` onto each release. `planning-datasets` returns the source
`attribution` and `licence`. `data-gov-uk-ckan` returns `publisher`,
`licenceId`, `licenceTitle` and `licenceUrl` for each dataset.

The other adapters do not return licence metadata, because their endpoints do
not carry it per record. Check the publisher's page before you reuse their
data. When you republish, credit the publisher, not this library.
