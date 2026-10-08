import { z } from 'zod';

import { UkSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UkDataAdapter } from './types.js';

/**
 * The state of the parties in each house of the UK Parliament, from the
 * Members API. The API answers without a key and Parliament publishes the
 * data under the Open Parliament Licence v3.0:
 * <https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/>
 */
export const PARLIAMENT_SEATS_SOURCE_ID = 'parliament-seats';

/** Root every call here is built from. */
export const PARLIAMENT_MEMBERS_API_BASE_URL = 'https://members-api.parliament.uk/api';

/** Path for the state of the parties in one house on one date. */
export const PARLIAMENT_STATE_OF_PARTIES_PATH = 'Parties/StateOfTheParties';

/**
 * The house number the API uses for the Commons. The Swagger schema behind
 * `House` carries exactly two values: 1 for the Commons, 2 for the Lords.
 */
export const PARLIAMENT_COMMONS_HOUSE = 1;

/** The house number the API uses for the Lords. */
export const PARLIAMENT_LORDS_HOUSE = 2;

/** Which house a seat count belongs to. */
export type ParliamentHouse = 'commons' | 'lords';

/** One party as the Members API lists it, with the colours it publishes. */
export interface ParliamentParty {
  id: number;
  name: string;
  abbreviation: string;
  /** Hex without the leading '#'. Null for the Speaker and a few others. */
  backgroundColour: string | null;
  /** Hex without the leading '#'. Null for the Speaker and a few others. */
  foregroundColour: string | null;
  isIndependent: boolean;
}

/** One party's seats, with the member counts the API reports behind them. */
export interface ParliamentPartySeats {
  party: ParliamentParty;
  seatCount: number;
  maleCount: number;
  femaleCount: number;
  nonBinaryCount: number;
  /**
   * Seats the API counts for the party but name no member. That is the vacant
   * seat, and it is zero for every other row.
   */
  unallocatedSeatCount: number;
}

/** The state of the parties on one date, rolled up into the numbers a page prints. */
export interface ParliamentSeatSummary {
  /** Seats the house holds: 650 in the Commons while every seat is filled. */
  seatCount: number;
  partyCount: number;
  /** Seats a party needs to hold more than half the house: 326 of 650. */
  majorityThreshold: number;
  partiesWithOneSeat: number;
  /** Parties, largest first, ties broken by name. */
  seats: ParliamentPartySeats[];
  largestParty: ParliamentPartySeats;
}

const PARLIAMENT_PARTY_SCHEMA = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  abbreviation: z.string().nullable(),
  backgroundColour: z.string().nullable(),
  foregroundColour: z.string().nullable(),
  isIndependentParty: z.boolean(),
});

const PARLIAMENT_SEAT_COUNT_SCHEMA = z.object({
  male: z.number().int().nonnegative().nullable(),
  female: z.number().int().nonnegative().nullable(),
  nonBinary: z.number().int().nonnegative().nullable(),
  total: z.number().int(),
  party: PARLIAMENT_PARTY_SCHEMA.nullable(),
});

const PARLIAMENT_RESPONSE_SCHEMA = z.object({
  items: z.array(z.object({ value: PARLIAMENT_SEAT_COUNT_SCHEMA.nullable() })).nullable(),
});

/**
 * Formats a date as the `YYYY-MM-DD` the path takes, in UK local time.
 *
 * @param date - the instant to format
 * @returns the date the API reads, for example `2026-10-01`
 */
export function formatParliamentQueryDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/London',
  }).format(date);
}

/**
 * Builds the state-of-the-parties URL for one house and one date.
 *
 * @param house - 1 for the Commons, 2 for the Lords
 * @param forDate - the date to ask for, as `YYYY-MM-DD`
 * @returns the full URL
 */
export function buildParliamentSeatsUrl(house: number, forDate: string): string {
  return `${PARLIAMENT_MEMBERS_API_BASE_URL}/${PARLIAMENT_STATE_OF_PARTIES_PATH}/${String(house)}/${forDate}`;
}

/** Turns one API row into a party with its seats, or throws naming the row. */
function readParliamentPartySeats(
  row: z.infer<typeof PARLIAMENT_SEAT_COUNT_SCHEMA>
): ParliamentPartySeats {
  const party = row.party;
  if (party === null) {
    throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, 'a party row carried no party');
  }
  const name = (party.name ?? '').trim();
  if (name === '') {
    throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, 'a party row carried no name');
  }
  if (row.total <= 0) {
    throw new UkSourceParseError(
      PARLIAMENT_SEATS_SOURCE_ID,
      `${name} holds ${String(row.total)} seats, which cannot be right`
    );
  }
  const maleCount = row.male ?? 0;
  const femaleCount = row.female ?? 0;
  const nonBinaryCount = row.nonBinary ?? 0;
  const memberCount = maleCount + femaleCount + nonBinaryCount;
  if (memberCount > row.total) {
    throw new UkSourceParseError(
      PARLIAMENT_SEATS_SOURCE_ID,
      `${name} names ${String(memberCount)} members across ${String(row.total)} seats`
    );
  }
  return {
    party: {
      id: party.id,
      name,
      abbreviation: (party.abbreviation ?? '').trim(),
      backgroundColour: party.backgroundColour,
      foregroundColour: party.foregroundColour,
      isIndependent: party.isIndependentParty,
    },
    seatCount: row.total,
    maleCount,
    femaleCount,
    nonBinaryCount,
    unallocatedSeatCount: row.total - memberCount,
  };
}

