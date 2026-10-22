import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWorldUserOpHash,
  verifyWorldUserOpStatus,
  verifyWorldChainReceipt,
  upsertWorldTransferHistory,
} from "../src/world-userop.js";

const userOpHash = "0x" + "a".repeat(64);
const txHash = "0x" + "b".repeat(64);
const worldSafe = "0x" + "c".repeat(40);

test("rejects invalid or injected MiniKit user operation identifiers", () => {
  for (const input of ["", "0x123", "not-a-hash", "../other", "0x" + "z".repeat(64)]) {
    assert.throws(() => assertWorldUserOpHash(input), /userOpHash inválido/);
  }
  assert.equal(assertWorldUserOpHash(userOpHash), userOpHash);
});

test("preserves a legitimate World Chain successful receipt", () => {
  const payload = {
    status: "success",
    userOpHash: userOpHash.toUpperCase().replace(/^0X/, "0x"),
    sender: worldSafe.toUpperCase().replace(/^0X/, "0x"),
    transaction_hash: txHash,
  };
  assert.equal(verifyWorldUserOpStatus(userOpHash, worldSafe, payload), payload);
});

test("permits pending user operations without a sender or mined tx hash", () => {
  const pending = {status: "pending", userOpHash, sender: null, transaction_hash: null};
  assert.equal(verifyWorldUserOpStatus(userOpHash, worldSafe, pending), pending);
});

test("rejects a response with an unrelated operation hash", () => {
  assert.throws(
    () => verifyWorldUserOpStatus(userOpHash, worldSafe, {
      status: "success",
      userOpHash: "0x" + "d".repeat(64),
      sender: worldSafe,
      transaction_hash: txHash,
    }),
    /otra operación/,
  );
});

test("rejects confirmations originating from another World Wallet", () => {
  assert.throws(
    () => verifyWorldUserOpStatus(userOpHash, worldSafe, {
      status: "success",
      userOpHash,
      sender: "0x" + "e".repeat(40),
      transaction_hash: txHash,
    }),
    /otra wallet/,
  );
});

test("rejects malformed mined transaction hashes without marking success", () => {
  assert.throws(
    () => verifyWorldUserOpStatus(userOpHash, worldSafe, {
      status: "success",
      userOpHash,
      sender: worldSafe,
      transaction_hash: "0xbroken",
    }),
    /hash de transacción final inválido/,
  );
});

test("preserves failed user operations for the existing error handler", () => {
  const failed = { status: "failed", userOpHash, sender: worldSafe, transaction_hash: null };
  assert.equal(verifyWorldUserOpStatus(userOpHash, worldSafe, failed), failed);
});

test("confirms only a mined, successful World Chain transaction receipt", () => {
  assert.equal(verifyWorldChainReceipt(txHash, null), false);
  assert.equal(verifyWorldChainReceipt(txHash, undefined), false);
  assert.equal(verifyWorldChainReceipt(txHash, {
    hash: txHash,
    status: 1,
    blockNumber: 12345,
  }), true);
});

test("does not mark unmined or unknown-status receipts as confirmed", () => {
  assert.equal(verifyWorldChainReceipt(txHash, {
    hash: txHash,
    status: null,
    blockNumber: null,
  }), false);
  assert.equal(verifyWorldChainReceipt(txHash, {
    hash: txHash,
    status: 1,
    blockNumber: null,
  }), false);
});

test("rejects a receipt from a different transaction", () => {
  assert.throws(
    () => verifyWorldChainReceipt(txHash, {
      hash: "0x" + "f".repeat(64),
      status: 1,
      blockNumber: 12345,
    }),
    /otra transacción/,
  );
});

test("rejects reverted on-chain transactions even when the portal reports success", () => {
  assert.throws(
    () => verifyWorldChainReceipt(txHash, {
      hash: txHash,
      status: 0,
      blockNumber: 12345,
    }),
    (error) => error.name === "WorldUserOperationFailed",
  );
});

test("persists a MiniKit operation while its transaction receipt is pending", () => {
  const pending = { userOpHash, pending: true, recipient: worldSafe };
  const entries = upsertWorldTransferHistory([], pending);
  assert.deepEqual(entries, [pending]);
});

test("replaces a pending operation on confirmation without duplicating the transfer", () => {
  const pending = { userOpHash, pending: true, hash: null };
  const older = { userOpHash: "0x" + "e".repeat(64), pending: false };
  const confirmed = { userOpHash: userOpHash.toUpperCase().replace(/^0X/, "0x"), pending: false, hash: txHash };
  const entries = upsertWorldTransferHistory([pending, older], confirmed);
  assert.deepEqual(entries, [confirmed, older]);
});

test("keeps a failed operation identifiable by its original userOpHash", () => {
  const pending = { userOpHash, pending: true };
  const failed = { userOpHash, pending: false, failed: true };
  assert.deepEqual(upsertWorldTransferHistory([pending], failed), [failed]);
});

test("rejects invalid pending operation hashes instead of corrupting history", () => {
  assert.throws(
    () => upsertWorldTransferHistory([], { userOpHash: "bad" }),
    /userOpHash inválido/,
  );
});
