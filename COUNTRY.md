# UK Open Data Connectors

This repo was scaffolded from `nz-open-data-connectors`. The TypeScript side
is now UK-only: the NZ adapter packages are gone, and the API and CLI serve
the UK adapters in `packages/uk-sources`.

## Adapters

| Source | Adapter id | Status |
| --- | --- | --- |
| Environment Agency flood-monitoring | `flood-stations`, `flood-readings` | Done, live smoke tested |
| ONS beta API dataset catalogue | `ons-datasets` | Done, live smoke tested |
| FSA food hygiene registers | `food-hygiene-authorities` | Done |
| Transport for London cycle hire | `tfl-bike-points` | Done |
| Transport for London Tube status | `tfl-line-status` | Done, verified live 2026-10-05 |
| Planning Data platform | `planning-datasets` | Done |
| Natural England ancient woodland | `ancient-woodland` | Done |
| Bank of England Bank Rate | `bank-rate` | Done |
| Home Office police.uk recorded crime | `police-crimes` | Done |
| National Energy System Operator carbon intensity | `carbon-intensity` | Done |
| UK Parliament state of the parties | `parliament-seats` | Done |
| postcodes.io postcode lookup | `postcode-lookup` | Done, verified live 2026-10-05 |
| DfE Explore Education Statistics publications | `explore-education-statistics` | Done, verified live 2026-10-05 |
| Greater London Authority London Datastore | `london-datastore` | Done, verified live 2026-10-05 |
| The National Archives Discovery catalogue | `tna-discovery` | Done, verified live 2026-10-05 |
| UK Health Security Agency data dashboard | `ukhsa-dashboard` | Done, verified live 2026-10-05 |
| ONS Nomis SDMX dataset catalogue | `nomis` | Done, verified live 2026-10-05 |
| OHID Fingertips public health indicators | `fingertips-indicators` | Done, verified live 2026-10-05 |
| Cabinet Office Find a Tender | `find-a-tender` | Done, verified live 2026-10-05 |
| Public Health Scotland open data catalogue | `public-health-scotland` | Done, verified live 2026-10-05 |
| NHS Business Services Authority catalogue | `nhsbsa-ckan` | Done, verified live 2026-10-05 |
| data.gov.uk | - | Not usable: the CKAN path redirects to an HTML landing page |
| Companies House | - | Pending, needs a key |
| HM Land Registry | - | Pending |
| Met Office DataPoint | - | Pending, needs a key |

## Checklist

- [x] Rename the adapter interface (`NzDataAdapter` -> `UKDataAdapter`)
- [x] Rename the npm scope to `@uk-open-data-connectors`
- [x] Remove the NZ adapter packages and rewire the API and CLI
- [x] Point the root `build` script at the packages that exist
- [x] Port the API and CLI exposure for the UK adapters
- [ ] Port the Python and Ruby packages to UK sources (they still cover NZ)
- [x] Add more UK sources, each verified live before commit (eleven added on 2026-10-05)
- [x] Shared HTTP layer (`httpGet`): one User-Agent, 30 second timeout,
      `retryable` on 429, 5xx and network failures
- [ ] Return licence and attribution metadata per record, instead of leaving
      the publisher's page as the only source

See `docs/ARCHITECTURE.md` for the one-design contract and
`docs/CONNECTOR_DISCOVERY.md` for what has been checked.
