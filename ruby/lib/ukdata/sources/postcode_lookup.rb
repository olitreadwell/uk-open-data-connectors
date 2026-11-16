# frozen_string_literal: true

module Ukdata
  module_function

  POSTCODES_IO_BASE_URL = 'https://api.postcodes.io/postcodes/'

  def build_postcode_lookup_url(postcode)
    "#{POSTCODES_IO_BASE_URL}#{URI.encode_www_form_component(postcode)}"
  end

  def parse_postcode_lookup(payload)
    source = 'postcode-lookup'
    result = need_hash(source, need_hash(source, payload)['result'])
    {
      'postcode' => need_string(source, result['postcode'], 'postcode'),
      'country' => need_string(source, result['country'], 'country'),
      'region' => result['region'],
      'adminDistrict' => result['admin_district'],
      'adminWard' => result['admin_ward'],
      'parliamentaryConstituency' => result['parliamentary_constituency'],
      'latitude' => need_number(source, result['latitude'], 'latitude'),
      'longitude' => need_number(source, result['longitude'], 'longitude'),
      'nhsHa' => result['nhs_ha']
    }
  end

  def fetch_postcode_lookup(postcode: 'SW1A1AA', fetch_impl: nil)
    parse_postcode_lookup(get_json('postcode-lookup', build_postcode_lookup_url(postcode),
                                   fetch_impl: fetch_impl))
  end
end
