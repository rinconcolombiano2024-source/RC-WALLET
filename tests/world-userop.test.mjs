import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWorldUserOpHash,
  verifyWorldUserOpStatus,
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
