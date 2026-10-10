import { attempt, fail, type Result } from "./errors.js";

/** The bech32 data alphabet (BIP-173). */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3] as const;
const CHECKSUM_LENGTH = 6;

// Reverse lookup by char code (-1 = not in the alphabet). A typed array rather
// than an object, so no input can ever reach prototype properties.
const CHARSET_REV = new Int8Array(128).fill(-1);
for (let i = 0; i < CHARSET.length; i++) CHARSET_REV[CHARSET.charCodeAt(i)] = i;

/**
 * Default maximum length of a bech32 string.
 *
 * BIP-173 limits strings to 90 characters. Cardano does not impose that limit
 * (CIP-19), so this library defaults to 1023: the block length of the BCH code
 * underlying the bech32 checksum, and a generous cap that keeps work bounded on
 * untrusted input. Note that checksum guarantees above 90 characters are weaker
 * than those stated in BIP-173.
 */
export const DEFAULT_BECH32_LIMIT = 1023;

/** Options for bech32 encoding/decoding. */
export interface Bech32Options {
  /**
   * Maximum allowed total string length. Defaults to
   * {@link DEFAULT_BECH32_LIMIT} (1023). Pass `90` for strict BIP-173.
   */
  readonly limit?: number;
}

/** A decoded bech32 string at the 5-bit word level. */
export interface Bech32Words {
  readonly hrp: string;
  readonly words: Uint8Array;
}

/** A decoded bech32 string whose payload has been converted to bytes. */
export interface Bech32Decoded {
  readonly hrp: string;
  readonly bytes: Uint8Array;
}

function polymod(values: ArrayLike<number>, chk = 1): number {
  for (let i = 0; i < values.length; i++) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[i]!;
    for (let j = 0; j < 5; j++) {
      if ((top >>> j) & 1) chk ^= GENERATOR[j]!;
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function createChecksum(hrp: string, words: ArrayLike<number>): number[] {
  const values = [...hrpExpand(hrp), ...Array.from(words), 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const out: number[] = [];
  for (let i = 0; i < CHECKSUM_LENGTH; i++) out.push((mod >>> (5 * (5 - i))) & 31);
  return out;
}

function validateHrp(hrp: string): void {
  if (hrp.length === 0) fail("InvalidHrp", "Human-readable part must not be empty");
  for (let i = 0; i < hrp.length; i++) {
    const c = hrp.charCodeAt(i);
    if (c < 33 || c > 126) {
      fail("InvalidHrp", `Human-readable part contains an out-of-range character at position ${i}`);
    }
  }
}

/**
 * Converts between bit groups (e.g. 8-bit bytes <-> 5-bit words).
 * @internal
 */
function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): Uint8Array {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << to) - 1;
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const value = data[i]!;
    if (value < 0 || value >> from !== 0) {
      fail("InvalidCharacter", `Value ${value} does not fit in ${from} bits`);
    }
    acc = ((acc << from) | value) & 0xffffff;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from) {
    fail("InvalidPadding", "Excess padding in bech32 data");
  } else if ((acc << (to - bits)) & maxv) {
    fail("InvalidPadding", "Non-zero padding in bech32 data");
  }
  return Uint8Array.from(out);
}

/** Converts bytes into 5-bit bech32 words (with zero padding). */
export function toWords(bytes: Uint8Array): Uint8Array {
  return convertBits(bytes, 8, 5, true);
}

/**
 * Converts 5-bit bech32 words back into bytes. Throws `InvalidPadding` if the
 * padding is longer than 4 bits or non-zero.
 */
export function fromWords(words: ArrayLike<number>): Uint8Array {
  return convertBits(words, 5, 8, false);
}

