import { ethers } from "ethers";

import {
  getProvider,
  normalizeAddress,
} from "./blockchain.js";

import {
  NETWORKS,
  WORLD_CHAIN_ID,
} from "./config.js";

import {
  SAFE_TX_TYPES,
  hashSafeTransactionTypedData,
} from "./recovery-proof.js";

// ============================================================================
// RC WALLET — WORLD SAFE AUTHORITY
// ============================================================================
//
// PROPÓSITO
//
// World App utiliza una Smart Account (Safe). Por tanto, una firma nativa
// devuelta por MiniKit NO debe asumirse automáticamente como una firma EOA
// recuperable de 65 bytes.
//
// La validación oficial compatible con World App es:
//
//   Safe.isValidSignature(messageHash, signature)
//
// es decir, EIP-1271 contra la dirección Safe.
//
// Este módulo:
//   1. valida la firma MiniKit contra la Safe real de World Chain;
//   2. conserva detección EOA cuando la firma también sea recuperable;
//   3. compara owners + threshold con el intent preparado;
//   4. clasifica el formato de firma sin adivinar;
//   5. permite comprobar la MISMA firma contra la Safe objetivo;
//   6. compara el hash local con Safe.getTransactionHash();
//   7. usa encodeTransactionData() para que contract-signatures tengan
//      exactamente el preimage que Safe espera;
//   8. NO despliega;
//   9. NO mueve fondos;
//  10. NO solicita private keys ni seed phrases.
//
// REGLA:
// Una firma válida en World Chain NO se considera automáticamente portable.
// La prueba definitiva para Ethereum ocurre contra la Safe objetivo mediante
// checkSignatures()/execTransaction simulation.
//
// ============================================================================

const ERC1271_MAGIC_VALUE = "0x1626ba7e";

const MAX_SIGNATURE_BYTES = 64 * 1024;

const SAFE_AUTHORITY_ABI = Object.freeze([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function VERSION() view returns (string)",
  "function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",
  "function encodeTransactionData(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes)",
  "function checkSignatures(bytes32 dataHash,bytes data,bytes signatures) view",
  "function checkSignatures(address executor,bytes32 dataHash,bytes signatures) view",
]);

