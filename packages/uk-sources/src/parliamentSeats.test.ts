import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UkSourceApiError, UkSourceParseError } from './errors';
import {
  buildParliamentSeatsUrl,
  fetchParliamentSeats,
  formatParliamentQueryDate,
  parliamentSeatsAdapter,
  parseParliamentPartySeats,
  parseParliamentSeats,
  PARLIAMENT_COMMONS_HOUSE,
  PARLIAMENT_MEMBERS_API_BASE_URL,
} from './parliamentSeats';

function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8'));
}

/** One party row in the shape the Members API writes it. */
function partyRow(options: {
  id: number;
  name: string;
  total: number;
  male?: number;
  female?: number;
  nonBinary?: number;
}): unknown {
  return {
    value: {
      male: options.male ?? options.total,
      female: options.female ?? 0,
      nonBinary: options.nonBinary ?? 0,
      total: options.total,
      party: {
        id: options.id,
        name: options.name,
        abbreviation: options.name.slice(0, 3),
        backgroundColour: 'd50000',
        foregroundColour: 'ffffff',
        isIndependentParty: false,
      },
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe('formatParliamentQueryDate', () => {
  it('formats the date as YYYY-MM-DD in UK local time', () => {
    expect(formatParliamentQueryDate(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01');
  });

  it('uses the UK date after midnight UTC in summer', () => {
    expect(formatParliamentQueryDate(new Date('2026-07-05T23:30:00Z'))).toBe('2026-07-06');
  });
});

describe('buildParliamentSeatsUrl', () => {
  it('builds the state-of-the-parties URL for a house and date', () => {
    expect(buildParliamentSeatsUrl(PARLIAMENT_COMMONS_HOUSE, '2026-10-01')).toBe(
      `${PARLIAMENT_MEMBERS_API_BASE_URL}/Parties/StateOfTheParties/1/2026-10-01`
    );
  });

  it('builds the Lords URL when asked for house 2', () => {
    expect(buildParliamentSeatsUrl(2, '2026-10-01')).toContain('/StateOfTheParties/2/');
  });
});

describe('parseParliamentSeats', () => {
  it('reads the 650 Commons seats from the captured payload', () => {
    const summary = parseParliamentSeats(readFixtureJson('parliament-seats.json'));
    expect(summary.seatCount).toBe(650);
    expect(summary.partyCount).toBe(18);
    expect(summary.majorityThreshold).toBe(326);
    expect(summary.largestParty.party.name).toBe('Labour');
    expect(summary.largestParty.seatCount).toBe(403);
  });

  it('counts the parties holding a single seat', () => {
    const summary = parseParliamentSeats(readFixtureJson('parliament-seats.json'));
    expect(summary.partiesWithOneSeat).toBe(6);
  });

  it('marks the vacant seat as a party with no member behind it', () => {
    const summary = parseParliamentSeats(readFixtureJson('parliament-seats.json'));
    const vacant = summary.seats.find((entry) => entry.party.name === 'Vacant');
    expect(vacant?.seatCount).toBe(1);
    expect(vacant?.unallocatedSeatCount).toBe(1);
  });

  it('ranks the parties largest first', () => {
    const summary = parseParliamentSeats(readFixtureJson('parliament-seats.json'));
    const seatCounts = summary.seats.map((entry) => entry.seatCount);
    expect(seatCounts).toEqual([...seatCounts].sort((left, right) => right - left));
  });

  it('rejects a house with no parties', () => {
    expect(() => parseParliamentSeats({ items: [] })).toThrow(UkSourceParseError);
    expect(() => parseParliamentSeats({ items: null })).toThrow(UkSourceParseError);
  });

  it('rejects a party row with no party', () => {
    expect(() =>
      parseParliamentPartySeats({ items: [{ value: { total: 5, party: null } }] })
    ).toThrow(UkSourceParseError);
  });

  it('rejects a party with a blank name', () => {
    expect(() =>
      parseParliamentPartySeats({ items: [partyRow({ id: 1, name: '  ', total: 5 })] })
    ).toThrow(UkSourceParseError);
  });

  it('rejects a party with no seats', () => {
    expect(() =>
      parseParliamentPartySeats({ items: [partyRow({ id: 1, name: 'Nobody', total: 0 })] })
    ).toThrow(UkSourceParseError);
  });

  it('rejects the same party listed twice', () => {
    expect(() =>
      parseParliamentPartySeats({
        items: [
          partyRow({ id: 15, name: 'Labour', total: 300 }),
          partyRow({ id: 15, name: 'Labour', total: 100 }),
        ],
      })
    ).toThrow(/more than once/);
  });

  it('rejects more members than seats', () => {
    expect(() =>
      parseParliamentPartySeats({
        items: [partyRow({ id: 1, name: 'Nobody', total: 2, male: 5 })],
      })
    ).toThrow(/names 5 members across 2 seats/);
  });
});

describe('fetchParliamentSeats', () => {
  it('asks for the Commons on the caller date and summarises the answer', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          partyRow({ id: 15, name: 'Labour', total: 403, male: 215, female: 188 }),
          partyRow({ id: 4, name: 'Conservative', total: 118, male: 90, female: 28 }),
        ],
      })
    );
    const summary = await fetchParliamentSeats({ forDate: '2026-10-01', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${PARLIAMENT_MEMBERS_API_BASE_URL}/Parties/StateOfTheParties/1/2026-10-01`,
      expect.objectContaining({ headers: { accept: 'application/json' } })
    );
    expect(summary.seatCount).toBe(521);
    expect(summary.largestParty.party.name).toBe('Labour');
  });

  it('reports an HTTP failure as an API error', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 400 }));
    await expect(fetchParliamentSeats({ forDate: '2026-10-01', fetchImpl })).rejects.toThrow(
      UkSourceApiError
    );
  });
});

describe('parliamentSeatsAdapter', () => {
  it('loads the committed fixture', () => {
    const summary = parliamentSeatsAdapter.loadFixture();
    expect(summary.seatCount).toBe(650);
    expect(summary.largestParty.party.name).toBe('Labour');
  });

  it('probes live through the adapter', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(readFixtureJson('parliament-seats.json')));
    vi.stubGlobal('fetch', fetchImpl);
    const summary = await parliamentSeatsAdapter.fetchLive({ fetchImpl });
    expect(summary.partyCount).toBe(18);
    vi.unstubAllGlobals();
  });
});
