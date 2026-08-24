require 'json'

# Without this podspec the module is invisible to CocoaPods. Autolinking finds
# `expo-module.config.json` and reports `WatchLinkModule`, but there is no pod
# to install, so the class never reaches the generated
# `ExpoModulesProvider.swift` and every call from `src/watch/WatchLink.tsx`
# fails at runtime on a build that compiled cleanly.
Pod::Spec.new do |s|
  s.name           = 'WatchLink'
  s.version        = '1.0.0'
  s.summary        = 'iPhone side of the Apple Watch companion link (WCSession).'
  s.description    = 'Moves dictionaries between WCSession and JavaScript. All rules live in src/watch/*.ts.'
  s.author         = 'MazidiGroup'
  s.homepage       = 'https://github.com/MazidiGroup/MuscleMapAi'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/MazidiGroup/MuscleMapAi.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
