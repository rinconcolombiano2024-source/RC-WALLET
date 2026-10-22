import test from "node:test";
import assert from "node:assert/strict";
import { NETWORKS, TOKENS, WORLD_CHAIN_ID } from "../src/config.js";

test("Polygon PoS is configured for balance scanning and never for MiniKit signing", () => {
  const polygon = NETWORKS.find((network) => network.chainId === 137);

  assert.ok(polygon, "Polygon PoS must be available in the scanner");
  assert.equal(polygon.name, "Polygon");
  assert.equal(polygon.chainHex, "0x89");
  assert.equal(polygon.symbol, "POL");
  assert.equal(polygon.explorer, "https://polygonscan.com");
  assert.equal(polygon.testnet, undefined);
  assert.equal(polygon.writableWithMiniKit, false);
  assert.ok(polygon.rpcUrls.length >= 2, "Polygon must have RPC fallback endpoints");
  assert.ok(polygon.rpcUrls.every((url) => url.startsWith("https://")));
});

test("only World Chain mainnet is MiniKit-writable", () => {
  const writableNetworks = NETWORKS.filter(
    (network) => network.writableWithMiniKit === true,
  );
  assert.deepEqual(writableNetworks.map((network) => network.chainId), [
    WORLD_CHAIN_ID,
  ]);
  assert.equal(WORLD_CHAIN_ID, 480);
  assert.equal(new Set(NETWORKS.map((network) => network.chainId)).size, NETWORKS.length);
});

test("Polygon USDC uses Circle's native token instead of bridged USDC.e", () => {
  const usdc = TOKENS.find((token) => token.symbol === "USDC");
  assert.ok(usdc);
  assert.equal(usdc.expectedDecimals, 6);
  assert.equal(
    usdc.addresses[137].toLowerCase(),
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  );
  assert.notEqual(
    usdc.addresses[137].toLowerCase(),
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    "Bridged USDC.e must not be mislabeled as Circle native USDC",
  );
});
