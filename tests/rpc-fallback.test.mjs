import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { getProvider, readToken, scanNetworkWithRpcFailover } from "../src/blockchain.js";

async function startRpc() {
  const methods = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    const handler = ({ id, method }) => {
      methods.push(method);
      return { jsonrpc: "2.0", id,
        result: method === "eth_chainId" ? "0x7ab2" : "0x100" };
    };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(Array.isArray(request) ? request.map(handler) : handler(request)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    methods,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("a cached RPC failure retries once using the next verified endpoint", async () => {
  const a = await startRpc();
  const b = await startRpc();
  const network = {
    name: "mock network", chainId: 31410, chainHex: "0x7ab2",
    symbol: "ETH", rpcUrls: [a.url, b.url],
  };
  try {
    const first = await getProvider(network);
    assert.ok(a.methods.includes("eth_chainId"));
    let attempts = 0;
    const response = await scanNetworkWithRpcFailover(
      network, "0x0000000000000000000000000000000000000001", [], undefined,
      async () => {
        attempts++;
        if (attempts === 1) throw new Error("RPC suddenly unavailable");
        return { provider: await getProvider(network), recovered: true };
      },
    );
    assert.equal(attempts, 2);
    assert.equal(response.recovered, true);
    assert.notEqual(response.provider, first);
    assert.ok(b.methods.includes("eth_chainId"));
    response.provider.destroy();
  } finally {
    await a.close();
    await b.close();
  }
});

test("absent ERC-20 bytecode is unsupported, not a zero balance", async () => {
  const network = { name: "Base", chainId: 8453 };
  const contract = "0x0000000000000000000000000000000000000012";
  const provider = { getCode: async () => "0x" };
  await assert.rejects(
    readToken(provider, network, "0x0000000000000000000000000000000000000001", {
      symbol: "WLD", addresses: { 8453: contract },
    }),
    /no se puede interpretar como saldo cero/,
  );
});

test("cancelled fallback never retries another RPC", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    scanNetworkWithRpcFailover(
      { name: "cancelled", chainId: 31888, rpcUrls: ["https://one.invalid", "https://two.invalid"] },
      "0x0000000000000000000000000000000000000001", [],
      controller.signal,
      async () => {
        calls += 1;
        controller.abort();
        throw new Error("cancelled");
      },
    ),
    /Scan cancelled/,
  );
  assert.equal(calls, 1);
});
