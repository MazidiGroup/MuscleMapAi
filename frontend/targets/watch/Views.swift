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

  var body: some View {
    TabView(selection: $page) {
      LoggingPage().tag(0)
      SessionPage(onDone: { page = 0 }).tag(1)
    }
    .tabViewStyle(.page)
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
      let dial = max(74, min(min(h * 0.475, 120), usable - 8))
      let control = max(30, min(h * 0.155, 38))
      let gap = max(3, min(h * 0.022, 7))

      VStack(spacing: gap) {
        header
        if let clock = resting {
          restDial(clock, size: dial)
          restStepper(clock, height: control)
          PrimaryButton(title: "Skip rest", systemImage: nil, height: control + 4) {
            store.skipRest()
          }
        } else {
          weightDial(size: dial)
          repsStepper(height: control)
          PrimaryButton(title: "Log set", systemImage: "checkmark", height: control + 4) {
            store.run(.logSet(reps: reps, weight: nil, warmup: false))
          }
        }
      }
      .padding(.horizontal, inset)
      .frame(width: w, height: h, alignment: .top)
    }
    .onReceive(tick) { _ in now = nowMs() }
    .onAppear { reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps) }
    .onChange(of: snapshot.currentIndex) { _, _ in
      reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps)
    }
  }

  /// Prev and Next are the chevrons flanking the name, because the name IS the
  /// thing they move between. That reclaims a whole 40 pt row for the dial.
  private var header: some View {
    HStack(spacing: 2) {
      ChevronButton(systemImage: "chevron.left", label: "Previous exercise") {
        store.run(.previousExercise)
      }
      VStack(spacing: 0) {
        Text(exercise?.name ?? "No exercise")
          .font(.system(size: 15, weight: .semibold))
          .multilineTextAlignment(.center)
          .lineLimit(1)
          .minimumScaleFactor(0.65)
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
          Text(refusal ?? subtitle)
            .font(.system(size: 11))
            .foregroundStyle(refusal == nil ? Palette.muted : Palette.accent)
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .minimumScaleFactor(0.75)
            .accessibilityAddTraits(refusal == nil ? [] : .updatesFrequently)
        }
      }
      .frame(maxWidth: .infinity)
      ChevronButton(systemImage: "chevron.right", label: "Next exercise") {
        store.run(.nextExercise)
      }
    }
    .accessibilityElement(children: .contain)
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
  private func weightDial(size: CGFloat) -> some View {
    DialFace(
      caption: "WEIGHT",
      value: formatLoad(snapshot.displayedWorkingWeight),
      unit: snapshot.unit.label,
      progress: 1,
      size: size,
      leading: DialAction(label: "minus", systemImage: "minus") { store.nudgeWeight(steps: -1) },
      trailing: DialAction(label: "plus", systemImage: "plus") { store.nudgeWeight(steps: 1) })
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

  private func restDial(_ clock: RestClock, size: CGFloat) -> some View {
    let remaining = clock.remaining(now: now)
    let fraction = clock.total > 0 ? Double(remaining) / Double(clock.total) : 0
    return DialFace(
      caption: "REST",
      value: clockText(remaining),
      unit: "of \(clockText(clock.total))",
      progress: fraction,
      size: size,
      tint: remaining == 0 ? Palette.done : Palette.accent,
      leading: DialAction(label: "minus 30 seconds", text: "-30s") { store.extendRest(seconds: -30) },
      trailing: DialAction(label: "plus 30 seconds", text: "+30s") { store.extendRest(seconds: 30) })
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text(snapshot.paused ? "Rest paused" : "Rest remaining"))
      .accessibilityValue(Text("\(remaining) seconds"))
      .accessibilityAdjustableAction { direction in
        store.extendRest(seconds: direction == .increment ? 30 : -30)
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

  private func restStepper(_ clock: RestClock, height: CGFloat) -> some View {
    StepperRow(
      text: "Rest \(clockText(snapshot.restSeconds))",
      height: height,
      decrement: { store.setRestTotal(snapshot.restSeconds - 15) },
      increment: { store.setRestTotal(snapshot.restSeconds + 15) })
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text("Rest length"))
      .accessibilityValue(Text("\(snapshot.restSeconds) seconds"))
      .accessibilityAdjustableAction { direction in
        store.setRestTotal(snapshot.restSeconds + (direction == .increment ? 15 : -15))
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

struct RestTimerView: View {
  let clock: RestClock?
  let paused: Bool
  @State private var now = nowMs()
  private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

  var body: some View {
    Group {
      if let clock {
        let remaining = clock.remaining(now: now)
        Text("Rest \(remaining / 60):\(String(format: "%02d", remaining % 60))")
          .font(.system(size: 16, weight: .medium, design: .rounded))
          .foregroundStyle(remaining == 0 ? Palette.done : Palette.muted)
          .accessibilityLabel(Text(paused ? "Rest paused" : "Rest remaining"))
          .accessibilityValue(Text("\(remaining) seconds"))
      }
    }
    // Wall-clock based, so time that passes off-screen is accounted for rather
    // than frozen at the last tick.
    .onReceive(tick) { _ in now = nowMs() }
  }
}

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

  var body: some View {
    ZStack {
      TickRing()
        .frame(width: size, height: size)
      Circle()
        .trim(from: 0, to: max(0, min(1, progress)) * 0.82)
        .stroke(tint, style: StrokeStyle(lineWidth: size * 0.045, lineCap: .round))
        .rotationEffect(.degrees(147))
        .frame(width: size - 8, height: size - 8)
      VStack(spacing: -2) {
        Text(caption)
          .font(.system(size: size * 0.105, weight: .semibold))
          .foregroundStyle(Palette.muted)
        Text(value)
          .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
          .foregroundStyle(tint)
          .minimumScaleFactor(0.45)
          .lineLimit(1)
        Text(unit)
          .font(.system(size: size * 0.13, weight: .semibold))
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
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 13, weight: .bold))
        .frame(width: 26, height: 40)
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
