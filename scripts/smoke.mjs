// Runtime smoke test of the built package (ESM entry), run by CI on Node
// versions the test runner no longer supports. No dependencies, no network.
// The bare specifier resolves to ./dist through the package's "exports" map.
import assert from "node:assert/strict";
import { buildBaseAddress, decodeBech32, parseAddress } from "cardano-bech32-utils";

// CIP-19 test vector (mainnet type-00).
const addr =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const info = parseAddress(addr);
assert.equal(info.kind, "base-key-key");
assert.equal(info.network, "mainnet");
assert.equal(info.type === "base" && info.stake.hash, "337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251");
assert.equal(
  buildBaseAddress({
    network: "mainnet",
    payment: { kind: "key", hash: "9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e" },
    stake: { kind: "key", hash: "337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251" },
  }),
  addr,
);
assert.equal(decodeBech32("a12uel5l").hrp, "a"); // BIP-173 vector

console.log(`ESM smoke test passed on Node ${process.version}`);
