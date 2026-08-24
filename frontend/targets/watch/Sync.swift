// The watch's outbox and its link to the iPhone.
//
// A port of `src/watch/outbox.ts`, plus the WCSession client the TypeScript
// version deliberately does not contain.
//
// The one rule everything else serves: the watch writes an event to disk BEFORE
// it tells the user the set is saved, and keeps it until the phone acknowledges
// that exact id. Reachability is never a precondition for recording a set — it
// only decides how quickly the phone finds out.

import Foundation
import WatchConnectivity

// MARK: - Outbox

struct OutboxEntry: Codable, Identifiable {
  var event: WatchEvent
  var queuedAt: Double
  var attempts: Int
  var lastAttemptAt: Double
  var rejected: RejectReason?
  var id: String { event.eventId }
}

/// Deterministic backoff — no jitter. Jitter spreads load across many clients;
/// here there is one phone and one watch, so it would only make the retry
/// schedule impossible to reason about.
let backoffStepsMs: [Double] = [0, 2_000, 5_000, 15_000, 60_000, 300_000]

func backoffMs(_ attempts: Int) -> Double {
  backoffStepsMs[min(max(attempts, 0), backoffStepsMs.count - 1)]
}

struct Outbox: Codable {
  var schema: Int = 1
  var entries: [OutboxEntry] = []

  var pending: [OutboxEntry] { entries.filter { $0.rejected == nil } }
  var pendingCount: Int { pending.count }

  /// Sets the phone has not confirmed. The snapshot merge uses this to know
  /// which local sets a phone update must not be allowed to erase.
  var unackedSetIds: Set<String> {
    Set(pending.filter { $0.event.kind == .setLog }.compactMap { $0.event.payload.setId })
  }

  /// Exercises the watch added that the phone has not confirmed, by identity
  /// key. An exercise with nothing outstanding that the phone no longer lists
  /// has genuinely been removed there, and must not linger on the watch.
  var unackedExerciseKeys: Set<String> {
    Set(
      pending.compactMap { entry -> String? in
        guard entry.event.kind == .exerciseAdd,
          let id = entry.event.payload.exerciseId,
          let space = entry.event.payload.idSpace
        else { return nil }
        return "\(space.rawValue):\(id)"
      })
  }

  /// Adds events, ignoring any id already queued. A retry is not an add.
  mutating func enqueue(_ events: [WatchEvent], now: Double) {
    var known = Set(entries.map(\.event.eventId))
    for event in events where !known.contains(event.eventId) {
      known.insert(event.eventId)
      entries.append(OutboxEntry(event: event, queuedAt: now, attempts: 0, lastAttemptAt: 0))
    }
  }

  func isDue(_ entry: OutboxEntry, now: Double) -> Bool {
    guard entry.rejected == nil else { return false }
    if entry.attempts == 0 { return true }
    return now - entry.lastAttemptAt >= backoffMs(entry.attempts)
  }

  /// The next batch, in the watch's own sequence order.
  func nextBatch(now: Double, limit: Int = WatchLimits.maxBatch) -> WatchEnvelope? {
    let due = entries.filter { isDue($0, now: now) }
    guard !due.isEmpty else { return nil }
    let ordered = due.map(\.event).sorted {
      ($0.seq, $0.at, $0.eventId) < ($1.seq, $1.at, $1.eventId)
    }
    return WatchEnvelope(
      envelopeId: IdMint.next("env"), sentAt: now, events: Array(ordered.prefix(limit)))
  }

  mutating func markAttempted(_ envelope: WatchEnvelope, now: Double) {
    let ids = Set(envelope.events.map(\.eventId))
    for index in entries.indices where ids.contains(entries[index].event.eventId) {
      entries[index].attempts += 1
      entries[index].lastAttemptAt = now
    }
  }

