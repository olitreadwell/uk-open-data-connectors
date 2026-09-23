import { parseArgs } from 'node:util';

import {
  DEFAULT_FLOOD_STATION_REFERENCE,
  fetchFloodStationReadings,
  fetchFloodStations,
  fetchOnsDatasets,
  getUkDataSource,
  probeUkDataSource,
  summarizeFloodReadings,
  summarizeOnsDatasets,
  UK_DATA_SOURCES,
} from '@open-data-connectors/uk-sources';

/** Where the CLI writes its output. Injectable for tests. */
export interface CliOutput {
  writeOut(line: string): void;
  writeErr(line: string): void;
}

/** Optional overrides so tests can stub network calls. */
export interface CliDependencies {
  probeSource?: typeof probeUkDataSource;
  fetchStations?: typeof fetchFloodStations;
  fetchReadings?: typeof fetchFloodStationReadings;
  fetchDatasets?: typeof fetchOnsDatasets;
}

/** Help text shown by `ukdata help` and on unknown commands. */
export const HELP_TEXT = `ukdata - UK open data connectors

Usage:
  ukdata sources                          List every data source adapter
  ukdata probe <id>                       Live probe one source (e.g. flood-stations)
  ukdata flood-stations [--limit <n>]     List Environment Agency monitoring stations
  ukdata flood-readings [--station <ref>] [--limit <n>]
                                          Recent water levels for one station,
                                          newest first
  ukdata ons-datasets [--limit <n>]       List the ONS dataset catalogue
  ukdata help                             Show this help

Options:
  -l, --limit <n>       How many records to ask for
  -s, --station <ref>   Flood-monitoring station reference (default ${DEFAULT_FLOOD_STATION_REFERENCE})
  -h, --help            Show help

Every UK source is keyless, so no API keys are needed. Output goes to
stdout as JSON; errors go to stderr.`;

/**
 * Reads a positive integer option value.
 *
 * @param value - Raw option value, or undefined when the flag is absent.
 * @param label - Option name used in the error message.
 * @returns The parsed number, or an error string.
 */
function parseLimitOption(
  value: string | undefined,
  label: string
): { limit?: number } | { error: string } {
  if (value === undefined) {
    return {};
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: `Unknown ${label}: ${value} (use a positive whole number)` };
  }
  return { limit: parsed };
}

/** Runs one CLI invocation and returns the process exit code. */
export async function runCli(
  args: string[],
  output: CliOutput,
  deps: CliDependencies = {}
): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: 'string', short: 'l' },
        station: { type: 'string', short: 's' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    });

    if (values.help === true || positionals[0] === undefined || positionals[0] === 'help') {
      output.writeOut(HELP_TEXT);
      return 0;
    }

    const command = positionals[0];
    const parsedLimit = parseLimitOption(values.limit, 'limit');
    if ('error' in parsedLimit) {
      output.writeErr(parsedLimit.error);
      return 1;
    }
    const limitOptions = parsedLimit.limit === undefined ? {} : { limit: parsedLimit.limit };

    if (command === 'sources') {
      const sources = UK_DATA_SOURCES.map((source) => ({
        id: source.id,
        name: source.name,
        auth: source.auth,
        description: source.description,
      }));
      output.writeOut(JSON.stringify(sources, null, 2));
      return 0;
    }

    if (command === 'probe') {
      const id = positionals[1];
      if (id === undefined) {
        output.writeErr('Usage: ukdata probe <id>');
        return 1;
      }
      const adapter = getUkDataSource(id);
      if (adapter === undefined) {
        output.writeErr(`Unknown source: ${id}`);
        return 1;
      }
      const probeSource = deps.probeSource ?? probeUkDataSource;
      const probe = await probeSource(adapter);
      output.writeOut(JSON.stringify(probe, null, 2));
      return probe.ok ? 0 : 1;
    }

    if (command === 'flood-stations') {
      const fetchStations = deps.fetchStations ?? fetchFloodStations;
      const stations = await fetchStations(limitOptions);
      output.writeOut(JSON.stringify({ stations }, null, 2));
      return 0;
    }

    if (command === 'flood-readings') {
      const station = values.station ?? DEFAULT_FLOOD_STATION_REFERENCE;
      const fetchReadings = deps.fetchReadings ?? fetchFloodStationReadings;
      const readings = await fetchReadings(station, limitOptions);
      output.writeOut(
        JSON.stringify({ station, summary: summarizeFloodReadings(readings), readings }, null, 2)
      );
      return 0;
    }

    if (command === 'ons-datasets') {
      const fetchDatasets = deps.fetchDatasets ?? fetchOnsDatasets;
      const records = await fetchDatasets(limitOptions);
      output.writeOut(JSON.stringify({ summary: summarizeOnsDatasets(records), records }, null, 2));
      return 0;
    }

    output.writeErr(`Unknown command: ${command}\n\n${HELP_TEXT}`);
    return 1;
  } catch (error) {
    output.writeErr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
