require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'fressh-icloud'
  s.version        = package['version']
  s.summary        = 'iCloud container path for Fressh'
  s.homepage       = 'https://fressh.caritos.com'
  s.license        = 'MIT'
  s.author         = 'Eladio Caritos'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.source_files   = 'ios/**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.4'
end
