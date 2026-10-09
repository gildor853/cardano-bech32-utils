import { describe, expect, it } from "vitest";
import {
  CardanoBech32Error,
  buildBaseAddress,
  buildEnterpriseAddress,
  buildPointerAddress,
  buildRewardAddress,
  encodeAddress,
  hexToBytes,
  parseAddress,
  type CredentialInput,
  type ErrorCode,
  type Network,
} from "../src/index.js";
import {
  CIP19_MAINNET,
  CIP19_POINTER,
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

const pk: CredentialInput = { kind: "key", hash: PAYMENT_KEY_HASH };
const sk: CredentialInput = { kind: "key", hash: STAKE_KEY_HASH };
const sc: CredentialInput = { kind: "script", hash: hexToBytes(SCRIPT_HASH) };

const networks: Array<[Network, Record<number, string>]> = [
  ["mainnet", CIP19_MAINNET],
  ["testnet", CIP19_TESTNET],
];

describe.each(networks)("builders reproduce CIP-19 vectors (%s)", (network, v) => {
  it("base addresses (types 0-3)", () => {
    expect(buildBaseAddress({ network, payment: pk, stake: sk })).toBe(v[0]);
    expect(buildBaseAddress({ network, payment: sc, stake: sk })).toBe(v[1]);
    expect(buildBaseAddress({ network, payment: pk, stake: sc })).toBe(v[2]);
    expect(buildBaseAddress({ network, payment: sc, stake: sc })).toBe(v[3]);
  });

  it("pointer addresses (types 4-5)", () => {
    expect(buildPointerAddress({ network, payment: pk, pointer: CIP19_POINTER })).toBe(v[4]);
    expect(
      buildPointerAddress({ network, payment: sc, pointer: { slot: 2498243, txIndex: 27, certIndex: 3 } }),
    ).toBe(v[5]);
  });

  it("enterprise addresses (types 6-7)", () => {
    expect(buildEnterpriseAddress({ network, payment: pk })).toBe(v[6]);
    expect(buildEnterpriseAddress({ network, payment: sc })).toBe(v[7]);
  });

  it("reward addresses (types 14-15)", () => {
    expect(buildRewardAddress({ network, stake: sk })).toBe(v[14]);
    expect(buildRewardAddress({ network, stake: sc })).toBe(v[15]);
  });
});

describe("builder validation", () => {
  it("accepts numeric network ids", () => {
    expect(buildEnterpriseAddress({ network: 1, payment: pk })).toBe(CIP19_MAINNET[6]);
    expect(buildEnterpriseAddress({ network: 0, payment: pk })).toBe(CIP19_TESTNET[6]);
  });

  it("rejects bad credentials", () => {
    expect(codeOf(() => buildEnterpriseAddress({ network: 1, payment: { kind: "key", hash: "00" } }))).toBe(
      "InvalidCredential",
    );
    expect(codeOf(() => buildEnterpriseAddress({ network: 1, payment: { kind: "key", hash: "zz" } }))).toBe(
      "InvalidCredential",
    );
    expect(
      codeOf(() => buildRewardAddress({ network: 1, stake: { kind: "vkey" as never, hash: STAKE_KEY_HASH } })),
    ).toBe("InvalidCredential");
  });

  it("rejects bad networks", () => {
    expect(codeOf(() => buildEnterpriseAddress({ network: 16, payment: pk }))).toBe("InvalidNetwork");
    expect(codeOf(() => buildEnterpriseAddress({ network: -1, payment: pk }))).toBe("InvalidNetwork");
  });

  it("rejects bad pointers", () => {
    const bad = { slot: -1, txIndex: 0, certIndex: 0 };
    expect(codeOf(() => buildPointerAddress({ network: 1, payment: pk, pointer: bad }))).toBe("InvalidPointer");
    const frac = { slot: 1.5, txIndex: 0, certIndex: 0 };
    expect(codeOf(() => buildPointerAddress({ network: 1, payment: pk, pointer: frac }))).toBe("InvalidPointer");
  });

  it("round-trips large pointers", () => {
    const pointer = { slot: 2n ** 64n - 1n, txIndex: 0n, certIndex: 127n };
    const a = buildPointerAddress({ network: 0, payment: pk, pointer });
    const info = parseAddress(a);
    expect(info.type === "pointer" && info.pointer).toEqual(pointer);
  });

  it("encodeAddress picks the HRP from the header", () => {
    for (const a of [...Object.values(CIP19_MAINNET), ...Object.values(CIP19_TESTNET)]) {
      expect(encodeAddress(parseAddress(a).bytes)).toBe(a);
    }
    const byron = new Uint8Array(30);
    byron[0] = 0x82;
    expect(codeOf(() => encodeAddress(byron))).toBe("UnsupportedAddress");
  });
});
