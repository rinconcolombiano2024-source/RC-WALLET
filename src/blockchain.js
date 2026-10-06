import { ethers } from "ethers";

import {
  ERC1271_ABI,
  ERC20_ABI,
  ERC4337_ENTRYPOINTS,
  NETWORKS,
  SAFE_FALLBACK_HANDLER_STORAGE_SLOT,
  SAFE_GUARD_STORAGE_SLOT,
  SAFE_INTROSPECTION_ABI,
  SAFE_MODULE_GUARD_STORAGE_SLOT,
  SAFE_SENTINEL,
  TOKENS,
  WORLD_CHAIN_ID,
} from "./config.js";

// ============================================================================
// RC WALLET — BLOCKCHAIN CORE
// ============================================================================
//
// Objetivo:
//
// 1. Detectar fondos en varias redes.
// 2. Determinar qué tipo de cuenta contiene esos fondos.
// 3. Detectar Safe en World Chain.
// 4. Reconstruir el despliegue determinístico únicamente con evidencia.
// 5. Exigir que la dirección CREATE2 sea EXACTAMENTE la dirección con fondos.
// 6. Ejecutar una transferencia Safe únicamente si existe owner válido.
// 7. Nunca solicitar frases semilla ni claves privadas.
//
// ============================================================================

const providerCache = new Map();
const safeDeploymentCache = new Map();

const ERC1271_MAGIC_VALUE = "0x1626ba7e";

const BPS_DENOMINATOR = 10_000n;
const GAS_LIMIT_BUFFER_BPS = 12_000n;
const GAS_PRICE_BUFFER_BPS = 12_000n;

const SAFE_OPERATION_CALL = 0;

const ERC20_INTERFACE = new ethers.Interface(ERC20_ABI);

// ============================================================================
// SAFE FACTORIES OFICIALES
// ============================================================================
//
// 1.4.1:
// SafeProxyFactory canonical.
// Existe oficialmente en World Chain (480) y Ethereum (1).
//
// 1.3.0:
// Se mantienen dos despliegues oficiales porque World Chain soporta ambos.
//
// No confiamos únicamente en esta lista.
// La transacción de creación encontrada debe volver a producir exactamente
// la dirección Safe original.
// ============================================================================

const SAFE_FACTORY_CANDIDATES = Object.freeze([
  {
    version: "1.4.1",
    address: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    indexedProxyEvent: true,
  },

  {
    version: "1.3.0-canonical",
    address: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
    indexedProxyEvent: false,
  },

  {
    version: "1.3.0-eip155",
    address: "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC",
    indexedProxyEvent: false,
  },
]);

const SAFE_PROXY_FACTORY_ABI = Object.freeze([
  "event ProxyCreation(address indexed proxy,address singleton)",

  "function proxyCreationCode() view returns (bytes)",

  "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",

  "function createProxyWithNonceL2(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",

  "function createChainSpecificProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",

  "function createChainSpecificProxyWithNonceL2(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",

  "function createProxyWithCallback(address _singleton,bytes initializer,uint256 saltNonce,address callback) returns (address proxy)",
]);

const SAFE_PROXY_FACTORY_INTERFACE =
  new ethers.Interface(SAFE_PROXY_FACTORY_ABI);

const SAFE_EXECUTION_ABI = Object.freeze([
  "function nonce() view returns (uint256)",

  "function getOwners() view returns (address[])",

  "function getThreshold() view returns (uint256)",

  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",

  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) payable returns (bool success)",
]);

const SAFE_SUPPORTED_CREATION_METHODS = new Set([
  "createProxyWithNonce",
  "createProxyWithNonceL2",
  "createChainSpecificProxyWithNonce",
  "createChainSpecificProxyWithNonceL2",
]);

const SAFE_CHAIN_SPECIFIC_CREATION_METHODS = new Set([
  "createChainSpecificProxyWithNonce",
  "createChainSpecificProxyWithNonceL2",
]);

const SAFE_PROXY_CREATION_TOPIC =
  ethers.id("ProxyCreation(address,address)");

// ============================================================================
// HELPERS
// ============================================================================

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

function cleanAddressInput(value) {
  return String(value ?? "")
    .trim()
    .replace(
      /[\s\u200B-\u200D\uFEFF]/g,
      "",
    );
}

function extractAddressCandidate(value) {
  const cleaned =
    cleanAddressInput(value);

  if (
    /^0x[a-fA-F0-9]{40}$/.test(cleaned)
  ) {
    return cleaned;
  }

  if (
    /^0X[a-fA-F0-9]{40}$/.test(cleaned)
  ) {
    return `0x${cleaned.slice(2)}`;
  }

  // Permitimos ethereum:0x... y QR equivalentes,
  // pero no extraemos direcciones arbitrarias de textos largos.
  const ethereumUri =
    cleaned.match(
      /^ethereum:(0x[a-fA-F0-9]{40})(?:[@/?].*)?$/i,
    );

  if (ethereumUri?.[1]) {
    return ethereumUri[1];
  }

  return cleaned;
}

export function normalizeAddress(value) {
  const candidate =
    extractAddressCandidate(value);

  if (
    !/^0x[a-fA-F0-9]{40}$/.test(
      candidate,
    )
  ) {
    throw new Error(
      "Introduce una dirección EVM válida de 42 caracteres",
    );
  }

  return ethers.getAddress(
    candidate.toLowerCase(),
  );
}

