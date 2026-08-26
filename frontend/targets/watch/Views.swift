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
    .background(Palette.ground.ignoresSafeArea())
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

struct ActiveWorkoutView: View {
  @ObservedObject private var store = WatchStore.shared
  @State private var crown: Double = 0
  @State private var reps: Int = 8
  @State private var now = nowMs()
  private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

  private var snapshot: WatchSnapshot { store.snapshot }
  private var exercise: WatchExerciseView? { snapshot.currentExercise }
  private var resting: RestClock? { snapshot.rest }

  var body: some View {
    ScrollView {
      VStack(spacing: 8) {
        header
        // One dial, two jobs: the load before a set, the rest countdown after.
        // Swapping the dial's contents rather than stacking a second control
        // keeps the screen to a single glanceable ring on a 41mm face.
        if let clock = resting {
          restDial(clock)
          restStepper(clock)
          PrimaryButton(title: "Skip rest", systemImage: nil) { store.skipRest() }
        } else {
          weightDial
          repsStepper
          PrimaryButton(title: "Log set", systemImage: "checkmark") {
            store.run(.logSet(reps: reps, weight: nil, warmup: false))
          }
        }
        navRow
        if let feedback = store.lastFeedback {
          Text(feedback.message)
            .font(.caption2)
            .foregroundStyle(feedback.tone == .success ? Palette.muted : Palette.accent)
            .accessibilityAddTraits(.updatesFrequently)
        }
        if store.pendingCount > 0 {
          SyncBadge(sets: store.pendingSets, total: store.pendingCount, reachable: store.reachable)
        }
      }
      .padding(.horizontal, 4)
    }
    .onReceive(tick) { _ in now = nowMs() }
    .onAppear { reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps) }
    .onChange(of: snapshot.currentIndex) { _, _ in
      reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps)
    }
  }

  // MARK: header

  private var header: some View {
    VStack(spacing: 1) {
      Text(exercise?.name ?? "No exercise")
        .font(.system(size: 17, weight: .semibold))
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
        .foregroundStyle(Palette.text)
      Text(subtitle)
        .font(.caption2)
        .foregroundStyle(Palette.muted)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("\(exercise?.name ?? "No exercise"), \(subtitle)"))
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

  // MARK: dials

  /// The Digital Crown drives the load because it is the one control that works
  /// with a sweaty finger and a glove. The ring is a full-travel gauge: it says
  /// "this is turnable" without pretending the load has a maximum.
  private var weightDial: some View {
    DialFace(
      caption: "WEIGHT",
      value: formatLoad(snapshot.displayedWorkingWeight),
      unit: snapshot.unit.label,
      progress: 1,
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

  private func restDial(_ clock: RestClock) -> some View {
    let remaining = clock.remaining(now: now)
    let fraction = clock.total > 0 ? Double(remaining) / Double(clock.total) : 0
    return DialFace(
      caption: "REST",
      value: clockText(remaining),
      unit: "of \(clockText(clock.total))",
      progress: fraction,
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

  // MARK: steppers

  private var repsStepper: some View {
    StepperRow(
      text: "\(reps) reps",
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

  private func restStepper(_ clock: RestClock) -> some View {
    StepperRow(
      text: "Rest \(clockText(snapshot.restSeconds))",
      decrement: { store.setRestTotal(snapshot.restSeconds - 15) },
      increment: { store.setRestTotal(snapshot.restSeconds + 15) })
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text("Rest length"))
      .accessibilityValue(Text("\(snapshot.restSeconds) seconds"))
      .accessibilityAdjustableAction { direction in
        store.setRestTotal(snapshot.restSeconds + (direction == .increment ? 15 : -15))
      }
  }

  // MARK: nav

  /// Prev · Pause · Next as one segmented bar. Undo and End moved below it —
  /// destructive actions do not belong under a thumb aimed at "Next".
  private var navRow: some View {
    VStack(spacing: 6) {
      HStack(spacing: 0) {
        SegmentButton(title: "Prev", systemImage: "chevron.left", edge: .leading) {
          store.run(.previousExercise)
        }
        Divider().frame(height: 22).overlay(Palette.ground)
        SegmentButton(
          title: nil,
          systemImage: snapshot.paused ? "play.fill" : "pause.fill",
          edge: .middle,
          label: snapshot.paused ? "Resume workout" : "Pause workout"
        ) {
          store.run(snapshot.paused ? .resumeWorkout : .pauseWorkout)
        }
        Divider().frame(height: 22).overlay(Palette.ground)
        SegmentButton(title: "Next", systemImage: "chevron.right", edge: .trailing, trailingIcon: true) {
          store.run(.nextExercise)
        }
      }
      .background(Palette.surface)
      .clipShape(RoundedRectangle(cornerRadius: Palette.radius))

      HStack(spacing: 6) {
        SecondaryButton(title: "Undo", systemImage: "arrow.uturn.backward") {
          store.run(.undoLastSet(confirmed: false))
        }
        SecondaryButton(title: "End", systemImage: "stop.fill") { store.run(.endWorkout) }
      }
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
  var tint: Color = Palette.accent
  let leading: DialAction
  let trailing: DialAction

  var body: some View {
    ZStack {
      TickRing()
      Circle()
        .trim(from: 0, to: max(0, min(1, progress)) * 0.82)
        .stroke(tint, style: StrokeStyle(lineWidth: 5, lineCap: .round))
        .rotationEffect(.degrees(147))
        .padding(6)
      VStack(spacing: -2) {
        Text(caption)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(Palette.muted)
        Text(value)
          .font(.system(size: 40, weight: .bold, design: .rounded))
          .foregroundStyle(tint)
          .minimumScaleFactor(0.5)
          .lineLimit(1)
        Text(unit)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(tint.opacity(0.85))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      .padding(.horizontal, 34)
      HStack {
        DialShoulder(action: leading, tint: tint)
        Spacer()
        DialShoulder(action: trailing, tint: tint)
      }
    }
    .frame(height: 132)
  }
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
            .frame(width: major ? 2 : 1, height: major ? 8 : 5)
            .offset(y: -r + 20)
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

  var body: some View {
    Button(action: action.action) {
      Group {
        if let text = action.text {
          Text(text).font(.system(size: 12, weight: .bold))
        } else {
          Image(systemName: action.systemImage ?? "circle").font(.system(size: 16, weight: .bold))
        }
      }
      .frame(width: 44, height: 44)
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
  let decrement: () -> Void
  let increment: () -> Void

  var body: some View {
    HStack(spacing: 0) {
      StepperEnd(systemImage: "minus", action: decrement)
      Text(text)
        .font(.system(size: 17, weight: .semibold, design: .rounded))
        .foregroundStyle(Palette.text)
        .frame(maxWidth: .infinity)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      StepperEnd(systemImage: "plus", action: increment)
    }
    .padding(3)
    .background(Palette.surface)
    .clipShape(RoundedRectangle(cornerRadius: Palette.radius))
  }
}

private struct StepperEnd: View {
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 14, weight: .bold))
        .frame(width: 38, height: 38)
    }
    .buttonStyle(.plain)
    .background(Palette.ground.opacity(0.55))
    .foregroundStyle(Palette.accent)
    .clipShape(Circle())
  }
}

/// One third of the Prev · Pause · Next bar.
struct SegmentButton: View {
  let title: String?
  let systemImage: String
  enum Edge { case leading, middle, trailing }
  let edge: Edge
  var trailingIcon: Bool = false
  var label: String? = nil
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 3) {
        if !trailingIcon { Image(systemName: systemImage).font(.system(size: 12, weight: .bold)) }
        if let title { Text(title).font(.system(size: 14, weight: .semibold)) }
        if trailingIcon { Image(systemName: systemImage).font(.system(size: 12, weight: .bold)) }
      }
      .frame(maxWidth: .infinity, minHeight: 40)
    }
    .buttonStyle(.plain)
    .foregroundStyle(Palette.text)
    .accessibilityLabel(Text(label ?? title ?? systemImage))
  }
}

/// 44 pt tall at radius 22 is a capsule by construction — the phone's rule.
struct PrimaryButton: View {
  let title: String
  let systemImage: String?
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
      .font(.system(size: 16, weight: .semibold))
      .frame(maxWidth: .infinity, minHeight: 44)
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
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: systemImage)
        .font(.system(size: 14, weight: .medium))
        .frame(maxWidth: .infinity, minHeight: 40)
    }
    .buttonStyle(.plain)
    .background(Palette.surface)
    .foregroundStyle(Palette.text)
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
