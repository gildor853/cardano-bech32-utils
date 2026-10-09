# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-09

### Added

- Bech32 (BIP-173) encoding and decoding at byte and 5-bit word level, with a
  configurable length limit (default 1023, as Cardano has no 90-character cap).
- CIP-19 address inspection: header type, network tag, payment/stake
  credentials, pointer decoding (as `bigint`), HRP/network consistency checks.
- CIP-5 prefix table for common keys and hashes, with length-checked
  `encodePrefixed` / `decodePrefixed`.
- Builders for base, enterprise, reward and pointer addresses, plus
  `encodeAddress` for raw address bytes.
- Typed errors (`CardanoBech32Error` with a `code`) and non-throwing `try*`
  variants returning a `Result`.
- Test suite built on the official CIP-19 and BIP-173 test vectors.

[Unreleased]: https://github.com/Gildor853/cardano-bech32-utils/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Gildor853/cardano-bech32-utils/releases/tag/v0.1.0
