import { ethers } from "ethers";

import {
  getProvider,
  normalizeAddress,
  switchExternalNetwork,
} from "./blockchain.js";

import {
  ERC20_ABI,
  NETWORKS,
  WORLD_CHAIN_ID,
} from "./config.js";

import {
  analyzeSafeTransactionSignature,
  createSafeErc20TransferTypedData,
  createSafeNativeTransferTypedData,
  hashSafeTransactionTypedData,
} from "./recovery-proof.js";

// ============================================================================
// RC WALLET — SAFE RECOVERY EXECUTION ENGINE
// ============================================================================
//
// ARQUITECTURA:
//
// World App / MiniKit
//      │
//      │ firma SafeTx exacta
//      ▼
// owner EOA verificado
//      │
//      ▼
// Safe
//      │
//      │ execTransaction()
//      ▼
// WLD / ERC20 / activo nativo
//
// La wallet externa NO necesita ser owner.
// Solo funciona como:
//
// - pagador de gas;
// - transmisor de createProxyWithNonce;
// - transmisor de execTransaction.
//
// REGLAS ABSOLUTAS:
//
// - Nunca private keys.
// - Nunca seed phrases.
// - Nunca adivinar CREATE2.
// - Nunca desplegar si predictedAddress !== addressWithFunds.
// - Nunca ejecutar si Safe.getTransactionHash !== hash firmado.
// - Nunca ejecutar si checkSignatures falla.
// - Nunca ejecutar si nonce cambió.
// - Nunca ejecutar si owners/threshold cambiaron.
// - Nunca ejecutar sin simulación previa.
//
// ============================================================================

const SAFE_RECOVERY_INTENT_FORMAT =
  "rc-wallet-safe-recovery-intent";

const SAFE_RECOVERY_INTENT_VERSION = 1;

const SAFE_RECOVERY_INTENT_LIFETIME_MS =
  10 * 60 * 1000;

const BPS_DENOMINATOR = 10_000n;

const GAS_LIMIT_BUFFER_BPS = 12_000n;

const GAS_PRICE_BUFFER_BPS = 12_000n;

const EXECUTION_GAS_RESERVE = 550_000n;

const SAFE_OPERATION_CALL = 0;

const ERC20_INTERFACE =
  new ethers.Interface(ERC20_ABI);

// ============================================================================
// SAFE FACTORY
// ============================================================================

const SAFE_PROXY_FACTORY_ABI =
  Object.freeze([
    "function proxyCreationCode() view returns (bytes)",

    "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",

    "function createProxyWithNonceL2(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
  ]);

// ============================================================================
// SAFE EXECUTION
// ============================================================================

const SAFE_EXECUTION_ABI =
  Object.freeze([
    "function VERSION() view returns (string)",

    "function getOwners() view returns (address[])",

    "function getThreshold() view returns (uint256)",

    "function nonce() view returns (uint256)",

    "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",

    "function checkSignatures(address executor,bytes32 dataHash,bytes signatures) view",

    "function checkSignatures(bytes32 dataHash,bytes data,bytes signatures) view",

    "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) payable returns (bool success)",
  ]);

const SAFE_REPLAYABLE_FACTORY_METHODS =
  new Set([
    "createProxyWithNonce",
    "createProxyWithNonceL2",
  ]);

// ============================================================================
// GENERIC HELPERS
// ============================================================================

