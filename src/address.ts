import { attempt, fail, type Result } from "./errors.js";
import { decodeBech32, type Bech32Options } from "./bech32.js";
import { bytesToHex, hexToBytes } from "./hex.js";
import { ADDRESS_HRP, STAKE_HRP } from "./prefixes.js";

/** Well-known Cardano networks. */
export type Network = "mainnet" | "testnet";

/**
 * A network given either by name or by raw network tag (0-15).
 * `"mainnet"` = 1, `"testnet"` = 0.
 */
export type NetworkInput = Network | number;

/** Whether a credential is a verification key hash or a script hash. */
export type CredentialKind = "key" | "script";

/** A payment or stake credential: a 28-byte blake2b-224 hash. */
export interface Credential {
  readonly kind: CredentialKind;
  /** 28-byte hash as 56 lowercase hex characters. */
  readonly hash: string;
}

/** A chain pointer to a stake registration certificate. */
export interface Pointer {
  readonly slot: bigint;
  readonly txIndex: bigint;
  readonly certIndex: bigint;
}

/** Coarse address category. */
export type AddressType = "base" | "pointer" | "enterprise" | "reward" | "byron";

/** Fine-grained address kind, one per CIP-19 header type. */
export type AddressKind =
  | "base-key-key"
  | "base-script-key"
  | "base-key-script"
  | "base-script-script"
  | "pointer-key"
  | "pointer-script"
  | "enterprise-key"
  | "enterprise-script"
  | "reward-key"
  | "reward-script"
  | "byron";

interface ShelleyCommon {
  readonly kind: Exclude<AddressKind, "byron">;
  /** Header type: bits 7-4 of the header byte (0-7, 14 or 15). */
  readonly headerType: number;
  /** Network tag: bits 3-0 of the header byte. 1 = mainnet, 0 = testnet. */
  readonly networkId: number;
  /** `"mainnet"` (1), `"testnet"` (0) or `"unknown"` (reserved tags). */
  readonly network: Network | "unknown";
  /** Raw address bytes (header + payload). */
  readonly bytes: Uint8Array;
  /** Bech32 HRP, present when parsed from a bech32 string. */
  readonly hrp?: string;
}

export interface BaseAddressInfo extends ShelleyCommon {
  readonly type: "base";
  readonly payment: Credential;
  readonly stake: Credential;
}

export interface PointerAddressInfo extends ShelleyCommon {
  readonly type: "pointer";
  readonly payment: Credential;
  readonly pointer: Pointer;
}

export interface EnterpriseAddressInfo extends ShelleyCommon {
  readonly type: "enterprise";
  readonly payment: Credential;
}

export interface RewardAddressInfo extends ShelleyCommon {
  readonly type: "reward";
  readonly stake: Credential;
}

/**
 * A Byron (bootstrap) address. Byron addresses are CBOR structures encoded in
 * Base58 by convention; this library only recognises their header and does not
 * decode them.
 */
export interface ByronAddressInfo {
  readonly type: "byron";
  readonly kind: "byron";
  readonly headerType: 8;
  readonly bytes: Uint8Array;
}

/** Any Shelley-era address (payment or stake). */
export type ShelleyAddressInfo =
  | BaseAddressInfo
  | PointerAddressInfo
  | EnterpriseAddressInfo
  | RewardAddressInfo;

/** Result of {@link parseAddressBytes}. */
export type AddressInfo = ShelleyAddressInfo | ByronAddressInfo;

/** Decoded header byte. */
export interface AddressHeader {
  readonly headerType: number;
  readonly networkId: number;
  readonly type: AddressType;
  readonly kind: AddressKind;
}

/** Length of a blake2b-224 credential hash in bytes. */
export const CREDENTIAL_HASH_LENGTH = 28;

