// The watch screens.
//
// Every voice command has a control here. Voice is the shortcut, not the only
// way in: Siri fails in a loud gym, with a wet screen, and on a bad connection,
// and a logging app that only works when speech recognition does is a logging
// app that loses sessions.
//
// Design follows the phone's: warm graphite grounds, one copper accent, a single
// 22 pt corner radius, and NO outline at rest — selection is an accent outline
// over an unchanged fill, and a resting border is the control's own fill colour
// rather than transparent, which on a rounded filled view leaves a seam along
// the curve.

import SwiftUI
import WatchKit

enum Palette {
  /// The Night copper. The watch has no light mode worth designing for.
  static let accent = Color(red: 0.89, green: 0.60, blue: 0.36)
  static let ground = Color(red: 0.07, green: 0.07, blue: 0.075)
  static let surface = Color(red: 0.13, green: 0.13, blue: 0.14)
  static let text = Color.white
  static let muted = Color.white.opacity(0.62)
  static let done = Color(red: 0.24, green: 0.86, blue: 0.59)
  static let radius: CGFloat = 22

  /// watchOS reserves a generous top inset for the system clock, and a dial-led
  /// layout sitting inside all of it reads as pinned to the bottom of the
  /// display. A few points are reclaimed at the root so every screen moves
  /// together — this is the one number to change if it wants more or less.
  static let topLift: CGFloat = 10
}

struct RootView: View {
  @ObservedObject private var store = WatchStore.shared

  var body: some View {
    Group {
      if store.isLocked {
        LockedView(basis: store.access.basis)
      } else if store.snapshot.sessionId == nil {
        IdleView()
      } else {
        ActiveWorkoutView()
      }
    }
    // No background of its own. `Palette.ground` is a hair lighter than the
    // watch's true black, and applied to a Group it painted only the content's
    // own frame — which read as a grey band floating on the black bezel rather
    // than as a screen. watchOS already gives us black.
    //
    // Applied here rather than per screen: Locked, Idle and both workout pages
    // all sat low, and one root offset keeps them level with each other.
    .padding(.top, -Palette.topLift)
    #if targetEnvironment(simulator)
      .onAppear { store.seedForAnimationShot() }
    #endif
    .confirmationDialog(
      store.lastFeedback?.message ?? "",
      isPresented: Binding(
        get: { store.pendingConfirmation != nil },
        set: { if !$0 { store.cancelPending() } })
    ) {
      Button("Undo", role: .destructive) { store.confirmPending() }
      Button("Keep it", role: .cancel) { store.cancelPending() }
    }
  }
}

// MARK: - Locked

struct LockedView: View {
  let basis: AccessBasis
  @ObservedObject private var store = WatchStore.shared

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        Text("Apple Watch logging")
          .font(.headline)
          .foregroundStyle(Palette.text)
        Text(basis.copy)
          .font(.footnote)
          .foregroundStyle(Palette.muted)
        // A preview of what it does, so the screen explains rather than only
        // refuses. Nothing here can write.
        VStack(alignment: .leading, spacing: 6) {
          Label("Say \u{201C}log 8 reps\u{201D}", systemImage: "mic.fill")
          Label("Turn the crown for weight", systemImage: "digitalcrown.horizontal.press.fill")
          Label("Works with no signal", systemImage: "antenna.radiowaves.left.and.right.slash")
        }
        .font(.caption2)
        .foregroundStyle(Palette.muted)
        .padding(.top, 4)

        if basis.needsPhone {
          Text("Open Muscle Map on your iPhone to continue.")
            .font(.caption2)
            .foregroundStyle(Palette.accent)
            .padding(.top, 6)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 4)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text("Apple Watch logging is part of Premium. \(basis.copy)"))
  }
}

// MARK: - Idle

struct IdleView: View {
  @ObservedObject private var store = WatchStore.shared

  var body: some View {
    VStack(spacing: 12) {
      Text("Ready when you are")
        .font(.headline)
        .foregroundStyle(Palette.text)
      PrimaryButton(title: "Start workout", systemImage: "play.fill") {
        store.run(.startWorkout)
      }
      if store.pendingCount > 0 {
        SyncBadge(sets: store.pendingSets, total: store.pendingCount, reachable: store.reachable)
      }
    }
    .padding(.horizontal, 6)
  }
}

// MARK: - Active workout

/// Two pages, no scrolling on either.
///
/// The logging loop — read the load, set the reps, log — has to be doable at
/// arm's length mid-set, so it owns one screen that never moves under the
/// thumb. Everything that is not that loop (pause, undo, end, sync state) lives
/// one swipe left, which is where the Workout app puts the same class of
/// control. A screen the user has to scroll to reach "Log set" is a screen that
/// loses sets.
struct ActiveWorkoutView: View {
  @ObservedObject private var store = WatchStore.shared
  @State private var page = 0

