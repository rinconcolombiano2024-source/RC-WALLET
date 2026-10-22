import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { normalizeAddress, getProvider } from "../src/blockchain.js";

async function mockRpc(chainId, methods = []) {
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const reply = (call) => {
      methods.push(call.method);
      let result;
      if (call.method === "eth_chainId") result = `0x${chainId.toString(16)}`;
      else if (call.method === "eth_blockNumber") result = "0x40";
      else return { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: "Unknown method" } };
      return { jsonrpc: "2.0", id: call.id, result };
    };
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("EIP-55 checksum is enforced instead of silently lowercased", () => {
  const checksummed = "0x52908400098527886E0F7030069857D2E4169EE7";
  assert.equal(normalizeAddress(checksummed.toLowerCase()), checksummed);
  assert.equal(normalizeAddress(checksummed), checksummed);
  assert.throws(() => normalizeAddress("0x52908400098527886e0F7030069857D2E4169EE7"), /checksum/i);
  assert.throws(() => normalizeAddress("not-an-address"), /válida/i);
});

test("RPC must report its real chain ID; reject wrong endpoint and use fallback", async () => {
  const wrongMethods = [];
  const goodMethods = [];
  const wrong = await mockRpc(31338, wrongMethods);
  const good = await mockRpc(31337, goodMethods);
  try {
    const provider = await getProvider({
      name: "Testnet local",
      chainId: 31337,
      rpcUrls: [wrong.url, good.url],
    });
    assert.equal(await provider.send("eth_chainId", []), "0x7a69");
    assert.ok(wrongMethods.includes("eth_chainId"), "wrong endpoint was inspected");
    assert.ok(!wrongMethods.includes("eth_blockNumber"), "wrong endpoint was not used for balances");
    assert.ok(goodMethods.includes("eth_blockNumber"), "fallback health checked");
    provider.destroy();
  } finally {
    await wrong.close();
    await good.close();
  }
});

test("RPC with a wrong chain ID and no fallback fails closed", async () => {
  const bad = await mockRpc(29999);
  try {
    await assert.rejects(
      getProvider({ name: "Wrong chain", chainId: 29998, rpcUrls: [bad.url] }),
      /chainId incorrecta/i,
    );
  } finally {
    await bad.close();
  }
});

test("unknown network has no implicit RPC or signer", async () => {
  await assert.rejects(getProvider({ chainId: 0, rpcUrls: [] }), /Red inválida/);
});
