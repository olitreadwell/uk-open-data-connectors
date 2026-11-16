# frozen_string_literal: true

module Ukdata
  module_function

  EXPLORE_EDUCATION_PUBLICATIONS_URL = 'https://api.education.gov.uk/statistics/v1/publications'

  def parse_explore_education_publications(payload)
    source = 'explore-education-statistics'
    data = need_hash(source, payload)
    paging = need_hash(source, data['paging'])
    {
      'page' => need_int(source, paging['page'], 'page'),
      'pageSize' => need_int(source, paging['pageSize'], 'pageSize'),
      'totalResults' => need_int(source, paging['totalResults'], 'totalResults'),
      'totalPages' => need_int(source, paging['totalPages'], 'totalPages'),
      'publications' => need_array(source, data['results'], 'results').map do |item|
        row = need_hash(source, item)
        {
          'id' => need_string(source, row['id'], 'id'),
          'title' => need_string(source, row['title'], 'title'),
          'slug' => need_string(source, row['slug'], 'slug'),
          'summary' => row['summary'].to_s,
          'lastPublishedIso' => need_string(source, row['lastPublished'], 'lastPublished')
        }
      end
    }
  end

  def fetch_explore_education_publications(page: 1, page_size: 20, fetch_impl: nil)
    url = "#{EXPLORE_EDUCATION_PUBLICATIONS_URL}?page=#{page}&pageSize=#{page_size}"
    parse_explore_education_publications(get_json('explore-education-statistics', url,
                                                  fetch_impl: fetch_impl))
  end
end
