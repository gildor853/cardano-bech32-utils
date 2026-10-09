# cardano-bech32-utils

[![CI](https://github.com/Gildor853/cardano-bech32-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/Gildor853/cardano-bech32-utils/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/cardano-bech32-utils.svg)](https://www.npmjs.com/package/cardano-bech32-utils)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

Tiny, zero-dependency TypeScript helpers for **Cardano bech32 addresses**:
BIP-173 encode/decode, CIP-19 address inspection, CIP-5 prefixes and address
builders. Works in Node.js and browsers (`Uint8Array` only, no `Buffer`).

## Why

Most Cardano tooling pulls in a full serialization library just to answer
simple questions: *Is this a valid address? Mainnet or testnet? Is it a script
address? What is the stake credential?* This package answers them in a few
kilobytes, with no runtime dependencies and strict types.

- **Correct for Cardano**: bech32 (not bech32m), no 90-character limit.
- **CIP-19 aware**: all 10 Shelley header types, network tags, credentials and pointers.
- **Typed errors**: one error class with a machine-readable `code`, plus non-throwing `try*` variants.
- **Tested against the spec**: the official CIP-19 and BIP-173 test vectors.
- **Tree-shakeable** ESM + CJS builds with bundled type declarations.

## Install

```sh
npm install cardano-bech32-utils
```

Requires Node.js 18+ or any modern browser/bundler.

## Quick start

```ts
import { parseAddress, buildEnterpriseAddress, isValidAddress } from "cardano-bech32-utils";

const info = parseAddress(
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x",
);

info.type;     // "base"
info.kind;     // "base-key-key"
info.network;  // "mainnet"
info.payment;  // { kind: "key", hash: "9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e" }
info.stake;    // { kind: "key", hash: "337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251" }

isValidAddress("addr_test1vz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerspjrlsz", {
  network: "mainnet",
}); // false (testnet address)

buildEnterpriseAddress({
  network: "mainnet",
  payment: { kind: "key", hash: "9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e" },
}); // "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8"
```

## API reference

### Bech32

| Function | Description |
| --- | --- |
| `encodeBech32(hrp, bytes, opts?)` | Encode bytes as a lowercase bech32 string. |
| `decodeBech32(str, opts?)` | Decode to `{ hrp, bytes }`. HRP is returned lowercase. |
| `tryDecodeBech32(str, opts?)` | Non-throwing variant returning a `Result`. |
| `isBech32(str, opts?)` | `true` if the string is well-formed with a valid checksum. |
| `encodeBech32Words(hrp, words, opts?)` / `decodeBech32Words(str, opts?)` | Same, at the 5-bit word level. |
| `toWords(bytes)` / `fromWords(words)` | Convert between bytes and 5-bit words (strict padding checks). |
| `DEFAULT_BECH32_LIMIT` | `1023`. Pass `{ limit: 90 }` for strict BIP-173 behaviour. |

### Address inspection (CIP-19)

| Function | Description |
| --- | --- |
| `parseAddress(str, opts?)` | Parse a bech32 Shelley payment or stake address. Options: `network` (expected network), `checkHrp` (default `true`), `limit`. |
| `tryParseAddress(str, opts?)` | Non-throwing variant returning a `Result`. |
| `isValidAddress(str, opts?)` | Boolean convenience wrapper. |
| `parseAddressBytes(bytesOrHex)` | Parse raw address bytes. Recognises (but does not decode) Byron addresses. |
| `parseHeader(byte)` | Decode a header byte into `{ headerType, networkId, type, kind }`. |
| `expectedHrp("payment" \| "stake", network)` | `addr`, `addr_test`, `stake` or `stake_test`. |
| `toNetworkId(network)` | `"mainnet"` → `1`, `"testnet"` → `0`, or a raw tag `0`–`15`. |

`parseAddress` returns a discriminated union on `type`:

| `type` | `kind` values | Fields |
| --- | --- | --- |
| `"base"` | `base-key-key`, `base-script-key`, `base-key-script`, `base-script-script` | `payment`, `stake` |
| `"pointer"` | `pointer-key`, `pointer-script` | `payment`, `pointer` (`{ slot, txIndex, certIndex }` as `bigint`) |
| `"enterprise"` | `enterprise-key`, `enterprise-script` | `payment` |
| `"reward"` | `reward-key`, `reward-script` | `stake` |

Every result also carries `headerType`, `networkId`, `network`
(`"mainnet" | "testnet" | "unknown"`), `bytes` and `hrp`. Credentials are
`{ kind: "key" | "script", hash: string }` with a 56-character lowercase hex hash.

### Builders

| Function | Header types |
| --- | --- |
| `buildBaseAddress({ network, payment, stake })` | 0–3 |
| `buildPointerAddress({ network, payment, pointer })` | 4–5 |
| `buildEnterpriseAddress({ network, payment })` | 6–7 |
| `buildRewardAddress({ network, stake })` | 14–15 |
| `encodeAddress(bytesOrHex)` | Any Shelley address; HRP chosen from the header. |

Credential hashes may be given as hex strings or `Uint8Array` (28 bytes).
`network` is `"mainnet"`, `"testnet"` or a numeric tag.

### Prefixes (CIP-5)

| Export | Description |
| --- | --- |
| `ADDRESS_HRP`, `STAKE_HRP` | `{ mainnet, testnet }` HRPs for payment and stake addresses. |
| `CIP5_PREFIXES` | Typed table of common prefixes (`addr_vk`, `stake_vk`, `addr_vkh`, `stake_vkh`, `script`, `pool`, `policy_vkh`, `drep_vkh`, `datum`, `asset`, ...) with expected payload lengths. |
| `encodePrefixed(prefix, bytesOrHex)` | Encode a key/hash, checking its length. |
| `decodePrefixed(str, expected?)` | Decode, checking prefix and length. |
| `isCip5Prefix(hrp)` | Type guard for known prefixes. |

```ts
encodePrefixed("pool", "<56 hex chars>"); // "pool1..."
decodePrefixed("script1cda3khwqv60360rp5m7akt50m6ttapacs8rqhn5w342z7r35m37", "script").bytes;
```

### Utilities

`bytesToHex(bytes)`, `hexToBytes(hex)`.

## Error handling

Throwing functions throw a single error class, `CardanoBech32Error`, with a
machine-readable `code`:

| Code | Meaning |
| --- | --- |
| `InvalidChecksum` | The bech32 checksum does not verify. |
| `InvalidHrp` | Empty/out-of-range HRP, unknown prefix, or HRP not valid for the address category. |
| `InvalidLength` | String over the length limit, checksum too short, or wrong payload length. |
| `InvalidCharacter` | A character outside the bech32 alphabet. |
| `MixedCase` | Upper- and lowercase characters mixed. |
| `MissingSeparator` | No `1` separator. |
| `InvalidPadding` | Invalid bit padding in the data part. |
| `InvalidHex` | Malformed hex input. |
| `NetworkMismatch` | HRP disagrees with the header's network tag, or the address is not on the expected network. |
| `UnknownHeader` | Reserved header type (9–13). |
| `InvalidPointer` | Malformed or negative pointer component. |
| `UnsupportedAddress` | Byron payload where a Shelley address is required. |
| `InvalidCredential` | Builder credential with a wrong kind or hash length. |
| `InvalidNetwork` | Network not `"mainnet"`, `"testnet"` or an integer 0–15. |

```ts
import { parseAddress, tryParseAddress, isCardanoBech32Error } from "cardano-bech32-utils";

try {
  parseAddress(input, { network: "mainnet" });
} catch (err) {
  if (isCardanoBech32Error(err) && err.code === "NetworkMismatch") {
    // ...
  }
}

const result = tryParseAddress(input);
if (result.ok) {
  console.log(result.value.kind);
} else {
  console.log(result.error.code);
}
```

Convention: `x()` throws, `tryX()` returns `{ ok: true, value } | { ok: false, error }`,
`isX()` returns a boolean.

## Limitations and assumptions

- **Byron addresses** are Base58-encoded CBOR. They are recognised by
  `parseAddressBytes` (header type 8) but not decoded, and `parseAddress`
  rejects Byron payloads inside bech32 (as CIP-19 recommends).
- **No hashing**: the library works with credential hashes; it does not derive
  them from keys or scripts (that needs blake2b-224).
- **Network tags**: any non-mainnet tag maps to the `addr_test` / `stake_test`
  HRPs; tags other than 0 and 1 are reported as `network: "unknown"`.
- **Pointers** are decoded as `bigint` without an upper bound; trailing bytes
  after the three numbers are rejected. Since the Conway era, new pointer
  addresses cannot be added to mainnet.
- **CIP-5 table** is a curated subset. Governance identifiers (`drep`,
  `cc_cold`, `cc_hot`) are omitted because CIP-129 changed their payload format.
- **Length limit**: defaults to 1023 characters. Bech32's error-detection
  guarantees are weaker for strings longer than 90 characters.

## Disclaimer

**Use at your own risk.** This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and non-infringement. The author accepts **no responsibility or liability** for any loss of funds, assets, data or any other damages arising from the use or misuse of this library, including incorrect address parsing, encoding or validation.

This library is **not audited**. It is not financial advice and is not affiliated with or endorsed by the Cardano Foundation, IOG, EMURGO or Intersect. Always verify addresses independently before sending funds, and test thoroughly before using it in production or with real assets.

## Contributing

This repository is maintained by a single author and does not accept external
pull requests. Bug reports via GitHub issues are welcome.

## License

[MIT](./LICENSE) © 2026 Gildor
