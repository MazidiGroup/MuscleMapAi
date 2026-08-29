// Adds the watchOS companion to the generated Xcode project.
//
// This app is managed: there is no `ios/` directory in the repository, so the
// Xcode project does not exist until `expo prebuild` runs on the build machine.
// A watch app is native Swift and needs a real target, so that target has to be
// created at prebuild time — which is what this plugin does. The Swift sources
// live in `targets/watch/` under version control and are copied into the
// generated project; nothing here generates code.
//
// Two safety rules, because this runs against a shipping app's build:
//
//   · It is idempotent. Prebuild is frequently run over an existing `ios/`
//     directory, and adding the target twice would produce a project that
//     builds two watch apps and embeds both.
//   · It fails LOUDLY. A plugin that silently skips leaves a build that
//     succeeds and quietly ships without the feature, which is far worse than
//     a build that stops and says why.
//
// Verified only by review: this environment has no macOS, no Xcode and no
// prebuilt project, so the first real check is `npx expo prebuild -p ios` on a
// Mac. See docs/apple-watch.md for that checklist.

const fs = require("fs");
const path = require("path");

const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");

const TARGET_NAME = "MuscleMapWatch";
const SOURCE_DIR = path.join("targets", "watch");
const WATCHOS_DEPLOYMENT_TARGET = "10.0";
/** Swift only — no bridging header, and no Objective-C in the watch target. */
const SWIFT_VERSION = "5.0";

/** Files copied verbatim into the generated target directory. */
/**
 * Bundled flipbook packs for the form-preview page (folder reference). One
 * subdirectory per exercise id, laid out exactly like the server/cache pack
 * (NN.jpg + pack.json) so the loader can seed from it without translation.
 */
const FRAMES_DIR = "BundledFramePacks";

/** Asset catalog holding the watch AppIcon — ASC rejects an iconless watch app (90713). */
const ASSETS_DIR = "Assets.xcassets";

const SWIFT_SOURCES = [
  "Model.swift",
  "Rules.swift",
  "Sync.swift",
  "Store.swift",
  "Views.swift",
  "Intents.swift",
  "WatchApp.swift",
];

/**
 * Copies the watch sources into `ios/<TARGET_NAME>/`.
 *
 * The Info.plist is renamed to `<TARGET_NAME>-Info.plist` because that is the
 * path `xcode`'s `addTarget` writes into the build settings, and disagreeing
 * with it produces a target that compiles and then fails to launch.
 */
function withWatchSources(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const from = path.join(projectRoot, SOURCE_DIR);
      const to = path.join(platformRoot, TARGET_NAME);

      if (!fs.existsSync(from)) {
        throw new Error(
          `[withWatchTarget] ${SOURCE_DIR} is missing. The watch companion cannot be built without it.`,
        );
      }

      fs.mkdirSync(to, { recursive: true });

      for (const file of SWIFT_SOURCES) {
        const source = path.join(from, file);
        if (!fs.existsSync(source)) {
          throw new Error(`[withWatchTarget] ${SOURCE_DIR}/${file} is missing.`);
        }
        fs.copyFileSync(source, path.join(to, file));
      }

      const plist = path.join(from, "Info.plist");
      if (!fs.existsSync(plist)) {
        throw new Error(`[withWatchTarget] ${SOURCE_DIR}/Info.plist is missing.`);
      }
      fs.copyFileSync(plist, path.join(to, `${TARGET_NAME}-Info.plist`));

      // The bundled frame pack. Prebuild --clean rebuilds ios/ from nothing,
      // and a build without these ships green with a dead preview page — the
      // same silent-omission class as losing the watch target itself.
      const framesFrom = path.join(from, FRAMES_DIR);
      if (!fs.existsSync(framesFrom)) {
        throw new Error(`[withWatchTarget] ${SOURCE_DIR}/${FRAMES_DIR} is missing.`);
      }
      const packs = fs
        .readdirSync(framesFrom)
        .filter((d) =>
          fs.existsSync(path.join(framesFrom, d, "pack.json")) &&
          fs.existsSync(path.join(framesFrom, d, "00.jpg")),
        );
      if (packs.length === 0) {
        throw new Error(`[withWatchTarget] ${SOURCE_DIR}/${FRAMES_DIR} holds no complete pack.`);
      }
      const framesTo = path.join(to, FRAMES_DIR);
      fs.rmSync(framesTo, { recursive: true, force: true });
      fs.cpSync(framesFrom, framesTo, { recursive: true });

      // The icon catalog. App Store Connect refuses a watch app without
      // CFBundleIconName + a compiled AppIcon (ITMS-90713).
      const assetsFrom = path.join(from, ASSETS_DIR);
      if (!fs.existsSync(path.join(assetsFrom, "AppIcon.appiconset", "AppIcon.png"))) {
        throw new Error(`[withWatchTarget] ${SOURCE_DIR}/${ASSETS_DIR} is missing its AppIcon.`);
      }
      const assetsTo = path.join(to, ASSETS_DIR);
      fs.rmSync(assetsTo, { recursive: true, force: true });
      fs.cpSync(assetsFrom, assetsTo, { recursive: true });

      return config;
    },
  ]);
}