/** Encodes 5-bit words under `hrp`. The output is always lowercase. */
export function encodeBech32Words(
  hrp: string,
  words: ArrayLike<number>,
  options: Bech32Options = {},
): string {
  const limit = options?.limit ?? DEFAULT_BECH32_LIMIT;
  validateHrp(hrp);
  if (hrp !== hrp.toLowerCase() && hrp !== hrp.toUpperCase()) {
    fail("MixedCase", "Human-readable part must not be mixed case");
  }
  const lowerHrp = hrp.toLowerCase();
  const total = lowerHrp.length + 1 + words.length + CHECKSUM_LENGTH;
  if (total > limit) fail("InvalidLength", `Encoded length ${total} exceeds limit ${limit}`);
  let out = lowerHrp + "1";
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (!Number.isInteger(w) || w < 0 || w > 31) fail("InvalidCharacter", `Invalid 5-bit word ${w}`);
    out += CHARSET[w]!;
  }
  for (const w of createChecksum(lowerHrp, words)) out += CHARSET[w]!;
  return out;
}

/** Encodes `bytes` under `hrp` as a lowercase bech32 string. */
export function encodeBech32(hrp: string, bytes: Uint8Array, options: Bech32Options = {}): string {
  return encodeBech32Words(hrp, toWords(bytes), options);
}

/**
 * Decodes a bech32 string to its HRP and 5-bit words (checksum removed).
 * The returned HRP is lowercase.
 */
export function decodeBech32Words(input: string, options: Bech32Options = {}): Bech32Words {
  const limit = options?.limit ?? DEFAULT_BECH32_LIMIT;
  if (typeof input !== "string") fail("InvalidCharacter", "Input must be a string");
  if (input.length > limit) fail("InvalidLength", `String length ${input.length} exceeds limit ${limit}`);

  // BIP-173 allows only US-ASCII. Non-ASCII is rejected before case folding,
  // because toLowerCase() maps e.g. U+212A KELVIN SIGN to "k". (Control
  // characters and spaces are reported by the checks below.)
  const sepRaw = input.lastIndexOf("1");
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 126) {
      if (i < sepRaw) fail("InvalidHrp", `Invalid character in the human-readable part at position ${i}`);
      fail("InvalidCharacter", `Invalid character at position ${i}`);
    }
  }
  const lower = input.toLowerCase();
  const upper = input.toUpperCase();
  if (input !== lower && input !== upper) fail("MixedCase", "Bech32 strings must not be mixed case");

  const sep = lower.lastIndexOf("1");
  if (sep === -1) fail("MissingSeparator", "Missing '1' separator");
  const hrp = lower.slice(0, sep);
  validateHrp(hrp);

  const dataPart = lower.slice(sep + 1);
  if (dataPart.length < CHECKSUM_LENGTH) {
    fail("InvalidLength", "Data part is shorter than the 6-character checksum");
  }

  const words = new Uint8Array(dataPart.length);
  for (let i = 0; i < dataPart.length; i++) {
    const v = CHARSET_REV[dataPart.charCodeAt(i)] ?? -1;
    if (v < 0) {
      fail("InvalidCharacter", `Invalid data character at position ${sep + 1 + i}`);
    }
    words[i] = v;
  }

  if (polymod([...hrpExpand(hrp), ...words]) !== 1) fail("InvalidChecksum", "Invalid bech32 checksum");
  return { hrp, words: words.slice(0, words.length - CHECKSUM_LENGTH) };
}

/** Decodes a bech32 string to its (lowercase) HRP and payload bytes. */
export function decodeBech32(input: string, options: Bech32Options = {}): Bech32Decoded {
  const { hrp, words } = decodeBech32Words(input, options);
  return { hrp, bytes: fromWords(words) };
}

/** Non-throwing variant of {@link decodeBech32}. */
export function tryDecodeBech32(input: string, options: Bech32Options = {}): Result<Bech32Decoded> {
  return attempt(() => decodeBech32(input, options));
}

/** `true` if `input` is a well-formed bech32 string with a valid checksum. */
export function isBech32(input: string, options: Bech32Options = {}): boolean {
  return attempt(() => decodeBech32Words(input, options)).ok;
}
