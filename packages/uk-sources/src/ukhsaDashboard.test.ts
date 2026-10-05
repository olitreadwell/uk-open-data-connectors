import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildUkhsaMetricUrl,
  fetchUkhsaMetricPoints,
  parseUkhsaMetricPoints,
  summarizeUkhsaMetricPoints,
  UKHSA_DASHBOARD_SOURCE_ID,
  ukhsaDashboardAdapter,
} from './ukhsaDashboard.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const METRIC_FIXTURE = readFixtureJson('ukhsa-dashboard-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUkhsaMetricUrl', () => {
  it('carries the page size', () => {
    expect(buildUkhsaMetricUrl(10)).toContain('HIV_cases_newDiagnoses?page_size=10');
  });
});

describe('parseUkhsaMetricPoints', () => {
  it('parses the committed metric response', () => {
    const page = parseUkhsaMetricPoints(METRIC_FIXTURE);
    expect(page.totalCount).toBe(35);
    expect(page.points).toHaveLength(10);
    const first = page.points[0];
    expect(first?.theme).toBe('infectious_disease');
    expect(first?.subTheme).toBe('bloodborne');
    expect(first?.geography).toBe('England');
    expect(first?.geographyCode).toBe('E92000001');
    expect(first?.metricValue).toBe(4506);
    expect(first?.date).toBe('2015-12-31');
    expect(first?.inReportingDelayPeriod).toBe(false);
  });

  it('turns absent optional fields into defaults', () => {
    const page = parseUkhsaMetricPoints({
      count: 1,
      results: [
        {
          theme: 't',
          sub_theme: 's',
          topic: 'p',
          geography_type: 'Nation',
          geography: 'England',
          metric: 'm',
          sex: 'all',
          age: 'all',
          year: 2020,
          date: '2020-12-31',
          in_reporting_delay_period: true,
        },
      ],
    });
    expect(page.points[0]?.geographyCode).toBe('');
    expect(page.points[0]?.month).toBeNull();
    expect(page.points[0]?.metricValue).toBeNull();
  });

  it('rejects a payload without results', () => {
    expect(() => parseUkhsaMetricPoints({ count: 3 })).toThrow(UkSourceParseError);
  });
});

describe('summarizeUkhsaMetricPoints', () => {
  it('reports the date range and the latest value', () => {
    const summary = summarizeUkhsaMetricPoints(parseUkhsaMetricPoints(METRIC_FIXTURE));
    expect(summary).toEqual({
      pointCount: 10,
      totalCount: 35,
      firstDate: '2015-12-31',
      lastDate: '2020-12-31',
      latestValue: 172,
    });
  });

  it('handles an empty page', () => {
    expect(summarizeUkhsaMetricPoints({ totalCount: 0, points: [] })).toEqual({
      pointCount: 0,
      totalCount: 0,
      firstDate: '',
      lastDate: '',
      latestValue: null,
    });
  });
});

describe('fetchUkhsaMetricPoints', () => {
  it('fetches and parses the metric page', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(METRIC_FIXTURE));
    });
    const page = await fetchUkhsaMetricPoints({ pageSize: 10, fetchImpl });
    expect(page.points).toHaveLength(10);
    expect(requestedUrls[0]).toContain('?page_size=10');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 }));
    await expect(fetchUkhsaMetricPoints({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('ukhsaDashboardAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(ukhsaDashboardAdapter.id).toBe(UKHSA_DASHBOARD_SOURCE_ID);
    expect(ukhsaDashboardAdapter.auth).toBe('none');
    expect(ukhsaDashboardAdapter.loadFixture().totalCount).toBe(35);
  });
});
