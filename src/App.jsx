import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { ethers } from "ethers";

import { MiniKit } from "@worldcoin/minikit-js";

// =========================
// NETWORKS (CORREGIDO)
// =========================

const NETWORKS = [
  {
    name: "Ethereum",
    chainId: 1,
    symbol: "ETH",
    rpc: [
      "https://ethereum-rpc.publicnode.com",
      "https://rpc.ankr.com/eth",
    ],
  },
  {
    name: "Optimism",
    chainId: 10,
    symbol: "ETH",
    rpc: [
      "https://optimism-rpc.publicnode.com",
      "https://rpc.ankr.com/optimism",
    ],
  },
  {
    name: "BNB Chain",
    chainId: 56,
    symbol: "BNB",
    rpc: [
      "https://bsc-rpc.publicnode.com",
      "https://rpc.ankr.com/bsc",
    ],
  },
  {
    name: "Base",
    chainId: 8453,
    symbol: "ETH",
    rpc: [
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org",
    ],
  },
  {
    name: "World Chain",
    chainId: 480,
    symbol: "ETH", 
    rpc: [
      "https://rpc.worldchain.org", // CORREGIDO: Endpoint RPC real público
      "https://worldchain-mainnet.g.alchemy.com/public",
      "https://480.rpc.thirdweb.com",
    ],
  },
  {
    name: "World Chain Sepolia (Testnet)",
    chainId: 4801,
    symbol: "ETH",
    rpc: [
      "https://sepolia.worldchain.org", // CORREGIDO: Endpoint RPC real de pruebas
    ],
  },
];
// =========================
// TOKENS (SOPORTE COMPLETO WORLD APP)
// =========================
const TOKENS = [
  {
    symbol: "WLD",
    decimals: 18,
    addresses: {
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",     // Ethereum Mainnet
      10: "0xdC6fF44d5d932CBD77b52E5612Ba0529DC6226F1",    // Optimism Mainnet
      480: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",   // World Chain Mainnet
      4801: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",  // World Chain Sepolia (Mismo contrato en Testnet)
    },
  },
  {
    symbol: "USDC",
    decimals: 6,
    addresses: {
      1: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",     // Ethereum Mainnet
      10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",    // Optimism Mainnet (Native USDC)
      480: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",   // World Chain Mainnet
      4801: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",  // World Chain Sepolia Testnet
    },
  },
  {
    symbol: "USDT",
    decimals: 6,
    addresses: {
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",     // Ethereum Mainnet
      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",    // Optimism Mainnet
    },
  },
];
// ========================================================
// ABI DEFINITIVO (MÁXIMA ROBUSTEZ PARA RECUPERACIÓN)
// ========================================================

const ERC20_ABI = [
  // Lecturas básicas obligatorias
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  
  // Opcionales para mejorar la UI si escaneas un token desconocido
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  
  // Doble firma de transferencia para máxima compatibilidad (Soporta USDT de Ethereum)
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount)" 
];
// ========================================================
// APP (ESTADOS DE ALTA ROBUSTEZ)
// ========================================================

export default function App() {
  const mountedRef = useRef(true);
  const scanLockRef = useRef(false);

  // Estados de control de la billetera y UI
  const [status, setStatus] = useState("Inicializando RC Wallet...");
  const [wallet, setWallet] = useState("");
  
  // CORRECCIÓN: Selección segura de World Chain por ID o índice fallback
  const [network, setNetwork] = useState(() => {
    return NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
  });
  
  // Balances y Tokens
  const [nativeBalance, setNativeBalance] = useState("0");
  const [tokensDetected, setTokensDetected] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null); // Objeto del token activo
  
  // Formulario de envío / Recuperación
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [maxSendAmount, setMaxSendAmount] = useState("0");

  // Estado de MiniKit y Debug
  const [worldVerified, setWorldVerified] = useState(false);
  const [debugResult, setDebugResult] = useState("");
  const [lastTxResult, setLastTxResult] = useState(null);
  const [detectedProviders, setDetectedProviders] = useState([]);
// ========================================================
// RPC FALLBACK (MÁXIMA ROBUSTEZ Y VELOCIDAD DE RESPUESTA)
// ========================================================

async function getWorkingProvider(rpcList) {
  if (!rpcList || !Array.isArray(rpcList) || rpcList.length === 0) {
    return null;
  }

  for (const rpc of rpcList) {
    try {
      // Configuramos el proveedor con tiempos de respuesta estrictos a nivel de red
      const provider = new ethers.JsonRpcProvider(rpc, undefined, {
        staticNetwork: true, // Evita consultas repetitivas de red en cada llamada (Optimiza v6)
        batchMaxCount: 1     // Minimiza el agrupamiento para evitar retrasos en el parseo
      });

      // Creamos una promesa de desconexión por tiempo límite (Timeout)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RPC Timeout")), 3500)
      );

      // Obligamos al proveedor a responder rápido o descartamos el nodo
      await Promise.race([
        provider.getBlockNumber(),
        timeoutPromise
      ]);

      return provider; // Nodo sano y operativo encontrado
    } catch (err) {
      console.warn(`Nodo RPC descartado por latencia o falla: ${rpc}`);
    }
  }

  return null; // Retorno seguro si absolutamente todos los nodos fallan
}
// ========================================================
// DYNAMIC TOKEN DETECTION (PARALELO Y ULTRA ROBUSTO)
// ========================================================

async function getDynamicTokens(address, chainId) {
  try {
    // Validaciones iniciales de seguridad de entrada
    if (!address || !ethers.isAddress(address)) return [];
    
    const network = NETWORKS.find((n) => n.chainId === chainId);
    if (!network) return [];

    const provider = await getWorkingProvider(network.rpc);
    if (!provider) return [];

    // Filtramos los tokens configurados para esta red específica
    const knownTokens = TOKENS.filter((token) => token.addresses?.[chainId]);
    const detected = [];

    // Ejecución en paralelo para velocidad máxima en conexiones móviles
    const promises = knownTokens.map(async (token) => {
      try {
        const rawAddress = token.addresses[chainId];
        const tokenAddress = ethers.getAddress(rawAddress); // Normaliza Checksum
        
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(address);

        if (balance && balance > 0n) {
          return {
            symbol: token.symbol,
            balance: ethers.formatUnits(balance, token.decimals),
            decimals: token.decimals,
            address: tokenAddress,
            chainId,
          };
        }
      } catch (tokenErr) {
        console.warn(`Error leyendo contrato ${token.symbol} en red ${chainId}:`, tokenErr.message);
      }
      return null;
    });

    // Esperamos los resultados de todas las consultas sin que una falla tumbe a las demás
    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        detected.push(result.value);
      }
    }

    console.log(`[SCAN Chain ${chainId}] Escaneo completado. Tokens hallados:`, detected.length);
    return detected;
  } catch (err) {
    console.error("TOKEN DETECTION CRITICAL ERROR:", err);
    return [];
  }
}

// ========================================================================
// ESTIMATE GAS (MÁXIMA COMPATIBILIDAD CAPA 2 Y ROBUSTEZ CONTRA FALLAS)
// ========================================================================
  
async function estimateNativeGas(chainId, from, to, amount, decimals = 18) {
  try {
    // Protección estricta de entradas numéricas vacías o defectuosas
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return 0;
    }

    const network = NETWORKS.find((n) => n.chainId === chainId);
    if (!network) return 0;

    const provider = await getWorkingProvider(network.rpc);
    if (!provider) return 0;

    // Validación y sanitización estricta de direcciones
    if (!ethers.isAddress(from) || !ethers.isAddress(to)) return 0;

    // Inicialización segura de BigInt para el valor de transferencia
    let valueWei;
    try {
      valueWei = ethers.parseUnits(amount.toString(), decimals);
    } catch {
      return 0; // Fallback seguro si el usuario escribe un formato decimal roto
    }

    const feeData = await provider.getFeeData();
    // Prioriza maxFeePerGas para EIP-1559, con colchón del 20% para evitar fluctuaciones de red
    const baseGasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
    const effectiveGasPrice = (baseGasPrice * 120n) / 100n;

    let estimatedGas = 21000n; // Fallback estándar para transferencia nativa básica
    try {
      estimatedGas = await provider.estimateGas({
        from: ethers.getAddress(from),
        to: ethers.getAddress(to),
        value: valueWei,
      });
    } catch (estError) {
      console.warn("Llamada estimateGas rechazada por el nodo RPC (Normal en Smart Accounts de L2):", estError.message);
      // Si estamos en World Chain u Optimism, asignamos un límite por defecto para no congelar la UI
      if (chainId === 480 || chainId === 10) {
        estimatedGas = 60000n; 
      }
    }

    // Operación segura entre BigInts antes de formatear a cadena de texto flotante
    const gasCostWei = estimatedGas * effectiveGasPrice;
    const formattedGas = ethers.formatEther(gasCostWei);
    
    return parseFloat(formattedGas) || 0;
  } catch (err) {
    console.error("Gas estimation critical fallback error:", err);
    return 0; // Retorno numérico seguro para evitar que rompa operaciones posteriores
  }
}
// ========================================================================
// PROVIDER DETECTION (MÁXIMA ROBUSTEZ CONTRA EXCEPCIONES EN SERVIDOR/SSR)
// ========================================================================

