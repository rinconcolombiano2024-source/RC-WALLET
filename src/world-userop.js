// Validate MiniKit user-operation identifiers before trusting a remote receipt.
// The Developer Portal returns a userOpHash and, when known, the Safe sender.
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function integrityError(message) {
  const error = new Error(message);
  error.name = "WorldUserOperationIntegrityError";
  return error;
}

export function assertWorldUserOpHash(userOpHash) {
  if (typeof userOpHash !== "string" || !HEX32.test(userOpHash)) {
    throw integrityError("World App devolvió un userOpHash inválido. No repitas el envío sin verificar su estado.");
  }
  return userOpHash;
}

export function verifyWorldUserOpStatus(userOpHash, expectedSender, result) {
  const requestedHash = assertWorldUserOpHash(userOpHash);

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw integrityError("La consulta de World Chain devolvió una respuesta inválida.");
  }

  if (result.userOpHash != null &&
      (typeof result.userOpHash !== "string" ||
       !HEX32.test(result.userOpHash) ||
       result.userOpHash.toLowerCase() !== requestedHash.toLowerCase())) {
    throw integrityError("La respuesta de World Chain corresponde a otra operación.");
  }

  if (result.sender != null && expectedSender) {
    if (typeof result.sender !== "string" ||
        !EVM_ADDRESS.test(result.sender) ||
        !EVM_ADDRESS.test(expectedSender) ||
        result.sender.toLowerCase() !== expectedSender.toLowerCase()) {
      throw integrityError("La operación pertenece a otra wallet de World App. Revisa el historial antes de volver a enviar.");
    }
  }

  if (result.status === "success" && result.transaction_hash != null &&
      (typeof result.transaction_hash !== "string" ||
       !HEX32.test(result.transaction_hash))) {
    throw integrityError("World Chain devolvió un hash de transacción final inválido.");
  }

  return result;
}
