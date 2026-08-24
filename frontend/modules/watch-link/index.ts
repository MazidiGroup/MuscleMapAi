// The iPhone side of the Watch Connectivity link, as a local Expo module.
//
// A LOCAL module rather than an npm package on purpose: the release gate pins
// `yarn.lock`, and adding a dependency for roughly a hundred lines of
// WCSession glue would mean regenerating the release manifest to buy code we
// would still have to write ourselves.
//
// Every export degrades to a no-op when the native module is absent — Expo Go,
// the web build, Android, and the Jest-free logic tests all load this file. The
// watch feature must never be the reason the app fails to start somewhere it
// simply is not available.

import { NativeModule, requireOptionalNativeModule } from "expo";

export type WatchLinkState = {
  /** Whether the paired-device APIs are usable at all on this OS/build. */
  supported: boolean;
  paired: boolean;
  watchAppInstalled: boolean;
  /** True only while both apps are foregrounded and in range. */
  reachable: boolean;
};

export const UNSUPPORTED: WatchLinkState = {
  supported: false,
  paired: false,
  watchAppInstalled: false,
  reachable: false,
};

type WatchLinkEvents = {
  /** A batch of events from the watch. The payload is the raw envelope. */
  onEnvelope: (envelope: unknown) => void;
  /** Pairing, installation or reachability changed. */
  onStateChange: (state: WatchLinkState) => void;
};

declare class WatchLinkNativeModule extends NativeModule<WatchLinkEvents> {
  getState(): WatchLinkState;
  /** Latest-wins snapshot. Cheap to call; the OS coalesces it. */
  updateApplicationContext(payload: Record<string, unknown>): Promise<boolean>;
  /** Durable, guaranteed-delivery reply carrying an acknowledgement. */
  sendAck(ack: Record<string, unknown>): Promise<boolean>;
};

const native = requireOptionalNativeModule<WatchLinkNativeModule>("WatchLinkModule");

export const isWatchLinkAvailable = native !== null;

export function getWatchLinkState(): WatchLinkState {
  try {
    return native?.getState() ?? UNSUPPORTED;
  } catch {
    return UNSUPPORTED;
  }
}

export async function updateApplicationContext(payload: Record<string, unknown>): Promise<boolean> {
  try {
    return (await native?.updateApplicationContext(payload)) ?? false;
  } catch {
    return false;
  }
}

export async function sendAck(ack: Record<string, unknown>): Promise<boolean> {
  try {
    return (await native?.sendAck(ack)) ?? false;
  } catch {
    return false;
  }
}

export function addEnvelopeListener(listener: (envelope: unknown) => void): { remove: () => void } {
  if (!native) return { remove: () => {} };
  const sub = native.addListener("onEnvelope", listener);
  return { remove: () => sub.remove() };
}

export function addStateListener(listener: (state: WatchLinkState) => void): { remove: () => void } {
  if (!native) return { remove: () => {} };
  const sub = native.addListener("onStateChange", listener);
  return { remove: () => sub.remove() };
}