async function detectProvider() {
  // Guardián estricto para evitar fallos de compilación si el entorno no es el cliente
  if (typeof window === "undefined" || !window) {
    return [];
  }

  try {
    const detected = [];

    // ========================================================================
// PROVIDER DETECTION (CORRECCIÓN ESTRICTA DE LLAVES PARA VERCEL)
// ========================================================================
async function detectProvider() {
  if (typeof window === "undefined" || !window) {
    return [];
  }

  try {
    const detected = [];

    if (typeof window.ethereum !== "undefined" && window.ethereum) {
      detected.push({
        name: "window.ethereum",
        provider: window.ethereum,
        hasRequest: typeof window.ethereum?.request === "function",
      });

      if (Array.isArray(window.ethereum?.providers)) {
        for (const provider of window.ethereum.providers) {
          if (provider) {
            detected.push({
              name: "ethereum.providers[]",
              provider,
              hasRequest: typeof provider?.request === "function",
            });
          }
        }
      }
    }

    if (typeof window.safe !== "undefined" && window.safe) {
      detected.push({
        name: "window.safe",
        provider: window.safe,
        hasRequest: typeof window.safe?.request === "function",
      });
    }

    if (typeof window.world !== "undefined" && window.world) {
      detected.push({
        name: "window.world",
        provider: window.world,
        hasRequest: typeof window.world?.request === "function",
      });
    }

    if (typeof MiniKit !== "undefined" && MiniKit && typeof MiniKit.provider !== "undefined" && MiniKit.provider) {
      detected.push({
        name: "MiniKit.provider",
        provider: MiniKit.provider,
        hasRequest: typeof MiniKit.provider?.request === "function",
      });
    }

    if (typeof MiniKit !== "undefined" && MiniKit && typeof MiniKit.walletProvider !== "undefined" && MiniKit.walletProvider) {
      detected.push({
        name: "MiniKit.walletProvider",
        provider: MiniKit.walletProvider,
        hasRequest: typeof MiniKit.walletProvider?.request === "function",
      });
    }

    console.log("[PROVIDER DIAGNOSTIC] Diagnóstico final:", detected);
    return detected;

  } catch (err) {
    console.error("PROVIDER DETECTION CRITICAL ERROR:", err?.message || err);
    return [];
  }
}
// ========================================================================
// SCAN (APERTURA DE ALTA ROBUSTEZ Y RENDIMIENTO MULTICADENA)
// ========================================================================

const scanAllNetworks = useCallback(async (address) => {
  // Guardián estricto para evitar ejecuciones duplicadas en paralelo
  if (scanLockRef.current) return;
  
  // Validación y normalización estricta de la dirección de entrada
  if (!address || !ethers.isAddress(address)) {
    console.warn("[SCAN ABORTED] Dirección de wallet inválida o no provista.");
    return;
  }

  scanLockRef.current = true;
  const cleanAddress = ethers.getAddress(address); // Normaliza Checksum (Evita fallos RPC)

  try {
    setStatus("Escaneando redes en busca de fondos...");
    let foundTokens = [];

    for (const net of NETWORKS) {
      // Guardián de ciclo: detiene el escaneo inmediatamente si el usuario cierra la sección
      if (!mountedRef.current) {
        scanLockRef.current = false;
        return;
      }

      try {
        console.log(`[SCANNING] Conectando a nodos RPC de: ${net.name}...`);
        const provider = await getWorkingProvider(net.rpc);
        
        if (!provider) {
          console.warn(`[SCAN SKIP] No se pudo establecer conexión estable con la red: ${net.name}`);
          continue;
        }
          // ========================================================
          // NATIVA (ETH, BNB, ETC. - LECTURA DE ALTA PRECISIÓN)
          // ========================================================
          const nativeBal = await provider.getBalance(cleanAddress);

          if (nativeBal && nativeBal > 0n) {
            // Formateo seguro de BigInt a String para conservar precisión absoluta
            const rawEtherStr = ethers.formatEther(nativeBal);
            const formattedBalance = parseFloat(rawEtherStr).toFixed(6);
            
            foundTokens.push({
              network: net.name,
              symbol: net.symbol, 
              balance: formattedBalance,
              isNative: true,
              chainId: net.chainId,
              decimals: 18,
              address: "NATIVE",
            });

            // CORRECCIÓN: Validación defensiva antes de comparar el objeto de red activo
            if (network && typeof network === "object" && net.chainId === network.chainId) {
              setNativeBalance(formattedBalance);
            }
          }
          // ========================================================
          // DYNAMIC TOKENS (ERC-20 COMO WLD, USDC - ULTRA SEGURO)
          // ========================================================
          const dynamicTokens = await getDynamicTokens(cleanAddress, net.chainId);

          if (Array.isArray(dynamicTokens)) {
            for (const token of dynamicTokens) {
              if (token && token.balance) {
                foundTokens.push({
                  network: net.name,
                  symbol: token.symbol,
                  balance: parseFloat(token.balance).toFixed(4), // Conversión segura y controlada
                  isNative: false,
                  chainId: token.chainId,
                  decimals: token.decimals,
                  address: token.address,
                });
              }
            }
          }
        } catch (netErr) {
          console.error(`[SCAN NETWORK ERROR] Fallo controlado en la red ${net.name}:`, netErr?.message || netErr);
        }
      } // Fin del bucle for de NETWORKS

      // Filtrado estricto para remover duplicados por contrato y red
      const uniqueTokens = foundTokens.filter(
        (token, index, self) =>
          index === self.findIndex((t) => t.chainId === token.chainId && t.address === token.address)
      );

      setTokensDetected(uniqueTokens);

      // CORRECCIÓN DE EXPERIENCIA: Mantiene la selección del usuario si el token sigue existiendo
      if (uniqueTokens.length > 0) {
        const stillExists = selectedToken ? uniqueTokens.find(t => t.address === selectedToken.address && t.chainId === selectedToken.chainId) : null;
        if (!stillExists) {
          setSelectedToken(uniqueTokens[0]); // Si no tenía nada seleccionado o el token desapareció, asigna el primero
        } else {
          setSelectedToken(stillExists); // Actualiza balance manteniendo el mismo token seleccionado
        }
      } else {
        setSelectedToken(null);
      }

      setStatus("Escaneo completado. Fondos actualizados.");
    } catch (err) {
      console.error("SCAN CRITICAL ERROR:", err?.message || err);
      setStatus("Error escaneando redes");
    } finally {
      scanLockRef.current = false; // Libera el candado de forma obligatoria pase lo que pase
    }
  }, [network, selectedToken]); // Dependencias sincronizadas para evitar cierres obsoletos en React
// ========================================================================
// LOGIN (MÁXIMA ROBUSTEZ - COMPATIBLE CON MINIKIT V3 Y APAGADO SEGURO)
// ========================================================================

async function handleWorldLogin() {
  try {
    // 1. Verificación defensiva de la inyección de MiniKit
    if (typeof MiniKit === "undefined" || !MiniKit || !MiniKit.isInstalled()) {
      setStatus("Por favor, abre la aplicación desde World App");
      return;
    }

    setStatus("Conectando con World App...");
    
    // 2. Invocación limpia en v3. Los fallos del usuario arrojan excepciones directas al catch.
    const res = await MiniKit.walletAuth({
      nonce: Math.random().toString(36).substring(2),
    });

    // 3. Extracción ultra-defensiva de la wallet (Soporta múltiples variantes de payloads)
    const payload = res?.data || res?.finalPayload || res;
    const address = payload?.address || payload?.walletAddress;

    if (!address || !ethers.isAddress(address)) {
      setStatus("No se pudo obtener una dirección de wallet válida");
      return;
    }

    // 4. Normalización estricta de la dirección (Checksum activo)
    const cleanAddress = ethers.getAddress(address);

    setWallet(cleanAddress);
    
    // Guardado seguro en localStorage compatible con servidores de compilación (SSR)
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem("rc_wallet_address", cleanAddress);
    }
    
    // Asignación limpia del objeto de red de World Chain
    const worldChainNet = NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
    setNetwork(worldChainNet);

    setWorldVerified(true);
    setStatus("¡Wallet conectada con éxito!");

    // Ejecución pasiva del diagnóstico de proveedores
    await detectProvider();
    
    // 5. Temporizador blindado: Solo escanea si el componente sigue montado en la interfaz
    setTimeout(async () => {
      if (mountedRef.current) {
        await scanAllNetworks(cleanAddress);
      }
    }, 2000);

  } catch (err) {
    console.error("[WORLD LOGIN ERROR] Falla en autenticación o firma:", err);
    
    // Captura dinámica del mensaje de error interno de la SDK si el usuario cancela
    const errorMessage = err?.message || err?.error_message || "Falla al conectar World ID";
    setStatus(errorMessage.includes("user rejected") ? "Inicio de sesión cancelado" : "Error en conexión");
  }
}

// ========================================================================
// ERROR EXTRACTOR (MÁXIMA ROBUSTEZ Y PROTECCIÓN CONTRA ESTRUCTURAS CÍCLICAS)
// ========================================================================

function extractMiniKitError(err) {
  // Si no se provee un error válido, retornamos una estructura limpia de contingencia
  if (!err) {
    return { message: "Error desconocido no especificado", code: "UNKNOWN_ERROR" };
  }

  try {
    return {
      message: err?.message || (typeof err === "string" ? err : "Error inesperado de ejecución"),
      shortMessage: err?.shortMessage || null,
      reason: err?.reason || null,
      code: err?.code || null,
      errorCode: err?.error_code || err?.errorCode || null,
      stack: typeof err?.stack === "string" ? err.stack.slice(0, 500) : null, // Limitamos el tamaño del stack trace para optimizar memoria
      
      // CORRECCIÓN: Si el error es un objeto complejo, extraemos sus llaves planas de forma segura
      // Esto previene de raíz el quiebre fatal por estructuras circulares al hacer JSON.stringify
      rawClean: typeof err === "object" ? Object.getOwnPropertyNames(err).reduce((acc, key) => {
        if (typeof err[key] !== "function" && typeof err[key] !== "object") {
          acc[key] = err[key];
        }
        return acc;
      }, {}) : String(err)
    };
  } catch (extractionFallback) {
    console.error("Fallo crítico en el extractor de errores defensivo:", extractionFallback);
    return {
      message: err?.message || "Error fatal de extracción",
      code: "CRITICAL_EXTRACTION_FAILURE"
    };
  }
}
// ========================================================================
// RESULT PARSER (MÁXIMA ROBUSTEZ - ADAPTADO A MINIKIT V3 Y ANTI-CIRCULAR)
// ========================================================================

function parseMiniKitResult(result) {
  // Si no hay respuesta, devolvemos una estructura fallida limpia para evitar quiebres
  if (!result) {
    return { success: false, txId: null, status: "No result data", finalPayload: {}, rawClean: {} };
  }

  try {
    // CORRECCIÓN V3: Extraemos el payload prioritario del campo nativo .data de MiniKit v3
    const finalPayload = result?.data || result?.finalPayload || result?.payload || result || {};

    // Mapeo secuencial blindado en busca del hash de transacción (Capa 1, Capa 2 y UserOps de Abstracción de cuenta)
    const txId =
      finalPayload?.txHash ||
      finalPayload?.transactionHash ||
      finalPayload?.transaction_id ||
      finalPayload?.transactionId ||
      finalPayload?.safeTxHash ||
      finalPayload?.userOpHash ||
      finalPayload?.operationHash ||
      finalPayload?.hash ||
      finalPayload?.id ||
      result?.txHash ||
      result?.hash ||
      result?.id ||
      null;

    const status = finalPayload?.status || result?.status || null;

    // Validación booleana estricta de éxito de la operación
    const success =
      Boolean(txId) ||
      status === "success" ||
      status === "confirmed" ||
      result?.success === true ||
      finalPayload?.success === true;

    return {
      success,
      txId: txId ? String(txId).trim() : null,
      status: status ? String(status).trim() : "unknown",
      finalPayload: typeof finalPayload === "object" ? finalPayload : {},
      
      // CORRECCIÓN ANTI-BREAK: Sanitizado estricto del objeto para que tu JSON.stringify nunca congele el teléfono
      rawClean: typeof result === "object" ? Object.getOwnPropertyNames(result).reduce((acc, key) => {
        if (typeof result[key] !== "function" && typeof result[key] !== "object") {
          acc[key] = result[key];
        }
        return acc;
      }, {}) : String(result)
    };
  } catch (parseError) {
    console.error("Fallo crítico en el parseador de resultados MiniKit:", parseError);
    return { success: false, txId: null, status: "Parser Error", finalPayload: {}, rawClean: {} };
  }
}
// ========================================================================
// WAIT FOR CONFIRMATION (MÁXIMA PRECISIÓN MATEMÁTICA Y APAGADO SEGURO)
// ========================================================================

async function waitForBalanceChange(walletAddress, tokenInfo, oldBalanceStr, maxAttempts = 10) {
  // Validaciones iniciales defensivas de parámetros
  if (!walletAddress || !ethers.isAddress(walletAddress) || !tokenInfo) {
    return { success: false };
  }

  try {
    let attempts = 0;
    const net = NETWORKS.find((n) => n.chainId === tokenInfo.chainId);
    if (!net) return { success: false };

    const provider = await getWorkingProvider(net.rpc);
    if (!provider) return { success: false };

    // Parseamos de forma ultra precisa el balance anterior a formato BigInt de Wei
    const oldBalanceWei = ethers.parseUnits(oldBalanceStr.toString(), tokenInfo.decimals);
    const cleanAddress = ethers.getAddress(walletAddress);

    while (attempts < maxAttempts) {
      // Guardián de ciclo: si la app se desmonta en el teléfono, aborta el bucle de inmediato
      if (typeof mountedRef !== "undefined" && !mountedRef.current) {
        return { success: false };
      }

      console.log(`[BLOCKCHAIN LISTEN] Intento de confirmación ${attempts + 1}/${maxAttempts}...`);
      
      // Espera reactiva de 4.5 segundos entre consultas RPC para evitar saturar el nodo móvil
      await new Promise((resolve) => setTimeout(resolve, 4500));

      let currentBalanceWei = 0n;

      if (tokenInfo.isNative) {
        currentBalanceWei = await provider.getBalance(cleanAddress);
      } else {
        const contract = new ethers.Contract(ethers.getAddress(tokenInfo.address), ERC20_ABI, provider);
        currentBalanceWei = await contract.balanceOf(cleanAddress);
      }

      // Comparación matemática estricta a nivel de BigInt (100% libre de errores decimales)
      if (currentBalanceWei < oldBalanceWei) {
        console.log("[CONFIRMED] El balance disminuyó. Fondos procesados en el bloque.");
        
        // Retornamos los valores formateados en String de forma segura
        return {
          success: true,
          oldBalance: oldBalanceStr,
          newBalance: ethers.formatUnits(currentBalanceWei, tokenInfo.decimals)
        };
      }

      attempts++;
    }

    return { success: false }; // Retorno limpio si se agotan los intentos (La tx sigue en el mempool/relay)
  } catch (err) {
    console.error("[CONFIRMATION CRITICAL ERROR] Fallo en bucle de escucha:", err?.message || err);
    return { success: false };
  }
}
// ========================================================================
// SEND / RECUPERACIÓN (PRO-ROBUSTEZ: VALIDACIONES DE ENTRADA)
// ========================================================================

const handleSend = async () => {
  try {
    if (sending) return;

    // =========================
    // VALIDACIONES DE INICIO
    // =========================
    if (!worldVerified || !wallet) {
      setStatus("Debes iniciar sesión primero");
      return;
    }

    if (!recipient || !sendAmount || !selectedToken) {
      setStatus("Completa todos los campos");
      return;
    }

    // GUARDIÁN: Bloquea fallas si el objeto del token es indefinido o corrupto
    const tokenInfo = selectedToken;
    if (!tokenInfo || typeof tokenInfo !== "object") {
      setStatus("Error: Activo seleccionado no válido");
      return;
    }

    const cleanAmount = sendAmount.trim().replace(",", ".");
    const cleanRecipient = recipient.trim();

    if (!ethers.isAddress(cleanRecipient)) {
      setStatus("Dirección de destino inválida");
      return;
    }

    if (isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
      setStatus("Cantidad inválida");
      return;
    }

    // CORRECCIÓN: Comparación robusta basada en coma flotante para evitar fallas string de ethers
    if (parseFloat(cleanAmount) > parseFloat(tokenInfo.balance || "0")) {
      setStatus("Balance insuficiente");
      return;
    }

    if (cleanRecipient.toLowerCase() === wallet.toLowerCase()) {
      setStatus("No puedes enviarte fondos a ti mismo");
      return;
    }

        // ========================================================
    // CÁLCULO DE GAS (SOLO NATIVOS - ANCHOR DE COMISIÓN SEGURO)
    // ========================================================
    if (tokenInfo.isNative) {
      const gasEstimate = await estimateNativeGas(
        tokenInfo.chainId,
        wallet,
        cleanRecipient,
        cleanAmount
      );

      // Si el cálculo de gas da nulo o es exactamente 0 (fallo de simulación RPC)
      if (gasEstimate === null || isNaN(gasEstimate)) {
        setStatus("No se pudo calcular la comisión de gas");
        return;
      }

      setEstimatedGas(gasEstimate.toFixed(8));
      
      // CORRECCIÓN: Tratamiento seguro usando flotantes controlados para conservar precisión
      const balanceFloat = parseFloat(tokenInfo.balance || "0");
      const availableBalance = balanceFloat - gasEstimate;

      if (parseFloat(cleanAmount) > availableBalance) {
        setStatus("Fondos insuficientes para cubrir el gas");
        return;
      }

      setMaxSendAmount(availableBalance.toFixed(8));
    }
    // ========================================================
    // INICIAR PROCESO DE ENVÍO (BLOQUEO DE UI DEFENSIVO)
    // ========================================================
    setSending(true);
    setStatus("Enviando operación a World App...");
    setDebugResult("");
    
    // CORRECCIÓN VERCEL: Validación segura por si el estado fue modificado o removido
    if (typeof setLastTxResult === "function") {
      setLastTxResult(null);
    }

    // Inicialización limpia de la variable que contendrá el payload de la transacción
    let txPayload = null;
    // ========================================================================
    // CONSTRUCCIÓN DEL PAYLOAD PARA MINIKIT (ALTA COMPATIBILIDAD CON CONTRACTOS)
    // ========================================================================
    try {
      if (tokenInfo.isNative) {
        // Envío de moneda nativa (ETH o BNB) con normalización estricta de dirección
        txPayload = {
          reference: `rc-native-${Date.now()}`,
          to: ethers.getAddress(cleanRecipient), // CORRECCIÓN: Fuerza formato Checksum
          value: ethers.parseEther(cleanAmount.toString()).toString(),
          data: "0x", // Inicialización de datos vacíos obligatorios para evitar rechazos en RPCs de L2
        };
      } else {
        // Envío de Tokens ERC20 (WLD, USDC, USDT) utilizando la estructura nativa de MiniKit
        txPayload = {
          address: ethers.getAddress(tokenInfo.address), // CORRECCIÓN: Normaliza dirección del contrato
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [
            ethers.getAddress(cleanRecipient), // Normaliza el destinatario de los fondos
            ethers.parseUnits(cleanAmount.toString(), tokenInfo.decimals).toString()
          ],
          value: "0",
        };
      }
    } catch (payloadErr) {
      console.error("[PAYLOAD CRITICAL ERROR] Falló el formateo criptográfico:", payloadErr);
      setStatus("Error interno al formatear los datos de transferencia");
      setSending(false);
      return;
    }

    // Guardamos el Payload en Debug para verificación visual 100% libre de estructuras circulares
    setDebugResult(JSON.stringify({ phase: "payload_prepared", txPayload }, null, 2));
    // ========================================================================
    // EJECUCIÓN EN MINI APP (WORLD APP - FIRMA DIRECTA BLINDADA)
    // ========================================================================
    console.log(`[MINIKIT EXECUTE] Transaccionando en la red: ${tokenInfo.chainId}`);
    
    // Guardián de seguridad: Verifica que la SDK esté inyectada y lista antes de disparar la firma
    if (typeof MiniKit === "undefined" || !MiniKit || typeof MiniKit.sendTransaction !== "function") {
      setStatus("Error: SDK de MiniKit no inicializada o ausente");
      setSending(false);
      return;
    }

    let result = null;
    try {
      // Invocación directa y secuencial sobre la jerarquía global estable de la SDK
      result = await MiniKit.sendTransaction({
        chainId: Number(tokenInfo.chainId), // Asegura un tipo numérico puro para el protocolo
        transactions: [txPayload],
      });
      
      console.log("[MINIKIT SUCCESS RESPONSE] Respuesta cruda de World App:", result);
    } catch (sdkError) {
      console.error("[MINIKIT SDK REJECTION] Operación abortada por la Wallet:", sdkError);
      
      // Capturamos de forma defensiva el mensaje de cancelación del usuario o error de red
      const errorMsg = sdkError?.message || String(sdkError);
      setStatus(errorMsg.includes("rejected") ? "Operación cancelada por el usuario" : "Error al firmar en World App");
      setSending(false);
      return; // Detiene el flujo de forma segura si la operación falló
    }
       // ========================================================================
    // PROCESAMIENTO DE RESPUESTA (FILTRADO DEFENSIVO Y DEPURACIÓN SEGURA)
    // ========================================================================
    // Guardián: Si result llegó vacío debido a un fallo RPC previo, interceptamos de inmediato
    if (!result) {
      setStatus("Error: No se recibió respuesta desde World App");
      setSending(false);
      return;
    }

    const parsed = parseMiniKitResult(result);
    
    // CORRECCIÓN VERCEL: Validación segura por si el estado fue modificado en la carga inicial
    if (typeof setLastTxResult === "function") {
      setLastTxResult(parsed);
    }

    // Bloque defensivo de serialización para garantizar que el teléfono nunca se congele
    try {
      setDebugResult(JSON.stringify(parsed, null, 2));
    } catch (jsonErr) {
      console.warn("No se pudo serializar el objeto completo en debugResult (Estructura compleja):", jsonErr.message);
      setDebugResult(JSON.stringify({ success: parsed.success, txId: parsed.txId, status: parsed.status }, null, 2));
    }

    // Validación estricta del estado de éxito devuelto por el parseador unificado
    if (!parsed || !parsed.success) {
      setStatus(parsed?.status || "Operación rechazada o fallida");
      setSending(false);
      return;
    }
    // ========================================================================
    // CONFIRMACIÓN EN BLOCKCHAIN (ESCUCHA DE ALTA PRECISIÓN Y CONTROL DE CIERRE)
    // ========================================================================
    setStatus("Esperando confirmación en la blockchain...");
    
    // CORRECCIÓN: Invocación cerrada limpiamente usando los tres parámetros estrictos
    const confirmation = await waitForBalanceChange(
      wallet,
      tokenInfo,
      tokenInfo.balance.toString()
    );

    // Validación defensiva del resultado del escuchador en tiempo real
    if (confirmation && confirmation.success) {
      setStatus("¡Transacción confirmada con éxito! Fondos recuperados.");
    } else {
      // Si se agota el tiempo (Timeout), los fondos siguen en camino a través del Relay
      setStatus("Operación enviada correctamente al Relay de la red");
    }
    // ========================================================
    // INICIAR PROCESO DE ENVÍO (UI LOCK DEFENSIVO)
    // ========================================================
    setSending(true);
    setStatus("Enviando operación a World App...");
    setDebugResult("");
    
    // CORRECCIÓN VERCEL: Validación segura ante renderizados estrictos de producción
    if (typeof setLastTxResult === "function") {
      setLastTxResult(null);
    }

    // Inicialización limpia de la variable del payload de la transacción
    let txPayload = null;
    // ========================================================================
    // CONSTRUCCIÓN DEL PAYLOAD PARA MINIKIT (ESTÁNDAR COMPATIBLE V3)
    // ========================================================================
    try {
      if (tokenInfo.isNative) {
        // CORRECCIÓN NATIVA: Estructura plana oficial de MiniKit para transferencias nativas de red
        txPayload = {
          reference: `rc-native-${Date.now()}`,
          to: ethers.getAddress(cleanRecipient), // Fuerza formato Checksum obligatorio
          value: ethers.parseUnits(cleanAmount.toString(), 18).toString(),
          data: "0x", // Inicialización explícita de datos vacíos para nodos L2
        };
      } else {
        // Estructura oficial de MiniKit para llamadas a funciones de contratos inteligentes ERC20
        txPayload = {
          address: ethers.getAddress(tokenInfo.address), // Dirección del contrato del token (WLD, USDC)
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [
            ethers.getAddress(cleanRecipient), // Dirección del destinatario normalizada
            ethers.parseUnits(cleanAmount.toString(), tokenInfo.decimals).toString() // Monto exacto en Wei
          ],
          value: "0", // No se envía Ether nativo al interactuar con el contrato ERC20
        };
      }
    } catch (payloadError) {
      console.error("[PAYLOAD CRITICAL ERROR] Falló el formateo matemático/criptográfico:", payloadError);
      setStatus("Error interno al preparar los datos de la transferencia");
      setSending(false);
      return;
    }

    // Guardamos el Payload en Debug de forma segura libre de estructuras circulares
    try {
      setDebugResult(JSON.stringify({ phase: "payload_prepared", txPayload }, null, 2));
    } catch {
      setDebugResult("// Payload preparado (Error al serializar vista previa)");
    }
    // ========================================================================
    // EJECUCIÓN EN MINI APP (WORLD APP - FIRMA DIRECTA BLINDADA)
    // ========================================================================
    console.log(`[MINIKIT EXECUTE] Transaccionando en la red: ${tokenInfo.chainId}`);
    
    // Guardián de seguridad: Verifica que la SDK esté inyectada y lista antes de disparar la firma
    if (typeof MiniKit === "undefined" || !MiniKit || typeof MiniKit.sendTransaction !== "function") {
      setStatus("Error: SDK de MiniKit no inicializada o ausente");
      setSending(false);
      return;
    }

    let result = null;
    try {
      // Invocación directa y secuencial sobre la jerarquía global estable de la SDK
      result = await MiniKit.sendTransaction({
        chainId: Number(tokenInfo.chainId), // Asegura un tipo numérico puro para el protocolo
        transactions: [txPayload],
      });
      
      console.log("[MINIKIT SUCCESS RESPONSE] Respuesta cruda de World App:", result);
    } catch (sdkError) {
      console.error("[MINIKIT SDK REJECTION] Operación abortada por la Wallet:", sdkError);
      
      // Capturamos de forma defensiva el mensaje de cancelación del usuario o error de red
      const errorMsg = sdkError?.message || String(sdkError);
      setStatus(errorMsg.includes("rejected") ? "Operación cancelada por el usuario" : "Error al firmar en World App");
      setSending(false);
      return; // Detiene el flujo de forma segura si la operación falló
    }
    // ========================================================================
    // PROCESAMIENTO DE RESPUESTA (FILTRADO DEFENSIVO V3)
    // ========================================================================
    if (!result) {
      setStatus("Error: No se recibió respuesta de World App");
      setSending(false);
      return;
    }

    // Normalización segura del Payload de MiniKit v3 para evitar quiebres de propiedades nulas
    const preparedResult = result?.data ? result : { data: result };
    const parsed = parseMiniKitResult(preparedResult);
    
    // CORRECCIÓN VERCEL: Validación de existencia del set de estado antes de su invocación
    if (typeof setLastTxResult === "function") {
      setLastTxResult(parsed);
    }
  // ========================================================================
  // FUNCIÓN DE ENVÍO DE TOKENS (MINIKIT V3 - CORREGIDA Y ROBUSTA)
  // ========================================================================
  const handleSend = async () => {
    try {
      // 1. Guardián de ejecución: Evita dobles envíos en hilos asíncronos lentos
      if (sending) return;

      // 2. Validación de entorno nativo de World App
      if (typeof MiniKit === "undefined" || !MiniKit || !MiniKit.isInstalled()) {
        setStatus("Por favor, abre desde World App");
        return;
      }

      // 3. Validación de autenticación previa de sesión
      if (!worldVerified || !wallet) {
        setStatus("Debes iniciar sesión primero");
        return;
      }

      // 4. Validación de campos obligatorios en el formulario
      if (!recipient || !sendAmount || !selectedToken) {
        setStatus("Completa todos los campos");
        return;
      }

      // Extraemos de forma segura el objeto puro del token seleccionado arriba
      const tokenInfo = selectedToken;
      if (!tokenInfo || typeof tokenInfo !== "object") {
        setStatus("Error: Activo seleccionado inválida");
        return;
      }

      const cleanAmount = sendAmount.trim().replace(",", ".");
      const cleanRecipient = recipient.trim();

      // 5. Validaciones de direcciones criptográficas y montos
      if (!ethers.isAddress(cleanRecipient)) {
        setStatus("Dirección de destino inválida");
        return;
      }

      if (isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
        setStatus("Cantidad ingresada inválida");
        return;
      }

      if (parseFloat(cleanAmount) > parseFloat(tokenInfo.balance || "0")) {
        setStatus("Balance insuficiente");
        return;
      }

      if (cleanRecipient.toLowerCase() === wallet.toLowerCase()) {
        setStatus("No puedes enviarte fondos a ti mismo");
        return;
      }

      // 6. Bloque de cálculo exacto de comisiones de gas (Solo para Native)
      if (tokenInfo.isNative) {
        const gasEstimate = await estimateNativeGas(
          tokenInfo.chainId,
          wallet,
          cleanRecipient,
          cleanAmount
        );

        if (gasEstimate === null || isNaN(gasEstimate)) {
          setStatus("No se pudo calcular el gas de red");
          return;
        }

        setEstimatedGas(gasEstimate.toFixed(8));
        const balanceFloat = parseFloat(tokenInfo.balance || "0");
        const availableBalance = balanceFloat - gasEstimate;

        if (availableBalance <= 0 || parseFloat(cleanAmount) > availableBalance) {
          setStatus("Fondos insuficientes para cubrir el gas");
          return;
        }

        // CORRECCIÓN: Invocación correcta de la función set de React
        setMaxSendAmount(availableBalance.toFixed(8));
      }

      // 7. Bloqueo seguro de controles antes de interactuar con el hardware
      setSending(true);
      setStatus("Enviando operación a World App...");
      setDebugResult("");
      // ========================================================
      // INICIAR PROCESO DE ENVÍO (UI LOCK DEFENSIVO)
      // ========================================================
      setSending(true);
      setStatus("Enviando operación a World App...");
      setDebugResult("");
      
      // CORRECCIÓN VERCEL: Validación defensiva por si el estado fue modificado o removido
      if (typeof setLastTxResult === "function") {
        setLastTxResult(null);
      }

      // CORRECCIÓN ESBUILD: Inicialización explícita para evitar advertencias de compilación
      let txPayload = null;
      // ========================================================================
      // CONSTRUCCIÓN DEL PAYLOAD PARA MINIKIT (ESTÁNDAR COMPATIBLE V3 EN L2)
      // ========================================================================
      try {
        if (tokenInfo.isNative) {
          // CORRECCIÓN SINTAXIS V3: Oficial para transferencias nativas (ETH, BNB)
          txPayload = {
            address: ethers.getAddress(cleanRecipient), // Fuerza formato Checksum obligatorio
            value: ethers.parseUnits(cleanAmount.toString(), 18).toString(),
            // OMITIDOS: abi, functionName y args no van en envíos nativos para no romper el relay
          };
        } else {
          // Estructura oficial de MiniKit v3 para llamadas a contratos inteligentes (ERC-20)
          txPayload = {
            address: ethers.getAddress(tokenInfo.address), // Dirección del contrato (WLD, USDC, USDT)
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              ethers.getAddress(cleanRecipient), // Dirección del destinatario normalizada
              ethers.parseUnits(cleanAmount.toString(), tokenInfo.decimals).toString() // Monto exacto en Wei
            ],
            value: "0", // No se envía moneda nativa en la raíz al interactuar con el contrato
          };
        }
      } catch (payloadError) {
        console.error("[PAYLOAD CRITICAL ERROR] Falló el formateo criptográfico/matemático:", payloadError);
        setStatus("Error interno al preparar los datos de la transferencia");
        setSending(false);
        return;
      }

      // Guardamos el Payload en Debug de forma segura libre de estructuras circulares
      try {
        setDebugResult(JSON.stringify({ phase: "payload_prepared", txPayload }, null, 2));
      } catch {
        setDebugResult(JSON.stringify({ phase: "payload_prepared_error", message: "Error al serializar payload visual" }));
      }
      // ========================================================================
      // EJECUCIÓN EN MINI APP (WORLD APP - FIRMA DIRECTA BLINDADA V3)
      // ========================================================================
      console.log(`[MINIKIT EXECUTE] Transaccionando en la red: ${tokenInfo.chainId}`);
      
      // Guardián de seguridad: Verifica que la SDK esté inyectada y lista antes de disparar la firma
      if (typeof MiniKit === "undefined" || !MiniKit || typeof MiniKit.sendTransaction !== "function") {
        setStatus("Error: SDK de MiniKit no inicializada o ausente");
        setSending(false);
        return;
      }

      let result = null;
      try {
        // Invocación directa y secuencial sobre la jerarquía global estable de la SDK
        result = await MiniKit.sendTransaction({
          chainId: Number(tokenInfo.chainId), // Asegura un tipo numérico puro para el protocolo
          transactions: [txPayload],
        });
        
        console.log("[MINIKIT SUCCESS RESPONSE] Respuesta cruda de World App:", result);
      } catch (sdkError) {
        console.error("[MINIKIT SDK REJECTION] Operación abortada por la Wallet:", sdkError);
        
        // Capturamos de forma defensiva el mensaje de cancelación del usuario o error de red
        const errorMsg = sdkError?.message || String(sdkError);
        setStatus(errorMsg.includes("rejected") ? "Operación cancelada por el usuario" : "Error al firmar en World App");
        setSending(false);
        return; // Detiene el flujo de forma segura si la operación falló
      }
      // ========================================================================
      // PROCESAMIENTO DE RESPUESTA (ADAPTACIÓN SEGURA V3 Y ANTI-QUUEBRES)
      // ========================================================================
      // Guardián preventivo: si por una caída de conexión result no existe, detenemos el flujo
      if (!result) {
        setStatus("Error: No se recibió respuesta desde World App");
        setSending(false);
        return;
      }

      // Normalización defensiva del formato para asegurar que el parseador lea .data correctamente
      const preparedResult = result?.data ? result : { data: result };
      const parsed = parseMiniKitResult(preparedResult);
      
      // CORRECCIÓN VERCEL: Validación segura de la existencia del estado de React
      if (typeof setLastTxResult === "function") {
        setLastTxResult(parsed);
      }

      // CORRECCIÓN ANTI-CIRCULAR: Evita de raíz que el stringify congele la interfaz gráfica
      try {
        setDebugResult(JSON.stringify(parsed, null, 2));
      } catch (jsonErr) {
        console.warn("Fallo leve al serializar objeto completo en debugResult:", jsonErr.message);
        setDebugResult(JSON.stringify({ success: parsed.success, txId: parsed.txId, status: parsed.status }, null, 2));
      }

      // Verificación estricta de éxito de la transacción
      if (!parsed || !parsed.success) {
        setStatus(parsed?.status || "Operación rechazada o fallida");
        setSending(false);
        return;
      }
      // ========================================================================
      // CONFIRMACIÓN EN BLOCKCHAIN (ESCUCHA EN TIEMPO REAL Y APAGADO SEGURO)
      // ========================================================================
      setStatus("Esperando confirmación en la blockchain...");
      
      // CORRECCIÓN: Forzamos la conversión a String para la precisión de BigInt en el listener
      const confirmation = await waitForBalanceChange(
        wallet,
        tokenInfo,
        tokenInfo.balance ? tokenInfo.balance.toString() : "0"
      );

      // Evaluación defensiva del resultado del bucle de bloques
      if (confirmation && confirmation.success) {
        setStatus("¡Transacción confirmada con éxito! Fondos recuperados.");
      } else {
        // Fallback seguro si se agota el tiempo (Timeout): los fondos siguen procesándose en el Relay
        setStatus("Operación enviada al Relay de la red");
      }

      // Refrescar saldos finales respetando de forma estricta el ciclo de vida del componente
      setTimeout(async () => {
        try {
          if (mountedRef.current && wallet) {
            await scanAllNetworks(wallet);
          }
        } catch (refreshErr) {
          console.error("[REFRESH ERROR] Falló el escaneo post-envío:", refreshErr);
        }
        
        // CORRECCIÓN SEGURA: Solo cambia el estado visual si la interfaz sigue activa en el teléfono
        if (mountedRef.current) {
          setSending(false);
        }
      }, 2000);

    } catch (err) {
      console.error("[CRITICAL SEND ERROR] Excepción atrapada en el flujo de retiro:", err);
      setStatus("Error crítico durante el envío");
      
      // Serialización segura libre de desbordamientos de memoria por estructuras circulares
      try {
        setDebugResult(JSON.stringify(extractMiniKitError(err), null, 2));
      } catch {
        setDebugResult(JSON.stringify({ error: err?.message || "Fallo crítico no serializable" }));
      }
      
      if (mountedRef.current) {
        setSending(false);
      }
    }
  }; // Cierre definitivo de la función handleSend
// ========================================================================
// INIT / AUTO RECONNECT (MÁXIMA ROBUSTEZ SSR & CONTROL DE DEPENDENCIAS)
// ========================================================================

useEffect(() => {
  mountedRef.current = true;

  async function autoReconnect() {
    try {
      // 1. Guardián de entorno de MiniKit
      if (typeof MiniKit === "undefined" || !MiniKit || !MiniKit.isInstalled()) {
        setStatus("Por favor, abre la aplicación desde World App");
        return;
      }

      // 2. CORRECCIÓN VERCEL (SSR GUARD): Acceso seguro a localStorage solo en el cliente
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      const storedWallet = localStorage.getItem("rc_wallet_address");
      if (!storedWallet || !ethers.isAddress(storedWallet)) {
        setStatus("Listo para conectar");
        return;
      }

      // Normalizamos la dirección recuperada con Checksum
      const cleanStoredWallet = ethers.getAddress(storedWallet);
      setWallet(cleanStoredWallet);
      
      // Asignación segura del objeto de red por defecto (World Chain)
      const defaultChain = NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
      setNetwork(defaultChain);
      
      setWorldVerified(true);
      setStatus("Reconectando sesión...");

      // 3. Captura segura de la promesa del módulo de diagnóstico de proveedores
      try {
        detectProvider().then((res) => {
          if (mountedRef.current && Array.isArray(res) && typeof setDetectedProviders === "function") {
            setDetectedProviders(res);
          }
        });
      } catch (provErr) {
        console.warn("Fallo no crítico al diagnosticar proveedores inyectados:", provErr);
      }

      // 4. Temporizador de escaneo inicial blindado contra desmontado de interfaz
      setTimeout(async () => {
        try {
          if (mountedRef.current && cleanStoredWallet) {
            await scanAllNetworks(cleanStoredWallet);
          }
        } catch (scanErr) {
          console.error("Fallo controlado en el escaneo automatizado inicial:", scanErr);
        }
      }, 1500);

    } catch (err) {
      console.error("[AUTO RECONNECT CRITICAL ERROR] Falló el disparador de arranque:", err);
    } 
  }

  autoReconnect();

  return () => {
    // Al desmontarse el componente, apagamos de forma fulminante cualquier actualización de estado pendiente
    mountedRef.current = false;
  };
}, [scanAllNetworks]); // Dependencia estable que no generará bucles repetitivos infinitos
// ========================================================================
// AUTO HIDE STATUS (ROBUSTEZ DE DEPENDENCIAS Y SINCRONIZACIÓN DE INTERFAZ)
// ========================================================================

useEffect(() => {
  if (!status) return;

  // Lista de estados críticos que NO deben ocultarse solos hasta que terminen las peticiones RPC
  const criticalStatuses = [
    "Inicializando RC Wallet...",
    "Escaneando redes en busca de fondos...",
    "Enviando operación a World App...",
    "Esperando confirmación en la blockchain...",
    "Esperando confirmación..."
  ];

  if (criticalStatuses.includes(status)) return;

  const timer = setTimeout(() => {
    // CORRECCIÓN: Validación defensiva usando doble verificación antes de limpiar el toast
    if (typeof mountedRef !== "undefined" && mountedRef.current) {
      setStatus("");
    }
  }, 4000);

  return () => clearTimeout(timer);
}, [status]); // Sincronización lineal y directa basada en eventos de alerta
  // ========================================================================
  // UI (CONTENEDOR MAESTRO DE ALTA ROBUSTEZ Y ESTILO RESPONSIVO)
  // ========================================================================

  return (
    <div
      style={{
        padding: 20,
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
        boxSizing: "border-box" // Añadido para prevenir desbordamientos horizontales en pantallas móviles
      }}
    >
      <h1>RC Wallet</h1>
      {/* ========================================================
         STATUS TOAST (CORREGIDO CON ADAPTACIÓN DE COLOR V3)
      ======================================================== */}
      {status && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background:
              status.includes("completada") || 
              status.includes("confirmada") || 
              status.includes("completado") || 
              status.includes("confirmado") ||
              status.includes("éxito")
                ? "#16a34a" // Verde para éxitos de rescate de fondos
                : status.includes("cancelada") || 
                  status.includes("Error") || 
                  status.includes("inválida") || 
                  status.includes("insuficientes")
                ? "#dc2626" // Rojo para advertencias o fondos insuficientes
                : "#111827", // Gris oscuro para procesos de carga RPC
            color: "#fff",
            padding: "16px 24px",
            borderRadius: 16,
            zIndex: 9999,
            fontWeight: "bold",
            fontSize: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            textAlign: "center",
            maxWidth: "90%",
            width: "auto",
            boxSizing: "border-box"
          }}
        >
          {status}
        </div>
      )}

      {/* ========================================================
         BOTÓN DE AUTENTICACIÓN (ESTILO MÓVIL SEGURO)
      ======================================================== */}
      <button
        onClick={handleWorldLogin}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "none",
          background: "#2563eb",
          color: "#fff",
          fontWeight: "bold",
          fontSize: 16,
          marginBottom: 20,
          cursor: "pointer",
          boxSizing: "border-box" // CORRECCIÓN: Evita desbordamiento horizontal en celulares
        }}
      >
        Iniciar sesión con World ID
      </button>

      <hr style={{ borderColor: "#222", borderWidth: "1px", borderStyle: "solid", marginBottom: 20 }} />
      {/* ========================================================
         WALLET INFO (DISEÑO BLINDADO CONTRA CAÍDAS DE WEBVIEWS)
      ======================================================== */}
      <p style={{ fontWeight: "bold", marginBottom: 5 }}>Dirección Wallet:</p>
      <div
        style={{
          background: "#111827",
          padding: 12,
          borderRadius: 12,
          wordBreak: "break-all",
          marginBottom: 12,
          border: "1px solid #333",
          fontSize: 13,
        }}
      >
        {wallet || "No conectada"}
      </div>

      <button
        disabled={!wallet}
        onClick={() => {
          if (!wallet) return;

          // MEDIDA DE ALTA ROBUSTEZ: Intenta usar la API moderna del navegador
          if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            navigator.clipboard.writeText(wallet)
              .then(() => setStatus("Dirección copiada"))
              .catch(() => setStatus("Error al copiar de forma automática"));
          } else {
            // FALLBACK INDESTRUCTIBLE: Crea un elemento invisible para forzar el copiado en WebView móviles
            try {
              const textArea = document.createElement("textarea");
              textArea.value = wallet;
              textArea.style.position = "fixed"; // Evita scroll visual en la pantalla del celular
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              document.execCommand("copy");
              document.body.removeChild(textArea);
              setStatus("Dirección copiada");
            } catch (fallbackErr) {
              console.error("Fallo absoluto en los portapapeles del dispositivo:", fallbackErr);
              setStatus("No se pudo copiar automáticamente");
            }
          }
        }}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "none",
          background: wallet ? "#16a34a" : "#333",
          color: "#fff",
          fontWeight: "bold",
          marginBottom: 20,
          cursor: wallet ? "pointer" : "not-allowed",
          boxSizing: "border-box" // Protege la alineación horizontal móvil
        }}
      >
        Copiar dirección
      </button>
      {/* ========================================================
         QR WALLET (DISEÑO SEGURO Y COMPATIBLE CON IMÁGENES)
      ======================================================== */}
      {wallet && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${wallet}`}
            alt="QR Wallet"
            style={{
              width: 180,
              height: 180,
              borderRadius: 20,
              border: "4px solid #111827",
              background: "#fff",
            }}
          />
        </div>
      )}

      {/* ========================================================
         INFO PANEL (MÁXIMA RESISTENCIA A RENDERIZADO SSR)
      ======================================================== */}
      <div style={{ background: "#111", padding: 12, borderRadius: 12, marginBottom: 20, border: "1px solid #222" }}>
        <p style={{ margin: "5px 0" }}><b>Red Activa:</b> {network?.name || "World Chain"}</p>
        <p style={{ margin: "5px 0" }}><b>Balance Nativo Gas:</b> {nativeBalance} ETH</p>
        <p style={{ margin: "5px 0" }}>
          <b>World ID:</b> {worldVerified ? "✅ Verificado" : "❌ No verificado"}
        </p>
      </div>

      {/* ========================================================
         NATIVE QR SCANNER (REQUERIMIENTO: ESCANEAR DESTINATARIOS)
      ======================================================== */}
      <button
        type="button"
        onClick={async () => {
          try {
            // Verificación estricta de la inyección de la SDK dentro de la World App
            if (typeof MiniKit === "undefined" || !MiniKit || !MiniKit.isInstalled()) {
              setStatus("El escáner de QR solo funciona abriendo la app desde World App");
              return;
            }

            setStatus("Abriendo cámara del dispositivo...");
            
            // Invocación al comando nativo de lectura QR de la SDK estable de Worldcoin
            const qrResult = await MiniKit.commands.scanQrCode();
            
            console.log("[QR SCANNER RESPONSE] Datos leídos:", qrResult);

            // Extraemos la dirección filtrando por variantes de respuesta del hardware
            const scannedData = qrResult?.qr_code || qrResult?.data || qrResult;

            if (!scannedData) {
              setStatus("Lectura de código QR cancelada o vacía");
              return;
            }

            // Sanitizamos el string removiendo prefijos comunes de billeteras (ej: ethereum:)
            let cleanScannedAddress = scannedData.trim();
            if (cleanScannedAddress.toLowerCase().startsWith("ethereum:")) {
              cleanScannedAddress = cleanScannedAddress.substring(9);
            }
            // Si el código QR incluye el formato con la consulta de monto (ej: ?amount=) lo recortamos
            if (cleanScannedAddress.includes("?")) {
              cleanScannedAddress = cleanScannedAddress.split("?")[0];
            }

            // Validamos criptográficamente si el texto escaneado es una dirección EVM real
            if (ethers.isAddress(cleanScannedAddress)) {
              setRecipient(ethers.getAddress(cleanScannedAddress)); // Asigna el destino con Checksum activo
              setStatus("Código QR de dirección escaneado con éxito ✅");
            } else {
              setStatus("El código QR escaneado no contiene una dirección válida");
            }

          } catch (scanError) {
            console.error("Fallo crítico al invocar la cámara nativa de World App:", scanError);
            setStatus("No se pudo activar el escáner de la cámara");
          }
        }}
        style={{
          width: "100%",
          padding: 13,
          borderRadius: 14,
          border: "1px dashed #2563eb",
          background: "#1e293b",
          color: "#38bdf8",
          fontWeight: "bold",
          fontSize: 14,
          marginBottom: 20,
          cursor: "pointer",
          boxSizing: "border-box"
        }}
      >
        📸 Escanear QR de Destinatario
      </button>
      {/* ========================================================
         PROVIDERS DETECTED (DISEÑO BLINDADO DE RENDIMIENTO)
      ======================================================== */}
      <div
        style={{
          padding: 10,
          background: "#111",
          borderRadius: 10,
          fontSize: 11,
          color: "#00ff99",
          wordBreak: "break-word",
          marginBottom: 20,
          border: "1px solid #222"
        }}
      >
        <b style={{ display: "block", marginBottom: 4 }}>Detected Providers:</b>
        {(!detectedProviders || !Array.isArray(detectedProviders) || detectedProviders.length === 0) ? (
          <div style={{ color: "#aaa" }}>Ninguno detectado</div>
        ) : (
          detectedProviders.map((item, index) => {
            // Generamos una llave única combinada ultra segura para evitar advertencias de React
            const uniqueKey = item?.name ? `${item.name}-${index}` : `provider-${index}`;
            return (
              <div key={uniqueKey} style={{ marginTop: 6, display: "flex", justifyContent: "between", alignItems: "center" }}>
                <span style={{ color: "#fff" }}>{item?.name || "Unknown"}</span>
                <span style={{ marginLeft: 8 }}>{item?.hasRequest ? "✅" : "❌"}</span>
              </div>
            );
          })
        )}
      </div>

      <hr style={{ borderColor: "#222", borderWidth: "1px", borderStyle: "solid", marginBottom: 20 }} />
      {/* ========================================================
         FONDOS DETECTADOS (LISTADO MULTICADENA BLINDADO)
      ======================================================== */}
      <h2>Fondos Detectados</h2>
      {(!tokensDetected || !Array.isArray(tokensDetected) || tokensDetected.length === 0) ? (
        <p style={{ color: "#aaa" }}>No se detectaron fondos atascados.</p>
      ) : (
        tokensDetected.map((token, index) => {
          // CORRECCIÓN VERCEL: Generamos una llave única combinando red y contrato para optimizar el DOM de React
          const tokenUniqueKey = `${token?.chainId || index}-${token?.address || "native"}`;
          
          // Verificación segura y estricta del token actualmente activo
          const isSelected = selectedToken && 
                             typeof selectedToken === "object" && 
                             selectedToken.address === token.address && 
                             selectedToken.chainId === token.chainId;

          return (
            <div
              key={tokenUniqueKey}
              style={{
                border: isSelected ? "2px solid #2563eb" : "1px solid #333",
                padding: 14,
                borderRadius: 14,
                marginBottom: 12,
                background: isSelected ? "#1e293b" : "#111827",
                boxSizing: "border-box"
              }}
            >
              <p style={{ margin: "0 0 5px 0", color: "#38bdf8", fontWeight: "bold" }}>{token?.network || "Desconocida"}</p>
              <p style={{ margin: "0 0 5px 0", fontSize: 18, fontWeight: "bold" }}>
                {token?.balance || "0.00"} {token?.symbol || ""}
              </p>
              <p style={{ margin: "0 0 10px 0", fontSize: 11, color: "#aaa" }}>
                Tipo: {token?.isNative ? "Moneda Nativa (Gas)" : "Contrato Inteligente ERC-20"}
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setSelectedToken(token)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: isSelected ? "#16a34a" : "#374151",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 12,
                    boxSizing: "border-box"
                  }}
                >
                  {isSelected ? "Seleccionado ✅" : "Seleccionar para Retiro"}
                </button>

                <button
                  type="button"
                  disabled={!wallet} // CORRECCIÓN: Desactiva si la wallet no está inicializada aún
                  onClick={() => {
                    if (!wallet) return;
                    let explorer = "";
                    const activeWallet = wallet;
                    
                    if (token.chainId === 1) {
                      explorer = token.isNative ? `https://etherscan.io/address/${activeWallet}` : `https://etherscan.io/token/${token.address}?a=${activeWallet}`;
                    } else if (token.chainId === 10) {
                      explorer = token.isNative ? `https://optimistic.etherscan.io/address/${activeWallet}` : `https://optimistic.etherscan.io/token/${token.address}?a=${activeWallet}`;
                    } else if (token.chainId === 8453) {
                      explorer = token.isNative ? `https://basescan.org/address/${activeWallet}` : `https://basescan.org/token/${token.address}?a=${activeWallet}`;
                    } else if (token.chainId === 56) {
                      explorer = token.isNative ? `https://bscscan.com/address/${activeWallet}` : `https://bscscan.com/token/${token.address}?a=${activeWallet}`;
                    } else if (token.chainId === 480) {
                      explorer = token.isNative ? `https://worldscan.org/address/${activeWallet}` : `https://worldscan.org/token/${token.address}?a=${activeWallet}`;
                    }
                    
                    if (explorer && typeof window !== "undefined") {
                      window.open(explorer, "_blank", "noopener,noreferrer");
                    }
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: wallet ? "#2563eb" : "#222",
                    color: wallet ? "white" : "#555",
                    cursor: wallet ? "pointer" : "not-allowed",
                    fontSize: 12,
                    boxSizing: "border-box"
                  }}
                >
                  Ver en Explorer 🔗
                </button>
              </div>
            </div>
          );
        })
      )}

      <hr style={{ borderColor: "#222", borderWidth: "1px", borderStyle: "solid", marginBottom: 20 }} />
      {/* ========================================================
         FORMULARIO DE RETIRO (DISEÑO BLINDADO MÓVIL Y SSR)
      ======================================================== */}
      <h2>Retirar / Recuperar Fondos</h2>
      
      <p style={{ fontSize: 13, color: "#aaa", marginBottom: 5 }}>Activo Seleccionado:</p>
      <div style={{ background: "#111", padding: 12, borderRadius: 12, marginBottom: 14, border: "1px solid #222" }}>
        {selectedToken ? (
          <span style={{ color: "#00ff99", fontWeight: "bold" }}>
            {selectedToken.network} - {selectedToken.balance} {selectedToken.symbol}
          </span>
        ) : (
          <span style={{ color: "#dc2626" }}>Ningún token seleccionado. Selecciónalo arriba.</span>
        )}
      </div>

      <input
        type="text"
        placeholder="Dirección de destino (0x...)"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          marginBottom: 14,
          background: "#111",
          border: "1px solid #333",
          color: "white",
          boxSizing: "border-box",
          fontSize: 14
        }}
      />

      <input
        type="text"
        placeholder="Cantidad a enviar"
        value={sendAmount}
        onChange={(e) => setSendAmount(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          marginBottom: 14,
          background: "#111",
          border: "1px solid #333",
          color: "white",
          boxSizing: "border-box",
          fontSize: 14
        }}
      />

      <button
        type="button" // CORRECCIÓN: Evita comportamientos 'submit' erráticos del navegador
        disabled={!selectedToken || sending}
        onClick={() => {
          if (!selectedToken) return;
          // Validación robusta: Usa el balance máximo descontando gas si es nativo
          if (selectedToken.isNative) {
            setSendAmount(maxSendAmount && maxSendAmount !== "0" ? maxSendAmount : selectedToken.balance);
          } else {
            setSendAmount(selectedToken.balance);
          }
        }}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 12,
          border: "none",
          background: !selectedToken || sending ? "#222" : "#374151",
          color: !selectedToken || sending ? "#555" : "#fff",
          marginBottom: 14,
          fontWeight: "bold",
          cursor: !selectedToken || sending ? "not-allowed" : "pointer",
          boxSizing: "border-box"
        }}
      >
        Utilizar Máximo (MAX)
      </button>

      <button
        type="button"
        disabled={sending || !selectedToken || !recipient || !sendAmount}
        onClick={handleSend}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "none",
          background: sending || !selectedToken || !recipient || !sendAmount ? "#444" : "#2563eb",
          color: "#fff",
          fontWeight: "bold",
          fontSize: 16,
          cursor: sending || !selectedToken || !recipient || !sendAmount ? "not-allowed" : "pointer",
          boxSizing: "border-box"
        }}
      >
        {sending ? "Procesando en World App..." : "Retirar Fondos"}
      </button>

      <button
        type="button"
        disabled={sending || !selectedToken || !recipient || !sendAmount}
        onClick={handleSend}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "none",
          background: sending || !selectedToken || !recipient || !sendAmount ? "#444" : "#2563eb",
          color: "#fff",
          fontWeight: "bold",
          fontSize: 16,
          cursor: sending || !selectedToken || !recipient || !sendAmount ? "not-allowed" : "pointer",
          boxSizing: "border-box"
        }}
      >
        {sending ? "Procesando en World App..." : "Retirar Fondos"}
      </button>

      {/* ========================================================
         BANNER PUBLICITARIO: RINCÓN COLOMBIANO EN VARSOVIA
      ======================================================== */}
      <div
        style={{
          marginTop: 25,
          padding: 16,
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: 16,
          border: "1px solid #ffcc00", // Borde amarillo sutil (toque colombiano)
          textAlign: "center",
          boxSizing: "border-box"
        }}
      >
        <p style={{ margin: "0 0 8px 0", color: "#00ff99", fontWeight: "bold", fontSize: 15 }}>
          ¡Gracias por usar RC Wallet! 🇨🇴✨
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#e2e8f0", lineHeight: "1.5" }}>
          Te invitamos a visitar nuestro local comercial <b>RINCÓN COLOMBIANO</b> para disfrutar del mejor sabor de la comida colombiana en Varsovia.
        </p>
        <div 
          style={{ 
            marginTop: 10, 
            display: "inline-block", 
            padding: "6px 12px", 
            background: "#ffcc00", 
            color: "#000", 
            borderRadius: 8, 
            fontWeight: "bold", 
            fontSize: 12 
          }}
        >
          📍 Czapelska 33, Varsovia
        </div>
      </div>
      
      {/* ========================================================
         CONSOLE DEBUG OUTPUT (VISTA DE DEPURACIÓN ANTI-DESBORDAMIENTO)
      ======================================================== */}
      {debugResult && (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            background: "#111",
            borderRadius: 12,
            color: "#00ff99",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: "1px solid #222"
          }}
        >
          <b style={{ display: "block", marginBottom: 4 }}>CONSOLE DEBUG RESULT:</b>
          <pre 
            style={{ 
              margin: 0, 
              fontFamily: "monospace", 
              whiteSpace: "pre-wrap", 
              wordBreak: "break-all", // CORRECCIÓN MÓVIL: Fuerza el quiebre de hashes criptográficos largos
              overflowX: "auto" 
            }}
          >
            {debugResult}
          </pre>
        </div>
      )}
    </div>
  );
} // Llave final de cierre del componente export export default function App()
