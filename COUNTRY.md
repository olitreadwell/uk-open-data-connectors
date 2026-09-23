# UK Open Data Connectors

This repo was scaffolded from `nz-open-data-connectors`. The TypeScript side
is now UK-only: the NZ adapter packages are gone, and the API and CLI serve
the UK adapters in `packages/uk-sources`.

## Adapters

| Source | Adapter id | Status |
| --- | --- | --- |
| Environment Agency flood-monitoring | `flood-stations`, `flood-readings` | Done, live smoke tested |
| ONS beta API dataset catalogue | `ons-datasets` | Done, live smoke tested |
| data.gov.uk | - | Not usable: the CKAN path redirects to an HTML landing page |
| Companies House | - | Pending, needs a key |
| HM Land Registry | - | Pending |
| TfL Unified API | - | Pending |
| Met Office DataPoint | - | Pending, needs a key |
| UK Police | - | Pending |

## Checklist

- [x] Rename the adapter interface (`NzDataAdapter` -> `UKDataAdapter`)
- [x] Rename the npm scope to `@open-data-connectors`
- [x] Remove the NZ adapter packages and rewire the API and CLI
- [x] Point the root `build` script at the packages that exist
- [x] Port the API and CLI exposure for the UK adapters
- [ ] Port the Python and Ruby packages to UK sources (they still cover NZ)
- [ ] Add more UK sources, each verified live before commit

See `docs/ARCHITECTURE.md` for the one-design contract and
`docs/CONNECTOR_DISCOVERY.md` for what has been checked.
