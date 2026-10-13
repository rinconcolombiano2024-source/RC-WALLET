import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecipientAddress } from "../src/blockchain.js";
import { getTradeUrl } from "../src/market.js";

const good = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
test("invalid EIP-55 mixed-case recipient fails closed", () => {
  assert.equal(normalizeRecipientAddress(good, 1), good);
  assert.throws(() => normalizeRecipientAddress("0x8Ba1f109551bD432803012645Ac136ddd64DBA72", 1), /checksum/i);
});
test("QR chain mismatch or transaction payload is not a simple recipient", () => {
  assert.equal(normalizeRecipientAddress(`ethereum:${good}@1`, 1), good);
  assert.throws(() => normalizeRecipientAddress(`ethereum:${good}@10`, 1), /otra red/i);
  assert.throws(() => normalizeRecipientAddress(`ethereum:${good}/transfer?value=1`, 1), /instrucciones/i);
});
test("DEX link missing market must not throw or trade token for itself", () => {
  const asset = { chainId: 1, isNative: false, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" };
  const url = new URL(getTradeUrl("buy", asset, null));
  assert.equal(url.hostname, "app.uniswap.org");
  assert.notEqual(url.searchParams.get("inputCurrency")?.toLowerCase(), url.searchParams.get("outputCurrency")?.toLowerCase());
});
test("unsupported network without route is not presented as executable DEX trade", () => {
  assert.equal(getTradeUrl("sell", {chainId:9999, isNative:true}, null), null);
});
