# frozen_string_literal: true

require 'date'

module Ukdata
  module_function

  LAND_REGISTRY_PRICE_PAID_URL =
    'https://landregistry.data.gov.uk/data/ppi/transaction-record.json'
  DEFAULT_LAND_REGISTRY_POSTCODE = 'M1 1AE'
  DEFAULT_LAND_REGISTRY_PAGE_SIZE = 20
  LAND_POSTCODE_PATTERN = /\A[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}\z/
  LAND_ISO_DATE_PATTERN = /\A(\d{4})-(\d{2})-(\d{2})\z/
  LAND_TRANSACTION_DATE_PATTERN = /\A[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\z/
  LAND_MONTHS = {
    'jan' => 0, 'feb' => 1, 'mar' => 2, 'apr' => 3, 'may' => 4, 'jun' => 5,
    'jul' => 6, 'aug' => 7, 'sep' => 8, 'oct' => 9, 'nov' => 10, 'dec' => 11
  }.freeze
  LAND_PROPERTY_TYPES = {
    'detached' => 'detached',
    'semi-detached' => 'semi-detached',
    'terraced' => 'terraced',
    'flat-maisonette' => 'flat-maisonette',
    'other' => 'otherPropertyType'
  }.freeze

  def land_assert_iso_date(value, field)
    match = LAND_ISO_DATE_PATTERN.match(value)
    raise ArgumentError, "#{field} must be a date written as YYYY-MM-DD, got #{value}" if match.nil?

    parsed = Date.new(match[1].to_i, match[2].to_i, match[3].to_i)
    unless parsed.iso8601 == value
      raise ArgumentError, "#{field} is not a real calendar date, got #{value}"
    end
  rescue Date::Error
    raise ArgumentError, "#{field} is not a real calendar date, got #{value}"
  end

  def land_transaction_date(value)
    match = value.is_a?(String) ? LAND_TRANSACTION_DATE_PATTERN.match(value.strip) : nil
    month = match ? LAND_MONTHS[match[2].downcase] : nil
    if match.nil? || month.nil?
      raise UkSourceParseError.new('hm-land-registry-price-paid',
                                   "the record wrote #{value.inspect} for transactionDate")
    end

    Date.new(match[3].to_i, month + 1, match[1].to_i).iso8601
  rescue Date::Error
    raise UkSourceParseError.new('hm-land-registry-price-paid',
                                 "the record wrote #{value.inspect} for transactionDate")
  end

  def normalize_land_registry_postcode(postcode)
    cleaned = postcode.strip.upcase.gsub(/\s+/, '')
    unless LAND_POSTCODE_PATTERN.match?(cleaned)
      raise ArgumentError, "postcode is not a full UK postcode, got #{postcode.inspect}"
    end

    "#{cleaned[0...-3]} #{cleaned[-3..]}"
  end

  def land_query_params(**options)
    postcode = options.fetch(:postcode, DEFAULT_LAND_REGISTRY_POSTCODE)
    property_type = options[:property_type]
    from_date = options[:from_date]
    to_date = options[:to_date]
    limit = options.fetch(:limit, DEFAULT_LAND_REGISTRY_PAGE_SIZE)
    page = options.fetch(:page, 1)
    order = options.fetch(:order, 'newest')
    params = [['_pageSize', limit.to_s],
              ['_sort', order == 'oldest' ? 'transactionDate' : '-transactionDate']]
    params << ['_page', (page - 1).to_s] if page > 1
    params << ['propertyAddress.postcode', normalize_land_registry_postcode(postcode)]
    unless property_type.nil?
      params << ['propertyType',
                 "http://landregistry.data.gov.uk/def/common/#{LAND_PROPERTY_TYPES[property_type]}"]
    end
    params << ['min-transactionDate', from_date] unless from_date.nil?
    params << ['max-transactionDate', to_date] unless to_date.nil?
    params
  end

  def build_land_registry_price_paid_url(**options)
    postcode = options.fetch(:postcode, DEFAULT_LAND_REGISTRY_POSTCODE)
    property_type = options[:property_type]
    from_date = options[:from_date]
    to_date = options[:to_date]
    limit = options.fetch(:limit, DEFAULT_LAND_REGISTRY_PAGE_SIZE)
    page = options.fetch(:page, 1)
    order = options.fetch(:order, 'newest')
    raise ArgumentError, "limit must be a positive whole number, got #{limit}" if limit < 1
    raise ArgumentError, "page must be a positive whole number, got #{page}" if page < 1
    if !property_type.nil? && !LAND_PROPERTY_TYPES.key?(property_type)
      raise ArgumentError,
            "propertyType must be one of #{LAND_PROPERTY_TYPES.keys.join(', ')}, " \
            "got #{property_type.inspect}"
    end
    land_assert_iso_date(from_date, 'fromDate') unless from_date.nil?
    land_assert_iso_date(to_date, 'toDate') unless to_date.nil?
    params = land_query_params(postcode: postcode, property_type: property_type,
                               from_date: from_date, to_date: to_date, limit: limit,
                               page: page, order: order)
    "#{LAND_REGISTRY_PRICE_PAID_URL}?#{URI.encode_www_form(params)}"
  end

  def land_read_text(source, value)
    return nil if value.nil?

    if value.is_a?(Array)
      raise UkSourceParseError.new(source, 'expected text') unless value.all?(String)

      text = value.join(' / ').strip
    elsif value.is_a?(String)
      text = value.strip
    else
      raise UkSourceParseError.new(source, 'expected text')
    end
    text.empty? ? nil : text
  end

  def land_read_label(source, resource, key)
    return nil if resource.nil?

    row = need_hash(source, resource)
    value = row[key]
    return nil if value.nil?
    return land_read_text(source, value) if value.is_a?(String)

    entries = value.is_a?(Array) ? value : [value]
    labels = entries.filter_map do |entry|
      label = need_string(source, need_hash(source, entry)['_value'], '_value').strip
      label unless label.empty?
    end
    labels.empty? ? nil : labels.join(' / ')
  end

  def land_resource_label(source, resource, key)
    land_read_label(source, resource, 'prefLabel') || land_read_label(source, resource, key)
  end

  def land_address(source, value)
    address = value.nil? ? {} : need_hash(source, value)
    {
      'paon' => land_read_text(source, address['paon']),
      'saon' => land_read_text(source, address['saon']),
      'street' => land_read_text(source, address['street']),
      'locality' => land_read_text(source, address['locality']),
      'town' => land_read_text(source, address['town']),
      'district' => land_read_text(source, address['district']),
      'county' => land_read_text(source, address['county']),
      'postcode' => land_read_text(source, address['postcode'])
    }
  end

  def land_transaction(source, raw)
    item = need_hash(source, raw)
    price = need_number(source, item['pricePaid'], 'pricePaid')
    raise UkSourceParseError.new(source, 'pricePaid must be zero or more') if price.negative?

    new_build = item['newBuild']
    unless new_build.nil? || [true, false].include?(new_build)
      raise UkSourceParseError.new(source, 'expected "newBuild" to be true or false')
    end

    {
      'id' => need_string(source, item['transactionId'], 'transactionId'),
      'recordUrl' => need_nullable_string(source, item['_about'], '_about'),
      'transactionDate' => land_transaction_date(item['transactionDate']),
      'pricePaid' => price,
      'propertyType' => land_resource_label(source, item['propertyType'], 'label'),
      'estateType' => land_resource_label(source, item['estateType'], 'label'),
      'newBuild' => new_build,
      'recordStatus' => land_resource_label(source, item['recordStatus'], 'label'),
      'transactionCategory' => land_resource_label(source, item['transactionCategory'], 'label'),
      'address' => land_address(source, item['propertyAddress'])
    }
  end

  def parse_land_registry_price_paid(payload)
    source = 'hm-land-registry-price-paid'
    result = need_hash(source, need_hash(source, payload)['result'])
    items_value = result['items']
    items = items_value.nil? ? [] : need_array(source, items_value, 'items')
    transactions = items.map { |item| land_transaction(source, item) }
    page = result['page'].nil? ? 0 : need_int(source, result['page'], 'page')
    items_per_page = if result['itemsPerPage'].nil?
                       transactions.length
                     else
                       need_int(source, result['itemsPerPage'], 'itemsPerPage')
                     end
    next_page_url = need_nullable_string(source, result['next'], 'next')
    {
      'page' => page + 1,
      'itemsPerPage' => items_per_page,
      'hasNextPage' => !next_page_url.nil?,
      'nextPageUrl' => next_page_url,
      'transactions' => transactions
    }
  end

  def fetch_land_registry_price_paid_transactions(**options)
    fetch_impl = options.delete(:fetch_impl)
    parse_land_registry_price_paid(
      get_json(
        'hm-land-registry-price-paid',
        build_land_registry_price_paid_url(**options),
        { 'accept' => 'application/json' },
        fetch_impl: fetch_impl
      )
    )
  end
end
