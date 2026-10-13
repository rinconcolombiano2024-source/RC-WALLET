import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecipientAddress } from "../src/blockchain.js";
import { NETWORKS } from "../src/config.js";

const good = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
const badChecksum = "0x8Ba1f109551bD432803012645Ac136ddd64DBA72";

test("accepts valid Ethereum EIP-55 recipient addresses", () => {
  assert.equal(normalizeRecipientAddress(good, 1), good);
  assert.equal(normalizeRecipientAddress(good.toLowerCase(), 1), good);
});
test("rejects invalid mixed-case EIP-55 checksums", () => {
  assert.throws(() => normalizeRecipientAddress(badChecksum, 1), /checksum/i);
});
test("accepts simple Ethereum URI only when network matches", () => {
  assert.equal(normalizeRecipientAddress(`ethereum:${good}@1`, 1), good);
  assert.throws(() => normalizeRecipientAddress(`ethereum:${good}@10`, 1), /blockchain distinta/i);
});
test("rejects transactional QR URIs", () => {
  assert.throws(() =>
    normalizeRecipientAddress(`ethereum:${good}@1/transfer?address=${good}`, 1),
    /solicitud de transacción/,
  );
});
test("configured networks have unique chain ids and HTTPS RPCs", () => {
  const ids = new Set();
  for (const network of NETWORKS) {
    assert.ok(!ids.has(network.chainId));
    ids.add(network.chainId);
    assert.equal(parseInt(network.chainHex, 16), network.chainId);
    assert.ok(network.rpcUrls.length > 0);
    for (const url of network.rpcUrls) assert.equal(new URL(url).protocol, "https:");
  }
  for (const id of [1, 10, 56, 480, 8453]) assert.ok(ids.has(id));
});