  /// Every exercise gets a preview page now: the packs are fetched on demand
  /// and the page degrades to black if one is unavailable, so gating on a
  /// hardcoded id would only hide working previews.
  private var showsAnimation: Bool {
    store.snapshot.mediaBase != nil && store.snapshot.currentExercise != nil
  }

  var body: some View {
    GeometryReader { geo in
      TabView(selection: $page) {
        if showsAnimation, let ex = store.snapshot.currentExercise {
          FormPreviewPage(exerciseId: ex.exerciseId, mediaBase: store.snapshot.mediaBase).tag(-1)
        }
        LoggingPage().tag(0)
        SessionPage(onDone: { page = 0 }).tag(1)
      }
      // Leaving the animated exercise while ON its page would strand the
      // selection on a tag that no longer exists.
      .onChange(of: showsAnimation) { _, shows in
        if !shows && page == -1 { page = 0 }
      }
      #if targetEnvironment(simulator)
        .onAppear { page = -1 }
      #endif
      // The dots cost a strip of height the 40mm cannot spare: with them the
      // logging page is budgeted 131pt for a stack that needs more, and the
      // overflow lands on "Log set". Bigger cases keep the affordance.
      .tabViewStyle(.page(indexDisplayMode: geo.size.height < 170 ? .never : .automatic))
    }
  }
}

// MARK: page 0 — form preview (prototype, one exercise)

/// Development instrumentation for the flipbook. Off in a shipping build.
enum FlipbookMetrics {
  static let enabled = true

  static func footprintMB() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let kr = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard kr == KERN_SUCCESS else { return -1 }
    return Double(info.phys_footprint) / 1_048_576
  }

  static func log(_ line: String) {
    if enabled { NSLog("[FLIPBOOK] %@", line) }
  }
}

/// On-disk frame-pack cache.
///
/// Bundling every exercise would put ~80 MB of JPEG inside the watch app, so
/// packs are fetched once from the phone's backend and kept in Caches — the
/// directory the system may reclaim under pressure, which is exactly the right
/// contract for regenerable media. Only the exercise on screen is ever decoded.
enum FramePackCache {
  struct Meta: Codable {
    let frames: Int
    let loopSeconds: Double
  }

  private static var root: URL {
    let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("watch-frames", isDirectory: true)
  }

  private static func dir(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }

  /// Packs shipped inside the app (targets/watch/BundledFramePacks, copied by
  /// the config plugin). Same NN.jpg + pack.json layout as the server, read in
  /// place — never copied into Caches.
  private static func bundled(_ id: String) -> URL? {
    guard let res = Bundle.main.resourceURL else { return nil }
    let d = res.appendingPathComponent("BundledFramePacks/\(id)", isDirectory: true)
    return FileManager.default.fileExists(atPath: d.appendingPathComponent("pack.json").path) ? d : nil
  }

  /// How many frames fetch at once. The watch often proxies HTTP through the
  /// phone over Bluetooth, where per-request latency, not bandwidth, dominates
  /// — serial fetching of a 48-frame pack took tens of seconds.
  private static let fetchWidth = 6

  /// Resolves the pack, cheapest source first per file: Caches, then the app
  /// bundle, then the network (missing frames download `fetchWidth` at a time
  /// and are cached, so a second visit is offline-fast). `onPoster` fires as
  /// soon as frame 0 is decoded so the page can show something immediately.
  static func load(
    id: String, base: String,
    onPoster: @MainActor @escaping (Meta, UIImage) -> Void
  ) async -> (Meta, [UIImage])? {
    let folder = dir(id)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let metaURL = folder.appendingPathComponent("pack.json")
    let bundleDir = bundled(id)

    var meta: Meta?
    if let d = try? Data(contentsOf: metaURL) { meta = try? JSONDecoder().decode(Meta.self, from: d) }
    if meta == nil, let bundleDir,
      let d = try? Data(contentsOf: bundleDir.appendingPathComponent("pack.json")) {
      meta = try? JSONDecoder().decode(Meta.self, from: d)
    }
    if meta == nil {
      guard let url = URL(string: "\(base)/\(id)/pack.json"),
        let (d, resp) = try? await URLSession.shared.data(from: url),
        (resp as? HTTPURLResponse)?.statusCode == 200,
        let m = try? JSONDecoder().decode(Meta.self, from: d)
      else { return nil }
      try? d.write(to: metaURL)
      meta = m
    }
    guard let m = meta, m.frames > 0, m.loopSeconds > 0 else { return nil }

    func frame(_ i: Int) async -> UIImage? {
      let name = String(format: "%02d.jpg", i)
      var bytes = try? Data(contentsOf: folder.appendingPathComponent(name))
      if bytes == nil, let bundleDir {
        bytes = try? Data(contentsOf: bundleDir.appendingPathComponent(name))
      }
      if bytes == nil {
        guard let url = URL(string: "\(base)/\(id)/\(name)"),
          let (d, resp) = try? await URLSession.shared.data(from: url),
          (resp as? HTTPURLResponse)?.statusCode == 200
        else { return nil }
        try? d.write(to: folder.appendingPathComponent(name))
        bytes = d
      }
      guard let data = bytes else { return nil }
      return decode(data)
    }

    guard let first = await frame(0) else { return nil }
    await onPoster(m, first)

    var images = [UIImage?](repeating: nil, count: m.frames)
    images[0] = first
    let ok = await withTaskGroup(of: (Int, UIImage?).self, returning: Bool.self) { group in
      var next = 1
      func addNext() {
        guard next < m.frames else { return }
        let i = next
        next += 1
        group.addTask { (i, await frame(i)) }
      }
      for _ in 0..<fetchWidth { addNext() }
      while let (i, img) = await group.next() {
        guard let img else {
          group.cancelAll()
          return false
        }
        images[i] = img
        addNext()
      }
      return true
    }
    guard ok else { return nil }
    return (m, images.compactMap { $0 })
  }