export function isValidEvmAddressInput(
  value,
) {
  try {
    normalizeAddress(value);
    return true;
  } catch {
    return false;
  }
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

export function formatBalance(
  rawBalance,
  decimals,
  digits = 6,
) {
  const value =
    ethers.formatUnits(
      rawBalance,
      decimals,
    );

  const [whole, fraction = ""] =
    value.split(".");

  const trimmed =
    fraction
      .slice(0, digits)
      .replace(/0+$/, "");

  return trimmed
    ? `${whole}.${trimmed}`
    : whole;
}

function applyBuffer(value, bps) {
  return (
    value * bps +
    BPS_DENOMINATOR -
    1n
  ) / BPS_DENOMINATOR;
}

function getMaxGasPrice(feeData) {
  const price =
    feeData.maxFeePerGas ??
    feeData.gasPrice;

  if (!price || price <= 0n) {
    throw new Error(
      "La red no devolvió un precio de gas válido",
    );
  }

  return applyBuffer(
    BigInt(price),
    GAS_PRICE_BUFFER_BPS,
  );
}

function storageWordToAddress(word) {
  const value =
    String(word ?? "");

  if (
    !/^0x[a-fA-F0-9]{64}$/.test(
      value,
    )
  ) {
    throw new Error(
      "Storage Safe inválido",
    );
  }

  return ethers.getAddress(
    `0x${value.slice(-40)}`,
  );
}

async function readStorageAddress(
  provider,
  account,
  slot,
  label,
) {
  try {
    const raw =
      await timeout(
        provider.getStorage(
          account,
          slot,
        ),
        7_000,
        label,
      );

    const address =
      storageWordToAddress(raw);

    return {
      readable: true,
      raw,
      address:
        address === ethers.ZeroAddress
          ? null
          : address,
      error: null,
    };
  } catch (error) {
    return {
      readable: false,
      raw: null,
      address: null,
      error:
        error instanceof Error
          ? error.message
          : `${label}: lectura fallida`,
    };
  }
}

// ============================================================================
// RPC
// ============================================================================

export async function getProvider(
  network,
) {
  if (!network?.chainId) {
    throw new Error(
      "Red inválida",
    );
  }

  const cached =
    providerCache.get(
      network.chainId,
    );

  if (cached) {
    return cached;
  }

  let lastError = null;

  for (
    const rpcUrl of network.rpcUrls ?? []
  ) {
    try {
      const provider =
        new ethers.JsonRpcProvider(
          rpcUrl,
          network.chainId,
          {
            staticNetwork: true,
            batchMaxCount: 1,
          },
        );

      const providerNetwork =
        await timeout(
          provider.getNetwork(),
          7_000,
          network.name,
        );

      if (
        Number(
          providerNetwork.chainId,
        ) !== network.chainId
      ) {
        throw new Error(
          "El RPC respondió con una chainId incorrecta",
        );
      }

      await timeout(
        provider.getBlockNumber(),
        7_000,
        network.name,
      );

      providerCache.set(
        network.chainId,
        provider,
      );

      return provider;
    } catch (error) {
      lastError = error;

      console.warn(
        `[RPC ${network.name}] ${rpcUrl}`,
        error,
      );
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `No hay RPC funcional para ${network.name}: ${lastError.message}`
      : `No hay RPC funcional para ${network.name}`,
  );
}

// ============================================================================
// SAFE MODULES
// ============================================================================

async function readAllSafeModules(
  contract,
) {
  const modules = [];
  const seen = new Set();

  let cursor = SAFE_SENTINEL;
  let complete = false;

  for (
    let pageIndex = 0;
    pageIndex < 20;
    pageIndex += 1
  ) {
    const page =
      await timeout(
        contract.getModulesPaginated(
          cursor,
          50,
        ),
        7_000,
        `Safe modules página ${
          pageIndex + 1
        }`,
      );

    const pageModules =
      Array.isArray(page?.[0])
        ? page[0]
        : [];

    for (
      const moduleAddress
      of pageModules
    ) {
      if (
        !ethers.isAddress(
          moduleAddress,
        )
      ) {
        continue;
      }

      const normalized =
        ethers.getAddress(
          moduleAddress,
        );

      const key =
        normalized.toLowerCase();

      if (
        key ===
        SAFE_SENTINEL.toLowerCase()
      ) {
        continue;
      }

      if (!seen.has(key)) {
        seen.add(key);
        modules.push(normalized);
      }
    }

    const rawNext = page?.[1];

    if (
      !ethers.isAddress(rawNext)
    ) {
      throw new Error(
        "Safe devolvió un cursor de módulos inválido",
      );
    }

    const next =
      ethers.getAddress(rawNext);

    if (
      next.toLowerCase() ===
      SAFE_SENTINEL.toLowerCase()
    ) {
      complete = true;
      break;
    }

    if (
      next.toLowerCase() ===
      cursor.toLowerCase()
    ) {
      throw new Error(
        "Se detectó un loop en módulos Safe",
      );
    }

    cursor = next;
  }

  return {
    modules,
    complete,
  };
}

// ============================================================================
// SAFE INSPECTION
// ============================================================================

async function inspectSafeAccount(
  provider,
  account,
  hasCode,
) {
  if (!hasCode) {
    return {
      detected: false,
      reason:
        "No existe contrato en esta red",
    };
  }

  const safeAddress =
    normalizeAddress(account);

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
      detected: false,
      reason:
        "El contrato no expone la interfaz mínima de Safe",
    };
  }

  const owners =
    Array.isArray(
      ownersResult.value,
    )
      ? ownersResult.value
          .filter(
            ethers.isAddress,
          )
          .map((value) =>
            ethers.getAddress(value),
          )
      : [];

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
    threshold > owners.length
  ) {
    return {
      detected: false,
      reason:
        "Safe respondió owners/threshold inconsistentes",
    };
  }

  const version =
    versionResult.status ===
      "fulfilled"
      ? String(
          versionResult.value,
        )
      : null;

  const nonce =
    nonceResult.status ===
      "fulfilled"
      ? nonceResult.value.toString()
      : null;

  const singleton =
    singletonResult.status ===
      "fulfilled" &&
    ethers.isAddress(
      singletonResult.value,
    )
      ? ethers.getAddress(
          singletonResult.value,
        )
      : null;

  let singletonCodeHash = null;

  if (singleton) {
    try {
      const code =
        await timeout(
          provider.getCode(
            singleton,
          ),
          7_000,
          "Safe singleton code",
        );

      if (
        code &&
        code !== "0x"
      ) {
        singletonCodeHash =
          ethers.keccak256(code);
      }
    } catch (error) {
      console.warn(
        "[SAFE SINGLETON]",
        error,
      );
    }
  }

  let modules = [];
  let modulesReadable = false;
  let modulesComplete = false;

  try {
    const moduleResult =
      await readAllSafeModules(
        contract,
      );

    modules =
      moduleResult.modules;

    modulesReadable = true;

    modulesComplete =
      moduleResult.complete;
  } catch (error) {
    console.warn(
      "[SAFE MODULES]",
      error,
    );
  }

  const [
    fallbackHandlerResult,
    guardResult,
    moduleGuardResult,
  ] = await Promise.all([
    readStorageAddress(
      provider,
      safeAddress,
      SAFE_FALLBACK_HANDLER_STORAGE_SLOT,
      "Safe fallback handler",
    ),

    readStorageAddress(
      provider,
      safeAddress,
      SAFE_GUARD_STORAGE_SLOT,
      "Safe guard",
    ),

    readStorageAddress(
      provider,
      safeAddress,
      SAFE_MODULE_GUARD_STORAGE_SLOT,
      "Safe module guard",
    ),
  ]);

  return {
    detected: true,

    address: safeAddress,

    version,

    singleton,

    singletonCodeHash,

    owners,

    threshold,

    nonce,

    modules,

    modulesReadable,

    modulesComplete,

    fallbackHandler:
      fallbackHandlerResult.address,

    guard:
      guardResult.address,

    moduleGuard:
      moduleGuardResult.address,

    storageEvidence: {
      fallbackHandler:
        fallbackHandlerResult,

      guard:
        guardResult,

      moduleGuard:
        moduleGuardResult,
    },

    recoveryRequirement:
      threshold === 1
        ? "Se necesita una firma válida de uno de los owners"
        : `Se necesitan ${threshold} firmas válidas de owners`,
  };
}

function safeOwnersInclude(
  safe,
  signerAddress,
) {
  if (
    !safe?.detected ||
    !signerAddress
  ) {
    return false;
  }

  return (
    safe.owners ?? []
  ).some((owner) =>
    sameAddress(
      owner,
      signerAddress,
    ),
  );
}

// ============================================================================
// EIP-1271
// ============================================================================

