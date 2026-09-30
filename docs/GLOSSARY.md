# Glossary

Plain-language definitions. Terms used in this repo, in alphabetical order.

## A

- **Adapter** - one piece of code that talks to one data source and
  returns plain objects. For example, `floodStationsAdapter`.

- **API** - a way for one program to ask another program for data.

- **Audit** - a tool that checks dependencies for known problems.

## C

- **Catchment** - the area of land that drains into one river or river
  system. The flood-monitoring API reports it for each station.

- **CORS (Cross-Origin Resource Sharing)** - a browser rule that decides
  whether a page from one site may call an API on another site.

- **Coverage** - the share of code exercised by tests. 60% threshold means
  at least 60% of lines run during tests.

## D

- **Dataset** - one published collection of data. The ONS catalogue lists
  them with an id, a title, and a last-updated stamp.

## E

- **E2E (end-to-end)** - a test that runs the real app over a real
  connection, like booting the HTTP server and calling it.

- **Endpoint** - one address that an API answers. For example, `/health`.

- **Environment Agency** - the UK public body that runs the
  flood-monitoring API used by the flood adapters.

## F

- **Fixture** - a real snapshot of a live API response, stored in the repo
  and used by offline tests.

- **Flood-monitoring station** - a measuring point on a river, coast, or
  groundwater borehole. Reference `1029TH` is Bourton Dickler on the River
  Dikler.

## I

- **Integration test** - a test that checks how pieces work together, such
  as routes wired to a client.

## J

- **JSON** - JavaScript Object Notation. A text format for data.

## K

- **Key** - a secret string that unlocks more of an API. No UK source in
  this repo needs one.

## L

- **Lint** - a tool that reads code and flags style and safety problems.

## M

- **Measure** - one thing a station reports, such as water level in metres
  every 15 minutes.

## N

- **National statistic** - an ONS dataset that meets the Code of Practice
  for Statistics. The catalogue flags these separately.

## O

- **Observation** - one row of data, for example one reading at one time.

- **OGL (Open Government Licence v3)** - the licence the UK government uses
  for published data. It allows reuse with attribution.

- **ONS (Office for National Statistics)** - the UK's national statistics
  institute, and the source behind the ONS adapters.

- **OpenAPI** - a machine-readable description of an API's endpoints.

## P

- **Probe** - a live test that checks whether a source answers and parses.

- **Port** - a copy of the same design in another language (Python, Ruby).
  In this repo the ports still cover the NZ connectors.

## R

- **Rate limit** - the maximum number of requests an API allows in a time
  window.

- **Reading** - one water level value at one timestamp, for one measure.

## S

- **Smoke test** - a quick live test against the real service, opt-in via
  `RUN_SMOKE=1`.

- **Summary** - the counts and ranges an adapter computes next to the raw
  records, so callers do not repeat the work.

## T

- **Type-check** - a tool that proves code uses values of the right type.

## U

- **UK adapter** - one adapter behind the shared `UkDataAdapter` interface.

- **Unit test** - a test of one small piece of logic in isolation.

## Z

- **Zod** - a library that checks data against a schema and rejects bad
  input.