const HEADER_KINDS: ReadonlyArray<readonly [AddressType, AddressKind] | undefined> = [
  ["base", "base-key-key"], // 0
  ["base", "base-script-key"], // 1
  ["base", "base-key-script"], // 2
  ["base", "base-script-script"], // 3
  ["pointer", "pointer-key"], // 4
  ["pointer", "pointer-script"], // 5
  ["enterprise", "enterprise-key"], // 6
  ["enterprise", "enterprise-script"], // 7
  ["byron", "byron"], // 8
  undefined, // 9-13 reserved
  undefined,
  undefined,
  undefined,
  undefined,
  ["reward", "reward-key"], // 14
  ["reward", "reward-script"], // 15
];

/** Resolves a {@link NetworkInput} to a numeric network tag (0-15). */
export function toNetworkId(network: NetworkInput): number {
  if (network === "mainnet") return 1;
  if (network === "testnet") return 0;
  if (typeof network === "number" && Number.isInteger(network) && network >= 0 && network <= 15) {
    return network;
  }
  return fail("InvalidNetwork", `Invalid network: ${String(network)}`);
}

function networkName(id: number): Network | "unknown" {
  return id === 1 ? "mainnet" : id === 0 ? "testnet" : "unknown";
}

/**
 * Decodes a CIP-19 header byte. Throws `UnknownHeader` for reserved header
 * types (9-13).
 */
export function parseHeader(byte: number): AddressHeader {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    fail("UnknownHeader", `Header must be a byte, got ${byte}`);
  }
  const headerType = byte >> 4;
  const entry = HEADER_KINDS[headerType];
  if (!entry) fail("UnknownHeader", `Unknown address header type ${headerType}`);
  return { headerType, networkId: byte & 0x0f, type: entry[0], kind: entry[1] };
}

/**
 * Returns the bech32 HRP expected for an address of the given category on the
 * given network: `addr` / `addr_test` for payment addresses and `stake` /
 * `stake_test` for reward addresses. Any non-mainnet tag maps to the test HRP.
 */
export function expectedHrp(type: "payment" | "stake", network: NetworkInput): string {
  const id = toNetworkId(network);
  const table = type === "stake" ? STAKE_HRP : ADDRESS_HRP;
  return id === 1 ? table.mainnet : table.testnet;
}

/** Reads a CIP-19 variable-length natural number. */
function readNat(bytes: Uint8Array, offset: number): [bigint, number] {
  let value = 0n;
  for (let i = offset; i < bytes.length; i++) {
    const b = bytes[i]!;
    value = (value << 7n) | BigInt(b & 0x7f);
    if ((b & 0x80) === 0) return [value, i + 1];
  }
  return fail("InvalidPointer", "Truncated variable-length integer in pointer");
}

function credential(kind: CredentialKind, bytes: Uint8Array): Credential {
  return { kind, hash: bytesToHex(bytes) };
}

function expectLength(bytes: Uint8Array, length: number, what: string): void {
  if (bytes.length !== length) {
    fail("InvalidLength", `${what} must be ${length} bytes, got ${bytes.length}`);
  }
}

/**
 * Parses raw address bytes (or hex) per CIP-19. Byron addresses are recognised
 * by their header but not decoded further.
 */
