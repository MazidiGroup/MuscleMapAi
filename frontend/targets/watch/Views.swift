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
        SyncBadge(count: store.pendingCount, reachable: store.reachable)
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

  private var snapshot: WatchSnapshot { store.snapshot }
  private var exercise: WatchExerciseView? { snapshot.currentExercise }

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        header
        weightControl
        repsControl
        PrimaryButton(title: "Log set", systemImage: "checkmark") {
          store.run(.logSet(reps: reps, weight: nil, warmup: false))
        }
        RestTimerView(clock: snapshot.rest, paused: snapshot.paused)
        controls
        if let feedback = store.lastFeedback {
          Text(feedback.message)
            .font(.caption2)
            .foregroundStyle(feedback.tone == .success ? Palette.muted : Palette.accent)
            .accessibilityAddTraits(.updatesFrequently)
        }
        if store.pendingCount > 0 {
          SyncBadge(count: store.pendingCount, reachable: store.reachable)
        }
      }
      .padding(.horizontal, 4)
    }
    .onAppear { reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps) }
    .onChange(of: snapshot.currentIndex) { _, _ in
      reps = max(exercise?.targetReps ?? 8, WatchLimits.minReps)
    }
  }

  private var header: some View {
    VStack(spacing: 2) {
      Text(exercise?.name ?? "No exercise")
        .font(.headline)
        .multilineTextAlignment(.center)
        .foregroundStyle(Palette.text)
      Text("Set \(snapshot.nextSetNumber)\(targetSuffix)")
        .font(.caption2)
        .foregroundStyle(Palette.muted)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("\(exercise?.name ?? "No exercise"), set \(snapshot.nextSetNumber)"))
  }

  private var targetSuffix: String {
    guard let target = exercise?.targetReps, target > 0 else { return "" }
    return " · target \(target) reps"
  }

  /// The Digital Crown drives the load because it is the one control that works
  /// with a sweaty finger and a glove.
  private var weightControl: some View {
    VStack(spacing: 4) {
      Text("\(formatLoad(snapshot.displayedWorkingWeight)) \(snapshot.unit.label)")
        .font(.system(size: 34, weight: .semibold, design: .rounded))
        .foregroundStyle(Palette.accent)
        .focusable(true)
        .digitalCrownRotation(
          $crown, from: -1000, through: 1000, by: 1, sensitivity: .low, isContinuous: false)
        .onChange(of: crown) { previous, next in
          let steps = Int(next.rounded()) - Int(previous.rounded())
          if steps != 0 { store.nudgeWeight(steps: steps) }
        }
      HStack(spacing: 8) {
        StepButton(systemImage: "minus") { store.nudgeWeight(steps: -1) }
        StepButton(systemImage: "plus") { store.nudgeWeight(steps: 1) }
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("Working weight"))
    .accessibilityValue(Text("\(formatLoad(snapshot.displayedWorkingWeight)) \(snapshot.unit.label)"))
    .accessibilityAdjustableAction { direction in
      store.nudgeWeight(steps: direction == .increment ? 1 : -1)
    }
  }

  private var repsControl: some View {
    HStack(spacing: 8) {
      StepButton(systemImage: "minus") { reps = max(WatchLimits.minReps, reps - 1) }
      Text("\(reps) reps")
        .font(.system(size: 22, weight: .medium, design: .rounded))
        .foregroundStyle(Palette.text)
        .frame(maxWidth: .infinity)
      StepButton(systemImage: "plus") { reps = min(WatchLimits.maxReps, reps + 1) }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("Reps"))
    .accessibilityValue(Text("\(reps)"))
    .accessibilityAdjustableAction { direction in
      reps = direction == .increment
        ? min(WatchLimits.maxReps, reps + 1)
        : max(WatchLimits.minReps, reps - 1)
    }
  }

  private var controls: some View {
    VStack(spacing: 6) {
      HStack(spacing: 6) {
        SecondaryButton(title: "Prev", systemImage: "chevron.left") { store.run(.previousExercise) }
        SecondaryButton(title: "Next", systemImage: "chevron.right") { store.run(.nextExercise) }
      }
      HStack(spacing: 6) {
        SecondaryButton(title: "Undo", systemImage: "arrow.uturn.backward") {
          store.run(.undoLastSet(confirmed: false))
        }
        SecondaryButton(
          title: snapshot.paused ? "Resume" : "Pause",
          systemImage: snapshot.paused ? "play.fill" : "pause.fill"
        ) {
          store.run(snapshot.paused ? .resumeWorkout : .pauseWorkout)
        }
      }
      SecondaryButton(title: "End workout", systemImage: "stop.fill") { store.run(.endWorkout) }
    }
  }
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
  let count: Int
  let reachable: Bool

  var body: some View {
    Label(
      count == 1 ? "1 set waiting to sync" : "\(count) sets waiting to sync",
      systemImage: reachable ? "arrow.triangle.2.circlepath" : "iphone.slash"
    )
    .font(.caption2)
    .foregroundStyle(Palette.muted)
    .accessibilityLabel(
      Text(
        reachable
          ? "\(count) items syncing to your iPhone"
          : "\(count) items saved on your watch, waiting for your iPhone"))
  }
}

/// 44 pt tall at radius 22 is a capsule by construction — the phone's rule.
struct PrimaryButton: View {
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: systemImage)
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
