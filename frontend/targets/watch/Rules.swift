// The watch's copy of the command rules.
//
// A direct port of `src/watch/commands.ts`, `src/watch/gate.ts` and
// `src/watch/session.ts`. Those files are the specification and carry the
// tests; this file exists because a watch app cannot run them.
//
// The ports are kept structurally identical — same function names, same branch
// order, same refusal reasons — so that a diff of the two reads as a
// translation rather than as two implementations. The one property that must
// hold in both: `refused` and `clarify` carry NO snapshot and NO events, so a
// misheard command has nothing to write with.

import Foundation

// MARK: - Commands

enum WorkoutCommand: Equatable {
  case startWorkout
  case pauseWorkout
  case resumeWorkout
  case selectExercise(exerciseId: String, idSpace: ExerciseIdSpace, name: String)
  case nextExercise
  case previousExercise
  case setWeight(WeightValue)
  case logSet(reps: Int, weight: WeightValue?, warmup: Bool)
  case reviseLastSet(reps: Int?, weight: WeightValue?)
  case undoLastSet(confirmed: Bool)
  case endWorkout

  /// Commands that can change stored work. Mirrors MUTATING_COMMANDS.
  var isMutating: Bool {
    switch self {
    case .startWorkout, .selectExercise, .logSet, .reviseLastSet, .undoLastSet, .endWorkout: return true
    case .pauseWorkout, .resumeWorkout, .nextExercise, .previousExercise, .setWeight: return false
    }
  }
}

enum RefusalReason: String {
  case notEntitled = "not_entitled"
  case noSession = "no_session"
  case sessionAlreadyRunning = "session_already_running"
  case noExerciseSelected = "no_exercise_selected"
  case noExerciseInSession = "no_exercise_in_session"
  case repsOutOfRange = "reps_out_of_range"
  case weightOutOfRange = "weight_out_of_range"
  case nothingToUndo = "nothing_to_undo"
  case nothingToRevise = "nothing_to_revise"
  case needsConfirmation = "needs_confirmation"
}

enum FeedbackTone { case success, warning, error }

enum HapticCue { case success, retry, failure, click, start, stop }

struct Feedback {
  var tone: FeedbackTone
  var haptic: HapticCue
  var message: String

  static func make(_ tone: FeedbackTone, _ message: String, _ haptic: HapticCue? = nil) -> Feedback {
    let fallback: HapticCue = tone == .success ? .success : (tone == .warning ? .retry : .failure)
    return Feedback(tone: tone, haptic: haptic ?? fallback, message: message)
  }
}

struct ExerciseChoice: Identifiable, Hashable {
  var exerciseId: String
  var idSpace: ExerciseIdSpace
  var name: String
  var id: String { "\(idSpace.rawValue):\(exerciseId)" }
}

enum CommandOutcome {
  case applied(snapshot: WatchSnapshot, events: [WatchEvent], feedback: Feedback)
  case clarify(feedback: Feedback, choices: [ExerciseChoice])
  case refused(reason: RefusalReason, feedback: Feedback)

  var feedback: Feedback {
    switch self {
    case let .applied(_, _, feedback): return feedback
    case let .clarify(feedback, _): return feedback
    case let .refused(_, feedback): return feedback
    }
  }
}

// MARK: - Copy (mirrors WATCH_COPY)

enum WatchCopy {
  static let noSession = NSLocalizedString("Start a workout first, then I can log that set.", comment: "")
  static let sessionRunning = NSLocalizedString("That workout is already running.", comment: "")
  static let emptySession = NSLocalizedString(
    "There are no exercises in this workout yet. Add one on your iPhone or from the list.", comment: "")
  static let repsOutOfRange = String(
    format: NSLocalizedString("Reps need to be a whole number between %d and %d.", comment: ""),
    WatchLimits.minReps, WatchLimits.maxReps)
  static let nothingToUndo = NSLocalizedString("There is nothing to undo in this workout.", comment: "")
  static let nothingToRevise = NSLocalizedString("There is no set to change yet.", comment: "")
  static let paused = NSLocalizedString("Workout paused.", comment: "")
  static let resumed = NSLocalizedString("Workout resumed.", comment: "")
  static let ended = NSLocalizedString("Workout finished and saved to your iPhone.", comment: "")
  static let started = NSLocalizedString("Workout started.", comment: "")
  static let offlineSaved = NSLocalizedString(
    "Saved on your watch. It will reach your iPhone when they reconnect.", comment: "")