export function parseAddressBytes(input: Uint8Array | string): AddressInfo {
  const bytes = typeof input === "string" ? hexToBytes(input) : Uint8Array.from(input);
  if (bytes.length === 0) fail("InvalidLength", "Address must not be empty");
  const header = parseHeader(bytes[0]!);
  const { headerType, networkId } = header;

  if (header.kind === "byron") return { type: "byron", kind: "byron", headerType: 8, bytes };

  const common = {
    kind: header.kind,
    headerType,
    networkId,
    network: networkName(networkId),
    bytes,
  } as const;
  const h = CREDENTIAL_HASH_LENGTH;
  const paymentKind: CredentialKind = headerType & 0b0001 ? "script" : "key";

  switch (header.type) {
    case "base": {
      expectLength(bytes, 1 + 2 * h, "Base address");
      const stakeKind: CredentialKind = headerType & 0b0010 ? "script" : "key";
      return {
        ...common,
        type: "base",
        payment: credential(paymentKind, bytes.subarray(1, 1 + h)),
        stake: credential(stakeKind, bytes.subarray(1 + h, 1 + 2 * h)),
      };
    }
    case "pointer": {
      if (bytes.length < 1 + h + 3) {
        fail("InvalidLength", `Pointer address must be at least ${1 + h + 3} bytes, got ${bytes.length}`);
      }
      let offset = 1 + h;
      const [slot, o1] = readNat(bytes, offset);
      const [txIndex, o2] = readNat(bytes, o1);
      const [certIndex, o3] = readNat(bytes, o2);
      offset = o3;
      if (offset !== bytes.length) fail("InvalidLength", "Trailing bytes after pointer");
      return {
        ...common,
        type: "pointer",
        payment: credential(paymentKind, bytes.subarray(1, 1 + h)),
        pointer: { slot, txIndex, certIndex },
      };
    }
    case "enterprise":
      expectLength(bytes, 1 + h, "Enterprise address");
      return { ...common, type: "enterprise", payment: credential(paymentKind, bytes.subarray(1)) };
    case "reward":
      expectLength(bytes, 1 + h, "Reward address");
      return { ...common, type: "reward", stake: credential(paymentKind, bytes.subarray(1)) };
  }
  /* c8 ignore next */
  return fail("UnknownHeader", `Unknown address header type ${headerType}`);
}

/** Options for {@link parseAddress}. */
export interface ParseAddressOptions extends Bech32Options {
  /**
   * If set, the address must belong to this network, otherwise
   * `NetworkMismatch` is thrown.
   */
  readonly network?: NetworkInput;
  /**
   * Verify that the HRP matches the address category and network
   * (`addr`/`addr_test` vs `stake`/`stake_test`). Default `true`.
   */
  readonly checkHrp?: boolean;
}

/**
 * Parses a bech32-encoded Shelley payment or stake address per CIP-19.
 *
 * Throws {@link CardanoBech32Error} with code `InvalidChecksum`, `InvalidHrp`,
 * `InvalidLength`, `MixedCase`, `NetworkMismatch`, `UnknownHeader`,
 * `InvalidPointer` or `UnsupportedAddress` (Byron payload in bech32).
 */
export function parseAddress(input: string, options: ParseAddressOptions = {}): ShelleyAddressInfo {
  const { hrp, bytes } = decodeBech32(input, options);
  const info = parseAddressBytes(bytes);
  if (info.type === "byron") {
    fail("UnsupportedAddress", "Byron addresses are Base58-encoded and are not supported in bech32");
  }

  if (options.checkHrp ?? true) {
    const isStake = info.type === "reward";
    const allowed = isStake ? STAKE_HRP : ADDRESS_HRP;
    if (hrp !== allowed.mainnet && hrp !== allowed.testnet) {
      fail(
        "InvalidHrp",
        `HRP '${hrp}' is not valid for a ${isStake ? "stake" : "payment"} address ` +
          `(expected '${allowed.mainnet}' or '${allowed.testnet}')`,
      );
    }
    const want = expectedHrp(isStake ? "stake" : "payment", info.networkId);
    if (hrp !== want) {
      fail("NetworkMismatch", `HRP '${hrp}' does not match network tag ${info.networkId}`);
    }
  }

  if (options.network !== undefined && toNetworkId(options.network) !== info.networkId) {
    fail(
      "NetworkMismatch",
      `Address network tag ${info.networkId} does not match expected ${String(options.network)}`,
    );
  }

  return { ...info, hrp };
}

/** Non-throwing variant of {@link parseAddress}. */
export function tryParseAddress(
  input: string,
  options: ParseAddressOptions = {},
): Result<ShelleyAddressInfo> {
  return attempt(() => parseAddress(input, options));
}

/** `true` if `input` is a valid bech32 Shelley payment or stake address. */
export function isValidAddress(input: string, options: ParseAddressOptions = {}): boolean {
  return tryParseAddress(input, options).ok;
}
