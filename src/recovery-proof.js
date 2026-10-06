import { ethers } from "ethers";

import {
  getProvider,
  normalizeAddress,
} from "./blockchain.js";

import {
  ERC20_ABI,
  NETWORKS,
  SAFE_INTROSPECTION_ABI,
  WORLD_CHAIN_ID,
} from "./config.js";

export const RECOVERY_PRIMARY_TYPE = "RecoveryAuthorization";
export const RECOVERY_PURPOSE =
  "RC Wallet cross-chain recovery compatibility test";

const RECOVERY_PROOF_FORMAT = "rc-wallet-recovery-proof";
const RECOVERY_PROOF_VERSION = 2;
const RECOVERY_PROOF_LIFETIME_SECONDS = 15 * 60;
const ERC1271_MAGIC_VALUE = "0x1626ba7e";

const EIP1271_ABI = Object.freeze([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);

const ERC20_INTERFACE = new ethers.Interface(ERC20_ABI);

export const RECOVERY_TYPES = Object.freeze({
  RecoveryAuthorization: [
    { name: "wallet", type: "address" },
    { name: "targetChainId", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "expiresAt", type: "uint256" },
    { name: "purpose", type: "string" },
  ],
});

export const RECOVERY_EIP712_DOMAIN = Object.freeze([
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
]);

export const SAFE_TX_TYPES = Object.freeze({
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
});

export const SAFE_TX_EIP712_DOMAIN = Object.freeze([
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
]);

function timeout(promise, milliseconds, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label}: tiempo de espera agotado`)),
      milliseconds,
    );
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
    return normalizeAddress(left) === normalizeAddress(right);
  } catch {
    return false;
  }
}

function randomBytes32() {
  const bytes = new Uint8Array(32);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return ethers.hexlify(bytes);
  }

  return ethers.hexlify(
    ethers.randomBytes(32),
  );
}

function isBytes32(value) {
  return (
    typeof value === "string" &&
    /^0x[a-fA-F0-9]{64}$/.test(value)
  );
}

function isHexSignature(value) {
  return (
    typeof value === "string" &&
    ethers.isHexString(value) &&
    value.length > 2 &&
    value.length % 2 === 0
  );
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

function findNetwork(chainId) {
  return (
    NETWORKS.find(
      (network) =>
        network.chainId === chainId,
    ) ?? null
  );
}

function normalizeUint(value, label) {
  let parsed;

  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(
      `${label} no es un uint256 válido`,
    );
  }

  if (parsed < 0n) {
    throw new Error(
      `${label} no puede ser negativo`,
    );
  }

  return parsed;
}

function normalizePositiveUint(value, label) {
  const parsed =
    normalizeUint(
      value,
      label,
    );

  if (parsed <= 0n) {
    throw new Error(
      `${label} debe ser mayor que cero`,
    );
  }

  return parsed;
}

function normalizeOperation(value) {
  const operation =
    Number(value);

  if (
    operation !== 0 &&
    operation !== 1
  ) {
    throw new Error(
      "Safe operation debe ser CALL (0) o DELEGATECALL (1)",
    );
  }

  return operation;
}

function normalizeHexData(value, label) {
  const data =
    value ?? "0x";

  if (
    typeof data !== "string" ||
    !ethers.isHexString(data)
  ) {
    throw new Error(
      `${label} debe contener bytes hexadecimales`,
    );
  }

  return data;
}

function ownerListIncludes(
  owners,
  candidate,
) {
  if (!candidate) {
    return false;
  }

  return (
    owners ?? []
  ).some(
    (owner) =>
      sameAddress(
        owner,
        candidate,
      ),
  );
}

function sanitizeOwners(owners) {
  if (!Array.isArray(owners)) {
    return [];
  }

  const unique =
    new Map();

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

// ============================================================================
// RC LINK
// ============================================================================

export function createRecoveryTypedData(
  walletAddress,
  targetChainId,
) {
  const wallet =
    normalizeAddress(
      walletAddress,
    );

  const chainId =
    normalizeChainId(
      targetChainId,
    );

  const network =
    findNetwork(chainId);

  if (
    !network ||
    chainId === WORLD_CHAIN_ID
  ) {
    throw new Error(
      "Selecciona una red externa soportada",
    );
  }

  const expiresAt =
    Math.floor(
      Date.now() / 1000,
    ) +
    RECOVERY_PROOF_LIFETIME_SECONDS;

  return {
    /*
     * IMPORTANTE:
     *
     * MiniKit 2.x utiliza este chainId superior para el comando.
     * No depender únicamente de domain.chainId.
     */
    chainId:
      WORLD_CHAIN_ID,

    primaryType:
      RECOVERY_PRIMARY_TYPE,

    domain: {
      name:
        "RC Wallet Recovery",

      version:
        "1",

      chainId:
        WORLD_CHAIN_ID,
    },

    types: {
      EIP712Domain:
        RECOVERY_EIP712_DOMAIN,

      ...RECOVERY_TYPES,
    },

    message: {
      wallet,

      targetChainId:
        chainId,

      nonce:
        randomBytes32(),

      expiresAt,

      purpose:
        RECOVERY_PURPOSE,
    },
  };
}

export function createRecoveryProofPackage({
  typedData,
  signature,
  signerAddress,
}) {
  if (
    !typedData ||
    typedData.primaryType !==
      RECOVERY_PRIMARY_TYPE
  ) {
    throw new Error(
      "Typed data RC Link inválida",
    );
  }

  if (
    !isHexSignature(signature)
  ) {
    throw new Error(
      "World App no entregó una firma hexadecimal válida",
    );
  }

  return {
    format:
      RECOVERY_PROOF_FORMAT,

    version:
      RECOVERY_PROOF_VERSION,

    createdAt:
      new Date().toISOString(),

    signerAddress:
      normalizeAddress(
        signerAddress,
      ),

    signature,

    typedData,
  };
}

// ============================================================================
// SAFE TRANSACTION
// ============================================================================

export function createSafeTransactionTypedData({
  safeAddress,
  chainId,
  to,
  value = 0n,
  data = "0x",
  operation = 0,
  safeTxGas = 0n,
  baseGas = 0n,
  gasPrice = 0n,
  gasToken = ethers.ZeroAddress,
  refundReceiver = ethers.ZeroAddress,
  nonce,
}) {
  const safe =
    normalizeAddress(
      safeAddress,
    );

  const target =
    normalizeAddress(
      to,
    );

  const targetChainId =
    normalizeChainId(
      chainId,
    );

  const network =
    findNetwork(
      targetChainId,
    );

  if (!network) {
    throw new Error(
      "La blockchain de SafeTx no está soportada",
    );
  }

  const normalizedNonce =
    normalizeUint(
      nonce,
      "Safe nonce",
    );

  const normalizedValue =
    normalizeUint(
      value,
      "Safe value",
    );

  const normalizedSafeTxGas =
    normalizeUint(
      safeTxGas,
      "safeTxGas",
    );

  const normalizedBaseGas =
    normalizeUint(
      baseGas,
      "baseGas",
    );

  const normalizedGasPrice =
    normalizeUint(
      gasPrice,
      "gasPrice",
    );

  const normalizedData =
    normalizeHexData(
      data,
      "Safe calldata",
    );

  return {
    /*
     * CRÍTICO:
     *
     * MiniKit 2.0.3 usa:
     *
     * options.chainId ?? 480
     *
     * Para una SafeTx Ethereum necesitamos explícitamente chainId: 1.
     *
     * NO eliminar este campo.
     */
    chainId:
      targetChainId,

    primaryType:
      "SafeTx",

    domain: {
      chainId:
        targetChainId,

      verifyingContract:
        safe,
    },

    types: {
      EIP712Domain:
        SAFE_TX_EIP712_DOMAIN,

      ...SAFE_TX_TYPES,
    },

    message: {
      to:
        target,

      value:
        normalizedValue.toString(),

      data:
        normalizedData,

      operation:
        normalizeOperation(
          operation,
        ),

      safeTxGas:
        normalizedSafeTxGas.toString(),

      baseGas:
        normalizedBaseGas.toString(),

      gasPrice:
        normalizedGasPrice.toString(),

      gasToken:
        normalizeAddress(
          gasToken,
        ),

      refundReceiver:
        normalizeAddress(
          refundReceiver,
        ),

      nonce:
        normalizedNonce.toString(),
    },
  };
}

// ============================================================================
// SAFE ERC20 TRANSFER
// ============================================================================

export function createSafeErc20TransferTypedData({
  safeAddress,
  chainId,
  tokenAddress,
  recipient,
  amountUnits,
  nonce,
}) {
  const token =
    normalizeAddress(
      tokenAddress,
    );

  const destination =
    normalizeAddress(
      recipient,
    );

  const amount =
    normalizePositiveUint(
      amountUnits,
      "Cantidad ERC-20",
    );

  const data =
    ERC20_INTERFACE
      .encodeFunctionData(
        "transfer",
        [
          destination,
          amount,
        ],
      );

  return createSafeTransactionTypedData({
    safeAddress,

    chainId,

    to:
      token,

    value:
      0n,

    data,

    operation:
      0,

    safeTxGas:
      0n,

    baseGas:
      0n,

    gasPrice:
      0n,

    gasToken:
      ethers.ZeroAddress,

    refundReceiver:
      ethers.ZeroAddress,

    nonce,
  });
}

// ============================================================================
// SAFE NATIVE TRANSFER
// ============================================================================

export function createSafeNativeTransferTypedData({
  safeAddress,
  chainId,
  recipient,
  amountWei,
  nonce,
}) {
  const destination =
    normalizeAddress(
      recipient,
    );

  const amount =
    normalizePositiveUint(
      amountWei,
      "Cantidad nativa",
    );

  return createSafeTransactionTypedData({
    safeAddress,

    chainId,

    to:
      destination,

    value:
      amount,

    data:
      "0x",

    operation:
      0,

    safeTxGas:
      0n,

    baseGas:
      0n,

    gasPrice:
      0n,

    gasToken:
      ethers.ZeroAddress,

    refundReceiver:
      ethers.ZeroAddress,

    nonce,
  });
}

// ============================================================================
// SAFE HASH
// ============================================================================

export function hashSafeTransactionTypedData(
  typedData,
) {
  if (
    typedData?.primaryType !==
    "SafeTx"
  ) {
    throw new Error(
      "El typed data no corresponde a una SafeTx",
    );
  }

  if (
    !typedData.domain ||
    !typedData.message
  ) {
    throw new Error(
      "SafeTx incompleta",
    );
  }

  const topLevelChainId =
    normalizeChainId(
      typedData.chainId,
    );

  const domainChainId =
    normalizeChainId(
      typedData.domain.chainId,
    );

  if (
    topLevelChainId !==
    domainChainId
  ) {
    throw new Error(
      "SafeTx insegura: chainId superior y domain.chainId no coinciden",
    );
  }

  return ethers.TypedDataEncoder.hash(
    typedData.domain,
    SAFE_TX_TYPES,
    typedData.message,
  );
}

// ============================================================================
// SAFE SIGNER RECOVERY
// ============================================================================

export function recoverSafeTransactionSigner({
  typedData,
  signature,
}) {
  if (
    !isHexSignature(signature)
  ) {
    throw new Error(
      "Firma SafeTx inválida",
    );
  }

  if (
    typedData?.primaryType !==
    "SafeTx"
  ) {
    throw new Error(
      "Typed data SafeTx inválida",
    );
  }

  /*
   * También comprueba que los dos chainId coincidan.
   */
  hashSafeTransactionTypedData(
    typedData,
  );

  return normalizeAddress(
    ethers.verifyTypedData(
      typedData.domain,
      SAFE_TX_TYPES,
      typedData.message,
      signature,
    ),
  );
}

// ============================================================================
// SAFE SIGNATURE ANALYSIS
// ============================================================================

export function analyzeSafeTransactionSignature({
  typedData,
  signature,
  owners,
  threshold,
}) {
  const normalizedOwners =
    sanitizeOwners(
      owners,
    );

  const normalizedThreshold =
    Number(
      threshold,
    );

  if (
    !Number.isSafeInteger(
      normalizedThreshold,
    ) ||
    normalizedThreshold <= 0 ||
    normalizedThreshold >
      normalizedOwners.length
  ) {
    throw new Error(
      "Owners/threshold Safe inválidos",
    );
  }

  let recoveredSigner =
    null;

  let recoveryError =
    null;

  try {
    recoveredSigner =
      recoverSafeTransactionSigner({
        typedData,
        signature,
      });
  } catch (error) {
    recoveryError =
      error instanceof Error
        ? error.message
        : "No se pudo recuperar firmante";
  }

  const signerIsOwner =
    Boolean(
      recoveredSigner &&
      ownerListIncludes(
        normalizedOwners,
        recoveredSigner,
      ),
    );

  return {
    digest:
      hashSafeTransactionTypedData(
        typedData,
      ),

    recoveredSigner,

    signerIsOwner,

    threshold:
      normalizedThreshold,

    ownerCount:
      normalizedOwners.length,

    singleSignatureSatisfiesThreshold:
      signerIsOwner &&
      normalizedThreshold === 1,

    executableWithThisSignature:
      signerIsOwner &&
      normalizedThreshold === 1,

    recoveryError,
  };
}

// ============================================================================
// RC LINK VALIDATION
// ============================================================================

function validateRecoveryProofStructure(
  proof,
) {
  if (
    !proof ||
    typeof proof !== "object"
  ) {
    throw new Error(
      "El paquete RC Link no es válido",
    );
  }

  if (
    proof.format !==
    RECOVERY_PROOF_FORMAT
  ) {
    throw new Error(
      "Formato RC Link no reconocido",
    );
  }

  /*
   * Compatibilidad con paquetes versión 1 existentes.
   */
  if (
    proof.version !== 1 &&
    proof.version !==
      RECOVERY_PROOF_VERSION
  ) {
    throw new Error(
      "Versión RC Link no soportada",
    );
  }

  if (
    !proof.typedData ||
    !proof.signature ||
    !proof.signerAddress
  ) {
    throw new Error(
      "El paquete RC Link está incompleto",
    );
  }

  if (
    !isHexSignature(
      proof.signature,
    )
  ) {
    throw new Error(
      "La firma RC Link no es hexadecimal válida",
    );
  }

  const typedData =
    proof.typedData;

  const {
    primaryType,
    domain,
    message,
  } = typedData;

  if (
    primaryType !==
    RECOVERY_PRIMARY_TYPE
  ) {
    throw new Error(
      "primaryType RC Link incorrecto",
    );
  }

  if (
    !domain ||
    !message
  ) {
    throw new Error(
      "RC Link no contiene domain/message",
    );
  }

  /*
   * Versiones antiguas de RC Link no tenían chainId superior.
   * En esas pruebas permitimos fallback 480 por compatibilidad.
   */
  const commandChainId =
    typedData.chainId === undefined
      ? WORLD_CHAIN_ID
      : normalizeChainId(
          typedData.chainId,
        );

  if (
    commandChainId !==
      WORLD_CHAIN_ID ||
    domain.name !==
      "RC Wallet Recovery" ||
    String(
      domain.version,
    ) !== "1" ||
    Number(
      domain.chainId,
    ) !== WORLD_CHAIN_ID
  ) {
    throw new Error(
      "Dominio/chainId EIP-712 RC Wallet incorrecto",
    );
  }

  if (
    message.purpose !==
    RECOVERY_PURPOSE
  ) {
    throw new Error(
      "Purpose RC Link no reconocido",
    );
  }

  if (
    !isBytes32(
      message.nonce,
    )
  ) {
    throw new Error(
      "Nonce RC Link inválido",
    );
  }

  const wallet =
    normalizeAddress(
      message.wallet,
    );

  if (
    domain.verifyingContract &&
    !sameAddress(
      domain.verifyingContract,
      wallet,
    )
  ) {
    throw new Error(
      "verifyingContract no coincide con la World Wallet",
    );
  }

  const targetChainId =
    normalizeChainId(
      message.targetChainId,
    );

  if (
    targetChainId ===
    WORLD_CHAIN_ID
  ) {
    throw new Error(
      "RC Link debe analizar una red externa",
    );
  }

  const targetNetwork =
    findNetwork(
      targetChainId,
    );

  if (!targetNetwork) {
    throw new Error(
      "La red objetivo no está soportada",
    );
  }

  const expiresAt =
    Number(
      message.expiresAt,
    );

  if (
    !Number.isSafeInteger(
      expiresAt,
    ) ||
    expiresAt <= 0
  ) {
    throw new Error(
      "Fecha de expiración RC Link inválida",
    );
  }

  return {
    typedData,

    domain,

    message,

    wallet,

    reportedSigner:
      normalizeAddress(
        proof.signerAddress,
      ),

    targetChainId,

    targetNetwork,

    expiresAt,
  };
}

// ============================================================================
// SAFE IDENTITY
// ============================================================================

async function inspectSafeIdentity({
  provider,
  address,
  hasCode,
}) {
  const safeAddress =
    normalizeAddress(
      address,
    );

  if (!hasCode) {
    return {
      detected:
        false,

      address:
        safeAddress,

      owners:
        [],

      threshold:
        null,

      version:
        null,

      nonce:
        null,

      singleton:
        null,
    };
  }

  const contract =
    new ethers.Contract(
      safeAddress,
      SAFE_INTROSPECTION_ABI,
      provider,
    );

  const [
    ownersResult,
    thresholdResult,
    versionResult,
    nonceResult,
    singletonResult,
  ] = await Promise.allSettled([
    timeout(
      contract.getOwners(),
      7_000,
      "Safe owners",
    ),

    timeout(
      contract.getThreshold(),
      7_000,
      "Safe threshold",
    ),

    timeout(
      contract.VERSION(),
      7_000,
      "Safe version",
    ),

    timeout(
      contract.nonce(),
      7_000,
      "Safe nonce",
    ),

    timeout(
      contract.masterCopy(),
      7_000,
      "Safe singleton",
    ),
  ]);

  if (
    ownersResult.status !==
      "fulfilled" ||
    thresholdResult.status !==
      "fulfilled"
  ) {
    return {
      detected:
        false,

      address:
        safeAddress,

      owners:
        [],

      threshold:
        null,

      version:
        null,

      nonce:
        null,

      singleton:
        null,
    };
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
    return {
      detected:
        false,

      address:
        safeAddress,

      owners:
        [],

      threshold:
        null,

      version:
        null,

      nonce:
        null,

      singleton:
        null,
    };
  }

  return {
    detected:
      true,

    address:
      safeAddress,

    owners,

    threshold,

    version:
      versionResult.status ===
        "fulfilled"
        ? String(
            versionResult.value,
          )
        : null,

    nonce:
      nonceResult.status ===
        "fulfilled"
        ? nonceResult
            .value
            .toString()
        : null,

    singleton:
      singletonResult.status ===
        "fulfilled" &&
      ethers.isAddress(
        singletonResult.value,
      )
        ? ethers.getAddress(
            singletonResult.value,
          )
        : null,
  };
}

// ============================================================================
// EIP-1271
// ============================================================================

async function checkEip1271({
  provider,
  wallet,
  digest,
  signature,
  hasCode,
  label,
}) {
  if (!hasCode) {
    return {
      checked:
        false,

      valid:
        false,

      response:
        null,

      error:
        null,
    };
  }

  const contract =
    new ethers.Contract(
      wallet,
      EIP1271_ABI,
      provider,
    );

  try {
    const result =
      await timeout(
        contract.isValidSignature(
          digest,
          signature,
        ),
        7_000,
        label,
      );

    const response =
      String(result)
        .toLowerCase();

    return {
      checked:
        true,

      valid:
        response ===
        ERC1271_MAGIC_VALUE,

      response,

      error:
        null,
    };
  } catch (error) {
    return {
      checked:
        true,

      valid:
        false,

      response:
        null,

      error:
        error instanceof Error
          ? error.message
          : `${label}: validación fallida`,
    };
  }
}

// ============================================================================
// ANALYZE RC LINK
// ============================================================================

export async function analyzeRecoveryProof(
  packageInput,
) {
  let proof;

  try {
    proof =
      typeof packageInput ===
        "string"
        ? JSON.parse(
            packageInput,
          )
        : packageInput;
  } catch {
    throw new Error(
      "El paquete RC Link no contiene JSON válido",
    );
  }

  const {
    domain,
    message,
    wallet,
    reportedSigner,
    targetChainId,
    targetNetwork,
    expiresAt,
  } =
    validateRecoveryProofStructure(
      proof,
    );

  const now =
    Math.floor(
      Date.now() / 1000,
    );

  const expired =
    expiresAt < now;

  const digest =
    ethers.TypedDataEncoder.hash(
      domain,
      RECOVERY_TYPES,
      message,
    );

  /*
   * Intentamos recuperar la EOA criptográfica de la firma.
   *
   * NO asumimos que deba ser igual a la Safe.
   */
  let recoveredEoa =
    null;

  try {
    recoveredEoa =
      normalizeAddress(
        ethers.verifyTypedData(
          domain,
          RECOVERY_TYPES,
          message,
          proof.signature,
        ),
      );
  } catch {
    recoveredEoa =
      null;
  }

  const reportedSignerMatchesWallet =
    sameAddress(
      reportedSigner,
      wallet,
    );

  const reportedSignerMatchesRecoveredEoa =
    Boolean(
      recoveredEoa &&
      sameAddress(
        reportedSigner,
        recoveredEoa,
      ),
    );

  const eoaSignatureMatches =
    Boolean(
      recoveredEoa &&
      sameAddress(
        recoveredEoa,
        wallet,
      ),
    );

  const worldNetwork =
    findNetwork(
      WORLD_CHAIN_ID,
    );

  if (!worldNetwork) {
    throw new Error(
      "World Chain no está configurada",
    );
  }

  const [
    worldProvider,
    targetProvider,
  ] =
    await Promise.all([
      getProvider(
        worldNetwork,
      ),

      getProvider(
        targetNetwork,
      ),
    ]);

  const [
    worldCode,
    targetCode,
  ] =
    await Promise.all([
      timeout(
        worldProvider.getCode(
          wallet,
        ),
        7_000,
        "World wallet code",
      ),

      timeout(
        targetProvider.getCode(
          wallet,
        ),
        7_000,
        "Target wallet code",
      ),
    ]);

  const worldHasCode =
    Boolean(
      worldCode &&
      worldCode !== "0x",
    );

  const targetHasCode =
    Boolean(
      targetCode &&
      targetCode !== "0x",
    );

  const worldAccountKind =
    worldHasCode
      ? "contract"
      : "eoa-or-undeployed";

  const targetAccountKind =
    targetHasCode
      ? "contract"
      : "undeployed";

  const [
    sourceSafe,
    targetSafe,
  ] =
    await Promise.all([
      inspectSafeIdentity({
        provider:
          worldProvider,

        address:
          wallet,

        hasCode:
          worldHasCode,
      }),

      inspectSafeIdentity({
        provider:
          targetProvider,

        address:
          wallet,

        hasCode:
          targetHasCode,
      }),
    ]);

  const sourceOwnerSignatureMatches =
    Boolean(
      recoveredEoa &&
      sourceSafe.detected &&
      ownerListIncludes(
        sourceSafe.owners,
        recoveredEoa,
      ),
    );

  const reportedSignerIsSourceOwner =
    Boolean(
      sourceSafe.detected &&
      ownerListIncludes(
        sourceSafe.owners,
        reportedSigner,
      ),
    );

  const targetOwnerSignatureMatches =
    Boolean(
      recoveredEoa &&
      targetSafe.detected &&
      ownerListIncludes(
        targetSafe.owners,
        recoveredEoa,
      ),
    );

  const [
    sourceEip1271,
    targetEip1271,
  ] =
    await Promise.all([
      checkEip1271({
        provider:
          worldProvider,

        wallet,

        digest,

        signature:
          proof.signature,

        hasCode:
          worldHasCode,

        label:
          "World Safe EIP-1271",
      }),

      checkEip1271({
        provider:
          targetProvider,

        wallet,

        digest,

        signature:
          proof.signature,

        hasCode:
          targetHasCode,

        label:
          "Target Safe EIP-1271",
      }),
    ]);

  let authorityType =
    "unproven";

  if (
    eoaSignatureMatches &&
    !worldHasCode
  ) {
    authorityType =
      "direct-eoa";
  } else if (
    sourceOwnerSignatureMatches
  ) {
    authorityType =
      "safe-owner-eoa";
  } else if (
    sourceEip1271.valid
  ) {
    authorityType =
      "safe-contract-signature";
  }

  const thresholdSatisfiedBySingleRecoveredOwner =
    Boolean(
      sourceOwnerSignatureMatches &&
      sourceSafe.threshold === 1,
    );

  const canAttemptTargetSafeTxSignature =
    Boolean(
      !expired &&
      sourceSafe.detected &&
      sourceOwnerSignatureMatches &&
      sourceSafe.threshold === 1,
    );

  let classification;
  let nextStep;

  if (expired) {
    classification =
      "expired";

    nextStep =
      "Genera una prueba nueva dentro de World App.";
  } else if (
    eoaSignatureMatches &&
    !worldHasCode
  ) {
    classification =
      "portable-eoa-signature";

    nextStep =
      "La firma recupera directamente la dirección objetivo como EOA. La siguiente fase es firmar una operación específica y simularla.";
  } else if (
    targetEip1271.valid ||
    (
      targetSafe.detected &&
      targetOwnerSignatureMatches
    )
  ) {
    classification =
      "deployed-smart-account-signature";

    nextStep =
      "La smart account objetivo reconoce o comparte una autoridad owner verificable. Antes de mover fondos debe firmarse y simularse la SafeTx exacta.";
  } else if (
    sourceSafe.detected &&
    !targetHasCode
  ) {
    classification =
      "counterfactual-smart-account";

    if (
      sourceOwnerSignatureMatches &&
      sourceSafe.threshold === 1
    ) {
      nextStep =
        "CRÍTICO: MiniKit produjo una firma recuperable de un owner real y el threshold es 1. El siguiente paso es solicitar la SafeTx EXACTA con chainId de la red objetivo y verificar la firma antes de desplegar.";
    } else if (
      sourceOwnerSignatureMatches
    ) {
      nextStep =
        `MiniKit firma como un owner real, pero la Safe requiere ${sourceSafe.threshold} firmas. Se necesitan las demás autorizaciones antes de ejecutar.`;
    } else if (
      sourceEip1271.valid
    ) {
      nextStep =
        "La Safe de World Chain acepta la firma mediante EIP-1271, pero no se demostró una EOA owner portable. Debe analizarse el esquema de firma o módulo.";
    } else {
      nextStep =
        "La Safe existe en World Chain y no está desplegada en la red objetivo, pero esta prueba todavía no demuestra una firma owner ejecutable.";
    }
  } else {
    classification =
      "signature-not-portable";

    nextStep =
      "La firma actual no demuestra autoridad ejecutable suficiente sobre la cuenta objetivo. No se debe desplegar ni mover fondos.";
  }

  const executionReadiness = {
    expired,

    sourceSafeDetected:
      sourceSafe.detected,

    sourceOwners:
      sourceSafe.owners,

    sourceThreshold:
      sourceSafe.threshold,

    sourceSafeNonce:
      sourceSafe.nonce,

    recoveredEoa,

    reportedSigner,

    reportedSignerMatchesWallet,

    reportedSignerMatchesRecoveredEoa,

    reportedSignerIsSourceOwner,

    sourceOwnerSignatureMatches,

    targetOwnerSignatureMatches,

    sourceEip1271Valid:
      sourceEip1271.valid,

    targetEip1271Valid:
      targetEip1271.valid,

    thresholdSatisfiedBySingleRecoveredOwner,

    canAttemptTargetSafeTxSignature,

    deterministicTargetDeploymentVerified:
      false,

    exactTargetSafeTxSigned:
      false,

    readyToMoveFunds:
      false,

    reason:
      canAttemptTargetSafeTxSignature
        ? "Autoridad owner candidata verificada. Falta firmar la SafeTx exacta y demostrar el despliegue determinístico objetivo."
        : "Todavía no existe evidencia suficiente para ejecutar una recuperación.",
  };

  return {
    classification,

    nextStep,

    wallet,

    targetNetwork:
      targetNetwork.name,

    targetChainId,

    digest,

    expired,

    recoveredEoa,

    eoaSignatureMatches,

    worldAccountKind,

    targetAccountKind,

    eip1271Valid:
      targetEip1271.valid,

    eip1271Error:
      targetEip1271.error,

    reportedSigner,

    reportedSignerMatchesWallet,

    reportedSignerMatchesRecoveredEoa,

    authorityType,

    sourceSafe,

    targetSafe,

    sourceOwnerSignatureMatches,

    reportedSignerIsSourceOwner,

    targetOwnerSignatureMatches,

    sourceEip1271Valid:
      sourceEip1271.valid,

    sourceEip1271Error:
      sourceEip1271.error,

    sourceEip1271Response:
      sourceEip1271.response,

    targetEip1271Valid:
      targetEip1271.valid,

    targetEip1271Error:
      targetEip1271.error,

    targetEip1271Response:
      targetEip1271.response,

    counterfactualStatus:
      sourceSafe.detected &&
      !targetHasCode
        ? "candidate"
        : null,

    executionReadiness,
  };
}
