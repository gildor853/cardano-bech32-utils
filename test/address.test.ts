import { describe, expect, it } from "vitest";
import {
  CardanoBech32Error,
  bytesToHex,
  decodePrefixed,
  encodeBech32,
  encodePrefixed,
  expectedHrp,
  hexToBytes,
  isValidAddress,
  parseAddress,
  parseAddressBytes,
  parseHeader,
  toNetworkId,
  tryParseAddress,
  type AddressKind,
  type Credential,
  type ErrorCode,
} from "../src/index.js";
import {
  CIP19_MAINNET,
  CIP19_PAYMENT_VK,
  CIP19_POINTER,
  CIP19_SCRIPT,
  CIP19_STAKE_VK,
  CIP19_TESTNET,
  PAYMENT_KEY_HASH,
  SCRIPT_HASH,
  STAKE_KEY_HASH,
} from "./fixtures.js";

function codeOf(fn: () => unknown): ErrorCode | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof CardanoBech32Error) return err.code;
    throw err;
  }
  return undefined;
}

const pk: Credential = { kind: "key", hash: PAYMENT_KEY_HASH };
const sk: Credential = { kind: "key", hash: STAKE_KEY_HASH };
const sc: Credential = { kind: "script", hash: SCRIPT_HASH };

type Expect = { kind: AddressKind; payment?: Credential; stake?: Credential; pointer?: boolean };
const EXPECTED: Record<number, Expect> = {
  0: { kind: "base-key-key", payment: pk, stake: sk },
  1: { kind: "base-script-key", payment: sc, stake: sk },
  2: { kind: "base-key-script", payment: pk, stake: sc },
  3: { kind: "base-script-script", payment: sc, stake: sc },
  4: { kind: "pointer-key", payment: pk, pointer: true },
  5: { kind: "pointer-script", payment: sc, pointer: true },
  6: { kind: "enterprise-key", payment: pk },
  7: { kind: "enterprise-script", payment: sc },
  14: { kind: "reward-key", stake: sk },
  15: { kind: "reward-script", stake: sc },
};

describe("CIP-19 test vectors", () => {
  const cases = [
    ...Object.entries(CIP19_MAINNET).map(([t, a]) => ["mainnet", Number(t), a] as const),
    ...Object.entries(CIP19_TESTNET).map(([t, a]) => ["testnet", Number(t), a] as const),
  ];

  it.each(cases)("%s type-%i parses", (network, headerType, address) => {
    const info = parseAddress(address);
    const want = EXPECTED[headerType]!;
    expect(info.headerType).toBe(headerType);
    expect(info.kind).toBe(want.kind);
    expect(info.network).toBe(network);
    expect(info.networkId).toBe(network === "mainnet" ? 1 : 0);
    expect(info.hrp).toBe(address.slice(0, address.lastIndexOf("1")));
    expect(info.bytes[0]).toBe((headerType << 4) | info.networkId);
    expect("payment" in info ? info.payment : undefined).toEqual(want.payment);
    expect("stake" in info ? info.stake : undefined).toEqual(want.stake);
    expect("pointer" in info ? info.pointer : undefined).toEqual(want.pointer ? CIP19_POINTER : undefined);
    expect(isValidAddress(address)).toBe(true);
    expect(isValidAddress(address, { network })).toBe(true);
  });

  it("script hash in the vectors matches the spec's script1... encoding", () => {
    const { prefix, bytes } = decodePrefixed(CIP19_SCRIPT, "script");
    expect(prefix).toBe("script");
    expect(bytesToHex(bytes)).toBe(SCRIPT_HASH);
  });

  it("decodes the spec's verification keys as 32-byte CIP-5 keys", () => {
    expect(decodePrefixed(CIP19_PAYMENT_VK, "addr_vk").bytes).toHaveLength(32);
    expect(decodePrefixed(CIP19_STAKE_VK, "stake_vk").bytes).toHaveLength(32);
  });

  it("intro examples in CIP-19 carry a testnet tag under mainnet HRPs", () => {
    // The illustrative examples in CIP-19's "User-facing Encoding" table use a
    // 0x60 header (enterprise, network tag 0) under the `addr` and `stake` HRPs.
    const addr = "addr1vpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5eg0yu80w";
    const stake = "stake1vpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5egfu2p0u";
    expect(codeOf(() => parseAddress(addr))).toBe("NetworkMismatch");
    expect(codeOf(() => parseAddress(stake))).toBe("InvalidHrp");
    const lax = parseAddress(addr, { checkHrp: false });
    expect(lax.kind).toBe("enterprise-key");
    expect(lax.networkId).toBe(0);
  });
});

