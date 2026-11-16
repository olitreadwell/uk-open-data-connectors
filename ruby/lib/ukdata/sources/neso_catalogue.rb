# frozen_string_literal: true

module Ukdata
  module_function

  NESO_CATALOGUE_SEARCH_URL = 'https://api.neso.energy/api/3/action/package_search'
  DEFAULT_NESO_CATALOGUE_LIMIT = 20

  def build_neso_catalogue_url(limit: DEFAULT_NESO_CATALOGUE_LIMIT, query: nil, start: 0)
    raise ArgumentError, "limit must be a positive whole number, got #{limit}" if limit < 1
    if start.negative?
      raise ArgumentError, "start must be a whole number of zero or more, got #{start}"
    end

    params = [['rows', limit.to_s]]
    query_text = query.to_s.strip
    params << ['q', query_text] unless query_text.empty?
    params << ['start', start.to_s] if start.positive?
    "#{NESO_CATALOGUE_SEARCH_URL}?#{URI.encode_www_form(params)}"
  end

  def neso_catalogue_tags(source, value)
    return [] if value.nil?

    need_array(source, value, 'tags').map do |tag|
      need_string(source, need_hash(source, tag)['name'], 'tag.name')
    end
  end

  def neso_catalogue_dataset(source, raw)
    row = need_hash(source, raw)
    organization_value = row['organization']
    organization = organization_value.nil? ? {} : need_hash(source, organization_value)
    modified = row['metadata_modified']
    {
      'name' => need_string(source, row['name'], 'name'),
      'title' => need_string(source, row['title'], 'title'),
      'publisher' => optional_text(organization['title']),
      'licenceId' => optional_text(row['license_id']),
      'licenceTitle' => optional_text(row['license_title']),
      'licenceUrl' => optional_text(row['license_url']),
      'resourceCount' => need_int(source, row['num_resources'], 'num_resources'),
      'modifiedAt' => modified.nil? ? nil : need_string(source, modified, 'metadata_modified'),
      'tags' => neso_catalogue_tags(source, row['tags'])
    }
  end

  def parse_neso_catalogue(payload)
    source = 'neso-catalogue'
    data = need_hash(source, payload)
    unless data['success'] == true
      raise UkSourceParseError.new(source,
                                   'the catalogue reported a failure')
    end

    result = need_hash(source, data['result'])
    {
      'totalCount' => need_int(source, result['count'], 'count'),
      'datasets' => need_array(source, result['results'], 'results').map do |dataset|
        neso_catalogue_dataset(source, dataset)
      end
    }
  end

  def fetch_neso_catalogue(limit: DEFAULT_NESO_CATALOGUE_LIMIT, query: nil, start: 0,
                           fetch_impl: nil)
    parse_neso_catalogue(
      get_json('neso-catalogue',
               build_neso_catalogue_url(limit: limit, query: query, start: start),
               { 'accept' => 'application/json' }, fetch_impl: fetch_impl)
    )
  end
end
