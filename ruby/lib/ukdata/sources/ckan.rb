# frozen_string_literal: true

module Ukdata
  module_function

  def parse_package_list(source, payload)
    result = need_array(source, need_hash(source, payload)['result'], 'result')
    result.map { |name| { 'name' => need_string(source, name, 'package name') } }
  end

  def parse_london_datastore_packages(payload)
    parse_package_list('london-datastore', payload)
  end

  def fetch_london_datastore_packages(fetch_impl: nil)
    url = 'https://data.london.gov.uk/api/3/action/package_list'
    parse_london_datastore_packages(get_json('london-datastore', url, fetch_impl: fetch_impl))
  end

  def parse_public_health_scotland_datasets(payload)
    parse_package_list('public-health-scotland', payload)
  end

  def fetch_public_health_scotland_datasets(fetch_impl: nil)
    url = 'https://www.opendata.nhs.scot/api/3/action/package_list'
    parse_public_health_scotland_datasets(get_json('public-health-scotland', url,
                                                   fetch_impl: fetch_impl))
  end

  def parse_nhsbsa_ckan_packages(payload)
    parse_package_list('nhsbsa-ckan', payload)
  end

  def fetch_nhsbsa_ckan_packages(fetch_impl: nil)
    url = 'https://opendata.nhsbsa.net/api/3/action/package_list'
    parse_nhsbsa_ckan_packages(get_json('nhsbsa-ckan', url, fetch_impl: fetch_impl))
  end
end
