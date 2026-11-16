# frozen_string_literal: true

module Ukdata
  module_function

  FINGERTIPS_INDICATOR_METADATA_URL = 'https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id'

  def parse_fingertips_indicators(payload)
    source = 'fingertips-indicators'
    need_hash(source, payload).values.map do |raw|
      row = need_hash(source, raw)
      descriptive = row['Descriptive']
      unit = row['Unit']
      value_type = row['ValueType']
      year_type = row['YearType']
      data_change = row['DataChange']
      {
        'indicatorId' => need_int(source, row['IID'], 'IID'),
        'name' => descriptive.is_a?(Hash) ? descriptive['Name'].to_s : '',
        'dataSource' => descriptive.is_a?(Hash) ? descriptive['DataSource'].to_s : '',
        'unitLabel' => unit.is_a?(Hash) ? unit['Label'].to_s : '',
        'valueType' => value_type.is_a?(Hash) ? value_type['Name'].to_s : '',
        'yearType' => year_type.is_a?(Hash) ? year_type['Name'].to_s : '',
        'lastUploadedAt' => data_change.is_a?(Hash) ? data_change['LastUploadedAt'].to_s : '',
        'latestChangeTimestampOverride' => row['LatestChangeTimestampOverride'].to_s
      }
    end
  end

  def fetch_fingertips_indicators(indicator_ids: [90_366], fetch_impl: nil)
    url = "#{FINGERTIPS_INDICATOR_METADATA_URL}?indicator_ids=#{indicator_ids.join(',')}"
    parse_fingertips_indicators(get_json('fingertips-indicators', url, fetch_impl: fetch_impl))
  end
end