  static func weightOutOfRange(_ unit: WeightUnit) -> String {
    String(
      format: NSLocalizedString("That weight is outside the range I can log — up to %@ %@.", comment: ""),
      formatLoad(unit.max), unit.label)
  }

  static func confirmUndo(_ description: String) -> String {
    String(format: NSLocalizedString("Undo %@?", comment: ""), description)
  }

  static func undone(_ description: String) -> String {
    String(format: NSLocalizedString("Undone: %@.", comment: ""), description)
  }

  static func weightSet(_ weight: Double, _ unit: WeightUnit) -> String {
    String(
      format: NSLocalizedString("Working weight is now %@ %@.", comment: ""), formatLoad(weight), unit.label)
  }

  static func ambiguousExercise(_ spoken: String) -> String {
    String(format: NSLocalizedString("More than one exercise matches \"%@\". Which one?", comment: ""), spoken)
  }

  static func unknownExercise(_ spoken: String) -> String {
    String(
      format: NSLocalizedString("I could not find \"%@\" in this workout or the exercise library.", comment: ""),
      spoken)
  }
}

/// Trims the trailing zeros a converted load picks up — "85.0 kg" reads wrong.
func formatLoad(_ value: Double) -> String {
  guard value.isFinite else { return "0" }
  let rounded = (value * 100).rounded() / 100
  return rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)
}

/// A confirmation always names the exercise, the reps and the load, because the
/// one failure voice logging cannot recover from is the user believing a
/// different set was saved than the one that was.
func confirmSetLine(_ exerciseName: String, _ reps: Int, _ weight: Double, _ unit: WeightUnit, warmup: Bool = false)
  -> String
{
  let load = weight > 0 ? "\(formatLoad(weight)) \(unit.label)" : NSLocalizedString("bodyweight", comment: "")
  let prefix = warmup ? NSLocalizedString("Warm-up: ", comment: "") : ""
  return "\(prefix)\(reps) reps at \(load), \(exerciseName)."
}

// MARK: - Entitlement (mirrors gate.ts)

struct WatchEntitlement: Codable, Equatable {
  var access: Bool
  var state: String
  var verifiedAt: Double

  static let neverVerified = WatchEntitlement(access: false, state: "loading", verifiedAt: 0)
}

enum AccessBasis: String {
  case verified, cached
  case activeSessionGrace = "active_session_grace"
  case neverVerified = "never_verified"
  // Spelled out even though Swift would infer it: the parity test matches the
  // wire string literally, and an inferred raw value is invisible to it.
  case unconfirmed = "unconfirmed"
  case expiredCache = "expired_cache"
  case notPremium = "not_premium"
  case loading

  /// Whether the denial is "reconnect", not "upgrade". Purchases are on iPhone.
  var needsPhone: Bool {
    self == .loading || self == .neverVerified || self == .unconfirmed || self == .expiredCache
  }

  var copy: String {
    switch self {
    case .verified, .cached, .activeSessionGrace: return ""
    case .loading: return NSLocalizedString("Checking your Premium access on your iPhone…", comment: "")
    case .neverVerified:
      return NSLocalizedString("Open Muscle Map on your iPhone once to set up watch logging.", comment: "")
    case .unconfirmed:
      // The phone answered and the answer was "I could not check". Naming the
      // connection is the only thing the user can act on; telling them to open
      // an app they are holding is not.
      return NSLocalizedString(
        "Your iPhone could not confirm your Premium access. Check its connection, then try again.",
        comment: "")
    case .expiredCache:
      return NSLocalizedString("Reconnect to your iPhone to confirm your Premium access.", comment: "")
    case .notPremium:
      return NSLocalizedString("Apple Watch logging is part of Premium. You can upgrade on your iPhone.", comment: "")
    }
  }
}

