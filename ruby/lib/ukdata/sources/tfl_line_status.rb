# frozen_string_literal: true

module Ukdata
  module_function

  TFL_LINE_STATUS_URL = 'https://api.tfl.gov.uk/Line/Mode/tube/Status'

  def parse_tfl_line_statuses(payload)
    source = 'tfl-line-status'
    raise UkSourceParseError.new(source, 'expected a JSON array') unless payload.is_a?(Array)

    payload.map do |raw|
      row = need_hash(source, raw)
      statuses = need_array(source, row['lineStatuses'], 'lineStatuses')
      raise UkSourceParseError.new(source, 'a line carried no status') if statuses.empty?

      status = need_hash(source, statuses.first)
      {
        'id' => need_string(source, row['id'], 'id'),
        'name' => need_string(source, row['name'], 'name'),
        'modeName' => need_string(source, row['modeName'], 'modeName'),
        'statusSeverity' => need_int(source, status['statusSeverity'], 'statusSeverity'),
        'statusSeverityDescription' => need_string(source, status['statusSeverityDescription'],
                                                   'statusSeverityDescription'),
        'reason' => status['reason'].to_s
      }
    end
  end

  def fetch_tfl_line_statuses(api_key: nil, fetch_impl: nil)
    url = if api_key.nil?
            TFL_LINE_STATUS_URL
          else
            "#{TFL_LINE_STATUS_URL}?app_key=#{URI.encode_www_form_component(api_key)}"
          end
    parse_tfl_line_statuses(get_json('tfl-line-status', url, fetch_impl: fetch_impl))
  end
end
