# frozen_string_literal: true

module Ukdata
  module_function

  GOV_UK_CONTENT_API_BASE_URL = 'https://www.gov.uk/api/content'
  DEFAULT_GOV_UK_CONTENT_PATH = '/government/how-government-works'
  GOV_UK_WEB_BASE_URL = 'https://www.gov.uk'

  def govuk_web_url(base_path)
    base_path == '/' ? "#{GOV_UK_WEB_BASE_URL}/" : "#{GOV_UK_WEB_BASE_URL}#{base_path}"
  end

  def govuk_link(source, value)
    row = need_hash(source, value)
    base_path = need_string(source, row['base_path'], 'base_path')
    web_url = need_nullable_string(source, row['web_url'], 'web_url')
    {
      'title' => need_nullable_string(source, row['title'], 'title'),
      'basePath' => base_path,
      'webUrl' => web_url || govuk_web_url(base_path)
    }
  end

  def govuk_links(source, links, key)
    value = links[key]
    return [] if value.nil?

    need_array(source, value, key).map { |item| govuk_link(source, item) }
  end

  def normalise_content_path(content_path)
    trimmed = content_path.strip
    return '/' if ['', '/'].include?(trimmed)

    with_leading_slash = trimmed.start_with?('/') ? trimmed : "/#{trimmed}"
    with_leading_slash.sub(%r{/+\z}, '')
  end

  def build_gov_uk_content_url(content_path = DEFAULT_GOV_UK_CONTENT_PATH)
    normalised = normalise_content_path(content_path)
    return GOV_UK_CONTENT_API_BASE_URL if normalised == '/'

    "#{GOV_UK_CONTENT_API_BASE_URL}#{URI::RFC2396_PARSER.escape(normalised)}"
  end

  def govuk_withdrawn?(content)
    withdrawn = content['withdrawn_notice']
    unless withdrawn.nil? || withdrawn.is_a?(Hash)
      raise UkSourceParseError.new('gov-uk-content', 'expected "withdrawn_notice" to be an object')
    end

    withdrawn.is_a?(Hash) && !withdrawn.empty?
  end

  def govuk_organisation_links(source, links)
    combined = govuk_links(source, links, 'organisations') +
               govuk_links(source, links, 'primary_publishing_organisation')
    combined.uniq { |link| link['basePath'] }
  end

  def parse_gov_uk_content(payload)
    source = 'gov-uk-content'
    content = need_hash(source, payload)
    links_value = content['links']
    links = links_value.nil? ? {} : need_hash(source, links_value)
    base_path = need_string(source, content['base_path'], 'base_path')
    {
      'contentId' => need_string(source, content['content_id'], 'content_id'),
      'basePath' => base_path,
      'webUrl' => govuk_web_url(base_path),
      'title' => need_nullable_string(source, content['title'], 'title'),
      'description' => need_nullable_string(source, content['description'], 'description'),
      'documentType' => need_string(source, content['document_type'], 'document_type'),
      'schemaName' => need_string(source, content['schema_name'], 'schema_name'),
      'locale' => need_string(source, content['locale'], 'locale'),
      'phase' => need_nullable_string(source, content['phase'], 'phase'),
      'firstPublishedAt' => need_nullable_string(source, content['first_published_at'],
                                                 'first_published_at'),
      'publicUpdatedAt' => need_nullable_string(source, content['public_updated_at'],
                                                'public_updated_at'),
      'updatedAt' => need_nullable_string(source, content['updated_at'], 'updated_at'),
      'isWithdrawn' => govuk_withdrawn?(content),
      'taxons' => govuk_links(source, links, 'taxons'),
      'organisations' => govuk_organisation_links(source, links),
      'availableTranslationCount' => govuk_links(source, links, 'available_translations').length
    }
  end

  def fetch_gov_uk_content(path: DEFAULT_GOV_UK_CONTENT_PATH, fetch_impl: nil)
    parse_gov_uk_content(
      get_json('gov-uk-content', build_gov_uk_content_url(path), fetch_impl: fetch_impl)
    )
  end
end
