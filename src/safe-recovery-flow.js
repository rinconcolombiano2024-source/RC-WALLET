import { MiniKit } from "@worldcoin/minikit-js";

import {
  normalizeAddress,
} from "./blockchain.js";

import {
  executeSignedSafeRecovery,
  prepareSafeRecoveryIntent,
  verifyMiniKitSafeRecoverySignature,
} from "./safe-recovery.js";

import {
  WORLD_CHAIN_ID,
} from "./config.js";

// ============================================================================
// RC WALLET — WORLD APP SAFE RECOVERY FLOW
// ============================================================================
//
// Este módulo conecta:
//
// World App / MiniKit
//        ↓
// firma EIP-712 SafeTx exacta
//        ↓
// owner real verificado
//        ↓
// Safe Recovery Engine
//        ↓
// wallet externa = SOLO pagador de gas
//
// REGLAS:
//
// - World App debe autenticar exactamente la Safe analizada.
// - MiniKit debe ejecutar la firma realmente dentro de World App.
// - No aceptamos fallback.
// - No aceptamos wagmi como sustituto de World App.
// - SafeTx debe incluir explícitamente chainId objetivo.
// - domain.chainId debe coincidir con chainId superior.
// - verifyingContract debe ser exactamente la Safe.
// - La firma debe recuperar un owner.
// - threshold debe quedar satisfecho.
// - La wallet externa NO adquiere autoridad sobre los fondos.
// - Nunca claves privadas.
// - Nunca seed phrases.
// - Nunca ejecutar una firma genérica como autorización financiera.
//
// ============================================================================

const FLOW_FORMAT =
  "rc-wallet-world-safe-recovery";

const FLOW_VERSION = 1;

const MINIKIT_READY_TIMEOUT_MS =
  4_000;

const MINIKIT_SIGN_TIMEOUT_MS =
  60_000;

// ============================================================================
// BASIC HELPERS
// ============================================================================

function wait(milliseconds) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );
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
    !Number.isSafeInteger(
      chainId,
    ) ||
    chainId <= 0
  ) {
    throw new Error(
      "chainId inválida",
    );
  }

  return chainId;
}

function isHexSignature(
  value,
) {
  return (
    typeof value === "string" &&
    /^0x[a-fA-F0-9]+$/.test(
      value,
    ) &&
    value.length > 2 &&
    value.length % 2 === 0
  );
}

function errorMessage(
  error,
  fallback =
    "Operación desconocida",
) {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  if (
    typeof error === "string" &&
    error.trim()
  ) {
    return error.trim();
  }

  return fallback;
}

function extractMiniKitErrorCode(
  errorOrResult,
) {
  const candidates = [
    errorOrResult?.error_code,

    errorOrResult?.code,

    errorOrResult?.data
      ?.error_code,

    errorOrResult?.data
      ?.code,
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      typeof candidate ===
        "string" &&
      candidate.trim()
    ) {
      return candidate
        .trim()
        .toLowerCase();
    }
  }

  const text =
    errorMessage(
      errorOrResult,
      "",
    )
      .toLowerCase();

  const knownCodes = [
    "invalid_operation",
    "user_rejected",
    "input_error",
    "simulation_failed",
    "generic_error",
    "disallowed_operation",
    "invalid_contract",
    "malicious_operation",
  ];

  return (
    knownCodes.find(
      (code) =>
        text.includes(code),
    ) ?? null
  );
}

// ============================================================================
// MINIKIT ERROR CLASSIFICATION
// ============================================================================

