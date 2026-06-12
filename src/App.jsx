import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { ethers } from "ethers";

import { MiniKit } from "@worldcoin/minikit-js";

// =========================
// NETWORKS (OPTIMIZADO)
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
    symbol: "ETH", // El gas nativo de la red base es ETH
    rpc: [
      "https://worldchain.org", // RPC oficial público y estable
      "https://worldchain-mainnet.g.alchemy.com/public",
      "https://480.rpc.thirdweb.com",
    ],
  },
  {
    name: "World Chain Sepolia (Testnet)",
    chainId: 4801,
    symbol: "ETH",
    rpc: [
      "https://worldchain.org",
    ],
  },
];

// =========================
// TOKENS
// =========================

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
// =========================
// ABI (OPTIMIZADO PARA RECUPERACIÓN DE FONDOS)
// =========================

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];
// =========================
// APP (ESTADOS OPTIMIZADOS)
// =========================

export default function App() {
  const mountedRef = useRef(true);
  const scanLockRef = useRef(false);

  // Estados de control de la billetera y UI
  const [status, setStatus] = useState("Inicializando RC Wallet...");
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState(NETWORKS[4]); // Inicializa por defecto en World Chain
  
  // Balances y Tokens
  const [nativeBalance, setNativeBalance] = useState("0");
  const [tokensDetected, setTokensDetected] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null); // Objeto completo del token seleccionado
  
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
// =========================
// RPC FALLBACK (OPTIMIZADO)
// =========================

async function getWorkingProvider(rpcList) {
  for (const rpc of rpcList) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RPC timeout")), 4000)
        ),
      ]);
      return provider;
    } catch (err) {
      console.log("RPC falló:", rpc);
    }
  }
  return null;
}

// =========================
// DYNAMIC TOKEN DETECTION (CORREGIDO)
// =========================

async function getDynamicTokens(address, chainId) {
  try {
    const network = NETWORKS.find((n) => n.chainId === chainId);
    if (!network) return [];

    const provider = await getWorkingProvider(network.rpc);
    if (!provider) return [];

    // Filtramos los tokens conocidos mapeados para este chainId específico
    const knownTokens = TOKENS.filter((token) => token.addresses[chainId]);
    const detected = [];

    for (const token of knownTokens) {
      try {
        const tokenAddress = token.addresses[chainId];
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(address);

        if (balance > 0n) {
          detected.push({
            symbol: token.symbol,
            balance: ethers.formatUnits(balance, token.decimals),
            decimals: token.decimals,
            address: tokenAddress,
            chainId,
          });
        }
      } catch (err) {
        console.log("DYNAMIC TOKEN ERROR", token.symbol, err);
      }
    }

    console.log("DYNAMIC TOKENS DETECTED:", detected);
    return detected;
  } catch (err) {
    console.log("TOKEN DETECTION ERROR", err);
    return [];
  }
}

// =========================
// ESTIMATE GAS (ADAPTADO A MÚLTIPLES DECIMALES Y EIP-1559)
// =========================
  
async function estimateNativeGas(chainId, from, to, amount, decimals = 18) {
  try {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return 0;
    }

    const network = NETWORKS.find((n) => n.chainId === chainId);
    if (!network) return null;

    const provider = await getWorkingProvider(network.rpc);
    if (!provider) return null;

    const feeData = await provider.getFeeData();
    // Prioriza tarifas máximas de EIP-1559, con fallback al precio base histórico
    const effectiveGasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;

    const estimatedGas = await provider.estimateGas({
      from,
      to,
      value: ethers.parseUnits(amount, decimals),
    });

    const gasCost = estimatedGas * effectiveGasPrice;
    return Number(ethers.formatEther(gasCost));
  } catch (err) {
    console.log("Gas estimation error", err);
    return null;
  }
}
// =========================
// PROVIDER DETECTION (OPTIMIZADO)
// =========================

