# frozen_string_literal: true

module Ukdata
  module_function

  UKHSA_DASHBOARD_API_BASE_URL = 'https://api.ukhsa-dashboard.data.gov.uk'
  UKHSA_DASHBOARD_METRIC_PATH = '/themes/infectious_disease/sub_themes/bloodborne/topics/HIV/' \
                                'geography_types/Nation/geographies/England/metrics/' \
                                'HIV_cases_newDiagnoses'

  def parse_ukhsa_metric_points(payload)
    source = 'ukhsa-dashboard'
    data = need_hash(source, payload)
    points = need_array(source, data['results'], 'results').map do |item|
      row = need_hash(source, item)
      {
        'theme' => need_string(source, row['theme'], 'theme'),
        'subTheme' => need_string(source, row['sub_theme'], 'sub_theme'),
        'topic' => need_string(source, row['topic'], 'topic'),
        'geographyType' => need_string(source, row['geography_type'], 'geography_type'),
        'geography' => need_string(source, row['geography'], 'geography'),
        'geographyCode' => row['geography_code'].to_s,
        'metric' => need_string(source, row['metric'], 'metric'),
        'metricGroup' => row['metric_group'].to_s,
        'stratum' => row['stratum'].to_s,
        'sex' => need_string(source, row['sex'], 'sex'),
        'age' => need_string(source, row['age'], 'age'),
        'year' => need_int(source, row['year'], 'year'),
        'month' => row['month'],
        'epiweek' => row['epiweek'],
        'date' => need_string(source, row['date'], 'date'),
        'metricValue' => row['metric_value'],
        'inReportingDelayPeriod' => row['in_reporting_delay_period'] == true
      }
    end
    { 'totalCount' => need_int(source, data['count'], 'count'), 'points' => points }
  end

  def fetch_ukhsa_metric_points(page_size: 10, fetch_impl: nil)
    url = "#{UKHSA_DASHBOARD_API_BASE_URL}#{UKHSA_DASHBOARD_METRIC_PATH}?page_size=#{page_size}"
    parse_ukhsa_metric_points(get_json('ukhsa-dashboard', url, fetch_impl: fetch_impl))
  end
end