async function inspectErc1271(
  provider,
  account,
  hasCode,
) {
  if (!hasCode) {
    return {
      checked: false,
      supported: false,
      inconclusive: false,
      reason:
        "EIP-1271 solo aplica a cuentas contrato",
    };
  }

  const iface =
    new ethers.Interface(
      ERC1271_ABI,
    );

  try {
    const data =
      iface.encodeFunctionData(
        "isValidSignature",
        [
          ethers.ZeroHash,
          "0x",
        ],
      );

    const raw =
      await timeout(
        provider.call({
          to: account,
          data,
        }),
        7_000,
        "EIP-1271",
      );

    const [response] =
      iface.decodeFunctionResult(
        "isValidSignature",
        raw,
      );

    const normalized =
      String(response)
        .toLowerCase();

    return {
      checked: true,
      supported: true,
      inconclusive: false,
      validForEmptyTest:
        normalized ===
        ERC1271_MAGIC_VALUE,
      response: normalized,
      note:
        "El contrato respondió a isValidSignature. La prueba definitiva requiere una firma real.",
    };
  } catch (error) {
    return {
      checked: true,

      // NO lo declaramos unsupported:
      // una firma vacía puede hacer revert
      // aunque EIP-1271 exista.
      supported: null,

      inconclusive: true,

      validForEmptyTest: false,

      response: null,

      reason:
        error instanceof Error
          ? error.message
          : "EIP-1271 revirtió",

      note:
        "La firma ficticia no permite confirmar ni negar EIP-1271.",
    };
  }
}

// ============================================================================
// ERC-4337 — SOLO INFRAESTRUCTURA DE RED
// ============================================================================

async function inspectEntryPoints(
  provider,
) {
  const results =
    await Promise.allSettled(
      ERC4337_ENTRYPOINTS.map(
        async (definition) => {
          const address =
            normalizeAddress(
              definition.address,
            );

          const code =
            await timeout(
              provider.getCode(
                address,
              ),
              7_000,
              definition.label,
            );

          return {
            ...definition,
            address,
            deployed:
              Boolean(
                code &&
                code !== "0x",
              ),
          };
        },
      ),
    );

  return results.map(
    (result, index) => {
      if (
        result.status ===
        "fulfilled"
      ) {
        return result.value;
      }

      return {
        ...ERC4337_ENTRYPOINTS[
          index
        ],
        deployed: false,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "No se pudo consultar EntryPoint",
      };
    },
  );
}

// ============================================================================
// SAFE CREATE2
// ============================================================================

function uint256ToBytes32(value) {
  return ethers.zeroPadValue(
    ethers.toBeHex(
      BigInt(value),
    ),
    32,
  );
}

function creationMethodIsChainSpecific(
  method,
) {
  return (
    SAFE_CHAIN_SPECIFIC_CREATION_METHODS.has(
      method,
    )
  );
}

function createSafeSalt({
  initializer,
  saltNonce,
  method,
  chainId,
}) {
  const parts = [
    ethers.keccak256(
      initializer,
    ),

    uint256ToBytes32(
      saltNonce,
    ),
  ];

  if (
    creationMethodIsChainSpecific(
      method,
    )
  ) {
    parts.push(
      uint256ToBytes32(
        chainId,
      ),
    );
  }

  return ethers.keccak256(
    ethers.concat(parts),
  );
}

function computeSafeAddress({
  factory,
  singleton,
  initializer,
  saltNonce,
  proxyCreationCode,
  method,
  chainId,
}) {
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
    createSafeSalt({
      initializer,
      saltNonce,
      method,
      chainId,
    });

  return ethers.getCreate2Address(
    normalizeAddress(factory),
    salt,
    ethers.keccak256(
      deploymentCode,
    ),
  );
}

// ============================================================================
// SAFE CREATION TRANSACTION
// ============================================================================

function parseSafeCreationTransaction(
  transaction,
) {
  if (
    !transaction?.data ||
    transaction.data === "0x"
  ) {
    return null;
  }

  let parsed;

  try {
    parsed =
      SAFE_PROXY_FACTORY_INTERFACE
        .parseTransaction({
          data: transaction.data,
          value:
            transaction.value ??
            0n,
        });
  } catch {
    return null;
  }

  if (
    !parsed ||
    !SAFE_SUPPORTED_CREATION_METHODS.has(
      parsed.name,
    )
  ) {
    return null;
  }

  return {
    method: parsed.name,

    singleton:
      normalizeAddress(
        parsed.args[0],
      ),

    initializer:
      String(
        parsed.args[1],
      ),

    saltNonce:
      BigInt(
        parsed.args[2],
      ).toString(),
  };
}

// ============================================================================
// SAFE CREATION SERVICE
// ============================================================================

async function fetchJson(
  url,
  milliseconds,
) {
  if (
    typeof fetch !==
    "function"
  ) {
    return null;
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      milliseconds,
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          headers: {
            accept:
              "application/json",
          },
        },
      );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readSafeCreationService(
  safeAddress,
) {
  const safe =
    normalizeAddress(
      safeAddress,
    );

  const urls = [
    `https://safe-transaction-worldchain.safe.global/api/v1/safes/${safe}/creation/`,

    `https://api.safe.global/tx-service/worldchain/api/v1/safes/${safe}/creation/`,
  ];

  for (const url of urls) {
    const data =
      await fetchJson(
        url,
        8_000,
      );

    if (
      !data ||
      typeof data !== "object"
    ) {
      continue;
    }

    const transactionHash =
      data.transactionHash ??
      data.transaction_hash ??
      null;

    const factory =
      data.factoryAddress ??
      data.factory_address ??
      null;

    if (
      transactionHash ||
      (
        factory &&
        ethers.isAddress(factory)
      )
    ) {
      return {
        transactionHash,

        factory:
          factory &&
          ethers.isAddress(
            factory,
          )
            ? normalizeAddress(
                factory,
              )
            : null,

        singleton:
          data.masterCopy &&
          ethers.isAddress(
            data.masterCopy,
          )
            ? normalizeAddress(
                data.masterCopy,
              )
            : null,

        initializer:
          typeof data.setupData ===
            "string" &&
          ethers.isHexString(
            data.setupData,
          )
            ? data.setupData
            : null,

        saltNonce:
          data.saltNonce !==
            undefined &&
          data.saltNonce !==
            null
            ? BigInt(
                data.saltNonce,
              ).toString()
            : null,

        sourceUrl: url,
      };
    }
  }

  return null;
}

// ============================================================================
// ON-CHAIN CREATION SEARCH
// ============================================================================

async function findProxyCreationLog(
  provider,
  factoryDefinition,
  proxyAddress,
) {
  const factory =
    normalizeAddress(
      factoryDefinition.address,
    );

  const proxy =
    normalizeAddress(
      proxyAddress,
    );

  if (
    factoryDefinition.indexedProxyEvent
  ) {
    try {
      const logs =
        await timeout(
          provider.getLogs({
            address: factory,

            topics: [
              SAFE_PROXY_CREATION_TOPIC,

              ethers.zeroPadValue(
                proxy,
                32,
              ),
            ],

            fromBlock: 0,

            toBlock: "latest",
          }),
          15_000,
          "Safe ProxyCreation",
        );

      if (logs.length) {
        return logs[0];
      }
    } catch {
      // Seguimos con servicio/fallback.
    }
  }

  return null;
}

// ============================================================================
// DEPLOYMENT DISCOVERY
// ============================================================================

