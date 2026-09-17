# UK Open Data Connectors

Scaffold repo derived from `nz-open-data-connectors`. The multi-language
design (TypeScript source of truth, Python + Ruby ports) carries over; the
source adapters are being ported from NZ sources to UK sources.

## Target adapters (port in progress)

| Source | Adapter package | Status |
| --- | --- | --- |
| ONS API | `packages/*` | pending |
| data.gov.uk | `packages/*` | pending |
| Companies House | `packages/*` | pending |
| HM Land Registry | `packages/*` | pending |
| TfL Unified API | `packages/*` | pending |
| Environment Agency | `packages/*` | pending |
| Met Office DataPoint | `packages/*` | pending |
| UK Police | `packages/*` | pending |

## Port checklist

- [ ] Rename adapter interfaces (NzDataAdapter -> UKDataAdapter)
- [ ] Port source adapters above, verified live (HTTP 200) before commit
- [ ] Port the API and CLI exposure
- [ ] Port Python and Ruby packages with matching tests

See ARCHITECTURE.md in the NZ origin for the one-design contract.