async function detectProvider() {
  try {
    const detected = [];

    // =========================
    // WINDOW ETHEREUM
    // =========================
    if (typeof window !== "undefined" && typeof window.ethereum !== "undefined") {
      detected.push({
        name: "window.ethereum",
        provider: window.ethereum,
        hasRequest: typeof window.ethereum?.request === "function",
      });

      // =========================
      // MULTIPLE PROVIDERS
      // =========================
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

    // =========================
    // WINDOW SAFE
    // =========================
    if (typeof window !== "undefined" && typeof window.safe !== "undefined") {
      detected.push({
        name: "window.safe",
        provider: window.safe,
        hasRequest: typeof window.safe?.request === "function",
      });
    }

    // =========================
    // WINDOW WORLD
    // =========================
    if (typeof window !== "undefined" && typeof window.world !== "undefined") {
      detected.push({
        name: "window.world",
        provider: window.world,
        hasRequest: typeof window.world?.request === "function",
      });
    }

    // =========================
    // MINIKIT PROVIDERS
    // =========================
    if (typeof MiniKit !== "undefined" && MiniKit?.provider) {
      detected.push({
        name: "MiniKit.provider",
        provider: MiniKit.provider,
        hasRequest: typeof MiniKit?.provider?.request === "function",
      });
    }

    if (typeof MiniKit !== "undefined" && MiniKit?.walletProvider) {
      detected.push({
        name: "MiniKit.walletProvider",
        provider: MiniKit.walletProvider,
        hasRequest: typeof MiniKit?.walletProvider?.request === "function",
      });
    }

    console.log("DETECTED PROVIDERS:", detected);
    return detected; // Retorna los datos limpiamente para que el useEffect los guarde
  } catch (err) {
    console.log("PROVIDER DETECTION ERROR:", err);
    return [];
  }
}
// =========================
// SCAN (OPTIMIZADO PARA RECUPERACIÓN MULTICADENA)
// =========================

const scanAllNetworks =
  useCallback(async (address) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;

    try {
      setStatus("Escaneando redes en busca de fondos...");
      let foundTokens = [];

      for (const net of NETWORKS) {
        if (!mountedRef.current) {
          scanLockRef.current = false;
          return;
        }

        try {
          const provider = await getWorkingProvider(net.rpc);
          if (!provider) continue;

          // =========================
          // NATIVA (ETH, BNB, etc.)
          // =========================
          const nativeBal = await provider.getBalance(address);

          if (nativeBal > 0n) {
            const formattedBalance = Number(ethers.formatEther(nativeBal)).toFixed(6);
            
            foundTokens.push({
              network: net.name,
              symbol: net.symbol, // Usa el símbolo nativo real (ETH para Ethereum, Optimism y World Chain)
              balance: formattedBalance,
              isNative: true,
              chainId: net.chainId,
              decimals: 18,
              address: "NATIVE",
            });

            // Si es la red activa que tienes seleccionada, actualizamos el balance visual principal
            if (network && net.chainId === network.chainId) {
              setNativeBalance(formattedBalance);
            }
          }

          // =========================
          // DYNAMIC TOKENS (ERC-20 como WLD, USDC)
          // =========================
          const dynamicTokens = await getDynamicTokens(address, net.chainId);

          for (const token of dynamicTokens) {
            foundTokens.push({
              network: net.name,
              symbol: token.symbol,
              balance: Number(token.balance).toFixed(4),
              isNative: false,
              chainId: token.chainId,
              decimals: token.decimals,
              address: token.address,
            });
          }
        } catch (err) {
          console.log(`Error escaneando red: ${net.name}`, err);
        }
      }

      // Filtrado estricto para remover duplicados por contrato y red
      const uniqueTokens = foundTokens.filter(
        (token, index, self) =>
          index === self.findIndex((t) => t.chainId === token.chainId && t.address === token.address)
      );

      setTokensDetected(uniqueTokens);

      // CORRECCIÓN: Guardar el objeto directamente en el estado, NO como String
      if (uniqueTokens.length > 0) {
        setSelectedToken(uniqueTokens[0]); 
      } else {
        setSelectedToken(null);
      }

      setStatus("Escaneo completado. Fondos actualizados.");
    } catch (err) {
      console.log("SCAN ERROR", err);
      setStatus("Error escaneando redes");
    } finally {
      scanLockRef.current = false;
    }
  }, [network]);
// =========================
// LOGIN (CORREGIDO PARA MINIKIT ESTABLE)
// =========================