async function buildDeploymentFromTx({
  provider,
  safeAddress,
  transactionHash,
  factoryHint,
}) {
  const transaction =
    await timeout(
      provider.getTransaction(
        transactionHash,
      ),
      7_000,
      "Safe creation transaction",
    );

  if (!transaction) {
    return null;
  }

  const factory =
    transaction.to
      ? normalizeAddress(
          transaction.to,
        )
      : factoryHint
        ? normalizeAddress(
            factoryHint,
          )
        : null;

  if (!factory) {
    return null;
  }

  const parsed =
    parseSafeCreationTransaction(
      transaction,
    );

  if (!parsed) {
    return null;
  }

  const factoryContract =
    new ethers.Contract(
      factory,
      SAFE_PROXY_FACTORY_ABI,
      provider,
    );

  const proxyCreationCode =
    await timeout(
      factoryContract
        .proxyCreationCode(),
      7_000,
      "Safe proxyCreationCode",
    );

  const predicted =
    computeSafeAddress({
      factory,

      singleton:
        parsed.singleton,

      initializer:
        parsed.initializer,

      saltNonce:
        parsed.saltNonce,

      proxyCreationCode,

      method:
        parsed.method,

      chainId:
        WORLD_CHAIN_ID,
    });

  if (
    !sameAddress(
      predicted,
      safeAddress,
    )
  ) {
    return null;
  }

  return {
    ...parsed,

    factory,

    proxyCreationCode,

    sourceChainId:
      WORLD_CHAIN_ID,

    sourceTransactionHash:
      transactionHash,

    predictedSourceAddress:
      predicted,

    canReplayCrossChain:
      !creationMethodIsChainSpecific(
        parsed.method,
      ),
  };
}

async function findSafeDeploymentOnWorldChain(
  safeAddress,
) {
  const safe =
    normalizeAddress(
      safeAddress,
    );

  const cacheKey =
    safe.toLowerCase();

  if (
    safeDeploymentCache.has(
      cacheKey,
    )
  ) {
    return (
      safeDeploymentCache.get(
        cacheKey,
      )
    );
  }

  const promise =
    (async () => {
      const worldNetwork =
        NETWORKS.find(
          (network) =>
            network.chainId ===
            WORLD_CHAIN_ID,
        );

      if (!worldNetwork) {
        return null;
      }

      const provider =
        await getProvider(
          worldNetwork,
        );

      // --------------------------------------------------
      // 1. Safe Transaction Service
      // --------------------------------------------------

      const serviceResult =
        await readSafeCreationService(
          safe,
        );

      if (
        serviceResult
          ?.transactionHash
      ) {
        try {
          const deployment =
            await buildDeploymentFromTx({
              provider,

              safeAddress:
                safe,

              transactionHash:
                serviceResult
                  .transactionHash,

              factoryHint:
                serviceResult
                  .factory,
            });

          if (deployment) {
            return {
              ...deployment,

              sourceUrl:
                serviceResult
                  .sourceUrl,
            };
          }
        } catch (error) {
          console.warn(
            "[SAFE CREATION SERVICE]",
            error,
          );
        }
      }

      // --------------------------------------------------
      // 2. Eventos de fábricas oficiales indexables
      // --------------------------------------------------

      for (
        const candidate
        of SAFE_FACTORY_CANDIDATES
      ) {
        const factoryCode =
          await timeout(
            provider.getCode(
              candidate.address,
            ),
            7_000,
            "Safe factory",
          );

        if (
          !factoryCode ||
          factoryCode === "0x"
        ) {
          continue;
        }

        const log =
          await findProxyCreationLog(
            provider,
            candidate,
            safe,
          );

        if (!log) {
          continue;
        }

        const deployment =
          await buildDeploymentFromTx({
            provider,

            safeAddress:
              safe,

            transactionHash:
              log.transactionHash,

            factoryHint:
              candidate.address,
          });

        if (deployment) {
          return {
            ...deployment,

            factoryVersion:
              candidate.version,
          };
        }
      }

      return null;
    })();

  safeDeploymentCache.set(
    cacheKey,
    promise,
  );

  return promise;
}

// ============================================================================
// COUNTERFACTUAL SAFE MIRROR
// ============================================================================

async function inspectCounterfactualSafeMirror(
  targetProvider,
  targetNetwork,
  owner,
  targetHasCode,
) {
  if (
    targetHasCode ||
    targetNetwork.chainId ===
      WORLD_CHAIN_ID
  ) {
    return {
      checked: false,
      detected: false,
    };
  }

  const worldNetwork =
    NETWORKS.find(
      (network) =>
        network.chainId ===
        WORLD_CHAIN_ID,
    );

  if (!worldNetwork) {
    return {
      checked: false,
      detected: false,
      reason:
        "World Chain no está configurada",
    };
  }

  const worldProvider =
    await getProvider(
      worldNetwork,
    );

  const worldCode =
    await timeout(
      worldProvider.getCode(
        owner,
      ),
      7_000,
      "World Safe code",
    );

  const worldHasCode =
    Boolean(
      worldCode &&
      worldCode !== "0x",
    );

  const worldSafe =
    await inspectSafeAccount(
      worldProvider,
      owner,
      worldHasCode,
    );

  if (
    !worldSafe.detected
  ) {
    return {
      checked: true,
      detected: false,
      reason:
        "La misma dirección no fue identificada como Safe en World Chain",
    };
  }

  const deployment =
    await findSafeDeploymentOnWorldChain(
      owner,
    );

  if (!deployment) {
    return {
      checked: true,

      detected: true,

      sourceNetworkName:
        worldNetwork.name,

      sourceChainId:
        WORLD_CHAIN_ID,

      owners:
        worldSafe.owners,

      threshold:
        worldSafe.threshold,

      safe:
        worldSafe,

      deployment: null,

      deploymentRequired:
        true,

      recoveryReady:
        false,

      reason:
        "Safe encontrada, pero falta recuperar la creación original verificable.",
    };
  }

  if (
    !deployment.canReplayCrossChain
  ) {
    return {
      checked: true,

      detected: true,

      sourceNetworkName:
        worldNetwork.name,

      owners:
        worldSafe.owners,

      threshold:
        worldSafe.threshold,

      safe:
        worldSafe,

      deployment,

      deploymentRequired:
        true,

      recoveryReady:
        false,

      reason:
        "La Safe fue creada mediante un método dependiente de chainId; no puede recrearse en otra red con la misma dirección.",
    };
  }

  const [
    sourceFactoryCode,
    targetFactoryCode,
    sourceSingletonCode,
    targetSingletonCode,
  ] = await Promise.all([
    worldProvider.getCode(
      deployment.factory,
    ),

    targetProvider.getCode(
      deployment.factory,
    ),

    worldProvider.getCode(
      deployment.singleton,
    ),

    targetProvider.getCode(
      deployment.singleton,
    ),
  ]);

  const factoryCodeMatches =
    sourceFactoryCode !== "0x" &&
    targetFactoryCode !== "0x" &&
    ethers.keccak256(
      sourceFactoryCode,
    ) ===
      ethers.keccak256(
        targetFactoryCode,
      );

  const singletonCodeMatches =
    sourceSingletonCode !== "0x" &&
    targetSingletonCode !== "0x" &&
    ethers.keccak256(
      sourceSingletonCode,
    ) ===
      ethers.keccak256(
        targetSingletonCode,
      );

  if (
    !factoryCodeMatches ||
    !singletonCodeMatches
  ) {
    return {
      checked: true,

      detected: true,

      owners:
        worldSafe.owners,

      threshold:
        worldSafe.threshold,

      safe:
        worldSafe,

      deployment,

      deploymentRequired:
        true,

      recoveryReady:
        false,

      factoryCodeMatches,

      singletonCodeMatches,

      reason:
        "Los contratos Safe de la red objetivo no coinciden byte por byte con los utilizados en World Chain.",
    };
  }

  const targetFactory =
    new ethers.Contract(
      deployment.factory,
      SAFE_PROXY_FACTORY_ABI,
      targetProvider,
    );

  const targetCreationCode =
    await timeout(
      targetFactory
        .proxyCreationCode(),
      7_000,
      "Target Safe creationCode",
    );

  const targetPrediction =
    computeSafeAddress({
      factory:
        deployment.factory,

      singleton:
        deployment.singleton,

      initializer:
        deployment.initializer,

      saltNonce:
        deployment.saltNonce,

      proxyCreationCode:
        targetCreationCode,

      method:
        deployment.method,

      chainId:
        targetNetwork.chainId,
    });

  const targetPredictionMatches =
    sameAddress(
      targetPrediction,
      owner,
    );

  return {
    checked: true,

    detected: true,

    sourceChainId:
      WORLD_CHAIN_ID,

    sourceNetworkName:
      worldNetwork.name,

    address:
      normalizeAddress(owner),

    version:
      worldSafe.version,

    owners:
      worldSafe.owners,

    threshold:
      worldSafe.threshold,

    safe:
      worldSafe,

    deploymentRequired:
      true,

    factoryCodeMatches,

    singletonCodeMatches,

    targetPrediction,

    targetPredictionMatches,

    recoveryReady:
      targetPredictionMatches &&
      factoryCodeMatches &&
      singletonCodeMatches,

    deployment: {
      ...deployment,

      targetChainId:
        targetNetwork.chainId,

      targetNetworkName:
        targetNetwork.name,

      targetPrediction,

      targetPredictionMatches,

      ready:
        targetPredictionMatches &&
        factoryCodeMatches &&
        singletonCodeMatches,
    },
  };
}

