import { fail } from "./errors.js";
import { encodeBech32, type Bech32Options } from "./bech32.js";
import { hexToBytes } from "./hex.js";
import {
  CREDENTIAL_HASH_LENGTH,
  expectedHrp,
  parseAddressBytes,
  toNetworkId,
  type CredentialKind,
  type NetworkInput,
} from "./address.js";

/** A credential accepted by the builders: hash as hex or bytes. */
export interface CredentialInput {
  readonly kind: CredentialKind;
  readonly hash: string | Uint8Array;
}

/** Pointer coordinates accepted by {@link buildPointerAddress}. */
export interface PointerInput {
  readonly slot: bigint | number;
  readonly txIndex: bigint | number;
  readonly certIndex: bigint | number;
}

function credentialBytes(cred: CredentialInput, role: string): Uint8Array {
  if (cred === null || typeof cred !== "object" || (cred.kind !== "key" && cred.kind !== "script")) {
    fail("InvalidCredential", `${role} credential must have kind 'key' or 'script'`);
  }
  let bytes: Uint8Array;
  try {
    bytes = typeof cred.hash === "string" ? hexToBytes(cred.hash) : cred.hash;
  } catch {
    return fail("InvalidCredential", `${role} credential hash is not valid hex`);
  }
  if (!(bytes instanceof Uint8Array) || bytes.length !== CREDENTIAL_HASH_LENGTH) {
    fail("InvalidCredential", `${role} credential hash must be ${CREDENTIAL_HASH_LENGTH} bytes`);
  }
  return bytes;
}

function writeNat(value: bigint | number, out: number[]): void {
  let v: bigint;
  try {
    v = BigInt(value);
  } catch {
    return fail("InvalidPointer", `Pointer component must be an integer, got ${String(value)}`);
  }
  if (v < 0n) fail("InvalidPointer", "Pointer components must be non-negative");
  const groups: number[] = [Number(v & 0x7fn)];
  v >>= 7n;
  while (v > 0n) {
    groups.unshift(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(...groups);
}

/**
 * Bech32-encodes raw Shelley address bytes, choosing the HRP from the header
 * (`addr`/`addr_test` or `stake`/`stake_test`). The bytes are validated with
 * {@link parseAddressBytes} first.
 */
export function encodeAddress(bytes: Uint8Array | string, options: Bech32Options = {}): string {
  const info = parseAddressBytes(bytes);
  if (info.type === "byron") {
    fail("UnsupportedAddress", "Byron addresses are Base58-encoded and cannot be bech32-encoded");
  }
  const hrp = expectedHrp(info.type === "reward" ? "stake" : "payment", info.networkId);
  return encodeBech32(hrp, info.bytes, options);
}

function header(type: number, network: NetworkInput): number {
  return (type << 4) | toNetworkId(network);
}

/**
 * Builds a base address (payment + stake credential), header types 0-3.
 *
 * @example
 * buildBaseAddress({
 *   network: "mainnet",
 *   payment: { kind: "key", hash: "9493...2c8e" },
 *   stake: { kind: "key", hash: "337b...7251" },
 * }); // "addr1q..."
 */
export function buildBaseAddress(params: {
  readonly network: NetworkInput;
  readonly payment: CredentialInput;
  readonly stake: CredentialInput;
}): string {
  const p = credentialBytes(params.payment, "Payment");
  const s = credentialBytes(params.stake, "Stake");
  const type = (params.stake.kind === "script" ? 0b10 : 0) | (params.payment.kind === "script" ? 0b01 : 0);
  return encodeAddress(Uint8Array.of(header(type, params.network), ...p, ...s));
}

/** Builds an enterprise address (payment credential only), header types 6-7. */
export function buildEnterpriseAddress(params: {
  readonly network: NetworkInput;
  readonly payment: CredentialInput;
}): string {
  const p = credentialBytes(params.payment, "Payment");
  const type = params.payment.kind === "script" ? 7 : 6;
  return encodeAddress(Uint8Array.of(header(type, params.network), ...p));
}

/** Builds a reward (stake) address, header types 14-15. */
export function buildRewardAddress(params: {
  readonly network: NetworkInput;
  readonly stake: CredentialInput;
}): string {
  const s = credentialBytes(params.stake, "Stake");
  const type = params.stake.kind === "script" ? 15 : 14;
  return encodeAddress(Uint8Array.of(header(type, params.network), ...s));
}

/**
 * Builds a pointer address, header types 4-5.
 *
 * Note: since the Conway era, new pointer addresses cannot be added to mainnet.
 */
export function buildPointerAddress(params: {
  readonly network: NetworkInput;
  readonly payment: CredentialInput;
  readonly pointer: PointerInput;
}): string {
  const p = credentialBytes(params.payment, "Payment");
  const type = params.payment.kind === "script" ? 5 : 4;
  const tail: number[] = [];
  writeNat(params.pointer.slot, tail);
  writeNat(params.pointer.txIndex, tail);
  writeNat(params.pointer.certIndex, tail);
  return encodeAddress(Uint8Array.of(header(type, params.network), ...p, ...tail));
}
