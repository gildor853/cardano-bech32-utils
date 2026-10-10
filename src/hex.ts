import { fail } from "./errors.js";

const HEX = "0123456789abcdef";

/** Encodes bytes as lowercase hex. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += HEX[b >> 4]! + HEX[b & 0x0f]!;
  }
  return out;
}

/** Decodes a hex string (case-insensitive, no `0x` prefix) into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string") fail("InvalidHex", "Hex input must be a string");
  if (hex.length % 2 !== 0) fail("InvalidHex", "Hex string must have an even length");
  if (!/^[0-9a-fA-F]*$/.test(hex)) fail("InvalidHex", "Hex string contains non-hex characters");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
