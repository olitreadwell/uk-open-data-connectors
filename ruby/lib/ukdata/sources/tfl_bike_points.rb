# frozen_string_literal: true

module Ukdata
  module_function

  TFL_BIKE_POINTS_URL = 'https://api.tfl.gov.uk/BikePoint'

  def tidy_station_name(name)
    name.gsub(/\s+/, ' ').gsub(/\s+,/, ',').strip
  end

  def tfl_station_properties(source, place)
    need_array(source, place['additionalProperties'], 'additionalProperties').to_h do |property|
      prop = need_hash(source, property)
      [prop['key'].to_s, prop['value'].to_s]
    end
  end

  def tfl_dock_counts(source, properties, name)
    %w[NbDocks NbBikes NbEBikes NbEmptyDocks].to_h do |key|
      raw = properties[key]
      raise UkSourceParseError.new(source, "no #{key} on #{name}") if raw.nil? || raw.strip.empty?

      begin
        [key, Integer(raw)]
      rescue ArgumentError
        raise UkSourceParseError.new(source, "#{key} \"#{raw}\" on #{name} is not a number")
      end
    end
  end

  def parse_tfl_bike_point(source, item)
    place = need_hash(source, item)
    name = tidy_station_name(need_string(source, place['commonName'], 'commonName'))
    properties = tfl_station_properties(source, place)
    return nil if properties.fetch('RemovalDate', '').strip != ''

    counts = tfl_dock_counts(source, properties, name)
    {
      'id' => need_string(source, place['id'], 'id'),
      'name' => name,
      'dockCount' => counts.fetch('NbDocks'),
      'bikeCount' => counts.fetch('NbBikes'),
      'electricBikeCount' => counts.fetch('NbEBikes'),
      'emptyDockCount' => counts.fetch('NbEmptyDocks'),
      'temporary' => properties['Temporary'] == 'true'
    }
  end

  def parse_tfl_bike_points(payload)
    source = 'tfl-bike-points'
    raise UkSourceParseError.new(source, 'expected a JSON array') unless payload.is_a?(Array)

    payload.filter_map { |item| parse_tfl_bike_point(source, item) }
  end

  def fetch_tfl_bike_points(api_key: nil, fetch_impl: nil)
    url = if api_key.nil?
            TFL_BIKE_POINTS_URL
          else
            "#{TFL_BIKE_POINTS_URL}?app_key=#{URI.encode_www_form_component(api_key)}"
          end
    parse_tfl_bike_points(get_json('tfl-bike-points', url, fetch_impl: fetch_impl))
  end
end