  /// Forces the bitmap now. JPEG data decodes lazily on first draw otherwise,
  /// which would land the cost inside a frame's display slot.
  private static func decode(_ data: Data) -> UIImage? {
    guard let raw = UIImage(data: data), let cg = raw.cgImage else { return nil }
    guard
      let ctx = CGContext(
        data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { return raw }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    guard let flat = ctx.makeImage() else { return raw }
    return UIImage(cgImage: flat)
  }
}

/// Holds the decoded loop for ONE exercise. Released on page exit.
@MainActor
final class FlipbookStore: ObservableObject {
  @Published private(set) var frames: [UIImage] = []
  @Published private(set) var loopSeconds: Double = 0
  @Published private(set) var failed = false
  private var loadedId: String?
  private var task: Task<Void, Never>?

  func load(id: String, base: String?) {
    guard let base, !base.isEmpty else { failed = true; return }
    guard loadedId != id else { return }
    task?.cancel()
    loadedId = id
    frames = []
    failed = false
    let t0 = Date()
    FlipbookMetrics.log(String(format: "%@: memory before decode %.1f MB", id, FlipbookMetrics.footprintMB()))
    task = Task { [weak self] in
      let pack = await FramePackCache.load(id: id, base: base) { meta, poster in
        // Frame 0 as a static poster the moment it exists — the page stops
        // being black while the rest of the pack streams in.
        guard let self, self.loadedId == id, self.frames.isEmpty else { return }
        self.frames = [poster]
        self.loopSeconds = meta.loopSeconds
        FlipbookMetrics.log(String(
          format: "%@: poster in %.0f ms", id, Date().timeIntervalSince(t0) * 1000))
      }
      guard !Task.isCancelled else { return }
      await MainActor.run {
        guard let self, self.loadedId == id else { return }
        if let (meta, images) = pack {
          self.frames = images
          self.loopSeconds = meta.loopSeconds
          FlipbookMetrics.log(String(
            format: "%@: %d frames, %.2fs loop, ready in %.0f ms, memory %.1f MB",
            id, images.count, meta.loopSeconds, Date().timeIntervalSince(t0) * 1000,
            FlipbookMetrics.footprintMB()))
        } else {
          self.failed = true
          FlipbookMetrics.log("\(id): no pack available")
        }
      }
    }
  }

  func release() {
    task?.cancel()
    task = nil
    frames = []
    loadedId = nil
    FlipbookMetrics.log(String(format: "released; memory %.1f MB", FlipbookMetrics.footprintMB()))
  }
}

/// The dedicated animation page: footage and nothing else.
struct FormPreviewPage: View {
  let exerciseId: String
  let mediaBase: String?

  @StateObject private var store = FlipbookStore()
  @Environment(\.scenePhase) private var scenePhase
  @State private var start: Date?
  @State private var lastChange: Date?
  @State private var lastIndex = -1
  @State private var worstGapMs: Double = 0
  @State private var skipped = 0
  @State private var presented = 0

