# frozen_string_literal: true

module Ukdata
  module_function

  DEFAULT_FLOOD_STATION_REFERENCE = '1029TH'

  def flood_text(value)
    return '' if value.nil?
    return value.join(' / ') if value.is_a?(Array)

    value.to_s
  end

  def parse_flood_stations(payload)
    source = 'flood-monitoring'
    data = need_hash(source, payload)
    meta = data['meta'].is_a?(Hash) ? data['meta'] : {}
    publisher = flood_text(meta['publisher'])
    licence = flood_text(meta['licence'])
    need_array(source, data['items'], 'items').map do |item|
      row = need_hash(source, item)
      measures = need_array(source, row.fetch('measures', []), 'measures').map do |raw_measure|
        measure = need_hash(source, raw_measure)
        {
          'id' => need_string(source, measure['@id'], '@id'),
          'parameter' => need_string(source, measure['parameter'], 'parameter'),
          'parameterName' => need_string(source, measure['parameterName'], 'parameterName'),
          'qualifier' => need_string(source, measure['qualifier'], 'qualifier'),
          'unitName' => need_string(source, measure['unitName'], 'unitName'),
          'periodSeconds' => measure.fetch('period', 0).to_i
        }
      end
      {
        'id' => need_string(source, row['@id'], '@id'),
        'notation' => need_string(source, row['notation'], 'notation'),
        'label' => flood_text(row['label']),
        'riverName' => flood_text(row['riverName']),
        'catchmentName' => flood_text(row['catchmentName']),
        'publisher' => publisher,
        'licence' => licence,
        'latitude' => row['lat'],
        'longitude' => row['long'],
        'measures' => measures
      }
    end
  end

  def parse_flood_readings(payload)
    source = 'flood-monitoring'
    data = need_hash(source, payload)
    meta = data['meta'].is_a?(Hash) ? data['meta'] : {}
    publisher = flood_text(meta['publisher'])
    licence = flood_text(meta['licence'])
    need_array(source, data['items'], 'items').map do |item|
      row = need_hash(source, item)
      {
        'measureId' => need_string(source, row['measure'], 'measure'),
        'dateTime' => need_string(source, row['dateTime'], 'dateTime'),
        'value' => need_number(source, row['value'], 'value'),
        'publisher' => publisher,
        'licence' => licence
      }
    end
  end

  def fetch_flood_stations(limit: 25, fetch_impl: nil)
    url = "https://environment.data.gov.uk/flood-monitoring/id/stations?_limit=#{limit}"
    parse_flood_stations(get_json('flood-monitoring', url, fetch_impl: fetch_impl))
  end

  def fetch_flood_station_readings(station_reference: DEFAULT_FLOOD_STATION_REFERENCE, limit: 96,
                                   fetch_impl: nil)
    url = 'https://environment.data.gov.uk/flood-monitoring/id/stations/' \
          "#{station_reference}/readings?_limit=#{limit}&_sorted"
    parse_flood_readings(get_json('flood-monitoring', url, fetch_impl: fetch_impl))
  end
end
