# frozen_string_literal: true

module Ukdata
  module_function

  UK_PARLIAMENT_ODATA_BASE_URL = 'https://api.parliament.uk/odata'
  UK_PARLIAMENT_COMMITTEE_ENTITY = 'ParliamentaryCommittee'
  DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT = 20

  def build_uk_parliament_committee_url(limit: 20, offset: 0)
    raise ArgumentError, "limit must be a positive whole number, got #{limit}" if limit <= 0
    if offset.negative?
      raise ArgumentError,
            "offset must be a whole number of zero or more, got #{offset}"
    end

    params = [['$top', limit.to_s], ['$orderby', 'FormalBodyName']]
    params << ['$skip', offset.to_s] if offset.positive?
    base = "#{UK_PARLIAMENT_ODATA_BASE_URL}/#{UK_PARLIAMENT_COMMITTEE_ENTITY}"
    "#{base}?#{URI.encode_www_form(params)}"
  end

  def parse_uk_parliament_committee(source, raw, seen)
    row = need_hash(source, raw)
    local_id = need_string(source, row['LocalId'], 'LocalId')
    name = need_string(source, row['FormalBodyName'], 'FormalBodyName')
    if seen.key?(local_id)
      raise UkSourceParseError.new(source, "#{name} is listed more than once (#{local_id})")
    end

    seen[local_id] = true
    end_date = need_nullable_string(source, row['FormalBodyEndDate'], 'FormalBodyEndDate')
    {
      'localId' => local_id,
      'name' => name,
      'remit' => need_nullable_string(source, row['FormalBodyRemit'], 'FormalBodyRemit'),
      'mnisId' => need_nullable_string(source, row['FormalBodyMnisId'], 'FormalBodyMnisId'),
      'startDate' => need_nullable_string(source, row['FormalBodyStartDate'],
                                          'FormalBodyStartDate'),
      'endDate' => end_date,
      'isCurrent' => end_date.nil?
    }
  end

  def parse_uk_parliament_committees(payload)
    source = 'uk-parliament-committees'
    rows = need_array(source, need_hash(source, payload)['value'], 'value')
    seen = {}
    committees = rows.map { |row| parse_uk_parliament_committee(source, row, seen) }
    current_count = committees.count { |committee| committee['isCurrent'] }
    {
      'committees' => committees,
      'currentCount' => current_count,
      'endedCount' => committees.length - current_count
    }
  end

  def fetch_uk_parliament_committees(limit: DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT, offset: 0,
                                     fetch_impl: nil)
    parse_uk_parliament_committees(
      get_json('uk-parliament-committees',
               build_uk_parliament_committee_url(limit: limit, offset: offset),
               { 'accept' => 'application/json' }, fetch_impl: fetch_impl)
    )
  end
end