  var body: some View {
    GeometryReader { geo in
      TimelineView(.animation(paused: scenePhase != .active || store.frames.isEmpty)) { context in
        Canvas { ctx, size in
          ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.black))
          let frames = store.frames
          guard !frames.isEmpty, store.loopSeconds > 0 else { return }
          let i = frameIndex(at: context.date, count: frames.count)
          let img = frames[i]
          let iw = img.size.width, ih = img.size.height
          let scale = max(size.width / iw, size.height / ih)
          let w = iw * scale, h = ih * scale
          ctx.draw(
            Image(uiImage: img),
            in: CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h))
          recordPacing(index: i, at: context.date, count: frames.count)
        }
        .frame(width: geo.size.width, height: geo.size.height)
      }
    }
    .ignoresSafeArea()
    .background(Color.black)
    .onAppear {
      resetPacing()
      store.load(id: exerciseId, base: mediaBase)
    }
    .onChange(of: exerciseId) { _, id in
      resetPacing()
      store.load(id: id, base: mediaBase)
    }
    .onDisappear { store.release() }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Exercise form preview animation"))
  }

  private func resetPacing() {
    start = nil
    lastChange = nil
    lastIndex = -1
    worstGapMs = 0
    skipped = 0
    presented = 0
  }

  /// Elapsed-time driven: a delayed callback lands on the CORRECT frame, so
  /// delay never accumulates into drift. The remainder is taken in Double
  /// before any Int conversion — Int is 32 bits on arm64_32.
  private func frameIndex(at date: Date, count: Int) -> Int {
    let t0 = start ?? { start = date; return date }()
    let loop = store.loopSeconds
    let progress = date.timeIntervalSince(t0).truncatingRemainder(dividingBy: loop) / loop
    return min(count - 1, max(0, Int(progress * Double(count)) % count))
  }

  private func recordPacing(index: Int, at date: Date, count: Int) {
    guard FlipbookMetrics.enabled, index != lastIndex else { return }
    if let last = lastChange {
      let gap = date.timeIntervalSince(last) * 1000
      worstGapMs = max(worstGapMs, gap)
      let jump = (index - lastIndex + count) % count
      if jump > 1 { skipped += jump - 1 }
    }
    presented += 1
    lastChange = date
    let wasLast = lastIndex
    lastIndex = index
    if index < wasLast {
      FlipbookMetrics.log(String(
        format: "loop: presented %d, skipped %d, worst gap %.0f ms (intended %.0f ms), memory %.1f MB",
        presented, skipped, worstGapMs, store.loopSeconds / Double(count) * 1000,
        FlipbookMetrics.footprintMB()))
      presented = 0
      skipped = 0
      worstGapMs = 0
    }
  }
}

// MARK: page 1 — the loop

struct LoggingPage: View {
  @ObservedObject private var store = WatchStore.shared
  @State private var crown: Double = 0
  @State private var reps: Int = 8
  @State private var now = nowMs()
  private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

  private var snapshot: WatchSnapshot { store.snapshot }
  private var exercise: WatchExerciseView? { snapshot.currentExercise }
  private var resting: RestClock? { snapshot.rest }

