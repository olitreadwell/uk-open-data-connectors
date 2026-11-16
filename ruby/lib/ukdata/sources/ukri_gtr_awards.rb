# frozen_string_literal: true

module Ukdata
  module_function

  UKRI_GTR_API_BASE_URL = 'https://gtr.ukri.org/api/v3'
  UKRI_GTR_AWARDS_PATH = 'awards'
  DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE = 20
  MAX_UKRI_GTR_AWARD_PAGE_SIZE = 100

  def build_ukri_gtr_awards_url(query: nil, page: 1, page_size: 20)
    raise ArgumentError, "page must be a whole number of one or more, got #{page}" if page < 1
    unless page_size.between?(DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE, MAX_UKRI_GTR_AWARD_PAGE_SIZE)
      raise ArgumentError,
            "pageSize must be a whole number from #{DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE} " \
            "to #{MAX_UKRI_GTR_AWARD_PAGE_SIZE}, got #{page_size}"
    end

    params = [['page', page.to_s], ['size', page_size.to_s], %w[sortfield startDate],
              %w[sortorder D]]
    query_text = query.to_s.strip
    params << ['query', query_text] unless query_text.empty?
    "#{UKRI_GTR_API_BASE_URL}/#{UKRI_GTR_AWARDS_PATH}?#{URI.encode_www_form(params)}"
  end

  def ukri_person(source, value)
    return nil if value.nil?

    person = need_hash(source, value)
    {
      'firstName' => need_nullable_string(source, person['firstName'], 'firstName'),
      'surname' => need_nullable_string(source, person['surname'], 'surname'),
      'preferredName' => need_nullable_string(source, person['preferredName'], 'preferredName')
    }
  end

  def ukri_award(source, raw, seen)
    award = need_hash(source, need_hash(source, raw)['awardListItem'])
    award_id = need_string(source, award['id'], 'id')
    if seen.key?(award_id)
      raise UkSourceParseError.new(
        source, "#{award['projectTitle']} is listed more than once (#{award_id})"
      )
    end

    seen[award_id] = true
    {
      'id' => award_id,
      'projectTitle' => need_string(source, award['projectTitle'], 'projectTitle'),
      'projectStatus' => need_string(source, award['projectStatus'], 'projectStatus'),
      'grantRefNumber' => need_string(source, award['grantRefNumber'], 'grantRefNumber'),
      'grantCategory' => need_string(source, award['grantCategory'], 'grantCategory'),
      'fundingOrgName' => need_string(source, award['fundingOrgName'], 'fundingOrgName'),
      'fundingOrgLongName' => need_string(source, award['fundingOrgLongName'],
                                          'fundingOrgLongName'),
      'leadOrgId' => need_string(source, award['leadOrgId'], 'leadOrgId'),
      'leadOrgName' => need_string(source, award['leadOrgName'], 'leadOrgName'),
      'leadOrgRegion' => need_nullable_string(source, award['leadOrgRegion'], 'leadOrgRegion'),
      'leadOrgRole' => need_string(source, award['leadOrgRole'], 'leadOrgRole'),
      'startDate' => need_nullable_string(source, award['startDate'], 'startDate'),
      'endDate' => need_nullable_string(source, award['endDate'], 'endDate'),
      'totalGrantValue' => if award['totalGrantValue'].nil?
                             nil
                           else
                             need_number(
                               source, award['totalGrantValue'], 'totalGrantValue'
                             )
                           end,
      'leadPersonId' => need_nullable_string(source, award['leadPersonId'], 'leadPersonId'),
      'leadPersonName' => ukri_person(source, award['leadPersonName']),
      'projectPath' => need_string(source, award['uiPath'], 'uiPath'),
      'apiUrl' => need_string(source, award['href'], 'href')
    }
  end

  def parse_ukri_gtr_awards(payload)
    source = 'ukri-gtr-awards'
    data = need_hash(source, payload)
    paging = need_hash(source, data['paging'])
    common = need_hash(source, data['common'])
    seen = {}
    awards = need_array(source, data['awardList'], 'awardList').map do |raw|
      ukri_award(source, raw, seen)
    end
    page = need_int(source, paging['page'], 'page')
    size = need_int(source, paging['size'], 'size')
    if page < 1 || size < 1
      raise UkSourceParseError.new(source, 'paging must use positive whole numbers')
    end

    total_size = need_int(source, paging['totalSize'], 'totalSize')
    total_pages = need_int(source, paging['totalPages'], 'totalPages')
    if total_size.negative? || total_pages.negative?
      raise UkSourceParseError.new(source, 'paging totals must be zero or more')
    end

    {
      'page' => page,
      'pageSize' => size,
      'totalCount' => total_size,
      'totalPages' => total_pages,
      'lastDataRefreshDate' => need_string(source, common['lastDataRefreshDate'],
                                           'lastDataRefreshDate'),
      'awards' => awards
    }
  end

  def fetch_ukri_gtr_awards(query: nil, page: 1, page_size: DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE,
                            fetch_impl: nil)
    parse_ukri_gtr_awards(
      get_json('ukri-gtr-awards', build_ukri_gtr_awards_url(
                                    query: query, page: page, page_size: page_size
                                  ), { 'accept' => 'application/json' }, fetch_impl: fetch_impl)
    )
  end
end