describe("parseAddress validation", () => {
  it("rejects an address on the wrong expected network", () => {
    expect(codeOf(() => parseAddress(CIP19_MAINNET[0]!, { network: "testnet" }))).toBe("NetworkMismatch");
    expect(codeOf(() => parseAddress(CIP19_TESTNET[6]!, { network: 1 }))).toBe("NetworkMismatch");
  });

  it("rejects a stake address under an addr HRP and vice versa", () => {
    const stakeBytes = parseAddress(CIP19_MAINNET[14]!).bytes;
    expect(codeOf(() => parseAddress(encodeBech32("addr", stakeBytes)))).toBe("InvalidHrp");
    const enterpriseBytes = parseAddress(CIP19_MAINNET[6]!).bytes;
    expect(codeOf(() => parseAddress(encodeBech32("stake", enterpriseBytes)))).toBe("InvalidHrp");
    expect(codeOf(() => parseAddress(encodeBech32("foo", enterpriseBytes)))).toBe("InvalidHrp");
  });

  it("rejects a mismatched HRP/network tag", () => {
    const testnetBytes = parseAddress(CIP19_TESTNET[0]!).bytes;
    expect(codeOf(() => parseAddress(encodeBech32("addr", testnetBytes)))).toBe("NetworkMismatch");
  });

  it("rejects a corrupted checksum", () => {
    const a = CIP19_MAINNET[6]!;
    const corrupted = a.slice(0, -1) + (a.endsWith("q") ? "p" : "q");
    expect(codeOf(() => parseAddress(corrupted))).toBe("InvalidChecksum");
  });

  it("rejects mixed case", () => {
    const a = CIP19_MAINNET[6]!;
    expect(codeOf(() => parseAddress(a.slice(0, 10) + a.slice(10).toUpperCase()))).toBe("MixedCase");
    expect(parseAddress(a.toUpperCase()).kind).toBe("enterprise-key");
  });

  it("rejects reserved header types", () => {
    for (const t of [9, 10, 11, 12, 13]) {
      const bytes = new Uint8Array(29);
      bytes[0] = (t << 4) | 1;
      expect(codeOf(() => parseAddress(encodeBech32("addr", bytes)))).toBe("UnknownHeader");
    }
  });

  it("rejects Byron payloads in bech32", () => {
    const bytes = new Uint8Array(40);
    bytes[0] = 0x82;
    expect(codeOf(() => parseAddress(encodeBech32("addr", bytes)))).toBe("UnsupportedAddress");
    expect(parseAddressBytes(bytes).type).toBe("byron");
  });

  it("rejects wrong payload lengths", () => {
    const base = parseAddress(CIP19_MAINNET[0]!).bytes;
    expect(codeOf(() => parseAddress(encodeBech32("addr", base.subarray(0, 56))))).toBe("InvalidLength");
    const ent = parseAddress(CIP19_MAINNET[6]!).bytes;
    expect(codeOf(() => parseAddressBytes(Uint8Array.of(...ent, 0)))).toBe("InvalidLength");
    expect(codeOf(() => parseAddressBytes(new Uint8Array(0)))).toBe("InvalidLength");
  });

  it("rejects malformed pointers", () => {
    const ptr = parseAddress(CIP19_MAINNET[4]!).bytes;
    // Truncated: last varint has the continuation bit set.
    const truncated = Uint8Array.of(...ptr.subarray(0, ptr.length - 1), 0x83);
    expect(codeOf(() => parseAddressBytes(truncated))).toBe("InvalidPointer");
    // Shorter than header + hash + three one-byte naturals.
    expect(codeOf(() => parseAddressBytes(ptr.subarray(0, 31)))).toBe("InvalidLength");
    // Trailing garbage after the three naturals.
    expect(codeOf(() => parseAddressBytes(Uint8Array.of(...ptr, 0)))).toBe("InvalidLength");
  });

  it("bounds pointer naturals to 64 bits (no unbounded work on crafted input)", () => {
    const head = parseAddress(CIP19_MAINNET[4]!).bytes.subarray(0, 29);
    // 2^64 - 1 is the largest accepted value (10 groups).
    const max = [0x81, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f];
    const ok = parseAddressBytes(Uint8Array.of(...head, ...max, 0, 0));
    expect(ok.type === "pointer" && ok.pointer.slot).toBe(2n ** 64n - 1n);
    // 2^64 still fits in 10 groups but overflows a Word64.
    const over = [0x82, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00];
    expect(codeOf(() => parseAddressBytes(Uint8Array.of(...head, ...over, 0, 0)))).toBe("InvalidPointer");
    // An 11th continuation group is rejected without reading further.
    const long = new Uint8Array(29 + 100_000).fill(0x80);
    long.set(head);
    expect(codeOf(() => parseAddressBytes(long))).toBe("InvalidPointer");
    // Also through the hex entry point: huge input fails fast.
    const t0 = Date.now();
    expect(codeOf(() => parseAddressBytes(bytesToHex(long)))).toBe("InvalidPointer");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("decodes pointers larger than 2^53 as bigint", () => {
    const head = parseAddress(CIP19_MAINNET[4]!).bytes.subarray(0, 29);
    // 2^63 encoded as a 10-byte variable-length natural, then 0 and 0.
    const big = [0x81, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00];
    const info = parseAddressBytes(Uint8Array.of(...head, ...big, 0, 0));
    expect(info.type === "pointer" && info.pointer.slot).toBe(2n ** 63n);
  });

  it("tryParseAddress never throws", () => {
    const ok = tryParseAddress(CIP19_MAINNET[0]!);
    expect(ok.ok && ok.value.kind).toBe("base-key-key");
    const bad = tryParseAddress("not an address");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("MissingSeparator");
  });

  it("rejects non-bytes input in parseAddressBytes and hexToBytes", () => {
    expect(codeOf(() => parseAddressBytes(null as never))).toBe("InvalidHex");
    expect(codeOf(() => parseAddressBytes(42 as never))).toBe("InvalidHex");
    expect(codeOf(() => hexToBytes(undefined as never))).toBe("InvalidHex");
  });

  it("accepts hex input in parseAddressBytes", () => {
    const hex = bytesToHex(parseAddress(CIP19_TESTNET[7]!).bytes);
    const info = parseAddressBytes(hex);
    expect(info.kind).toBe("enterprise-script");
  });

  it("reports reserved network tags as unknown", () => {
    const bytes = hexToBytes("6" + "5" + PAYMENT_KEY_HASH);
    const info = parseAddressBytes(bytes);
    expect(info.type !== "byron" && info.network).toBe("unknown");
    // Non-mainnet tags map to the test HRP.
    expect(parseAddress(encodeBech32("addr_test", bytes)).networkId).toBe(5);
  });
});

describe("helpers", () => {
  it("parseHeader", () => {
    expect(parseHeader(0x01)).toEqual({ headerType: 0, networkId: 1, type: "base", kind: "base-key-key" });
    expect(parseHeader(0xf0)).toEqual({ headerType: 15, networkId: 0, type: "reward", kind: "reward-script" });
    expect(parseHeader(0x82).type).toBe("byron");
    expect(codeOf(() => parseHeader(0x91))).toBe("UnknownHeader");
    expect(codeOf(() => parseHeader(256))).toBe("UnknownHeader");
  });

  it("expectedHrp / toNetworkId", () => {
    expect(expectedHrp("payment", "mainnet")).toBe("addr");
    expect(expectedHrp("payment", 0)).toBe("addr_test");
    expect(expectedHrp("stake", 1)).toBe("stake");
    expect(expectedHrp("stake", "testnet")).toBe("stake_test");
    expect(toNetworkId("mainnet")).toBe(1);
    expect(codeOf(() => toNetworkId(16))).toBe("InvalidNetwork");
    expect(codeOf(() => toNetworkId("preprod" as never))).toBe("InvalidNetwork");
  });

  it("CIP-5 prefixed encode/decode", () => {
    const pool = encodePrefixed("pool", PAYMENT_KEY_HASH);
    expect(pool.startsWith("pool1")).toBe(true);
    expect(bytesToHex(decodePrefixed(pool).bytes)).toBe(PAYMENT_KEY_HASH);
    expect(encodePrefixed("script", hexToBytes(SCRIPT_HASH))).toBe(CIP19_SCRIPT);
    expect(codeOf(() => encodePrefixed("addr_vkh", "00"))).toBe("InvalidLength");
    expect(codeOf(() => decodePrefixed(pool, "script"))).toBe("InvalidHrp");
    expect(codeOf(() => decodePrefixed(encodeBech32("nope", Uint8Array.of(1))))).toBe("InvalidHrp");
    expect(codeOf(() => encodePrefixed("nope" as never, "00"))).toBe("InvalidHrp");
  });
});