export function classifySafeRecoverySigningError(
  errorOrResult,
) {
  const code =
    extractMiniKitErrorCode(
      errorOrResult,
    );

  switch (code) {
    case "user_rejected":
      return {
        code,

        retryable: true,

        title:
          "Firma cancelada",

        message:
          "La solicitud fue rechazada por el usuario. No se realizó ninguna operación.",
      };

    case "invalid_contract":
      return {
        code,

        retryable: false,

        title:
          "Contrato objetivo no aceptado",

        message:
          "World App rechazó el verifyingContract de la Safe. Si la Safe todavía no está desplegada en la red objetivo, puede ser necesario verificar y desplegar primero el espejo determinístico antes de volver a solicitar la firma.",
      };

    case "disallowed_operation":
      return {
        code,

        retryable: false,

        title:
          "World App no permite esta firma",

        message:
          "MiniKit rechazó esta operación por política. RC Wallet no intentará eludir esa restricción.",
      };

    case "simulation_failed":
      return {
        code,

        retryable: false,

        title:
          "La simulación de World App falló",

        message:
          "World App no pudo validar la solicitud de firma. No se continuará con despliegue ni transferencia.",
      };

    case "input_error":
    case "invalid_operation":
      return {
        code,

        retryable: false,

        title:
          "SafeTx inválida",

        message:
          "MiniKit rechazó la estructura EIP-712. Revisa chainId, verifyingContract, tipos y mensaje antes de continuar.",
      };

    case "malicious_operation":
      return {
        code,

        retryable: false,

        title:
          "Operación bloqueada por seguridad",

        message:
          "World App clasificó la solicitud como peligrosa. RC Wallet detendrá completamente esta ruta.",
      };

    default:
      return {
        code:
          code ??
          "unknown",

        retryable: true,

        title:
          "No se pudo firmar la SafeTx",

        message:
          errorMessage(
            errorOrResult,
            "World App no devolvió una autorización válida.",
          ),
      };
  }
}

// ============================================================================
// TIMEOUT
// ============================================================================

