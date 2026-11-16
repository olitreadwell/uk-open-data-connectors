# frozen_string_literal: true

module Ukdata
  module_function

  ANCIENT_WOODLAND_QUERY_URL = 'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/' \
                               'services/Ancient_Woodland_England/FeatureServer/0/query'
  ANCIENT_WOODLAND_CATEGORIES = { 'ASNW' => 'asnw', 'PAWS' => 'paws', 'AWP' => 'awp' }.freeze
  ANCIENT_WOODLAND_SIZE_BANDS = [
    ['Under 1 hectare', 0, 1, 'AREA < 1'],
    ['1 to 2 hectares', 1, 2, 'AREA >= 1 AND AREA < 2'],
    ['2 to 5 hectares', 2, 5, 'AREA >= 2 AND AREA < 5'],
    ['5 to 10 hectares', 5, 10, 'AREA >= 5 AND AREA < 10'],
    ['10 to 20 hectares', 10, 20, 'AREA >= 10 AND AREA < 20'],
    ['20 to 50 hectares', 20, 50, 'AREA >= 20 AND AREA < 50'],
    ['50 to 100 hectares', 50, 100, 'AREA >= 50 AND AREA < 100'],
    ['100 hectares or more', 100, nil, 'AREA >= 100']
  ].freeze

  def arcgis_rows(source, response)
    features = need_array(source, need_hash(source, response)['features'], 'features')
    features.map { |feature| need_hash(source, need_hash(source, feature)['attributes']) }
  end

  def ancient_totals_row(source, response)
    rows = arcgis_rows(source, response)
    raise UkSourceParseError.new(source, 'the totals query returned no rows') if rows.empty?

    rows.first
  end

  def parse_ancient_category_totals(source, response)
    category_counts = { 'asnw' => 0, 'paws' => 0, 'awp' => 0 }
    category_hectares = { 'asnw' => 0, 'paws' => 0, 'awp' => 0 }
    arcgis_rows(source, response).each do |row|
      category_id = ANCIENT_WOODLAND_CATEGORIES[row['STATUS']]
      if category_id.nil?
        raise UkSourceParseError.new(source,
                                     "unrecognised woodland status #{row['STATUS'].inspect}")
      end

      category_counts[category_id] = need_int(source, row['recordCount'], 'recordCount')
      category_hectares[category_id] = need_number(source, row['hectares'], 'hectares')
    end
    [category_counts, category_hectares]
  end

  def parse_ancient_size_band(source, definition, response)
    band_counts = { 'asnw' => 0, 'paws' => 0, 'awp' => 0 }
    arcgis_rows(source, response).each do |row|
      category_id = ANCIENT_WOODLAND_CATEGORIES[row['STATUS']]
      raise UkSourceParseError.new(source, 'unrecognised woodland status') if category_id.nil?

      band_counts[category_id] = need_int(source, row['recordCount'], 'recordCount')
    end
    band = {
      'label' => definition[0],
      'minHectares' => definition[1],
      'recordCount' => band_counts.values.sum,
      'categoryCounts' => band_counts
    }
    band['maxHectares'] = definition[2] unless definition[2].nil?
    band
  end

  def parse_ancient_size_bands(source, responses)
    unless responses.length == ANCIENT_WOODLAND_SIZE_BANDS.length
      raise UkSourceParseError.new(source, 'the size band response count is wrong')
    end

    ANCIENT_WOODLAND_SIZE_BANDS.zip(responses).map do |definition, response|
      parse_ancient_size_band(source, definition, response)
    end
  end

  def parse_ancient_woodland_profile(payload)
    source = 'ancient-woodland'
    data = need_hash(source, payload)
    totals = ancient_totals_row(source, data['totals'])
    record_count = need_int(source, totals['recordCount'], 'recordCount')
    category_counts, category_hectares = parse_ancient_category_totals(source,
                                                                       data['categoryTotals'])
    size_band_counts = need_array(source, data['sizeBandCounts'], 'sizeBandCounts')
    bands = parse_ancient_size_bands(source, size_band_counts)
    unless bands.sum { |band| band['recordCount'] } == record_count
      raise UkSourceParseError.new(source, 'the size bands do not add up to the layer total')
    end

    {
      'recordCount' => record_count,
      'totalHectares' => need_number(source, totals['hectares'], 'hectares'),
      'largestRecordHectares' => need_number(source, totals['largestHectares'], 'largestHectares'),
      'averageRecordHectares' => need_number(source, totals['averageHectares'], 'averageHectares'),
      'categoryCounts' => category_counts,
      'categoryHectares' => category_hectares,
      'sizeBands' => bands
    }
  end

  def ancient_query(where, statistics, group_by: nil, fetch_impl: nil)
    params = {
      'where' => where,
      'outStatistics' => JSON.generate(statistics),
      'returnGeometry' => 'false',
      'f' => 'json'
    }
    params['groupByFieldsForStatistics'] = group_by unless group_by.nil?
    get_json('ancient-woodland', "#{ANCIENT_WOODLAND_QUERY_URL}?#{URI.encode_www_form(params)}",
             fetch_impl: fetch_impl)
  end

  def fetch_ancient_woodland_profile(fetch_impl: nil)
    count_and_area = [
      { 'statisticType' => 'count', 'onStatisticField' => 'OBJECTID',
        'outStatisticFieldName' => 'recordCount' },
      { 'statisticType' => 'sum', 'onStatisticField' => 'AREA',
        'outStatisticFieldName' => 'hectares' }
    ]
    totals_statistics = count_and_area + [
      { 'statisticType' => 'max', 'onStatisticField' => 'AREA',
        'outStatisticFieldName' => 'largestHectares' },
      { 'statisticType' => 'avg', 'onStatisticField' => 'AREA',
        'outStatisticFieldName' => 'averageHectares' }
    ]
    payload = {
      'totals' => ancient_query('1=1', totals_statistics, fetch_impl: fetch_impl),
      'categoryTotals' => ancient_query('1=1', count_and_area, group_by: 'STATUS',
                                                               fetch_impl: fetch_impl),
      'sizeBandCounts' => ANCIENT_WOODLAND_SIZE_BANDS.map do |band|
        ancient_query(band[3], count_and_area, group_by: 'STATUS', fetch_impl: fetch_impl)
      end
    }
    parse_ancient_woodland_profile(payload)
  end
end
