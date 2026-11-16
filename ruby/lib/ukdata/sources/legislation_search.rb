# frozen_string_literal: true

module Ukdata
  module_function

  LEGISLATION_SEARCH_URL = 'https://www.legislation.gov.uk/search/data.feed'
  DEFAULT_LEGISLATION_QUERY = 'environment'

  def legislation_language_text(markup, language)
    match = %r{<span\b[^>]*xml:lang="#{Regexp.escape(language)}"[^>]*>(.*?)</span>}im.match(markup)
    text = strip_markup(match ? match[1] : '')
    text.empty? ? nil : text
  end

  def legislation_canonical_url(entry)
    entry.scan(%r{<link\b([^>]*)/?>}im).each do |attributes|
      next if /\brel=/i.match?(attributes.first)

      href = /(?:^|\s)href="([^"]*)"/i.match(attributes.first)
      return href[1] if href
    end
    nil
  end

  def legislation_summary(entry)
    summary = read_tag(entry, 'summary')
    return nil if summary.nil?

    english = %r{<p\b[^>]*xml:lang="en"[^>]*>(.*?)</p>}im.match(summary)
    text = strip_markup(english ? english[1] : summary)
    text.empty? ? nil : text
  end

  def legislation_subjects(entry)
    entry.scan(/<ukm:Subject\b[^>]*\bValue="([^"]*)"/im).flatten.reject(&:empty?).uniq
  end

  def legislation_titles(entry, index)
    raw_title = read_tag(entry, 'title')
    if raw_title.nil?
      raise UkSourceParseError.new('legislation-search',
                                   "search result #{index + 1} has no title")
    end

    title_welsh = legislation_language_text(raw_title, 'cy')
    english = legislation_language_text(raw_title, 'en')
    title = english || strip_markup(raw_title)
    if title.empty?
      raise UkSourceParseError.new('legislation-search',
                                   "search result #{index + 1} has no title")
    end

    [title, title_welsh]
  end

  def legislation_result(source, entry, index)
    title, title_welsh = legislation_titles(entry, index)
    entry_id = strip_markup(read_tag(entry, 'id').to_s)
    raise UkSourceParseError.new(source, "search result #{index + 1} has no id") if entry_id.empty?

    year_text = read_attribute(entry, 'ukm:Year', 'Value')
    number_text = read_attribute(entry, 'ukm:Number', 'Value')
    updated = read_tag(entry, 'updated')
    published = read_tag(entry, 'published')
    {
      'id' => entry_id,
      'title' => title,
      'titleWelsh' => title_welsh,
      'url' => legislation_canonical_url(entry),
      'type' => read_attribute(entry, 'ukm:DocumentMainType', 'Value'),
      'year' => year_text.nil? ? nil : Integer(year_text, 10),
      'number' => number_text.nil? ? nil : Integer(number_text, 10),
      'updatedAt' => updated&.strip,
      'publishedAt' => published&.strip,
      'subjects' => legislation_subjects(entry),
      'summary' => legislation_summary(entry)
    }
  end

  def build_legislation_search_url(query: nil, page: 1)
    selected = query.to_s.strip
    selected = DEFAULT_LEGISLATION_QUERY if selected.empty?
    raise ArgumentError, "page must be a positive whole number, got #{page}" if page < 1

    params = [['text', selected]]
    params << ['page', page.to_s] if page > 1
    "#{LEGISLATION_SEARCH_URL}?#{URI.encode_www_form(params)}"
  end

  def parse_legislation_search(payload)
    source = 'legislation-search'
    unless payload.is_a?(String)
      raise UkSourceParseError.new(source,
                                   'expected an Atom feed as text')
    end
    unless /<feed\b/i.match?(payload)
      raise UkSourceParseError.new(source,
                                   'the response is not an Atom feed')
    end

    query_tag = /<openSearch:Query\b[^>]*>/i.match(payload)
    query = query_tag ? read_attribute(query_tag[0], 'openSearch:Query', 'searchTerms') : nil
    results = payload.scan(%r{<entry\b[^>]*>(.*?)</entry>}im).each_with_index.map do |match, index|
      legislation_result(source, match.first, index)
    end
    page = read_number_tag(payload, 'leg:page')
    items_per_page = read_number_tag(payload, 'openSearch:itemsPerPage')
    more_pages = read_number_tag(payload, 'leg:morePages')
    {
      'query' => query || '',
      'page' => page.nil? ? 1 : page,
      'itemsPerPage' => items_per_page.nil? ? 0 : items_per_page,
      'morePages' => more_pages.nil? ? 0 : more_pages,
      'results' => results
    }
  end

  def fetch_legislation_search(query: nil, page: 1, fetch_impl: nil)
    parse_legislation_search(
      get_text('legislation-search', build_legislation_search_url(query: query, page: page),
               { 'accept' => 'application/atom+xml' }, fetch_impl: fetch_impl)
    )
  end
end