struct AccessDecision {
  var allow: Bool
  var basis: AccessBasis
}

func watchAccess(_ entitlement: WatchEntitlement, now: Double, sessionGranted: Bool) -> AccessDecision {
  let age = entitlement.verifiedAt > 0 ? max(0, now - entitlement.verifiedAt) : Double.infinity

  if entitlement.verifiedAt > 0, entitlement.access, age <= WatchLimits.entitlementCacheTtlMs {
    return AccessDecision(allow: true, basis: age <= WatchLimits.entitlementFreshMs ? .verified : .cached)
  }

  // Everything below is a denial — unless this session already holds a grant,
  // in which case it finishes. Stopping someone mid-set to show a paywall
  // destroys real work to enforce a boundary that waits ninety seconds.
  if sessionGranted { return AccessDecision(allow: true, basis: .activeSessionGrace) }

  if entitlement.verifiedAt == 0 {
    // No confirmed answer yet — but `state` already says whether the phone has
    // spoken at all, because a watch that has heard nothing still holds the
    // `loading` default. An `error` therefore means the phone DID answer and
    // could not confirm, which must not be reported as "open the app once":
    // the app is open, and that instruction sends the user in a circle.
    if entitlement.state == "error" { return AccessDecision(allow: false, basis: .unconfirmed) }
    return AccessDecision(allow: false, basis: entitlement.state == "loading" ? .loading : .neverVerified)
  }
  if entitlement.access, age > WatchLimits.entitlementCacheTtlMs {
    return AccessDecision(allow: false, basis: .expiredCache)
  }
  if entitlement.state == "loading" { return AccessDecision(allow: false, basis: .loading) }
  return AccessDecision(allow: false, basis: .notPremium)
}

// MARK: - Snapshot (mirrors session.ts)

struct WatchSetView: Codable, Hashable, Identifiable {
  var setId: String
  var reps: Int
  var weight: WeightValue
  var warmup: Bool
  var voided: Bool
  var revision: Int
  var source: WatchSource
  var at: Double
  var id: String { setId }
}

struct WatchExerciseView: Codable, Hashable, Identifiable {
  var exerciseId: String
  var idSpace: ExerciseIdSpace
  var name: String
  var targetReps: Int
  var sets: [WatchSetView]
  var id: String { "\(idSpace.rawValue):\(exerciseId)" }
  var liveSets: [WatchSetView] { sets.filter { !$0.voided } }
}

enum LastAction: Codable, Equatable {
  case logged(exerciseIndex: Int, setId: String, description: String)
  case revised(
    exerciseIndex: Int, setId: String, reps: Int, weight: WeightValue, warmup: Bool, description: String)

  var description: String {
    switch self {
    case let .logged(_, _, description): return description
    case let .revised(_, _, _, _, _, description): return description
    }
  }
}

/// The rest timer stores an absolute end instant rather than counting ticks, so
/// time that passes while the app is not on screen is accounted for. Mirrors
/// `src/anatomy/restClock.ts`.
struct RestClock: Codable, Equatable {
  var total: Int
  var endsAt: Double
  var pausedRemaining: Int?

  static func start(total: Int, now: Double) -> RestClock {
    RestClock(total: total, endsAt: now + Double(total) * 1000, pausedRemaining: nil)
  }

  func remaining(now: Double) -> Int {
    let raw = pausedRemaining ?? Int(((endsAt - now) / 1000).rounded(.up))
    return min(max(raw, 0), max(total, 0))
  }

  func paused(now: Double) -> RestClock {
    guard pausedRemaining == nil else { return self }
    var next = self
    next.pausedRemaining = remaining(now: now)
    return next
  }

