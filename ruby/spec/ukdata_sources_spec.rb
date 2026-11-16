# frozen_string_literal: true

require 'json'
require_relative 'spec_helper'
require 'time'
require 'uri'

$LOAD_PATH.unshift(File.expand_path('../lib', __dir__))
require 'ukdata'

EXPECTED_IDS = %w[
  flood-stations flood-readings ons-datasets food-hygiene-authorities
  tfl-bike-points planning-datasets ancient-woodland bank-rate police-crimes
  carbon-intensity parliament-seats postcode-lookup explore-education-statistics
  london-datastore tna-discovery ukhsa-dashboard nomis fingertips-indicators
  find-a-tender tfl-line-status public-health-scotland nhsbsa-ckan
  neso-generation-mix data-gov-uk-ckan
  gov-uk-content uk-parliament-committees elexon-system-prices ukri-gtr-awards
  legislation-search gazette-notices ons-geography neso-catalogue
  bgs-opengeoscience-wms hm-land-registry-price-paid
].freeze

FIXTURES = File.expand_path('../lib/ukdata/fixtures', __dir__)

def fixture_json(name)
  JSON.parse(File.read(File.join(FIXTURES, name), encoding: 'UTF-8'))
end

class FixtureFetcher
  attr_reader :urls

  def initialize
    @urls = []
  end

  def call(url, _headers = {})
    @urls << url
    uri = URI(url)
    case uri.host
    when 'environment.data.gov.uk'
      name = uri.path.include?('/readings') ? 'flood-station-readings.json' : 'flood-stations.json'
      JSON.generate(fixture_json(name))
    when 'api.beta.ons.gov.uk' then JSON.generate(fixture_json('ons-datasets.json'))
    when 'api.ratings.food.gov.uk' then JSON.generate(fixture_json('food-hygiene-authorities.json'))
    when 'api.tfl.gov.uk'
      JSON.generate(uri.path.start_with?('/Line/') ? fixture_json('tfl-line-status-2026-10-05.json') : fixture_json('tfl-bike-points.json'))
    when 'www.planning.data.gov.uk' then JSON.generate(fixture_json('planning-datasets.json'))
    when 'services.arcgis.com' then JSON.generate(ancient(uri.query))
    when 'www.bankofengland.co.uk' then File.read(File.join(FIXTURES, 'bank-rate.csv'), encoding: 'UTF-8')
    when 'data.police.uk' then JSON.generate(police(uri.path, uri.query))
    when 'api.carbonintensity.org.uk' then JSON.generate(carbon(url))
    when 'members-api.parliament.uk' then JSON.generate(fixture_json('parliament-seats.json'))
    when 'api.postcodes.io' then JSON.generate(fixture_json('postcode-lookup-2026-10-05.json'))
    when 'api.education.gov.uk' then JSON.generate(fixture_json('explore-education-statistics-2026-10-05.json'))
    when 'data.london.gov.uk' then JSON.generate(fixture_json('london-datastore-2026-10-05.json'))
    when 'discovery.nationalarchives.gov.uk' then JSON.generate(fixture_json('tna-discovery-2026-10-05.json'))
    when 'api.ukhsa-dashboard.data.gov.uk' then JSON.generate(fixture_json('ukhsa-dashboard-2026-10-05.json'))
    when 'www.nomisweb.co.uk' then JSON.generate(fixture_json('nomis-2026-10-05.json'))
    when 'fingertips.phe.org.uk' then JSON.generate(fixture_json('fingertips-indicators-2026-10-05.json'))
    when 'www.find-tender.service.gov.uk' then JSON.generate(fixture_json('find-a-tender-2026-10-05.json'))
    when 'www.opendata.nhs.scot' then JSON.generate(fixture_json('public-health-scotland-2026-10-05.json'))
    when 'opendata.nhsbsa.net' then JSON.generate(fixture_json('nhsbsa-ckan-2026-10-05.json'))
    when 'api.neso.energy'
      if uri.path.include?('/package_search')
        JSON.generate(fixture_json('neso-catalogue-2026-11-08.json'))
      else
        JSON.generate(fixture_json('neso-generation-mix-2026-10-18.json'))
      end
    when 'www.data.gov.uk' then JSON.generate(fixture_json('data-gov-uk-ckan-2026-11-05.json'))
    when 'www.gov.uk' then JSON.generate(fixture_json('gov-uk-content-2026-11-07.json'))
    when 'api.parliament.uk' then JSON.generate(fixture_json('uk-parliament-committees-2026-11-08.json'))
    when 'data.elexon.co.uk' then JSON.generate(fixture_json('elexon-system-prices-2026-11-08.json'))
    when 'gtr.ukri.org' then JSON.generate(fixture_json('ukri-gtr-awards-2026-11-08.json'))
    when 'www.legislation.gov.uk'
      File.read(File.join(FIXTURES, 'legislation-search-2026-11-08.xml'), encoding: 'UTF-8')
    when 'www.thegazette.co.uk'
      JSON.generate(fixture_json('gazette-notices-2026-11-08.json'))
    when 'geoportal.statistics.gov.uk'
      JSON.generate(fixture_json('ons-geography-2026-11-08.json'))
    when 'map.bgs.ac.uk'
      File.read(File.join(FIXTURES, 'bgs-wms-2026-11-08.xml'), encoding: 'UTF-8')
    when 'landregistry.data.gov.uk'
      JSON.generate(fixture_json('hm-land-registry-price-paid-2026-11-17.json'))
    else raise "unexpected URL #{url}"
    end
  end

  private

  def ancient(query)
    parameters = URI.decode_www_form(query.to_s).to_h
    data = fixture_json('ancient-woodland.json')
    where = parameters.fetch('where', '1=1')
    return data['totals'] unless parameters.key?('groupByFieldsForStatistics')
    return data['categoryTotals'] if where == '1=1'

    bands = ['AREA < 1', 'AREA >= 1 AND AREA < 2', 'AREA >= 2 AND AREA < 5',
             'AREA >= 5 AND AREA < 10', 'AREA >= 10 AND AREA < 20',
             'AREA >= 20 AND AREA < 50', 'AREA >= 50 AND AREA < 100', 'AREA >= 100']
    data['sizeBandCounts'].fetch(bands.index(where))
  end

  def police(path, query)
    data = fixture_json('police-crimes.json')
    return data['categories'] if path.end_with?('/crime-categories')
    return data['months'].map { |entry| { 'date' => entry['month'] } } if path.end_with?('/crimes-street-dates')

    month = URI.decode_www_form(query.to_s).to_h.fetch('date')
    data['months'].find { |entry| entry['month'] == month }.fetch('records')
  end

  def carbon(url)
    data = fixture_json('carbon-intensity.json')
    start = Time.strptime("#{URI(url).path.split('/')[2]} UTC", '%Y-%m-%dT%H:%MZ %Z')
    fixture_start = Time.strptime("#{data['data'].first['from']} UTC", '%Y-%m-%dT%H:%MZ %Z')
    shift = start - fixture_start
    data['data'].map do |entry|
      item = entry.dup
      %w[from to].each do |key|
        value = Time.strptime("#{entry[key]} UTC", '%Y-%m-%dT%H:%MZ %Z')
        item[key] = (value + shift).strftime('%Y-%m-%dT%H:%MZ')
      end
      item
    end.then { |entries| { 'data' => entries } }
  end
