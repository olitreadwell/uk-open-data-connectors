# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name = 'ukdata'
  spec.version = '0.1.0'
  spec.summary = 'Connectors for UK public data'
  spec.description = 'Keyless connectors for 34 UK public data sources, ported from the TypeScript package.'
  spec.authors = ['Oli Treadwell']
  spec.email = ['oliver.treadwell@gmail.com']
  spec.license = 'MIT'
  spec.homepage = 'https://github.com/olitreadwell/uk-open-data-connectors'
  spec.required_ruby_version = '>= 3.0'
  spec.files = Dir['lib/**/*.rb'] + Dir['lib/ukdata/fixtures/**/*']
  spec.require_paths = ['lib']
  spec.add_development_dependency 'minitest', '~> 5.0'
  spec.add_development_dependency 'rake', '~> 13.0'
  spec.add_development_dependency 'rubocop', '~> 1.0'
  spec.add_development_dependency 'simplecov', '~> 0.22'
end
