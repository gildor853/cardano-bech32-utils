// Runtime smoke test of the built package (CJS entry). See smoke.mjs.
"use strict";
const assert = require("node:assert/strict");
const { parseAddress, tryParseAddress, CardanoBech32Error } = require("cardano-bech32-utils");

const info = parseAddress("stake_test17rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcljw6kf"); // CIP-19 type-15
assert.equal(info.kind, "reward-script");
assert.equal(info.network, "testnet");
const bad = tryParseAddress("addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl9");
assert.equal(bad.ok, false);
assert.ok(bad.error instanceof CardanoBech32Error);
assert.equal(bad.error.code, "InvalidChecksum");

console.log(`CJS smoke test passed on Node ${process.version}`);
