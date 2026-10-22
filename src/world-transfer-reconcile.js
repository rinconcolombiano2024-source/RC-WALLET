import {
  assertWorldUserOpHash,
  verifyWorldUserOpStatus,
  verifyWorldChainReceipt,
} from "./world-userop.js";

const WORLD_CHAIN_ID = 480;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function sameAddress(a, b) {
  return typeof a === "string" &&
    typeof b === "string" &&
    ADDRESS_RE.test(a) &&
    ADDRESS_RE.test(b) &&
    a.toLowerCase() === b.toLowerCase();
}

/**
 * Only a World App-authenticated account may reconcile its own recorded
 * operations. Older records with no recorded sender are intentionally
 * excluded: never infer ownership from localStorage or a scanned address.
 */
export function canReconcileWorldTransfer(record, authenticatedAddress) {
  if (record?.route !== "minikit" ||
      record?.pending !== true ||
      record?.failed === true ||
      record?.network?.chainId !== WORLD_CHAIN_ID ||
      !sameAddress(record.sender, authenticatedAddress)) {
    return false;
  }
  try {
    assertWorldUserOpHash(record.userOpHash);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read-only reconciliation. No signature, broadcast, or automatic retry.
 * A missing receipt or a pending Developer Portal response stays pending.
 * Any inconsistent ownership or status fails CLOSED without modifying history.
 *
 * @returns a verified update, or null when the operation remains pending
 */
export async function reconcileWorldTransfer(record, {
  authenticatedAddress,
  fetchUserOperation,
  fetchReceipt,
}) {
  if (!canReconcileWorldTransfer(record, authenticatedAddress)) {
    throw new Error("La operación pendiente no pertenece a la cuenta World App autenticada.");
  }
  if (typeof fetchUserOperation !== "function" ||
      typeof fetchReceipt !== "function") {
    throw new Error("No existe un proveedor de verificación blockchain confiable.");
  }

  const status = verifyWorldUserOpStatus(
    record.userOpHash,
    authenticatedAddress,
    await fetchUserOperation(record.userOpHash),
  );

  if (status.status === "pending") return null;
  if (status.status === "failed") {
    if (!sameAddress(status.sender, authenticatedAddress)) {
      throw new Error("World App no confirmó la cuenta de origen de la operación fallida.");
    }
    return { ...record, pending: false, failed: true };
  }
  if (status.status !== "success" ||
      !sameAddress(status.sender, authenticatedAddress) ||
      !status.transaction_hash) {
    throw new Error("World App no aportó una confirmación verificable del remitente.");
  }

  const receipt = await fetchReceipt(status.transaction_hash);
  if (!verifyWorldChainReceipt(status.transaction_hash, receipt)) return null;

  return {
    ...record,
    pending: false,
    failed: false,
    hash: status.transaction_hash,
    confirmedAt: new Date().toISOString(),
  };
}
