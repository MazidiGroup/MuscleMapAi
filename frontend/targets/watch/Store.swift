// The watch's single source of truth.
//
// Owns the snapshot, the outbox and the last entitlement the phone verified,
// and is the only thing that calls the reducer. Both interaction paths — the
// SwiftUI controls and the App Intents — go through `run(_:)`, so a spoken
// command and a tapped one are literally the same code path with a different
// `source` recorded on the result.
//
// The order inside `run` is the feature's central promise and is not negotiable:
// persist, then confirm, then send. The user is told a set is saved only after
// it is on disk, so a watch that dies on the walk back from the rack has still
// kept it.

import Combine
import Foundation
import SwiftUI
import WatchKit

@MainActor
final class WatchStore: ObservableObject, WatchLinkDelegate {
  static let shared = WatchStore()

  @Published private(set) var snapshot: WatchSnapshot
  @Published private(set) var entitlement: WatchEntitlement
  @Published private(set) var reachable = false
  @Published private(set) var pendingCount = 0
  /// The last thing that happened, shown as a banner and read by VoiceOver.
  @Published var lastFeedback: Feedback?
  /// Set when a command needs a yes/no answer before it may proceed.
  @Published var pendingConfirmation: WorkoutCommand?

  private var outbox: Outbox
  private var appliedRevision: Int?
  private var flushTimer: Timer?
  /// Set when the snapshot changed in a way that is not worth a write on its own.
  private var snapshotDirty = false

  private static let snapshotKey = "watch-snapshot"
  private static let outboxKey = "watch-outbox"
  private static let entitlementKey = "watch-entitlement"

  private init() {
    let persistence = WatchPersistence.shared
    snapshot = persistence.load(Self.snapshotKey, as: WatchSnapshot.self) ?? .empty()
    outbox = persistence.load(Self.outboxKey, as: Outbox.self) ?? Outbox()
    entitlement = persistence.load(Self.entitlementKey, as: WatchEntitlement.self) ?? .neverVerified
    pendingCount = outbox.pendingCount
  }

