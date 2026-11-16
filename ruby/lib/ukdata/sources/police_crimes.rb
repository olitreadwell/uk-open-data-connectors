# frozen_string_literal: true

module Ukdata
  module_function

  POLICE_STREET_CRIMES_URL = 'https://data.police.uk/api/crimes-street/all-crime'
  POLICE_STREET_DATES_URL = 'https://data.police.uk/api/crimes-street-dates'
  POLICE_CRIME_CATEGORIES_URL = 'https://data.police.uk/api/crime-categories'
  DEFAULT_POLICE_CRIME_LOCATION = {
    'label' => 'Leeds city centre', 'latitude' => 53.7997, 'longitude' => -1.5492
  }.freeze
  POLICE_MONTH_PATTERN = /\A\d{4}-(0[1-9]|1[0-2])\z/

  def count_by_category(records, names_by_slug)
    grouped = records.group_by { |record| record['category'] }
    pairs = grouped.map do |slug, rows|
      { 'slug' => slug, 'name' => names_by_slug.fetch(slug, slug), 'recordCount' => rows.length }
    end
    pairs.sort_by { |item| [-item['recordCount'], item['name']] }
  end

  def count_by_outcome(records)
    grouped = records.group_by { |record| record['outcomeCategory'] }
    pairs = grouped.map do |outcome, rows|
      { 'outcome' => outcome, 'recordCount' => rows.length }
    end
    pairs.sort_by { |item| [-item['recordCount'], item['outcome'].to_s] }
  end

  def police_categories_by_slug(source, categories)
    names_by_slug = {}
    categories.each do |item|
      category = need_hash(source, item)
      slug = need_string(source, category['url'], 'url')
      names_by_slug[slug] ||= need_string(source, category['name'], 'name')
    end
    names_by_slug
  end

  def parse_police_record(source, raw_record, month, names_by_slug)
    record = need_hash(source, raw_record)
    unless record['month'] == month
      raise UkSourceParseError.new(source, "a record under #{month} carries another month")
    end

    slug = need_string(source, record['category'], 'category')
    unless names_by_slug.key?(slug)
      raise UkSourceParseError.new(source, "unrecognised crime type #{slug.inspect}")
    end

    outcome_status = record['outcome_status']
    outcome = if outcome_status.is_a?(Hash)
                need_string(source, outcome_status['category'], 'outcome_status')
              end
    { 'category' => slug, 'outcomeCategory' => outcome }
  end

  def parse_police_month(source, entry, names_by_slug)
    month = need_string(source, entry['month'], 'month')
    unless POLICE_MONTH_PATTERN.match?(month)
      raise UkSourceParseError.new(source, "expected a month as YYYY-MM, got #{month.inspect}")
    end

    records = need_array(source, entry['records'], 'records')
    if records.empty?
      raise UkSourceParseError.new(source, "the API returned no records for #{month}")
    end

    counted = records.map do |raw_record|
      parse_police_record(source, raw_record, month, names_by_slug)
    end
    month_summary = {
      'month' => month,
      'recordCount' => counted.length,
      'categoryCounts' => count_by_category(counted, names_by_slug)
    }
    [month_summary, counted]
  end

  def summarize_police_crime(all_records, month_counts, names_by_slug)
    by_month_size = month_counts.sort_by { |item| [-item['recordCount'], item['month']] }
    category_counts = count_by_category(all_records, names_by_slug)
    outcome_counts = count_by_outcome(all_records)
    {
      'monthCount' => month_counts.length,
      'recordCount' => all_records.length,
      'firstMonth' => month_counts.first['month'],
      'latestMonth' => month_counts.last['month'],
      'categoryCounts' => category_counts,
      'outcomeCounts' => outcome_counts,
      'months' => month_counts,
      'busiestMonth' => by_month_size.first,
      'quietestMonth' => by_month_size.last,
      'topCategory' => category_counts.first,
      'topOutcome' => outcome_counts.first
    }
  end

  def parse_police_crime_summary(payload)
    source = 'police-crimes'
    data = need_hash(source, payload)
    categories = need_array(source, data['categories'], 'categories')
    months = need_array(source, data['months'], 'months')
    raise UkSourceParseError.new(source, 'the window covers no months') if months.empty?

    names_by_slug = police_categories_by_slug(source, categories)
    ordered = months.map { |item| need_hash(source, item) }.sort_by { |row| row['month'].to_s }
    all_records = []
    month_counts = []
    previous_month = ''
    ordered.each do |entry|
      month_summary, counted = parse_police_month(source, entry, names_by_slug)
      month = month_summary['month']
      raise UkSourceParseError.new(source, "two answers for #{month}") if month == previous_month

      previous_month = month
      all_records.concat(counted)
      month_counts << month_summary
    end
    summarize_police_crime(all_records, month_counts, names_by_slug)
  end

  def build_police_street_crimes_url(latitude, longitude, month)
    "#{POLICE_STREET_CRIMES_URL}?#{URI.encode_www_form('lat' => latitude, 'lng' => longitude,
                                                       'date' => month)}"
  end

  def fetch_police_crime_summary(month_count: 12, fetch_impl: nil)
    dates = get_json('police-crimes', POLICE_STREET_DATES_URL, fetch_impl: fetch_impl)
    months = need_array('police-crimes', dates, 'dates').filter_map do |entry|
      value = entry.is_a?(Hash) ? entry['date'].to_s : ''
      value if POLICE_MONTH_PATTERN.match?(value)
    end
    categories = get_json('police-crimes', POLICE_CRIME_CATEGORIES_URL, fetch_impl: fetch_impl)
    responses = months.first(month_count).map do |month|
      url = build_police_street_crimes_url(DEFAULT_POLICE_CRIME_LOCATION['latitude'],
                                           DEFAULT_POLICE_CRIME_LOCATION['longitude'], month)
      { 'month' => month, 'records' => get_json('police-crimes', url, fetch_impl: fetch_impl) }
    end
    parse_police_crime_summary('categories' => categories, 'months' => responses)
  end
end
