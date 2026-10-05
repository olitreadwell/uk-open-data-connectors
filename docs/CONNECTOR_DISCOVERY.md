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
| `explore-education-statistics` | Department for Education | `https://api.education.gov.uk/statistics/v1/publications` | Yes |
| `find-a-tender` | Cabinet Office | `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages` | Yes |
| `fingertips-indicators` | Office for Health Improvement and Disparities | `https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id` | Yes |
| `flood-readings` | Environment Agency flood-monitoring | `https://environment.data.gov.uk/flood-monitoring/id/stations/{reference}/readings` | Yes |
| `flood-stations` | Environment Agency flood-monitoring | `https://environment.data.gov.uk/flood-monitoring/id/stations` | Yes |
| `food-hygiene-authorities` | Food Standards Agency | `https://api.ratings.food.gov.uk/Authorities/basic` | Yes |
| `london-datastore` | Greater London Authority | `https://data.london.gov.uk/api/3/action/package_list` | Yes |
| `nhsbsa-ckan` | NHS Business Services Authority | `https://opendata.nhsbsa.net/api/3/action/package_list` | Yes |
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

Adapters keep a committed fixture in `packages/uk-sources/src/fixtures/` so
tests run offline, plus a smoke test gated on `RUN_SMOKE=1` that hits the
live endpoint.

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
  service. The other licences were not read from the API that day.

## Ruled out

| Source | State | Why |
| ------ | ----- | --- |
| `api.ons.gov.uk` | RETIRED | Retired on 2024-11-25. Every path answers with a plain-text decommission notice while still returning HTTP 200, so a naive health check reads it as healthy. Use `api.beta.ons.gov.uk/v1` instead. |
| `data.gov.uk/api/3/action/...` | REDIRECT | Redirects to an HTML landing page, so the CKAN API is not at that path any more. |
