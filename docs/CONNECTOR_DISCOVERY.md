# Connector discovery

Notes on which UK sources this repo uses, and which obvious ones do not work
as they stand. Every entry below was checked against the live service before
an adapter was written.

## In use

| id | Source | Endpoint | Keyless? |
| --- | ------ | -------- | -------- |
| `flood-stations` | Environment Agency flood-monitoring | `https://environment.data.gov.uk/flood-monitoring/id/stations` | Yes |
| `flood-readings` | Environment Agency flood-monitoring | `https://environment.data.gov.uk/flood-monitoring/id/stations/{reference}/readings` | Yes |
| `ons-datasets` | ONS beta API | `https://api.beta.ons.gov.uk/v1/datasets` | Yes |

All three are published under the Open Government Licence v3.

Adapters keep a committed fixture in `packages/uk-sources/src/fixtures/` so
tests run offline, plus a smoke test gated on `RUN_SMOKE=1` that hits the
live endpoint.

## Ruled out

| Source | State | Why |
| ------ | ----- | --- |
| `api.ons.gov.uk` | RETIRED | Retired on 2024-11-25. Every path answers with a plain-text decommission notice while still returning HTTP 200, so a naive health check reads it as healthy. Use `api.beta.ons.gov.uk/v1` instead. |
| `data.gov.uk/api/3/action/...` | REDIRECT | Redirects to an HTML landing page, so the CKAN API is not at that path any more. |