async function handleWorldLogin() {
  try {
    if (!MiniKit.isInstalled()) {
      setStatus("Abra desde World App");
      return;
    }

    setStatus("Conectando wallet...");
    
    // CORRECCIÓN: Invocación a través de commands.walletAuth
    const res = await MiniKit.commands.walletAuth({
      nonce: Math.random().toString(36).substring(2),
    });

    if (res?.error_code) {
      setStatus(res?.error_message || "Login cancelado");
      return;
    }

    const payload = res?.finalPayload || res;
    const address = payload?.address || payload?.walletAddress;

    if (!address) {
      setStatus("No se obtuvo wallet");
      return;
    }

    setWallet(address);
    localStorage.setItem("rc_wallet_address", address);
    
    // CORRECCIÓN: Asigna el objeto de red correspondiente a World Chain, no un string
    const worldChainNet = NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
    setNetwork(worldChainNet);

    setWorldVerified(true);
    setStatus("Wallet conectada");

    const providers = await detectProvider();
    
    setTimeout(async () => {
      await scanAllNetworks(address);
    }, 2500);

  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Error login");
  }
}

// =========================
// ERROR EXTRACTOR
// =========================

function extractMiniKitError(err) {
  return {
    message: err?.message || null,
    shortMessage: err?.shortMessage || null,
    reason: err?.reason || null,
    code: err?.code || null,
    errorCode: err?.error_code || null,
    stack: err?.stack || null,
    raw: err,
  };
}

// =========================
// RESULT PARSER
// =========================

function parseMiniKitResult(result) {
  const finalPayload = result?.finalPayload || result?.payload || {};

  const txId =
    finalPayload?.txHash ||
    finalPayload?.transactionHash ||
    finalPayload?.transaction_id ||
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

  const success =
    Boolean(txId) ||
    status === "success" ||
    result?.success === true ||
    finalPayload?.success === true;

  return {
    success,
    txId,
    status,
    finalPayload,
    raw: result,
  };
}

// =========================
// WAIT FOR CONFIRMATION (CORREGIDO PARA CONSULTA EN TIEMPO REAL)
// =========================