// ============================================================================
// ACCOUNT INSPECTION
// ============================================================================

async function inspectAccount(
  provider,
  network,
  owner,
  accountCode,
  nativeBalance,
) {
  const hasCode =
    Boolean(
      accountCode &&
      accountCode !== "0x",
    );

  const [
    safe,
    erc1271,
    entryPoints,
    counterfactualSafe,
  ] = await Promise.all([
    inspectSafeAccount(
      provider,
      owner,
      hasCode,
    ),

    inspectErc1271(
      provider,
      owner,
      hasCode,
    ),

    inspectEntryPoints(
      provider,
    ),

    inspectCounterfactualSafeMirror(
      provider,
      network,
      owner,
      hasCode,
    ),
  ]);

  return {
    address:
      normalizeAddress(owner),

    chainId:
      network.chainId,

    networkName:
      network.name,

    hasCode,

    codeHash:
      hasCode
        ? ethers.keccak256(
            accountCode,
          )
        : null,

    kind:
      safe.detected
        ? "safe-smart-account"
        : hasCode
          ? "contract"
          : counterfactualSafe
              ?.recoveryReady
            ? "counterfactual-safe"
            : "no-contract",

    nativeGas: {
      symbol:
        network.symbol,

      hasBalance:
        nativeBalance > 0n,

      wei:
        nativeBalance.toString(),

      balance:
        ethers.formatEther(
          nativeBalance,
        ),

      displayBalance:
        formatBalance(
          nativeBalance,
          18,
        ),
    },

    safe,

    counterfactualSafe,

    erc1271,

    erc4337: {
      entryPointAvailable:
        entryPoints.some(
          (entry) =>
            entry.deployed,
        ),

      entryPoints,

      accountCompatibilityProven:
        false,

      requirement:
        "La existencia de EntryPoint no demuestra que esta cuenta soporte ERC-4337.",
    },
  };
}

// ============================================================================
// TOKEN SCAN
// ============================================================================

async function readToken(
  provider,
  network,
  owner,
  definition,
) {
  const rawAddress =
    definition.addresses?.[
      network.chainId
    ];

  if (!rawAddress) {
    return null;
  }

  const address =
    normalizeAddress(
      rawAddress,
    );

  const code =
    await timeout(
      provider.getCode(
        address,
      ),
      7_000,
      `${definition.symbol} code`,
    );

  if (
    !code ||
    code === "0x"
  ) {
    return null;
  }

  const contract =
    new ethers.Contract(
      address,
      ERC20_ABI,
      provider,
    );

  const [
    rawBalance,
    decimalsResult,
    symbolResult,
  ] = await Promise.all([
    timeout(
      contract.balanceOf(
        owner,
      ),
      7_000,
      `${definition.symbol} balance`,
    ),

    timeout(
      contract.decimals(),
      7_000,
      `${definition.symbol} decimals`,
    ),

    timeout(
      contract.symbol(),
      7_000,
      `${definition.symbol} symbol`,
    ).catch(
      () =>
        definition.symbol,
    ),
  ]);

  if (
    rawBalance === 0n
  ) {
    return null;
  }

  const decimals =
    Number(
      decimalsResult,
    );

  if (
    !Number.isInteger(
      decimals,
    ) ||
    decimals < 0 ||
    decimals > 255
  ) {
    throw new Error(
      `${definition.symbol}: decimales inválidos`,
    );
  }

  const symbol =
    typeof symbolResult ===
      "string" &&
    symbolResult.trim()
      ? symbolResult.trim()
      : definition.symbol;

  return {
    id:
      `${network.chainId}:${address.toLowerCase()}`,

    network,

    chainId:
      network.chainId,

    networkName:
      network.name,

    address,

    isNative: false,

    symbol,

    configuredSymbol:
      definition.symbol,

    decimals,

    rawBalance,

    balance:
      ethers.formatUnits(
        rawBalance,
        decimals,
      ),

    displayBalance:
      formatBalance(
        rawBalance,
        decimals,
      ),

    projectToken:
      Boolean(
        definition.projectToken,
      ),

    customToken:
      Boolean(
        definition.customToken,
      ),
  };
}

async function scanNetwork(
  network,
  owner,
  customTokens,
) {
  const provider =
    await getProvider(
      network,
    );

  const [
    accountCode,
    nativeBalance,
  ] = await Promise.all([
    timeout(
      provider.getCode(
        owner,
      ),
      7_000,
      `${network.name} account code`,
    ),

    timeout(
      provider.getBalance(
        owner,
      ),
      7_000,
      `${network.name} native balance`,
    ),
  ]);

  const accountState =
    await inspectAccount(
      provider,
      network,
      owner,
      accountCode,
      nativeBalance,
    );

  const assets = [];

  if (
    nativeBalance > 0n
  ) {
    assets.push({
      id:
        `${network.chainId}:native`,

      network,

      chainId:
        network.chainId,

      networkName:
        network.name,

      address: null,

      isNative: true,

      symbol:
        network.symbol,

      configuredSymbol:
        network.symbol,

      decimals: 18,

      rawBalance:
        nativeBalance,

      balance:
        ethers.formatEther(
          nativeBalance,
        ),

      displayBalance:
        formatBalance(
          nativeBalance,
          18,
        ),

      accountKind:
        accountState.kind,

      accountState,
    });
  }

  const definitions = [
    ...TOKENS.filter(
      (token) =>
        token.addresses?.[
          network.chainId
        ],
    ),

    ...customTokens
      .filter(
        (token) =>
          Number(
            token.chainId,
          ) ===
          network.chainId,
      )
      .map((token) => ({
        symbol:
          token.symbol ??
          "CUSTOM",

        customToken: true,

        addresses: {
          [network.chainId]:
            token.address,
        },
      })),
  ];

  const tokenResults =
    await Promise.allSettled(
      definitions.map(
        (definition) =>
          readToken(
            provider,
            network,
            owner,
            definition,
          ),
      ),
    );

  for (
    const result of tokenResults
  ) {
    if (
      result.status ===
        "fulfilled" &&
      result.value
    ) {
      assets.push({
        ...result.value,

        accountKind:
          accountState.kind,

        accountState,
      });
    } else if (
      result.status ===
      "rejected"
    ) {
      console.warn(
        `[TOKEN ${network.name}]`,
        result.reason,
      );
    }
  }

  return {
    network,

    accountKind:
      accountState.kind,

    accountState,

    assets,
  };
}

