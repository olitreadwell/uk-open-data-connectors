import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  buildLandRegistryPricePaidUrl,
  DEFAULT_LAND_REGISTRY_POSTCODE,
  fetchLandRegistryPricePaidTransactions,
  landRegistryPricePaidAdapter,
  normalizeLandRegistryPostcode,
  parseLandRegistryPricePaid,
} from './landRegistryPricePaid.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

const EMPTY_PAGE = {
  result: {
    items: [],
    itemsPerPage: 20,
    page: 0,
    startIndex: 1,
    type: ['http://purl.org/linked-data/api/vocab#Page'],
  },
};

describe('buildLandRegistryPricePaidUrl', () => {
  it('builds the default query for the default postcode, newest first', () => {
    const url = new URL(buildLandRegistryPricePaidUrl());
    expect(url.origin + url.pathname).toBe(
      'https://landregistry.data.gov.uk/data/ppi/transaction-record.json'
    );
    expect(url.searchParams.get('_pageSize')).toBe('20');
    expect(url.searchParams.get('_sort')).toBe('-transactionDate');
    expect(url.searchParams.get('propertyAddress.postcode')).toBe(DEFAULT_LAND_REGISTRY_POSTCODE);
    expect(url.searchParams.has('_page')).toBe(false);
  });

  it('normalises a postcode written without a space or in lower case', () => {
    const url = new URL(buildLandRegistryPricePaidUrl({ postcode: ' wa28sn ' }));
    expect(url.searchParams.get('propertyAddress.postcode')).toBe('WA2 8SN');
  });

  it('maps a one-based page number onto the API zero-based page', () => {
    const url = new URL(buildLandRegistryPricePaidUrl({ page: 3 }));
    expect(url.searchParams.get('_page')).toBe('2');
  });

  it('maps a property type onto its linked data term', () => {
    const url = new URL(buildLandRegistryPricePaidUrl({ propertyType: 'other' }));
    expect(url.searchParams.get('propertyType')).toBe(
      'http://landregistry.data.gov.uk/def/common/otherPropertyType'
    );
  });

  it('adds inclusive transaction date bounds', () => {
    const url = new URL(
      buildLandRegistryPricePaidUrl({ fromDate: '2020-01-01', toDate: '2024-01-31' })
    );
    expect(url.searchParams.get('min-transactionDate')).toBe('2020-01-01');
    expect(url.searchParams.get('max-transactionDate')).toBe('2024-01-31');
  });

  it('sorts oldest first when asked', () => {
    const url = new URL(buildLandRegistryPricePaidUrl({ order: 'oldest' }));
    expect(url.searchParams.get('_sort')).toBe('transactionDate');
  });

  it('rejects a limit, page, date, or postcode the API cannot use', () => {
    expect(() => buildLandRegistryPricePaidUrl({ limit: 0 })).toThrow(RangeError);
    expect(() => buildLandRegistryPricePaidUrl({ limit: 1.5 })).toThrow(RangeError);
    expect(() => buildLandRegistryPricePaidUrl({ page: 0 })).toThrow(RangeError);
    expect(() => buildLandRegistryPricePaidUrl({ fromDate: '2020-1-1' })).toThrow(RangeError);
    expect(() => buildLandRegistryPricePaidUrl({ toDate: '2020-02-30' })).toThrow(RangeError);
    expect(() => buildLandRegistryPricePaidUrl({ postcode: 'not a postcode' })).toThrow(RangeError);
  });
});

describe('normalizeLandRegistryPostcode', () => {
  it('puts one space before the inward code and upper-cases the value', () => {
    expect(normalizeLandRegistryPostcode(' m1 1ae ')).toBe('M1 1AE');
    expect(normalizeLandRegistryPostcode('wa28sn')).toBe('WA2 8SN');
  });

  it('keeps a valid postcode written in the usual shape', () => {
    expect(normalizeLandRegistryPostcode('SW1A 1AA')).toBe('SW1A 1AA');
  });

  it('rejects text that is not a full UK postcode', () => {
    expect(() => normalizeLandRegistryPostcode('SW1A')).toThrow(RangeError);
    expect(() => normalizeLandRegistryPostcode('')).toThrow(RangeError);
  });
});