/**
 * Parses a state-of-the-parties payload into the seats each party holds.
 *
 * A row the API cannot explain fails the parse rather than quietly shifting
 * the totals: a missing party, a blank name, a party with no seats, or the
 * same party listed twice all throw.
 *
 * @param payload - the API response, or the committed fixture of one
 * @returns one entry per party, in the order the API sent them
 */
export function parseParliamentPartySeats(payload: unknown): ParliamentPartySeats[] {
  const parsed = PARLIAMENT_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, parsed.error.message);
  }
  const rows = parsed.data.items ?? [];
  if (rows.length === 0) {
    throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, 'the house returned no parties');
  }
  const seenPartyIds = new Set<number>();
  const seats = rows.map((row) => {
    if (row.value === null) {
      throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, 'a party row carried no seat count');
    }
    const entry = readParliamentPartySeats(row.value);
    if (seenPartyIds.has(entry.party.id)) {
      throw new UkSourceParseError(
        PARLIAMENT_SEATS_SOURCE_ID,
        `${entry.party.name} is listed more than once (party ${String(entry.party.id)})`
      );
    }
    seenPartyIds.add(entry.party.id);
    return entry;
  });
  return seats;
}

/**
 * Rolls a party list into the totals a page prints.
 *
 * @param seats - parties as parsed from the payload
 * @returns the seat total, the party count, the majority line, and the ranking
 */
export function summarizeParliamentPartySeats(
  seats: ParliamentPartySeats[]
): ParliamentSeatSummary {
  if (seats.length === 0) {
    throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, 'no parties to summarise');
  }
  const seatCount = seats.reduce((sum, entry) => sum + entry.seatCount, 0);
  const ordered = [...seats].sort((left, right) => {
    if (right.seatCount !== left.seatCount) {
      return right.seatCount - left.seatCount;
    }
    return left.party.name.localeCompare(right.party.name);
  });
  const largestParty = ordered[0];
  if (largestParty === undefined) {
    throw new UkSourceParseError(PARLIAMENT_SEATS_SOURCE_ID, 'no parties to rank');
  }
  return {
    seatCount,
    partyCount: ordered.length,
    majorityThreshold: Math.floor(seatCount / 2) + 1,
    partiesWithOneSeat: ordered.filter((entry) => entry.seatCount === 1).length,
    seats: ordered,
    largestParty,
  };
}

/**
 * Parses a state-of-the-parties payload straight into the summary a page prints.
 *
 * @param payload - the API response, or the committed fixture of one
 * @returns the seat total, the party count, the majority line, and the ranking
 */
export function parseParliamentSeats(payload: unknown): ParliamentSeatSummary {
  return summarizeParliamentPartySeats(parseParliamentPartySeats(payload));
}

/**
 * Reads the state of the parties in one house, the Commons by default.
 *
 * The API needs a date as well as a house and answers with the composition on
 * that date, so the caller's own date is the one asked for.
 *
 * @param options - the house, the date, and an optional fetch implementation
 * @returns the seat total, the party count, the majority line, and the ranking
 */
export async function fetchParliamentSeats(
  options: {
    house?: number;
    forDate?: string;
    now?: Date;
    fetchImpl?: typeof globalThis.fetch;
  } = {}
): Promise<ParliamentSeatSummary> {
  const house = options.house ?? PARLIAMENT_COMMONS_HOUSE;
  const forDate = options.forDate ?? formatParliamentQueryDate(options.now ?? new Date());
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const url = buildParliamentSeatsUrl(house, forDate);
  const response = await httpGet(PARLIAMENT_SEATS_SOURCE_ID, url, {
    fetchImpl,
    headers: { accept: 'application/json' },
  });
  return parseParliamentSeats(await response.json());
}

/** UK Parliament state of the parties, keyless. */
export const parliamentSeatsAdapter: UkDataAdapter<ParliamentSeatSummary> = {
  id: PARLIAMENT_SEATS_SOURCE_ID,
  name: 'UK Parliament state of the parties',
  auth: 'none',
  description:
    'Seats each party holds in the House of Commons, with the members counted behind them.',
  fetchLive: (options) =>
    fetchParliamentSeats(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: parseParliamentSeats,
  loadFixture: () => parseParliamentSeats(readFixtureJson('parliament-seats.json')),
};