  func resumed(now: Double) -> RestClock {
    guard let held = pausedRemaining else { return self }
    return RestClock(total: total, endsAt: now + Double(held) * 1000, pausedRemaining: nil)
  }
}

struct WatchSnapshot: Codable, Equatable {
  var schema: Int = WatchLimits.schemaVersion
  var sessionId: String?
  var startedAt: Double?
  var unit: WeightUnit = .kg
  var exercises: [WatchExerciseView] = []
  var currentIndex: Int = 0
  var workingWeight: WeightValue = WeightValue(value: 0, unit: .kg)
  var restSeconds: Int = WatchLimits.defaultRestSeconds
  var rest: RestClock?
  var paused: Bool = false
  var seq: Int = 0
  /// When THIS watch was granted access for this session. Nothing else extends
  /// access through a lapsed or unreachable entitlement.
  var grantedAt: Double?
  var lastAction: LastAction?

  static func empty(unit: WeightUnit = .kg) -> WatchSnapshot {
    WatchSnapshot(unit: unit, workingWeight: WeightValue(value: 0, unit: unit))
  }

  var currentExercise: WatchExerciseView? {
    guard !exercises.isEmpty else { return nil }
    return exercises[min(max(currentIndex, 0), exercises.count - 1)]
  }

  var nextSetNumber: Int { (currentExercise?.liveSets.count ?? 0) + 1 }

  var displayedWorkingWeight: Double { displayWeight(workingWeight, in: unit) }

  var choices: [ExerciseChoice] {
    exercises.map { ExerciseChoice(exerciseId: $0.exerciseId, idSpace: $0.idSpace, name: $0.name) }
  }

  /// The most recent live set anywhere in the session.
  var lastLoggedSet: (exerciseIndex: Int, set: WatchSetView)? {
    var found: (Int, WatchSetView)?
    for (index, exercise) in exercises.enumerated() {
      for set in exercise.sets where !set.voided {
        if found == nil || set.at > found!.1.at { found = (index, set) }
      }
    }
    return found.map { (exerciseIndex: $0.0, set: $0.1) }
  }
}

// MARK: - The reducer

struct ApplyDeps {
  var now: Double
  var entitlement: WatchEntitlement
  var source: WatchSource = .watchUI
}

enum WatchRules {
  /// The single entry point for every change the watch makes. Both the taps and
  /// the App Intents arrive here.
  static func apply(_ snapshot: WatchSnapshot, _ command: WorkoutCommand, _ deps: ApplyDeps) -> CommandOutcome {
    if command.isMutating {
      let decision = watchAccess(deps.entitlement, now: deps.now, sessionGranted: snapshot.grantedAt != nil)
      if !decision.allow {
        return .refused(reason: .notEntitled, feedback: .make(.error, decision.basis.copy))
      }
    }

    switch command {
    case .startWorkout: return start(snapshot, deps)
    case .pauseWorkout: return pause(snapshot, deps)
    case .resumeWorkout: return resume(snapshot, deps)
    case let .selectExercise(exerciseId, idSpace, name):
      return select(snapshot, exerciseId, idSpace, name, deps)
    case .nextExercise: return step(snapshot, 1, deps)
    case .previousExercise: return step(snapshot, -1, deps)
    case let .setWeight(weight): return setWeight(snapshot, weight, deps)
    case let .logSet(reps, weight, warmup): return logSet(snapshot, reps, weight, warmup, deps)
    case let .reviseLastSet(reps, weight): return reviseLastSet(snapshot, reps, weight, deps)
    case let .undoLastSet(confirmed): return undoLastSet(snapshot, confirmed, deps)
    case .endWorkout: return endWorkout(snapshot, deps)
    }
  }

  // MARK: individual commands

  private static func event(
    _ snapshot: WatchSnapshot, _ kind: WatchEventKind, _ payload: WatchEventPayload, _ deps: ApplyDeps, seq: Int
  ) -> WatchEvent {
    WatchEvent(
      eventId: IdMint.next("ev"),
      sessionId: snapshot.sessionId ?? "",
      seq: seq,
      at: deps.now,
      source: deps.source,
      kind: kind,
      payload: payload)
  }