describe('parseLandRegistryPricePaid', () => {
  it('parses the committed price paid fixture', () => {
    const page = parseLandRegistryPricePaid(
      readFixtureJson('hm-land-registry-price-paid-2026-11-17.json')
    );
    expect(page.transactions).toHaveLength(3);
    expect(page.page).toBe(1);
    expect(page.itemsPerPage).toBe(3);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextPageUrl).toContain('_page=1');
  });

  it('maps the first transaction onto typed fields and an ISO date', () => {
    const page = parseLandRegistryPricePaid(
      readFixtureJson('hm-land-registry-price-paid-2026-11-17.json')
    );
    const first = page.transactions[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('152AB733-F4DC-E651-E063-4704A8C061D9');
    expect(first?.recordUrl).toBe(
      'http://landregistry.data.gov.uk/data/ppi/transaction/152AB733-F4DC-E651-E063-4704A8C061D9/current'
    );
    expect(first?.transactionDate).toBe('2024-01-05');
    expect(first?.pricePaid).toBe(300000);
    expect(first?.propertyType).toBe('flat-maisonette');
    expect(first?.estateType).toBe('Leasehold');
    expect(first?.newBuild).toBe(false);
    expect(first?.recordStatus).toBe('Add');
    expect(first?.transactionCategory).toBe('Standard price paid transaction');
    expect(first?.address).toEqual({
      paon: '113',
      saon: 'APARTMENT 21',
      street: 'NEWTON STREET',
      locality: null,
      town: 'MANCHESTER',
      district: 'MANCHESTER',
      county: 'GREATER MANCHESTER',
      postcode: 'M1 1AE',
    });
  });

  it('returns an empty page when the postcode has no recorded sales', () => {
    const page = parseLandRegistryPricePaid(EMPTY_PAGE);
    expect(page.transactions).toEqual([]);
    expect(page.page).toBe(1);
    expect(page.itemsPerPage).toBe(20);
    expect(page.hasNextPage).toBe(false);
    expect(page.nextPageUrl).toBeNull();
  });

  it('keeps missing optional record and address fields as null', () => {
    const page = parseLandRegistryPricePaid({
      result: {
        items: [
          {
            _about: 'http://landregistry.data.gov.uk/data/ppi/transaction/X/current',
            transactionId: 'X',
            transactionDate: 'Fri, 17 May 1996',
            pricePaid: 35000,
            propertyAddress: { paon: '1', postcode: 'WA2 8SN' },
          },
        ],
        itemsPerPage: 1,
        page: 0,
      },
    });
    expect(page.transactions[0]).toMatchObject({
      newBuild: null,
      propertyType: null,
      estateType: null,
      recordStatus: null,
      transactionCategory: null,
      address: {
        paon: '1',
        saon: null,
        street: null,
        locality: null,
        town: null,
        district: null,
        county: null,
        postcode: 'WA2 8SN',
      },
    });
  });

  it('rejects a payload without a result object', () => {
    expect(() => parseLandRegistryPricePaid({ items: [] })).toThrow(UkSourceParseError);
  });

  it('rejects a transaction date it cannot read', () => {
    expect(() =>
      parseLandRegistryPricePaid({
        result: {
          items: [
            {
              transactionId: 'X',
              transactionDate: 'not a date',
              pricePaid: 1,
            },
          ],
        },
      })
    ).toThrow(UkSourceParseError);
  });
});

describe('fetchLandRegistryPricePaidTransactions', () => {
  it('asks for the requested page and parses the response', async () => {
    const payload = readFixtureJson('hm-land-registry-price-paid-2026-11-17.json');
    const requestedUrls: string[] = [];
    const fetchImpl: typeof globalThis.fetch = async (input) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      return jsonResponse(payload);
    };

    const page = await fetchLandRegistryPricePaidTransactions({
      postcode: 'm11ae',
      limit: 3,
      order: 'oldest',
      fetchImpl,
    });

    expect(requestedUrls).toHaveLength(1);
    const url = new URL(requestedUrls[0] ?? '');
    expect(url.searchParams.get('_pageSize')).toBe('3');
    expect(url.searchParams.get('_sort')).toBe('transactionDate');
    expect(url.searchParams.get('propertyAddress.postcode')).toBe('M1 1AE');
    expect(page.transactions).toHaveLength(3);
  });

  it('throws the shared API error when the live endpoint fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 }));
    await expect(fetchLandRegistryPricePaidTransactions({ fetchImpl })).rejects.toBeInstanceOf(
      UkSourceApiError
    );
  });
});

describe('landRegistryPricePaidAdapter', () => {
  it('describes a keyless HM Land Registry source and loads its fixture', () => {
    expect(landRegistryPricePaidAdapter.id).toBe('hm-land-registry-price-paid');
    expect(landRegistryPricePaidAdapter.auth).toBe('none');
    expect(landRegistryPricePaidAdapter.name).toContain('HM Land Registry');
    expect(landRegistryPricePaidAdapter.loadFixture().transactions).toHaveLength(3);
  });
});
