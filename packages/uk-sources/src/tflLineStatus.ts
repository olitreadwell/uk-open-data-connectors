import { z } from 'zod';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * Transport for London's live Tube line status. Keyless: the endpoint answers
 * without an app key, and TfL asks for one only above the free rate limit.
 * Published as TfL Open Data.
 */
export const TFL_LINE_STATUS_SOURCE_ID = 'tfl-line-status';

/** The Tube line status endpoint, covering every Tube line at once. */
export const TFL_LINE_STATUS_URL = 'https://api.tfl.gov.uk/Line/Mode/tube/Status';

/** TfL's severity code for a line running a good service. */
export const TFL_LINE_STATUS_GOOD_SERVICE_SEVERITY = 10;

/** One Tube line and the service status TfL reports for it. */
export interface TflLineStatus {
  /** TfL's line id, such as "bakerloo". */
  id: string;
  name: string;
  modeName: string;
  /** TfL's numeric severity, 10 for a good service. */
  statusSeverity: number;
  /** TfL's own wording for the severity, such as "Minor Delays". */
  statusSeverityDescription: string;
  /** The operator's explanation, or "" when there is nothing to explain. */
  reason: string;
}

/** Rolled-up view of the Tube line status list. */
export interface TflLineStatusSummary {
  lineCount: number;
  /** Lines TfL reports at good-service severity. */
  goodServiceCount: number;
  /** The lines running below a good service, in TfL's order. */
  disruptedLines: TflLineStatus[];
}

const TFL_LINE_STATUS_ENTRY_SCHEMA = z.object({
  id: z.number(),
  statusSeverity: z.number(),
  statusSeverityDescription: z.string(),
  reason: z.string().optional(),
});

const TFL_LINE_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  modeName: z.string(),
  lineStatuses: z.array(TFL_LINE_STATUS_ENTRY_SCHEMA).min(1),
});

const TFL_LINES_SCHEMA = z.array(TFL_LINE_SCHEMA);

/**
 * Parses a TfL line status payload into one record per line.
 *
 * @param payload - the raw JSON body from the line status endpoint
 * @returns one record per Tube line, in TfL's order
 */
export function parseTflLineStatuses(payload: unknown): TflLineStatus[] {
  const parsed = TFL_LINES_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError('tfl-line-status', parsed.error.message);
  }
  return parsed.data.map((line) => {
    const status = line.lineStatuses[0];
    return {
      id: line.id,
      name: line.name,
      modeName: line.modeName,
      statusSeverity: status?.statusSeverity ?? 0,
      statusSeverityDescription: status?.statusSeverityDescription ?? '',
      reason: status?.reason ?? '',
    };
  });
}

/**
 * Counts the lines and keeps the ones running below a good service.
 *
 * @param lines - lines from {@link parseTflLineStatuses}
 * @returns line and good-service counts plus the disrupted lines
 */
export function summarizeTflLineStatuses(lines: TflLineStatus[]): TflLineStatusSummary {
  return {
    lineCount: lines.length,
    goodServiceCount: lines.filter(
      (line) => line.statusSeverity === TFL_LINE_STATUS_GOOD_SERVICE_SEVERITY
    ).length,
    disruptedLines: lines.filter(
      (line) => line.statusSeverity !== TFL_LINE_STATUS_GOOD_SERVICE_SEVERITY
    ),
  };
}

/**
 * Reads the live status of every Tube line from TfL.
 *
 * @param options - an optional app key and fetch implementation
 * @returns the line statuses the endpoint returns
 */
export async function fetchTflLineStatuses(
  options: { apiKey?: string; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<TflLineStatus[]> {
  const { apiKey, fetchImpl = globalThis.fetch } = options;
  const url =
    apiKey === undefined
      ? TFL_LINE_STATUS_URL
      : `${TFL_LINE_STATUS_URL}?app_key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UkSourceApiError('tfl-line-status', `HTTP ${response.status} reading line status`);
  }
  return parseTflLineStatuses(await response.json());
}

/** Transport for London Tube line status, keyless. */
export const tflLineStatusAdapter: UkDataAdapter<TflLineStatus[]> = {
  id: TFL_LINE_STATUS_SOURCE_ID,
  name: 'Transport for London Tube line status',
  auth: 'none',
  description: 'The live service status of every Tube line, with disruption reasons.',
  fetchLive: (options) =>
    fetchTflLineStatuses({
      ...(options?.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseTflLineStatuses,
  loadFixture: () => parseTflLineStatuses(readFixtureJson('tfl-line-status-2026-10-05.json')),
};
