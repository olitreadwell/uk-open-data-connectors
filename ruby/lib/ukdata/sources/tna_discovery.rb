# frozen_string_literal: true

module Ukdata
  module_function

  TNA_DISCOVERY_SEARCH_URL = 'https://discovery.nationalarchives.gov.uk/API/search/records'

  def parse_tna_discovery_records(payload)
    source = 'tna-discovery'
    data = need_hash(source, payload)
    records = need_array(source, data['records'], 'records').map do |item|
      row = need_hash(source, item)
      {
        'id' => need_string(source, row['id'], 'id'),
        'reference' => row['reference'].to_s,
        'title' => row['title'].to_s,
        'description' => row['description'].to_s,
        'coveringDates' => row['coveringDates'].to_s,
        'catalogueLevel' => row['catalogueLevel'],
        'department' => row['department'].to_s,
        'heldBy' => need_array(source, row.fetch('heldBy') || [], 'heldBy')
      }
    end
    { 'totalCount' => need_int(source, data['count'], 'count'), 'records' => records }
  end

  def fetch_tna_discovery_records(fetch_impl: nil)
    url = "#{TNA_DISCOVERY_SEARCH_URL}?sps.searchQuery=test"
    parse_tna_discovery_records(get_json('tna-discovery', url, { 'Accept' => 'application/json' },
                                         fetch_impl: fetch_impl))
  end
end
