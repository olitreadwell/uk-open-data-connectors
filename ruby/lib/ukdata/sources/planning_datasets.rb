# frozen_string_literal: true

module Ukdata
  module_function

  PLANNING_DATASETS_URL = 'https://www.planning.data.gov.uk/dataset.json'

  def parse_planning_datasets(payload)
    source = 'planning-datasets'
    datasets = need_array(source, need_hash(source, payload)['datasets'], 'datasets')
    datasets.filter_map do |item|
      row = need_hash(source, item)
      next unless row['realm'] == 'dataset'

      {
        'dataset' => need_string(source, row['dataset'], 'dataset'),
        'name' => need_string(source, row['name'], 'name'),
        'entityCount' => need_int(source, row['entity-count'], 'entity-count'),
        'themes' => need_array(source, row.fetch('themes', []), 'themes'),
        'typology' => row['typology'].to_s,
        'phase' => row['phase'].to_s,
        'licence' => row['licence'].to_s
      }
    end
  end

  def fetch_planning_datasets(fetch_impl: nil)
    parse_planning_datasets(get_json('planning-datasets', PLANNING_DATASETS_URL,
                                     fetch_impl: fetch_impl))
  end
end
