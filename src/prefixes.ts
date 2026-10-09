import { fail } from "./errors.js";
import { decodeBech32, encodeBech32, type Bech32Options } from "./bech32.js";
import { hexToBytes } from "./hex.js";

/** Bech32 HRPs used for Shelley payment addresses (CIP-5 / CIP-19). */
export const ADDRESS_HRP = { mainnet: "addr", testnet: "addr_test" } as const;

/** Bech32 HRPs used for stake (reward) addresses (CIP-5 / CIP-19). */
export const STAKE_HRP = { mainnet: "stake", testnet: "stake_test" } as const;

/** Metadata describing a CIP-5 prefix. */
export interface PrefixInfo {
  /** Human-readable description of the encoded object. */
  readonly description: string;
  /** Expected payload length in bytes, when it is fixed. */
  readonly bytes?: number;
}

/**
 * A curated subset of the CIP-5 bech32 prefix registry: addresses, common
 * verification keys and the most common hashes. Lengths are payload byte
 * lengths (blake2b-224 = 28, blake2b-256 = 32, blake2b-160 = 20).
 *
 * @see https://github.com/cardano-foundation/CIPs/tree/master/CIP-0005
 */
export const CIP5_PREFIXES = {
  // Addresses (variable length)
  addr: { description: "Mainnet address" },
  addr_test: { description: "Testnet address" },
  stake: { description: "Mainnet stake address", bytes: 29 },
  stake_test: { description: "Testnet stake address", bytes: 29 },

  // Keys
  addr_vk: { description: "CIP-1852 address verification key", bytes: 32 },
  addr_xvk: { description: "CIP-1852 address extended verification key", bytes: 64 },
  stake_vk: { description: "CIP-1852 stake address verification key", bytes: 32 },
  stake_xvk: { description: "CIP-1852 stake address extended verification key", bytes: 64 },
  pool_vk: { description: "Pool operator verification key", bytes: 32 },
  policy_vk: { description: "CIP-1855 policy verification key", bytes: 32 },
  drep_vk: { description: "DRep verification key", bytes: 32 },

  // Hashes
  addr_vkh: { description: "Address verification key hash", bytes: 28 },
  addr_shared_vkh: { description: "Shared address verification key hash", bytes: 28 },
  stake_vkh: { description: "Stake address verification key hash", bytes: 28 },
  stake_shared_vkh: { description: "Shared stake address verification key hash", bytes: 28 },
  policy_vkh: { description: "Policy verification key hash", bytes: 28 },
  req_signer_vkh: { description: "Required signer verification key hash", bytes: 28 },
  drep_vkh: { description: "DRep verification key hash", bytes: 28 },
  cc_cold_vkh: { description: "Constitutional committee cold verification key hash", bytes: 28 },
  cc_hot_vkh: { description: "Constitutional committee hot verification key hash", bytes: 28 },
  script: { description: "Script hash", bytes: 28 },
  pool: { description: "Pool operator verification key hash (pool ID)", bytes: 28 },
  vrf_vkh: { description: "VRF verification key hash", bytes: 32 },
  datum: { description: "Output datum hash", bytes: 32 },
  script_data: { description: "Script data hash", bytes: 32 },
  asset: { description: "Native asset fingerprint (CIP-14)", bytes: 20 },
} as const satisfies Record<string, PrefixInfo>;

/** Any prefix known to {@link CIP5_PREFIXES}. */
export type Cip5Prefix = keyof typeof CIP5_PREFIXES;

/** `true` if `hrp` is a prefix listed in {@link CIP5_PREFIXES}. */
export function isCip5Prefix(hrp: string): hrp is Cip5Prefix {
  return Object.prototype.hasOwnProperty.call(CIP5_PREFIXES, hrp);
}

function checkLength(prefix: Cip5Prefix, bytes: Uint8Array): void {
  const info: PrefixInfo = CIP5_PREFIXES[prefix];
  if (info.bytes !== undefined && bytes.length !== info.bytes) {
    fail("InvalidLength", `'${prefix}' payload must be ${info.bytes} bytes, got ${bytes.length}`);
  }
}

/**
 * Bech32-encodes a key or hash under a CIP-5 prefix, validating the payload
 * length. `payload` may be bytes or a hex string.
 *
 * @example encodePrefixed("pool", "<56 hex chars>") // "pool1..."
 */
export function encodePrefixed(
  prefix: Cip5Prefix,
  payload: Uint8Array | string,
  options: Bech32Options = {},
): string {
  if (!isCip5Prefix(prefix)) fail("InvalidHrp", `Unknown CIP-5 prefix '${String(prefix)}'`);
  const bytes = typeof payload === "string" ? hexToBytes(payload) : payload;
  checkLength(prefix, bytes);
  return encodeBech32(prefix, bytes, options);
}

/**
 * Decodes a bech32 string whose HRP is a known CIP-5 prefix, validating the
 * payload length. If `expected` is given, the HRP must match it.
 */
export function decodePrefixed(
  input: string,
  expected?: Cip5Prefix,
  options: Bech32Options = {},
): { prefix: Cip5Prefix; bytes: Uint8Array } {
  const { hrp, bytes } = decodeBech32(input, options);
  if (expected !== undefined && hrp !== expected) {
    fail("InvalidHrp", `Expected prefix '${expected}', got '${hrp}'`);
  }
  if (!isCip5Prefix(hrp)) fail("InvalidHrp", `Unknown CIP-5 prefix '${hrp}'`);
  checkLength(hrp, bytes);
  return { prefix: hrp, bytes };
}
