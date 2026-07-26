// Minimal raw key/value contract used by every owner-scoped store.
//
// Deliberately raw strings: the legacy keys were written with two different
// encodings and migration must read them byte-for-byte. Injecting the store
// also keeps the owner/migration logic testable without a React Native runtime.

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory store — tests and non-persistent fallbacks. */
export class MemoryKV implements KV {
  private map = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    if (seed) for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }

  async get(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  async set(key: string, value: string) {
    this.map.set(key, value);
  }

  async remove(key: string) {
    this.map.delete(key);
  }

  /** Test helper — never used by app code. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map.entries());
  }
}

let deviceKV: KV | null = null;

/**
 * AsyncStorage-backed store. Imported lazily so pure-logic tests never pull in
 * React Native.
 */
export function getDeviceKV(): KV {
  if (deviceKV) return deviceKV;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  deviceKV = {
    async get(key: string) {
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async set(key: string, value: string) {
      await AsyncStorage.setItem(key, value);
    },
    async remove(key: string) {
      await AsyncStorage.removeItem(key);
    },
  };
  return deviceKV;
}

/** Test seam only. */
export function __setDeviceKV(kv: KV | null) {
  deviceKV = kv;
}