  func start() {
    WatchLink.shared.delegate = self
    WatchLink.shared.activate()
    flush()
    // A repeating flush is what turns "the phone was unreachable" into latency
    // rather than loss. The interval is coarse on purpose: the backoff decides
    // what is actually due, and a watch has a battery.
    flushTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
      Task { @MainActor in
        // Deliberately NOT inside `flush()`: `run` calls flush on every command,
        // so folding it in there would write on every crown detent after all.
        self?.persistIfDirty()
        self?.flush()
      }
    }
  }

  // MARK: - Access

  var access: AccessDecision {
    watchAccess(entitlement, now: nowMs(), sessionGranted: snapshot.grantedAt != nil)
  }

  var isLocked: Bool { !access.allow }

  // MARK: - Commands

  /// The one way anything changes. Returns the outcome so an App Intent can
  /// speak it, and a view can render it.
  @discardableResult
  func run(_ command: WorkoutCommand, source: WatchSource = .watchUI) -> CommandOutcome {
    let deps = ApplyDeps(now: nowMs(), entitlement: entitlement, source: source)
    let outcome = WatchRules.apply(snapshot, command, deps)

    switch outcome {
    case let .applied(next, events, feedback):
      snapshot = next
      if !events.isEmpty {
        outbox.enqueue(events, now: deps.now)
        // Disk first, and only then is the set "saved" as far as the user is
        // concerned. Reversing these two lines is the bug this ordering exists
        // to prevent.
        persist()
      } else {
        // Nothing durable changed — a crown detent moves the working weight and
        // nothing else. Writing a file per detent would be a write every few
        // milliseconds while the user dials in a load, so it is deferred to the
        // flush timer and to leaving the screen. The worst case is the working
        // weight reverting after a crash, which the next set re-states anyway.
        snapshotDirty = true
      }
      pendingCount = outbox.pendingCount
      announce(feedback)
      flush()

    case let .refused(reason, feedback):
      if reason == .needsConfirmation { pendingConfirmation = confirmable(command) }
      announce(feedback)

    case let .clarify(feedback, _):
      announce(feedback)
    }

    return outcome
  }

  /// The confirmed form of a command that asked a question.
  private func confirmable(_ command: WorkoutCommand) -> WorkoutCommand? {
    if case .undoLastSet = command { return .undoLastSet(confirmed: true) }
    return nil
  }

  func confirmPending() {
    guard let command = pendingConfirmation else { return }
    pendingConfirmation = nil
    run(command)
  }

  func cancelPending() {
    pendingConfirmation = nil
  }

  /// Digital Crown and the +/− controls. Never a durable event on its own — the
  /// weight only matters once a set carries it.
  func nudgeWeight(steps: Int) {
    let increment = WatchRules.loadIncrement(snapshot.unit, snapshot.displayedWorkingWeight)
    run(.setWeight(WatchRules.nudgeWeight(snapshot, steps: steps, increment: increment)))
  }

  private func announce(_ feedback: Feedback) {
    lastFeedback = feedback
    Haptics.play(feedback.haptic)
  }

  // MARK: - Persistence

  private func persist() {
    persistSnapshot()
    WatchPersistence.shared.save(Self.outboxKey, outbox)
  }

  private func persistSnapshot() {
    snapshotDirty = false
    WatchPersistence.shared.save(Self.snapshotKey, snapshot)
  }

  /// Called from the flush timer and when the app leaves the screen, so a
  /// deferred change is never deferred indefinitely.
  func persistIfDirty() {
    guard snapshotDirty else { return }
    persistSnapshot()
  }

  // MARK: - Sync

  func flush() {
    let now = nowMs()
    guard let batch = outbox.nextBatch(now: now) else { return }
    outbox.markAttempted(batch, now: now)
    WatchPersistence.shared.save(Self.outboxKey, outbox)
    WatchLink.shared.send(batch)
  }

  nonisolated func linkDidReceive(ack: WatchAck) {
    Task { @MainActor in
      let refused = self.outbox.apply(ack)
      self.outbox.dropRejected()
      WatchPersistence.shared.save(Self.outboxKey, self.outbox)
      self.pendingCount = self.outbox.pendingCount
      // A permanent refusal has to be visible: it is work the user believes is
      // recorded and is not.
      if let first = refused.first {
        self.lastFeedback = .make(.error, Self.rejectionCopy(first.reason))
        Haptics.play(.failure)
      }
    }
  }

  nonisolated func linkDidReceive(context: WatchContextPayload) {
    Task { @MainActor in self.merge(context) }
  }

  nonisolated func linkReachabilityChanged(_ reachable: Bool) {
    Task { @MainActor in
      self.reachable = reachable
      if reachable { self.flush() }
    }
  }

  private static func rejectionCopy(_ reason: RejectReason) -> String {
    switch reason {
    case .notEntitled: return AccessBasis.notPremium.copy
    case .unknownExercise:
      return NSLocalizedString("Your iPhone did not recognise that exercise, so the set was not saved.", comment: "")
    case .schemaUnsupported:
      return NSLocalizedString("Update Muscle Map on your iPhone to receive sets from your watch.", comment: "")
    case .invalidPayload, .unknownSession:
      return NSLocalizedString("A set could not be saved to your iPhone. Check your workout there.", comment: "")
    }
  }

  // MARK: - Snapshot merge (mirrors src/watch/snapshot.ts)

  private func merge(_ payload: WatchContextPayload) {
    guard payload.schema <= WatchLimits.schemaVersion else { return }
    // Application context has no ordering guarantee, so ordering is enforced here.
    guard appliedRevision == nil || payload.revision > appliedRevision! else { return }
    appliedRevision = payload.revision

    entitlement = WatchEntitlement(
      access: payload.entitlement.access, state: payload.entitlement.state,
      verifiedAt: payload.entitlement.verifiedAt)
    WatchPersistence.shared.save(Self.entitlementKey, entitlement)

    let unsynced = outbox.unackedSetIds
    snapshot.unit = payload.unit
    snapshot.restSeconds = payload.restSeconds > 0 ? payload.restSeconds : WatchLimits.defaultRestSeconds

    guard let incoming = payload.session else {
      // The phone has no workout. If the watch is still holding unsynced work,
      // the phone has simply not caught up — dropping it here would delete sets
      // the user was told were saved.
      if unsynced.isEmpty, snapshot.sessionId != nil {
        var cleared = WatchSnapshot.empty(unit: payload.unit)
        cleared.restSeconds = snapshot.restSeconds
        snapshot = cleared
      }
      persistSnapshot()
      return
    }

    if let local = snapshot.sessionId, local != incoming.sessionId {
      // Adopt a different workout only with nothing outstanding, so a backlog
      // is never orphaned.
      if unsynced.isEmpty { adopt(incoming, payload: payload) }
      persistSnapshot()
      return
    }

    if snapshot.sessionId == nil {
      adopt(incoming, payload: payload)
    } else {
      reconcile(incoming, unsynced: unsynced, unackedExercises: outbox.unackedExerciseKeys)
    }
    persistSnapshot()
  }

  private func adopt(_ incoming: SnapshotSession, payload: WatchContextPayload) {
    snapshot.sessionId = incoming.sessionId
    snapshot.startedAt = incoming.startedAt
    snapshot.exercises = incoming.exercises.map(Self.view(from:))
    snapshot.currentIndex = max(0, snapshot.exercises.count - 1)
    snapshot.workingWeight =
      snapshot.exercises.last?.sets.last?.weight ?? WeightValue(value: 0, unit: payload.unit)
    // Joining a session records whether this watch was entitled at that moment.
    snapshot.grantedAt = payload.entitlement.access ? nowMs() : nil
    snapshot.lastAction = nil
    snapshot.rest = nil
    snapshot.paused = false
  }

  private func reconcile(
    _ incoming: SnapshotSession, unsynced: Set<String>, unackedExercises: Set<String>
  ) {
    let voided = Set(snapshot.exercises.flatMap { $0.sets.filter(\.voided).map(\.setId) })
    // `uniqueKeysWithValues` traps on a repeat; a duplicate exercise would be a
    // bug, but not one worth crashing a workout over.
    var byKey = Dictionary(snapshot.exercises.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

    var merged: [WatchExerciseView] = incoming.exercises.map { incomingExercise in
      let key = "\(incomingExercise.idSpace.rawValue):\(incomingExercise.exerciseId)"
      let mine = byKey.removeValue(forKey: key)
      let fromPhone = Self.view(from: incomingExercise).sets.filter { !voided.contains($0.setId) }
      let known = Set(fromPhone.map(\.setId))
      let stillMine = (mine?.sets ?? []).filter {
        !known.contains($0.setId) && !$0.voided && unsynced.contains($0.setId)
      }
      let tombstones = (mine?.sets ?? []).filter(\.voided)
      return WatchExerciseView(
        exerciseId: incomingExercise.exerciseId,
        idSpace: incomingExercise.idSpace,
        name: incomingExercise.name.isEmpty ? (mine?.name ?? incomingExercise.exerciseId) : incomingExercise.name,
        targetReps: incomingExercise.targetReps != 0 ? incomingExercise.targetReps : (mine?.targetReps ?? 0),
        sets: fromPhone + stillMine + tombstones)
    }

    // Exercises the watch added that the phone has not applied yet keep their
    // place rather than vanishing under the user mid-set. An exercise with
    // nothing outstanding is one the phone has genuinely dropped, so it goes.
    let currentKey = snapshot.currentExercise?.id
    merged.append(
      contentsOf: byKey.filter { key, exercise in
        unackedExercises.contains(key)
          || exercise.sets.contains { !$0.voided && unsynced.contains($0.setId) }
      }.values)

    snapshot.sessionId = incoming.sessionId
    snapshot.startedAt = incoming.startedAt
    snapshot.exercises = merged
    if let currentKey, let index = merged.firstIndex(where: { $0.id == currentKey }) {
      snapshot.currentIndex = index
    } else {
      snapshot.currentIndex = min(snapshot.currentIndex, max(0, merged.count - 1))
    }
  }

  private static func view(from exercise: SnapshotExercise) -> WatchExerciseView {
    WatchExerciseView(
      exerciseId: exercise.exerciseId,
      idSpace: exercise.idSpace,
      name: exercise.name,
      targetReps: exercise.targetReps,
      sets: exercise.sets.map {
        WatchSetView(
          setId: $0.setId, reps: $0.reps, weight: $0.weight, warmup: $0.warmup ?? false, voided: false,
          revision: 0, source: .phone, at: 0)
      })
  }
}

// MARK: - Haptics

enum Haptics {
  static func play(_ cue: HapticCue) {
    let type: WKHapticType
    switch cue {
    case .success: type = .success
    case .retry: type = .retry
    case .failure: type = .failure
    case .click: type = .click
    case .start: type = .start
    case .stop: type = .stop
    }
    WKInterfaceDevice.current().play(type)
  }
}
