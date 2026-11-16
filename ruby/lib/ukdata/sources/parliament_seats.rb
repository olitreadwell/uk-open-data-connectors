# frozen_string_literal: true

module Ukdata
  module_function

  PARLIAMENT_MEMBERS_API_BASE_URL = 'https://members-api.parliament.uk/api'

  def parse_parliament_party(source, value)
    party = value['party']
    raise UkSourceParseError.new(source, 'a party row carried no party') unless party.is_a?(Hash)

    name = party['name'].to_s.strip
    raise UkSourceParseError.new(source, 'a party row carried no name') if name.empty?

    party_data = {
      'id' => need_int(source, party['id'], 'id'),
      'name' => name,
      'abbreviation' => party['abbreviation'].to_s.strip,
      'backgroundColour' => party['backgroundColour'],
      'foregroundColour' => party['foregroundColour'],
      'isIndependent' => party['isIndependentParty'] == true
    }
    [party_data, name]
  end

  def parse_parliament_party_seats(source, raw_item, seen)
    item = need_hash(source, raw_item)
    value = item['value']
    unless value.is_a?(Hash)
      raise UkSourceParseError.new(source, 'a party row carried no seat count')
    end

    party, name = parse_parliament_party(source, value)
    party_id = party.fetch('id')
    raise UkSourceParseError.new(source, "#{name} is listed more than once") if seen.key?(party_id)

    seen[party_id] = true
    total = need_int(source, value['total'], 'total')
    raise UkSourceParseError.new(source, "#{name} holds #{total} seats") if total <= 0

    male = value['male'].to_i
    female = value['female'].to_i
    non_binary = value['nonBinary'].to_i
    members = male + female + non_binary
    raise UkSourceParseError.new(source, "#{name} names more members than seats") if members > total

    {
      'party' => party,
      'seatCount' => total,
      'maleCount' => male,
      'femaleCount' => female,
      'nonBinaryCount' => non_binary,
      'unallocatedSeatCount' => total - members
    }
  end

  def summarize_parliament_seats(seats)
    ordered = seats.sort_by { |item| [-item['seatCount'], item['party']['name']] }
    seat_count = seats.sum { |item| item['seatCount'] }
    {
      'seatCount' => seat_count,
      'partyCount' => ordered.length,
      'majorityThreshold' => (seat_count / 2) + 1,
      'partiesWithOneSeat' => ordered.count { |item| item['seatCount'] == 1 },
      'seats' => ordered,
      'largestParty' => ordered.first
    }
  end

  def parse_parliament_seats(payload)
    source = 'parliament-seats'
    items = need_array(source, need_hash(source, payload)['items'], 'items')
    raise UkSourceParseError.new(source, 'the house returned no parties') if items.empty?

    seen = {}
    seats = items.map { |item| parse_parliament_party_seats(source, item, seen) }
    summarize_parliament_seats(seats)
  end

  def last_sunday_utc(year, month)
    last_day = Time.utc(year, month, 31)
    last_day - (last_day.wday * 86_400)
  end

  def format_parliament_query_date(moment)
    instant = moment.utc
    summer_start = last_sunday_utc(instant.year, 3) + 3600
    summer_end = last_sunday_utc(instant.year, 10) + 3600
    offset = instant >= summer_start && instant < summer_end ? 3600 : 0
    (instant + offset).strftime('%Y-%m-%d')
  end

  def fetch_parliament_seats(fetch_impl: nil)
    today = format_parliament_query_date(Time.now)
    url = "#{PARLIAMENT_MEMBERS_API_BASE_URL}/Parties/StateOfTheParties/1/#{today}"
    parse_parliament_seats(get_json('parliament-seats', url, { 'accept' => 'application/json' },
                                    fetch_impl: fetch_impl))
  end
end