  private static func start(_ s: WatchSnapshot, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId == nil else {
      return .refused(reason: .sessionAlreadyRunning, feedback: .make(.warning, WatchCopy.sessionRunning))
    }
    var next = s
    next.sessionId = IdMint.next("s")
    next.startedAt = deps.now
    next.seq = 1
    next.grantedAt = deps.now
    next.paused = false
    next.rest = nil
    next.lastAction = nil
    let ev = event(next, .sessionStart, WatchEventPayload(startedAt: deps.now), deps, seq: 0)
    return .applied(snapshot: next, events: [ev], feedback: .make(.success, WatchCopy.started, .start))
  }

  private static func pause(_ s: WatchSnapshot, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    var next = s
    next.paused = true
    next.rest = s.rest?.paused(now: deps.now)
    return .applied(snapshot: next, events: [], feedback: .make(.success, WatchCopy.paused, .stop))
  }

  private static func resume(_ s: WatchSnapshot, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    var next = s
    next.paused = false
    next.rest = s.rest?.resumed(now: deps.now)
    return .applied(snapshot: next, events: [], feedback: .make(.success, WatchCopy.resumed, .start))
  }

  private static func select(
    _ s: WatchSnapshot, _ exerciseId: String, _ idSpace: ExerciseIdSpace, _ name: String, _ deps: ApplyDeps
  ) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    if let existing = s.exercises.firstIndex(where: { $0.exerciseId == exerciseId && $0.idSpace == idSpace }) {
      var next = s
      next.currentIndex = existing
      return .applied(
        snapshot: next, events: [], feedback: .make(.success, "\(s.exercises[existing].name).", .click))
    }
    var next = s
    next.exercises.append(
      WatchExerciseView(exerciseId: exerciseId, idSpace: idSpace, name: name, targetReps: 0, sets: []))
    next.currentIndex = s.exercises.count
    next.seq = s.seq + 1
    let ev = event(
      s, .exerciseAdd, WatchEventPayload(exerciseId: exerciseId, idSpace: idSpace), deps, seq: s.seq)
    return .applied(snapshot: next, events: [ev], feedback: .make(.success, "\(name).", .click))
  }

  private static func step(_ s: WatchSnapshot, _ delta: Int, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    guard !s.exercises.isEmpty else {
      return .refused(reason: .noExerciseInSession, feedback: .make(.warning, WatchCopy.emptySession))
    }
    let index = min(max(s.currentIndex + delta, 0), s.exercises.count - 1)
    var next = s
    next.currentIndex = index
    next.rest = nil
    // A new exercise does not inherit the last one's load: a wrong prefilled
    // number asserts where a blank one asks.
    if index != s.currentIndex {
      let target = s.exercises[index]
      next.workingWeight = target.liveSets.last?.weight ?? WeightValue(value: 0, unit: s.unit)
    }
    return .applied(snapshot: next, events: [], feedback: .make(.success, "\(s.exercises[index].name).", .click))
  }

  private static func setWeight(_ s: WatchSnapshot, _ weight: WeightValue, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    guard weight.isValid else {
      return .refused(
        reason: .weightOutOfRange, feedback: .make(.warning, WatchCopy.weightOutOfRange(weight.unit)))
    }
    var next = s
    next.workingWeight = weight
    let shown = displayWeight(weight, in: s.unit)
    return .applied(
      snapshot: next, events: [], feedback: .make(.success, WatchCopy.weightSet(shown, s.unit), .click))
  }

  /// The command the whole feature exists for. An explicit weight updates the
  /// working weight AND logs the set as one indivisible step.
  private static func logSet(
    _ s: WatchSnapshot, _ reps: Int, _ explicit: WeightValue?, _ warmup: Bool, _ deps: ApplyDeps
  ) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    guard let exercise = s.currentExercise else {
      return .refused(reason: .noExerciseSelected, feedback: .make(.warning, WatchCopy.emptySession))
    }
    guard isValidReps(reps) else {
      return .refused(reason: .repsOutOfRange, feedback: .make(.warning, WatchCopy.repsOutOfRange))
    }
    if let explicit, !explicit.isValid {
      return .refused(
        reason: .weightOutOfRange, feedback: .make(.warning, WatchCopy.weightOutOfRange(explicit.unit)))
    }
    let weight = explicit ?? s.workingWeight
    let setId = IdMint.next("set")
    let set = WatchSetView(
      setId: setId, reps: reps, weight: weight, warmup: warmup, voided: false, revision: 0,
      source: deps.source, at: deps.now)

    // `currentExercise` clamps, so the raw index can be past the end after a
    // merge shortened the list. Subscripting it directly would trap.
    let index = min(max(s.currentIndex, 0), s.exercises.count - 1)
    var next = s
    next.exercises[index].sets.append(set)
    next.workingWeight = weight
    next.seq = s.seq + 1
    next.rest = RestClock.start(total: s.restSeconds, now: deps.now)
    next.paused = false

    let shown = displayWeight(weight, in: s.unit)
    let description = confirmSetLine(exercise.name, reps, shown, s.unit, warmup: warmup)
    next.lastAction = .logged(exerciseIndex: index, setId: setId, description: description)

    let ev = event(
      s, .setLog,
      WatchEventPayload(
        setId: setId, exerciseId: exercise.exerciseId, idSpace: exercise.idSpace, reps: reps, weight: weight,
        warmup: warmup ? true : nil),
      deps, seq: s.seq)
    return .applied(snapshot: next, events: [ev], feedback: .make(.success, description))
  }

  private static func reviseLastSet(
    _ s: WatchSnapshot, _ reps: Int?, _ weight: WeightValue?, _ deps: ApplyDeps
  ) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    guard let target = s.lastLoggedSet else {
      return .refused(reason: .nothingToRevise, feedback: .make(.warning, WatchCopy.nothingToRevise))
    }
    let nextReps = reps ?? target.set.reps
    let nextWeight = weight ?? target.set.weight
    guard isValidReps(nextReps) else {
      return .refused(reason: .repsOutOfRange, feedback: .make(.warning, WatchCopy.repsOutOfRange))
    }
    guard nextWeight.isValid else {
      return .refused(
        reason: .weightOutOfRange, feedback: .make(.warning, WatchCopy.weightOutOfRange(nextWeight.unit)))
    }

    let revision = target.set.revision + 1
    var next = s
    guard let setIndex = next.exercises[target.exerciseIndex].sets.firstIndex(where: { $0.setId == target.set.setId })
    else {
      return .refused(reason: .nothingToRevise, feedback: .make(.warning, WatchCopy.nothingToRevise))
    }
    next.exercises[target.exerciseIndex].sets[setIndex].reps = nextReps
    next.exercises[target.exerciseIndex].sets[setIndex].weight = nextWeight
    next.exercises[target.exerciseIndex].sets[setIndex].revision = revision
    next.workingWeight = nextWeight
    next.seq = s.seq + 1

    let name = s.exercises[target.exerciseIndex].name
    let description = confirmSetLine(
      name, nextReps, displayWeight(nextWeight, in: s.unit), s.unit, warmup: target.set.warmup)
    next.lastAction = .revised(
      exerciseIndex: target.exerciseIndex, setId: target.set.setId, reps: target.set.reps,
      weight: target.set.weight, warmup: target.set.warmup, description: description)

    let ev = event(
      s, .setRevise,
      WatchEventPayload(
        setId: target.set.setId, reps: nextReps, weight: nextWeight,
        warmup: target.set.warmup ? true : nil, revision: revision),
      deps, seq: s.seq)
    return .applied(snapshot: next, events: [ev], feedback: .make(.success, description))
  }

  /// Undo confirms by REFUSING rather than by holding a pending state: nothing
  /// is queued and nothing is half-done, so a crash cannot delete a set the
  /// user never confirmed.
  private static func undoLastSet(_ s: WatchSnapshot, _ confirmed: Bool, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    guard let action = s.lastAction else {
      return .refused(reason: .nothingToUndo, feedback: .make(.warning, WatchCopy.nothingToUndo))
    }
    guard confirmed else {
      return .refused(
        reason: .needsConfirmation, feedback: .make(.warning, WatchCopy.confirmUndo(action.description)))
    }

    var next = s
    next.seq = s.seq + 1
    next.lastAction = nil

    switch action {
    case let .logged(exerciseIndex, setId, description):
      guard let setIndex = next.exercises[exerciseIndex].sets.firstIndex(where: { $0.setId == setId }) else {
        return .refused(reason: .nothingToUndo, feedback: .make(.warning, WatchCopy.nothingToUndo))
      }
      next.exercises[exerciseIndex].sets[setIndex].voided = true
      next.rest = nil
      let ev = event(s, .setVoid, WatchEventPayload(setId: setId), deps, seq: s.seq)
      return .applied(snapshot: next, events: [ev], feedback: .make(.success, WatchCopy.undone(description)))

    case let .revised(exerciseIndex, setId, reps, weight, warmup, description):
      guard let setIndex = next.exercises[exerciseIndex].sets.firstIndex(where: { $0.setId == setId }) else {
        return .refused(reason: .nothingToUndo, feedback: .make(.warning, WatchCopy.nothingToUndo))
      }
      // Restoring is a further revision, so the phone converges on it by the
      // same highest-revision-wins rule rather than by a special case.
      let revision = next.exercises[exerciseIndex].sets[setIndex].revision + 1
      next.exercises[exerciseIndex].sets[setIndex].reps = reps
      next.exercises[exerciseIndex].sets[setIndex].weight = weight
      next.exercises[exerciseIndex].sets[setIndex].warmup = warmup
      next.exercises[exerciseIndex].sets[setIndex].revision = revision
      next.workingWeight = weight
      let ev = event(
        s, .setRevise,
        WatchEventPayload(setId: setId, reps: reps, weight: weight, warmup: warmup ? true : nil, revision: revision),
        deps, seq: s.seq)
      return .applied(snapshot: next, events: [ev], feedback: .make(.success, WatchCopy.undone(description)))
    }
  }

  private static func endWorkout(_ s: WatchSnapshot, _ deps: ApplyDeps) -> CommandOutcome {
    guard s.sessionId != nil else {
      return .refused(reason: .noSession, feedback: .make(.warning, WatchCopy.noSession))
    }
    let ev = event(s, .sessionEnd, WatchEventPayload(endedAt: deps.now), deps, seq: s.seq)
    // The events keep the session id they were minted with, so a backlog that
    // syncs after the workout ended still lands correctly.
    var next = WatchSnapshot.empty(unit: s.unit)
    next.restSeconds = s.restSeconds
    return .applied(snapshot: next, events: [ev], feedback: .make(.success, WatchCopy.ended, .stop))
  }

  /// The next weight one crown detent away, converted back into the working
  /// weight's own unit so repeated nudges cannot drift the stored value.
  static func nudgeWeight(_ s: WatchSnapshot, steps: Int, increment: Double) -> WeightValue {
    let target = max(0, s.displayedWorkingWeight + Double(steps) * increment)
    if s.workingWeight.unit == s.unit { return WeightValue(value: target, unit: s.unit) }
    return WeightValue(value: convertWeight(target, from: s.unit, to: s.workingWeight.unit), unit: s.workingWeight.unit)
  }

  /// Smallest jump that is actually loadable. Mirrors `loadIncrement`.
  static func loadIncrement(_ unit: WeightUnit, _ current: Double) -> Double {
    if unit == .lb { return current >= 100 ? 10 : 5 }
    return current >= 40 ? 5 : 2.5
  }
}