export async function scanAllNetworks(
  ownerAddress,
  customTokens = [],
) {
  const owner =
    normalizeAddress(
      ownerAddress,
    );

  const results =
    await Promise.allSettled(
      NETWORKS.map(
        (network) =>
          scanNetwork(
            network,
            owner,
            customTokens,
          ),
      ),
    );

  const assets = [];
  const networks = {};

  results.forEach(
    (result, index) => {
      const network =
        NETWORKS[index];

      if (
        result.status ===
        "fulfilled"
      ) {
        assets.push(
          ...result.value.assets,
        );

        networks[
          network.chainId
        ] = {
          status: "online",

          accountKind:
            result.value
              .accountKind,

          accountState:
            result.value
              .accountState,
        };
      } else {
        networks[
          network.chainId
        ] = {
          status: "offline",

          error:
            result.reason instanceof Error
              ? result.reason.message
              : "No se pudo consultar la red",
        };
      }
    },
  );

  const uniqueAssets = [
    ...new Map(
      assets.map((asset) => [
        asset.id,
        asset,
      ]),
    ).values(),
  ];

  uniqueAssets.sort(
    (left, right) => {
      const leftExternal =
        left.chainId !==
        WORLD_CHAIN_ID;

      const rightExternal =
        right.chainId !==
        WORLD_CHAIN_ID;

      if (
        leftExternal !==
        rightExternal
      ) {
        return leftExternal
          ? -1
          : 1;
      }

      if (
        left.chainId !==
        right.chainId
      ) {
        return (
          left.chainId -
          right.chainId
        );
      }

      return left.symbol.localeCompare(
        right.symbol,
      );
    },
  );

  return {
    owner,

    assets:
      uniqueAssets,

    networks,
  };
}

// ============================================================================
// NETWORK SWITCH
// ============================================================================

export async function switchExternalNetwork(
  provider,
  network,
) {
  if (
    !provider?.request
  ) {
    throw new Error(
      "Proveedor EIP-1193 inválido",
    );
  }

  try {
    await provider.request({
      method:
        "wallet_switchEthereumChain",

      params: [
        {
          chainId:
            network.chainHex,
        },
      ],
    });
  } catch (error) {
    if (
      Number(error?.code) !==
      4902
    ) {
      throw error;
    }

    await provider.request({
      method:
        "wallet_addEthereumChain",

      params: [
        {
          chainId:
            network.chainHex,

          chainName:
            network.name,

          nativeCurrency: {
            name:
              network.symbol,

            symbol:
              network.symbol,

            decimals: 18,
          },

          rpcUrls:
            network.rpcUrls,

          blockExplorerUrls: [
            network.explorer,
          ],
        },
      ],
    });
  }
}

// ============================================================================
// TRANSFER REQUEST
// ============================================================================

function prepareTransfer({
  asset,
  targetAddress,
  recipient,
  amount,
}) {
  const owner =
    normalizeAddress(
      targetAddress,
    );

  const destination =
    normalizeAddress(
      recipient,
    );

  if (
    sameAddress(
      owner,
      destination,
    )
  ) {
    throw new Error(
      "La dirección de destino es igual a la dirección origen",
    );
  }

  const normalizedAmount =
    String(amount)
      .trim()
      .replace(",", ".");

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalizedAmount,
    )
  ) {
    throw new Error(
      "Cantidad inválida",
    );
  }

  const amountUnits =
    ethers.parseUnits(
      normalizedAmount,
      asset.decimals,
    );

  if (
    amountUnits <= 0n
  ) {
    throw new Error(
      "La cantidad debe ser mayor que cero",
    );
  }

  if (
    amountUnits >
    asset.rawBalance
  ) {
    throw new Error(
      "La cantidad supera el balance detectado",
    );
  }

  const request =
    asset.isNative
      ? {
          to:
            destination,

          value:
            amountUnits,

          data: "0x",
        }
      : {
          to:
            normalizeAddress(
              asset.address,
            ),

          value: 0n,

          data:
            ERC20_INTERFACE
              .encodeFunctionData(
                "transfer",
                [
                  destination,
                  amountUnits,
                ],
              ),
        };

  return {
    owner,

    destination,

    amountUnits,

    request,
  };
}

// ============================================================================
// DIRECT EOA TRANSFER
// ============================================================================

async function sendDirectTransfer({
  provider,
  signer,
  asset,
  transfer,
}) {
  const feeData =
    await provider.getFeeData();

  const estimatedGas =
    await signer.estimateGas(
      transfer.request,
    );

  const gasLimit =
    applyBuffer(
      BigInt(
        estimatedGas,
      ),
      GAS_LIMIT_BUFFER_BPS,
    );

  const maxGasPrice =
    getMaxGasPrice(
      feeData,
    );

  const maximumGasCost =
    gasLimit *
    maxGasPrice;

  const signerAddress =
    normalizeAddress(
      await signer.getAddress(),
    );

  const nativeBalance =
    await provider.getBalance(
      signerAddress,
    );

  const requiredValue =
    asset.isNative
      ? transfer.amountUnits
      : 0n;

  const requiredTotal =
    maximumGasCost +
    requiredValue;

  if (
    nativeBalance <
    requiredTotal
  ) {
    throw new Error(
      `Gas insuficiente. Disponible: ${formatBalance(
        nativeBalance,
        18,
        8,
      )} ${asset.network.symbol}; máximo estimado necesario: ${formatBalance(
        requiredTotal,
        18,
        8,
      )} ${asset.network.symbol}.`,
    );
  }

  const transaction =
    await signer.sendTransaction({
      ...transfer.request,

      gasLimit,
    });

  const receipt =
    await transaction.wait(1);

  return {
    route:
      "direct-eoa",

    hash:
      transaction.hash,

    hashes: [
      transaction.hash,
    ],

    receipt,

    receipts: [
      receipt,
    ],
  };
}

// ============================================================================
// SAFE SIGNATURE
// ============================================================================

async function signSafeTransaction({
  signer,
  signerAddress,
  safeAddress,
  chainId,
  safeTx,
  nonce,
  safeTxHash,
}) {
  const domain = {
    chainId,
    verifyingContract:
      safeAddress,
  };

  const types = {
    SafeTx: [
      {
        name: "to",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "operation",
        type: "uint8",
      },
      {
        name: "safeTxGas",
        type: "uint256",
      },
      {
        name: "baseGas",
        type: "uint256",
      },
      {
        name: "gasPrice",
        type: "uint256",
      },
      {
        name: "gasToken",
        type: "address",
      },
      {
        name: "refundReceiver",
        type: "address",
      },
      {
        name: "nonce",
        type: "uint256",
      },
    ],
  };

  const message = {
    to:
      safeTx.to,

    value:
      safeTx.value,

    data:
      safeTx.data,

    operation:
      safeTx.operation,

    safeTxGas: 0n,

    baseGas: 0n,

    gasPrice: 0n,

    gasToken:
      ethers.ZeroAddress,

    refundReceiver:
      ethers.ZeroAddress,

    nonce,
  };

  try {
    const signature =
      await signer.signTypedData(
        domain,
        types,
        message,
      );

    const recovered =
      ethers.verifyTypedData(
        domain,
        types,
        message,
        signature,
      );

    if (
      !sameAddress(
        recovered,
        signerAddress,
      )
    ) {
      throw new Error(
        "La firma EIP-712 no recupera el owner esperado",
      );
    }

    return signature;
  } catch (typedError) {
    // Fallback Safe ETH_SIGN.
    const rawSignature =
      await signer.signMessage(
        ethers.getBytes(
          safeTxHash,
        ),
      );

    const parsed =
      ethers.Signature.from(
        rawSignature,
      );

    const safeV =
      Number(parsed.v) + 4;

    return ethers.concat([
      parsed.r,
      parsed.s,
      ethers.toBeHex(
        safeV,
        1,
      ),
    ]);
  }
}

