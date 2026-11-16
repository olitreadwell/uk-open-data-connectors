# frozen_string_literal: true

module Ukdata
  module_function

  GAZETTE_NOTICES_URL = 'https://www.thegazette.co.uk/all-notices/notice/data.json'

  def build_gazette_notices_url(query: nil, start_date: nil, end_date: nil, page: 1)
    raise ArgumentError, "page must be a positive whole number, got #{page}" if page < 1

    params = []
    query_text = query.to_s.strip
    params << ['text', query_text] unless query_text.empty?
    start_text = start_date.to_s.strip
    params << ['start-publish-date', start_text] unless start_text.empty?
    end_text = end_date.to_s.strip
    params << ['end-publish-date', end_text] unless end_text.empty?
    params << ['results-page', page.to_s] if page > 1
    params.empty? ? GAZETTE_NOTICES_URL : "#{GAZETTE_NOTICES_URL}?#{URI.encode_www_form(params)}"
  end

  def gazette_count(source, value, field)
    return value if value.is_a?(Integer)
    return Integer(value.strip, 10) if value.is_a?(String)

    raise UkSourceParseError.new(source, "the feed wrote #{value.inspect} for #{field}")
  rescue ArgumentError
    raise UkSourceParseError.new(source, "the feed wrote #{value.inspect} for #{field}")
  end

  def gazette_coordinate(value)
    return nil if value.nil?

    Float(value)
  rescue ArgumentError, TypeError
    nil
  end

  def gazette_notice_url(source, links)
    need_array(source, links, 'link').each do |raw|
      link = need_hash(source, raw)
      href = need_string(source, link['@href'], '@href')
      return href if !href.include?('/id/') && %r{/notice/\d+\z}.match?(href)
    end
    nil
  end

  def gazette_categories(source, value)
    return [] if value.nil?

    entries = value.is_a?(Array) ? value : [value]
    entries.map { |entry| need_string(source, need_hash(source, entry)['@term'], '@term') }
  end

  def gazette_notice(source, raw)
    entry = need_hash(source, raw)
    notice_id = need_string(source, entry['id'], 'id')
    title = need_string(source, entry['title'], 'title')
    raise UkSourceParseError.new(source, 'expected "id" to be text') if notice_id.empty?
    raise UkSourceParseError.new(source, 'expected "title" to be text') if title.empty?

    point_value = entry['geo:Point']
    point = point_value.nil? ? {} : need_hash(source, point_value)
    {
      'id' => notice_id,
      'noticeCode' => need_nullable_string(source, entry['f:notice-code'], 'f:notice-code'),
      'title' => title,
      'publishedAt' => need_nullable_string(source, entry['published'], 'published'),
      'updatedAt' => need_nullable_string(source, entry['updated'], 'updated'),
      'url' => gazette_notice_url(source, entry['link']),
      'categories' => gazette_categories(source, entry['category']),
      'latitude' => gazette_coordinate(point['geo:lat']),
      'longitude' => gazette_coordinate(point['geo:long']),
      'contentHtml' => need_nullable_string(source, entry['content'], 'content')
    }
  end

  def parse_gazette_notices(payload)
    source = 'gazette-notices'
    data = need_hash(source, payload)
    total = gazette_count(source, data['f:total'], 'f:total')
    page = gazette_count(source, data['f:page-number'], 'f:page-number')
    page_size = gazette_count(source, data['f:page-size'], 'f:page-size')
    entries_value = data['entry']
    entries = entries_value.nil? ? [] : need_array(source, entries_value, 'entry')
    {
      'totalCount' => total,
      'page' => page,
      'pageSize' => page_size,
      'notices' => entries.map { |entry| gazette_notice(source, entry) }
    }
  end

  def fetch_gazette_notices(query: nil, start_date: nil, end_date: nil, page: 1,
                            fetch_impl: nil)
    parse_gazette_notices(
      get_json('gazette-notices',
               build_gazette_notices_url(query: query, start_date: start_date,
                                         end_date: end_date, page: page),
               { 'accept' => 'application/json' }, fetch_impl: fetch_impl)
    )
  end
end
