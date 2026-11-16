# frozen_string_literal: true

module Ukdata
  module_function

  ONS_DATASETS_LIMIT = 1000
  ONS_TAXONOMY_PREFIX = 'https://api.beta.ons.gov.uk/v1/'

  def parse_ons_datasets(payload)
    source = 'ons-datasets'
    items = need_array(source, need_hash(source, payload)['items'], 'items')
    items.map do |item|
      row = need_hash(source, item)
      links = row['links'].is_a?(Hash) ? row['links'] : {}
      taxonomy = links['taxonomy'].is_a?(Hash) ? links['taxonomy'] : {}
      href = taxonomy['href']
      topic_path = if href.is_a?(String)
                     if href.start_with?(ONS_TAXONOMY_PREFIX)
                       href[ONS_TAXONOMY_PREFIX.length..]
                     else
                       href
                     end
                   else
                     ''
                   end
      {
        'id' => need_string(source, row['id'], 'id'),
        'title' => need_string(source, row['title'], 'title'),
        'state' => need_string(source, row['state'], 'state'),
        'lastUpdatedIso' => need_string(source, row['last_updated'], 'last_updated'),
        'isNationalStatistic' => row['national_statistic'],
        'keywords' => need_array(source, row.fetch('keywords', []), 'keywords'),
        'topicPath' => topic_path
      }
    end
  end

  def fetch_ons_datasets(limit: ONS_DATASETS_LIMIT, fetch_impl: nil)
    url = "https://api.beta.ons.gov.uk/v1/datasets?limit=#{limit}"
    parse_ons_datasets(get_json('ons-datasets', url, fetch_impl: fetch_impl))
  end
end
