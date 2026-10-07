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
  createSafeErc20TransferTypedData,
  createSafeNativeTransferTypedData,
  hashSafeTransactionTypedData,
  SAFE_TX_TYPES,
} from "./recovery-proof.js";

import {
  inspectSafeSignatureShape,
  verifyTargetSafeExecutionAuthorization,
  verifyWorldSafeMiniKitAuthorization,
} from "./world-safe-authority.js";

// ============================================================================
// RC WALLET — SAFE RECOVERY EXECUTION ENGINE
// ============================================================================
//
// OBJETIVO ÚNICO
//
// Recuperar activos que llegaron a la misma dirección de una World App Safe
// pero en una red EVM distinta (por ejemplo WLD en Ethereum Mainnet).
//
// MODELO DE AUTORIDAD
//
// World App / MiniKit
//      │
//      │ signTypedData(SafeTx exacta)
//      ▼
// firma de la World App Safe
//      │
//      │ EIP-1271 en World Chain
//      ▼
// autoridad origen verificada
//      │
//      ▼
// misma Safe recreada en red destino mediante CREATE2
//      │
//      │ misma firma validada por checkSignatures()
//      ▼
// execTransaction()
//      │
//      ▼
// ERC20.transfer(...) / transferencia nativa
//
// IMPORTANTE
//
// - La wallet externa NO es owner.
// - La wallet externa únicamente paga gas y transmite:
//     - createProxyWithNonce(...), cuando haga falta;
//     - execTransaction(...).
//
// REGLAS DE SEGURIDAD
//
// - Nunca private keys.
// - Nunca seed phrases.
// - Nunca desplegar si CREATE2 no reproduce EXACTAMENTE targetAddress.
// - Nunca ejecutar si owners cambian.
// - Nunca ejecutar si threshold cambia.
// - Nunca ejecutar si nonce cambia.
// - Nunca ejecutar si Safe.getTransactionHash() != hash firmado.
// - Nunca ejecutar si checkSignatures() falla.
// - Nunca ejecutar si estimateGas() falla.
// - Nunca confiar solo en el tamaño de la firma.
// - Una firma MiniKit nativa se valida como firma de Smart Account/Safe.
// - La compatibilidad EOA de 65 bytes se mantiene únicamente como evidencia
//   adicional; NO es requisito para World App.
//
// ============================================================================

const SAFE_RECOVERY_INTENT_FORMAT =
  "rc-wallet-safe-recovery-intent";

const SAFE_RECOVERY_INTENT_VERSION = 2;

const SAFE_RECOVERY_INTENT_LIFETIME_MS =
  10 * 60 * 1000;

const BPS_DENOMINATOR = 10_000n;
const GAS_LIMIT_BUFFER_BPS = 12_000n;
const GAS_PRICE_BUFFER_BPS = 12_000n;

const DEPLOYMENT_EXECUTION_RESERVE_GAS = 650_000n;

const SAFE_OPERATION_CALL = 0;

const MAX_SIGNATURE_BYTES = 64 * 1024;

const ERC20_INTERFACE =
  new ethers.Interface(ERC20_ABI);

// ============================================================================
// SAFE FACTORY ABI
// ============================================================================

const SAFE_PROXY_FACTORY_ABI = Object.freeze([
  "function proxyCreationCode() view returns (bytes)",

  "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",

  "function createProxyWithNonceL2(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
]);

// ============================================================================
// SAFE EXECUTION ABI
// ============================================================================