  var body: some View {
    // Every height is derived, never fixed: the same layout has to fit a 40mm
    // SE and a 49mm Ultra without a scroll view rescuing it.
    GeometryReader { geo in
      let h = geo.size.height
      let w = geo.size.width
      // The display is a rounded rectangle: anything flush to the edge loses a
      // corner, and the controls nearest the bottom lose the most. Everything
      // is inset, and the dial is sized from the INSET width so the shoulders
      // move in with it.
      let inset = max(8, w * 0.075)
      let usable = w - inset * 2
      let gap = max(2, min(h * 0.02, 6))
      let head = max(32, min(h * 0.26, 48))
      let button = max(30, min(h * 0.21, 38))
      // Reps is deliberately the most generous row on the screen. It is the one
      // control that is aimed at mid-set, and at the old size a miss landed on
      // the weight shoulders or on "Log set" — logging the wrong set rather
      // than doing nothing.
      let repsRow = max(34, min(h * 0.29, 44))
      // The weight readout takes the remainder, never a floor of its own: a
      // floor here is exactly what pushed "Log set" off a 40mm screen.
      let readout = max(20, h - head - repsRow - button - gap * 3 - 2)

      VStack(spacing: gap) {
        header(width: usable, height: head)
        if let clock = resting {
          // ONE timer, not a countdown dial arguing with a length stepper: a
          // single row counting down against its own total, with the ±15
          // controls on its shoulders.
          restRow(clock, height: repsRow)
          PrimaryButton(title: "Skip rest", systemImage: nil, height: button) {
            store.skipRest()
          }
        } else {
          // Reps ABOVE the weight, so the row the thumb aims at is not adjacent
          // to "Log set". The weight sits between them as a buffer.
          repsStepper(height: repsRow)
          weightReadout(height: readout)
          PrimaryButton(title: "Log set", systemImage: "checkmark", height: button) {
            store.run(.logSet(reps: reps, weight: nil, warmup: false))
          }
        }
      }
      .padding(.horizontal, inset)
      .frame(width: w, height: h, alignment: .top)
    }
    .onReceive(tick) { _ in
      now = nowMs()
      // The tick doubles as the completion edge: the store clears the clock on
      // the first zero it sees, so this cannot fire twice for one rest.
      if let clock = resting, clock.remaining(now: now) <= 0 { store.restCompleted() }
    }
    // Asked, not assumed: the plan's set count is a target, not a limit, and
    // plenty of sessions run long or stop short of it on purpose.
    .confirmationDialog(
      goalPrompt,
      isPresented: Binding(
        get: { store.setGoalReached },
        set: { if !$0 { store.setGoalReached = false } })
    ) {
      // Both plain buttons on purpose. A `.cancel` role is not rendered as a
      // choice on watchOS — it becomes the dismiss gesture — so the second
      // option was invisible and the prompt read as "next exercise or nothing".
      Button("Next exercise") {
        store.setGoalReached = false
        store.run(.nextExercise)
      }
      Button("1 more set") { store.setGoalReached = false }
    }
    .onAppear { reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps) }
    .onChange(of: snapshot.currentIndex) { _, _ in
      reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps)
    }
  }

  /// Prev and Next are the chevrons flanking the name, because the name IS the
  /// thing they move between. That reclaims a whole 40 pt row for the dial.
  private func header(width: CGFloat, height: CGFloat) -> some View {
    // A 40mm loses roughly a third of the name row to two 26pt chevrons, which
    // is what capped the readable name at about twelve characters. They shrink
    // with the screen, and the name is allowed a second line: "Plate-Loaded
    // Machine Military Press" cannot be read on one line at any legible size.
    let chevron: CGFloat = width < 150 ? 20 : 26
    return HStack(spacing: 1) {
      ChevronButton(
        systemImage: "chevron.left", label: "Previous exercise", width: chevron, height: height
      ) {
        store.run(.previousExercise)
      }
      VStack(spacing: 1) {
        Text(exercise?.name ?? "No exercise")
          .font(.system(size: height >= 44 ? 14 : 12, weight: .semibold))
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .minimumScaleFactor(0.55)
          .foregroundStyle(Palette.text)
        HStack(spacing: 3) {
          if store.pendingCount > 0 {
            Image(systemName: store.reachable ? "arrow.triangle.2.circlepath" : "iphone.slash")
              .font(.system(size: 8, weight: .bold))
              .foregroundStyle(Palette.muted)
          }
          // A refusal takes over this line rather than opening a banner: an
          // overlay big enough to read is an overlay big enough to cover
          // "Log set", and the status line is already where the eye goes.
          // One line, not two: the second line is what the name now uses, and a
          // status that can grow is a status that can push "Log set" off-screen.
          Text(refusal ?? subtitle)
            .font(.system(size: height >= 44 ? 10 : 9))
            .foregroundStyle(refusal == nil ? Palette.muted : Palette.accent)
            .lineLimit(1)
            .multilineTextAlignment(.center)
            .minimumScaleFactor(0.7)
            .accessibilityAddTraits(refusal == nil ? [] : .updatesFrequently)
        }
      }
      .frame(maxWidth: .infinity)
      ChevronButton(
        systemImage: "chevron.right", label: "Next exercise", width: chevron, height: height
      ) {
        store.run(.nextExercise)
      }
    }
    .frame(height: height)
    .accessibilityElement(children: .contain)
  }

  /// Names the target rather than just saying "done", so the choice is
  /// informed by what the plan actually asked for.
  private var goalPrompt: String {
    let done = exercise?.liveSets.count ?? 0
    let name = exercise?.name ?? ""
    return String(
      format: NSLocalizedString("%d sets done on %@", comment: ""), done, name)
  }

  private var refusal: String? {
    guard let feedback = store.lastFeedback, feedback.tone != .success else { return nil }
    return feedback.message
  }

  /// Reads "Set 3 · Target 8" while logging and "Set 3 logged · Resting" during
  /// the rest that follows, so the same line always says where the set stands.
  private var subtitle: String {
    let n = snapshot.nextSetNumber
    if resting != nil {
      return String(format: NSLocalizedString("Set %d logged · Resting", comment: ""), max(1, n - 1))
    }
    guard let target = exercise?.targetReps, target > 0 else {
      return String(format: NSLocalizedString("Set %d", comment: ""), n)
    }
    return String(format: NSLocalizedString("Set %d · Target %d", comment: ""), n, target)
  }

  /// The Digital Crown drives the load because it is the one control that works
  /// with a sweaty finger and a glove. The ring is a full-travel gauge: it says
  /// "this is turnable" without pretending the load has a maximum.
  /// No plus/minus here on purpose. The crown is how a load gets set — it works
  /// with a sweaty hand and a glove — and the two shoulders it used to carry
  /// were close enough to the reps row to steal taps meant for it. Removing
  /// them gives reps the space and takes away the mis-hit.
  private func weightReadout(height: CGFloat) -> some View {
    HStack(spacing: 4) {
      Text(formatLoad(snapshot.displayedWorkingWeight))
        .font(.system(size: max(15, height * 0.62), weight: .bold, design: .rounded))
        .foregroundStyle(Palette.accent)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
      Text(snapshot.unit.label)
        .font(.system(size: max(10, height * 0.34), weight: .semibold))
        .foregroundStyle(Palette.accent.opacity(0.85))
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
    .frame(height: height)
    .background(Palette.surface)
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
      .focusable(true)
      .digitalCrownRotation(
        $crown, from: -1000, through: 1000, by: 1, sensitivity: .low, isContinuous: false)
      .onChange(of: crown) { previous, next in
        let steps = Int(next.rounded()) - Int(previous.rounded())
        if steps != 0 { store.nudgeWeight(steps: steps) }
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text("Working weight"))
      .accessibilityValue(Text("\(formatLoad(snapshot.displayedWorkingWeight)) \(snapshot.unit.label)"))
      .accessibilityAdjustableAction { direction in
        store.nudgeWeight(steps: direction == .increment ? 1 : -1)
      }
  }

  private func repsStepper(height: CGFloat) -> some View {
    StepperRow(
      text: "\(reps) reps",
      height: height,
      decrement: { reps = max(WatchLimits.minReps, reps - 1) },
      increment: { reps = min(WatchLimits.maxReps, reps + 1) })
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text("Reps"))
      .accessibilityValue(Text("\(reps)"))
      .accessibilityAdjustableAction { direction in
        reps = direction == .increment
          ? min(WatchLimits.maxReps, reps + 1)
          : max(WatchLimits.minReps, reps - 1)
      }
  }

  /// The one rest display: remaining / total, counting down, resizable in
  /// place. Two separate rest readouts — a dial counting one number and a
  /// stepper showing another — is how the screen disagreed with itself.
  private func restRow(_ clock: RestClock, height: CGFloat) -> some View {
    let remaining = clock.remaining(now: now)
    return HStack(spacing: 3) {
      DialShoulder(
        action: DialAction(label: "minus 15 seconds", text: "-15") { store.adjustRunningRest(-15) },
        tint: Palette.accent, size: height - 4)
      Text("\(clockText(remaining)) / \(clockText(clock.total))")
        .font(.system(size: max(15, height * 0.42), weight: .bold, design: .rounded))
        .foregroundStyle(remaining == 0 ? Palette.done : Palette.accent)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .frame(maxWidth: .infinity)
      DialShoulder(
        action: DialAction(label: "plus 15 seconds", text: "+15") { store.adjustRunningRest(15) },
        tint: Palette.accent, size: height - 4)
    }
    .padding(.horizontal, 2)
    .frame(height: height)
    .background(Palette.surface)
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(snapshot.paused ? "Rest paused" : "Rest remaining"))
    .accessibilityValue(Text("\(remaining) of \(clock.total) seconds"))
    .accessibilityAdjustableAction { direction in
      store.adjustRunningRest(direction == .increment ? 15 : -15)
    }
  }

}

