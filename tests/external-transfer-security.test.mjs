import test from "node:test";
import assert from "node:assert/strict";
import {
  assertExternalNetwork,
  assertCurrentAssetBalance,
  isSafeTypedDataUnsupported,
  switchExternalNetwork,
} from "../src/blockchain.js";

const base = {
  chainId: 8453,
  chainHex: "0x2105",
  name: "Base",
  symbol: "ETH",
  rpcUrls: ["https://mainnet.base.org"],
  explorer: "https://basescan.org",
};

test("already on correct EVM chain: no permission requests", async () => {
  const calls = [];
  const provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_chainId") return "0x2105";
      throw new Error("unexpected wallet request");
    },
  };
  await switchExternalNetwork(provider, base);
  assert.deepEqual(calls, ["eth_chainId"]);
});

test("switch must prove EIP-1193 network actually changed", async () => {
  let switches = 0;
  const provider = {
    async request({ method }) {
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") { switches++; return null; }
      throw new Error("unexpected request");
    },
  };
  await assert.rejects(switchExternalNetwork(provider, base), /Red incorrecta/);
  assert.equal(switches, 1);
});

test("add-chain route switches again, then verifies chainId", async () => {
  let current = "0x1", switches = 0, added = 0;
  const provider = {
    async request({ method, params }) {
      if (method === "eth_chainId") return current;
      if (method === "wallet_switchEthereumChain") {
        switches++;
        assert.equal(params[0].chainId, base.chainHex);
        if (!added) throw Object.assign(new Error("unknown network"), { code: 4902 });
        current = base.chainHex;
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        added++;
        return null; // adding does not select the network
      }
      throw new Error("unexpected method");
    },
  };
  await switchExternalNetwork(provider, base);
  assert.equal(added, 1);
  assert.equal(switches, 2);
  await assertExternalNetwork(provider, base);
});

test("wallet refusal never triggers add-network or another prompt", async () => {
  const calls = [];
  const provider = { async request({ method }) {
    calls.push(method);
    if (method === "eth_chainId") return "0x1";
    throw Object.assign(new Error("User rejected"), { code: 4001 });
  }};
  await assert.rejects(switchExternalNetwork(provider, base), /User rejected/);
  assert.deepEqual(calls, ["eth_chainId", "wallet_switchEthereumChain"]);
});

test("non-hex chain ID is rejected rather than assuming the target network", async () => {
  const provider = { request: async () => 8453 };
  await assert.rejects(assertExternalNetwork(provider, base), /eth_chainId/);
});

test("live balance check blocks outdated native-asset scans", async () => {
  const provider = { getBalance: async () => 9n };
  const asset = { isNative: true, decimals: 18, networkName: "Base", symbol: "ETH" };
  await assert.rejects(
    assertCurrentAssetBalance(provider, asset, "0x0000000000000000000000000000000000000001", 10n),
    /Saldo insuficiente/,
  );
  await assertCurrentAssetBalance(provider, asset, "0x0000000000000000000000000000000000000001", 9n);
});

test("rejected EIP-712 signing cannot be escalated to personal_sign", () => {
  assert.equal(isSafeTypedDataUnsupported({ code: 4001, message: "method unsupported" }), false);
  assert.equal(isSafeTypedDataUnsupported({ code: "ACTION_REJECTED", message: "unsupported method" }), false);
  assert.equal(isSafeTypedDataUnsupported({ code: -32601, message: "method not found" }), true);
  assert.equal(isSafeTypedDataUnsupported({ code: 4200 }), true);
  assert.equal(isSafeTypedDataUnsupported({ code: "UNSUPPORTED_OPERATION" }), true);
  assert.equal(isSafeTypedDataUnsupported({ code: -32000, message: "signing failed" }), false);
});
