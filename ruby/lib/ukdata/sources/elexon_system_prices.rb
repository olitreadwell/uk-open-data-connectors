# frozen_string_literal: true

require 'date'

module Ukdata
  module_function

  ELEXON_BMRS_API_BASE_URL = 'https://data.elexon.co.uk/bmrs/api/v1'
  ELEXON_SYSTEM_PRICES_PATH = 'balancing/settlement/system-prices'
  SETTLEMENT_DATE_PATTERN = /\A\d{4}-\d{2}-\d{2}\z/

  def elexon_last_sunday_utc(year, month)
    last_day = Time.utc(year, month, 31)
    last_day - (last_day.wday * 86_400)
  end

  def elexon_uk_date(moment)
    instant = moment.utc
    summer_start = elexon_last_sunday_utc(instant.year, 3) + 3600
    summer_end = elexon_last_sunday_utc(instant.year, 10) + 3600
    offset = instant >= summer_start && instant < summer_end ? 3600 : 0
    (instant + offset).strftime('%Y-%m-%d')
  end

  def previous_uk_settlement_date(moment)
    (Date.iso8601(elexon_uk_date(moment)) - 1).iso8601
  end

  def format_elexon_settlement_date(moment)
    elexon_uk_date(moment)
  end

  def build_elexon_system_prices_url(settlement_date)
    unless SETTLEMENT_DATE_PATTERN.match?(settlement_date)
      raise ArgumentError, "settlementDate must be YYYY-MM-DD, got #{settlement_date}"
    end

    parsed = Date.iso8601(settlement_date)
    unless parsed.iso8601 == settlement_date
      raise ArgumentError,
            "settlementDate is not a real date: #{settlement_date}"
    end

    "#{ELEXON_BMRS_API_BASE_URL}/#{ELEXON_SYSTEM_PRICES_PATH}/#{settlement_date}"
  rescue Date::Error
    raise ArgumentError, "settlementDate is not a real date: #{settlement_date}"
  end

  def parse_elexon_period(source, raw, settlement_date, seen)
    row = need_hash(source, raw)
    row_date = need_string(source, row['settlementDate'], 'settlementDate')
    if row_date != settlement_date
      raise UkSourceParseError.new(
        source,
        "the page carries more than one settlement date: #{settlement_date} and #{row_date}"
      )
    end

    period = need_int(source, row['settlementPeriod'], 'settlementPeriod')
    unless (1..50).cover?(period)
      raise UkSourceParseError.new(source,
                                   'settlementPeriod must be from 1 to 50')
    end
    if seen.key?(period)
      raise UkSourceParseError.new(source, "settlement period #{period} is listed more than once")
    end

    seen[period] = true
    {
      'settlementPeriod' => period,
      'startTime' => need_string(source, row['startTime'], 'startTime'),
      'createdDateTime' => need_string(source, row['createdDateTime'], 'createdDateTime'),
      'systemSellPrice' => need_number(source, row['systemSellPrice'], 'systemSellPrice'),
      'systemBuyPrice' => need_number(source, row['systemBuyPrice'], 'systemBuyPrice'),
      'priceDerivationCode' => need_string(source, row['priceDerivationCode'],
                                           'priceDerivationCode'),
      'netImbalanceVolume' => need_number(source, row['netImbalanceVolume'],
                                          'netImbalanceVolume'),
      'totalAcceptedOfferVolume' => need_number(source, row['totalAcceptedOfferVolume'],
                                                'totalAcceptedOfferVolume'),
      'totalAcceptedBidVolume' => need_number(source, row['totalAcceptedBidVolume'],
                                              'totalAcceptedBidVolume')
    }
  end

  def parse_elexon_system_prices(payload)
    source = 'elexon-system-prices'
    data = need_hash(source, payload)
    metadata = need_hash(source, data['metadata'])
    datasets = need_array(source, metadata['datasets'], 'datasets')
    raise UkSourceParseError.new(source, 'metadata carried no dataset id') if datasets.empty?

    dataset = need_string(source, datasets.first, 'datasets[0]')
    raise UkSourceParseError.new(source, 'metadata carried no dataset id') if dataset.empty?

    rows = need_array(source, data['data'], 'data')
    raise UkSourceParseError.new(source, 'the day carried no periods') if rows.empty?

    settlement_date = need_string(source, need_hash(source, rows.first)['settlementDate'],
                                  'settlementDate')
    unless SETTLEMENT_DATE_PATTERN.match?(settlement_date)
      raise UkSourceParseError.new(source, 'expected a settlementDate as YYYY-MM-DD')
    end

    seen = {}
    periods = rows.map do |row|
      parse_elexon_period(source, row, settlement_date, seen)
    end
    { 'dataset' => dataset, 'settlementDate' => settlement_date, 'periods' => periods }
  end

  def fetch_elexon_system_prices(settlement_date: nil, now: nil, fetch_impl: nil)
    selected = settlement_date || previous_uk_settlement_date(now || Time.now)
    parse_elexon_system_prices(
      get_json('elexon-system-prices', build_elexon_system_prices_url(selected),
               { 'accept' => 'application/json' }, fetch_impl: fetch_impl)
    )
  end
end