function timeout(promise, milliseconds, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${label}: tiempo de espera agotado`,
        ),
      );
    }, milliseconds);
  });

  return Promise.race([
    promise,
    timeoutPromise,
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function sameAddress(left, right) {
  try {
    return (
      normalizeAddress(left) ===
      normalizeAddress(right)
    );
  } catch {
    return false;
  }
}

function normalizeChainId(value) {
  const chainId = Number(value);

  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0
  ) {
    throw new Error(
      "chainId inválida",
    );
  }

  return chainId;
}

function normalizeUint(value, label) {
  let parsed;

  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(
      `${label} no es uint256 válido`,
    );
  }

  if (parsed < 0n) {
    throw new Error(
      `${label} no puede ser negativo`,
    );
  }

  return parsed;
}

function sanitizeOwners(owners) {
  if (!Array.isArray(owners)) {
    return [];
  }

  const unique = new Map();

  for (const owner of owners) {
    if (!ethers.isAddress(owner)) {
      continue;
    }

    const normalized =
      ethers.getAddress(owner);

    unique.set(
      normalized.toLowerCase(),
      normalized,
    );
  }

  return [
    ...unique.values(),
  ];
}

function sameOwnerSet(left, right) {
  const first =
    sanitizeOwners(left)
      .map((address) =>
        address.toLowerCase(),
      )
      .sort();

  const second =
    sanitizeOwners(right)
      .map((address) =>
        address.toLowerCase(),
      )
      .sort();

  return (
    JSON.stringify(first) ===
    JSON.stringify(second)
  );
}

function ownerListIncludes(
  owners,
  candidate,
) {
  if (!candidate) {
    return false;
  }

  return sanitizeOwners(
    owners,
  ).some((owner) =>
    sameAddress(
      owner,
      candidate,
    ),
  );
}

function assertHexSignature(signature) {
  if (
    typeof signature !== "string" ||
    !ethers.isHexString(signature) ||
    signature === "0x"
  ) {
    throw new Error(
      "MiniKit no devolvió una firma hexadecimal válida",
    );
  }

  const byteLength =
    ethers.dataLength(signature);

  if (
    byteLength <= 0 ||
    byteLength >
      MAX_SIGNATURE_BYTES
  ) {
    throw new Error(
      "La firma MiniKit tiene un tamaño inválido",
    );
  }

  return byteLength;
}

function getWorldNetwork() {
  const network =
    NETWORKS.find(
      (candidate) =>
        candidate.chainId ===
        WORLD_CHAIN_ID,
    );

  if (!network) {
    throw new Error(
      "World Chain no está configurada en RC Wallet",
    );
  }

  return network;
}

function assertSafeTypedData({
  intent,
  safeAddress,
}) {
  if (
    !intent ||
    !intent.typedData ||
    intent.typedData.primaryType !==
      "SafeTx"
  ) {
    throw new Error(
      "El intent no contiene una SafeTx válida",
    );
  }

  const normalizedSafe =
    normalizeAddress(
      safeAddress ??
        intent.safeAddress,
    );

  const topChainId =
    normalizeChainId(
      intent.typedData.chainId,
    );

  const domainChainId =
    normalizeChainId(
      intent.typedData
        .domain
        ?.chainId,
    );

  const intentChainId =
    normalizeChainId(
      intent.chainId,
    );

  if (
    topChainId !==
      domainChainId ||
    topChainId !==
      intentChainId
  ) {
    throw new Error(
      "SafeTx insegura: chainId, domain.chainId e intent.chainId no coinciden",
    );
  }

  if (
    !sameAddress(
      intent.typedData
        .domain
        ?.verifyingContract,
      normalizedSafe,
    )
  ) {
    throw new Error(
      "SafeTx insegura: verifyingContract no coincide con la Safe",
    );
  }

  const message =
    intent.typedData.message;

  if (!message) {
    throw new Error(
      "SafeTx sin message",
    );
  }

  normalizeAddress(
    message.to,
  );

  normalizeUint(
    message.value,
    "Safe value",
  );

  normalizeUint(
    message.safeTxGas,
    "safeTxGas",
  );

  normalizeUint(
    message.baseGas,
    "baseGas",
  );

  normalizeUint(
    message.gasPrice,
    "gasPrice",
  );

  normalizeUint(
    message.nonce,
    "Safe nonce",
  );

  normalizeAddress(
    message.gasToken,
  );

  normalizeAddress(
    message.refundReceiver,
  );

  if (
    typeof message.data !==
      "string" ||
    !ethers.isHexString(
      message.data,
    )
  ) {
    throw new Error(
      "SafeTx calldata inválido",
    );
  }

  const operation =
    Number(message.operation);

  if (
    operation !== 0 &&
    operation !== 1
  ) {
    throw new Error(
      "SafeTx operation inválida",
    );
  }

  return {
    safeAddress:
      normalizedSafe,

    chainId:
      topChainId,

    message,
  };
}

async function readSafeState(
  provider,
  safeAddress,
) {
  const address =
    normalizeAddress(
      safeAddress,
    );

  const code =
    await timeout(
      provider.getCode(address),
      8_000,
      "Safe bytecode",
    );

  if (
    !code ||
    code === "0x"
  ) {
    return {
      deployed: false,
      address,
      codeHash: null,
      owners: [],
      threshold: null,
      version: null,
    };
  }

  const contract =
    new ethers.Contract(
      address,
      SAFE_AUTHORITY_ABI,
      provider,
    );

  const [
    ownersResult,
    thresholdResult,
    versionResult,
  ] = await Promise.allSettled([
    timeout(
      contract.getOwners(),
      8_000,
      "Safe owners",
    ),

    timeout(
      contract.getThreshold(),
      8_000,
      "Safe threshold",
    ),

    timeout(
      contract.VERSION(),
      8_000,
      "Safe version",
    ),
  ]);

  if (
    ownersResult.status !==
      "fulfilled" ||
    thresholdResult.status !==
      "fulfilled"
  ) {
    throw new Error(
      "La cuenta tiene bytecode pero no responde como Safe",
    );
  }

  const owners =
    sanitizeOwners(
      ownersResult.value,
    );

  const threshold =
    Number(
      thresholdResult.value,
    );

  if (
    owners.length === 0 ||
    !Number.isSafeInteger(
      threshold,
    ) ||
    threshold <= 0 ||
    threshold >
      owners.length
  ) {
    throw new Error(
      "Safe devolvió owners/threshold inválidos",
    );
  }

  return {
    deployed: true,

    address,

    codeHash:
      ethers.keccak256(code),

    owners,

    threshold,

    version:
      versionResult.status ===
        "fulfilled"
        ? String(
            versionResult.value,
          )
        : null,
  };
}

async function callEip1271({
  provider,
  safeAddress,
  digest,
  signature,
  label,
}) {
  const contract =
    new ethers.Contract(
      safeAddress,
      SAFE_AUTHORITY_ABI,
      provider,
    );

  try {
    const response =
      await timeout(
        contract.isValidSignature(
          digest,
          signature,
        ),
        10_000,
        label,
      );

    const normalized =
      String(response)
        .toLowerCase();

    return {
      checked: true,

      valid:
        normalized ===
        ERC1271_MAGIC_VALUE,

      response:
        normalized,

      error: null,
    };
  } catch (error) {
    return {
      checked: true,

      valid: false,

      response: null,

      error:
        error instanceof Error
          ? error.message
          : `${label}: validación fallida`,
    };
  }
}

function tryRecoverEoaOwner({
  intent,
  signature,
  owners,
  threshold,
}) {
  const byteLength =
    ethers.dataLength(
      signature,
    );

  if (byteLength !== 65) {
    return {
      attempted: false,

      recoveredSigner: null,

      signerIsOwner: false,

      thresholdSatisfied:
        false,

      error: null,
    };
  }

  try {
    const recoveredSigner =
      normalizeAddress(
        ethers.verifyTypedData(
          intent.typedData.domain,
          SAFE_TX_TYPES,
          intent.typedData.message,
          signature,
        ),
      );

    const signerIsOwner =
      ownerListIncludes(
        owners,
        recoveredSigner,
      );

    return {
      attempted: true,

      recoveredSigner,

      signerIsOwner,

      thresholdSatisfied:
        signerIsOwner &&
        Number(threshold) === 1,

      error: null,
    };
  } catch (error) {
    return {
      attempted: true,

      recoveredSigner: null,

      signerIsOwner: false,

      thresholdSatisfied:
        false,

      error:
        error instanceof Error
          ? error.message
          : "No se pudo recuperar EOA",
    };
  }
}

export function inspectSafeSignatureShape(
  signature,
) {
  const byteLength =
    assertHexSignature(
      signature,
    );

  let kind;

  if (byteLength === 65) {
    kind =
      "single-static-signature";
  } else if (
    byteLength % 65 === 0
  ) {
    kind =
      "packed-static-signatures";
  } else {
    kind =
      "dynamic-or-contract-signature";
  }

  return {
    byteLength,

    kind,

    isSingle65Byte:
      byteLength === 65,

    canContainDynamicSafeSignature:
      byteLength !== 65,
  };
}

// ============================================================================
// WORLD APP / WORLD CHAIN AUTHORITY VERIFICATION
// ============================================================================
//
// Esta es la comprobación que debe usarse para executedWith === "minikit".
//
// World App devuelve la dirección de su Smart Account (Safe). La firma se
// valida contra esa Safe mediante EIP-1271.
//
// NO asumimos que response.signature sea siempre una ECDSA EOA de 65 bytes.
// ============================================================================

export async function verifyWorldSafeMiniKitAuthorization({
  intent,
  signature,
  reportedAddress = null,
}) {
  const {
    safeAddress,
  } =
    assertSafeTypedData({
      intent,

      safeAddress:
        intent?.safeAddress,
    });

  const signatureShape =
    inspectSafeSignatureShape(
      signature,
    );

  if (
    reportedAddress !== null &&
    reportedAddress !== undefined
  ) {
    if (
      !ethers.isAddress(
        reportedAddress,
      )
    ) {
      throw new Error(
        "MiniKit reportó una dirección inválida",
      );
    }

    if (
      !sameAddress(
        reportedAddress,
        safeAddress,
      )
    ) {
      throw new Error(
        "La dirección reportada por MiniKit no coincide con la Safe que contiene los fondos",
      );
    }
  }

  const worldNetwork =
    getWorldNetwork();

  const worldProvider =
    await getProvider(
      worldNetwork,
    );

  const sourceSafe =
    await readSafeState(
      worldProvider,
      safeAddress,
    );

  if (!sourceSafe.deployed) {
    throw new Error(
      "La World Wallet no está desplegada como Safe en World Chain",
    );
  }

  if (
    !sameOwnerSet(
      sourceSafe.owners,
      intent.safe?.owners,
    )
  ) {
    throw new Error(
      "Los owners actuales de la Safe en World Chain no coinciden con los owners usados para preparar la recuperación",
    );
  }

  if (
    Number(
      sourceSafe.threshold,
    ) !==
    Number(
      intent.safe?.threshold,
    )
  ) {
    throw new Error(
      "El threshold actual de World Chain cambió desde que se preparó la recuperación",
    );
  }

  const digest =
    hashSafeTransactionTypedData(
      intent.typedData,
    );

  const eip1271 =
    await callEip1271({
      provider:
        worldProvider,

      safeAddress,

      digest,

      signature,

      label:
        "World Safe EIP-1271",
    });

  if (!eip1271.valid) {
    throw new Error(
      eip1271.error
        ? `World App entregó una firma que la Safe de World Chain no acepta: ${eip1271.error}`
        : "World App entregó una firma que la Safe de World Chain no acepta por EIP-1271",
    );
  }

  const eoa =
    tryRecoverEoaOwner({
      intent,

      signature,

      owners:
        sourceSafe.owners,

      threshold:
        sourceSafe.threshold,
    });

  return {
    valid: true,

    verificationMethod:
      "world-safe-eip1271",

    safeAddress,

    digest,

    reportedAddress:
      reportedAddress
        ? normalizeAddress(
            reportedAddress,
          )
        : null,

    reportedAddressMatchesSafe:
      Boolean(
        reportedAddress &&
        sameAddress(
          reportedAddress,
          safeAddress,
        ),
      ),

    signatureShape,

    sourceSafeEip1271Valid:
      true,

    sourceSafe,

    recoveredSigner:
      eoa.recoveredSigner,

    signerIsOwner:
      eoa.signerIsOwner,

    singleEoaSignatureSatisfiesThreshold:
      eoa.thresholdSatisfied,

    eoaRecoveryAttempted:
      eoa.attempted,

    eoaRecoveryError:
      eoa.error,

    /*
     * Una firma EIP-1271 válida en World Chain prueba autoridad en la Safe
     * origen, pero NO prueba todavía que sea portable a Ethereum.
     *
     * La prueba definitiva es target Safe checkSignatures().
     */
    targetValidationRequired:
      true,

    portableEoaOwnerProven:
      eoa.thresholdSatisfied,

    classification:
      eoa.thresholdSatisfied
        ? "source-safe-eip1271-and-eoa-owner"
        : "source-safe-eip1271",
  };
}

// ============================================================================
// TARGET SAFE HASH + SIGNATURE PREFLIGHT
// ============================================================================
//
// Se ejecuta DESPUÉS de que la Safe objetivo exista.
//
// Compara:
//   local EIP-712 hash
//   == Safe.getTransactionHash()
//
// Luego valida las mismas signature bytes mediante checkSignatures().
//
// Para contract signatures, Safe necesita el preimage completo
// encodeTransactionData(), no "0x".
// ============================================================================

export async function verifyTargetSafeExecutionAuthorization({
  provider,
  safeAddress,
  typedData,
  signature,
  executor = ethers.ZeroAddress,
}) {
  if (!provider) {
    throw new Error(
      "Provider objetivo requerido",
    );
  }

  assertHexSignature(
    signature,
  );

  const intentLike = {
    safeAddress,

    chainId:
      typedData?.chainId,

    typedData,
  };

  const {
    message,
  } =
    assertSafeTypedData({
      intent:
        intentLike,

      safeAddress,
    });

  const targetSafe =
    await readSafeState(
      provider,
      safeAddress,
    );

  if (!targetSafe.deployed) {
    throw new Error(
      "La Safe objetivo todavía no está desplegada",
    );
  }

  const contract =
    new ethers.Contract(
      safeAddress,
      SAFE_AUTHORITY_ABI,
      provider,
    );

  const args = [
    normalizeAddress(
      message.to,
    ),

    normalizeUint(
      message.value,
      "Safe value",
    ),

    message.data,

    Number(
      message.operation,
    ),

    normalizeUint(
      message.safeTxGas,
      "safeTxGas",
    ),

    normalizeUint(
      message.baseGas,
      "baseGas",
    ),

    normalizeUint(
      message.gasPrice,
      "gasPrice",
    ),

    normalizeAddress(
      message.gasToken,
    ),

    normalizeAddress(
      message.refundReceiver,
    ),

    normalizeUint(
      message.nonce,
      "Safe nonce",
    ),
  ];

  const [
    onChainHash,
    transactionData,
  ] = await Promise.all([
    timeout(
      contract.getTransactionHash(
        ...args,
      ),
      10_000,
      "Safe getTransactionHash",
    ),

    timeout(
      contract.encodeTransactionData(
        ...args,
      ),
      10_000,
      "Safe encodeTransactionData",
    ),
  ]);

  const localHash =
    hashSafeTransactionTypedData(
      typedData,
    );

  if (
    String(onChainHash)
      .toLowerCase() !==
    String(localHash)
      .toLowerCase()
  ) {
    throw new Error(
      "El hash local no coincide con Safe.getTransactionHash(). Operación bloqueada.",
    );
  }

  let validationMethod = null;

  /*
   * Safe 1.4.x expone:
   *   checkSignatures(bytes32,bytes,bytes)
   *
   * Algunas versiones/interfaces más nuevas pueden exponer variante
   * con executor. Probamos la ruta clásica primero.
   */
  try {
    await timeout(
      contract[
        "checkSignatures(bytes32,bytes,bytes)"
      ].staticCall(
        onChainHash,
        transactionData,
        signature,
      ),
      10_000,
      "Target Safe checkSignatures",
    );

    validationMethod =
      "checkSignatures(bytes32,bytes,bytes)";
  } catch (classicError) {
    try {
      await timeout(
        contract[
          "checkSignatures(address,bytes32,bytes)"
        ].staticCall(
          normalizeAddress(
            executor,
          ),
          onChainHash,
          signature,
        ),
        10_000,
        "Target Safe checkSignatures executor",
      );

      validationMethod =
        "checkSignatures(address,bytes32,bytes)";
    } catch (executorError) {
      const first =
        classicError instanceof Error
          ? classicError.message
          : "classic checkSignatures falló";

      const second =
        executorError instanceof Error
          ? executorError.message
          : "executor checkSignatures falló";

      throw new Error(
        `La Safe objetivo rechazó la firma. Classic: ${first}. Executor: ${second}`,
      );
    }
  }

  return {
    valid: true,

    safeAddress:
      normalizeAddress(
        safeAddress,
      ),

    localHash,

    onChainHash:

      String(onChainHash),

    transactionData,

    signatureShape:
      inspectSafeSignatureShape(
        signature,
      ),

    validationMethod,

    targetSafe,
  };
}

// ============================================================================
// PORTABILITY REPORT
// ============================================================================

export async function buildWorldToTargetSignatureReport({
  intent,
  signature,
  reportedAddress,
  targetProvider = null,
  executor = ethers.ZeroAddress,
}) {
  const source =
    await verifyWorldSafeMiniKitAuthorization({
      intent,

      signature,

      reportedAddress,
    });

  if (!targetProvider) {
    return {
      source,

      target: {
        checked: false,

        valid: null,

        reason:
          "La Safe objetivo aún no fue suministrada/desplegada para preflight.",
      },

      portable:
        source
          .portableEoaOwnerProven,

      finalExecutionAuthorizationProven:
        false,
    };
  }

  try {
    const target =
      await verifyTargetSafeExecutionAuthorization({
        provider:
          targetProvider,

        safeAddress:
          intent.safeAddress,

        typedData:
          intent.typedData,

        signature,

        executor,
      });

    return {
      source,

      target: {
        checked: true,

        ...target,
      },

      portable: true,

      finalExecutionAuthorizationProven:
        true,
    };
  } catch (error) {
    return {
      source,

      target: {
        checked: true,

        valid: false,

        error:
          error instanceof Error
            ? error.message
            : "La firma no fue aceptada por la Safe objetivo",
      },

      portable: false,

      finalExecutionAuthorizationProven:
        false,
    };
  }
}
