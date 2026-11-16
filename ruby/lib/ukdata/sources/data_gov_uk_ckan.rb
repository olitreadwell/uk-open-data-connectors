# frozen_string_literal: true

module Ukdata
  module_function

  DATA_GOV_UK_PACKAGE_SEARCH_URL = 'https://www.data.gov.uk/api/3/action/package_search'

  def parse_data_gov_uk_packages(payload)
    source = 'data-gov-uk-ckan'
    data = need_hash(source, payload)
    unless data['success'] == true
      raise UkSourceParseError.new(source, 'the catalogue reported a failure')
    end

    result = need_hash(source, data['result'])
    datasets = need_array(source, result['results'], 'results').map do |raw|
      row = need_hash(source, raw)
      organization = row['organization'].is_a?(Hash) ? row['organization'] : {}
      tags = row['tags'].is_a?(Array) ? row['tags'] : []
      {
        'name' => need_string(source, row['name'], 'name'),
        'title' => need_string(source, row['title'], 'title'),
        'publisher' => optional_text(organization['title']),
        'licenceId' => optional_text(row['license_id']),
        'resourceCount' => need_int(source, row['num_resources'], 'num_resources'),
        'modifiedAt' => row['metadata_modified'],
        'tags' => tags.filter_map do |tag|
          tag.is_a?(Hash) ? need_string(source, tag['name'], 'tag.name') : nil
        end
      }
    end
    { 'totalCount' => need_int(source, result['count'], 'count'), 'datasets' => datasets }
  end

  def fetch_data_gov_uk_packages(limit: 10, fetch_impl: nil)
    url = "#{DATA_GOV_UK_PACKAGE_SEARCH_URL}?rows=#{limit}"
    parse_data_gov_uk_packages(get_json('data-gov-uk-ckan', url, fetch_impl: fetch_impl))
  end
end
