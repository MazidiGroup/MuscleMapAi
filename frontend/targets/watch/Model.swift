// Wire types and limits for the watch app.
//
// This is a direct port of `src/watch/protocol.ts`. The TypeScript file is the
// SPECIFICATION — it is the one both devices' rules are written against, and it
// is the one with tests. When a rule changes there, it changes here.
//
// The constants below are pinned to their TypeScript originals by
// `__tests__/watchParity.test.ts`, which reads this file as text and fails if a
// number drifts. It cannot check the control flow, so the ports are kept
// structurally identical on purpose: same names, same order, same branches.

import Foundation

// MARK: - Limits (mirrored — see WatchLimits in __tests__/watchParity.test.ts)

enum WatchLimits {
  static let schemaVersion = 1
  static let minReps = 1
  static let maxReps = 200
  static let maxWeightKg = 500.0
  static let maxWeightLb = 1100.0
  static let entitlementCacheTtlMs = 604800000.0
  static let entitlementFreshMs = 3600000.0
  static let defaultRestSeconds = 90
  static let maxBatch = 25
  static let maxClarifyChoices = 4
}

// MARK: - Units

enum WeightUnit: String, Codable, Hashable {
  case kg
  case lb

  var max: Double { self == .kg ? WatchLimits.maxWeightKg : WatchLimits.maxWeightLb }

  /// Localised only at the display boundary; the stored value keeps its unit.
  var label: String { rawValue }
}

/// Exact, by definition (international avoirdupois pound).
let kilogramsPerPound = 0.45359237

/// A load together with the unit it was entered in. Never stored bare — a bare
/// number is meaningless the moment the preference changes.
struct WeightValue: Codable, Hashable {
  var value: Double
  var unit: WeightUnit

  var isValid: Bool { value.isFinite && value >= 0 && value <= unit.max }
}

/// Gym loads come off real plates, so a converted figure is rounded to
/// something loadable: whole pounds, half kilos. Display boundary only.
func roundForUnit(_ value: Double, _ unit: WeightUnit) -> Double {
  guard value.isFinite else { return 0 }
  return unit == .lb ? (value).rounded() : (value * 2).rounded() / 2
}

func convertWeight(_ value: Double, from: WeightUnit, to: WeightUnit) -> Double {
  guard value.isFinite else { return 0 }
  if value == 0 || from == to { return value }
  let kilograms = from == .lb ? value * kilogramsPerPound : value
  return roundForUnit(to == .lb ? kilograms / kilogramsPerPound : kilograms, to)
}

func displayWeight(_ weight: WeightValue, in unit: WeightUnit) -> Double {
  convertWeight(weight.value, from: weight.unit, to: unit)
}

func isValidReps(_ reps: Int) -> Bool {
  reps >= WatchLimits.minReps && reps <= WatchLimits.maxReps
}

// MARK: - Events

enum ExerciseIdSpace: String, Codable, Hashable {
  case anatomy
  case plan
}

enum WatchSource: String, Codable, Hashable {
  case watchVoice = "watch.voice"
  case watchUI = "watch.ui"
  case phone
}

enum WatchEventKind: String, Codable {
  case sessionStart = "session.start"
  case exerciseAdd = "exercise.add"
  case setLog = "set.log"
  case setRevise = "set.revise"
  case setVoid = "set.void"
  case sessionEnd = "session.end"
}

/// One payload type rather than an enum with associated values, because the
/// wire format is a plain dictionary and a flat optional-bearing struct encodes
/// to exactly that without a custom coder on both sides.
struct WatchEventPayload: Codable, Hashable {
  var startedAt: Double?
  var endedAt: Double?
  var setId: String?
  var exerciseId: String?
  var idSpace: ExerciseIdSpace?
  var reps: Int?
  var weight: WeightValue?
  var warmup: Bool?
  var revision: Int?
}

struct WatchEvent: Codable, Hashable, Identifiable {
  var schema: Int = WatchLimits.schemaVersion
  var eventId: String
  var sessionId: String
  var seq: Int
  var at: Double
  var source: WatchSource
  var kind: WatchEventKind
  var payload: WatchEventPayload

  var id: String { eventId }
}

struct WatchEnvelope: Codable {
  var schema: Int = WatchLimits.schemaVersion
  var envelopeId: String
  var sentAt: Double
  var events: [WatchEvent]
}

enum RejectReason: String, Codable {
  case schemaUnsupported = "schema_unsupported"
  case invalidPayload = "invalid_payload"
  case unknownSession = "unknown_session"
  case unknownExercise = "unknown_exercise"
  case notEntitled = "not_entitled"
}

struct WatchRejection: Codable, Hashable {
  var eventId: String
  var reason: RejectReason
}

struct WatchAck: Codable {
  var schema: Int = WatchLimits.schemaVersion
  var envelopeId: String
  var accepted: [String]
  var rejected: [WatchRejection]
}

// MARK: - Snapshot from the phone

struct SnapshotSet: Codable, Hashable {
  var setId: String
  var reps: Int
  var weight: WeightValue
  var warmup: Bool?
}

struct SnapshotExercise: Codable, Hashable {
  var exerciseId: String
  var idSpace: ExerciseIdSpace
  var name: String
  var targetReps: Int
  var sets: [SnapshotSet]
}

struct SnapshotSession: Codable, Hashable {
  var sessionId: String
  var startedAt: Double
  var exercises: [SnapshotExercise]
}

struct EntitlementPayload: Codable, Hashable {
  var access: Bool
  /// "loading" | "ready" | "error", mirrored from the phone's own read.
  var state: String
  var verifiedAt: Double
}

struct WatchContextPayload: Codable {
  var schema: Int
  var revision: Int
  var sentAt: Double
  var entitlement: EntitlementPayload
  var unit: WeightUnit
  var restSeconds: Int
  var session: SnapshotSession?
}

// MARK: - Identity

/// Stable ids, minted once. The property that matters is stability across a
/// retry, not global uniqueness: ids are only ever compared between one
/// person's own two devices.
enum IdMint {
  private static var counter = 0
  private static let lock = NSLock()

  static func next(_ prefix: String, now: Date = Date()) -> String {
    lock.lock()
    counter = (counter + 1) % 0xffff
    let count = String(counter, radix: 36)
    lock.unlock()
    let time = String(Int(now.timeIntervalSince1970 * 1000), radix: 36)
    let random = String(Int.random(in: 0..<0x7fffffff), radix: 36)
    return "\(prefix)_\(time)\(count)\(random)"
  }
}

/// Milliseconds since the epoch, matching the phone's `Date.now()` exactly.
func nowMs(_ date: Date = Date()) -> Double {
  (date.timeIntervalSince1970 * 1000).rounded()
}
