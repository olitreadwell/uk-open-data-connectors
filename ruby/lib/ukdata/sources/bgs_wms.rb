# frozen_string_literal: true

module Ukdata
  module_function

  BGS_WMS_SOURCE_ID = 'bgs-opengeoscience-wms'
  BGS_WMS_CAPABILITIES_URL =
    'https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer' \
    '?service=WMS&request=GetCapabilities'

  def bgs_bounds(payload)
    box = %r{<EX_GeographicBoundingBox\b[^>]*>(.*?)</EX_GeographicBoundingBox>}im.match(payload)
    return nil if box.nil?

    values = {}
    {
      'west' => 'westBoundLongitude',
      'east' => 'eastBoundLongitude',
      'south' => 'southBoundLatitude',
      'north' => 'northBoundLatitude'
    }.each do |name, tag|
      raw = read_tag(box[1], tag)
      return nil if raw.nil?

      values[name] = Float(raw)
    rescue ArgumentError
      return nil
    end
    values
  end

  def bgs_layer(source, match)
    attributes = match[0]
    block = match[1]
    name = strip_markup(read_tag(block, 'Name').to_s)
    return nil if name.empty?

    title = strip_markup(read_tag(block, 'Title').to_s)
    raise UkSourceParseError.new(source, "layer #{name.inspect} has no title") if title.empty?

    crs = block.scan(%r{<CRS\b[^>]*>(.*?)</CRS>}im).flatten.map { |raw| strip_markup(raw) }
    {
      'name' => name,
      'title' => title,
      'queryable' => /\bqueryable="1"/i.match?(attributes),
      'crs' => crs
    }
  end

  def parse_bgs_wms_capabilities(payload)
    source = BGS_WMS_SOURCE_ID
    unless payload.is_a?(String)
      raise UkSourceParseError.new(source, 'expected a WMS capabilities document as text')
    end
    unless /<WMS_Capabilities\b/i.match?(payload)
      raise UkSourceParseError.new(source, 'the response is not a WMS capabilities document')
    end

    version_match = /<WMS_Capabilities\b[^>]*\bversion="([^"]+)"/im.match(payload)
    version = version_match ? version_match[1] : ''
    raise UkSourceParseError.new(source, 'the document has no WMS version') if version.strip.empty?

    service = read_tag(payload, 'Service') || ''
    title = strip_markup(read_tag(service, 'Title').to_s)
    raise UkSourceParseError.new(source, 'the document has no service title') if title.empty?

    abstract = strip_markup(read_tag(service, 'Abstract').to_s)
    layers = bgs_layers(source, payload)
    raise UkSourceParseError.new(source, 'the document has no named layer') if layers.empty?

    {
      'version' => version,
      'title' => title,
      'abstract' => abstract.empty? ? nil : abstract,
      'layers' => layers,
      'geographicBounds' => bgs_bounds(payload)
    }
  end

  def bgs_layers(source, payload)
    matches = payload.scan(%r{<Layer\b([^>]*)>(.*?)(?=<Layer\b|</Layer>)}im)
    matches.filter_map { |match| bgs_layer(source, match) }
  end

  def fetch_bgs_wms_capabilities(fetch_impl: nil)
    parse_bgs_wms_capabilities(
      get_text(BGS_WMS_SOURCE_ID, BGS_WMS_CAPABILITIES_URL, { 'accept' => 'text/xml' },
               fetch_impl: fetch_impl)
    )
  end
end
