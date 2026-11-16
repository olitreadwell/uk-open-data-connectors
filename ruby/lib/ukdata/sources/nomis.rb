# frozen_string_literal: true

module Ukdata
  module_function

  NOMIS_DATASET_DEFINITIONS_URL = 'https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json'

  def nomis_annotation(annotations, title)
    match = annotations.find do |annotation|
      annotation.is_a?(Hash) && annotation['annotationtitle'] == title
    end
    return '' if match.nil?

    match['annotationtext'].nil? ? '' : match['annotationtext'].to_s
  end

  def parse_nomis_dataset_definitions(payload)
    source = 'nomis'
    structure = need_hash(source, need_hash(source, payload)['structure'])
    keyfamilies = structure['keyfamilies']
    rows = keyfamilies.is_a?(Hash) ? keyfamilies['keyfamily'] || [] : []
    need_array(source, rows, 'keyfamily').map do |raw|
      row = need_hash(source, raw)
      annotations_box = row['annotations']
      annotations = annotations_box.is_a?(Hash) ? annotations_box['annotation'] || [] : []
      name = row['name']
      {
        'id' => need_string(source, row['id'], 'id'),
        'name' => name.is_a?(Hash) ? name['value'].to_s : '',
        'agencyId' => need_string(source, row['agencyid'], 'agencyid'),
        'version' => need_int(source, row['version'], 'version'),
        'uri' => need_string(source, row['uri'], 'uri'),
        'status' => nomis_annotation(annotations, 'Status'),
        'keywords' => nomis_annotation(annotations, 'Keywords'),
        'units' => nomis_annotation(annotations, 'Units'),
        'lastUpdated' => nomis_annotation(annotations, 'LastUpdated')
      }
    end
  end

  def fetch_nomis_dataset_definitions(fetch_impl: nil)
    parse_nomis_dataset_definitions(get_json('nomis', NOMIS_DATASET_DEFINITIONS_URL,
                                             fetch_impl: fetch_impl))
  end
end