async function waitForBalanceChange(walletAddress, tokenInfo, oldBalance, maxAttempts = 12) {
  try {
    let attempts = 0;
    const net = NETWORKS.find((n) => n.chainId === tokenInfo.chainId);
    if (!net) return { success: false };

    const provider = await getWorkingProvider(net.rpc);
    if (!provider) return { success: false };

    while (attempts < maxAttempts) {
      console.log("CONFIRMATION ATTEMPT", attempts + 1);
      await new Promise((resolve) => setTimeout(resolve, 5000));

      let currentBalance = 0;

      if (tokenInfo.isNative) {
        const bal = await provider.getBalance(walletAddress);
        currentBalance = Number(ethers.formatEther(bal));
      } else {
        const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);
        const bal = await contract.balanceOf(walletAddress);
        currentBalance = Number(ethers.formatUnits(bal, tokenInfo.decimals));
      }

      if (currentBalance < Number(oldBalance)) {
        console.log("BALANCE CHANGED: FONDOS ENVIADOS");
        // Refrescamos toda la UI
        await scanAllNetworks(walletAddress);
        return {
          success: true,
          oldBalance,
          newBalance: currentBalance,
        };
      }

      attempts++;
    }

    return { success: false };
  } catch (err) {
    console.log("CONFIRMATION ERROR", err);
    return { success: false, error: err };
  }
}
// =========================
// SEND / RECUPERACIÓN (CORREGIDO Y OPTIMIZADO)
// =========================

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

    // CORRECCIÓN: selectedToken ya es un objeto directo gracias al optimizador del Scan
    const tokenInfo = selectedToken;

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

    if (Number(cleanAmount) > Number(tokenInfo.balance)) {
      setStatus("Balance insuficiente");
      return;
    }

    if (cleanRecipient.toLowerCase() === wallet.toLowerCase()) {
      setStatus("No puedes enviarte fondos a ti mismo");
      return;
    }

    // =========================
    // CÁLCULO DE GAS (SOLO NATIVOS)
    // =========================
    if (tokenInfo.isNative) {
      const gasEstimate = await estimateNativeGas(
        tokenInfo.chainId,
        wallet,
        cleanRecipient,
        cleanAmount
      );

      if (gasEstimate === null) {
        setStatus("No se pudo calcular el gas");
        return;
      }

      setEstimatedGas(gasEstimate.toFixed(8));
      const availableBalance = Number(tokenInfo.balance) - gasEstimate;

      if (Number(cleanAmount) > availableBalance) {
        setStatus("Fondos insuficientes para cubrir el gas");
        return;
      }

      setMaxSendAmount(availableBalance.toFixed(8));
    }

    // =========================
    // INICIAR PROCESO DE ENVÍO
    // =========================
    setSending(true);
    setStatus("Enviando operación a World App...");
    setDebugResult("");
    setLastTxResult(null);

    let txPayload;

    // =========================
    // CONSTRUCCIÓN DEL PAYLOAD PARA MINIKIT
    // =========================
    if (tokenInfo.isNative) {
      // Envío de moneda nativa (ETH o BNB)
      txPayload = {
        reference: `rc-native-${Date.now()}`,
        to: cleanRecipient,
        value: ethers.parseEther(cleanAmount).toString(),
      };
    } else {
      // Envío de Tokens ERC20 (WLD, USDC, USDT) utilizando la estructura nativa de MiniKit
      txPayload = {
        address: tokenInfo.address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [cleanRecipient, ethers.parseUnits(cleanAmount, tokenInfo.decimals).toString()],
        value: "0",
      };
    }

    // Guardamos el Payload en Debug para verificación visual
    setDebugResult(JSON.stringify({ phase: "payload_prepared", txPayload }, null, 2));

    // =========================
    // EJECUCIÓN EN MINI APP (WORLD APP)
    // =========================
    console.log("Ejecutando MiniKit.sendTransaction en red:", tokenInfo.chainId);
    
    // CORRECCIÓN: Uso de la firma directa y captura global de la respuesta en la misma jerarquía
    const result = await MiniKit.sendTransaction({
      chainId: tokenInfo.chainId, // Ejecuta dinámicamente en la red del token seleccionado (Ej: 1 para Ethereum, 480 para World Chain)
      transactions: [txPayload],
    });

    console.log("MINIKIT RAW RESULT:", result);

    // =========================
    // PROCESAMIENTO DE RESPUESTA
    // =========================
    const parsed = parseMiniKitResult(result);
    setLastTxResult(parsed);
    setDebugResult(JSON.stringify(parsed, null, 2));

    if (!parsed.success) {
      setStatus(parsed?.status || "Operación rechazada o fallida");
      setSending(false);
      return;
    }

    // =========================
    // CONFIRMACIÓN EN BLOCKCHAIN
    // =========================
    setStatus("Esperando confirmación en la blockchain...");
    
    const confirmation = await waitForBalanceChange(
      wallet,
      tokenInfo,
      tokenInfo.balance
    );

    if (confirmation.success) {
      setStatus("¡Transacción confirmada con éxito! Fondos recuperados.");
    } else {
      setStatus("Operación enviada al Relay de la red");
    }

    // Refrescar saldos finales
    setTimeout(async () => {
      try {
        await scanAllNetworks(wallet);
      } catch (e) {
        console.error(e);
      }
      setSending(false);
    }, 2000);

  } catch (err) {
    console.error("CRITICAL SEND ERROR:", err);
    setStatus("Error crítico durante el envío");
    setDebugResult(JSON.stringify(extractMiniKitError(err), null, 2));
    setSending(false);
  }
};
// =========================
// INIT / AUTO RECONNECT (CORREGIDO)
// =========================

useEffect(() => {
  mountedRef.current = true;

  async function autoReconnect() {
    try {
      if (!MiniKit.isInstalled()) {
        setStatus("Por favor, abre desde World App");
        return;
      }

      const storedWallet = localStorage.getItem("rc_wallet_address");
      if (!storedWallet) {
        setStatus("Listo para conectar");
        return;
      }

      setWallet(storedWallet);
      
      // CORRECCIÓN: Asignar el objeto real de World Chain por defecto en lugar de un String plano
      const defaultChain = NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
      setNetwork(defaultChain);
      
      setWorldVerified(true);
      setStatus("Reconectando sesión...");

      // Ejecuta la detección de entornos inyectados silenciosamente
      detectProvider();

      // Disparador del escaneo inicial de saldos en todas las redes
      setTimeout(async () => {
        if (mountedRef.current) {
          await scanAllNetworks(storedWallet);
        }
      }, 2000);

    } catch (err) {
      console.log("Auto reconnect error:", err);
    } 
  }

  autoReconnect();

  return () => {
    mountedRef.current = false;
  };
}, [scanAllNetworks]);