// MARK: page 2 — the session

/// Pause, undo, end and the sync state. Off the logging screen on purpose:
/// "End workout" under a thumb aimed at "Log set" is a lost session.
struct SessionPage: View {
  @ObservedObject private var store = WatchStore.shared
  let onDone: () -> Void

  private var snapshot: WatchSnapshot { store.snapshot }

  var body: some View {
    GeometryReader { geo in
      let control = max(34, min(geo.size.height * 0.17, 44))
      let inset = max(8, geo.size.width * 0.075)
      VStack(spacing: max(4, min(geo.size.height * 0.03, 8))) {
        Text("Session")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(Palette.muted)
        SecondaryButton(
          title: snapshot.paused ? "Resume" : "Pause",
          systemImage: snapshot.paused ? "play.fill" : "pause.fill",
          height: control
        ) {
          store.run(snapshot.paused ? .resumeWorkout : .pauseWorkout)
          onDone()
        }
        SecondaryButton(title: "Undo last set", systemImage: "arrow.uturn.backward", height: control) {
          store.run(.undoLastSet(confirmed: false))
        }
        SecondaryButton(title: "End workout", systemImage: "stop.fill", height: control, danger: true) {
          store.run(.endWorkout)
        }
        if store.pendingCount > 0 {
          SyncBadge(sets: store.pendingSets, total: store.pendingCount, reachable: store.reachable)
        }
      }
      .padding(.horizontal, inset)
      .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
    }
  }
}

private func clockText(_ seconds: Int) -> String {
  let s = max(0, seconds)
  return "\(s / 60):\(String(format: "%02d", s % 60))"
}