  /// An accepted id is removed outright: from the phone, "accepted" covers both
  /// "applied now" and "already had it". An id the phone did not mention is
  /// left exactly as it was — forgetting it here is how work disappears.
  @discardableResult
  mutating func apply(_ ack: WatchAck) -> [WatchRejection] {
    let accepted = Set(ack.accepted)
    // Last-one-wins rather than `uniqueKeysWithValues`, which TRAPS on a repeat.
    // This is data off the wire; a malformed acknowledgement must not crash the
    // watch and take the unsynced outbox down with it.
    let byId = Dictionary(ack.rejected.map { ($0.eventId, $0.reason) }, uniquingKeysWith: { _, last in last })
    var surfaced: [WatchRejection] = []

    entries = entries.compactMap { entry in
      if accepted.contains(entry.event.eventId) { return nil }
      if let reason = byId[entry.event.eventId] {
        surfaced.append(WatchRejection(eventId: entry.event.eventId, reason: reason))
        var next = entry
        next.rejected = reason
        return next
      }
      return entry
    }
    return surfaced
  }

  /// Removes rejected entries once their reason has been shown to the user.
  mutating func dropRejected() {
    entries.removeAll { $0.rejected != nil }
  }
}

// MARK: - Durable storage

/// The snapshot and outbox are written to the app container as JSON.
///
/// A file rather than `UserDefaults`: the outbox is the record of work the user
/// has been told is saved, and it must survive a crash between the write and
/// the next launch with no ambiguity about whether it was flushed.
final class WatchPersistence {
  static let shared = WatchPersistence()

  private let queue = DispatchQueue(label: "com.mazidigroup.apexai.watch.persistence")
  private let directory: URL

  private init() {
    directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  private func url(_ name: String) -> URL { directory.appendingPathComponent("\(name).json") }

  func load<T: Decodable>(_ name: String, as type: T.Type) -> T? {
    queue.sync {
      guard let data = try? Data(contentsOf: url(name)) else { return nil }
      return try? JSONDecoder().decode(type, from: data)
    }
  }

  /// Writes atomically. A half-written outbox would be worse than none at all.
  func save<T: Encodable>(_ name: String, _ value: T) {
    queue.sync {
      guard let data = try? JSONEncoder().encode(value) else { return }
      try? data.write(to: url(name), options: .atomic)
    }
  }
}

// MARK: - Connectivity

protocol WatchLinkDelegate: AnyObject {
  func linkDidReceive(context: WatchContextPayload)
  func linkDidReceive(ack: WatchAck)
  func linkReachabilityChanged(_ reachable: Bool)
}

/// The watch half of the link. Sends every batch twice on purpose: queued for
/// the guarantee, live for the latency. The phone recognises the duplicate by
/// event id, which is the whole reason that is safe.
final class WatchLink: NSObject, WCSessionDelegate {
  static let shared = WatchLink()

  weak var delegate: WatchLinkDelegate?

  private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

  var isReachable: Bool { session?.isReachable ?? false }

  func activate() {
    guard let session else { return }
    session.delegate = self
    session.activate()
  }

  func send(_ envelope: WatchEnvelope) {
    guard let session, session.activationState == .activated else { return }
    guard let payload = encode(envelope) else { return }
    let message: [String: Any] = ["kind": "envelope", "envelope": payload]
    session.transferUserInfo(message)
    if session.isReachable {
      session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }
  }

  private func encode(_ envelope: WatchEnvelope) -> [String: Any]? {
    guard let data = try? JSONEncoder().encode(envelope) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  private func decodeContext(_ raw: [String: Any]) -> WatchContextPayload? {
    guard let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
    return try? JSONDecoder().decode(WatchContextPayload.self, from: data)
  }

  private func handle(_ payload: [String: Any]) {
    if let rawAck = payload["ack"] as? [String: Any],
      let data = try? JSONSerialization.data(withJSONObject: rawAck),
      let ack = try? JSONDecoder().decode(WatchAck.self, from: data)
    {
      delegate?.linkDidReceive(ack: ack)
    }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    if let context = decodeContext(session.receivedApplicationContext) {
      delegate?.linkDidReceive(context: context)
    }
    delegate?.linkReachabilityChanged(session.isReachable)
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    guard let context = decodeContext(applicationContext) else { return }
    delegate?.linkDidReceive(context: context)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    handle(userInfo)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    handle(message)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    delegate?.linkReachabilityChanged(session.isReachable)
  }
}
