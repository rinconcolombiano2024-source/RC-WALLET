import test from "node:test";
import assert from "node:assert/strict";
import {
  canReconcileWorldTransfer,
  reconcileWorldTransfer,
} from "../src/world-transfer-reconcile.js";

const hash = "0x" + "a".repeat(64);
const minedHash = "0x" + "b".repeat(64);
const sender = "0x" + "c".repeat(40);
const another = "0x" + "d".repeat(40);
const pending = {
  route: "minikit",
  network: { chainId: 480, name: "World Chain" },
  userOpHash: hash,
  sender,
  pending: true,
  failed: false,
  recipient: another,
  amount: "1",
};

const readers = (status, receipt = null) => ({
  fetchUserOperation: async () => status,
  fetchReceipt: async () => receipt,
  authenticatedAddress: sender,
});

test("reconciliation is restricted to an authenticated owner with a recorded sender", () => {
  assert.equal(canReconcileWorldTransfer(pending, sender), true);
  assert.equal(canReconcileWorldTransfer(pending, another), false);
  assert.equal(canReconcileWorldTransfer({ ...pending, sender: null }, sender), false);
  assert.equal(canReconcileWorldTransfer({ ...pending, network: { chainId: 1 } }, sender), false);
  assert.equal(canReconcileWorldTransfer({ ...pending, route: "external" }, sender), false);
  assert.equal(canReconcileWorldTransfer({ ...pending, pending: false }, sender), false);
  assert.equal(canReconcileWorldTransfer({ ...pending, userOpHash: "bogus" }, sender), false);
});

test("a pending World App user operation never triggers an on-chain receipt lookup", async () => {
  let checked = false;
  const result = await reconcileWorldTransfer(pending, {
    ...readers({ status: "pending", userOpHash: hash, sender: null }),
    fetchReceipt: async () => { checked = true; throw new Error("unexpected"); },
  });
  assert.equal(result, null);
  assert.equal(checked, false);
});

test("a successful user operation with no indexed receipt stays pending", async () => {
  const result = await reconcileWorldTransfer(
    pending,
    readers({ status: "success", userOpHash: hash, sender, transaction_hash: minedHash }),
  );
  assert.equal(result, null);
});

test("only a matching mined successful receipt confirms the original pending entry", async () => {
  const result = await reconcileWorldTransfer(
    pending,
    readers(
      { status: "success", userOpHash: hash, sender, transaction_hash: minedHash },
      { hash: minedHash, status: 1, blockNumber: 42 },
    ),
  );
  assert.equal(result.pending, false);
  assert.equal(result.failed, false);
  assert.equal(result.hash, minedHash);
  assert.equal(result.userOpHash, hash);
  assert.equal(result.sender, sender);
});

test("a failed operation is marked failed only when World App confirms the owner", async () => {
  const result = await reconcileWorldTransfer(pending, readers({
    status: "failed", userOpHash: hash, sender, transaction_hash: null,
  }));
  assert.equal(result.failed, true);
  assert.equal(result.pending, false);
  await assert.rejects(
    reconcileWorldTransfer(pending, readers({
      status: "failed", userOpHash: hash, sender: null,
    })),
    /no confirmó la cuenta/,
  );
});

test("a foreign sender or unexpected user operation fails closed", async () => {
  await assert.rejects(
    reconcileWorldTransfer(pending, readers({
      status: "success", userOpHash: hash, sender: another, transaction_hash: minedHash,
    })),
    /otra wallet/,
  );
  await assert.rejects(
    reconcileWorldTransfer(pending, readers({
      status: "success", userOpHash: "0x" + "f".repeat(64), sender, transaction_hash: minedHash,
    })),
    /otra operación/,
  );
});

test("a reverted on-chain receipt must never confirm a transfer", async () => {
  await assert.rejects(
    reconcileWorldTransfer(pending, readers(
      { status: "success", userOpHash: hash, sender, transaction_hash: minedHash },
      { hash: minedHash, status: 0, blockNumber: 42 },
    )),
    (error) => error.name === "WorldUserOperationFailed",
  );
});

test("missing signed ownership or provider functions cannot amend local history", async () => {
  await assert.rejects(
    reconcileWorldTransfer({ ...pending, sender: "" }, readers({ status: "pending" })),
    /no pertenece/,
  );
  await assert.rejects(
    reconcileWorldTransfer(pending, { authenticatedAddress: sender }),
    /proveedor de verificación/,
  );
});