// ============================================================================
// SAFE EXECUTION
// ============================================================================

async function executeSafeTransfer({
  provider,
  signer,
  signerAddress,
  asset,
  transfer,
  safe,
}) {
  if (
    !safe?.detected
  ) {
    throw new Error(
      "La dirección no fue confirmada como Safe",
    );
  }

  if (
    safe.threshold !== 1
  ) {
    throw new Error(
      `Esta Safe requiere ${safe.threshold} firmas. RC Wallet no ejecutará una transacción incompleta.`,
    );
  }

  if (
    !safeOwnersInclude(
      safe,
      signerAddress,
    )
  ) {
    throw new Error(
      "La wallet conectada no aparece como owner de esta Safe",
    );
  }

  const safeAddress =
    transfer.owner;

  const contract =
    new ethers.Contract(
      safeAddress,
      SAFE_EXECUTION_ABI,
      signer,
    );

  const nonce =
    await contract.nonce();

  const safeTx = {
    to:
      transfer.request.to,

    value:
      transfer.request.value ??
      0n,

    data:
      transfer.request.data ??
      "0x",

    operation:
      SAFE_OPERATION_CALL,
  };

  const safeTxHash =
    await contract
      .getTransactionHash(
        safeTx.to,
        safeTx.value,
        safeTx.data,
        safeTx.operation,
        0n,
        0n,
        0n,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        nonce,
      );

  const network =
    await provider.getNetwork();

  const signature =
    await signSafeTransaction({
      signer,

      signerAddress,

      safeAddress,

      chainId:
        Number(
          network.chainId,
        ),

      safeTx,

      nonce,

      safeTxHash,
    });

  const args = [
    safeTx.to,

    safeTx.value,

    safeTx.data,

    safeTx.operation,

    0n,

    0n,

    0n,

    ethers.ZeroAddress,

    ethers.ZeroAddress,

    signature,
  ];

  const estimatedGas =
    await contract
      .execTransaction
      .estimateGas(
        ...args,
      );

  const gasLimit =
    applyBuffer(
      BigInt(
        estimatedGas,
      ),
      GAS_LIMIT_BUFFER_BPS,
    );

  const feeData =
    await provider.getFeeData();

  const maximumGasPrice =
    getMaxGasPrice(
      feeData,
    );

  const maximumGasCost =
    gasLimit *
    maximumGasPrice;

  const payerBalance =
    await provider.getBalance(
      signerAddress,
    );

  if (
    payerBalance <
    maximumGasCost
  ) {
    throw new Error(
      `El owner no tiene suficiente ${asset.network.symbol} para ejecutar la Safe. Necesita aproximadamente ${formatBalance(
        maximumGasCost,
        18,
        8,
      )} ${asset.network.symbol}.`,
    );
  }

  const transaction =
    await contract
      .execTransaction(
        ...args,
        {
          gasLimit,
        },
      );

  const receipt =
    await transaction.wait(1);

  return {
    route:
      "safe-owner",

    hash:
      transaction.hash,

    hashes: [
      transaction.hash,
    ],

    safeTxHash,

    receipt,

    receipts: [
      receipt,
    ],
  };
}

// ============================================================================
// SAFE MIRROR DEPLOYMENT
// ============================================================================

async function deploySafeMirror({
  provider,
  signer,
  signerAddress,
  asset,
  transfer,
  mirror,
}) {
  const deployment =
    mirror?.deployment;

  if (
    !mirror?.recoveryReady ||
    !deployment?.ready
  ) {
    throw new Error(
      "No existe una reconstrucción determinística verificada para esta Safe",
    );
  }

  if (
    !deployment
      .targetPredictionMatches
  ) {
    throw new Error(
      "La dirección CREATE2 calculada NO coincide con la dirección que contiene los fondos. Operación bloqueada.",
    );
  }

  if (
    !sameAddress(
      deployment
        .targetPrediction,
      transfer.owner,
    )
  ) {
    throw new Error(
      "La dirección Safe objetivo no coincide exactamente con la dirección de los fondos",
    );
  }

  if (
    mirror.threshold !== 1
  ) {
    throw new Error(
      `La Safe requiere ${mirror.threshold} firmas. No se desplegará automáticamente.`,
    );
  }

  if (
    !(mirror.owners ?? [])
      .some((owner) =>
        sameAddress(
          owner,
          signerAddress,
        ),
      )
  ) {
    throw new Error(
      "La wallet conectada no es owner de la Safe original",
    );
  }

  const currentCode =
    await provider.getCode(
      transfer.owner,
    );

  if (
    currentCode &&
    currentCode !== "0x"
  ) {
    return {
      deployedNow: false,
    };
  }

  const factory =
    new ethers.Contract(
      deployment.factory,
      SAFE_PROXY_FACTORY_ABI,
      signer,
    );

  const saltNonce =
    BigInt(
      deployment.saltNonce,
    );

  let estimateGas;
  let sendDeployment;

  if (
    deployment.method ===
    "createProxyWithNonceL2"
  ) {
    estimateGas = () =>
      factory
        .createProxyWithNonceL2
        .estimateGas(
          deployment.singleton,
          deployment.initializer,
          saltNonce,
        );

    sendDeployment =
      (overrides) =>
        factory
          .createProxyWithNonceL2(
            deployment.singleton,
            deployment.initializer,
            saltNonce,
            overrides,
          );
  } else if (
    deployment.method ===
    "createProxyWithNonce"
  ) {
    estimateGas = () =>
      factory
        .createProxyWithNonce
        .estimateGas(
          deployment.singleton,
          deployment.initializer,
          saltNonce,
        );

    sendDeployment =
      (overrides) =>
        factory
          .createProxyWithNonce(
            deployment.singleton,
            deployment.initializer,
            saltNonce,
            overrides,
          );
  } else {
    throw new Error(
      `Método Safe no reproducible automáticamente: ${deployment.method}`,
    );
  }

  const estimatedGas =
    await timeout(
      estimateGas(),
      12_000,
      "Safe deployment gas",
    );

  const gasLimit =
    applyBuffer(
      BigInt(
        estimatedGas,
      ),
      GAS_LIMIT_BUFFER_BPS,
    );

  const feeData =
    await provider.getFeeData();

  const maximumGasPrice =
    getMaxGasPrice(
      feeData,
    );

  // Reservamos además gas para ejecutar la Safe después.
  const executionReserve =
    500_000n *
    maximumGasPrice;

  const required =
    gasLimit *
      maximumGasPrice +
    executionReserve;

  const balance =
    await provider.getBalance(
      signerAddress,
    );

  if (
    balance < required
  ) {
    throw new Error(
      `Gas insuficiente para desplegar y ejecutar la Safe. Disponible: ${formatBalance(
        balance,
        18,
        8,
      )} ${asset.network.symbol}; reserva recomendada: ${formatBalance(
        required,
        18,
        8,
      )} ${asset.network.symbol}.`,
    );
  }

  const transaction =
    await sendDeployment({
      gasLimit,
    });

  const receipt =
    await transaction.wait(1);

  const deployedCode =
    await provider.getCode(
      transfer.owner,
    );

  if (
    !deployedCode ||
    deployedCode === "0x"
  ) {
    throw new Error(
      "El despliegue terminó pero la Safe no apareció en la dirección esperada",
    );
  }

  const safe =
    await inspectSafeAccount(
      provider,
      transfer.owner,
      true,
    );

  if (!safe.detected) {
    throw new Error(
      "El contrato desplegado no responde como Safe",
    );
  }

  if (
    safe.threshold !==
    mirror.threshold
  ) {
    throw new Error(
      "El threshold de la Safe desplegada no coincide con World Chain",
    );
  }

  const expectedOwners =
    [...mirror.owners]
      .map(normalizeAddress)
      .sort();

  const deployedOwners =
    [...safe.owners]
      .map(normalizeAddress)
      .sort();

  if (
    JSON.stringify(
      expectedOwners,
    ) !==
    JSON.stringify(
      deployedOwners,
    )
  ) {
    throw new Error(
      "Los owners de la Safe desplegada no coinciden con World Chain. Movimiento detenido.",
    );
  }

  return {
    deployedNow: true,

    hash:
      transaction.hash,

    receipt,

    safe,
  };
}

