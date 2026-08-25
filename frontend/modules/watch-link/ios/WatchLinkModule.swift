// The iPhone half of the Watch Connectivity link.
//
// Deliberately thin. It moves dictionaries between WCSession and JavaScript and
// does nothing else: no validation, no ordering, no idempotency. Every one of
// those rules lives in `src/watch/*.ts`, where it is testable without a pair of
// devices, and duplicating any of it here is how the two copies drift apart.
//
// Three channels, each chosen for what it guarantees:
//
//   · applicationContext — the workout snapshot. Latest-wins and coalescing,
//     which is exactly right for state and exactly wrong for events.
//   · transferUserInfo   — events and acknowledgements. Queued by the OS and
//     delivered eventually, including after a relaunch. This is what makes an
//     offline session survive.
//   · sendMessage        — the same events again while both apps are reachable,
//     purely so a set appears on the phone immediately. It is an optimisation:
//     the queued copy is the one that guarantees delivery, and the phone
//     recognises the duplicate by event id.

import ExpoModulesCore
import WatchConnectivity

public final class WatchLinkModule: Module {
  private let delegate = WatchLinkDelegate()

  public func definition() -> ModuleDefinition {
    Name("WatchLinkModule")

    Events("onEnvelope", "onStateChange")

    OnCreate {
      // The envelope is delivered AS the event payload, not wrapped in a
      // ["envelope": …] dictionary. index.ts declares "The payload is the raw
      // envelope" and the JS listener hands it straight to
      // `receiveWatchEnvelope`; the wrapper made validation see an
      // unidentifiable object, produce an empty ack, and send nothing — the
      // watch retried the same events every 15 seconds forever.
      self.delegate.onEnvelope = { [weak self] envelope in
        self?.sendEvent("onEnvelope", envelope)
      }
      self.delegate.onStateChange = { [weak self] state in
        self?.sendEvent("onStateChange", state)
      }
      self.delegate.activate()
    }

    Function("getState") { () -> [String: Any] in
      self.delegate.state()
    }

    AsyncFunction("updateApplicationContext") { (payload: [String: Any]) -> Bool in
      self.delegate.updateApplicationContext(payload)
    }

    AsyncFunction("sendAck") { (ack: [String: Any]) -> Bool in
      self.delegate.send(["kind": "ack", "ack": ack])
    }
  }
}

final class WatchLinkDelegate: NSObject, WCSessionDelegate {
  var onEnvelope: (([String: Any]) -> Void)?
  var onStateChange: (([String: Any]) -> Void)?

  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  func activate() {
    guard let session else { return }
    session.delegate = self
    session.activate()
  }

  func state() -> [String: Any] {
    guard let session else {
      return ["supported": false, "paired": false, "watchAppInstalled": false, "reachable": false]
    }
    return [
      "supported": true,
      "paired": session.isPaired,
      "watchAppInstalled": session.isWatchAppInstalled,
      "reachable": session.isReachable,
    ]
  }

  private func emitState() {
    onStateChange?(state())
  }

  func updateApplicationContext(_ payload: [String: Any]) -> Bool {
    guard let session, session.activationState == .activated else { return false }
    do {
      try session.updateApplicationContext(payload)
      return true
    } catch {
      // A failed context update is not an error worth surfacing: the next one
      // supersedes it, and the snapshot is not how work is recorded.
      return false
    }
  }

  @discardableResult
  func send(_ payload: [String: Any]) -> Bool {
    guard let session, session.activationState == .activated else { return false }
    // Queued first, so delivery is guaranteed even if the live send fails.
    session.transferUserInfo(payload)
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    }
    return true
  }

  // --- delegate ------------------------------------------------------------

  private func forward(_ payload: [String: Any]) {
    guard let envelope = payload["envelope"] as? [String: Any] else { return }
    onEnvelope?(envelope)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    forward(userInfo)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    forward(message)
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    forward(message)
    // The acknowledgement is produced asynchronously in JavaScript and comes
    // back through `sendAck`, so the reply here only confirms receipt.
    replyHandler(["received": true])
  }

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    emitState()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    emitState()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    emitState()
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  // Re-activating on a watch switch is required, or the link is dead for the
  // newly paired device until the app is relaunched.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}