end

class UkdataSourcesSpec < Minitest::Test
  def test_registry_matches_typescript_adapter_ids
    assert_equal EXPECTED_IDS, Ukdata::UK_DATA_SOURCES.map(&:id)
  end

  def test_registry_lookup_and_metadata
    assert Ukdata.get_uk_data_source('flood-readings').name.start_with?('Environment Agency')
    assert_nil Ukdata.get_uk_data_source('does-not-exist')
    Ukdata::UK_DATA_SOURCES.each do |source|
      refute_empty source.name
      assert_equal 'none', source.auth
      refute_empty source.description
    end
  end

  def test_registry_descriptions_match_typescript
    descriptions = {
      'police-crimes' =>
        'Street-level crime recorded within a mile of a point, counted by crime type ' \
        'and by outcome.',
      'carbon-intensity' =>
        'Half-hourly carbon intensity for Great Britain, with the cleanest and dirtiest ' \
        'half hours in the window.',
      'postcode-lookup' =>
        "One postcode's country, region, wards, and coordinates, default SW1A1AA.",
      'neso-generation-mix' =>
        'Half-hourly Great Britain generation by fuel, with the cleanest and dirtiest ' \
        'half hours in the window.'
    }
    descriptions.each do |source_id, description|
      assert_equal description, Ukdata.get_uk_data_source(source_id).description
    end
  end

  def test_every_adapter_has_a_parser_fixture_and_fetcher
    Ukdata::UK_DATA_SOURCES.each do |source|
      refute_nil source.load_fixture.call
      assert_respond_to source.parse, :call
      assert_respond_to source.fetch_live, :call
      assert_raises(Ukdata::UkSourceParseError) { source.parse.call(nil) }
    end
  end

  def test_fixture_values_match_typescript_snapshots
    assert_equal 1, Ukdata.get_uk_data_source('flood-stations').load_fixture.call.length
    assert_equal 5, Ukdata.get_uk_data_source('flood-readings').load_fixture.call.length
    assert_equal 5, Ukdata.get_uk_data_source('ons-datasets').load_fixture.call.length
    assert_equal 363, Ukdata.get_uk_data_source('food-hygiene-authorities').load_fixture.call.length
    assert_equal 6, Ukdata.get_uk_data_source('tfl-bike-points').load_fixture.call.length
    assert_equal 6, Ukdata.get_uk_data_source('planning-datasets').load_fixture.call.length
    assert_equal 53_638, Ukdata.get_uk_data_source('ancient-woodland').load_fixture.call['recordCount']
    assert_equal 13_077, Ukdata.get_uk_data_source('bank-rate').load_fixture.call.length
    police = Ukdata.get_uk_data_source('police-crimes').load_fixture.call
    assert_equal 1, police['monthCount']
    assert_equal 1_417, police['recordCount']
    assert_equal 1_440, Ukdata.get_uk_data_source('carbon-intensity').load_fixture.call['periodCount']
    assert_equal 650, Ukdata.get_uk_data_source('parliament-seats').load_fixture.call['seatCount']
    assert_equal 'SW1A 1AA', Ukdata.get_uk_data_source('postcode-lookup').load_fixture.call['postcode']
    assert_equal 20, Ukdata.get_uk_data_source('explore-education-statistics').load_fixture.call['publications'].length
    assert_equal 1_305, Ukdata.get_uk_data_source('london-datastore').load_fixture.call.length
    assert_equal 140_410, Ukdata.get_uk_data_source('tna-discovery').load_fixture.call['totalCount']
    assert_equal 35, Ukdata.get_uk_data_source('ukhsa-dashboard').load_fixture.call['totalCount']
    assert_equal 25, Ukdata.get_uk_data_source('nomis').load_fixture.call.length
    assert_equal 1, Ukdata.get_uk_data_source('fingertips-indicators').load_fixture.call.length
    assert_equal 10, Ukdata.get_uk_data_source('find-a-tender').load_fixture.call['releases'].length
    assert_equal 11, Ukdata.get_uk_data_source('tfl-line-status').load_fixture.call.length
    assert_equal 105, Ukdata.get_uk_data_source('public-health-scotland').load_fixture.call.length
    assert_equal 2_172, Ukdata.get_uk_data_source('nhsbsa-ckan').load_fixture.call.length
    assert_equal 336, Ukdata.get_uk_data_source('neso-generation-mix').load_fixture.call['halfHourCount']
    assert_equal 3_875, Ukdata.get_uk_data_source('data-gov-uk-ckan').load_fixture.call['totalCount']
    assert_equal 'How government works',
                 Ukdata.get_uk_data_source('gov-uk-content').load_fixture.call['title']
    assert_equal 20,
                 Ukdata.get_uk_data_source('uk-parliament-committees').load_fixture.call['committees'].length
    assert_equal 6, Ukdata.get_uk_data_source('elexon-system-prices').load_fixture.call['periods'].length
    assert_equal 3, Ukdata.get_uk_data_source('ukri-gtr-awards').load_fixture.call['awards'].length
    assert_equal 2, Ukdata.get_uk_data_source('legislation-search').load_fixture.call['results'].length
    assert_equal 3, Ukdata.get_uk_data_source('gazette-notices').load_fixture.call['notices'].length
    assert_equal 2, Ukdata.get_uk_data_source('ons-geography').load_fixture.call['datasets'].length
    assert_equal 1, Ukdata.get_uk_data_source('neso-catalogue').load_fixture.call['datasets'].length
    assert_equal 6, Ukdata.get_uk_data_source('bgs-opengeoscience-wms').load_fixture.call['layers'].length
    assert_equal 3,
                 Ukdata.get_uk_data_source('hm-land-registry-price-paid').load_fixture.call['transactions'].length
  end

  def test_port_field_names_match_typescript
    flood = Ukdata.get_uk_data_source('flood-stations').load_fixture.call.first
    assert_equal %w[catchmentName id label latitude licence longitude measures notation publisher riverName],
                 flood.keys.sort
    assert_equal %w[dateTime licence measureId publisher value],
                 Ukdata.get_uk_data_source('flood-readings').load_fixture.call.first.keys.sort
    assert_equal %w[attribution dataset entityCount licence name phase themes typology],
                 Ukdata.get_uk_data_source('planning-datasets').load_fixture.call.first.keys.sort
    assert_equal %w[buyerName date id licence ocid procurementMethod publisher tags tenderStatus
                    tenderTitle tenderValueAmount],
                 Ukdata.get_uk_data_source('find-a-tender').load_fixture.call['releases']
                       .first.keys.sort
    assert_equal %w[licenceId licenceTitle licenceUrl modifiedAt name publisher resourceCount tags title],
                 Ukdata.get_uk_data_source('data-gov-uk-ckan').load_fixture.call['datasets']
                       .first.keys.sort
    point = Ukdata.get_uk_data_source('ukhsa-dashboard').load_fixture.call['points'].first
    assert_includes point.keys, 'geographyCode'
    refute_includes point.keys, 'geographicCode'
    assert_equal %w[indicatorId lastUploadedAt latestChangeTimestampOverride name valueType yearType],
                 Ukdata.get_uk_data_source('fingertips-indicators').load_fixture.call.first.keys
                       .grep(/indicator|latest|last|name|value|year/i).sort
    ancient = Ukdata.get_uk_data_source('ancient-woodland').load_fixture.call
    assert_equal %w[averageRecordHectares categoryCounts categoryHectares largestRecordHectares
                    recordCount sizeBands totalHectares], ancient.keys.sort
    assert_equal %w[categoryCounts label maxHectares minHectares recordCount],
                 ancient['sizeBands'].first.keys.sort
    police = Ukdata.get_uk_data_source('police-crimes').load_fixture.call
    assert_equal %w[busiestMonth categoryCounts firstMonth latestMonth monthCount months
                    outcomeCounts quietestMonth recordCount topCategory topOutcome], police.keys.sort
    carbon = Ukdata.get_uk_data_source('carbon-intensity').load_fixture.call
    assert_equal %w[averageIntensity bandCounts dayCount firstPeriodFrom highestPeriod lastPeriodTo
                    lowestPeriod periodCount periods], carbon.keys.sort
    assert_equal %w[from index intensity to], carbon['periods'].first.keys.sort
    neso = Ukdata.get_uk_data_source('neso-generation-mix').load_fixture.call
    assert_equal %w[averageCarbonIntensity averageTotalMegawatts cleanestHalfHour dirtiestHalfHour
                    firstHalfHourAt fuelShares halfHourCount halfHours lastHalfHourAt
                    lowCarbonSharePercent], neso.keys.sort
    assert_equal %w[averageMegawatts fuel peakMegawatts sharePercent],
                 neso['fuelShares'].first.keys.sort
    assert_equal %w[availableTranslationCount basePath contentId description documentType
                    firstPublishedAt isWithdrawn locale organisations phase publicUpdatedAt
                    schemaName taxons title updatedAt webUrl],
                 Ukdata.get_uk_data_source('gov-uk-content').load_fixture.call.keys.sort
    assert_equal %w[createdAt description geometryType id licence licenceInfo modifiedAt owner tags
                    title type url],
                 Ukdata.get_uk_data_source('ons-geography').load_fixture.call['datasets'].first.keys.sort
    assert_equal %w[endDate isCurrent localId mnisId name remit startDate],
                 Ukdata.get_uk_data_source('uk-parliament-committees').load_fixture.call['committees']
                       .first.keys.sort
    assert_equal %w[address estateType id newBuild pricePaid propertyType recordStatus recordUrl
                    transactionCategory transactionDate],
                 Ukdata.get_uk_data_source('hm-land-registry-price-paid').load_fixture.call['transactions']
                       .first.keys.sort
    assert_equal %w[apiUrl endDate fundingOrgLongName fundingOrgName grantCategory grantRefNumber id
                    leadOrgId leadOrgName leadOrgRegion leadOrgRole leadPersonId leadPersonName
                    projectPath projectStatus projectTitle startDate totalGrantValue],
                 Ukdata.get_uk_data_source('ukri-gtr-awards').load_fixture.call['awards']
                       .first.keys.sort
  end

  def test_every_adapter_fetches_and_parses_offline
    fetcher = FixtureFetcher.new
    Ukdata::UK_DATA_SOURCES.each do |source|
      refute_nil source.fetch_live.call(fetch_impl: fetcher), source.id
    end
    assert_operator fetcher.urls.length, :>=, Ukdata::UK_DATA_SOURCES.length
  end

  def test_probe_all_uses_registry_order
    fetcher = FixtureFetcher.new
    probes = Ukdata.probe_all_uk_data_sources(fetch_impl: fetcher)
    assert_equal EXPECTED_IDS, probes.map(&:id)
    assert probes.all?(&:ok)
  end

  def test_parliament_query_date_uses_europe_london_in_winter
    fetcher = FixtureFetcher.new
    Time.stub(:now, Time.utc(2026, 1, 15, 23, 30, 0)) do
      Ukdata.fetch_parliament_seats(fetch_impl: fetcher)
    end

    assert_includes fetcher.urls.first, '/2026-01-15'
  end

  def test_parliament_query_date_uses_europe_london_in_summer
    fetcher = FixtureFetcher.new
    Time.stub(:now, Time.utc(2026, 7, 5, 23, 30, 0)) do
      Ukdata.fetch_parliament_seats(fetch_impl: fetcher)
    end

    assert_includes fetcher.urls.first, '/2026-07-06'
  end
end