function timeout(
  promise,
  milliseconds,
  label,
) {
  let timeoutId;

  const timeoutPromise =
    new Promise(
      (_, reject) => {
        timeoutId =
          setTimeout(
            () => {
              reject(
                new Error(
                  `${label}: tiempo de espera agotado`,
                ),
              );
            },
            milliseconds,
          );
      },
    );

  return Promise.race([
    promise,
    timeoutPromise,
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function sameAddress(
  left,
  right,
) {
  try {
    return (
      normalizeAddress(left) ===
      normalizeAddress(right)
    );
  } catch {
    return false;
  }
}

function normalizeChainId(
  value,
) {
  const chainId =
    Number(value);

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

function findNetwork(
  chainId,
) {
  return (
    NETWORKS.find(
      (network) =>
        network.chainId ===
        chainId,
    ) ?? null
  );
}

function normalizeUint(
  value,
  label,
) {
  let parsed;

  try {
    parsed =
      BigInt(value);
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

function normalizePositiveUint(
  value,
  label,
) {
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

function applyBuffer(
  value,
  bps,
) {
  return (
    value * bps +
    BPS_DENOMINATOR -
    1n
  ) / BPS_DENOMINATOR;
}

function getBufferedGasPrice(
  feeData,
) {
  const raw =
    feeData.maxFeePerGas ??
    feeData.gasPrice;

  if (
    !raw ||
    raw <= 0n
  ) {
    throw new Error(
      "La red no devolvió un precio de gas válido",
    );
  }

  return applyBuffer(
    BigInt(raw),
    GAS_PRICE_BUFFER_BPS,
  );
}

function sanitizeOwners(
  owners,
) {
  if (!Array.isArray(owners)) {
    return [];
  }

  const unique =
    new Map();

  for (const owner of owners) {
    if (
      !ethers.isAddress(owner)
    ) {
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

function sameOwnerSet(
  left,
  right,
) {
  const first =
    sanitizeOwners(left)
      .map(
        (value) =>
          value.toLowerCase(),
      )
      .sort();

  const second =
    sanitizeOwners(right)
      .map(
        (value) =>
          value.toLowerCase(),
      )
      .sort();

  return (
    JSON.stringify(first) ===
    JSON.stringify(second)
  );
}

function normalizeHumanAmount(
  amount,
  decimals,
) {
  const normalized =
    String(amount ?? "")
      .trim()
      .replace(",", ".");

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Cantidad inválida",
    );
  }

  const units =
    ethers.parseUnits(
      normalized,
      decimals,
    );

  if (units <= 0n) {
    throw new Error(
      "La cantidad debe ser mayor que cero",
    );
  }

  return {
    human:
      normalized,

    units,
  };
}

function uint256ToBytes32(
  value,
) {
  return ethers.zeroPadValue(
    ethers.toBeHex(
      BigInt(value),
    ),
    32,
  );
}

// ============================================================================
// CREATE2
// ============================================================================

function computeReplayableSafeAddress({
  factory,
  singleton,
  initializer,
  saltNonce,
  proxyCreationCode,
}) {
  if (
    !ethers.isHexString(
      initializer,
    )
  ) {
    throw new Error(
      "Initializer Safe inválido",
    );
  }

  if (
    !ethers.isHexString(
      proxyCreationCode,
    )
  ) {
    throw new Error(
      "proxyCreationCode Safe inválido",
    );
  }

  const deploymentCode =
    ethers.concat([
      proxyCreationCode,

      ethers.AbiCoder
        .defaultAbiCoder()
        .encode(
          ["address"],
          [
            normalizeAddress(
              singleton,
            ),
          ],
        ),
    ]);

  const salt =
    ethers.keccak256(
      ethers.concat([
        ethers.keccak256(
          initializer,
        ),

        uint256ToBytes32(
          saltNonce,
        ),
      ]),
    );

  return ethers.getCreate2Address(
    normalizeAddress(
      factory,
    ),

    salt,

    ethers.keccak256(
      deploymentCode,
    ),
  );
}

// ============================================================================
// ASSET VALIDATION
// ============================================================================

function assertExternalAsset(
  asset,
) {
  if (!asset) {
    throw new Error(
      "Selecciona un activo antes de preparar la recuperación",
    );
  }

  if (
    Number(asset.chainId) ===
    WORLD_CHAIN_ID
  ) {
    throw new Error(
      "Este módulo es únicamente para redes externas. World Chain usa MiniKit directamente.",
    );
  }

  const chainId =
    normalizeChainId(
      asset.chainId,
    );

  const network =
    findNetwork(chainId);

  if (!network) {
    throw new Error(
      "La red del activo no está soportada",
    );
  }

  if (!asset.network) {
    throw new Error(
      "El activo no contiene configuración de red",
    );
  }

  return {
    chainId,
    network,
  };
}

function getCounterfactualMirror(
  asset,
) {
  const mirror =
    asset?.accountState
      ?.counterfactualSafe;

  if (!mirror?.detected) {
    return null;
  }

  return mirror;
}

// ============================================================================
// LIVE SAFE
// ============================================================================

async function readLiveSafeState(
  provider,
  safeAddress,
) {
  const address =
    normalizeAddress(
      safeAddress,
    );

  const code =
    await timeout(
      provider.getCode(
        address,
      ),
      8_000,
      "Safe bytecode",
    );

  if (
    !code ||
    code === "0x"
  ) {
    return {
      deployed:
        false,

      address,

      codeHash:
        null,

      version:
        null,

      owners:
        [],

      threshold:
        null,

      nonce:
        null,
    };
  }

  const contract =
    new ethers.Contract(
      address,
      SAFE_EXECUTION_ABI,
      provider,
    );

  const [
    ownersResult,
    thresholdResult,
    nonceResult,
    versionResult,
  ] =
    await Promise.allSettled([
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
        contract.nonce(),
        8_000,
        "Safe nonce",
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
      "fulfilled" ||
    nonceResult.status !==
      "fulfilled"
  ) {
    throw new Error(
      "La dirección tiene bytecode pero no responde como una Safe ejecutable",
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
      "La Safe devolvió owners/threshold inválidos",
    );
  }

  return {
    deployed:
      true,

    address,

    codeHash:
      ethers.keccak256(
        code,
      ),

    version:
      versionResult.status ===
        "fulfilled"
        ? String(
            versionResult.value,
          )
        : null,

    owners,

    threshold,

    nonce:
      nonceResult.value
        .toString(),
  };
}

// ============================================================================
// LIVE BALANCE
// ============================================================================

async function readCurrentAssetBalance(
  provider,
  asset,
  holder,
) {
  const owner =
    normalizeAddress(
      holder,
    );

  if (asset.isNative) {
    return provider.getBalance(
      owner,
    );
  }

  const token =
    normalizeAddress(
      asset.address,
    );

  const contract =
    new ethers.Contract(
      token,
      ERC20_ABI,
      provider,
    );

  return contract.balanceOf(
    owner,
  );
}

// ============================================================================
// COUNTERFACTUAL SAFE VALIDATION
// ============================================================================

function assertReplayableMirror(
  mirror,
  targetAddress,
) {
  if (!mirror?.detected) {
    throw new Error(
      "No se encontró una Safe original verificable en World Chain",
    );
  }

  if (
    !mirror.recoveryReady ||
    !mirror.deployment?.ready
  ) {
    throw new Error(
      mirror.reason ??
        "La Safe original todavía no tiene reconstrucción determinística verificada",
    );
  }

  if (
    !mirror.factoryCodeMatches ||
    !mirror.singletonCodeMatches
  ) {
    throw new Error(
      "Factory/singleton de la red objetivo no coinciden con World Chain",
    );
  }

  const deployment =
    mirror.deployment;

  if (
    !SAFE_REPLAYABLE_FACTORY_METHODS.has(
      deployment.method,
    )
  ) {
    throw new Error(
      `Método Safe no reproducible cross-chain: ${deployment.method}`,
    );
  }

  if (
    !deployment.targetPredictionMatches ||
    !sameAddress(
      deployment.targetPrediction,
      targetAddress,
    )
  ) {
    throw new Error(
      "La dirección CREATE2 reconstruida no coincide exactamente con la dirección que contiene los fondos",
    );
  }

  if (
    !ethers.isHexString(
      deployment.initializer,
    )
  ) {
    throw new Error(
      "Initializer Safe inválido",
    );
  }

  if (
    !ethers.isHexString(
      deployment.proxyCreationCode,
    )
  ) {
    throw new Error(
      "proxyCreationCode Safe inválido",
    );
  }

  normalizeAddress(
    deployment.factory,
  );

  normalizeAddress(
    deployment.singleton,
  );

  normalizeUint(
    deployment.saltNonce,
    "Safe saltNonce",
  );

  return deployment;
}

// ============================================================================
// BUILD EXACT SAFE TX
// ============================================================================

function buildTypedDataForAsset({
  asset,
  targetAddress,
  recipient,
  amountUnits,
  nonce,
}) {
  if (asset.isNative) {
    return createSafeNativeTransferTypedData({
      safeAddress:
        targetAddress,

      chainId:
        asset.chainId,

      recipient,

      amountWei:
        amountUnits,

      nonce,
    });
  }

  return createSafeErc20TransferTypedData({
    safeAddress:
      targetAddress,

    chainId:
      asset.chainId,

    tokenAddress:
      asset.address,

    recipient,

    amountUnits,

    nonce,
  });
}

// ============================================================================
// INTENT VALIDATION
// ============================================================================

function assertIntentShape(
  intent,
) {
  if (
    !intent ||
    intent.format !==
      SAFE_RECOVERY_INTENT_FORMAT ||
    intent.version !==
      SAFE_RECOVERY_INTENT_VERSION
  ) {
    throw new Error(
      "Intento de recuperación Safe inválido",
    );
  }

  if (
    !intent.typedData ||
    !intent.safe ||
    !intent.asset
  ) {
    throw new Error(
      "Intento de recuperación Safe incompleto",
    );
  }

  if (
    Date.now() >
    Number(intent.expiresAt)
  ) {
    throw new Error(
      "La autorización preparada expiró. Genera y firma una nueva SafeTx.",
    );
  }

  const topLevelChainId =
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
    topLevelChainId !==
      domainChainId ||
    topLevelChainId !==
      intentChainId
  ) {
    throw new Error(
      "La SafeTx contiene chainId inconsistentes. Operación bloqueada.",
    );
  }

  if (
    !sameAddress(
      intent.safeAddress,
      intent.typedData
        .domain
        ?.verifyingContract,
    )
  ) {
    throw new Error(
      "La SafeTx no apunta a la misma Safe del intento de recuperación",
    );
  }
}

function assertIntentMatchesRequest({
  intent,
  asset,
  targetAddress,
}) {
  assertIntentShape(
    intent,
  );

  if (
    normalizeChainId(
      asset.chainId,
    ) !==
    normalizeChainId(
      intent.chainId,
    )
  ) {
    throw new Error(
      "La red del activo cambió después de firmar",
    );
  }

  if (
    !sameAddress(
      targetAddress,
      intent.safeAddress,
    )
  ) {
    throw new Error(
      "La dirección con fondos cambió después de firmar",
    );
  }

  if (
    Boolean(asset.isNative) !==
    Boolean(
      intent.asset.isNative,
    )
  ) {
    throw new Error(
      "El tipo de activo cambió después de firmar",
    );
  }

  if (
    !asset.isNative &&
    !sameAddress(
      asset.address,
      intent.asset
        .tokenAddress,
    )
  ) {
    throw new Error(
      "El contrato del token cambió después de firmar",
    );
  }
}

// ============================================================================
// REVALIDATE CREATE2 ON TARGET
// ============================================================================

async function validateDeploymentOnTarget({
  provider,
  targetAddress,
  deployment,
}) {
  const factoryAddress =
    normalizeAddress(
      deployment.factory,
    );

  const singletonAddress =
    normalizeAddress(
      deployment.singleton,
    );

  const [
    factoryCode,
    singletonCode,
  ] =
    await Promise.all([
      timeout(
        provider.getCode(
          factoryAddress,
        ),
        8_000,
        "Safe factory code",
      ),

      timeout(
        provider.getCode(
          singletonAddress,
        ),
        8_000,
        "Safe singleton code",
      ),
    ]);

  if (
    !factoryCode ||
    factoryCode === "0x"
  ) {
    throw new Error(
      "Safe ProxyFactory no existe en la red objetivo",
    );
  }

  if (
    !singletonCode ||
    singletonCode === "0x"
  ) {
    throw new Error(
      "Safe singleton no existe en la red objetivo",
    );
  }

  const factory =
    new ethers.Contract(
      factoryAddress,
      SAFE_PROXY_FACTORY_ABI,
      provider,
    );

  const liveProxyCreationCode =
    await timeout(
      factory.proxyCreationCode(),
      8_000,
      "Safe proxyCreationCode objetivo",
    );

  if (
    !ethers.isHexString(
      liveProxyCreationCode,
    )
  ) {
    throw new Error(
      "La factory devolvió proxyCreationCode inválido",
    );
  }

  const predicted =
    computeReplayableSafeAddress({
      factory:
        factoryAddress,

      singleton:
        singletonAddress,

      initializer:
        deployment.initializer,

      saltNonce:
        deployment.saltNonce,

      proxyCreationCode:
        liveProxyCreationCode,
    });

  if (
    !sameAddress(
      predicted,
      targetAddress,
    )
  ) {
    throw new Error(
      "La factory actual NO reproduce exactamente la dirección que contiene los fondos. Despliegue bloqueado.",
    );
  }

  return {
    factoryAddress,

    singletonAddress,

    proxyCreationCode:
      liveProxyCreationCode,

    predictedAddress:
      predicted,
  };
}

// ============================================================================
// GAS
// ============================================================================

async function ensureGasBalance({
  provider,
  payerAddress,
  estimatedGas,
  feeData,
  reserveGas = 0n,
  symbol,
}) {
  const gasPrice =
    getBufferedGasPrice(
      feeData,
    );

  const gasLimit =
    applyBuffer(
      BigInt(
        estimatedGas,
      ),
      GAS_LIMIT_BUFFER_BPS,
    );

  const required =
    (
      gasLimit +
      reserveGas
    ) *
    gasPrice;

  const available =
    await provider.getBalance(
      payerAddress,
    );

  if (
    available <
    required
  ) {
    throw new Error(
      `El pagador de gas no tiene suficiente ${symbol}. Disponible: ${ethers.formatEther(
        available,
      )}; reserva máxima estimada: ${ethers.formatEther(
        required,
      )}.`,
    );
  }

  return {
    gasLimit,

    gasPrice,

    required,

    available,
  };
}

// ============================================================================
// DEPLOY SAFE MIRROR
// ============================================================================

async function deployMirrorSafeIfNeeded({
  provider,
  signer,
  payerAddress,
  asset,
  targetAddress,
  intent,
  onStatus,
}) {
  const existingCode =
    await timeout(
      provider.getCode(
        targetAddress,
      ),
      8_000,
      "Safe target code",
    );

  if (
    existingCode &&
    existingCode !== "0x"
  ) {
    return {
      deployedNow:
        false,

      transactionHash:
        null,

      receipt:
        null,
    };
  }

  if (
    !intent.deploymentRequired
  ) {
    throw new Error(
      "La Safe desapareció de la red objetivo después de preparar la firma. Operación bloqueada.",
    );
  }

  const mirror =
    asset?.accountState
      ?.counterfactualSafe;

  const deployment =
    assertReplayableMirror(
      mirror,
      targetAddress,
    );

  if (
    !sameAddress(
      deployment.factory,
      intent.deployment
        ?.factory,
    ) ||
    !sameAddress(
      deployment.singleton,
      intent.deployment
        ?.singleton,
    ) ||
    String(
      deployment.saltNonce,
    ) !==
      String(
        intent.deployment
          ?.saltNonce,
      ) ||
    deployment.initializer !==
      intent.deployment
        ?.initializer ||
    deployment.method !==
      intent.deployment
        ?.method
  ) {
    throw new Error(
      "Los parámetros de despliegue cambiaron después de firmar. Operación bloqueada.",
    );
  }

  const validated =
    await validateDeploymentOnTarget({
      provider,

      targetAddress,

      deployment,
    });

  onStatus?.(
    "CREATE2 verificado otra vez. Preparando despliegue de la Safe exacta con la wallet pagadora de gas…",
    "warning",
  );

  const factory =
    new ethers.Contract(
      validated.factoryAddress,
      SAFE_PROXY_FACTORY_ABI,
      signer,
    );

  const saltNonce =
    BigInt(
      deployment.saltNonce,
    );

  let estimatedGas;
  let send;

  if (
    deployment.method ===
    "createProxyWithNonce"
  ) {
    estimatedGas =
      await factory
        .createProxyWithNonce
        .estimateGas(
          deployment.singleton,
          deployment.initializer,
          saltNonce,
        );

    send =
      (overrides) =>
        factory
          .createProxyWithNonce(
            deployment.singleton,
            deployment.initializer,
            saltNonce,
            overrides,
          );
  } else if (
    deployment.method ===
    "createProxyWithNonceL2"
  ) {
    estimatedGas =
      await factory
        .createProxyWithNonceL2
        .estimateGas(
          deployment.singleton,
          deployment.initializer,
          saltNonce,
        );

    send =
      (overrides) =>
        factory
          .createProxyWithNonceL2(
            deployment.singleton,
            deployment.initializer,
            saltNonce,
            overrides,
          );
  } else {
    throw new Error(
      `Método de despliegue Safe no soportado: ${deployment.method}`,
    );
  }

  const feeData =
    await provider.getFeeData();

  const gas =
    await ensureGasBalance({
      provider,

      payerAddress,

      estimatedGas,

      feeData,

      reserveGas:
        EXECUTION_GAS_RESERVE,

      symbol:
        asset.network.symbol,
    });

  const transaction =
    await send({
      gasLimit:
        gas.gasLimit,
    });

  const receipt =
    await transaction.wait(1);

  if (
    !receipt ||
    Number(
      receipt.status,
    ) !== 1
  ) {
    throw new Error(
      "El despliegue Safe no fue confirmado correctamente",
    );
  }

  const deployedCode =
    await timeout(
      provider.getCode(
        targetAddress,
      ),
      8_000,
      "Safe deployed code",
    );

  if (
    !deployedCode ||
    deployedCode === "0x"
  ) {
    throw new Error(
      "La transacción de despliegue fue confirmada, pero no apareció bytecode en la dirección objetivo",
    );
  }

  return {
    deployedNow:
      true,

    transactionHash:
      transaction.hash,

    receipt,
  };
}

// ============================================================================
// BUILD EXEC ARGUMENTS
// ============================================================================

function buildExecArguments(
  typedData,
  signature,
) {
  const message =
    typedData.message;

  return [
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

    signature,
  ];
}

// ============================================================================
// EXACT TRANSFER VALIDATION
// ============================================================================

function assertExactTransferIntent(
  intent,
) {
  const message =
    intent.typedData.message;

  if (
    Number(
      message.operation,
    ) !==
    SAFE_OPERATION_CALL
  ) {
    throw new Error(
      "Solo se permiten Safe CALL normales para recuperación",
    );
  }

  if (
    BigInt(
      message.safeTxGas,
    ) !== 0n ||
    BigInt(
      message.baseGas,
    ) !== 0n ||
    BigInt(
      message.gasPrice,
    ) !== 0n
  ) {
    throw new Error(
      "La SafeTx contiene parámetros de reembolso/gas no permitidos por RC Wallet",
    );
  }

  if (
    !sameAddress(
      message.gasToken,
      ethers.ZeroAddress,
    )
  ) {
    throw new Error(
      "La SafeTx no debe cobrar gas mediante un token",
    );
  }

  if (
    !sameAddress(
      message.refundReceiver,
      ethers.ZeroAddress,
    )
  ) {
    throw new Error(
      "La SafeTx no debe definir refundReceiver",
    );
  }

  const amountUnits =
    BigInt(
      intent.asset
        .amountUnits,
    );

  const recipient =
    normalizeAddress(
      intent.asset.recipient,
    );

  if (
    intent.asset.isNative
  ) {
    if (
      !sameAddress(
        message.to,
        recipient,
      )
    ) {
      throw new Error(
        "El destino nativo de la SafeTx cambió",
      );
    }

    if (
      BigInt(
        message.value,
      ) !==
        amountUnits ||
      message.data !== "0x"
    ) {
      throw new Error(
        "La SafeTx nativa no coincide con el monto firmado",
      );
    }

    return;
  }

  if (
    !sameAddress(
      message.to,
      intent.asset
        .tokenAddress,
    )
  ) {
    throw new Error(
      "El contrato ERC-20 de la SafeTx cambió",
    );
  }

  if (
    BigInt(
      message.value,
    ) !== 0n
  ) {
    throw new Error(
      "Una transferencia ERC-20 Safe no debe enviar valor nativo",
    );
  }

  const expectedData =
    ERC20_INTERFACE
      .encodeFunctionData(
        "transfer",
        [
          recipient,
          amountUnits,
        ],
      );

  if (
    String(
      message.data,
    ).toLowerCase() !==
    expectedData.toLowerCase()
  ) {
    throw new Error(
      "El calldata ERC-20 ya no coincide con destinatario/monto firmados",
    );
  }
}

// ============================================================================
// PREPARE SAFE RECOVERY
// ============================================================================

export async function prepareSafeRecoveryIntent({
  asset,
  targetAddress,
  recipient,
  amount,
}) {
  const {
    chainId,
    network,
  } =
    assertExternalAsset(
      asset,
    );

  const safeAddress =
    normalizeAddress(
      targetAddress,
    );

  const destination =
    normalizeAddress(
      recipient,
    );

  if (
    sameAddress(
      safeAddress,
      destination,
    )
  ) {
    throw new Error(
      "La wallet receptora no puede ser la misma Safe origen",
    );
  }

  const decimals =
    Number(
      asset.decimals,
    );

  if (
    !Number.isInteger(
      decimals,
    ) ||
    decimals < 0 ||
    decimals > 255
  ) {
    throw new Error(
      "Decimales del activo inválidos",
    );
  }

  const normalizedAmount =
    normalizeHumanAmount(
      amount,
      decimals,
    );

  const provider =
    await getProvider(
      network,
    );

  const liveBalance =
    await readCurrentAssetBalance(
      provider,
      asset,
      safeAddress,
    );

  if (
    normalizedAmount.units >
    liveBalance
  ) {
    throw new Error(
      "La cantidad supera el balance actual de la Safe",
    );
  }

  const liveSafe =
    await readLiveSafeState(
      provider,
      safeAddress,
    );

  let owners;
  let threshold;
  let nonce;
  let deploymentRequired;
  let deployment = null;

  if (liveSafe.deployed) {
    owners =
      liveSafe.owners;

    threshold =
      liveSafe.threshold;

    nonce =
      liveSafe.nonce;

    deploymentRequired =
      false;
  } else {
    const mirror =
      getCounterfactualMirror(
        asset,
      );

    deployment =
      assertReplayableMirror(
        mirror,
        safeAddress,
      );

    owners =
      sanitizeOwners(
        mirror.owners,
      );

    threshold =
      Number(
        mirror.threshold,
      );

    nonce =
      "0";

    deploymentRequired =
      true;

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
        "La Safe original tiene owners/threshold inválidos",
      );
    }
  }

  /*
   * La versión inicial de recuperación automática
   * utiliza una firma ECDSA owner.
   *
   * threshold > 1 debe manejar firmas múltiples y
   * ordenarlas por dirección, por lo tanto se bloquea.
   */
  if (
    threshold !== 1
  ) {
    throw new Error(
      `Esta Safe requiere ${threshold} firmas. Esta versión de RC Wallet solo ejecuta recuperación automática cuando threshold = 1.`,
    );
  }

  const typedData =
    buildTypedDataForAsset({
      asset,

      targetAddress:
        safeAddress,

      recipient:
        destination,

      amountUnits:
        normalizedAmount.units,

      nonce,
    });

  const createdAt =
    Date.now();

  const intent = {
    format:
      SAFE_RECOVERY_INTENT_FORMAT,

    version:
      SAFE_RECOVERY_INTENT_VERSION,

    createdAt:
      new Date(
        createdAt,
      ).toISOString(),

    expiresAt:
      createdAt +
      SAFE_RECOVERY_INTENT_LIFETIME_MS,

    safeAddress,

    chainId,

    networkName:
      network.name,

    asset: {
      symbol:
        asset.symbol,

      isNative:
        Boolean(
          asset.isNative,
        ),

      tokenAddress:
        asset.isNative
          ? null
          : normalizeAddress(
              asset.address,
            ),

      decimals,

      amount:
        normalizedAmount.human,

      amountUnits:
        normalizedAmount
          .units
          .toString(),

      recipient:
        destination,

      balanceAtPreparation:
        liveBalance.toString(),
    },

    safe: {
      deployed:
        liveSafe.deployed,

      version:
        liveSafe.version,

      owners,

      threshold,

      nonce:
        String(nonce),
    },

    deploymentRequired,

    deployment:
      deploymentRequired
        ? {
            method:
              deployment.method,

            factory:
              normalizeAddress(
                deployment.factory,
              ),

            singleton:
              normalizeAddress(
                deployment.singleton,
              ),

            initializer:
              deployment.initializer,

            saltNonce:
              String(
                deployment.saltNonce,
              ),

            targetPrediction:
              normalizeAddress(
                deployment.targetPrediction,
              ),
          }
        : null,

    typedData,

    digest:
      hashSafeTransactionTypedData(
        typedData,
      ),
  };

  assertExactTransferIntent(
    intent,
  );

  return intent;
}

// ============================================================================
// VERIFY WORLD APP / MINIKIT SIGNATURE
// ============================================================================

export function verifyMiniKitSafeRecoverySignature({
  intent,
  signature,
  reportedAddress = null,
}) {
  assertIntentShape(
    intent,
  );

  assertExactTransferIntent(
    intent,
  );

  /*
   * Esta ruta soporta por ahora una firma ECDSA owner estándar.
   *
   * 65 bytes =
   * r (32) + s (32) + v (1)
   */
  if (
    typeof signature !==
      "string" ||
    !ethers.isHexString(
      signature,
    ) ||
    signature.length !== 132
  ) {
    throw new Error(
      "MiniKit no devolvió una firma ECDSA SafeTx de 65 bytes",
    );
  }

  const analysis =
    analyzeSafeTransactionSignature({
      typedData:
        intent.typedData,

      signature,

      owners:
        intent.safe.owners,

      threshold:
        intent.safe.threshold,
    });

  if (
    !analysis.signerIsOwner
  ) {
    throw new Error(
      "La firma de World App no recupera ninguno de los owners de la Safe. No se moverán fondos.",
    );
  }

  if (
    !analysis
      .singleSignatureSatisfiesThreshold
  ) {
    throw new Error(
      `La firma es de un owner válido, pero threshold=${intent.safe.threshold}. Faltan firmas.`,
    );
  }

  return {
    ...analysis,

    reportedAddress:
      reportedAddress &&
      ethers.isAddress(
        reportedAddress,
      )
        ? normalizeAddress(
            reportedAddress,
          )
        : null,

    reportedAddressMatchesOwner:
      Boolean(
        reportedAddress &&
        ethers.isAddress(
          reportedAddress,
        ) &&
        sameAddress(
          reportedAddress,
          analysis
            .recoveredSigner,
        ),
      ),
  };
}

// ============================================================================
// SAFE checkSignatures COMPATIBILITY
// ============================================================================

async function validateSignatureOnSafe({
  contract,
  executor,
  safeTxHash,
  signature,
}) {
  /*
   * Safe moderno:
   *
   * checkSignatures(
   *   address executor,
   *   bytes32 dataHash,
   *   bytes signatures
   * )
   */
  try {
    await timeout(
      contract[
        "checkSignatures(address,bytes32,bytes)"
      ].staticCall(
        executor,
        safeTxHash,
        signature,
      ),
      8_000,
      "Safe checkSignatures",
    );

    return {
      method:
        "checkSignatures(address,bytes32,bytes)",
    };
  } catch (modernError) {
    /*
     * Compatibilidad con Safe anterior.
     *
     * Para nuestra ruta EOA EIP-712,
     * la validación se basa en dataHash.
     *
     * No usamos esta ruta para firmas contract-owner.
     */
    try {
      await timeout(
        contract[
          "checkSignatures(bytes32,bytes,bytes)"
        ].staticCall(
          safeTxHash,
          "0x",
          signature,
        ),
        8_000,
        "Safe legacy checkSignatures",
      );

      return {
        method:
          "checkSignatures(bytes32,bytes,bytes)",
      };
    } catch {
      throw new Error(
        modernError instanceof
          Error
          ? `La Safe rechazó la firma: ${modernError.message}`
          : "La Safe rechazó la firma owner",
      );
    }
  }
}

// ============================================================================
// EXECUTE SIGNED RECOVERY
// ============================================================================

export async function executeSignedSafeRecovery({
  eip1193Provider,
  asset,
  targetAddress,
  intent,
  signature,
  reportedAddress = null,
  onStatus,
}) {
  if (
    !eip1193Provider?.request
  ) {
    throw new Error(
      "Conecta una wallet externa compatible para pagar gas",
    );
  }

  assertExternalAsset(
    asset,
  );

  assertIntentMatchesRequest({
    intent,

    asset,

    targetAddress,
  });

  assertExactTransferIntent(
    intent,
  );

  /*
   * Primera verificación:
   * la firma debe recuperar un owner.
   */
  const signatureAnalysis =
    verifyMiniKitSafeRecoverySignature({
      intent,

      signature,

      reportedAddress,
    });

  /*
   * La wallet externa SOLO será pagador de gas.
   */
  await switchExternalNetwork(
    eip1193Provider,
    asset.network,
  );

  const provider =
    new ethers.BrowserProvider(
      eip1193Provider,
    );

  const network =
    await provider.getNetwork();

  if (
    Number(
      network.chainId,
    ) !==
    Number(
      asset.chainId,
    )
  ) {
    throw new Error(
      "La wallet pagadora no quedó en la red objetivo correcta",
    );
  }

  const signer =
    await provider.getSigner();

  const payerAddress =
    normalizeAddress(
      await signer.getAddress(),
    );

  const safeAddress =
    normalizeAddress(
      targetAddress,
    );

  onStatus?.(
    `Pagador de gas: ${payerAddress}. Verificando estado actual de la Safe…`,
    "info",
  );

  let liveSafe =
    await readLiveSafeState(
      provider,
      safeAddress,
    );

  let deploymentResult = {
    deployedNow:
      false,

    transactionHash:
      null,

    receipt:
      null,
  };

  // ==========================================================================
  // DEPLOY COUNTERFACTUAL SAFE
  // ==========================================================================

  if (!liveSafe.deployed) {
    deploymentResult =
      await deployMirrorSafeIfNeeded({
        provider,

        signer,

        payerAddress,

        asset,

        targetAddress:
          safeAddress,

        intent,

        onStatus,
      });

    liveSafe =
      await readLiveSafeState(
        provider,
        safeAddress,
      );
  }

  if (!liveSafe.deployed) {
    throw new Error(
      "La Safe no está desplegada en la red objetivo",
    );
  }

  // ==========================================================================
  // VERIFY OWNERS
  // ==========================================================================

  if (
    !sameOwnerSet(
      liveSafe.owners,
      intent.safe.owners,
    )
  ) {
    throw new Error(
      "Los owners actuales de la Safe no coinciden con los owners usados para firmar",
    );
  }

  // ==========================================================================
  // VERIFY THRESHOLD
  // ==========================================================================

  if (
    Number(
      liveSafe.threshold,
    ) !==
    Number(
      intent.safe.threshold,
    )
  ) {
    throw new Error(
      "El threshold actual de la Safe cambió después de preparar la firma",
    );
  }

  // ==========================================================================
  // VERIFY NONCE
  // ==========================================================================

  if (
    String(
      liveSafe.nonce,
    ) !==
    String(
      intent.safe.nonce,
    )
  ) {
    throw new Error(
      `El nonce Safe cambió. Firmado=${intent.safe.nonce}; actual=${liveSafe.nonce}. Genera una SafeTx nueva.`,
    );
  }

  // ==========================================================================
  // VERIFY SIGNER STILL OWNER
  // ==========================================================================

  if (
    !liveSafe.owners.some(
      (owner) =>
        sameAddress(
          owner,
          signatureAnalysis
            .recoveredSigner,
        ),
    )
  ) {
    throw new Error(
      "El firmante recuperado ya no aparece entre los owners actuales de la Safe",
    );
  }

  // ==========================================================================
  // VERIFY CURRENT BALANCE
  // ==========================================================================

  const currentBalance =
    await readCurrentAssetBalance(
      provider,
      asset,
      safeAddress,
    );

  const amountUnits =
    BigInt(
      intent.asset
        .amountUnits,
    );

  if (
    currentBalance <
    amountUnits
  ) {
    throw new Error(
      "El balance actual de la Safe ya no alcanza para el monto firmado",
    );
  }

  // ==========================================================================
  // SAFE CONTRACT
  // ==========================================================================

  const safeContract =
    new ethers.Contract(
      safeAddress,
      SAFE_EXECUTION_ABI,
      signer,
    );

  const message =
    intent.typedData
      .message;

  // ==========================================================================
  // GET HASH FROM THE SAFE ITSELF
  // ==========================================================================

  const onChainHash =
    await timeout(
      safeContract
        .getTransactionHash(
          message.to,

          BigInt(
            message.value,
          ),

          message.data,

          Number(
            message.operation,
          ),

          BigInt(
            message.safeTxGas,
          ),

          BigInt(
            message.baseGas,
          ),

          BigInt(
            message.gasPrice,
          ),

          message.gasToken,

          message.refundReceiver,

          BigInt(
            message.nonce,
          ),
        ),

      8_000,

      "Safe getTransactionHash",
    );

  // ==========================================================================
  // LOCAL HASH MUST MATCH ON-CHAIN HASH
  // ==========================================================================

  const localHash =
    hashSafeTransactionTypedData(
      intent.typedData,
    );

  if (
    String(
      onChainHash,
    ).toLowerCase() !==
    String(
      localHash,
    ).toLowerCase()
  ) {
    throw new Error(
      "El hash calculado localmente no coincide con Safe.getTransactionHash(). Operación bloqueada.",
    );
  }

  onStatus?.(
    "La Safe confirma exactamente el mismo hash firmado. Validando firma on-chain…",
    "info",
  );

  // ==========================================================================
  // ON-CHAIN SIGNATURE VALIDATION
  // ==========================================================================

  const signatureValidation =
    await validateSignatureOnSafe({
      contract:
        safeContract,

      executor:
        payerAddress,

      safeTxHash:
        onChainHash,

      signature,
    });

  // ==========================================================================
  // PREPARE EXECUTION
  // ==========================================================================

  const execArguments =
    buildExecArguments(
      intent.typedData,
      signature,
    );

  // ==========================================================================
  // SIMULATION
  // ==========================================================================

  const estimatedGas =
    await timeout(
      safeContract
        .execTransaction
        .estimateGas(
          ...execArguments,
        ),

      12_000,

      "Safe execTransaction simulation",
    );

  // ==========================================================================
  // PAYER GAS
  // ==========================================================================

  const feeData =
    await provider
      .getFeeData();

  const gas =
    await ensureGasBalance({
      provider,

      payerAddress,

      estimatedGas,

      feeData,

      reserveGas:
        0n,

      symbol:
        asset.network.symbol,
    });

  onStatus?.(
    "Firma válida y simulación aprobada. La wallet externa solo pagará el gas de execTransaction…",
    "success",
  );

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  const transaction =
    await safeContract
      .execTransaction(
        ...execArguments,

        {
          gasLimit:
            gas.gasLimit,
        },
      );

  const receipt =
    await transaction.wait(1);

  if (
    !receipt ||
    Number(
      receipt.status,
    ) !== 1
  ) {
    throw new Error(
      "La ejecución Safe no fue confirmada correctamente",
    );
  }

  // ==========================================================================
  // POST-CONDITION
  // ==========================================================================

  const remainingBalance =
    await readCurrentAssetBalance(
      provider,
      asset,
      safeAddress,
    );

  return {
    route:
      deploymentResult
        .deployedNow
        ? "world-owner-signature-counterfactual-safe-recovery"
        : "world-owner-signature-safe-recovery",

    safeAddress,

    payerAddress,

    ownerSigner:
      signatureAnalysis
        .recoveredSigner,

    safeTxHash:
      onChainHash,

    signatureValidationMethod:
      signatureValidation.method,

    hash:
      transaction.hash,

    hashes: [
      ...(
        deploymentResult
          .transactionHash
          ? [
              deploymentResult
                .transactionHash,
            ]
          : []
      ),

      transaction.hash,
    ],

    receipt,

    receipts: [
      ...(
        deploymentResult
          .receipt
          ? [
              deploymentResult
                .receipt,
            ]
          : []
      ),

      receipt,
    ],

    deployment:
      deploymentResult,

    asset: {
      symbol:
        intent.asset.symbol,

      amount:
        intent.asset.amount,

      amountUnits:
        intent.asset
          .amountUnits,

      recipient:
        intent.asset
          .recipient,

      balanceBeforeExecution:
        currentBalance.toString(),

      balanceAfterExecution:
        remainingBalance.toString(),
    },
  };
}