// ============================================================================
// REFRESH TARGET ACCOUNT
// ============================================================================

async function refreshAccountState(
  provider,
  asset,
  owner,
) {
  const code =
    await timeout(
      provider.getCode(owner),
      7_000,
      "Target account code",
    );

  const hasCode =
    Boolean(
      code &&
      code !== "0x",
    );

  const safe =
    await inspectSafeAccount(
      provider,
      owner,
      hasCode,
    );

  let counterfactualSafe =
    null;

  if (!hasCode) {
    counterfactualSafe =
      await inspectCounterfactualSafeMirror(
        provider,
        asset.network,
        owner,
        false,
      );
  }

  return {
    ...(asset.accountState ?? {}),

    address:
      normalizeAddress(owner),

    hasCode,

    kind:
      safe.detected
        ? "safe-smart-account"
        : hasCode
          ? "contract"
          : counterfactualSafe
              ?.recoveryReady
            ? "counterfactual-safe"
            : "no-contract",

    safe,

    counterfactualSafe,
  };
}

// ============================================================================
// EXTERNAL WALLET SEND
// ============================================================================

export async function sendWithExternalWallet({
  provider,
  asset,
  targetAddress,
  recipient,
  amount,
  onStatus,
}) {
  if (
    !provider?.request
  ) {
    throw new Error(
      "La wallet externa no expone un proveedor EIP-1193",
    );
  }

  const transfer =
    prepareTransfer({
      asset,
      targetAddress,
      recipient,
      amount,
    });

  await switchExternalNetwork(
    provider,
    asset.network,
  );

  const browserProvider =
    new ethers.BrowserProvider(
      provider,
    );

  const signer =
    await browserProvider
      .getSigner();

  const signerAddress =
    normalizeAddress(
      await signer.getAddress(),
    );

  // ------------------------------------------------------------------------
  // EOA DIRECTA
  // ------------------------------------------------------------------------

  if (
    sameAddress(
      signerAddress,
      transfer.owner,
    )
  ) {
    onStatus?.(
      "La wallet conectada controla directamente la dirección con fondos.",
      "info",
    );

    return sendDirectTransfer({
      provider:
        browserProvider,

      signer,

      asset,

      transfer,
    });
  }

  // ------------------------------------------------------------------------
  // SMART ACCOUNT / SAFE
  // ------------------------------------------------------------------------

  onStatus?.(
    "La wallet firmante no es la dirección de los fondos. Verificando si es owner de una Safe…",
    "info",
  );

  let accountState =
    await refreshAccountState(
      browserProvider,
      asset,
      transfer.owner,
    );

  // Safe ya desplegada en la red objetivo.
  if (
    accountState.safe
      ?.detected
  ) {
    if (
      !safeOwnersInclude(
        accountState.safe,
        signerAddress,
      )
    ) {
      throw new Error(
        "La wallet conectada no aparece entre los owners de la Safe que contiene los fondos",
      );
    }

    return executeSafeTransfer({
      provider:
        browserProvider,

      signer,

      signerAddress,

      asset,

      transfer,

      safe:
        accountState.safe,
    });
  }

  // ------------------------------------------------------------------------
  // SAFE CONTRAFACTUAL:
  // existe en World Chain pero aún no en la red de los fondos.
  // ------------------------------------------------------------------------

  const mirror =
    accountState
      .counterfactualSafe;

  if (
    !mirror?.detected
  ) {
    throw new Error(
      "La dirección con fondos no está controlada por la wallet conectada y no se pudo demostrar una Safe equivalente en World Chain.",
    );
  }

  if (
    !(mirror.owners ?? [])
      .some((owner) =>
        sameAddress(
          owner,
          signerAddress,
        ),
      )
  ) {
    throw new Error(
      "La wallet conectada no aparece como owner de la Safe original de World App.",
    );
  }

  if (
    !mirror.recoveryReady
  ) {
    throw new Error(
      mirror.reason ??
        "La Safe existe en World Chain, pero todavía no se ha demostrado un despliegue idéntico en esta red.",
    );
  }

  onStatus?.(
    "La reconstrucción CREATE2 coincide exactamente. Preparando despliegue de la misma Safe…",
    "warning",
  );

  const deployment =
    await deploySafeMirror({
      provider:
        browserProvider,

      signer,

      signerAddress,

      asset,

      transfer,

      mirror,
    });

  onStatus?.(
    deployment.deployedNow
      ? "Safe desplegada en la dirección exacta. Verificando owners antes de mover los fondos…"
      : "La Safe ya estaba desplegada. Verificando owners…",
    "info",
  );

  accountState =
    await refreshAccountState(
      browserProvider,
      asset,
      transfer.owner,
    );

  if (
    !accountState.safe
      ?.detected
  ) {
    throw new Error(
      "Después del despliegue la dirección no responde como Safe. Movimiento bloqueado.",
    );
  }

  if (
    !safeOwnersInclude(
      accountState.safe,
      signerAddress,
    )
  ) {
    throw new Error(
      "La Safe desplegada no reconoce la wallet conectada como owner. Los fondos NO serán movidos.",
    );
  }

  const execution =
    await executeSafeTransfer({
      provider:
        browserProvider,

      signer,

      signerAddress,

      asset: {
        ...asset,

        accountState,
      },

      transfer,

      safe:
        accountState.safe,
    });

  return {
    ...execution,

    deployment,

    route:
      "safe-counterfactual-recovery",

    hashes: [
      ...(deployment.hash
        ? [
            deployment.hash,
          ]
        : []),

      ...(execution.hashes ??
        []),
    ],

    receipts: [
      ...(deployment.receipt
        ? [
            deployment.receipt,
          ]
        : []),

      ...(execution.receipts ??
        []),
    ],
  };
}
