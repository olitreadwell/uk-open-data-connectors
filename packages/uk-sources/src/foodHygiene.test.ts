import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors.js';
import {
  FSA_API_VERSION,
  FSA_API_VERSION_HEADER,
  FSA_AUTHORITIES_URL,
  fetchFoodHygieneAuthorities,
  foodHygieneAuthoritiesAdapter,
  parseFoodHygieneAuthorities,
  summarizeFoodHygieneAuthorities,
} from './foodHygiene.js';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

const AUTHORITIES_FIXTURE = readFixtureJson('food-hygiene-authorities.json');

/** One register with only the fields the parser needs. */
function authority(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    LocalAuthorityId: 1,
    LocalAuthorityIdCode: '001',
    Name: 'Example City',
    EstablishmentCount: 12,
    SchemeType: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseFoodHygieneAuthorities', () => {
  it('parses the register fixture', () => {
    const registers = parseFoodHygieneAuthorities(AUTHORITIES_FIXTURE);
    expect(registers).toHaveLength(363);
    expect(registers[0]?.localAuthorityName.length).toBeGreaterThan(0);
    expect(registers[0]?.localAuthorityCode.length).toBeGreaterThan(0);
    expect(registers[0]?.establishmentCount).toBeGreaterThan(0);
    expect(registers[0]?.scheme).toMatch(/^fh(r|i)s$/);
  });

  it('reads the scheme code as a scheme name', () => {
    const registers = parseFoodHygieneAuthorities({
      authorities: [
        authority({ Name: 'Birmingham', SchemeType: 1 }),
        authority({ Name: 'Glasgow City', SchemeType: 2 }),
      ],
    });
    expect(registers.map((register) => register.scheme)).toEqual(['fhrs', 'fhis']);
  });

  it('throws, naming the register, when the scheme code is unknown', () => {
    expect(() =>
      parseFoodHygieneAuthorities({
        authorities: [authority({ Name: 'Example City', SchemeType: 9 })],
      })
    ).toThrow(/unknown scheme type 9 on Example City/);
  });

  it('throws when the payload is not the register shape', () => {
    expect(() => parseFoodHygieneAuthorities({ items: [] })).toThrow(UkSourceParseError);
    expect(() => parseFoodHygieneAuthorities(null)).toThrow(UkSourceParseError);
  });
});

describe('summarizeFoodHygieneAuthorities', () => {
  const registers = parseFoodHygieneAuthorities(AUTHORITIES_FIXTURE);

  it('totals the registers, their establishments, and their schemes', () => {
    const summary = summarizeFoodHygieneAuthorities(registers);
    expect(summary.authorityCount).toBe(363);
    expect(summary.establishmentCount).toBe(612721);
    expect(summary.fhrsAuthorityCount).toBe(331);
    expect(summary.fhisAuthorityCount).toBe(32);
  });

  it('puts Birmingham at the top of the largest registers', () => {
    const summary = summarizeFoodHygieneAuthorities(registers);
    expect(summary.largestAuthorities[0]).toEqual({
      localAuthorityId: 374,
      localAuthorityCode: '402',
      localAuthorityName: 'Birmingham',
      establishmentCount: 10239,
      scheme: 'fhrs',
    });
    expect(summary.largestAuthorities).toHaveLength(10);
  });

  it('breaks a tie on the register name so the order is stable', () => {
    const tied = parseFoodHygieneAuthorities({
      authorities: [
        authority({ LocalAuthorityId: 1, Name: 'Zed City', EstablishmentCount: 5 }),
        authority({ LocalAuthorityId: 2, Name: 'Aa City', EstablishmentCount: 5 }),
      ],
    });
    const summary = summarizeFoodHygieneAuthorities(tied);
    expect(summary.largestAuthorities.map((register) => register.localAuthorityName)).toEqual([
      'Aa City',
      'Zed City',
    ]);
  });

  it('caps the largest list at the requested size', () => {
    const summary = summarizeFoodHygieneAuthorities(
      parseFoodHygieneAuthorities(AUTHORITIES_FIXTURE),
      3
    );
    expect(summary.largestAuthorities).toHaveLength(3);
  });

  it('returns zeroed counts for an empty register list', () => {
    expect(summarizeFoodHygieneAuthorities([])).toEqual({
      authorityCount: 0,
      establishmentCount: 0,
      fhrsAuthorityCount: 0,
      fhisAuthorityCount: 0,
      largestAuthorities: [],
    });
  });
});

describe('fetchFoodHygieneAuthorities', () => {
  it('asks for API version 2 and parses the reply', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(AUTHORITIES_FIXTURE), { status: 200 })
    );
    const registers = await fetchFoodHygieneAuthorities({ fetchImpl });
    expect(registers).toHaveLength(363);
    expect(fetchImpl).toHaveBeenCalledWith(FSA_AUTHORITIES_URL, {
      headers: { [FSA_API_VERSION_HEADER]: FSA_API_VERSION },
    });
  });

  it('throws an API error when the endpoint refuses the call', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));
    await expect(fetchFoodHygieneAuthorities({ fetchImpl })).rejects.toThrow(UkSourceApiError);
  });
});

describe('foodHygieneAuthoritiesAdapter', () => {
  it('describes itself as a keyless source', () => {
    expect(foodHygieneAuthoritiesAdapter.id).toBe('food-hygiene-authorities');
    expect(foodHygieneAuthoritiesAdapter.auth).toBe('none');
    expect(foodHygieneAuthoritiesAdapter.name).toContain('Food Standards Agency');
  });

  it('loads the committed fixture when it is asked for one', () => {
    expect(foodHygieneAuthoritiesAdapter.loadFixture()).toHaveLength(363);
  });
});
