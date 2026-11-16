# frozen_string_literal: true

module Ukdata
  module_function

  NESO_DATASTORE_SEARCH_URL = 'https://api.neso.energy/api/3/action/datastore_search'
  NESO_GENERATION_MIX_RESOURCE_ID = 'f93d1835-75bc-43e5-84ad-12472b180a98'
  NESO_GENERATION_FUELS = %w[GAS COAL NUCLEAR WIND WIND_EMB HYDRO IMPORTS BIOMASS OTHER SOLAR
                             STORAGE].freeze
  NESO_DATETIME_PATTERN = /\A\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00\z/

  def build_neso_generation_mix_url(half_hours: 336, resource_id: NESO_GENERATION_MIX_RESOURCE_ID)
    unless half_hours.between?(1, 3360)
      raise UkSourceParseError.new('neso-generation-mix',
                                   'the half-hour window is outside 1 to 3360')
    end

    query = URI.encode_www_form('resource_id' => resource_id, 'sort' => 'DATETIME desc',
                                'limit' => half_hours)
    "#{NESO_DATASTORE_SEARCH_URL}?#{query}"
  end

  def parse_neso_half_hour(source, raw, seen)
    row = need_hash(source, raw)
    moment = need_string(source, row['DATETIME'], 'DATETIME')
    unless NESO_DATETIME_PATTERN.match?(moment)
      raise UkSourceParseError.new(source, "expected a half hour, got #{moment.inspect}")
    end
    if seen.key?(moment)
      raise UkSourceParseError.new(source, "two rows for the half hour starting #{moment}")
    end

    seen[moment] = true
    generation = need_number(source, row['GENERATION'], 'GENERATION')
    carbon = need_number(source, row['CARBON_INTENSITY'], 'CARBON_INTENSITY')
    if generation <= 0 || carbon <= 0
      raise UkSourceParseError.new(source, "the half hour starting #{moment} has no positive total")
    end

    {
      'datetime' => moment,
      'totalMegawatts' => generation,
      'carbonIntensity' => carbon,
      'lowCarbonMegawatts' => need_number(source, row['LOW_CARBON'], 'LOW_CARBON'),
      'fuels' => NESO_GENERATION_FUELS.map do |fuel|
        { 'fuel' => fuel, 'megawatts' => need_number(source, row[fuel], fuel) }
      end
    }
  end

  def validate_neso_half_hours(source, half_hours)
    half_hours.each_cons(2) do |previous, current|
      gap = Time.strptime(current['datetime'], '%Y-%m-%dT%H:%M:%S') -
            Time.strptime(previous['datetime'], '%Y-%m-%dT%H:%M:%S')
      unless gap == 1800
        raise UkSourceParseError.new(source, 'the readings jump by more than half an hour')
      end
    end
  end

  def neso_fuel_megawatts(half_hours, fuel)
    half_hours.map do |item|
      item['fuels'].find { |reading| reading['fuel'] == fuel }['megawatts']
    end
  end

  def summarize_neso_fuel_shares(half_hours, total_megawatts)
    shares = NESO_GENERATION_FUELS.map do |fuel|
      readings = neso_fuel_megawatts(half_hours, fuel)
      megawatts = readings.sum
      {
        'fuel' => fuel,
        'averageMegawatts' => (megawatts.to_f / half_hours.length).round,
        'peakMegawatts' => readings.max,
        'sharePercent' => (megawatts.to_f / total_megawatts * 1000).round / 10.0
      }
    end
    shares.sort_by! { |item| -item['averageMegawatts'] }
    shares
  end

  def summarize_neso_generation_mix(half_hours)
    count = half_hours.length
    total_megawatts = half_hours.sum { |item| item['totalMegawatts'] }
    low_carbon = half_hours.sum { |item| item['lowCarbonMegawatts'] }
    {
      'halfHourCount' => count,
      'firstHalfHourAt' => half_hours.first['datetime'],
      'lastHalfHourAt' => half_hours.last['datetime'],
      'averageTotalMegawatts' => (total_megawatts.to_f / count).round,
      'averageCarbonIntensity' => (half_hours.sum do |item|
        item['carbonIntensity']
      end.to_f / count).round,
      'lowCarbonSharePercent' => (low_carbon.to_f / total_megawatts * 1000).round / 10.0,
      'fuelShares' => summarize_neso_fuel_shares(half_hours, total_megawatts),
      'cleanestHalfHour' => half_hours.min_by { |item| item['carbonIntensity'] },
      'dirtiestHalfHour' => half_hours.max_by { |item| item['carbonIntensity'] },
      'halfHours' => half_hours
    }
  end

  def parse_neso_generation_mix(payload)
    source = 'neso-generation-mix'
    data = need_hash(source, payload)
    unless data['success'] == true
      raise UkSourceParseError.new(source, 'the datastore reported a failure')
    end

    result = need_hash(source, data['result'])
    records = need_array(source, result['records'], 'records')
    raise UkSourceParseError.new(source, 'the window returned no half hours') if records.empty?

    seen = {}
    half_hours = records.map { |raw| parse_neso_half_hour(source, raw, seen) }
    half_hours.sort_by! { |item| item['datetime'] }
    validate_neso_half_hours(source, half_hours)
    summarize_neso_generation_mix(half_hours)
  end

  def fetch_neso_generation_mix_window(half_hours: 336, fetch_impl: nil)
    url = build_neso_generation_mix_url(half_hours: half_hours)
    parse_neso_generation_mix(get_json('neso-generation-mix', url, fetch_impl: fetch_impl))
  end
end