function withTimeout(
  command,
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
    Promise.resolve()
      .then(command),

    timeoutPromise,
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// ============================================================================
// MINIKIT READY
// ============================================================================

async function waitForMiniKitReady(
  timeoutMs =
    MINIKIT_READY_TIMEOUT_MS,
) {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {
    if (
      Boolean(
        MiniKit.isInstalled?.(),
      )
    ) {
      return true;
    }

    await wait(100);
  }

  return Boolean(
    MiniKit.isInstalled?.(),
  );
}

async function assertMiniKitReady() {
  const installed =
    await waitForMiniKitReady();

  if (!installed) {
    throw new Error(
      "MiniKit no está disponible. Abre RC Wallet directamente dentro de World App.",
    );
  }

  /*
   * MiniKit 2.x puede exponer isInWorldApp().
   * Usamos optional chaining para mantener compatibilidad.
   */
  if (
    typeof MiniKit.isInWorldApp ===
      "function" &&
    !MiniKit.isInWorldApp()
  ) {
    throw new Error(
      "La firma Safe debe realizarse dentro de World App.",
    );
  }
}

// ============================================================================
// WORLD SESSION
// ============================================================================

function assertWorldSession({
  targetAddress,
  authenticatedWorldAddress,
}) {
  if (!targetAddress) {
    throw new Error(
      "No existe una dirección Safe seleccionada",
    );
  }

  if (!authenticatedWorldAddress) {
    throw new Error(
      "Autentica primero la cuenta de World App",
    );
  }

  const safeAddress =
    normalizeAddress(
      targetAddress,
    );

  const worldAddress =
    normalizeAddress(
      authenticatedWorldAddress,
    );

  if (
    !sameAddress(
      safeAddress,
      worldAddress,
    )
  ) {
    throw new Error(
      "La sesión World App no coincide con la dirección que contiene los fondos",
    );
  }

  return {
    safeAddress,
    worldAddress,
  };
}

// ============================================================================
// INTENT CONSISTENCY
// ============================================================================

function assertIntentConsistency({
  intent,
  targetAddress,
  asset,
}) {
  if (!intent) {
    throw new Error(
      "No existe un intento Safe preparado",
    );
  }

  const chainId =
    normalizeChainId(
      asset?.chainId,
    );

  if (
    chainId ===
    WORLD_CHAIN_ID
  ) {
    throw new Error(
      "El flujo Safe Recovery externo no se utiliza para World Chain",
    );
  }

  const typedChainId =
    normalizeChainId(
      intent.typedData
        ?.chainId,
    );

  const domainChainId =
    normalizeChainId(
      intent.typedData
        ?.domain
        ?.chainId,
    );

  if (
    typedChainId !==
      chainId ||
    domainChainId !==
      chainId
  ) {
    throw new Error(
      "La SafeTx no pertenece a la misma blockchain que el activo",
    );
  }

  if (
    typedChainId !==
    domainChainId
  ) {
    throw new Error(
      "SafeTx inválida: chainId y domain.chainId no coinciden",
    );
  }

  if (
    !sameAddress(
      intent.safeAddress,
      targetAddress,
    )
  ) {
    throw new Error(
      "El intento Safe no pertenece a la dirección que contiene los fondos",
    );
  }

  if (
    !sameAddress(
      intent.typedData
        ?.domain
        ?.verifyingContract,
      targetAddress,
    )
  ) {
    throw new Error(
      "verifyingContract de la SafeTx no coincide con la Safe origen",
    );
  }

  if (
    intent.safe?.threshold !==
      1
  ) {
    throw new Error(
      `Esta ruta requiere threshold=1. La Safe reporta threshold=${intent.safe?.threshold ?? "desconocido"}.`,
    );
  }

  if (
    !Array.isArray(
      intent.safe?.owners,
    ) ||
    intent.safe.owners
      .length === 0
  ) {
    throw new Error(
      "El intento no contiene owners Safe verificables",
    );
  }
}

// ============================================================================
// MINIKIT RESULT
// ============================================================================

function parseMiniKitSignatureResult(
  result,
) {
  if (!result) {
    throw new Error(
      "MiniKit no devolvió una respuesta",
    );
  }

  /*
   * Esta recuperación debe demostrar autoridad
   * entregada por WORLD APP.
   *
   * No aceptamos wagmi ni fallback como sustitutos.
   */
  if (
    result.executedWith !==
      "minikit"
  ) {
    throw new Error(
      `La firma no fue ejecutada por World App. executedWith=${String(
        result.executedWith ??
          "unknown",
      )}.`,
    );
  }

  const data =
    result.data;

  if (
    !data ||
    data.status !==
      "success"
  ) {
    const classified =
      classifySafeRecoverySigningError(
        result,
      );

    const error =
      new Error(
        classified.message,
      );

    error.code =
      classified.code;

    throw error;
  }

  if (
    !isHexSignature(
      data.signature,
    )
  ) {
    throw new Error(
      "World App no devolvió una firma hexadecimal válida",
    );
  }

  if (
    !data.address ||
    !/^0x[a-fA-F0-9]{40}$/.test(
      String(
        data.address,
      ),
    )
  ) {
    throw new Error(
      "World App no devolvió una dirección de firma válida",
    );
  }

  return {
    signature:
      data.signature,

    reportedAddress:
      normalizeAddress(
        data.address,
      ),

    version:
      data.version ??
      null,
  };
}

// ============================================================================
// PREPARE + SIGN
// ============================================================================

export async function prepareAndSignWorldSafeRecovery({
  asset,
  targetAddress,
  authenticatedWorldAddress,
  recipient,
  amount,
  onStatus,
}) {
  await assertMiniKitReady();

  const {
    safeAddress,
    worldAddress,
  } =
    assertWorldSession({
      targetAddress,
      authenticatedWorldAddress,
    });

  if (!asset) {
    throw new Error(
      "Selecciona primero el activo que deseas recuperar",
    );
  }

  if (
    Number(
      asset.chainId,
    ) ===
    WORLD_CHAIN_ID
  ) {
    throw new Error(
      "Los activos de World Chain se mueven directamente con MiniKit. Esta ruta es para Ethereum y otras redes externas.",
    );
  }

  onStatus?.(
    "Reconstruyendo la SafeTx exacta sin mover fondos…",
    "info",
  );

  const intent =
    await prepareSafeRecoveryIntent({
      asset,

      targetAddress:
        safeAddress,

      recipient,

      amount,
    });

  assertIntentConsistency({
    intent,

    targetAddress:
      safeAddress,

    asset,
  });

  onStatus?.(
    `SafeTx preparada para chainId ${intent.chainId}. Solicitando firma al owner mediante World App…`,
    "warning",
  );

  let result;

  try {
    result =
      await withTimeout(
        () =>
          MiniKit.signTypedData(
            intent.typedData,
          ),

        MINIKIT_SIGN_TIMEOUT_MS,

        "World App SafeTx",
      );
  } catch (error) {
    const classified =
      classifySafeRecoverySigningError(
        error,
      );

    const enriched =
      new Error(
        `${classified.title}: ${classified.message}`,
      );

    enriched.code =
      classified.code;

    enriched.retryable =
      classified.retryable;

    throw enriched;
  }

  let miniKitSignature;

  try {
    miniKitSignature =
      parseMiniKitSignatureResult(
        result,
      );
  } catch (error) {
    const classified =
      classifySafeRecoverySigningError(
        error,
      );

    const enriched =
      new Error(
        `${classified.title}: ${classified.message}`,
      );

    enriched.code =
      classified.code;

    enriched.retryable =
      classified.retryable;

    throw enriched;
  }

  /*
   * CRITICAL:
   *
   * Ahora comprobamos matemáticamente si la firma
   * recupera uno de los owners reales.
   */
  const signatureAnalysis =
    verifyMiniKitSafeRecoverySignature({
      intent,

      signature:
        miniKitSignature.signature,

      reportedAddress:
        miniKitSignature
          .reportedAddress,
    });

  if (
    !signatureAnalysis
      .signerIsOwner
  ) {
    throw new Error(
      "World App firmó la solicitud, pero la firma no recupera un owner de esta Safe",
    );
  }

  if (
    !signatureAnalysis
      .singleSignatureSatisfiesThreshold
  ) {
    throw new Error(
      "La firma pertenece a un owner, pero no satisface el threshold requerido",
    );
  }

  if (
    String(
      signatureAnalysis.digest,
    ).toLowerCase() !==
    String(
      intent.digest,
    ).toLowerCase()
  ) {
    throw new Error(
      "El hash analizado no coincide con el hash SafeTx preparado",
    );
  }

  const createdAt =
    Date.now();

  const prepared = {
    format:
      FLOW_FORMAT,

    version:
      FLOW_VERSION,

    createdAt:
      new Date(
        createdAt,
      ).toISOString(),

    expiresAt:
      intent.expiresAt,

    targetAddress:
      safeAddress,

    authenticatedWorldAddress:
      worldAddress,

    chainId:
      intent.chainId,

    asset: {
      id:
        asset.id ??
        null,

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

      amount:
        intent.asset
          .amount,

      amountUnits:
        intent.asset
          .amountUnits,

      recipient:
        intent.asset
          .recipient,
    },

    intent,

    authorization: {
      executedWith:
        "minikit",

      signature:
        miniKitSignature
          .signature,

      reportedAddress:
        miniKitSignature
          .reportedAddress,

      miniKitVersion:
        miniKitSignature
          .version,

      recoveredOwner:
        signatureAnalysis
          .recoveredSigner,

      signerIsOwner:
        signatureAnalysis
          .signerIsOwner,

      threshold:
        signatureAnalysis
          .threshold,

      digest:
        signatureAnalysis
          .digest,
    },
  };

  onStatus?.(
    `Firma Safe válida. Owner recuperado: ${signatureAnalysis.recoveredSigner}. Ahora conecta una wallet externa únicamente para pagar el gas.`,
    "success",
  );

  return prepared;
}

// ============================================================================
// VALIDATE PREPARED PACKAGE
// ============================================================================

function validatePreparedPackage({
  prepared,
  asset,
  targetAddress,
}) {
  if (
    !prepared ||
    prepared.format !==
      FLOW_FORMAT ||
    prepared.version !==
      FLOW_VERSION
  ) {
    throw new Error(
      "Autorización Safe Recovery no válida",
    );
  }

  if (
    Date.now() >
    Number(
      prepared.expiresAt,
    )
  ) {
    throw new Error(
      "La autorización SafeTx expiró. Solicita una firma nueva en World App.",
    );
  }

  const safeAddress =
    normalizeAddress(
      targetAddress,
    );

  if (
    !sameAddress(
      prepared.targetAddress,
      safeAddress,
    )
  ) {
    throw new Error(
      "La dirección analizada cambió desde que World App firmó",
    );
  }

  const chainId =
    normalizeChainId(
      asset?.chainId,
    );

  if (
    normalizeChainId(
      prepared.chainId,
    ) !==
    chainId
  ) {
    throw new Error(
      "El activo seleccionado está en una red distinta de la SafeTx firmada",
    );
  }

  if (
    Boolean(
      prepared.asset
        ?.isNative,
    ) !==
    Boolean(
      asset?.isNative,
    )
  ) {
    throw new Error(
      "El activo cambió después de obtener la firma",
    );
  }

  if (
    !asset.isNative &&
    !sameAddress(
      prepared.asset
        ?.tokenAddress,
      asset.address,
    )
  ) {
    throw new Error(
      "El contrato ERC-20 cambió después de obtener la firma",
    );
  }

  /*
   * Revalidamos la firma antes de entregarla
   * al motor financiero.
   */
  const analysis =
    verifyMiniKitSafeRecoverySignature({
      intent:
        prepared.intent,

      signature:
        prepared.authorization
          .signature,

      reportedAddress:
        prepared.authorization
          .reportedAddress,
    });

  if (
    !analysis.signerIsOwner ||
    !analysis
      .singleSignatureSatisfiesThreshold
  ) {
    throw new Error(
      "La autorización guardada ya no pasa la validación owner/threshold",
    );
  }

  return {
    safeAddress,
    chainId,
    analysis,
  };
}

// ============================================================================
// EXECUTE WITH EXTERNAL GAS PAYER
// ============================================================================

export async function executePreparedWorldSafeRecovery({
  prepared,
  eip1193Provider,
  asset,
  targetAddress,
  onStatus,
}) {
  if (
    !eip1193Provider?.request
  ) {
    throw new Error(
      "Conecta una wallet externa para pagar el gas de la red objetivo",
    );
  }

  const {
    safeAddress,
    analysis,
  } =
    validatePreparedPackage({
      prepared,

      asset,

      targetAddress,
    });

  onStatus?.(
    `Autorización owner ${analysis.recoveredSigner} verificada. La wallet externa se utilizará únicamente como pagador de gas.`,
    "info",
  );

  const result =
    await executeSignedSafeRecovery({
      eip1193Provider,

      asset,

      targetAddress:
        safeAddress,

      intent:
        prepared.intent,

      signature:
        prepared.authorization
          .signature,

      reportedAddress:
        prepared.authorization
          .reportedAddress,

      onStatus,
    });

  return {
    ...result,

    authorization: {
      source:
        "world-app-minikit",

      owner:
        analysis
          .recoveredSigner,

      digest:
        analysis.digest,

      reportedAddress:
        prepared.authorization
          .reportedAddress,
    },
  };
}

// ============================================================================
// READINESS
// ============================================================================

export function inspectPreparedSafeRecovery({
  prepared,
  asset,
  targetAddress,
}) {
  try {
    const {
      analysis,
    } =
      validatePreparedPackage({
        prepared,

        asset,

        targetAddress,
      });

    return {
      valid:
        true,

      expired:
        false,

      owner:
        analysis
          .recoveredSigner,

      threshold:
        analysis.threshold,

      signerIsOwner:
        analysis.signerIsOwner,

      executableWithSingleSignature:
        analysis
          .singleSignatureSatisfiesThreshold,

      message:
        "La SafeTx está firmada por un owner válido. Falta o puede continuar la ejecución con un pagador de gas.",
    };
  } catch (error) {
    const message =
      errorMessage(
        error,
        "Autorización Safe Recovery inválida",
      );

    return {
      valid:
        false,

      expired:
        message
          .toLowerCase()
          .includes(
            "expir",
          ),

      owner:
        null,

      threshold:
        null,

      signerIsOwner:
        false,

      executableWithSingleSignature:
        false,

      message,
    };
  }
}