/** True when a previous prebuild already added the target. */
function findExistingTarget(project) {
  const targets = project.pbxNativeTargetSection();
  for (const key of Object.keys(targets)) {
    if (key.endsWith("_comment")) continue;
    const name = String(targets[key].name || "").replace(/"/g, "");
    if (name === TARGET_NAME) return key;
  }
  return null;
}

/**
 * The Apple Team ID to sign the watch target with.
 *
 * Prebuild runs BEFORE EAS assigns credentials, so the team cannot be read back
 * off the project — it has to be supplied. Set APPLE_TEAM_ID in the build
 * environment to override.
 */
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "JWAX6S948T";

function applyBuildSettings(project, targetUuid, { bundleId, marketingVersion, buildNumber, appleTeamId }) {
  const configurations = project.pbxXCBuildConfigurationSection();
  const target = project.pbxNativeTargetSection()[targetUuid];
  const listUuid = target.buildConfigurationList;
  const lists = project.pbxXCConfigurationList();
  const buildConfigurations = lists[listUuid].buildConfigurations;

  for (const entry of buildConfigurations) {
    const settings = configurations[entry.value].buildSettings;

    // A watch target that inherits the iOS SDK compiles and then cannot be
    // installed, so these four are the ones that actually make it a watch app.
    settings.SDKROOT = "watchos";
    settings.TARGETED_DEVICE_FAMILY = '"4"';
    settings.WATCHOS_DEPLOYMENT_TARGET = WATCHOS_DEPLOYMENT_TARGET;
    settings.SUPPORTED_PLATFORMS = '"watchsimulator watchos"';

    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${bundleId}"`;
    settings.PRODUCT_NAME = `"${TARGET_NAME}"`;
    settings.INFOPLIST_FILE = `"${TARGET_NAME}/${TARGET_NAME}-Info.plist"`;
    // The plist is checked in and complete; letting Xcode synthesise one would
    // drop WKCompanionAppBundleIdentifier and unpair the app from the phone.
    settings.GENERATE_INFOPLIST_FILE = "NO";

    // SIGNING. EAS assigns a provisioning profile to the MAIN target only — it
    // has no idea a second bundle id exists — so without a team here the archive
    // stops at "Signing for MuscleMapWatch requires a development team". EAS
    // surfaces that as "resource bundles are signed by default, downgrade Xcode
    // or upgrade to SDK 46", which is a generic pattern-match on the wording and
    // is entirely misleading; the real line sits one level deeper in the Xcode
    // log. Setting the team is NECESSARY BUT NOT SUFFICIENT — an App Store
    // archive also needs its own provisioning profile for the watch bundle id.
    //
    // The team is read from the environment so it is never pinned to one
    // account, with the shipping team as the fallback. An Apple Team ID is not a
    // secret: it appears in every provisioning profile and inside every IPA.
    if (appleTeamId) {
      settings.DEVELOPMENT_TEAM = appleTeamId;
    }

    settings.SWIFT_VERSION = SWIFT_VERSION;
    settings.SWIFT_EMIT_LOC_STRINGS = "YES";
    settings.CLANG_ENABLE_MODULES = "YES";
    settings.ALWAYS_SEARCH_USER_PATHS = "NO";
    // YES: the watch app reaches the IPA through the Embed Watch Content
    // phase. NO installs a second copy at the archive's top level, which
    // demotes it to a "Generic Xcode Archive" that exportArchive refuses.
    settings.SKIP_INSTALL = "YES";
    settings.ASSETCATALOG_COMPILER_APPICON_NAME = "AppIcon";
    settings.CURRENT_PROJECT_VERSION = `"${buildNumber}"`;
    settings.MARKETING_VERSION = `"${marketingVersion}"`;
    settings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks"';
    settings.SUPPORTS_MACCATALYST = "NO";
    settings.SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = "NO";
    settings.INFOPLIST_KEY_UISupportedInterfaceOrientations = '"UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown"';
  }
}

function withWatchXcodeTarget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;

    if (findExistingTarget(project)) {
      // Already added by an earlier prebuild in this directory. Re-running must
      // not embed a second copy.
      return config;
    }

    const appBundleId = config.ios?.bundleIdentifier;
    if (!appBundleId) {
      throw new Error("[withWatchTarget] ios.bundleIdentifier is not set; the watch app cannot be paired.");
    }
    // The suffix is not cosmetic: watchOS requires the companion's identifier to
    // be a child of the iPhone app's.
    const bundleId = `${appBundleId}.watchkitapp`;

    // `addTarget` registers the app -> watch dependency itself, but
    // `addTargetDependency` wraps that work in
    // `if (pbxContainerItemProxySection && pbxTargetDependencySection)` and
    // returns quietly when either is absent. A managed Expo project has one
    // target and no dependencies, so neither section exists and the dependency
    // was being dropped in silence — leaving an "Embed Watch Content" phase
    // with nothing ordered before it. Create the sections first so the
    // library's own call lands.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    const target = project.addTarget(TARGET_NAME, "watch2_app", TARGET_NAME, bundleId);

    // A single-target watch app (watchOS 7+, `WKApplication` in the plist) is a
    // plain application product, not the old watchapp2 wrapper. `xcode` only
    // knows the older type, and its embed phase and dependency are still the
    // ones we want — so take those and correct the product type.
    project.pbxNativeTargetSection()[target.uuid].productType = '"com.apple.product-type.application"';

    project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

    // Only the plist is listed here. `addSourceFile` below creates its own file
    // reference AND the Sources build-phase entry, so naming the Swift files
    // here as well produced two references per file — the compiled one and a
    // stray duplicate.
    const group = project.addPbxGroup(
      [`${TARGET_NAME}-Info.plist`],
      TARGET_NAME,
      TARGET_NAME,
    );

    // Hang the group off the project root so the sources are visible in Xcode
    // rather than only present on disk.
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      if (key.endsWith("_comment")) continue;
      if (groups[key].name === undefined && groups[key].path === undefined) {
        project.addToPbxGroup(group.uuid, key);
        break;
      }
    }

    // The path is relative to the GROUP, and the group already carries
    // `path = MuscleMapWatch`. Prefixing the target name again produced
    // `MuscleMapWatch/MuscleMapWatch/Model.swift` — seven file references that
    // resolved to nothing, sitting in the Sources phase where they are the only
    // copies the compiler ever sees.
    for (const file of SWIFT_SOURCES) {
      project.addSourceFile(file, { target: target.uuid }, group.uuid);
    }

    // The frame pack rides as a BLUE FOLDER reference: one entry that copies
    // the whole directory into the bundle, so frames can be regenerated
    // without touching the project again. `xcode` has no folder-reference
    // helper, so the objects are written directly — a file reference of type
    // folder, hung on the watch group, named in the watch Resources phase.
    const folderRefUuid = project.generateUuid();
    project.hash.project.objects.PBXFileReference[folderRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder",
      path: FRAMES_DIR,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[`${folderRefUuid}_comment`] = FRAMES_DIR;
    project.addToPbxGroup({ fileRef: folderRefUuid, basename: FRAMES_DIR }, group.uuid);
    const buildFileUuid = project.generateUuid();
    project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: folderRefUuid,
      fileRef_comment: FRAMES_DIR,
    };
    project.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] = `${FRAMES_DIR} in Resources`;
    const resourcesPhase = project.buildPhaseObject("PBXResourcesBuildPhase", "Resources", target.uuid);
    if (!resourcesPhase) {
      throw new Error("[withWatchTarget] the watch Resources phase is missing; frames cannot be bundled.");
    }
    resourcesPhase.files.push({ value: buildFileUuid, comment: `${FRAMES_DIR} in Resources` });

    // The icon catalog goes through actool, so it is a real asset-catalog
    // reference rather than a plain folder like the frames.
    const assetsRefUuid = project.generateUuid();
    project.hash.project.objects.PBXFileReference[assetsRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder.assetcatalog",
      path: ASSETS_DIR,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[`${assetsRefUuid}_comment`] = ASSETS_DIR;
    project.addToPbxGroup({ fileRef: assetsRefUuid, basename: ASSETS_DIR }, group.uuid);
    const assetsBuildUuid = project.generateUuid();
    project.hash.project.objects.PBXBuildFile[assetsBuildUuid] = {
      isa: "PBXBuildFile",
      fileRef: assetsRefUuid,
      fileRef_comment: ASSETS_DIR,
    };
    project.hash.project.objects.PBXBuildFile[`${assetsBuildUuid}_comment`] = `${ASSETS_DIR} in Resources`;
    resourcesPhase.files.push({ value: assetsBuildUuid, comment: `${ASSETS_DIR} in Resources` });

    // The dependency is what orders the watch build before the embed phase, so
    // assert it rather than trusting a call that is documented to fail quietly.
    const appTarget = project.getFirstTarget();
    const dependencies = project.pbxNativeTargetSection()[appTarget.uuid]?.dependencies || [];
    if (dependencies.length === 0) {
      throw new Error(
        "[withWatchTarget] the iPhone target has no dependency on the watch app; " +
          "'Embed Watch Content' would copy an unbuilt product.",
      );
    }

    applyBuildSettings(project, target.uuid, {
      bundleId,
      marketingVersion: config.version || "1.0.0",
      buildNumber: config.ios?.buildNumber || "1",
      appleTeamId: APPLE_TEAM_ID,
    });

    return config;
  });
}

