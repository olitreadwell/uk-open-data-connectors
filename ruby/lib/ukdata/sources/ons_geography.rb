# frozen_string_literal: true

module Ukdata
  module_function

  ONS_GEOGRAPHY_SEARCH_URL = 'https://geoportal.statistics.gov.uk/api/search/v1/collections/all/items'
  DEFAULT_ONS_GEOGRAPHY_LIMIT = 20

  def build_ons_geography_search_url(limit: DEFAULT_ONS_GEOGRAPHY_LIMIT, query: nil,
                                     start_index: 0)
    raise ArgumentError, "limit must be a positive whole number, got #{limit}" if limit < 1
    if start_index.negative?
      raise ArgumentError,
            "startIndex must be a whole number of zero or more, got #{start_index}"
    end

    params = [['limit', limit.to_s]]
    query_text = query.to_s.strip
    params << ['q', query_text] unless query_text.empty?
    params << ['startindex', start_index.to_s] if start_index.positive?
    "#{ONS_GEOGRAPHY_SEARCH_URL}?#{URI.encode_www_form(params)}"
  end

  def ons_iso_timestamp(source, value)
    return nil if value.nil?
    unless value.is_a?(Numeric)
      raise UkSourceParseError.new(source,
                                   'expected an epoch millisecond number')
    end

    Time.at(value / 1000.0).utc.strftime('%Y-%m-%dT%H:%M:%S.%LZ')
  rescue RangeError
    nil
  end

  def ons_next_start_index(source, links)
    return nil if links.nil?

    need_array(source, links, 'links').each do |raw|
      link = need_hash(source, raw)
      rel = need_string(source, link['rel'], 'rel')
      href = need_string(source, link['href'], 'href')
      next unless rel == 'next'

      params = URI.decode_www_form(URI(href).query.to_s).to_h
      value = params['startindex']
      return nil if value.nil?

      index = Integer(value, 10)
      return index >= 0 ? index : nil
    rescue ArgumentError, URI::InvalidURIError
      return nil
    end
    nil
  end

  def ons_dataset(source, raw)
    feature = need_hash(source, raw)
    properties = need_hash(source, feature['properties'])
    geometry_value = feature['geometry']
    geometry = geometry_value.nil? ? nil : need_hash(source, geometry_value)
    tags_value = properties['tags']
    tags = if tags_value.nil?
             []
           else
             need_array(source, tags_value, 'tags').map do |tag|
               need_string(source, tag, 'tags')
             end
           end
    description = need_nullable_string(source, properties['description'], 'description')
    licence_info = need_nullable_string(source, properties['licenseInfo'], 'licenseInfo')
    {
      'id' => need_string(source, feature['id'], 'id'),
      'title' => need_string(source, properties['title'], 'title'),
      'type' => need_nullable_string(source, properties['type'], 'type'),
      'owner' => need_nullable_string(source, properties['owner'], 'owner'),
      'url' => need_nullable_string(source, properties['url'], 'url'),
      'description' => description.nil? ? nil : optional_text(strip_markup(description)),
      'licence' => need_nullable_string(source, properties['license'], 'license'),
      'licenceInfo' => licence_info.nil? ? nil : optional_text(strip_markup(licence_info)),
      'tags' => tags.reject(&:empty?),
      'createdAt' => ons_iso_timestamp(source, properties['created']),
      'modifiedAt' => ons_iso_timestamp(source, properties['modified']),
      'geometryType' => geometry.nil? ? nil : need_string(source, geometry['type'], 'geometry.type')
    }
  end

  def parse_ons_geography_datasets(payload)
    source = 'ons-geography'
    data = need_hash(source, payload)
    unless data['type'] == 'FeatureCollection'
      raise UkSourceParseError.new(source, 'expected "type" to be FeatureCollection')
    end

    datasets = need_array(source, data['features'], 'features').map do |feature|
      ons_dataset(source, feature)
    end
    {
      'totalCount' => need_int(source, data['numberMatched'], 'numberMatched'),
      'returnedCount' => need_int(source, data['numberReturned'], 'numberReturned'),
      'nextStartIndex' => ons_next_start_index(source, data['links']),
      'datasets' => datasets
    }
  end

  def fetch_ons_geography_datasets(limit: DEFAULT_ONS_GEOGRAPHY_LIMIT, query: nil,
                                   start_index: 0, fetch_impl: nil)
    parse_ons_geography_datasets(
      get_json('ons-geography',
               build_ons_geography_search_url(limit: limit, query: query,
                                              start_index: start_index),
               { 'accept' => 'application/geo+json' }, fetch_impl: fetch_impl)
    )
  end
end
