import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  fetchTflLineStatuses,
  parseTflLineStatuses,
  summarizeTflLineStatuses,
  TFL_LINE_STATUS_SOURCE_ID,
  tflLineStatusAdapter,
} from './tflLineStatus.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const LINE_STATUS_FIXTURE = readFixtureJson('tfl-line-status-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseTflLineStatuses', () => {
  it('parses the committed Tube line status fixture', () => {
    const lines = parseTflLineStatuses(LINE_STATUS_FIXTURE);
    expect(lines).toHaveLength(11);
    expect(lines.map((line) => line.id)).toContain('bakerloo');
    const district = lines.find((line) => line.id === 'district');
    expect(district?.statusSeverityDescription).toBe('Minor Delays');
    expect(district?.reason).toContain('earlier faulty train');
  });

  it('rejects a line without a status', () => {
    expect(() =>
      parseTflLineStatuses([{ id: 'x', name: 'X', modeName: 'tube', lineStatuses: [] }])
    ).toThrow(UkSourceParseError);
  });

  it('rejects a payload that is not an array', () => {
    expect(() => parseTflLineStatuses({ lines: [] })).toThrow(UkSourceParseError);
  });
});

describe('summarizeTflLineStatuses', () => {
  it('separates good service from disrupted lines', () => {
    const summary = summarizeTflLineStatuses(parseTflLineStatuses(LINE_STATUS_FIXTURE));
    expect(summary.lineCount).toBe(11);
    expect(summary.goodServiceCount).toBe(9);
    expect(summary.disruptedLines.map((line) => line.id)).toEqual(['district', 'victoria']);
  });
});

describe('fetchTflLineStatuses', () => {
  it('fetches the line statuses with no app key', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(LINE_STATUS_FIXTURE));
    });
    const lines = await fetchTflLineStatuses({ fetchImpl });
    expect(lines).toHaveLength(11);
    expect(requestedUrls[0]).toBe('https://api.tfl.gov.uk/Line/Mode/tube/Status');
  });

  it('adds an app key when the caller supplies one', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(LINE_STATUS_FIXTURE));
    });
    await fetchTflLineStatuses({ apiKey: 'secret key', fetchImpl });
    expect(requestedUrls[0]).toBe(
      'https://api.tfl.gov.uk/Line/Mode/tube/Status?app_key=secret%20key'
    );
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 429 }));
    await expect(fetchTflLineStatuses({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('tflLineStatusAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(tflLineStatusAdapter.id).toBe(TFL_LINE_STATUS_SOURCE_ID);
    expect(tflLineStatusAdapter.auth).toBe('none');
    expect(tflLineStatusAdapter.loadFixture()).toHaveLength(11);
  });
});
