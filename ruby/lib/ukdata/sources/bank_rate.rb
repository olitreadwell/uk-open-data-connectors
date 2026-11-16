# frozen_string_literal: true

module Ukdata
  module_function

  BANK_RATE_SERIES_CODE = 'IUDBEDR'
  BANK_RATE_CSV_URL = 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp'
  BANK_RATE_FIRST_QUERY_DATE = '02/Jan/1975'
  BANK_RATE_MONTHS = %w[Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec].freeze

  def format_bank_rate_query_date(day)
    month = BANK_RATE_MONTHS.fetch(day.month - 1)
    format('%<day>02d/%<month>s/%<year>04d', day: day.day, month: month, year: day.year)
  end

  def build_bank_rate_csv_url(to_query_date)
    query = URI.encode_www_form(
      'csv.x' => 'yes', 'Datefrom' => BANK_RATE_FIRST_QUERY_DATE,
      'Dateto' => to_query_date, 'SeriesCodes' => BANK_RATE_SERIES_CODE,
      'CSVF' => 'TN', 'UsingCodes' => 'Y', 'VPD' => 'Y', 'VFD' => 'N'
    )
    "#{BANK_RATE_CSV_URL}?#{query}"
  end

  def parse_bank_rate_date(source, raw_date)
    pieces = raw_date.split
    unless pieces.length == 3 && BANK_RATE_MONTHS.include?(pieces[1])
      raise UkSourceParseError.new(source, "\"#{raw_date}\" is not a database date")
    end

    day, month_name, year = pieces
    unless day.match?(/\A\d{1,2}\z/) && year.match?(/\A\d{4}\z/)
      raise UkSourceParseError.new(source, "\"#{raw_date}\" is not a database date")
    end

    month = BANK_RATE_MONTHS.index(month_name) + 1
    format('%<year>04d-%<month>02d-%<day>02d', year: year.to_i, month: month, day: day.to_i)
  end

  def parse_bank_rate_number(source, raw_rate)
    raise UkSourceParseError.new(source, 'the row carries no rate') if raw_rate.strip.empty?

    Float(raw_rate)
  rescue ArgumentError
    raise UkSourceParseError.new(source, 'the row carries no rate')
  end

  def parse_bank_rate_row(source, row, previous)
    parts = row.split(',')
    raise UkSourceParseError.new(source, 'expected a date and a rate') unless parts.length == 2

    iso_date = parse_bank_rate_date(source, parts[0])
    raise UkSourceParseError.new(source, 'the dates do not follow forwards') if iso_date <= previous

    [iso_date, parse_bank_rate_number(source, parts[1])]
  end

  def parse_bank_rate_csv(csv_text)
    source = 'bank-rate'
    raise UkSourceParseError.new(source, 'expected CSV text') unless csv_text.is_a?(String)

    rows = csv_text.lines.map(&:strip).reject(&:empty?)
    header = rows.first.to_s.split(',')
    unless header[0] == 'DATE' && header[1] == BANK_RATE_SERIES_CODE
      raise UkSourceParseError.new(source, 'the body does not name the Bank Rate series')
    end

    observations = []
    previous = ''
    rows.drop(1).each do |row|
      iso_date, rate = parse_bank_rate_row(source, row, previous)
      previous = iso_date
      observations << { 'date' => iso_date, 'ratePercent' => rate }
    end
    raise UkSourceParseError.new(source, 'the series carried no readings') if observations.empty?

    observations
  end

  def fetch_bank_rate_observations(now: nil, fetch_impl: nil)
    today = (now || Time.now.utc).to_date
    url = build_bank_rate_csv_url(format_bank_rate_query_date(today))
    parse_bank_rate_csv(get_text('bank-rate', url, fetch_impl: fetch_impl))
  end
end
