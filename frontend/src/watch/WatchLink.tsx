// Mounts the watch link on the iPhone.
//
// Renders nothing. It exists to connect three things that already exist and
// should not know about each other: the workout store (the source of truth), the
// premium resolution (the entitlement), and the Watch Connectivity module.
//
// Everything it does is one of two directions:
//   · out — a compact snapshot whenever the workout, the unit or the
//     entitlement changes, so a watch that wakes up is immediately correct;
//   · in  — an envelope of events, routed through the store's `receiveWatchEnvelope`
//     and answered with an acknowledgement.
//
// It is safe to mount unconditionally. With no native module (Expo Go, web,
// Android) every call is an inert no-op, so the watch feature can never be the
// reason the app fails to start somewhere it does not exist.

import { useCallback, useEffect, useRef, useState } from "react";

import { useWorkout } from "@/src/anatomy/workoutStore";
import { usePremium } from "@/src/premium/PremiumContext";
import { usePlanStore } from "@/src/plan/planStore";
import { plannedRepsFrom } from "@/src/anatomy/progression";
import { buildActiveSession } from "@/src/anatomy/workoutScope";
import { useOwner } from "@/src/owner/OwnerContext";
import {
  WatchLinkState,
  UNSUPPORTED,
  addEnvelopeListener,
  addStateListener,
  getWatchLinkState,
  isWatchLinkAvailable,
  sendAck,
  updateApplicationContext,
} from "@/modules/watch-link";

import { exerciseName } from "./catalogue";
import { buildContextPayload, nextRevision } from "./snapshot";

/**
 * The rep target the plan set for an exercise, if it set one.
 *
 * Read straight from the plan rather than stored on the session: the session
 * records what was DONE, and a target is what was asked for.
 */
function planTargetReps(exerciseId: string): number {
  const plan = usePlanStore.getState().plan;
  if (!plan) return 0;
  for (const day of plan.days ?? []) {
    for (const entry of day.exercises ?? []) {
      if (entry.id === exerciseId) return plannedRepsFrom(entry.repsOrTime);
    }
  }
  return 0;
}

/**
 * How often a running app re-stamps the entitlement as verified.
 *
 * The watch measures its offline window from this timestamp, so it has to keep
 * moving while the phone is actually confirming the entitlement — otherwise a
 * paying subscriber's watch locks itself out after the cache TTL despite the
 * phone having verified them a hundred times. It moves ONLY while the read is
 * `ready`: a loading or failed read must never extend the window.
 */
const REVERIFY_INTERVAL_MS = 15 * 60 * 1000;

export function WatchLink() {
  const { session, sessionId, startedAt, unit, restPref, hydrated, receiveWatchEnvelope } = useWorkout();
  const { resolution } = usePremium();
  const { token } = useOwner();
  const [, setState] = useState<WatchLinkState>(UNSUPPORTED);
  const [verifiedAt, setVerifiedAt] = useState(0);

  const revision = useRef(0);

  // Stamp on every transition into a resolved read, and periodically while it
  // stays resolved.
  useEffect(() => {
    if (resolution.state !== "ready") return;
    setVerifiedAt(Date.now());
    const timer = setInterval(() => setVerifiedAt(Date.now()), REVERIFY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [resolution.state, resolution.access]);

  const push = useCallback(() => {
    if (!isWatchLinkAvailable || !token) return;
    // Nothing may be sent until THIS owner's scope has hydrated. On an owner
    // switch the token changes a render before the store clears the previous
    // owner's session, and a child effect runs before its parent's — so pushing
    // here would describe the last account's workout under the new one.
    if (!hydrated) return;
    // A session with no id yet is one render away from having one. Sending it
    // under a placeholder would give two different workouts the same identity,
    // and the watch binds its events to exactly that value.
    if (session && !sessionId) return;

    const active =
      session && sessionId
        ? buildActiveSession(token, sessionId, startedAt ?? Date.now(), session)
        : null;

    // A resolved answer must never travel without the moment it was resolved.
    // The stamping effect lands one render after the state flips, so the first
    // push could otherwise carry `ready` with a zero timestamp — which the watch
    // reads as "never verified" and answers with the wrong locked screen.
    const confirmedAt = resolution.state === "ready" ? verifiedAt || Date.now() : verifiedAt;

    revision.current = nextRevision(revision.current, Date.now());
    const payload = buildContextPayload({
      session: active,
      unit,
      restSeconds: restPref,
      entitlement: { access: resolution.access, state: resolution.state, verifiedAt: confirmedAt },
      revision: revision.current,
      now: Date.now(),
      nameOf: exerciseName,
      targetRepsFor: (exerciseId) => planTargetReps(exerciseId),
    });
    // `session: null` cannot cross the bridge: JS null arrives in the native
    // module as NSNull, and WCSession's serializer rejects the whole payload
    // with WCErrorCodePayloadUnsupportedTypes — silently, since the module's
    // updateApplicationContext has no error path back to here. The key is
    // OMITTED instead; Model.swift declares `session: SnapshotSession?`, and an
    // absent key decodes to nil, which merge() already handles as "the phone
    // has no workout". Every earlier payload happened to carry a session, which
    // is why the first session-less owner was what exposed it.
    const wire = { ...payload } as Record<string, unknown>;
    if (wire.session === null) delete wire.session;
    updateApplicationContext(wire);
  }, [hydrated, resolution.access, resolution.state, restPref, session, sessionId, startedAt, token, unit, verifiedAt]);

  // Out: a new snapshot whenever anything the watch renders has changed.
  useEffect(() => {
    push();
  }, [push]);

  // In: events from the watch, answered by id.
  useEffect(() => {
    if (!isWatchLinkAvailable) return;
    const subscription = addEnvelopeListener((envelope) => {
      // The phone re-checks entitlement here rather than trusting the watch's
      // own answer: a Shortcut or a replay from a lapsed device arrives on this
      // same path.
      receiveWatchEnvelope(envelope, resolution.access)
        .then((ack) => {
          if (ack.accepted.length === 0 && ack.rejected.length === 0) return;
          sendAck(ack as unknown as Record<string, unknown>);
          // The watch's picture of the workout has just changed underneath it.
          push();
        })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [push, receiveWatchEnvelope, resolution.access]);

  // Pairing or reachability changes are the moment a stale watch can be fixed.
  useEffect(() => {
    if (!isWatchLinkAvailable) return;
    setState(getWatchLinkState());
    const subscription = addStateListener((next) => {
      setState(next);
      if (next.reachable) push();
    });
    return () => subscription.remove();
  }, [push]);

  return null;
}

/** Read-only view of the link, for the settings screen. */
export function useWatchLinkState(): WatchLinkState {
  const [state, setState] = useState<WatchLinkState>(() => getWatchLinkState());

  useEffect(() => {
    if (!isWatchLinkAvailable) return;
    setState(getWatchLinkState());
    const subscription = addStateListener(setState);
    return () => subscription.remove();
  }, []);

  return state;
}
