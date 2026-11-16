# frozen_string_literal: true

require 'json'
require 'time'
require 'uri'

require_relative 'errors'
require_relative 'http'

module Ukdata
  Adapter = Struct.new(:id, :name, :auth, :description, :fetch_live, :parse, :load_fixture)
  Probe = Struct.new(:id, :name, :auth, :ok, :status, :sample)

  FIXTURES_DIR = File.expand_path('fixtures', __dir__)

  module_function

  def read_fixture_json(filename)
    JSON.parse(File.read(File.join(FIXTURES_DIR, filename), encoding: 'UTF-8'))
  end

  def read_fixture_text(filename)
    File.read(File.join(FIXTURES_DIR, filename), encoding: 'UTF-8')
  end

  def need_hash(source, payload)
    raise UkSourceParseError.new(source, 'expected a JSON object') unless payload.is_a?(Hash)

    payload
  end

  def need_array(source, value, label)
    unless value.is_a?(Array)
      raise UkSourceParseError.new(source, "expected \"#{label}\" to be a list")
    end

    value
  end

  def need_string(source, value, label)
    unless value.is_a?(String)
      raise UkSourceParseError.new(source, "expected \"#{label}\" to be text")
    end

    value
  end

  def need_number(source, value, label)
    unless value.is_a?(Numeric)
      raise UkSourceParseError.new(source, "expected \"#{label}\" to be a number")
    end

    value
  end

  def need_int(source, value, label)
    number = need_number(source, value, label)
    unless number.to_i == number
      raise UkSourceParseError.new(source, "expected \"#{label}\" to be a whole number")
    end

    number.to_i
  end

  def optional_text(value)
    return nil unless value.is_a?(String)

    stripped = value.strip
    stripped.empty? ? nil : stripped
  end

  def need_nullable_string(source, value, label)
    return nil if value.nil?

    need_string(source, value, label)
  end

  MARKUP_ENTITIES = {
    'amp' => '&', 'apos' => "'", 'gt' => '>', 'lt' => '<', 'nbsp' => ' ', 'quot' => '"'
  }.freeze

  def decode_markup_entities(text)
    text.gsub(/&(#x?[0-9a-f]+|[a-z]+);/i) do |entity|
      body = Regexp.last_match(1)
      if body.downcase.start_with?('#x')
        begin
          [body[2..].to_i(16)].pack('U')
        rescue RangeError
          entity
        end
      elsif body.start_with?('#')
        begin
          [body[1..].to_i].pack('U')
        rescue RangeError
          entity
        end
      else
        MARKUP_ENTITIES.fetch(body.downcase, entity)
      end
    end
  end

  def strip_markup(markup)
    decode_markup_entities(markup.gsub(/<[^>]*>/, ' ')).gsub(/\s+/, ' ').strip
  end

  def read_tag(block, tag)
    match = %r{<#{Regexp.escape(tag)}\b[^>]*>(.*?)</#{Regexp.escape(tag)}>}im.match(block)
    match && match[1]
  end

  def read_attribute(block, tag, attribute)
    match = /<#{Regexp.escape(tag)}\b[^>]*?\b#{Regexp.escape(attribute)}="([^"]*)"/im.match(block)
    match && match[1]
  end

  def read_number_tag(block, tag)
    raw = read_tag(block, tag)
    return nil if raw.nil?

    Integer(raw.strip, 10)
  rescue ArgumentError
    nil
  end
end

require_relative 'sources/flood_monitoring'
require_relative 'sources/ons_datasets'
require_relative 'sources/food_hygiene'
require_relative 'sources/tfl_bike_points'
require_relative 'sources/planning_datasets'
require_relative 'sources/ancient_woodland'
require_relative 'sources/bank_rate'
require_relative 'sources/police_crimes'
require_relative 'sources/carbon_intensity'
require_relative 'sources/parliament_seats'
require_relative 'sources/postcode_lookup'
require_relative 'sources/explore_education'
require_relative 'sources/ckan'
require_relative 'sources/tna_discovery'
require_relative 'sources/ukhsa_dashboard'
require_relative 'sources/nomis'
require_relative 'sources/fingertips'
require_relative 'sources/find_a_tender'
require_relative 'sources/tfl_line_status'
require_relative 'sources/neso_generation_mix'
require_relative 'sources/data_gov_uk_ckan'
require_relative 'sources/gov_uk_content'
require_relative 'sources/uk_parliament_committees'
require_relative 'sources/elexon_system_prices'
require_relative 'sources/ukri_gtr_awards'
require_relative 'sources/legislation_search'
require_relative 'sources/gazette_notices'
require_relative 'sources/ons_geography'
require_relative 'sources/neso_catalogue'
require_relative 'sources/bgs_wms'
require_relative 'sources/land_registry_price_paid'
require_relative 'sources/registry'
