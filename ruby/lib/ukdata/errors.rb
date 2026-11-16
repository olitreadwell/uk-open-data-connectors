# frozen_string_literal: true

module Ukdata
  # Base error for the UK data source adapters.
  class UkSourceError < StandardError; end

  # A source answered with a non-success HTTP status or the request failed.
  class UkSourceApiError < UkSourceError
    attr_reader :source

    def initialize(source, message)
      @source = source
      super("#{source}: #{message}")
    end
  end

  # A source returned a payload that did not match its expected shape.
  class UkSourceParseError < UkSourceError
    attr_reader :source

    def initialize(source, message)
      @source = source
      super("#{source}: #{message}")
    end
  end
end