const SAFE_EXECUTION_ABI = Object.freeze([
  "function VERSION() view returns (string)",

  "function masterCopy() view returns (address)",

  "function getOwners() view returns (address[])",

  "function getThreshold() view returns (uint256)",

  "function nonce() view returns (uint256)",

  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",

  "function encodeTransactionData(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes)",

  "function checkSignatures(bytes32 dataHash,bytes data,bytes signatures) view",

  "function checkSignatures(address executor,bytes32 dataHash,bytes signatures) view",

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
    new Promise((_, reject) => {
      timeoutId =
        setTimeout(() => {
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
      .map((value) =>
        value.toLowerCase(),
      )
      .sort();

  const second =
    sanitizeOwners(right)
      .map((value) =>
        value.toLowerCase(),
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

function assertHexSignature(
  signature,
) {
  if (
    typeof signature !==
      "string" ||
    !ethers.isHexString(
      signature,
    ) ||
    signature === "0x"
  ) {
    throw new Error(
      "MiniKit no devolvió una firma hexadecimal válida",
    );
  }

  const byteLength =
    ethers.dataLength(
      signature,
    );

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

  const chainId =
    normalizeChainId(
      asset.chainId,
    );

  if (
    chainId ===
    WORLD_CHAIN_ID
  ) {
    throw new Error(
      "Este motor es únicamente para redes externas. World Chain usa MiniKit directamente.",
    );
  }

  const network =
    findNetwork(chainId);

  if (!network) {
    throw new Error(
      "La red del activo no está soportada",
    );
  }

  return {
    chainId,
    network,
  };
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
  const normalizedFactory =
    normalizeAddress(
      factory,
    );

  const normalizedSingleton =
    normalizeAddress(
      singleton,
    );

  if (
    typeof initializer !==
      "string" ||
    !ethers.isHexString(
      initializer,
    )
  ) {
    throw new Error(
      "Initializer Safe inválido",
    );
  }

  if (
    typeof proxyCreationCode !==
      "string" ||
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
            normalizedSingleton,
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
    normalizedFactory,
    salt,
    ethers.keccak256(
      deploymentCode,
    ),
  );
}

// ============================================================================
// LIVE SAFE STATE
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
      deployed: false,

      address,

      codeHash: null,

      version: null,

      singleton: null,

      owners: [],

      threshold: null,

      nonce: null,
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
    singletonResult,
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

      timeout(
        contract.masterCopy(),
        8_000,
        "Safe singleton",
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
    deployed: true,

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
// COUNTERFACTUAL MIRROR
// ============================================================================

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
      "Factory/singleton de la red objetivo no coinciden byte por byte con World Chain",
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

  if (
    typeof deployment.initializer !==
      "string" ||
    !ethers.isHexString(
      deployment.initializer,
    )
  ) {
    throw new Error(
      "Initializer Safe inválido",
    );
  }

  if (
    typeof deployment.proxyCreationCode !==
      "string" ||
    !ethers.isHexString(
      deployment.proxyCreationCode,
    )
  ) {
    throw new Error(
      "proxyCreationCode Safe inválido",
    );
  }

  return deployment;
}

// ============================================================================
// EXACT SAFE TX
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

function assertExactTransferIntent(
  intent,
) {
  const message =
    intent?.typedData
      ?.message;

  if (!message) {
    throw new Error(
      "SafeTx sin message",
    );
  }

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
      "La SafeTx contiene parámetros de gas/reembolso no permitidos por RC Wallet",
    );
  }

  if (
    !sameAddress(
      message.gasToken,
      ethers.ZeroAddress,
    )
  ) {
    throw new Error(
      "La SafeTx no debe utilizar gasToken",
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
        "El destino nativo firmado cambió",
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
        "La SafeTx nativa no coincide con monto/destino firmados",
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
      "El token ERC-20 de la SafeTx cambió",
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
      "El calldata ERC-20 no coincide exactamente con destinatario/monto firmados",
    );
  }
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
    ![
      1,
      SAFE_RECOVERY_INTENT_VERSION,
    ].includes(
      Number(intent.version),
    )
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
      "La autorización preparada expiró. Genera una SafeTx nueva.",
    );
  }

  const intentChainId =
    normalizeChainId(
      intent.chainId,
    );

  const topLevelChainId =
    normalizeChainId(
      intent.typedData
        .chainId,
    );

  const domainChainId =
    normalizeChainId(
      intent.typedData
        .domain
        ?.chainId,
    );

  if (
    intentChainId !==
      topLevelChainId ||
    topLevelChainId !==
      domainChainId
  ) {
    throw new Error(
      "SafeTx insegura: chainId inconsistentes",
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
      "SafeTx insegura: verifyingContract no coincide con la Safe",
    );
  }

  assertExactTransferIntent(
    intent,
  );

  return true;
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
    Boolean(
      asset.isNative,
    ) !==
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

  return true;
}

// ============================================================================
// PREPARE INTENT
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
      "La cantidad supera el balance actual de la dirección origen",
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
  let safeVersion = null;
  let safeSingleton = null;

  if (liveSafe.deployed) {
    owners =
      liveSafe.owners;

    threshold =
      liveSafe.threshold;

    nonce =
      liveSafe.nonce;

    deploymentRequired =
      false;

    safeVersion =
      liveSafe.version;

    safeSingleton =
      liveSafe.singleton;
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

    safeVersion =
      mirror.version ??
      mirror.safe?.version ??
      null;

    safeSingleton =
      deployment.singleton;

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
   * RC Wallet automatiza por ahora Safe threshold=1.
   *
   * No se "finge" multisig. Si threshold > 1, la recuperación se detiene.
   */
  if (
    threshold !== 1
  ) {
    throw new Error(
      `Esta Safe requiere ${threshold} firmas. RC Wallet no ejecutará una recuperación automática incompleta.`,
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
        normalizedAmount.units
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
        safeVersion,

      singleton:
        safeSingleton,

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

            proxyCreationCode:
              deployment
                .proxyCreationCode,

            targetPrediction:
              normalizeAddress(
                deployment.targetPrediction,
              ),

            sourceTransactionHash:
              deployment
                .sourceTransactionHash ??
              null,
          }
        : null,

    typedData,

    digest:
      hashSafeTransactionTypedData(
        typedData,
      ),
  };

  assertIntentShape(
    intent,
  );

  return intent;
}

// ============================================================================
// SYNCHRONOUS PRE-FLIGHT FOR safe-recovery-flow.js
// ============================================================================
//
// safe-recovery-flow.js ya consume esta función SIN await.
//
// Para no romper esa interfaz:
//   - si la firma es ECDSA de 65 bytes y recupera owner, lo demostramos;
//   - si la firma es una firma nativa de Smart Account/Safe, hacemos un
//     pre-flight estructural y marcamos sourceVerificationPending=true.
//
// MUY IMPORTANTE:
// Esta función NO autoriza despliegue ni movimiento.
// executeSignedSafeRecovery() realizará EIP-1271 real en World Chain ANTES de
// cambiar de red, desplegar o transmitir fondos.
// ============================================================================

export function verifyMiniKitSafeRecoverySignature({
  intent,
  signature,
  reportedAddress = null,
}) {
  assertIntentShape(
    intent,
  );

  const signatureBytes =
    assertHexSignature(
      signature,
    );

  const threshold =
    Number(
      intent.safe
        ?.threshold,
    );

  const owners =
    sanitizeOwners(
      intent.safe
        ?.owners,
    );

  if (
    threshold !== 1 ||
    owners.length === 0
  ) {
    throw new Error(
      "La recuperación automática requiere una Safe válida con threshold=1",
    );
  }

  const digest =
    hashSafeTransactionTypedData(
      intent.typedData,
    );

  const normalizedReportedAddress =
    reportedAddress &&
    ethers.isAddress(
      reportedAddress,
    )
      ? normalizeAddress(
          reportedAddress,
        )
      : null;

  /*
   * World App reporta la dirección de la Smart Account/Safe.
   * Exigimos coincidencia exacta cuando viene informada.
   */
  if (
    reportedAddress !== null &&
    reportedAddress !== undefined
  ) {
    if (
      !normalizedReportedAddress
    ) {
      throw new Error(
        "MiniKit reportó una dirección inválida",
      );
    }

    if (
      !sameAddress(
        normalizedReportedAddress,
        intent.safeAddress,
      )
    ) {
      throw new Error(
        "La dirección reportada por MiniKit no coincide con la Safe que contiene los fondos",
      );
    }
  }

  /*
   * Compatibilidad adicional:
   * si realmente es una firma EOA normal, demostramos owner.
   */
  if (signatureBytes === 65) {
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

      if (
        ownerListIncludes(
          owners,
          recoveredSigner,
        )
      ) {
        return {
          digest,

          recoveredSigner,

          signerIsOwner:
            true,

          threshold,

          ownerCount:
            owners.length,

          singleSignatureSatisfiesThreshold:
            true,

          executableWithThisSignature:
            false,

          verificationMethod:
            "eoa-preflight",

          sourceVerificationPending:
            true,

          reportedAddress:
            normalizedReportedAddress,

          reportedAddressMatchesSafe:
            Boolean(
              normalizedReportedAddress &&
              sameAddress(
                normalizedReportedAddress,
                intent.safeAddress,
              ),
            ),

          signatureShape:
            inspectSafeSignatureShape(
              signature,
            ),
        };
      }
    } catch {
      /*
       * No fallamos.
       * Una firma World App Safe puede no ser una ECDSA EOA directa.
       */
    }
  }

  /*
   * Smart Account path.
   *
   * safe-recovery-flow.js necesita estos flags para continuar al segundo
   * paso, pero la autoridad CRIPTOGRÁFICA real sigue pendiente.
   *
   * executeSignedSafeRecovery() NO confía en estos flags:
   * exige verifyWorldSafeMiniKitAuthorization() on-chain antes de cualquier
   * despliegue o movimiento.
   */
  if (!normalizedReportedAddress) {
    throw new Error(
      "Para una firma nativa de World App se requiere la dirección Safe reportada por MiniKit",
    );
  }

  return {
    digest,

    recoveredSigner:
      null,

    signerIsOwner:
      true,

    threshold,

    ownerCount:
      owners.length,

    singleSignatureSatisfiesThreshold:
      true,

    executableWithThisSignature:
      false,

    verificationMethod:
      "world-safe-eip1271-preflight",

    sourceVerificationPending:
      true,

    reportedAddress:
      normalizedReportedAddress,

    reportedAddressMatchesSafe:
      true,

    signatureShape:
      inspectSafeSignatureShape(
        signature,
      ),
  };
}

// ============================================================================
// DEPLOYMENT REVALIDATION
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
        "Safe factory bytecode",
      ),

      timeout(
        provider.getCode(
          singletonAddress,
        ),
        8_000,
        "Safe singleton bytecode",
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
    typeof liveProxyCreationCode !==
      "string" ||
    !ethers.isHexString(
      liveProxyCreationCode,
    )
  ) {
    throw new Error(
      "Safe ProxyFactory devolvió proxyCreationCode inválido",
    );
  }

  if (
    deployment.proxyCreationCode &&
    String(
      deployment.proxyCreationCode,
    ).toLowerCase() !==
      String(
        liveProxyCreationCode,
      ).toLowerCase()
  ) {
    throw new Error(
      "proxyCreationCode de la factory objetivo cambió respecto de la reconstrucción original",
    );
  }

  const predictedAddress =
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
      predictedAddress,
      targetAddress,
    )
  ) {
    throw new Error(
      "CREATE2 no reproduce exactamente la dirección que contiene los fondos. Despliegue bloqueado.",
    );
  }

  return {
    factoryAddress,

    singletonAddress,

    proxyCreationCode:
      liveProxyCreationCode,

    predictedAddress,
  };
}

