import assert from "node:assert/strict";
import test from "node:test";
import { getTradeUrl } from "../src/market.js";

const ethAsset = {
  chainId: 1,
  isNative: false,
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

test("trade URL does not crash when market quote is absent", () => {
  const link = getTradeUrl("buy", ethAsset, null);
  const url = new URL(link);
  assert.equal(url.hostname, "app.uniswap.org");
  assert.equal(url.searchParams.get("chain"), "mainnet");
  const input = url.searchParams.get("inputCurrency");
  const output = url.searchParams.get("outputCurrency");
  assert.notEqual(input?.toLowerCase(), output?.toLowerCase());
});

test("BNB transfers to PancakeSwap only through official DEX link", () => {
  const asset = {
    chainId: 56,
    isNative: false,
    address: "0x55d398326f99059fF775485246999027B3197955",
  };
  const link = getTradeUrl("buy", asset, null);
  assert.equal(new URL(link).hostname, "pancakeswap.finance");
});

test("unsupported asset without market route is not presented as tradable", () => {
  const unsupported = {chainId: 999999, isNative: true};
  assert.equal(getTradeUrl("buy", unsupported, null), null);
});

test("trade URL handles absent asset safely", () => {
  assert.equal(getTradeUrl("sell", null, null), null);
});
