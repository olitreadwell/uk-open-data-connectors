# frozen_string_literal: true

require 'json'
require 'net/http'
require 'timeout'
require 'uri'

require_relative 'errors'

module Ukdata
  USER_AGENT = 'uk-open-data-connectors (Language=Ruby)'
  DEFAULT_TIMEOUT_MS = 30_000

  module_function

  def get_text(source, url, headers = {}, fetch_impl: nil)
    request_headers = { 'user-agent' => USER_AGENT }.merge(headers)
    if fetch_impl
      begin
        raw = fetch_impl.call(url, request_headers)
      rescue UkSourceApiError
        raise
      rescue StandardError => e
        raise UkSourceApiError.new(source, "request failed: #{e.message}")
      end
      return raw.dup.force_encoding('UTF-8')
    end

    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    http.open_timeout = http.read_timeout = DEFAULT_TIMEOUT_MS / 1000.0
    request = Net::HTTP::Get.new(uri)
    request_headers.each { |name, value| request[name] = value }
    response = http.request(request)
    status = response.code.to_i
    raise UkSourceApiError.new(source, "HTTP #{status}") unless status.between?(200, 299)

    response.body.to_s.force_encoding('UTF-8')
  rescue UkSourceApiError
    raise
  rescue StandardError => e
    raise UkSourceApiError.new(source, "request failed: #{e.message}")
  end

  def get_json(source, url, headers = {}, fetch_impl: nil)
    JSON.parse(get_text(source, url, headers, fetch_impl: fetch_impl))
  rescue JSON::ParserError
    raise UkSourceParseError.new(source, 'invalid JSON')
  end
end