// MARK: - Pieces


struct SyncBadge: View {
  /// Logged sets only. `total` is every queued event, which is what decides
  /// whether the badge shows at all — starting a workout with no sets yet is
  /// still something waiting, it is just not a set.
  let sets: Int
  let total: Int
  let reachable: Bool

  private var summary: String {
    if sets == 1 { return NSLocalizedString("1 set waiting to sync", comment: "") }
    if sets > 1 { return String(format: NSLocalizedString("%d sets waiting to sync", comment: ""), sets) }
    return NSLocalizedString("Waiting to sync", comment: "")
  }

  var body: some View {
    Label(summary, systemImage: reachable ? "arrow.triangle.2.circlepath" : "iphone.slash")
      .font(.caption2)
      .foregroundStyle(Palette.muted)
      .accessibilityLabel(
        Text(
          reachable
            ? String(format: NSLocalizedString("%@, syncing to your iPhone", comment: ""), summary)
            : String(
              format: NSLocalizedString("%@, saved on your watch and waiting for your iPhone", comment: ""),
              summary)))
  }
}

/// One dial: a value ring with a tap target on each shoulder. The ring is the
/// screen's anchor — on a 41mm face a single large circle reads at arm's length
/// where a column of rows does not.
struct DialAction {
  let label: String
  var systemImage: String? = nil
  var text: String? = nil
  let action: () -> Void
}

struct DialFace: View {
  let caption: String
  let value: String
  let unit: String
  /// 0...1 of the ring drawn in the tint. 1 is a full sweep.
  let progress: Double
  /// Diameter, derived by the caller from the screen so one layout fits every
  /// case size without a scroll view.
  let size: CGFloat
  var tint: Color = Palette.accent
  let leading: DialAction
  let trailing: DialAction

  /// Below this the ring is smaller than its own shoulders, which then sit on
  /// top of the value instead of beside it. A 40mm has no height to spare for a
  /// circle, so the same controls lay out as a row instead.
  private var isCompact: Bool { size < 48 }

  var body: some View {
    if isCompact { compactRow } else { ring }
  }

  /// Same value, same two actions, same accessibility — a row rather than a
  /// circle. The crown still drives it: that modifier lives on the caller.
  private var compactRow: some View {
    HStack(spacing: 3) {
      DialShoulder(action: leading, tint: tint, size: size - 4)
      Text(unit.isEmpty ? value : "\(value) \(unit)")
        .font(.system(size: max(14, size * 0.46), weight: .bold, design: .rounded))
        .foregroundStyle(tint)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .frame(maxWidth: .infinity)
      DialShoulder(action: trailing, tint: tint, size: size - 4)
    }
    .padding(.horizontal, 2)
    .frame(height: size)
    .background(Palette.surface)
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
  }

  private var ring: some View {
    ZStack {
      TickRing()
        .frame(width: size, height: size)
      Circle()
        .trim(from: 0, to: max(0, min(1, progress)) * 0.82)
        .stroke(tint, style: StrokeStyle(lineWidth: size * 0.045, lineCap: .round))
        .rotationEffect(.degrees(147))
        .frame(width: size - 8, height: size - 8)
      VStack(spacing: -2) {
        // Below ~58pt the caption renders under 6pt — unreadable, and it is the
        // one line here that carries no information the value does not.
        if size >= 58 {
          Text(caption)
            .font(.system(size: max(7, size * 0.105), weight: .semibold))
            .foregroundStyle(Palette.muted)
        }
        Text(value)
          .font(.system(size: max(17, size * 0.38), weight: .bold, design: .rounded))
          .foregroundStyle(tint)
          .minimumScaleFactor(0.45)
          .lineLimit(1)
        Text(unit)
          .font(.system(size: max(9, size * 0.13), weight: .semibold))
          .foregroundStyle(tint.opacity(0.85))
          .lineLimit(1)
          .minimumScaleFactor(0.6)
      }
      .frame(width: size * 0.66)
      // The shoulders straddle the ring rather than sitting at the screen
      // edges: they belong to the dial, and the thumb finds them by aiming at
      // the circle it is already looking at.
      DialShoulder(action: leading, tint: tint, size: shoulder)
        .offset(x: -size * 0.56)
      DialShoulder(action: trailing, tint: tint, size: shoulder)
        .offset(x: size * 0.56)
    }
    .frame(height: size)
  }

  /// Big enough to hit, never so big it crowds the ring on a 40mm face.
  private var shoulder: CGFloat { max(32, min(size * 0.33, 40)) }
}

