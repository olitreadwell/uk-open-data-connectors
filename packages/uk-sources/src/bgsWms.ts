import { UkSourceParseError } from './errors.js';
import { readFixtureText } from './fixtures.js';
import { httpGet } from './http.js';
import { stripMarkup } from './text.js';
import type { UkDataAdapter } from './types.js';

/**
 * The British Geological Survey OpenGeoscience WMS. Keyless, and the
 * capabilities document says the data is delivered under the Open Government
 * Licence with a BGS acknowledgement.
 */
export const BGS_WMS_SOURCE_ID = 'bgs-opengeoscience-wms';

/** The BGS 1:50,000 digital geology Web Map Service capabilities document. */
export const BGS_WMS_CAPABILITIES_URL =
  'https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer?service=WMS&request=GetCapabilities';

/** One named layer in the WMS. */
export interface BgsWmsLayer {
  name: string;
  title: string;
  queryable: boolean;
  crs: string[];
}

/** The geographic bounds the WMS advertises. */
export interface BgsWmsGeographicBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** The parts of a WMS capabilities document this adapter returns. */
export interface BgsWmsCapabilities {
  version: string;
  title: string;
  abstract: string | null;
  layers: BgsWmsLayer[];
  geographicBounds: BgsWmsGeographicBounds | null;
}

/** Reads the text of the first tag with this name. */
function readTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return match?.[1] ?? null;
}

/** Reads a finite number from the first tag with this name. */
function readNumberTag(block: string, tag: string): number | null {
  const raw = readTag(block, tag);
  if (raw === null) {
    return null;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

/** Reads the first geographic bounding box, when the document carries one. */
function readGeographicBounds(payload: string): BgsWmsGeographicBounds | null {
  const box = /<EX_GeographicBoundingBox\b[^>]*>([\s\S]*?)<\/EX_GeographicBoundingBox>/i.exec(
    payload
  )?.[1];
  if (box === undefined) {
    return null;
  }
  const west = readNumberTag(box, 'westBoundLongitude');
  const east = readNumberTag(box, 'eastBoundLongitude');
  const south = readNumberTag(box, 'southBoundLatitude');
  const north = readNumberTag(box, 'northBoundLatitude');
  if (west === null || east === null || south === null || north === null) {
    return null;
  }
  return { west, east, south, north };
}

/**
 * Parses a WMS capabilities document.
 *
 * @param payload - the XML response, or the committed fixture of one
 * @returns the service metadata and every named layer
 */
export function parseBgsWmsCapabilities(payload: string): BgsWmsCapabilities {
  if (!/<WMS_Capabilities\b/i.test(payload)) {
    throw new UkSourceParseError(
      BGS_WMS_SOURCE_ID,
      'the response is not a WMS capabilities document'
    );
  }
  const version = /<WMS_Capabilities\b[^>]*\bversion="([^"]+)"/i.exec(payload)?.[1];
  if (version === undefined || version.trim() === '') {
    throw new UkSourceParseError(BGS_WMS_SOURCE_ID, 'the document has no WMS version');
  }
  const service = readTag(payload, 'Service') ?? '';
  const title = stripMarkup(readTag(service, 'Title') ?? '');
  if (title === '') {
    throw new UkSourceParseError(BGS_WMS_SOURCE_ID, 'the document has no service title');
  }
  const abstract = stripMarkup(readTag(service, 'Abstract') ?? '');
  const layers: BgsWmsLayer[] = [];
  for (const match of payload.matchAll(/<Layer\b([^>]*)>([\s\S]*?)(?=<Layer\b|<\/Layer>)/gi)) {
    const attributes = match[1] ?? '';
    const block = match[2] ?? '';
    const name = stripMarkup(readTag(block, 'Name') ?? '');
    if (name === '') {
      continue;
    }
    const layerTitle = stripMarkup(readTag(block, 'Title') ?? '');
    if (layerTitle === '') {
      throw new UkSourceParseError(BGS_WMS_SOURCE_ID, `layer ${JSON.stringify(name)} has no title`);
    }
    const crs = [...block.matchAll(/<CRS\b[^>]*>([\s\S]*?)<\/CRS>/gi)].map((crsMatch) =>
      stripMarkup(crsMatch[1] ?? '')
    );
    layers.push({
      name,
      title: layerTitle,
      queryable: /\bqueryable="1"/i.test(attributes),
      crs,
    });
  }
  if (layers.length === 0) {
    throw new UkSourceParseError(BGS_WMS_SOURCE_ID, 'the document has no named layer');
  }
  return {
    version,
    title,
    abstract: abstract === '' ? null : abstract,
    layers,
    geographicBounds: readGeographicBounds(payload),
  };
}

/**
 * Reads the BGS OpenGeoscience WMS capabilities document.
 *
 * @param options - an optional fetch implementation
 * @returns the service metadata and every named layer
 */
export async function fetchBgsWmsCapabilities(
  options: { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<BgsWmsCapabilities> {
  const response = await httpGet(BGS_WMS_SOURCE_ID, BGS_WMS_CAPABILITIES_URL, {
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    headers: { accept: 'text/xml' },
  });
  return parseBgsWmsCapabilities(await response.text());
}

/** BGS OpenGeoscience WMS capabilities, keyless and under the Open Government Licence. */
export const bgsWmsAdapter: UkDataAdapter<BgsWmsCapabilities> = {
  id: BGS_WMS_SOURCE_ID,
  name: 'BGS OpenGeoscience WMS',
  auth: 'none',
  description:
    'BGS 1:50,000 digital geology layers, with the service bounds and coordinate systems.',
  fetchLive: (options) =>
    fetchBgsWmsCapabilities(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => {
    if (typeof payload !== 'string') {
      throw new UkSourceParseError(
        BGS_WMS_SOURCE_ID,
        'expected a WMS capabilities document as text'
      );
    }
    return parseBgsWmsCapabilities(payload);
  },
  loadFixture: () => parseBgsWmsCapabilities(readFixtureText('bgs-wms-2026-11-08.xml')),
};
