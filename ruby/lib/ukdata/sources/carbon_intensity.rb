# frozen_string_literal: true

module Ukdata
  module_function

  CARBON_INTENSITY_RANGE_URL = 'https://api.carbonintensity.org.uk/intensity'
  CARBON_INTENSITY_INDEX_BANDS = ['very low', 'low', 'moderate', 'high', 'very high'].freeze
  CARBON_INSTANT_PATTERN = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\z/

  def instant(value)
    Time.strptime("#{value} UTC", '%Y-%m-%dT%H:%MZ %Z')
  end

  def resolve_carbon_intensity_window(window_days: 30, now: nil)
    unless window_days.between?(1, 30)
      raise UkSourceParseError.new('carbon-intensity', 'the window must be between 1 and 30 days')
    end

    moment = now || Time.now.utc
    today = Time.utc(moment.year, moment.month, moment.day)
    to = today - 86_400
    from = to - (window_days * 86_400)
    { 'from' => from.strftime('%Y-%m-%dT%H:%MZ'), 'to' => to.strftime('%Y-%m-%dT%H:%MZ') }
  end

  def build_carbon_intensity_window_url(window)
    "#{CARBON_INTENSITY_RANGE_URL}/#{window.fetch('from')}/#{window.fetch('to')}"
  end

  def parse_carbon_period(source, raw, previous_from)
    row = need_hash(source, raw)
    from_text = need_string(source, row['from'], 'from')
    to_text = need_string(source, row['to'], 'to')
    unless CARBON_INSTANT_PATTERN.match?(from_text) && CARBON_INSTANT_PATTERN.match?(to_text)
      raise UkSourceParseError.new(source, 'expected an instant as YYYY-MM-DDThh:mmZ')
    end

    start = instant(from_text)
    finish = instant(to_text)
    unless finish - start == 1800
      raise UkSourceParseError.new(source, "the half hour starting #{from_text} is not 30 minutes")
    end
    if previous_from && start <= previous_from
      raise UkSourceParseError.new(source, "the readings do not move forwards at #{from_text}")
    end

    intensity = need_hash(source, row['intensity'])
    actual = intensity['actual']
    if actual.nil?
      raise UkSourceParseError.new(source, "the half hour starting #{from_text} has no actual")
    end

    grade = need_string(source, intensity['index'], 'index')
    unless CARBON_INTENSITY_INDEX_BANDS.include?(grade)
      raise UkSourceParseError.new(source, "unrecognised intensity grade #{grade.inspect}")
    end

    period = {
      'from' => from_text,
      'to' => to_text,
      'intensity' => need_number(source, actual, 'actual'),
      'index' => grade
    }
    [period, start]
  end

  def summarize_carbon_periods(periods)
    total = periods.sum { |period| period['intensity'] }
    {
      'periodCount' => periods.length,
      'dayCount' => periods.length / 48,
      'firstPeriodFrom' => periods.first['from'],
      'lastPeriodTo' => periods.last['to'],
      'averageIntensity' => (total.to_f / periods.length).round,
      'lowestPeriod' => periods.min_by { |period| period['intensity'] },
      'highestPeriod' => periods.max_by { |period| period['intensity'] },
      'bandCounts' => CARBON_INTENSITY_INDEX_BANDS.map do |band|
        { 'index' => band, 'periodCount' => periods.count { |period| period['index'] == band } }
      end,
      'periods' => periods
    }
  end

  def parse_carbon_intensity_window(payload)
    source = 'carbon-intensity'
    responses = need_array(source, need_hash(source, payload)['data'], 'data')
    raise UkSourceParseError.new(source, 'the window returned no readings') if responses.empty?

    previous_from = nil
    periods = responses.map do |raw|
      period, previous_from = parse_carbon_period(source, raw, previous_from)
      period
    end
    summarize_carbon_periods(periods)
  end

  def fetch_carbon_intensity_window(now: nil, fetch_impl: nil)
    window = resolve_carbon_intensity_window(now: now)
    url = build_carbon_intensity_window_url(window)
    data = need_hash('carbon-intensity', get_json('carbon-intensity', url, fetch_impl: fetch_impl))
    start = instant(window.fetch('from'))
    filtered = need_array('carbon-intensity', data['data'], 'data').select do |item|
      item.is_a?(Hash) && item['from'].is_a?(String) && instant(item['from']) >= start
    end
    parse_carbon_intensity_window('data' => filtered)
  end
end
