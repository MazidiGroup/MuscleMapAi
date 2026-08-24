// The watchOS app entry point.
//
// Single-target watch app (watchOS 7+ layout): there is no separate WatchKit
// extension, and the Info.plist carries `WKApplication`.
//
// The store is created and started here, before any view renders, because the
// outbox has to be read from disk and the link activated whether or not the
// user opens the app — a queued transfer can arrive while the app is not on
// screen, and its acknowledgement has to be recorded when it does.

import SwiftUI

@main
struct MuscleMapWatchApp: App {
  @Environment(\.scenePhase) private var scenePhase

  init() {
    // @MainActor initialisation of a shared store from an App initialiser is
    // safe: SwiftUI constructs App on the main actor.
    MainActor.assumeIsolated {
      WatchStore.shared.start()
    }
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .tint(Palette.accent)
        // The largest accessibility sizes are honoured; nothing here is laid
        // out at a fixed height that would clip them.
        .dynamicTypeSize(...DynamicTypeSize.accessibility3)
    }
    .onChange(of: scenePhase) { _, phase in
      Task { @MainActor in
        // Leaving the screen is the last safe moment to write a change that was
        // deferred to keep the crown from writing a file per detent.
        WatchStore.shared.persistIfDirty()
        // Coming back to the foreground is the cheapest moment to drain a
        // backlog the timer has been backing off on.
        if phase == .active { WatchStore.shared.flush() }
      }
    }
  }
}