// =========================
// AUTO HIDE STATUS (OPTIMIZADO)
// =========================

useEffect(() => {
  if (!status) return;

  // Lista de estados críticos que NO deben ocultarse solos hasta que terminen
  const criticalStatuses = [
    "Inicializando RC Wallet...",
    "Escaneando redes en busca de fondos...",
    "Enviando operación a World App...",
    "Esperando confirmación en la blockchain..."
  ];

  if (criticalStatuses.includes(status)) return;

  const timer = setTimeout(() => {
    if (mountedRef.current) {
      setStatus("");
    }
  }, 4000);

  return () => clearTimeout(timer);
}, [status]);
  // =========================
  // UI (CORREGIDA Y BLINDADA)
  // =========================

  return (
    <div
      style={{
        padding: 20,
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>RC Wallet</h1>

      {/* =========================
         STATUS TOAST
      ========================= */}
      {status && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background:
              status.includes("completada") || status.includes("confirmada")
                ? "#16a34a"
                : status.includes("cancelada") || status.includes("Error") || status.includes("inválida")
                ? "#dc2626"
                : "#111827",
            color: "#fff",
            padding: "16px 24px",
            borderRadius: 16,
            zIndex: 9999,
            fontWeight: "bold",
            fontSize: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            textAlign: "center",
            maxWidth: "90%",
          }}
        >
          {status}
        </div>
      )}

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
        }}
      >
        Iniciar sesión con World ID
      </button>

      <hr style={{ borderColor: "#222" }} />

      {/* =========================
         WALLET INFO
      ========================= */}
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
        onClick={() => {
          if (!wallet) return;
          navigator.clipboard.writeText(wallet);
          setStatus("Dirección copiada");
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
        }}
        disabled={!wallet}
      >
        Copiar dirección
      </button>

      {/* =========================
         QR WALLET
      ========================= */}
      {wallet && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${wallet}`}
            alt="QR Wallet"
            style={{
              width: 200,
              height: 200,
              borderRadius: 20,
              border: "4px solid #111827",
              background: "#fff",
            }}
          />
        </div>
      )}

      <div style={{ background: "#111", padding: 12, borderRadius: 12, marginBottom: 20 }}>
        {/* CORRECCIÓN: Renderizar propiedad .name del objeto, no el objeto completo */}
        <p style={{ margin: "5px 0" }}><b>Red Activa:</b> {network?.name || "Ninguna"}</p>
        <p style={{ margin: "5px 0" }}><b>Balance Nativo Gas:</b> {nativeBalance} ETH</p>
        <p style={{ margin: "5px 0" }}>
          <b>World ID:</b> {worldVerified ? "✅ Verificado" : "❌ No verificado"}
        </p>
      </div>

      {/* =========================
         PROVIDERS DETECTED
      ========================= */}
      <div
        style={{
          padding: 10,
          background: "#111",
          borderRadius: 10,
          fontSize: 11,
          color: "#00ff99",
          wordBreak: "break-word",
          marginBottom: 20,
        }}
      >
        <b>Detected Providers:</b>
        {detectedProviders.length === 0 ? (
          <div>Ninguno detectado</div>
        ) : (
          detectedProviders.map((item, index) => (
            <div key={index} style={{ marginTop: 4 }}>
              {item.name} {item.hasRequest ? "✅" : "❌"}
            </div>
          ))
        )}
      </div>

      <hr style={{ borderColor: "#222" }} />

      {/* =========================
         FONDOS DETECTADOS (ESCÁNER)
      ========================= */}
      <h2>Fondos Detectados</h2>
      {tokensDetected.length === 0 && (
        <p style={{ color: "#aaa" }}>No se detectaron fondos atascados.</p>
      )}

      {tokensDetected.map((token, index) => {
        const isSelected = selectedToken && selectedToken.address === token.address && selectedToken.chainId === token.chainId;
        return (
          <div
            key={index}
            style={{
              border: isSelected ? "2px solid #2563eb" : "1px solid #333",
              padding: 14,
              borderRadius: 14,
              marginBottom: 12,
              background: isSelected ? "#1e293b" : "#111827",
            }}
          >
            <p style={{ margin: "0 0 5px 0", color: "#38bdf8", fontWeight: "bold" }}>{token.network}</p>
            <p style={{ margin: "0 0 5px 0", fontSize: 18, fontWeight: "bold" }}>
              {token.balance} {token.symbol}
            </p>
            <p style={{ margin: "0 0 10px 0", fontSize: 11, color: "#aaa" }}>
              Tipo: {token.isNative ? "Moneda Nativa" : "Contrato ERC-20"}
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button
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
                }}
              >
                {isSelected ? "Seleccionado ✅" : "Seleccionar para Enviar"}
              </button>

              <button
                onClick={() => {
                  let explorer = "";
                  if (token.chainId === 1) explorer = token.isNative ? `https://etherscan.io/address/${wallet}` : `https://etherscan.io/token/${token.address}?a=${wallet}`;
                  else if (token.chainId === 10) explorer = token.isNative ? `https://optimistic.etherscan.io/address/${wallet}` : `https://optimistic.etherscan.io/token/${token.address}?a=${wallet}`;
                  else if (token.chainId === 8453) explorer = token.isNative ? `https://basescan.org/address/${wallet}` : `https://basescan.org/token/${token.address}?a=${wallet}`;
                  else if (token.chainId === 56) explorer = token.isNative ? `https://bscscan.com/address/${wallet}` : `https://bscscan.com/token/${token.address}?a=${wallet}`;
                  else if (token.chainId === 480) explorer = token.isNative ? `https://worldscan.org/address/${wallet}` : `https://worldscan.org/token/${token.address}?a=${wallet}`;
                  if (explorer) window.open(explorer, "_blank");
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Ver Explorer
              </button>
            </div>
          </div>
        );
      })}

      <hr style={{ borderColor: "#222" }} />

      {/* =========================
         FORMULARIO DE ENVÍO
      ========================= */}
      <h2>Retirar / Recuperar Fondos</h2>
      
      <p style={{ fontSize: 13, color: "#aaa", marginBottom: 5 }}>Activo Seleccionado:</p>
      <div style={{ background: "#111", padding: 12, borderRadius: 12, marginBottom: 14, border: "1px solid #222" }}>
        {selectedToken ? (
          <span style={{ color: "#00ff99", fontWeight: "bold" }}>
            {selectedToken.network} - {selectedToken.balance} {selectedToken.symbol}
          </span>
        ) : (
          <span style={{ color: "#dc2626" }}>Ningún token seleccionado. Márcalo arriba.</span>
        )}
      </div>

      <input
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
          boxSizing: "border-box"
        }}
      />

      <input
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
          boxSizing: "border-box"
        }}
      />

      <button
        onClick={() => {
          if (!selectedToken) return;
          // CORRECCIÓN: Lectura directa sin JSON.parse
          if (selectedToken.isNative) {
            setSendAmount(maxSendAmount !== "0" ? maxSendAmount : selectedToken.balance);
          } else {
            setSendAmount(selectedToken.balance);
          }
        }}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 12,
          border: "none",
          background: "#374151",
          color: "#fff",
          marginBottom: 14,
          fontWeight: "bold",
          cursor: "pointer"
        }}
      >
        Utilizar Máximo (MAX)
      </button>

      <button
        disabled={sending || !selectedToken}
        onClick={handleSend}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "none",
          background: sending || !selectedToken ? "#444" : "#2563eb",
          color: "#fff",
          fontWeight: "bold",
          fontSize: 16,
          cursor: sending || !selectedToken ? "not-allowed" : "pointer"
        }}
      >
        {sending ? "Procesando en World App..." : "Retirar Fondos"}
      </button>

      {/* =========================
         CONSOLE DEBUG OUTPUT
      ========================= */}
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
          }}
        >
          <b>CONSOLE DEBUG RESULT</b>
          <pre style={{ margin: "5px 0 0 0", fontFamily: "monospace" }}>{debugResult}</pre>
        </div>
      )}
    </div>
  );
}
