import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import {
  BGS_WMS_CAPABILITIES_URL,
  BGS_WMS_SOURCE_ID,
  bgsWmsAdapter,
  fetchBgsWmsCapabilities,
  parseBgsWmsCapabilities,
} from './bgsWms.js';

const CAPABILITIES_FIXTURE = readFixtureText('bgs-wms-2026-11-08.xml');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseBgsWmsCapabilities', () => {
  it('parses the committed WMS capabilities document', () => {
    const capabilities = parseBgsWmsCapabilities(CAPABILITIES_FIXTURE);

    expect(capabilities.version).toBe('1.3.0');
    expect(capabilities.title).toBe('BGS 50000 scale digital geology');
    expect(capabilities.abstract).toContain('This dataset is designed for 1:50000 scale');
    expect(capabilities.layers).toHaveLength(6);
    expect(capabilities.layers[0]).toEqual({
      name: 'BGS.detailed.geology',
      title: 'BGS detailed geology',
      queryable: false,
      crs: ['CRS:84', 'EPSG:4326', 'EPSG:4258', 'EPSG:27700', 'EPSG:3857'],
    });
    expect(capabilities.layers[1]).toMatchObject({
      name: 'BGS.50k.Bedrock',
      title: 'GBR BGS 1:50k Bedrock',
      queryable: true,
    });
    expect(capabilities.geographicBounds).toEqual({
      west: -8.344021,
      east: 2.697705,
      south: 49.846369,
      north: 60.866269,
    });
  });

  it('reads a minimal capabilities document without a bounding box', () => {
    const capabilities = parseBgsWmsCapabilities(
      '<WMS_Capabilities version="1.3.0"><Service><Title>Example WMS</Title></Service><Capability><Layer><Name>example</Name><Title>Example layer</Title></Layer></Capability></WMS_Capabilities>'
    );

    expect(capabilities).toEqual({
      version: '1.3.0',
      title: 'Example WMS',
      abstract: null,
      layers: [{ name: 'example', title: 'Example layer', queryable: false, crs: [] }],
      geographicBounds: null,
    });
  });

  it('rejects a payload that is not a WMS capabilities document', () => {
    expect(() => parseBgsWmsCapabilities('<ServiceExceptionReport />')).toThrow(UkSourceParseError);
  });

  it('rejects a document without a version or a named layer', () => {
    expect(() =>
      parseBgsWmsCapabilities(
        '<WMS_Capabilities><Service><Title>Example</Title></Service></WMS_Capabilities>'
      )
    ).toThrow(UkSourceParseError);
    expect(() =>
      parseBgsWmsCapabilities(
        '<WMS_Capabilities version="1.3.0"><Service><Title>Example</Title></Service><Capability><Layer><Title>No name</Title></Layer></Capability></WMS_Capabilities>'
      )
    ).toThrow(/layer/);
  });
});

describe('fetchBgsWmsCapabilities', () => {
  it('fetches and parses the capabilities document', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return new Response(CAPABILITIES_FIXTURE, { headers: { 'content-type': 'text/xml' } });
    });

    const capabilities = await fetchBgsWmsCapabilities({ fetchImpl });

    expect(capabilities.layers).toHaveLength(6);
    expect(requestedUrls[0]).toBe(BGS_WMS_CAPABILITIES_URL);
  });

  it('throws an API error on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));

    await expect(fetchBgsWmsCapabilities({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('bgsWmsAdapter', () => {
  it('loads the committed fixture without touching the network', () => {
    expect(bgsWmsAdapter.id).toBe(BGS_WMS_SOURCE_ID);
    expect(bgsWmsAdapter.auth).toBe('none');
    expect(bgsWmsAdapter.loadFixture().layers).toHaveLength(6);
  });
});
