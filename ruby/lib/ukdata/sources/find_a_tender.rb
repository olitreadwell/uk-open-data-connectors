# frozen_string_literal: true

module Ukdata
  module_function

  FIND_A_TENDER_RELEASE_PACKAGES_URL = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages'

  def parse_find_a_tender_releases(payload)
    source = 'find-a-tender'
    data = need_hash(source, payload)
    publisher = data['publisher'].is_a?(Hash) ? data['publisher']['name'].to_s.strip : ''
    licence = data['license'].is_a?(String) ? data['license'].strip : ''
    releases = need_array(source, data['releases'], 'releases').map do |raw|
      row = need_hash(source, raw)
      tender = row['tender'].is_a?(Hash) ? row['tender'] : {}
      buyer = row['buyer'].is_a?(Hash) ? row['buyer'] : {}
      value = tender['value'].is_a?(Hash) ? tender['value'] : {}
      {
        'ocid' => need_string(source, row['ocid'], 'ocid'),
        'id' => need_string(source, row['id'], 'id'),
        'date' => need_string(source, row['date'], 'date'),
        'tags' => need_array(source, row.fetch('tag') || [], 'tag'),
        'tenderTitle' => tender['title'].to_s,
        'tenderStatus' => tender['status'].to_s,
        'procurementMethod' => tender['procurementMethod'].to_s,
        'buyerName' => buyer['name'].to_s,
        'tenderValueAmount' => value['amount'],
        'publisher' => publisher,
        'licence' => licence
      }
    end
    {
      'uri' => need_string(source, data['uri'], 'uri'),
      'version' => need_string(source, data['version'], 'version'),
      'publishedDate' => need_string(source, data['publishedDate'], 'publishedDate'),
      'releases' => releases
    }
  end

  def fetch_find_a_tender_releases(limit: 10, fetch_impl: nil)
    url = "#{FIND_A_TENDER_RELEASE_PACKAGES_URL}?limit=#{limit}"
    parse_find_a_tender_releases(get_json('find-a-tender', url, fetch_impl: fetch_impl))
  end
end
