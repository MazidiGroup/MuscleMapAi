// Deterministic, dependency-free encodings used by the owner layer.
//
// `encodeBase64Url` is lossless and injective: two different raw identifiers can
// never produce the same encoded segment, and the same raw identifier always
// produces the same segment. It is used to place an *opaque* account identifier
// inside a storage key without letting its characters change the key structure.
//
// `canonicalHash` is a non-cryptographic 64-bit FNV-1a digest used only to
// fingerprint payloads for conflict detection and evidence — never for
// security, identity or deduplication of unrelated values.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function utf8Bytes(input: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
      i++;
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

/** RFC 4648 §5 base64url without padding. Lossless and injective. */
export function encodeBase64Url(input: string): string {
  const bytes = utf8Bytes(input);
  const alphabet = `${B64}-_`;
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += alphabet[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += alphabet[b2 & 63];
  }
  return out;
}

/** Stable key ordering so semantically equal payloads hash identically. */
export function canonicalJSON(value: unknown): string {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = sortDeep((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sortDeep(value));
}

/** FNV-1a (64-bit, split into two 32-bit halves) over the canonical JSON form. */
export function canonicalHash(value: unknown): string {
  const s = canonicalJSON(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return `fnv1a64:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
