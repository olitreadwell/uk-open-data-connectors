# frozen_string_literal: true

module Ukdata
  module_function

  UK_DATA_SOURCES = [
    Adapter.new('flood-stations', 'Environment Agency flood-monitoring stations', 'none',
                'Monitoring stations with their river, catchment, and published measures.',
                ->(fetch_impl: nil) { fetch_flood_stations(fetch_impl: fetch_impl) },
                ->(payload) { parse_flood_stations(payload) },
                -> { parse_flood_stations(read_fixture_json('flood-stations.json')) }),
    Adapter.new('flood-readings', 'Environment Agency flood-monitoring readings', 'none',
                'Recent water level readings for one station, newest first.',
                ->(fetch_impl: nil) { fetch_flood_station_readings(fetch_impl: fetch_impl) },
                ->(payload) { parse_flood_readings(payload) },
                -> { parse_flood_readings(read_fixture_json('flood-station-readings.json')) }),
    Adapter.new('ons-datasets', 'Office for National Statistics dataset catalogue', 'none',
                'Every dataset the ONS beta API lists, with its state and last-updated stamp.',
                ->(fetch_impl: nil) { fetch_ons_datasets(fetch_impl: fetch_impl) },
                ->(payload) { parse_ons_datasets(payload) },
                -> { parse_ons_datasets(read_fixture_json('ons-datasets.json')) }),
    Adapter.new('food-hygiene-authorities', 'Food Standards Agency food hygiene registers', 'none',
                'Every local authority food hygiene register, with its establishment count.',
                ->(fetch_impl: nil) { fetch_food_hygiene_authorities(fetch_impl: fetch_impl) },
                ->(payload) { parse_food_hygiene_authorities(payload) },
                lambda {
                  parse_food_hygiene_authorities(read_fixture_json('food-hygiene-authorities.json'))
                }),
    Adapter.new('tfl-bike-points', 'Transport for London Santander Cycles docking stations', 'none',
                'Every Santander Cycles docking station, with its docking points and docked bikes.',
                ->(fetch_impl: nil) { fetch_tfl_bike_points(fetch_impl: fetch_impl) },
                ->(payload) { parse_tfl_bike_points(payload) },
                -> { parse_tfl_bike_points(read_fixture_json('tfl-bike-points.json')) }),
    Adapter.new('planning-datasets',
                'Ministry of Housing, Communities and Local Government planning datasets',
                'none',
                'Every dataset the Planning Data platform lists, with the records behind it.',
                ->(fetch_impl: nil) { fetch_planning_datasets(fetch_impl: fetch_impl) },
                ->(payload) { parse_planning_datasets(payload) },
                -> { parse_planning_datasets(read_fixture_json('planning-datasets.json')) }),
    Adapter.new('ancient-woodland', 'Natural England ancient woodland (England)', 'none',
                'Ancient woodland polygons for England, counted by woodland type and by size.',
                ->(fetch_impl: nil) { fetch_ancient_woodland_profile(fetch_impl: fetch_impl) },
                ->(payload) { parse_ancient_woodland_profile(payload) },
                -> { parse_ancient_woodland_profile(read_fixture_json('ancient-woodland.json')) }),
    Adapter.new('bank-rate', 'Bank of England Bank Rate', 'none',
                'The daily official Bank Rate, from 2 January 1975 to the latest published day.',
                ->(fetch_impl: nil) { fetch_bank_rate_observations(fetch_impl: fetch_impl) },
                ->(payload) { parse_bank_rate_csv(payload) },
                -> { parse_bank_rate_csv(read_fixture_text('bank-rate.csv')) }),
    Adapter.new('police-crimes', 'Home Office police.uk recorded crime', 'none',
                'Street-level crime recorded within a mile of a point, counted by crime ' \
                'type and by outcome.',
                ->(fetch_impl: nil) { fetch_police_crime_summary(fetch_impl: fetch_impl) },
                ->(payload) { parse_police_crime_summary(payload) },
                -> { parse_police_crime_summary(read_fixture_json('police-crimes.json')) }),
    Adapter.new('carbon-intensity', 'National Energy System Operator carbon intensity', 'none',
                'Half-hourly carbon intensity for Great Britain, with the cleanest and ' \
                'dirtiest half hours in the window.',
                ->(fetch_impl: nil) { fetch_carbon_intensity_window(fetch_impl: fetch_impl) },
                ->(payload) { parse_carbon_intensity_window(payload) },
                -> { parse_carbon_intensity_window(read_fixture_json('carbon-intensity.json')) }),
    Adapter.new('parliament-seats', 'UK Parliament state of the parties', 'none',
                'Seats each party holds in the House of Commons, with the members counted ' \
                'behind them.',
                ->(fetch_impl: nil) { fetch_parliament_seats(fetch_impl: fetch_impl) },
                ->(payload) { parse_parliament_seats(payload) },
                -> { parse_parliament_seats(read_fixture_json('parliament-seats.json')) }),
    Adapter.new('postcode-lookup', 'postcodes.io postcode lookup', 'none',
                "One postcode's country, region, wards, and coordinates, default SW1A1AA.",
                ->(fetch_impl: nil) { fetch_postcode_lookup(fetch_impl: fetch_impl) },
                ->(payload) { parse_postcode_lookup(payload) },
                lambda {
                  parse_postcode_lookup(read_fixture_json('postcode-lookup-2026-10-05.json'))
                }),
    Adapter.new('explore-education-statistics',
                'Department for Education Explore Education Statistics publications', 'none',
                'The most recent statistics releases the Department for Education has published.',
                lambda { |fetch_impl: nil|
                  fetch_explore_education_publications(fetch_impl: fetch_impl)
                },
                ->(payload) { parse_explore_education_publications(payload) },
                lambda {
                  parse_explore_education_publications(
                    read_fixture_json('explore-education-statistics-2026-10-05.json')
                  )
                }),
    Adapter.new('london-datastore', 'London Datastore dataset catalogue', 'none',
                'Every dataset the Greater London Authority lists on the London Datastore.',
                ->(fetch_impl: nil) { fetch_london_datastore_packages(fetch_impl: fetch_impl) },
                ->(payload) { parse_london_datastore_packages(payload) },
                lambda {
                  parse_london_datastore_packages(
                    read_fixture_json('london-datastore-2026-10-05.json')
                  )
                }),
    Adapter.new('tna-discovery', 'The National Archives Discovery catalogue search', 'none',
                'Catalogue records matching "test", with the total hit count.',
                ->(fetch_impl: nil) { fetch_tna_discovery_records(fetch_impl: fetch_impl) },
                ->(payload) { parse_tna_discovery_records(payload) },
                lambda {
                  parse_tna_discovery_records(read_fixture_json('tna-discovery-2026-10-05.json'))
                }),
    Adapter.new('ukhsa-dashboard', 'UK Health Security Agency data dashboard', 'none',
                'New HIV diagnoses in England, as annual counts from the UKHSA dashboard.',
                ->(fetch_impl: nil) { fetch_ukhsa_metric_points(fetch_impl: fetch_impl) },
                ->(payload) { parse_ukhsa_metric_points(payload) },
                lambda {
                  parse_ukhsa_metric_points(read_fixture_json('ukhsa-dashboard-2026-10-05.json'))
                }),
    Adapter.new('nomis', 'Nomis SDMX dataset catalogue', 'none',
                'Every dataset definition the ONS Nomis catalogue publishes, with its status.',
                ->(fetch_impl: nil) { fetch_nomis_dataset_definitions(fetch_impl: fetch_impl) },
                ->(payload) { parse_nomis_dataset_definitions(payload) },
                -> { parse_nomis_dataset_definitions(read_fixture_json('nomis-2026-10-05.json')) }),
    Adapter.new('fingertips-indicators',
                'Office for Health Improvement and Disparities Fingertips indicators', 'none',
                'Metadata for the public health indicators Fingertips publishes, with their ' \
                'sources.',
                ->(fetch_impl: nil) { fetch_fingertips_indicators(fetch_impl: fetch_impl) },
                ->(payload) { parse_fingertips_indicators(payload) },
                lambda {
                  parse_fingertips_indicators(
                    read_fixture_json('fingertips-indicators-2026-10-05.json')
                  )
                }),
    Adapter.new('find-a-tender', 'Find a Tender OCDS release packages', 'none',
                'The most recent public procurement notices Find a Tender publishes.',
                ->(fetch_impl: nil) { fetch_find_a_tender_releases(fetch_impl: fetch_impl) },
                ->(payload) { parse_find_a_tender_releases(payload) },
                lambda {
                  parse_find_a_tender_releases(read_fixture_json('find-a-tender-2026-10-05.json'))
                }),
    Adapter.new('tfl-line-status', 'Transport for London Tube line status', 'none',
                'The live service status of every Tube line, with disruption reasons.',
                ->(fetch_impl: nil) { fetch_tfl_line_statuses(fetch_impl: fetch_impl) },
                ->(payload) { parse_tfl_line_statuses(payload) },
                lambda {
                  parse_tfl_line_statuses(read_fixture_json('tfl-line-status-2026-10-05.json'))
                }),
    Adapter.new('public-health-scotland', 'Public Health Scotland open data catalogue', 'none',
                'Every dataset Public Health Scotland publishes on its open data portal.',
                lambda { |fetch_impl: nil|
                  fetch_public_health_scotland_datasets(fetch_impl: fetch_impl)
                },
                ->(payload) { parse_public_health_scotland_datasets(payload) },
                lambda {
                  parse_public_health_scotland_datasets(
                    read_fixture_json('public-health-scotland-2026-10-05.json')
                  )
                }),
    Adapter.new('nhsbsa-ckan', 'NHS Business Services Authority open data catalogue', 'none',
                'Every dataset the NHS Business Services Authority publishes on its CKAN portal.',
                ->(fetch_impl: nil) { fetch_nhsbsa_ckan_packages(fetch_impl: fetch_impl) },
                ->(payload) { parse_nhsbsa_ckan_packages(payload) },
                lambda {
                  parse_nhsbsa_ckan_packages(read_fixture_json('nhsbsa-ckan-2026-10-05.json'))
                }),
    Adapter.new('neso-generation-mix', 'National Energy System Operator generation mix', 'none',
                'Half-hourly Great Britain generation by fuel, with the cleanest and dirtiest ' \
                'half hours in the window.',
                ->(fetch_impl: nil) { fetch_neso_generation_mix_window(fetch_impl: fetch_impl) },
                ->(payload) { parse_neso_generation_mix(payload) },
                lambda {
                  parse_neso_generation_mix(
                    read_fixture_json('neso-generation-mix-2026-10-18.json')
                  )
                }),
    Adapter.new('data-gov-uk-ckan', 'Data.gov.uk CKAN catalogue', 'none',
                'Search the UK government open data catalogue hosted on Data.gov.uk.',
                ->(fetch_impl: nil) { fetch_data_gov_uk_packages(fetch_impl: fetch_impl) },
                ->(payload) { parse_data_gov_uk_packages(payload) },
                lambda {
                  parse_data_gov_uk_packages(read_fixture_json('data-gov-uk-ckan-2026-11-05.json'))
                }),
    Adapter.new('gov-uk-content', 'GOV.UK Content API', 'none',
                'One GOV.UK page, with its taxons and publishing organisations.',
                ->(fetch_impl: nil) { fetch_gov_uk_content(fetch_impl: fetch_impl) },
                ->(payload) { parse_gov_uk_content(payload) },
                lambda {
                  parse_gov_uk_content(read_fixture_json('gov-uk-content-2026-11-07.json'))
                }),
    Adapter.new('uk-parliament-committees', 'UK Parliament committees', 'none',
                'Parliamentary committees, with their remit, start date, and end date.',
                ->(fetch_impl: nil) { fetch_uk_parliament_committees(fetch_impl: fetch_impl) },
                ->(payload) { parse_uk_parliament_committees(payload) },
                lambda {
                  parse_uk_parliament_committees(
                    read_fixture_json('uk-parliament-committees-2026-11-08.json')
                  )
                }),
    Adapter.new('elexon-system-prices', 'Elexon BMRS settlement system prices', 'none',
                'Settlement system buy and sell prices for one Great Britain settlement day.',
                ->(fetch_impl: nil) { fetch_elexon_system_prices(fetch_impl: fetch_impl) },
                ->(payload) { parse_elexon_system_prices(payload) },
                lambda {
                  parse_elexon_system_prices(
                    read_fixture_json('elexon-system-prices-2026-11-08.json')
                  )
                }),
    Adapter.new('ukri-gtr-awards', 'UKRI Gateway to Research awards', 'none',
                'UKRI-funded research awards, newest start date first, with their lead ' \
                'organisation.',
                ->(fetch_impl: nil) { fetch_ukri_gtr_awards(fetch_impl: fetch_impl) },
                ->(payload) { parse_ukri_gtr_awards(payload) },
                lambda {
                  parse_ukri_gtr_awards(read_fixture_json('ukri-gtr-awards-2026-11-08.json'))
                }),
    Adapter.new('legislation-search', 'legislation.gov.uk search', 'none',
                'Search the UK statute book for Acts, orders, and regulations.',
                ->(fetch_impl: nil) { fetch_legislation_search(fetch_impl: fetch_impl) },
                ->(payload) { parse_legislation_search(payload) },
                lambda {
                  parse_legislation_search(read_fixture_text('legislation-search-2026-11-08.xml'))
                }),
    Adapter.new('gazette-notices', 'The Gazette notices', 'none',
                'The latest notices in the UK official public record, with their notice ' \
                'codes and dates.',
                ->(fetch_impl: nil) { fetch_gazette_notices(fetch_impl: fetch_impl) },
                ->(payload) { parse_gazette_notices(payload) },
                lambda {
                  parse_gazette_notices(read_fixture_json('gazette-notices-2026-11-08.json'))
                }),
    Adapter.new('ons-geography', 'ONS Open Geography Portal', 'none',
                'Boundary and geography datasets for UK statistics, with tags and ' \
                'download links.',
                ->(fetch_impl: nil) { fetch_ons_geography_datasets(fetch_impl: fetch_impl) },
                ->(payload) { parse_ons_geography_datasets(payload) },
                lambda {
                  parse_ons_geography_datasets(
                    read_fixture_json('ons-geography-2026-11-08.json')
                  )
                }),
    Adapter.new('neso-catalogue', 'NESO Data Portal catalogue', 'none',
                'The National Energy System Operator open data catalogue, with licence ' \
                'and resource counts.',
                ->(fetch_impl: nil) { fetch_neso_catalogue(fetch_impl: fetch_impl) },
                ->(payload) { parse_neso_catalogue(payload) },
                lambda {
                  parse_neso_catalogue(read_fixture_json('neso-catalogue-2026-11-08.json'))
                }),
    Adapter.new('bgs-opengeoscience-wms', 'BGS OpenGeoscience WMS', 'none',
                'BGS 1:50,000 digital geology layers, with the service bounds and ' \
                'coordinate systems.',
                ->(fetch_impl: nil) { fetch_bgs_wms_capabilities(fetch_impl: fetch_impl) },
                ->(payload) { parse_bgs_wms_capabilities(payload) },
                lambda {
                  parse_bgs_wms_capabilities(read_fixture_text('bgs-wms-2026-11-08.xml'))
                }),
    Adapter.new('hm-land-registry-price-paid', 'HM Land Registry Price Paid Data', 'none',
                'Sold property prices for one UK postcode, with address, property type, ' \
                'and completion date.',
                lambda { |fetch_impl: nil|
                  fetch_land_registry_price_paid_transactions(fetch_impl: fetch_impl)
                },
                ->(payload) { parse_land_registry_price_paid(payload) },
                lambda {
                  parse_land_registry_price_paid(
                    read_fixture_json('hm-land-registry-price-paid-2026-11-17.json')
                  )
                })
  ].freeze

  def get_uk_data_source(source_id)
    UK_DATA_SOURCES.find { |source| source.id == source_id }
  end

  def probe_uk_data_source(adapter, fetch_impl: nil)
    data = adapter.fetch_live.call(fetch_impl: fetch_impl)
    Probe.new(adapter.id, adapter.name, adapter.auth, true, 'ok', JSON.generate(data)[0, 120])
  rescue StandardError => e
    Probe.new(adapter.id, adapter.name, adapter.auth, false, e.message)
  end

  def probe_all_uk_data_sources(fetch_impl: nil, ids: nil)
    unless ids.nil?
      known = UK_DATA_SOURCES.map(&:id)
      unknown = ids.uniq - known
      raise ArgumentError, "Unknown UK source ids: #{unknown.join(', ')}" unless unknown.empty?
    end
    UK_DATA_SOURCES.filter_map do |source|
      next if !ids.nil? && !ids.include?(source.id)

      probe_uk_data_source(source, fetch_impl: fetch_impl)
    end
  end
end