function assertDeploymentSnapshotMatches({
  intent,
  mirrorDeployment,
}) {
  const snapshot =
    intent.deployment;

  if (
    !snapshot ||
    !mirrorDeployment
  ) {
    throw new Error(
      "Faltan parámetros de despliegue determinístico",
    );
  }

  if (
    snapshot.method !==
      mirrorDeployment.method ||
    !sameAddress(
      snapshot.factory,
      mirrorDeployment.factory,
    ) ||
    !sameAddress(
      snapshot.singleton,
      mirrorDeployment.singleton,
    ) ||
    String(
      snapshot.saltNonce,
    ) !==
      String(
        mirrorDeployment.saltNonce,
      ) ||
    String(
      snapshot.initializer,
    ).toLowerCase() !==
      String(
        mirrorDeployment.initializer,
      ).toLowerCase()
  ) {
    throw new Error(
      "Los parámetros CREATE2 actuales no coinciden con los que se firmaron",
    );
  }

  return true;
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
// DEPLOY MIRROR IF NEEDED
// ============================================================================

async function deployMirrorSafeIfNeeded({
  provider,
  signer,
  payerAddress,
  asset,
  targetAddress,
  intent,
  network,
  onStatus,
}) {
  const existingCode =
    await timeout(
      provider.getCode(
        targetAddress,
      ),
      8_000,
      "Safe target bytecode",
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
      "La Safe estaba desplegada al firmar y ahora no existe. Operación bloqueada.",
    );
  }

  const mirror =
    getCounterfactualMirror(
      asset,
    );

  const deployment =
    assertReplayableMirror(
      mirror,
      targetAddress,
    );

  assertDeploymentSnapshotMatches({
    intent,

    mirrorDeployment:
      deployment,
  });

  const validated =
    await validateDeploymentOnTarget({
      provider,

      targetAddress,

      deployment:
        intent.deployment,
    });

  onStatus?.(
    "CREATE2 verificado nuevamente. Preparando despliegue exacto de la Safe; la wallet externa solo paga gas.",
    "warning",
  );

  const factory =
    new ethers.Contract(
      validated.factoryAddress,
      SAFE_PROXY_FACTORY_ABI,
      signer,
    );

  const singleton =
    validated.singletonAddress;

  const initializer =
    intent.deployment
      .initializer;

  const saltNonce =
    BigInt(
      intent.deployment
        .saltNonce,
    );

  let estimatedGas;
  let send;

  if (
    intent.deployment.method ===
    "createProxyWithNonce"
  ) {
    estimatedGas =
      await timeout(
        factory
          .createProxyWithNonce
          .estimateGas(
            singleton,
            initializer,
            saltNonce,
          ),
        12_000,
        "Safe deployment estimateGas",
      );

    send =
      (overrides) =>
        factory
          .createProxyWithNonce(
            singleton,
            initializer,
            saltNonce,
            overrides,
          );
  } else if (
    intent.deployment.method ===
    "createProxyWithNonceL2"
  ) {
    estimatedGas =
      await timeout(
        factory
          .createProxyWithNonceL2
          .estimateGas(
            singleton,
            initializer,
            saltNonce,
          ),
        12_000,
        "Safe deployment estimateGas",
      );

    send =
      (overrides) =>
        factory
          .createProxyWithNonceL2(
            singleton,
            initializer,
            saltNonce,
            overrides,
          );
  } else {
    throw new Error(
      `Método Safe no soportado: ${intent.deployment.method}`,
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
        DEPLOYMENT_EXECUTION_RESERVE_GAS,

      symbol:
        network.symbol,
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

  const deployedState =
    await readLiveSafeState(
      provider,
      targetAddress,
    );

  if (!deployedState.deployed) {
    throw new Error(
      "La transacción de despliegue fue confirmada, pero la Safe no apareció en la dirección esperada",
    );
  }

  if (
    intent.deployment
      ?.singleton &&
    deployedState.singleton &&
    !sameAddress(
      deployedState.singleton,
      intent.deployment
        .singleton,
    )
  ) {
    throw new Error(
      "La Safe desplegada apunta a un singleton diferente del reconstruido",
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
// EXEC ARGUMENTS
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
// EXECUTION
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

  const {
    network,
  } =
    assertExternalAsset(
      asset,
    );

  assertIntentMatchesRequest({
    intent,

    asset,

    targetAddress,
  });

  assertHexSignature(
    signature,
  );

  // ==========================================================================
  // 1. WORLD APP AUTHORITY — EIP-1271 REAL
  // ==========================================================================
  //
  // Esto ocurre ANTES de:
  //   - cambiar la wallet externa de red;
  //   - desplegar la Safe;
  //   - transmitir una transacción financiera.
  //
  // ==========================================================================

  onStatus?.(
    "Verificando la firma de World App contra la Safe real de World Chain mediante EIP-1271…",
    "info",
  );

  const sourceAuthorization =
    await verifyWorldSafeMiniKitAuthorization({
      intent,

      signature,

      reportedAddress,
    });

  if (
    !sourceAuthorization?.valid ||
    !sourceAuthorization
      .sourceSafeEip1271Valid
  ) {
    throw new Error(
      "World Chain no confirmó la autorización EIP-1271 de esta firma",
    );
  }

  // ==========================================================================
  // 2. GAS PAYER
  // ==========================================================================

  await switchExternalNetwork(
    eip1193Provider,
    network,
  );

  const provider =
    new ethers.BrowserProvider(
      eip1193Provider,
    );

  const connectedNetwork =
    await provider.getNetwork();

  if (
    Number(
      connectedNetwork.chainId,
    ) !==
    Number(
      network.chainId,
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
    `Autorización World Safe válida. Pagador de gas: ${payerAddress}. Verificando red objetivo…`,
    "success",
  );

  // ==========================================================================
  // 3. TARGET SAFE — DEPLOY IF NEEDED
  // ==========================================================================

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

        network,

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
  // 4. POST-DEPLOY IDENTITY
  // ==========================================================================

  if (
    !sameOwnerSet(
      liveSafe.owners,
      intent.safe.owners,
    )
  ) {
    throw new Error(
      "Los owners actuales de la Safe objetivo no coinciden con los owners verificados en World Chain",
    );
  }

  if (
    Number(
      liveSafe.threshold,
    ) !==
    Number(
      intent.safe.threshold,
    )
  ) {
    throw new Error(
      "El threshold actual de la Safe objetivo no coincide con World Chain",
    );
  }

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

  if (
    intent.safe
      ?.version &&
    liveSafe.version &&
    String(
      intent.safe.version,
    ) !==
    String(
      liveSafe.version,
    )
  ) {
    throw new Error(
      `La versión Safe objetivo (${liveSafe.version}) no coincide con la versión preparada (${intent.safe.version}).`,
    );
  }

  if (
    intent.safe
      ?.singleton &&
    liveSafe.singleton &&
    !sameAddress(
      intent.safe.singleton,
      liveSafe.singleton,
    )
  ) {
    throw new Error(
      "El singleton de la Safe objetivo no coincide con el singleton esperado",
    );
  }

  // ==========================================================================
  // 5. CURRENT BALANCE
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
      "El balance actual ya no alcanza para el monto firmado",
    );
  }

  // ==========================================================================
  // 6. TARGET SIGNATURE VALIDATION
  // ==========================================================================
  //
  // Verifica:
  //   local typed-data hash == Safe.getTransactionHash()
  //   checkSignatures(hash, encodeTransactionData(...), signature)
  //
  // Esta es la prueba de portabilidad REAL.
  //
  // ==========================================================================

  onStatus?.(
    "Validando la misma firma de World App contra la Safe objetivo y el hash exacto de la transacción…",
    "info",
  );

  const targetAuthorization =
    await verifyTargetSafeExecutionAuthorization({
      provider,

      safeAddress,

      typedData:
        intent.typedData,

      signature,

      executor:
        payerAddress,
    });

  if (
    !targetAuthorization?.valid
  ) {
    throw new Error(
      "La Safe objetivo no acepta la autorización firmada por World App",
    );
  }

  if (
    !sameOwnerSet(
      targetAuthorization
        .targetSafe
        ?.owners,
      liveSafe.owners,
    )
  ) {
    throw new Error(
      "La Safe cambió durante la validación de firma",
    );
  }

  // ==========================================================================
  // 7. PREPARE EXECUTION
  // ==========================================================================

  const safeContract =
    new ethers.Contract(
      safeAddress,
      SAFE_EXECUTION_ABI,
      signer,
    );

  const execArguments =
    buildExecArguments(
      intent.typedData,
      signature,
    );

  /*
   * estimateGas ejecuta una simulación EVM de execTransaction.
   * Si firma, nonce, calldata o token son inválidos, debe fallar aquí.
   */
  const estimatedGas =
    await timeout(
      safeContract
        .execTransaction
        .estimateGas(
          ...execArguments,
        ),
      15_000,
      "Safe execTransaction simulation",
    );

  const feeData =
    await provider.getFeeData();

  const gas =
    await ensureGasBalance({
      provider,

      payerAddress,

      estimatedGas,

      feeData,

      reserveGas:
        0n,

      symbol:
        network.symbol,
    });

  onStatus?.(
    "Firma válida en World Chain y en la Safe objetivo. Simulación aprobada. Preparando ejecución real…",
    "success",
  );

  // ==========================================================================
  // 8. LAST SECOND NONCE CHECK
  // ==========================================================================

  const finalNonce =
    await safeContract.nonce();

  if (
    String(finalNonce) !==
    String(
      intent.safe.nonce,
    )
  ) {
    throw new Error(
      "El nonce cambió justo antes de transmitir. Operación cancelada.",
    );
  }

  // ==========================================================================
  // 9. EXECUTE
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
  // 10. POST-CONDITION
  // ==========================================================================

  const remainingBalance =
    await readCurrentAssetBalance(
      provider,
      asset,
      safeAddress,
    );

  const expectedRemaining =
    currentBalance -
    amountUnits;

  const balanceMatchesExpected =
    remainingBalance ===
    expectedRemaining;

  return {
    route:
      deploymentResult
        .deployedNow
        ? "world-safe-eip1271-counterfactual-recovery"
        : "world-safe-eip1271-recovery",

    safeAddress,

    payerAddress,

    ownerSigner:
      sourceAuthorization
        .recoveredSigner ??
      null,

    authorizationMethod:
      sourceAuthorization
        .verificationMethod,

    sourceAuthorization: {
      verificationMethod:
        sourceAuthorization
          .verificationMethod,

      sourceSafeEip1271Valid:
        sourceAuthorization
          .sourceSafeEip1271Valid,

      portableEoaOwnerProven:
        sourceAuthorization
          .portableEoaOwnerProven,

      signatureShape:
        sourceAuthorization
          .signatureShape,
    },

    targetAuthorization: {
      validationMethod:
        targetAuthorization
          .validationMethod,

      signatureShape:
        targetAuthorization
          .signatureShape,
    },

    safeTxHash:
      targetAuthorization
        .onChainHash,

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
        currentBalance
          .toString(),

      balanceAfterExecution:
        remainingBalance
          .toString(),

      expectedBalanceAfterExecution:
        expectedRemaining
          .toString(),

      balanceMatchesExpected,
    },
  };
}
