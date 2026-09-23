import { describe, expect, it } from 'vitest';

import {
  fetchFloodStationReadings,
  fetchFloodStations,
  fetchOnsDatasets,
  probeUkDataSource,
} from '@open-data-connectors/uk-sources';
import type {
  FloodReading,
  FloodStation,
  OnsDatasetRecord,
  UkDataAdapter,
} from '@open-data-connectors/uk-sources';

import { runCli } from './commands.js';
import type { CliOutput } from './commands.js';

function createCapture(): { out: string[]; err: string[]; output: CliOutput } {
  const out: string[] = [];
  const err: string[] = [];
  const output: CliOutput = {
    writeOut: (line) => out.push(line),
    writeErr: (line) => err.push(line),
  };
  return { out, err, output };
}

/** One station and two readings, matching the live Environment Agency shape. */
const STATION: FloodStation = {
  id: 'http://environment.data.gov.uk/flood-monitoring/id/stations/1029TH',
  notation: '1029TH',
  label: 'Bourton Dickler',
  riverName: 'River Dikler',
  catchmentName: 'Cotswolds',
  latitude: 51.873,
  longitude: -1.771,
  measures: [],
};

const READING_AT_0900: FloodReading = {
  measureId:
    'http://environment.data.gov.uk/flood-monitoring/id/measures/1029TH-level-stage-i-15_min-m',
  dateTime: '2026-09-23T09:00:00Z',
  value: 0.19,
};

const READING_AT_0915: FloodReading = {
  measureId: READING_AT_0900.measureId,
  dateTime: '2026-09-23T09:15:00Z',
  value: 0.24,
};

const DATASET: OnsDatasetRecord = {
  id: 'babies-born-in-england-and-wales',
  title: 'Babies born in England and Wales',
  state: 'published',
  lastUpdatedIso: '2024-07-10T08:53:21.000Z',
  isNationalStatistic: true,
  keywords: ['births'],
  topicPath: 'topics/peoplepopulationandcommunity/birthsdeathsandmarriages',
};

const stubProbe: typeof probeUkDataSource = async (adapter: UkDataAdapter<unknown>) => ({
  id: adapter.id,
  name: adapter.name,
  auth: adapter.auth,
  ok: true,
  status: 'ok',
});

const stubStations: typeof fetchFloodStations = async () => [STATION];

const stubReadings: typeof fetchFloodStationReadings = async () => [
  READING_AT_0900,
  READING_AT_0915,
];

const stubDatasets: typeof fetchOnsDatasets = async () => [DATASET];

function createDeps(): Required<Parameters<typeof runCli>[2]> {
  return {
    probeSource: stubProbe,
    fetchStations: stubStations,
    fetchReadings: stubReadings,
    fetchDatasets: stubDatasets,
  };
}

describe('runCli', () => {
  it('prints help when no command is given', async () => {
    const { out, err, output } = createCapture();
    const exitCode = await runCli([], output, createDeps());
    expect(exitCode).toBe(0);
    expect(out.join('\n')).toContain('ukdata - UK open data connectors');
    expect(err).toEqual([]);
  });

  it('prints help for the help command', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['help'], output, createDeps());
    expect(exitCode).toBe(0);
    expect(out.join('\n')).toContain('Usage:');
  });

  it('lists every source as JSON', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['sources'], output, createDeps());
    expect(exitCode).toBe(0);
    const sources = JSON.parse(out.join('\n')) as Array<{ id: string; auth: string }>;
    expect(sources.map((source) => source.id)).toEqual([
      'flood-stations',
      'flood-readings',
      'ons-datasets',
    ]);
    expect(sources.every((source) => source.auth === 'none')).toBe(true);
  });

  it('probes a known source', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['probe', 'flood-stations'], output, createDeps());
    expect(exitCode).toBe(0);
    const probe = JSON.parse(out.join('\n')) as { id: string; ok: boolean };
    expect(probe.id).toBe('flood-stations');
    expect(probe.ok).toBe(true);
  });

  it('errors when a probe command has no id', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['probe'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Usage: ukdata probe <id>');
  });

  it('errors on an unknown source', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['probe', 'nope'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Unknown source: nope');
  });

  it('lists flood-monitoring stations as JSON', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['flood-stations', '--limit', '5'], output, createDeps());
    expect(exitCode).toBe(0);
    const body = JSON.parse(out.join('\n')) as { stations: FloodStation[] };
    expect(body.stations[0]?.notation).toBe('1029TH');
    expect(body.stations[0]?.riverName).toBe('River Dikler');
  });

  it('reads the default flood station and prints its summary', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['flood-readings'], output, createDeps());
    expect(exitCode).toBe(0);
    const body = JSON.parse(out.join('\n')) as {
      station: string;
      summary: { count: number; trend: string };
      readings: FloodReading[];
    };
    expect(body.station).toBe('1029TH');
    expect(body.summary.count).toBe(2);
    expect(body.summary.trend).toBe('rising');
    expect(body.readings).toHaveLength(2);
  });

  it('reads a named flood station with an explicit limit', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(
      ['flood-readings', '--station', '1029TH', '--limit', '96'],
      output,
      createDeps()
    );
    expect(exitCode).toBe(0);
    const body = JSON.parse(out.join('\n')) as { station: string };
    expect(body.station).toBe('1029TH');
  });

  it('errors on a non-numeric limit', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['flood-stations', '--limit', 'many'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Unknown limit: many');
  });

  it('errors on a negative limit', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['ons-datasets', '--limit=-3'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Unknown limit: -3');
  });

  it('lists the ONS catalogue with its summary', async () => {
    const { out, output } = createCapture();
    const exitCode = await runCli(['ons-datasets', '--limit', '1000'], output, createDeps());
    expect(exitCode).toBe(0);
    const body = JSON.parse(out.join('\n')) as {
      summary: { datasetCount: number; nationalStatisticCount: number };
      records: OnsDatasetRecord[];
    };
    expect(body.summary.datasetCount).toBe(1);
    expect(body.summary.nationalStatisticCount).toBe(1);
    expect(body.records[0]?.id).toBe('babies-born-in-england-and-wales');
  });

  it('errors on an unknown command', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['frobnicate'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Unknown command: frobnicate');
  });

  it('errors on an unknown option', async () => {
    const { err, output } = createCapture();
    const exitCode = await runCli(['sources', '--bogus'], output, createDeps());
    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('bogus');
  });
});