/**
 * Siri needs a usage description on the iPhone app too — the watch's plist
 * covers the watch, and an intent invoked from the phone is refused without it.
 */
function withSiriUsage(config) {
  config.ios = config.ios || {};
  config.ios.infoPlist = config.ios.infoPlist || {};
  if (!config.ios.infoPlist.NSSiriUsageDescription) {
    config.ios.infoPlist.NSSiriUsageDescription =
      "Muscle Map uses Siri so you can log a set by saying how many reps you did, without touching your phone.";
  }
  return config;
}

/**
 * EAS resolves signing credentials from the app config BEFORE prebuild runs, and
 * it only knows about targets declared here — an undeclared watch app gets no
 * provisioning profile and the archive fails with "requires a development team".
 *
 * This is set from the plugin rather than left in app.json alone because the
 * Emergent publish wrapper rewrites app.json and replaces `extra.eas` with a bare
 * `{ projectId }`, which would silently drop a static declaration. Merging here
 * runs after that rewrite. The app.json entry is kept too, so a plain
 * `expo prebuild` outside the managed pipeline behaves identically.
 */
function withEasAppExtension(config) {
  const appBundleId = config.ios?.bundleIdentifier;
  if (!appBundleId) return config;

  const extra = (config.extra = config.extra || {});
  const eas = (extra.eas = extra.eas || {});
  const build = (eas.build = eas.build || {});
  const experimental = (build.experimental = build.experimental || {});
  const ios = (experimental.ios = experimental.ios || {});
  const extensions = (ios.appExtensions = ios.appExtensions || []);

  if (!extensions.some((entry) => entry?.targetName === TARGET_NAME)) {
    extensions.push({
      targetName: TARGET_NAME,
      bundleIdentifier: `${appBundleId}.watchkitapp`,
    });
  }
  return config;
}
module.exports = function withWatchTarget(config) {
  config = withEasAppExtension(config);
  config = withSiriUsage(config);
  config = withWatchSources(config);
  config = withWatchXcodeTarget(config);
  return config;
};

// Exported for the plugin's own unit test, which checks the constants the
// generated project depends on without needing Xcode.
module.exports.TARGET_NAME = TARGET_NAME;
module.exports.SWIFT_SOURCES = SWIFT_SOURCES;
module.exports.WATCHOS_DEPLOYMENT_TARGET = WATCHOS_DEPLOYMENT_TARGET;
module.exports.SOURCE_DIR = SOURCE_DIR;
module.exports.APPLE_TEAM_ID = APPLE_TEAM_ID;
