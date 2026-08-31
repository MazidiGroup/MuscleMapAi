// Raises every Pod's iOS deployment target to the app's own floor.
//
// Xcode 27 refuses to build targets below iOS 15.0, and several Pods still
// declare 9.0–13.4 (SDWebImage, RevenueCat, RNSVG, ...). The floor is applied
// in the Podfile's post_install — the one place CocoaPods lets a consumer
// override Pod build settings — and this plugin appends it after prebuild so
// `prebuild --clean` cannot silently drop it.

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const FLOOR = "15.1"; // matches expo-build-properties ios.deploymentTarget
const MARKER = "# [withPodDeploymentFloor]";

const SNIPPET = `
    ${MARKER} keep every Pod at or above the app's own deployment target.
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        v = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${FLOOR}' if v && Gem::Version.new(v) < Gem::Version.new('${FLOOR}')
      end
    end`;

module.exports = function withPodDeploymentFloor(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let text = fs.readFileSync(podfile, "utf8");
      if (text.includes(MARKER)) return config;
      // CocoaPods allows only ONE post_install hook per Podfile, so the floor
      // is inserted into the template's existing block rather than appended
      // as a block of its own.
      const anchor = /post_install do \|installer\|/;
      if (!anchor.test(text)) {
        throw new Error("[withPodDeploymentFloor] the Podfile has no post_install hook to extend.");
      }
      text = text.replace(anchor, `post_install do |installer|${SNIPPET}`);
      fs.writeFileSync(podfile, text);
      return config;
    },
  ]);
};