/// The minute ticks behind the ring. Purely decorative, and hidden from
/// VoiceOver so the dial reads as one value rather than sixty marks.
private struct TickRing: View {
  var body: some View {
    GeometryReader { geo in
      let r = min(geo.size.width, geo.size.height) / 2
      ZStack {
        ForEach(0..<60, id: \.self) { i in
          let major = i % 5 == 0
          Capsule()
            .fill(Color.white.opacity(major ? 0.34 : 0.16))
            .frame(width: major ? 2 : 1, height: major ? r * 0.10 : r * 0.06)
            .offset(y: -r + r * 0.19)
            .rotationEffect(.degrees(Double(i) / 60 * 360))
        }
      }
      .frame(width: geo.size.width, height: geo.size.height)
    }
    .accessibilityHidden(true)
  }
}

private struct DialShoulder: View {
  let action: DialAction
  let tint: Color
  let size: CGFloat

  var body: some View {
    Button(action: action.action) {
      Group {
        if let text = action.text {
          Text(text).font(.system(size: size * 0.29, weight: .bold)).minimumScaleFactor(0.7)
        } else {
          Image(systemName: action.systemImage ?? "circle")
            .font(.system(size: size * 0.38, weight: .bold))
        }
      }
      .frame(width: size, height: size)
    }
    .buttonStyle(.plain)
    .background(Palette.surface)
    .foregroundStyle(tint)
    .clipShape(Circle())
    .overlay(Circle().stroke(tint.opacity(0.55), lineWidth: 1))
    .accessibilityLabel(Text(action.label))
  }
}

/// A capsule with a value in the middle and a round tap target at each end.
struct StepperRow: View {
  let text: String
  var height: CGFloat = 34
  let decrement: () -> Void
  let increment: () -> Void

  var body: some View {
    HStack(spacing: 0) {
      StepperEnd(systemImage: "minus", size: height - 6, action: decrement)
      Text(text)
        .font(.system(size: height * 0.46, weight: .semibold, design: .rounded))
        .foregroundStyle(Palette.text)
        .frame(maxWidth: .infinity)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      StepperEnd(systemImage: "plus", size: height - 6, action: increment)
    }
    .padding(3)
    .frame(height: height)
    .background(Palette.surface)
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
  }
}

private struct StepperEnd: View {
  let systemImage: String
  let size: CGFloat
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: size * 0.44, weight: .bold))
        .frame(width: size, height: size)
    }
    .buttonStyle(.plain)
    .background(Palette.ground.opacity(0.55))
    .foregroundStyle(Palette.accent)
    .clipShape(Circle())
  }
}

/// The Prev/Next affordance, sized to the 44 pt minimum while drawing as a
/// bare chevron — a filled button either side of the name would read as two
/// more actions competing with the dial.
struct ChevronButton: View {
  let systemImage: String
  let label: String
  var width: CGFloat = 26
  var height: CGFloat = 40
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 13, weight: .bold))
        // The tap target keeps the full row height even when the glyph column
        // narrows, so the reclaimed width costs nothing in reachability.
        .frame(width: width, height: height)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(Palette.muted)
    .accessibilityLabel(Text(label))
  }
}

/// 44 pt tall at radius 22 is a capsule by construction — the phone's rule.
struct PrimaryButton: View {
  let title: String
  let systemImage: String?
  var height: CGFloat = 44
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Group {
        if let systemImage {
          Label(title, systemImage: systemImage)
        } else {
          Text(title)
        }
      }
      .font(.system(size: max(14, height * 0.4), weight: .semibold))
      .lineLimit(1)
      .minimumScaleFactor(0.7)
      .frame(maxWidth: .infinity, minHeight: height)
    }
    .buttonStyle(.plain)
    .background(Palette.accent)
    .foregroundStyle(Color.black)
    // The rest border is the control's OWN fill, never transparent: a clear
    // border over a filled rounded view shows as a seam along the curve.
    .overlay(RoundedRectangle(cornerRadius: Palette.radius).stroke(Palette.accent, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
  }
}

struct SecondaryButton: View {
  let title: String
  let systemImage: String
  var height: CGFloat = 40
  /// Ending a workout is the one irreversible control here, so it is the one
  /// that is allowed to look different.
  var danger: Bool = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: systemImage)
        .font(.system(size: max(13, height * 0.34), weight: .medium))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, minHeight: height)
    }
    .buttonStyle(.plain)
    .background(Palette.surface)
    .foregroundStyle(danger ? Palette.accent : Palette.text)
    .overlay(RoundedRectangle(cornerRadius: Palette.radius).stroke(Palette.surface, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
  }
}

struct StepButton: View {
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 16, weight: .bold))
        .frame(width: 44, height: 44)
    }
    .buttonStyle(.plain)
    .background(Palette.surface)
    .foregroundStyle(Palette.accent)
    .overlay(RoundedRectangle(cornerRadius: Palette.radius).stroke(Palette.surface, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
  }
}
