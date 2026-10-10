import { describe, expect, it } from "vitest";
import {
  CardanoBech32Error,
  bytesToHex,
  decodeBech32,
  decodeBech32Words,
  encodeBech32,
  encodeBech32Words,
  fromWords,
  hexToBytes,
  isBech32,
  toWords,
  tryDecodeBech32,
  type ErrorCode,
} from "../src/index.js";

// Test vectors from BIP-173:
// https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#test-vectors
const BIP173_VALID = [
  "A12UEL5L",
  "a12uel5l",
  "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
  "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw",
  "11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j",
  "split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w",
  "?1ezyfcl",
];

const BIP173_INVALID: Array<[string, ErrorCode, string]> = [
  ["\x201nwldj5", "InvalidHrp", "HRP character out of range (0x20)"],
  ["\x7f1axkwrx", "InvalidHrp", "HRP character out of range (0x7F)"],
  ["\x801eym55h", "InvalidHrp", "HRP character out of range (0x80)"],
  [
    "an84characterslonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1569pvx",
    "InvalidLength",
    "overall max length exceeded (with BIP-173 limit of 90)",
  ],
  ["pzry9x0s0muk", "MissingSeparator", "no separator character"],
  ["1pzry9x0s0muk", "InvalidHrp", "empty HRP"],
  ["x1b4n0q5v", "InvalidCharacter", "invalid data character"],
  ["li1dgmt3", "InvalidLength", "too short checksum"],
  ["de1lg7wt\xff", "InvalidCharacter", "invalid character in checksum"],
  ["A1G7SGD8", "InvalidChecksum", "checksum calculated with uppercase form of HRP"],
  ["10a06t8", "InvalidHrp", "empty HRP"],
  ["1qzzfhee", "InvalidHrp", "empty HRP"],
];

function codeOf(fn: () => unknown): ErrorCode | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof CardanoBech32Error) return err.code;
    throw err;
  }
  return undefined;
}

describe("BIP-173 vectors", () => {
  it.each(BIP173_VALID)("accepts %s", (s) => {
    const { hrp, words } = decodeBech32Words(s, { limit: 90 });
    expect(hrp).toBe(s.slice(0, s.lastIndexOf("1")).toLowerCase());
    // Re-encoding yields the lowercase form of the input.
    expect(encodeBech32Words(hrp, words, { limit: 90 })).toBe(s.toLowerCase());
  });

  it.each(BIP173_INVALID)("rejects %j", (s, code) => {
    expect(codeOf(() => decodeBech32Words(s, { limit: 90 }))).toBe(code);
    expect(isBech32(s, { limit: 90 })).toBe(false);
  });

  it("rejects mixed case (BIP-173 segwit vector)", () => {
    const s = "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sL5k7";
    expect(codeOf(() => decodeBech32Words(s))).toBe("MixedCase");
  });

  it("rejects a corrupted checksum (BIP-173 segwit vector)", () => {
    expect(codeOf(() => decodeBech32Words("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"))).toBe(
      "InvalidChecksum",
    );
  });

  it("decodes the BIP-173 P2WPKH program bytes", () => {
    // BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4 -> witness v0, program 751e76e8...
    const { hrp, words } = decodeBech32Words("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4");
    expect(hrp).toBe("bc");
    expect(words[0]).toBe(0);
    expect(bytesToHex(fromWords(words.slice(1)))).toBe("751e76e8199196d454941c45d1b3a323f1433bd6");
  });

  it("rejects non-zero padding (BIP-173 segwit vector)", () => {
    const { words } = decodeBech32Words(
      "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3pjxtptv",
    );
    expect(codeOf(() => fromWords(words.slice(1)))).toBe("InvalidPadding");
    // Words must be 5-bit values.
    expect(codeOf(() => fromWords(Uint8Array.of(32, 0)))).toBe("InvalidCharacter");
    expect(codeOf(() => fromWords([-1, 0] as unknown as Uint8Array))).toBe("InvalidCharacter");
  });

  it("rejects more than 4 bits of padding (BIP-173 segwit vector)", () => {
    const { words } = decodeBech32Words("bc1zw508d6qejxtdg4y5r3zarvaryvqyzf3du");
    expect(codeOf(() => fromWords(words.slice(1)))).toBe("InvalidPadding");
  });
});

describe("byte-level encode/decode", () => {
  it("round-trips arbitrary bytes", () => {
    for (let len = 0; len < 70; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) & 0xff);
      const s = encodeBech32("test", bytes);
      const out = decodeBech32(s);
      expect(out.hrp).toBe("test");
      expect(bytesToHex(out.bytes)).toBe(bytesToHex(bytes));
    }
  });

  it("supports strings longer than 90 characters by default", () => {
    const bytes = new Uint8Array(100).fill(7);
    const s = encodeBech32("addr", bytes);
    expect(s.length).toBeGreaterThan(90);
    expect(decodeBech32(s).bytes).toEqual(bytes);
    expect(codeOf(() => decodeBech32(s, { limit: 90 }))).toBe("InvalidLength");
    expect(codeOf(() => encodeBech32("addr", bytes, { limit: 90 }))).toBe("InvalidLength");
  });

  it("enforces the default 1023 limit", () => {
    expect(codeOf(() => encodeBech32("a", new Uint8Array(700)))).toBe("InvalidLength");
  });

  it("accepts uppercase input and returns lowercase HRP", () => {
    const s = encodeBech32("addr", Uint8Array.of(1, 2, 3)).toUpperCase();
    expect(decodeBech32(s).hrp).toBe("addr");
  });

  it("tryDecodeBech32 returns a typed result", () => {
    const good = tryDecodeBech32("a12uel5l");
    expect(good.ok).toBe(true);
    const bad = tryDecodeBech32("a12uel5m");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBeInstanceOf(CardanoBech32Error);
      expect(bad.error.code).toBe("InvalidChecksum");
    }
  });

  it("toWords/fromWords are inverse", () => {
    const bytes = hexToBytes("00ff10ab7c");
    expect(fromWords(toWords(bytes))).toEqual(bytes);
  });

  it("rejects invalid words and HRPs when encoding", () => {
    expect(codeOf(() => encodeBech32Words("a", [32]))).toBe("InvalidCharacter");
    expect(codeOf(() => encodeBech32Words("", [0]))).toBe("InvalidHrp");
    expect(codeOf(() => encodeBech32Words("aB", [0]))).toBe("MixedCase");
  });
});

describe("hex helpers", () => {
  it("round-trips", () => {
    expect(bytesToHex(hexToBytes("DEADbeef00"))).toBe("deadbeef00");
  });
  it("rejects malformed hex", () => {
    expect(codeOf(() => hexToBytes("abc"))).toBe("InvalidHex");
    expect(codeOf(() => hexToBytes("zz"))).toBe("InvalidHex");
  });
});

describe("non-ASCII input", () => {
  it("rejects characters that case-fold to bech32 characters (U+212A KELVIN SIGN)", () => {
    const addr = "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8".toUpperCase();
    expect(isBech32(addr)).toBe(true);
    const evil = addr.replace("K", "\u212A");
    expect(evil).not.toBe(addr);
    expect(isBech32(evil)).toBe(false);
    expect(codeOf(() => decodeBech32(evil))).toBe("InvalidCharacter");
    expect(codeOf(() => decodeBech32("a\u00e91qqqqqq"))).toBe("InvalidHrp");
  });
});
