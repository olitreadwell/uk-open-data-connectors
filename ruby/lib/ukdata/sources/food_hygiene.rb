# frozen_string_literal: true

module Ukdata
  module_function

  FSA_AUTHORITIES_URL = 'https://api.ratings.food.gov.uk/Authorities/basic'
  FSA_API_VERSION_HEADER = 'x-api-version'
  FSA_API_VERSION = '2'
  FOOD_HYGIENE_SCHEMES = { 1 => 'fhrs', 2 => 'fhis' }.freeze

  def parse_food_hygiene_authority(source, item)
    row = need_hash(source, item)
    scheme_type = need_int(source, row['SchemeType'], 'SchemeType')
    unless FOOD_HYGIENE_SCHEMES.key?(scheme_type)
      raise UkSourceParseError.new(source, "unknown scheme type #{scheme_type}")
    end

    {
      'localAuthorityId' => need_int(source, row['LocalAuthorityId'], 'LocalAuthorityId'),
      'localAuthorityCode' => need_string(source, row['LocalAuthorityIdCode'],
                                          'LocalAuthorityIdCode'),
      'localAuthorityName' => need_string(source, row['Name'], 'Name'),
      'establishmentCount' => need_int(source, row['EstablishmentCount'], 'EstablishmentCount'),
      'scheme' => FOOD_HYGIENE_SCHEMES.fetch(scheme_type)
    }
  end

  def parse_food_hygiene_authorities(payload)
    source = 'fsa-food-hygiene'
    authorities = need_array(source, need_hash(source, payload)['authorities'], 'authorities')
    authorities.map { |item| parse_food_hygiene_authority(source, item) }
  end

  def fetch_food_hygiene_authorities(fetch_impl: nil)
    payload = get_json('fsa-food-hygiene', FSA_AUTHORITIES_URL,
                       { FSA_API_VERSION_HEADER => FSA_API_VERSION }, fetch_impl: fetch_impl)
    parse_food_hygiene_authorities(payload)
  end
end
