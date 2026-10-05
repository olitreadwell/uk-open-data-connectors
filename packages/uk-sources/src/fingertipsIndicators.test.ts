import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildFingertipsIndicatorUrl,
  fetchFingertipsIndicators,
  FINGERTIPS_INDICATORS_SOURCE_ID,
  fingertipsIndicatorsAdapter,
  parseFingertipsIndicators,
  summarizeFingertipsIndicators,
} from './fingertipsIndicators.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const INDICATOR_FIXTURE = readFixtureJson('fingertips-indicators-2026-10-05.json');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildFingertipsIndicatorUrl', () => {
  it('joins the indicator ids with commas', () => {
    expect(buildFingertipsIndicatorUrl([90366, 90367])).toBe(
      'https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id?indicator_ids=90366,90367'
    );
  });
});

describe('parseFingertipsIndicators', () => {
  it('parses the committed indicator metadata fixture', () => {
    const indicators = parseFingertipsIndicators(INDICATOR_FIXTURE);
    expect(indicators).toHaveLength(1);
    const indicator = indicators[0];
    expect(indicator?.indicatorId).toBe(90366);
    expect(indicator?.name).toBe('Life expectancy at birth');
    expect(indicator?.dataSource).toBe('Office for National Statistics');
    expect(indicator?.unitLabel).toBe('Years');
    expect(indicator?.valueType).toBe('Life expectancy');
    expect(indicator?.yearType).toBe('Calendar');
    expect(indicator?.lastUploadedAt).toBe('2026-04-20T16:25:53');
  });

  it('turns absent optional metadata into empty strings', () => {
    const indicators = parseFingertipsIndicators({ 1234: { IID: 1234 } });
    expect(indicators[0]).toEqual({
      indicatorId: 1234,
      name: '',
      dataSource: '',
      unitLabel: '',
      valueType: '',
      yearType: '',
      lastUploadedAt: '',
      latestChangeTimestampOverride: '',
    });
  });

  it('rejects a payload that is not keyed by indicator id', () => {
    expect(() => parseFingertipsIndicators({ 1234: { name: 'no id' } })).toThrow(
      UkSourceParseError
    );
  });
});

describe('summarizeFingertipsIndicators', () => {
  it('reports the indicator count and the distinct data sources', () => {
    expect(summarizeFingertipsIndicators(parseFingertipsIndicators(INDICATOR_FIXTURE))).toEqual({
      indicatorCount: 1,
      dataSources: ['Office for National Statistics'],
    });
  });

  it('handles an empty payload', () => {
    expect(summarizeFingertipsIndicators([])).toEqual({ indicatorCount: 0, dataSources: [] });
  });
});

describe('fetchFingertipsIndicators', () => {
  it('fetches and parses the indicator metadata', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(JSON.stringify(INDICATOR_FIXTURE));
    });
    const indicators = await fetchFingertipsIndicators({ indicatorIds: [90366], fetchImpl });
    expect(indicators).toHaveLength(1);
    expect(requestedUrls[0]).toContain('indicator_ids=90366');
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 }));
    await expect(fetchFingertipsIndicators({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('fingertipsIndicatorsAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(fingertipsIndicatorsAdapter.id).toBe(FINGERTIPS_INDICATORS_SOURCE_ID);
    expect(fingertipsIndicatorsAdapter.auth).toBe('none');
    expect(fingertipsIndicatorsAdapter.loadFixture()).toHaveLength(1);
  });
});
