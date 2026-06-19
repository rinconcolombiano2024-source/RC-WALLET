import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { ethers } from "ethers";
import { MiniKit } from "@worldcoin/minikit-js";

// ========================================================================
// NETWORKS (INFRAESTRUCTURA MULTICADENA Y REDES DE SALVAMENTO DE FONDOS)
// ========================================================================
const NETWORKS = [
  {
    name: "World Chain",
    chainId: 480,
    symbol: "ETH", 
    rpc: [
      "https://worldchain.org", // RPC oficial público de World Chain
      "https://alchemy.com",
      "https://thirdweb.com",
    ],
  },
  {
    name: "Optimism",
    chainId: 10,
    symbol: "ETH",
    rpc: [
      "https://publicnode.com",
      "https://ankr.com",
    ],
  },
  {
    name: "Base",
    chainId: 8453,
    symbol: "ETH",
    rpc: [
      "https://publicnode.com",
      "https://base.org",
    ],
  },
  {
    name: "BNB Chain",
    chainId: 56,
    symbol: "BNB",
    rpc: [
      "https://publicnode.com",
      "https://ankr.com",
    ],
  },
  {
    name: "Ethereum",
    chainId: 1,
    symbol: "ETH",
    rpc: [
      "https://publicnode.com",
      "https://ankr.com",
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

// ========================================================================
// TOKENS (LISTADO DE CONTROL TOTAL DE ACTIVOS VIP DE PRIMERA GENERACIÓN)
// ========================================================================
const TOKENS = [
  {
    symbol: "RC.PL",
    decimals: 18, 
    tradingViewSymbol: "UNISWAP:WLDUSDC", // Ticker de simulación analítica
    addresses: {
      480: "0xb9DEe79d682f9dA8B95761036f2763cdE25bD3e8",   // World Chain Mainnet
      4801: "0xb9DEe79d682f9dA8B95761036f2763cdE25bD3e8"  // World Chain Sepolia Testnet
    }
  },
  {
    symbol: "WLD",
    decimals: 18,
    tradingViewSymbol: "BINANCE:WLDUSDT", // Gráfica de velas en tiempo real
    addresses: {
      480: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
      10: "0xdC6fF44d5d932CBD77b52E5612Ba0529DC6226F1",
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",
      4801: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003"
    }
  },
  {
    symbol: "USDC",
    decimals: 6,
    tradingViewSymbol: "CRYPTO:USDCUSD",
    addresses: {
      480: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
      10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      1: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      4801: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88"
    }
  },
  {
    symbol: "USDT",
    decimals: 6,
    tradingViewSymbol: "CRYPTO:USDTUSD",
    addresses: {
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58"
    }
  },
  {
    symbol: "GOLD", // Token de Oro Digital
    decimals: 18,
    tradingViewSymbol: "OANDA:XAUUSD", // Gráfica con precio internacional del Oro en vivo
    addresses: {
      480: "0x25aC3DB36BDCE12B9E4340FFb62B8dC1c0B5EF91" // Contrato oficial World Chain
    }
  },
  {
    symbol: "SUSHI", // Token de SushiSwap
    decimals: 18,
    tradingViewSymbol: "BINANCE:SUSHIUSDT",
    addresses: {
      480: "0x6A1CD7b1981FDEEB8f8702b36c4b225389658E29"
    }
  },
  {
    symbol: "MADS", // Token de ecosistema Mads
    decimals: 18,
    tradingViewSymbol: "UNISWAP:MADSUSDT",
    addresses: {
      480: "0x39FcEFD22c3407e3E4CDCD60831631FF6A1CD7b1"
    }
  },
  {
    symbol: "RCOL", // Token de Rincón Colombiano alternativo
    decimals: 18,
    tradingViewSymbol: "UNISWAP:WLDUSDC",
    addresses: {
      480: "0x78BCEFD3407e3E4CDCD60831631FF6A1CD7b25aC"
    }
  },
  {
    symbol: "WBTC",
    decimals: 8,
    tradingViewSymbol: "BINANCE:BTCUSDT", // Gráfica de Bitcoin
    addresses: {
      480: "0x03C7054bcb39f7b2e5B2c7AcB37583e32D70Cfa3"
    }
  },
  {
    symbol: "WETH",
    decimals: 18,
    tradingViewSymbol: "BINANCE:ETHUSDT", // Gráfica de Ethereum
    addresses: {
      480: "0x4200000000000000000000000000000000000006"
    }
  }
];
// ========================================================================
// ABI DEFINITIVO (MÁXIMA ROBUSTEZ Y SINTAXIS UNIFICADA COMPATIBLE CON V6)
// ========================================================================
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 value) returns (bool)"
];

// ========================================================================
// MOTOR ANALÍTICO DE INCUBACIÓN DE GRÁFICAS (SANEADO Y CORREGIDO V6)
// ========================================================================
function getDexScreenerUrl(token) {
  // Diccionario Oficial de Piscinas de Liquidez (Pair Addresses) en World Chain, Optimism y Base
  const pairs = {
    "WLD":   "worldchain/0x2cFc85d8E48F8EAB294be644d9E25C3030863003", // Par WLD/WETH Oficial
    "RC.PL": "worldchain/0x2cFc85d8E48F8EAB294be644d9E25C3030863003", // Fallback analítico seguro a WLD
    "USDC":  "worldchain/0x79A02482A880bCE3F13e09Da970dC34db4CD24d1", // Par USDC/WLD
    "WETH":  "worldchain/0x4200000000000000000000000000000000000006", 
    "WBTC":  "worldchain/0x03C7054bcb39f7b2e5B2c7AcB37583e32D70Cfa3",
    "MADS":  "worldchain/0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
    "RCOL":  "worldchain/0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
    "SUSHI": "optimism/0x6A1CD7b1981FDEEB8f8702b36c4b225389658E29"
  };

  const targetPair = pairs[token?.symbol] || pairs.WLD;

  // REPARADO: Inyección exacta mediante ${targetPair} y barra diagonal de ruta integrada
  return `https://dexscreener.com{targetPair}?embed=1&theme=dark&trades=0&info=0&chartTheme=dark`;
}

// ========================================================================
// COMPONENTE PRINCIPAL (APERTURA Y CONTROL DE ESTADOS MAESTROS)
// ========================================================================
export default function App() {
  const mountedRef = useRef(true);
  const scanLockRef = useRef(false);
  
  // CONFIGURACIÓN COMERCIAL ASIGNADA - RINCÓN COLOMBIANO
  const ADMIN_FEE_WALLET = "0x0bbbd8eba77db629721ccdfa0c57a9ee107fdb85"; 
  
  // MODELO DE TARIFAS DE 3 VÍAS
  const FEE_GENERIC_TOKENS_PCT = 0.02;                // 2% para transferencias externas multicadena
  const FEE_WORLD_CHAIN_GENERIC_PCT = 0.000000000001; // Tasa infra-mínima para tokens estándar en World Chain
  const FEE_RC_PL_TOKEN_PCT = 0.00000000000001;       // Tasa VIP Exclusiva para tu activo RC.PL

  // Estados de control de la billetera y UI
  const [status, setStatus] = useState("Inicializando RC Wallet...");
  const [wallet, setWallet] = useState("");
  
  // SELECCIÓN SEGURA: Localiza World Chain por ID (480) o aplica fallback controlado al primer elemento
  const [network, setNetwork] = useState(() => {
    return NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
  });
  
  // Balances y Tokens detectados en el escáner
  const [nativeBalance, setNativeBalance] = useState("0");
  const [tokensDetected, setTokensDetected] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null); 
  
  // SINCRO ANALÍTICA TRADINGVIEW: Almacena el ticker activo
  const [activeChartSymbol, setActiveChartSymbol] = useState("BINANCE:WLDUSDT");
  
  // Formulario de envío / Recuperación principal
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [maxSendAmount, setMaxSendAmount] = useState("0");

  // Estado de MiniKit y depuración
  const [worldVerified, setWorldVerified] = useState(false);
  const [debugResult, setDebugResult] = useState("");
  const [lastTxResult, setLastTxResult] = useState(null);
  const [detectedProviders, setDetectedProviders] = useState([]);

  // CONTROLES DE INTERFAZ: Ventanas Emergentes (Modales) y Buscador reactivo
  const [showTokenModal, setShowTokenModal] = useState(false); 
  const [tradeType, setTradeType] = useState(""); 
  const [tradeAmount, setTradeAmount] = useState(""); 
  const [searchQuery, setSearchQuery] = useState(""); 

  // MOTOR DE INTERCAMBIO (SWAPS): Almacena el token destino de conversión
  const [targetSwapToken, setTargetSwapToken] = useState(null);

  // CONTROL DE TEMPORALIDAD REACTIVA PARA LAS GRÁFICAS
  const [chartInterval, setChartInterval] = useState("1H");

  // CONTROL DE MODALES DE SEGURIDAD Y ÉXITO TRANSACCIONAL
  const [showConfirmModal, setShowConfirmModal] = useState(false); 
  const [showSuccessModal, setShowSuccessModal] = useState(false); 
  const [successDetails, setSuccessDetails] = useState({ title: "", description: "" }); 

  // CONTROL DE ESTRUCTURA CONTRACTUAL MULTICADENA
  const [safeNetworkStates, setSafeNetworkStates] = useState({});
  // ========================================================================
  // ENGINE INITIALIZATION (INICIALIZADOR ÚNICO DE INTEGRACIÓN MINIKIT)
  // ========================================================================
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && typeof MiniKit !== "undefined" && MiniKit) {
        if (typeof MiniKit.install === "function") {
          MiniKit.install();
          console.log("[WORLD SDK] MiniKit instalado correctamente en el ciclo de vida del DOM.");
        }
      }
    } catch (engineErr) {
      console.warn("Fallo controlado en el motor de hardware MiniKit:", engineErr.message);
    }
  }, []); // Se ejecuta una sola vez al montar la App para prevenir colisiones en memoria

  // INFRAESTRUCTURA DE ENRUTAMIENTO DE INTERCAMBIOS (SWAPS CONTRACT PRO)
  const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; 

  // ABI oficial para ejecutar swaps de mercado directos (Crypto a Crypto)
  const EXCHANGE_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
  ];

  // ========================================================================
  // FUNCIONES UTILITARIAS DE RED (BLINDADAS Y EN ÁMBITO CORRECTO DE APP)
  // ========================================================================
  const getWorkingProvider = async (rpcList) => {
    if (!rpcList || !Array.isArray(rpcList) || rpcList.length === 0) {
      return null;
    }
    for (const rpc of rpcList) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc, undefined, {
          staticNetwork: true,
          batchMaxCount: 1
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RPC Timeout")), 3500)
        );
        await Promise.race([
          provider.getBlockNumber(),
          timeoutPromise
        ]);
        return provider;
      } catch (err) {
        console.warn(`Nodo RPC descartado por latencia o falla: ${rpc}`);
      }
    }
    return null;
  };

  const getDynamicTokens = async (address, chainId) => {
    try {
      if (!address || !ethers.isAddress(address)) return [];
      const netConfig = NETWORKS.find((n) => n.chainId === chainId);
      if (!netConfig) return [];
      const provider = await getWorkingProvider(netConfig.rpc);
      if (!provider) return [];

      const knownTokens = TOKENS.filter((token) => token.addresses?.[chainId]);
      const detected = [];

      const promises = knownTokens.map(async (token) => {
        try {
          const rawAddress = token.addresses[chainId];
          const tokenAddress = ethers.getAddress(rawAddress);
          const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const balance = await contract.balanceOf(address);

          if (balance && balance > 0n) {
            // INDEXACIÓN DE SYMBOLS COMPATIBLES CON STREAM DE WEBSOCKETS EN TIEMPO REAL
            let streamTicker = `${token.symbol.toLowerCase()}usdt`;
            if (token.symbol === "RC.PL") streamTicker = "wldusdt"; // Par espejo para simulación reactiva local
            if (token.symbol === "WBTC") streamTicker = "btcusdt";
            if (token.symbol === "WETH") streamTicker = "ethusdt";

            return {
              symbol: token.symbol,
              balance: ethers.formatUnits(balance, token.decimals),
              decimals: token.decimals,
              address: tokenAddress,
              chainId,
              network: netConfig.name,
              tradingViewSymbol: token.tradingViewSymbol || "BINANCE:WLDUSDT",
              binanceStreamSymbol: streamTicker
            };
          }
        } catch (tokenErr) {
          console.warn(`Error leyendo contrato ${token.symbol} en red ${chainId}:`, tokenErr.message);
        }
        return null;
      });

      const results = await Promise.allSettled(promises);
      for (const result of results) {
        if (result.status === "fulfilled" && result.value !== null) {
          detected.push(result.value);
        }
      }
      return detected;
    } catch (err) {
      console.error("TOKEN DETECTION CRITICAL ERROR:", err);
      return [];
    }
  };

  const estimateNativeGas = async (chainId, from, to, amount, decimals = 18) => {
    try {
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return 0;
      }
      const netConfig = NETWORKS.find((n) => n.chainId === chainId);
      if (!netConfig) return 0;
      const provider = await getWorkingProvider(netConfig.rpc);
      if (!provider) return 0;
      if (!ethers.isAddress(from) || !ethers.isAddress(to)) return 0;

      let valueWei;
      try {
        valueWei = ethers.parseUnits(amount.toString(), decimals);
      } catch {
        return 0;
      }

      const feeData = await provider.getFeeData();
      const baseGasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
      const effectiveGasPrice = (baseGasPrice * 120n) / 100n;

      let estimatedGas = 21000n;
      try {
        estimatedGas = await provider.estimateGas({
          from: ethers.getAddress(from),
          to: ethers.getAddress(to),
          value: valueWei,
        });
      } catch (estError) {
        console.warn("Llamada estimateGas rechazada por el nodo RPC:", estError.message);
        if (chainId === 480 || chainId === 10) {
          estimatedGas = 60000n; 
        }
      }

      const gasCostWei = estimatedGas * effectiveGasPrice;
      const formattedGas = ethers.formatEther(gasCostWei);
      return parseFloat(formattedGas) || 0;
    } catch (err) {
      console.error("Gas estimation critical fallback error:", err);
      return 0;
    }
  };
  // ========================================================================
  // VALIDATOR ENGINE: DEPURACIÓN DEFENSIVA DE PRUEBAS DE PROTOCOLO WORLD ID
  // ========================================================================
  const verifyWorldIDProof = async (proofResponse) => {
    // Si no hay respuesta del SDK, salimos de forma segura sin congelar la app
    if (!proofResponse) return false;
    try {
      // Extrae de forma limpia el payload oficial de verificación ZKP de MiniKit
      const merkleRoot = proofResponse?.merkle_root;
      const nullifierHash = proofResponse?.nullifier_hash;
      const proof = proofResponse?.proof;
      const verificationStatus = proofResponse?.status;

      if (!merkleRoot || !nullifierHash || !proof) {
        console.warn("[WORLD ID VALIDATOR] Parámetros de prueba criptográfica incompletos o ausentes.");
        return false;
      }

      console.log("[WORLD ID VALIDATOR] Prueba ZKP recibida con éxito. Estado:", verificationStatus);
      return true;
    } catch (err) {
      console.error("[WORLD ID VALIDATOR] Fallo crítico validando credenciales:", err);
      return false;
    }
  };

  // ========================================================================
  // PROVIDER DETECTION (MÁXIMA ROBUSTEZ Y ADAPTACIÓN EN ÁMBITO DE APP)
  // ========================================================================
  const detectProvider = async () => {
    // Guardián estricto para evitar fallos de compilación si el entorno no es el cliente (Vercel SSR Guard)
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

      console.log("[PROVIDER DIAGNOSTIC] Diagnóstico final de proveedores:", detected);
      return detected;

    } catch (err) {
      console.error("PROVIDER DETECTION CRITICAL ERROR:", err?.message || err);
      return [];
    }
  };
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
        // Guardián de ciclo: detiene el escaneo inmediatamente si el usuario cierra la sección o desmonta la app
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

          // ========================================================================
          // NATIVA (ETH, BNB, ETC. LECTURA DE ALTA PRECISIÓN Y ANCHOR PARA GRÁFICAS)
          // ========================================================================
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
              // ASIGNACIÓN GRÁFICA: Permite ver el precio en tiempo real del gas nativo de la red
              tradingViewSymbol: net.symbol === "BNB" ? "BINANCE:BNBUSDT" : "CRYPTO:ETHUSD"
            });

            // Validación defensiva antes de comparar el objeto de red activo
            if (network && typeof network === "object" && net.chainId === network.chainId) {
              setNativeBalance(formattedBalance);
            }
          }

          // ========================================================================
          // DYNAMIC TOKENS (ERC-20 COMO WLD, USDC - ULTRA SEGURO CON ENLACE DE PRECIO)
          // ========================================================================
          const dynamicTokens = await getDynamicTokens(cleanAddress, net.chainId);

          if (Array.isArray(dynamicTokens)) {
            for (const token of dynamicTokens) {
              if (token && token.balance) {
                foundTokens.push({
                  network: net.name,
                  symbol: token.symbol,
                  balance: parseFloat(token.balance).toFixed(4), 
                  isNative: false,
                  chainId: token.chainId,
                  decimals: token.decimals,
                  address: token.address,
                  tradingViewSymbol: token.tradingViewSymbol || "BINANCE:WLDUSDT"
                });
              }
            }
          }
        } catch (netErr) {
          console.error(`[SCAN NETWORK ERROR] Fallo controlado en la red ${net.name}:`, netErr?.message || netErr);
        }
      } // Fin del bucle for de NETWORKS

      // Filtrado estricto para remover duplicados por contrato y red (Incluye RC.PL de forma segura)
      const uniqueTokens = foundTokens.filter(
        (token, index, self) =>
          index === self.findIndex((t) => t.chainId === token.chainId && t.address === token.address)
      );

      setTokensDetected(uniqueTokens);

      // CORRECCIÓN DE EXPERIENCIA: Mantiene la selección del usuario si el token sigue existiendo
      if (uniqueTokens.length > 0) {
        const stillExists = selectedToken ? uniqueTokens.find(t => t.address === selectedToken.address && t.chainId === selectedToken.chainId) : null;
        if (!stillExists) {          
          // Si no hay selección previa, toma el primer token detectado
          setSelectedToken(uniqueTokens[0]); 
          if (uniqueTokens[0]?.tradingViewSymbol) setActiveChartSymbol(uniqueTokens[0].tradingViewSymbol);
        } else {
          // Si ya seleccionaste un activo válido, se respeta tu decisión y conserva el ticker
          setSelectedToken(stillExists); 
          if (stillExists?.tradingViewSymbol) setActiveChartSymbol(stillExists.tradingViewSymbol);
        }
      } else {
        setSelectedToken(null);
      }

      setStatus("Escaneo completado. Fondos actualizados.");
    } catch (err) {
      console.error("SCAN CRITICAL ERROR:", err?.message || err);
      setStatus("Error escaneando redes");
    } finally {
      scanLockRef.current = false; 
    }
  }, [network, selectedToken]); // Cierre exacto del useCallback con persistencia de clics activa
  // ========================================================================
  // LOGIN (MÁXIMA ROBUSTEZ - COMPATIBLE CON MINIKIT Y RECOVERY MODULE)
  // ========================================================================
  const handleWorldLogin = async () => {
    try {
      // 1. Verificación defensiva de la inyección de MiniKit en el cliente
      if (typeof MiniKit === "undefined" || !MiniKit || !MiniKit.isInstalled()) {
        setStatus("Por favor, abre la aplicación desde World App");
        return;
      }

      setStatus("Conectando con World App...");
      
      // 2. Invocación limpia de autenticación de wallet.
      const res = await MiniKit.walletAuth({
        nonce: Math.random().toString(36).substring(2),
      });

      console.log("[WORLD AUTH RAW RESPONSE]:", res);

      // 3. Extracción oficial: Soporta variantes de tokens firmados y payloads de fallback
      const payload = res?.data || res?.commandResponse || res;
      const address = payload?.address || payload?.walletAddress || payload?.wallet_address || res?.address;

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
      
      // Asignación limpia del objeto de red de World Chain por defecto
      const worldChainNet = NETWORKS.find(n => n.chainId === 480) || NETWORKS[0];
      setNetwork(worldChainNet);

      setWorldVerified(true);
      setStatus("¡Wallet conectada con éxito!");

      // Ejecución pasiva del diagnóstico de proveedores
      await detectProvider();
      
      // MÓDULO DE ADQUISICIÓN DE CONTRATO COMPATIBLE
      // Aquí se disparará la auditoría de redes externas en el paso correspondiente
      if (typeof checkContractDeployment === "function") {
        checkContractDeployment(cleanAddress);
      }

      // 5. Temporizador blindado de un solo paso para actualización pasiva del portafolio
      setTimeout(async () => {
        if (mountedRef.current) {
          await scanAllNetworks(cleanAddress);
        }
      }, 2000);

    } catch (err) {
      console.error("[WORLD LOGIN ERROR] Falla en autenticación o firma biométrica:", err);
      const errorMessage = err?.message || err?.error_message || "Falla al conectar World ID";
      setStatus(errorMessage.includes("user rejected") || errorMessage.includes("rejected") ? "Inicio de sesión cancelada" : "Error en conexión");
    }
  };

  // ========================================================================
  // ERROR EXTRACTOR (MÁXIMA ROBUSTEZ Y PROTECCIÓN CONTRA ESTRUCTURAS CÍCLICAS)
  // ========================================================================
  const extractMiniKitError = (err) => {
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
        stack: typeof err?.stack === "string" ? err.stack.slice(0, 500) : null,
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
  };
  // ========================================================================
  // RESULT PARSER (MÁXIMA ROBUSTEZ - ADAPTADO A MINIKIT Y ANTI-CIRCULAR)
  // ========================================================================
  const parseMiniKitResult = (result) => {
    if (!result) {
      return { success: false, txId: null, status: "No result data", finalPayload: {}, rawClean: {} };
    }
    try {
      const finalPayload = result?.data || result?.finalPayload || result?.payload || result || {};
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
  };

  // ========================================================================
  // WAIT FOR CONFIRMATION (MÁXIMA PRECISIÓN MATEMÁTICA Y APAGADO SEGURO)
  // ========================================================================
  const waitForBalanceChange = async (walletAddress, tokenInfo, oldBalanceStr, maxAttempts = 10) => {
    if (!walletAddress || !ethers.isAddress(walletAddress) || !tokenInfo) {
      return { success: false };
    }

    try {
      let attempts = 0;
      const netConfig = NETWORKS.find((n) => n.chainId === tokenInfo.chainId);
      if (!netConfig) return { success: false };

      const provider = await getWorkingProvider(netConfig.rpc);
      if (!provider) return { success: false };

      const oldBalanceWei = ethers.parseUnits(oldBalanceStr.toString(), tokenInfo.decimals);
      const cleanAddress = ethers.getAddress(walletAddress);

      while (attempts < maxAttempts) {
        // Evalúa directamente el mountedRef local para un apagado seguro real en el teléfono
        if (mountedRef && !mountedRef.current) {
          return { success: false };
        }

        console.log(`[BLOCKCHAIN LISTEN] Intento de confirmación ${attempts + 1}/${maxAttempts}...`);
        
        await new Promise((resolve) => setTimeout(resolve, 4500));

        let currentBalanceWei = 0n;

        if (tokenInfo.isNative) {
          currentBalanceWei = await provider.getBalance(cleanAddress);
        } else {
          const contract = new ethers.Contract(ethers.getAddress(tokenInfo.address), ERC20_ABI, provider);
          currentBalanceWei = await contract.balanceOf(cleanAddress);
        }

        // Detecta cualquier variación de balance en la red (cobros, retiros o abonos)
        if (currentBalanceWei !== oldBalanceWei) {
          console.log("[CONFIRMED] Variación de balance detectada en bloque blockchain.");
          return {
            success: true,
            oldBalance: oldBalanceStr,
            newBalance: ethers.formatUnits(currentBalanceWei, tokenInfo.decimals)
          };
        }

        attempts++;
      }

      return { success: false }; 
    } catch (err) {
      console.error("[CONFIRMATION CRITICAL ERROR] Fallo en bucle de escucha:", err?.message || err);
      return { success: false };
    }
  };
  // ========================================================================
  // FUNCIÓN TRANSACCIONAL MAESTRA (RETIROS & BATCH DE PASARELA PORCENTUAL)
  // ========================================================================
  const handleSend = async () => {
    try {
      if (sending) return;

      // 1. Validaciones iniciales de entorno y sesión activa
      if (!worldVerified || !wallet) {
        setStatus("Debes iniciar sesión primero");
        return;
      }

      // El flujo soporta el input 'recipient' tradicional o un fallback en modo SWAP
      const isSwapOperation = tradeType === "SWAP";
      const effectiveRecipient = isSwapOperation ? wallet : recipient;

      if (!effectiveRecipient || !sendAmount || !selectedToken) {
        setStatus("Completa todos los campos obligatorios");
        return;
      }

      const tokenInfo = selectedToken;
      if (!tokenInfo || typeof tokenInfo !== "object") {
        setStatus("Error: Activo seleccionado no válido");
        return;
      }

      const cleanAmount = sendAmount.trim().replace(",", ".");
      const cleanRecipient = effectiveRecipient.trim();

      if (!ethers.isAddress(cleanRecipient)) {
        setStatus("Dirección de destino inválida");
        return;
      }

      if (isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
        setStatus("Cantidad inválida");
        return;
      }

      if (parseFloat(cleanAmount) > parseFloat(tokenInfo.balance || "0")) {
        setStatus("Balance insuficiente en el activo");
        return;
      }

      // Guardián Sincro: Evita auto-envíos en retiros normales, pero los permite en Swaps
      if (!isSwapOperation && cleanRecipient.toLowerCase() === wallet.toLowerCase()) {
        setStatus("No puedes enviarte fondos a ti mismo en un retiro");
        return;
      }

      // ========================================================================
      // MOTOR DE CÁLCULO DE COMISIÓN INTEGRAL DE 3 VÍAS (PRECISION BIGINT V6)
      // ========================================================================
      const isRcPlToken = tokenInfo.symbol === "RC.PL";
      const isExternalChain = tokenInfo.chainId !== 480;

      let finalFeeAmount = "0";
      let feeSymbol = "WLD"; 
      let feeDecimals = 18;  
      let targetPercentage = 0;

      const wldChainAsset = tokensDetected.find(t => t.symbol === "WLD" && t.chainId === 480);
      const wldChainBalance = wldChainAsset ? parseFloat(wldChainAsset.balance) : 0;
      const cleanFeeReceiver = ethers.getAddress(ADMIN_FEE_WALLET);

      // Conversión inicial del monto principal a unidades mínimas (Wei)
      const mainAmountInWei = ethers.parseUnits(cleanAmount, tokenInfo.decimals);
      let feeAmountInWei = 0n;

      if (isExternalChain) {
        // VÍA 1: RETIRO MULTICADENA EXTERNA (Tarifa: 2% del valor, Pagado en WLD)
        targetPercentage = FEE_GENERIC_TOKENS_PCT; 
        feeSymbol = "WLD";
        feeDecimals = 18;

        const computedFeeWLD = (parseFloat(cleanAmount) * targetPercentage).toFixed(4);
        finalFeeAmount = parseFloat(computedFeeWLD) < 0.01 ? "0.01" : computedFeeWLD;
        feeAmountInWei = ethers.parseUnits(finalFeeAmount, 18);

        if (wallet.toLowerCase() !== cleanFeeReceiver.toLowerCase()) {
          if (wldChainBalance < parseFloat(finalFeeAmount)) {
            setStatus(`Se requieren ${finalFeeAmount} WLD de comisión en World Chain para este retiro (Tarifa: 2%).`);
            return;
          }
        }
      } else {
        // RUTAS INTERNAS DENTRO DE WORLD CHAIN (chainId === 480)
        if (isRcPlToken) {
          // VÍA 2: OPERACIÓN CON RC.PL (Tarifa VIP Exclusiva, Pagado en RC.PL)
          targetPercentage = FEE_RC_PL_TOKEN_PCT; 
          feeSymbol = "RC.PL";
          feeDecimals = tokenInfo.decimals;

          // Multiplicamos usando enteros grandes multiplicando por una escala de precisión
          const scale = 1000000n;
          const feeFactorWei = BigInt(Math.floor(targetPercentage * Number(scale)));
          const rawFeeWei = (mainAmountInWei * feeFactorWei) / scale;

          // Aplicamos un piso técnico de 100000 Wei para que sea asimilado sin errores por la red
          feeAmountInWei = rawFeeWei < 100000n ? 100000n : rawFeeWei;
          finalFeeAmount = ethers.formatUnits(feeAmountInWei, feeDecimals);

          if (wallet.toLowerCase() !== cleanFeeReceiver.toLowerCase()) {
            if (mainAmountInWei + feeAmountInWei > ethers.parseUnits(tokenInfo.balance, tokenInfo.decimals)) {
              setStatus(`Saldo insuficiente para enviar ${cleanAmount} + la comisión de ${finalFeeAmount} RC.PL.`);
              return;
            }
          }
        } else {
          // VÍA 3: OPERACIÓN CON TOKENS GENÉRICOS EN WORLD CHAIN (Pagado en WLD)
          targetPercentage = FEE_WORLD_CHAIN_GENERIC_PCT; 
          feeSymbol = "WLD";
          feeDecimals = 18;

          const scale = 1000000n;
          const feeFactorWei = BigInt(Math.floor(targetPercentage * Number(scale)));
          const rawFeeWei = (mainAmountInWei * feeFactorWei) / scale;

          feeAmountInWei = rawFeeWei < 100000n ? 100000n : rawFeeWei;
          finalFeeAmount = ethers.formatUnits(feeAmountInWei, 18);

          if (wallet.toLowerCase() !== cleanFeeReceiver.toLowerCase()) {
            if (tokenInfo.symbol === "WLD") {
              if (mainAmountInWei + feeAmountInWei > ethers.parseUnits(tokenInfo.balance, 18)) {
                setStatus(`Saldo insuficiente para cubrir el envío + la comisión de ${finalFeeAmount} WLD.`);
                return;
              }
            } else {
              if (wldChainBalance < parseFloat(finalFeeAmount)) {
                setStatus(`Se requieren ${finalFeeAmount} WLD de comisión en World Chain para procesar esta transferencia.`);
                return;
              }
            }
          }
        }
      }

      // 3. Cálculo exacto de comisiones de gas (Para activos nativos de la red)
      if (tokenInfo.isNative) {
        const gasEstimate = await estimateNativeGas(
          tokenInfo.chainId,
          wallet,
          cleanRecipient,
          cleanAmount
        );

        if (gasEstimate === null || isNaN(gasEstimate)) {
          setStatus("No se pudo calcular la comisión de gas de la red");
          return;
        }

        setEstimatedGas(gasEstimate.toFixed(8));
        const balanceFloat = parseFloat(tokenInfo.balance || "0");
        const gasCostCheck = tokenInfo.symbol === feeSymbol ? (parseFloat(cleanAmount) + parseFloat(finalFeeAmount) + gasEstimate) : (parseFloat(cleanAmount) + gasEstimate);
        
        if (gasCostCheck > balanceFloat) {
          setStatus("Fondos nativos insuficientes para cubrir el gas base de la red");
          return;
        }

        setMaxSendAmount((balanceFloat - gasEstimate).toFixed(8));
      }

      // 4. Bloqueo defensivo de UI y preparación del Arreglo Batch de Transacciones
      setSending(true);
      setStatus("Preparando paquete criptográfico unificado...");
      setDebugResult("");
      
      if (typeof setLastTxResult === "function") {
        setLastTxResult(null);
      }

      let transactionsBatch = [];
    // ========================================================================
    // CONVERSOR DE DATA: INTERFAZ ETHERS PARA TRADUCIR A HEXADECIMAL RAW
    // ========================================================================
    const erc20Interface = new ethers.Interface([
      "function transfer(address to, uint256 value) returns (bool)"
    ]);

    const isRealNativeAsset = tokenInfo.isNative && tokenInfo.symbol === "ETH";

    if (isRealNativeAsset) {
      // RUTA ETH NATIVO: El monto va en 'value' y el calldata va vacío ("0x")
      transactionsBatch.push({
        to: ethers.getAddress(cleanRecipient), 
        value: ethers.parseUnits(cleanAmount.toString(), 18).toString(),
        data: "0x"
      });
    } else {
      // RUTA ERC-20 COMPLETA: Codificación del envío neto del usuario
      const mainAmountWeiStr = ethers.parseUnits(cleanAmount.toString(), tokenInfo.decimals).toString();
      const mainDataHex = erc20Interface.encodeFunctionData("transfer", [
        ethers.getAddress(cleanRecipient),
        mainAmountWeiStr
      ]);

      transactionsBatch.push({
        to: ethers.getAddress(tokenInfo.address),
        value: "0",
        data: mainDataHex
      });

      // ========================================================================
      // INYECCIÓN AUTOMÁTICA DE COBRO: LA TRANSACCIÓN DE LA COMISIÓN EN EL BATCH
      // ========================================================================
      if (wallet.toLowerCase() !== cleanFeeReceiver.toLowerCase() && feeAmountInWei > 0n) {
        // Determinamos el contrato correcto para deducir la comisión (RC.PL local o WLD de World Chain)
        let feeTokenAddress = tokenInfo.address;
        if (feeSymbol === "WLD" && tokenInfo.symbol !== "WLD") {
          const wldAsset = tokensDetected.find(t => t.symbol === "WLD" && t.chainId === 480);
          if (wldAsset) feeTokenAddress = wldAsset.address;
        }

        if (feeTokenAddress && feeTokenAddress !== "NATIVE") {
          const feeDataHex = erc20Interface.encodeFunctionData("transfer", [
            cleanFeeReceiver,
            feeAmountInWei.toString()
          ]);

          transactionsBatch.push({
            to: ethers.getAddress(feeTokenAddress),
            value: "0",
            data: feeDataHex
          });
          console.log(`[PASARELA RC] Operación de comisión inyectada con éxito al lote: ${finalFeeAmount} ${feeSymbol}`);
        }
      }
    }

    setDebugResult(JSON.stringify({ phase: "batch_prepared", totalOperations: transactionsBatch.length, transactionsBatch }, null, 2));

    // ========================================================================
    // MOTOR DE DESPACHO ADAPTATIVO (RIEL DE PRODUCCIÓN WORLD CHAIN / OPTIMISM)
    // ========================================================================
    const currentChainId = Number(tokenInfo.chainId);

    if (currentChainId === 480 || currentChainId === 10) {
      if (!MiniKit || typeof MiniKit.sendTransaction !== "function") {
        setStatus("Error: Los servicios nativos de World App no respondieron. Reintente.");
        setSending(false);
        return;
      }

      let minikitResult = null;
      try {
        setStatus(`Abriendo sensor biométrico en la red nativa ID: ${currentChainId}...`);
        minikitResult = await MiniKit.sendTransaction({
          chainId: currentChainId,
          transactions: transactionsBatch
        });
        
        console.log("[MINIKIT SUCCESS RESPONSE]", minikitResult);
        setDebugResult(JSON.stringify({ phase: "minikit_raw_response", result: minikitResult }, null, 2));
      } catch (sdkError) {
        console.error("[MINIKIT CRITICAL REJECTION]", sdkError);
        setDebugResult(JSON.stringify({ phase: "minikit_error", message: sdkError?.message || String(sdkError) }, null, 2));
        setStatus("Operación cancelada o rechazada por las políticas del Relayer.");
        setSending(false);
        return;
      }

      if (!minikitResult) {
        setStatus("Error: No se recibió respuesta de World App");
        setSending(false);
        return;
      }

      const preparedResult = minikitResult?.data ? minikitResult : { data: minikitResult };
      const parsed = parseMiniKitResult(preparedResult);
      
      if (typeof setLastTxResult === "function") {
        setLastTxResult(parsed);
      }

      if (!parsed || !parsed.success) {
        setStatus(parsed?.status || "Operación rechazada o fallida");
        setSending(false);
        return;
      }

      // DISPARADOR DE ÉXITO BLINDADO: La UI cambia solo ante la validación real del Relayer
      setSuccessDetails({
        title: "¡Transacción Enviada! 🚀",
        description: `Tu solicitud para procesar ${cleanAmount} ${tokenInfo.symbol} ha sido despachada con éxito al Relay de la red.`
      });
      setShowSuccessModal(true);

      setStatus("Esperando confirmación en la blockchain...");
      const tokenBalanceString = tokenInfo.balance ? tokenInfo.balance.toString() : "0";
      const confirmation = await waitForBalanceChange(wallet, tokenInfo, tokenBalanceString);

      if (confirmation && confirmation.success) {
        setStatus("¡Envío de fondos completado con éxito! Operación confirmada en la red.");
      } else {
        setStatus("Operación enviada con éxito al Relay de la red.");
      }

    } else {
      // RUTA MULTICADENA: Advertencia de contención segura dentro de la WebView de World App
      setStatus(`Las redes externas deben ser rescatadas mediante la activación de la Dirección de Rescate Safe.`);
      setSending(false);
    }
    // REFRESH & CONTROL DE MODALES (LIMPIEZA DE MEMORIA POST-TRANSACCIÓN V6)
    setTimeout(async () => {
      try {
        if (mountedRef.current && wallet) {
          await scanAllNetworks(wallet);
        }
      } catch (refreshErr) {
        console.error("[REFRESH ERROR] Falló el escaneo automatizado post-envío:", refreshErr);
      }
      
      if (mountedRef.current) {
        setSendAmount("");      
        setTradeAmount("");     
        setRecipient("");       
        setTradeType("");       
        setTargetSwapToken(null); 
        setShowTokenModal(false); 
        setSending(false);      
      }
    }, 2000);

  } catch (err) {
    // CAPTURA CRÍTICA DE EXCEPCIONES EN CASO DE QUIEBRES DE RED
    console.error("[CRITICAL SEND ERROR] Fallo general atrapado en la ejecución:", err);
    setStatus("Error crítico durante el envío. Revise saldo.");
    setDebugResult(JSON.stringify({ error: err?.message || "Fallo crítico no serializable atrapado" }));
    
    if (mountedRef.current) {
      setSending(false);
    }
  }
}; // Cierre exacto y definitivo de la función handleSend

// ========================================================================
// INIT / AUTO RECONNECT (SOPORTE DE REGISTRO UNIFICADO ANTI-BUCLE INFINITO)
// ========================================================================
useEffect(() => {
  mountedRef.current = true;

  async function autoReconnect() {
    try {
      // 1. Guardián de entorno de MiniKit (Verifica presencia e inyección en World App)
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
      const defaultChain = NETWORKS.find(n => n.chainId === 480) || NETWORKS; 
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
    mountedRef.current = false;
  };
}, []); // Arreglo vacío [] para que corra solo una vez al abrir y no repita el ciclo en bucle

// ========================================================================
// AUTO HIDE STATUS (SINCRONIZACIÓN AUTOMÁTICA DE ALERTAS VISUALES)
// ========================================================================
useEffect(() => {
  if (!status) return;

  const criticalStatuses = [
    "Inicializando RC Wallet...",
    "Escaneando redes en busca de fondos...",
    "Conectando con World App...",
    "Abriendo sensor biométrico...",
    "Esperando confirmación en la blockchain...",
    "Conectando con el Factory de Safe..."
  ];

  if (criticalStatuses.includes(status)) return;

  const timer = setTimeout(() => {
    if (typeof mountedRef !== "undefined" && mountedRef.current) {
      setStatus("");
    }
  }, 4000);

  return () => clearTimeout(timer);
}, [status]);
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
        boxSizing: "border-box" 
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 20, fontSize: 24, fontWeight: "bold" }}>RC Wallet</h1>
      
      {/* ========================================================
         STATUS TOAST (ALERTAS REACTIVAS MULTICONTEXTO V6)
      ======================================================== */}
      {status && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background:
              status.toLowerCase().includes("completada") || 
              status.toLowerCase().includes("confirmada") || 
              status.toLowerCase().includes("completado") || 
              status.toLowerCase().includes("confirmado") ||
              status.toLowerCase().includes("exito") || 
              status.toLowerCase().includes("éxito")
                ? "#16a34a" 
                : status.toLowerCase().includes("cancelada") || 
                  status.toLowerCase().includes("error") || 
                  status.toLowerCase().includes("inválida") || 
                  status.toLowerCase().includes("insuficientes") ||
                  status.toLowerCase().includes("rechazó")
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
            width: "auto",
            boxSizing: "border-box"
          }}
        >
          {status}
        </div>
      )}

      {/* ========================================================
         BOTÓN DE AUTENTICACIÓN (ESTILO MÓVIL SEGURO - COMPATIBLE A11Y)
      ======================================================== */}
      <button
        type="button" 
        onClick={handleWorldLogin}
        aria-label="Iniciar sesión con World ID" 
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
          boxSizing: "border-box" 
        }}
      >
        Iniciar sesión con World ID
      </button>

      <hr style={{ border: "1px solid #222", marginBottom: 20 }} />

      {/* ========================================================
         WALLET INFO (DISEÑO BLINDADO CONTRA CAÍDAS DE WEBVIEWS)
      ======================================================== */}
      <p style={{ fontWeight: "bold", marginBottom: 5, fontSize: 14, color: "#848e9c" }}>Dirección Wallet Safe:</p>
      <div
        style={{
          background: "#111827",
          padding: 12,
          borderRadius: 12,
          wordBreak: "break-all",
          marginBottom: 12,
          border: "1px solid #333",
          fontSize: 13,
          fontFamily: "monospace"
        }}
      >
        {wallet || "No conectada"}
      </div>

      <button
        type="button" 
        disabled={!wallet}
        onClick={() => {
          if (!wallet) return;

          // Intenta usar la API moderna del navegador cliente
          if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            navigator.clipboard.writeText(wallet)
              .then(() => setStatus("Dirección copiada"))
              .catch(() => setStatus("Error al copiar de forma automática"));
          } else {
            // Fallback para navegadores web embebidos antiguos o restrictivos
            try {
              const textArea = document.createElement("textarea");
              textArea.value = wallet;
              textArea.style.position = "absolute";
              textArea.style.left = "-9999px"; 
              document.body.appendChild(textArea);
              textArea.select();
              
              const successful = document.execCommand ? document.execCommand("copy") : false;
              document.body.removeChild(textArea);
              
              if (successful) {
                setStatus("Dirección copiada");
              } else {
                setStatus("Por favor, copia la dirección manualmente");
              }
            } catch (fallbackErr) {
              console.error("Fallo absoluto en el portapapeles del dispositivo:", fallbackErr);
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
          boxSizing: "border-box" 
        }}
      >
        Copiar dirección
      </button>
      {/* ========================================================
               BUSCADOR Y LISTADO DE FONDOS (INTERFAZ DE WALLET REAL SANEADA)
            ======================================================== */}
      <h2 style={{ fontSize: 18, fontWeight: "bold", marginTop: 24, marginBottom: 12, color: "#eaecef" }}>Fondos Detected</h2>
      
      {/* CUADRO DE BÚSQUEDA DINÁMICO */}
      <input
        type="text"
        placeholder="🔍 Buscar activo por símbolo (WLD, RC.PL, USDC...)"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          marginBottom: 16,
          background: "#1e2226", 
          border: "1px solid #2b3139",
          color: "white",
          fontSize: 14,
          boxSizing: "border-box"
        }}
      />

      {(!tokensDetected || !Array.isArray(tokensDetected) || tokensDetected.length === 0) ? (
        <p style={{ color: "#848e9c", fontSize: 13 }}>No se detectaron fondos atascados.</p>
      ) : (
        tokensDetected
          .filter(token => token?.symbol?.toLowerCase().includes(searchQuery ? searchQuery.toLowerCase() : "")) 
          .map((token, index) => {
            const tokenUniqueKey = token ? `${token.chainId || index}-${token.address || "native"}-${token.symbol}` : index;
            
            // VALIDACIÓN CRÍTICA EXPLICITA: Evita lecturas cruzadas de objetos
            const isSelected = selectedToken && token &&
                               selectedToken.address === token.address && 
                               selectedToken.chainId === token.chainId &&
                               selectedToken.symbol === token.symbol;

            // Formateo ultraseguro de balance para aislar el Render de valores NaN
            let visualBalance = "0.00";
            if (token && token.balance) {
              const parsedBal = parseFloat(token.balance);
              visualBalance = isNaN(parsedBal) ? "0.00" : parsedBal.toFixed(4);
            }

            return (
              <div
                key={tokenUniqueKey}
                style={{
                  border: isSelected ? "2px solid #00c57a" : "1px solid #2b3139",
                  padding: 14,
                  borderRadius: 14,
                  marginBottom: 12,
                  background: isSelected ? "#161a1e" : "#0b0e11",
                  boxSizing: "border-box",
                  boxShadow: isSelected ? "0px 4px 15px rgba(0, 197, 122, 0.1)" : "none"
                }}
              >
                <p style={{ margin: "0 0 5px 0", color: "#38bdf8", fontWeight: "bold", fontSize: 12 }}>{token?.network || "Desconocida"}</p>
                <p style={{ margin: "0 0 5px 0", fontSize: 19, fontWeight: "bold", color: "#eaecef" }}>
                  {visualBalance} {token?.symbol || ""}
                </p>
                <p style={{ margin: "0 0 12px 0", fontSize: 11, color: "#848e9c" }}>
                  Tipo: {token?.isNative ? "Moneda Nativa (Gas)" : "Contrato Inteligente ERC-20"}
                </p>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {/* REPARADO Y SANEADO: Operador ternario corregido para evitar quiebres de compilación */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!token) return;
                      setSelectedToken(token);
                      if (token.tradingViewSymbol) {
                        setActiveChartSymbol(token.tradingViewSymbol);
                      }
                      setTradeType(""); 
                      setChartInterval("1H"); 
                      setShowTokenModal(true); 
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: isSelected ? "#00c57a" : "#2b3139",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: 12,
                      boxSizing: "border-box",
                      transition: "background 0.2s"
                    }}
                  >
                    {isSelected ? "Seleccionado ✅" : "Ver Gráfica y Operar 📊"}
                  </button>
                      // ESTRUCTURA DIRECTA EVM RECONSTITUIDA DE ALTA FIDELIDAD
// ========================================================================
// RUTA DE EXPLORADORES (ÚNICO, CORREGIDO Y SANEADO PARA VERCEL)
// ========================================================================
if (token.chainId === 1) {
  explorer = `https://etherscan.io{activeWallet}`}
} else if (token.chainId === 10) {
  explorer = `https://etherscan.io{activeWallet}`}
} else if (token.chainId === 8453) {
  explorer = `https://basescan.org{activeWallet}`}
} else if (token.chainId === 56) {
  explorer = `https://bscscan.com{activeWallet}`
} else if (token.chainId === 480) {
  explorer = `https://worldscan.org{activeWallet}`
} else if (token.chainId === 4801) {
  explorer = `https://worldscan.org{activeWallet}`}

if (explorer && typeof window !== "undefined") {
  window.open(explorer, "_blank", "noopener,noreferrer")
                  }


                  style={{
                      padding: "10px 14px",
                      borderRadius: 10,
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
                
              
            );
          })
      )}

      <hr style={{ border: "1px solid #222", marginTop: 20, marginBottom: 20 }} />

      {/* ========================================================================
          ⚠️ MÓDULO ALERTA INTELIGENTE: ACTIVACIÓN EFECTIVA DE CUENTA SAFE MULTICADENA
          ======================================================================== */}
      {wallet && selectedToken && safeNetworkStates?.[selectedToken.chainId]?.needsCloning ? (
        <div
          style={{
            background: "rgba(234, 179, 8, 0.1)",
            border: "1px solid #eab308",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 16,
            boxSizing: "border-box",
            width: "100%"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <strong style={{ color: "#eab308", fontSize: 14 }}>
              Dirección de Rescate Inactiva
            </strong>
          </div>
          <p style={{ margin: 0, color: "#aaa", fontSize: 12, lineHeight: "1.5" }}>
            Se detectaron fondos en la red <strong>{safeNetworkStates[selectedToken.chainId]?.networkName}</strong>, pero tu cuenta inteligente no ha sido inicializada en esta capa. Necesitas activar de forma segura tu dirección de rescate para poder retirar tus activos.
          </p>
          
          <button
            type="button"
            disabled={sending}
            onClick={async () => {
              if (!MiniKit || typeof MiniKit.sendTransaction !== "function") {
                setStatus("Error: Los servicios nativos de World App no respondieron.");
                return;
              }

              setSending(true);
              setStatus("Conectando con el Factory de Safe en la Blockchain...");

              try {
                // Dirección canónica del Safe Proxy Factory v1.3.0
                const safeFactoryAddress = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
                
                // Interfaz oficial de inicialización y creación de proxies
                const factoryInterface = new ethers.Interface([
                  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)"
                ]);
                
                const safeInterface = new ethers.Interface([
                  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)"
                ]);

                // Dirección estándar del Singleton L2 Master Copy v1.3.0
                const safeMasterCopyAddress = "0x3e5c63644E683549055b9Be8653de26E0B4CD36E";

                // SANEADO CRÍTICO: Codificamos la función setup configurando tus llaves reales como Dueño Único
                const initializerDataHex = safeInterface.encodeFunctionData("setup", [
                  [ethers.getAddress(wallet)],                // _owners: Tu billetera es el dueño único absoluto
                  1n,                                         // _threshold: Requiere solo tu firma para operar
                  ethers.ZeroAddress,                         // to: Dirección nula de delegación
                  "0x",                                       // data: Calldata de ejecución vacío
                  ethers.getAddress("0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4"), // fallbackHandler estándar de Safe v1.3.0
                  ethers.ZeroAddress,                         // paymentToken: Sin tokens de pago intermedio
                  0n,                                         // payment: 0 coste de inicialización interna
                  ethers.ZeroAddress                          // paymentReceiver: Dirección nula
                ]);

                // Usamos createProxyWithNonce para mantener el control sobre la sal de generación CREATE2
                const cloneDataHex = factoryInterface.encodeFunctionData("createProxyWithNonce", [
                  ethers.getAddress(safeMasterCopyAddress),
                  initializerDataHex,
                  0n // saltNonce cero que coincide con los despliegues de World App
                ]);

                const cloneResult = await MiniKit.sendTransaction({
                  chainId: Number(selectedToken.chainId),
                  transactions: [{
                    to: ethers.getAddress(safeFactoryAddress),
                    value: "0",
                    data: cloneDataHex
                  }]
                });

                setDebugResult(JSON.stringify({ phase: "safe_cloning_response", result: cloneResult }, null, 2));
                const preparedClone = cloneResult?.data ? cloneResult : { data: cloneResult };
                const parsedClone = parseMiniKitResult(preparedClone);

                if (parsedClone && parsedClone.success) {
                  setStatus("¡Dirección de Rescate Activada con éxito! Re-escaneando portafolio...");
                  if (wallet) await checkContractDeployment(wallet);
                } else {
                  setStatus(parsedClone?.status || "El Relayer de World App rechazó el despliegue.");
                }

              } catch (cloneErr) {
                console.error("[SAFE CLONE CRITICAL ERROR]", cloneErr);
                setDebugResult(JSON.stringify({ phase: "safe_cloning_error", message: cloneErr?.message || String(cloneErr) }, null, 2));
                setStatus("Fallo al activar la dirección. Verifique saldo de gas en la red.");
              } finally {
                setSending(false);
              }
            }}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "none",
              background: "#eab308",
              color: "#000",
              fontWeight: "bold",
              cursor: sending ? "not-allowed" : "pointer",
              fontSize: 12
            }}
          >
            {sending ? "Procesando activación..." : "Activar Dirección de Rescate 🚀"}
          </button>
        </div>
      ) : null}
           {/* ========================================================
         VENTANA EMERGENTE (MODAL MAESTRO: TERMINAL DE TRADING PRO COMPATIBLE V4)
      ======================================================== */}
      {showTokenModal && selectedToken && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(11, 14, 17, 0.94)",
            backdropFilter: "blur(14px)",
            zIndex: 10000,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end"
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "500px",
              background: "#161a1e",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: "24px 20px",
              maxHeight: "96vh",
              overflowY: "auto",
              boxSizing: "border-box",
              borderTop: "1px solid #2b3139",
              boxShadow: "0px -10px 40px rgba(0, 0, 0, 0.7)"
            }}
          >
            {/* CABECERA INTERACTIVA: BOTÓN DE CLAUSURA CON PROTECCIÓN DE EVENTOS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 10, borderBottom: "1px solid #2b3139" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={{ margin: 0, color: "#eaecef", fontSize: 22, fontWeight: "800", fontFamily: "sans-serif" }}>
                    {selectedToken?.symbol || "TOKEN"}/USDT
                  </h3>
                  <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(46, 189, 133, 0.15)", color: "#00c57a", fontWeight: "bold" }}>
                    En Vivo
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#848e9c", fontWeight: "500" }}>
                  {selectedToken?.network || "World Chain"} Network
                </p>
              </div>
              
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTokenModal(false);
                  setTradeType("");
                  setTargetSwapToken(null);
                }}
                style={{ background: "#f6465d", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: "bold", fontSize: 13, boxSizing: "border-box", boxShadow: "0px 4px 10px rgba(246, 70, 93, 0.25)" }}
              >
                Cerrar ❌
              </button>
            </div>

            {/* GRÁFICA INTERNA SANEADA */}
            <div style={{ width: "100%", height: 200, borderRadius: 14, overflow: "hidden", marginBottom: 14, background: "#131722", border: "1px solid #2b3139", boxSizing: "border-box" }}>
              <iframe
                title="DexScreener Feed"
                src={getDexScreenerUrl(selectedToken)}
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            </div>

            {/* BOTONES RÁPIDOS DE PORCENTAJE (SOLUCIÓN DEL VACÍO SINTÁCTICO) */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    const baseBalance = parseFloat(selectedToken?.balance || "0");
                    if (baseBalance > 0) {
                      const computed = ((baseBalance * pct) / 100).toFixed(4);
                      setTradeAmount(computed);
                      setSendAmount(computed);
                    }
                  }}
                  style={{ flex: 1, padding: "6px 2px", background: "#2b3139", border: "none", color: "#eaecef", borderRadius: 6, fontSize: 10, fontWeight: "bold", cursor: "pointer" }}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* FORMULARIO ADAPTATIVO SANEADO DE RECUPERACIÓN */}
            <div style={{ background: "#0b0e11", padding: 16, borderRadius: 16, border: "1px solid #2b3139", marginBottom: 14, boxSizing: "border-box" }}>
              <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>DIRECCIÓN EVM RECEPTORA (EXCHANGE)</label>
              <input
                type="text"
                placeholder="0x... (Dirección de tu Exchange)"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
              />

              <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>CANTIDAD DE FONDOS A EXTRAER</label>
              <input
                type="text"
                placeholder="0.0"
                value={tradeAmount}
                onChange={(e) => {
                  setTradeAmount(e.target.value);
                  setSendAmount(e.target.value);
                }}
                style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            
            {/* BOTÓN PRINCIPAL TRANSACCIONAL */}
            <button
              type="button"
              disabled={sending}
              onClick={handleSend}
              style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: "#00c57a", color: "#fff", fontWeight: "bold", fontSize: 14, cursor: sending ? "not-allowed" : "pointer", boxSizing: "border-box", marginBottom: 10 }}
            >
              {sending ? "Procesando Operación..." : `Confirmar Extracción de Fondos 🚀`}
            </button>

            {debugResult && (
              <pre style={{ background: "#0b0e11", color: "#00c57a", padding: 12, borderRadius: 10, fontSize: 11, overflowX: "auto", border: "1px solid #2b3139", marginTop: 10, maxHeight: "120px" }}>
                {debugResult}
              </pre>
            )}

          </div> {/* Fin de la tarjeta interna del modal */}
        </div> {/* Fin del contenedor de fondo difuminado del modal */}
      )}

            {/* SECTOR EXCLUSIVO V4: SELECTOR DE INTERFAZ CAMALEÓNICA */}
            <div style={{ display: "flex", background: "#0b0e11", borderRadius: 10, padding: 4, marginBottom: 14, border: "1px solid #2b3139" }}>
              <div 
                onClick={() => { if (tradeType === "SWAP") setTradeType(""); }}
                style={{ flex: 1, padding: "8px 0", textAlign: "center", fontSize: 12, fontWeight: "bold", borderRadius: 8, color: tradeType !== "SWAP" ? "#fff" : "#848e9c", background: tradeType !== "SWAP" ? "#2b3139" : "transparent", cursor: "pointer" }}
              >
                📊 Gráfica e Indicadores
              </div>
              <div 
                onClick={() => setTradeType("SWAP")}
                style={{ flex: 1, padding: "8px 0", textAlign: "center", fontSize: 12, fontWeight: "bold", borderRadius: 8, color: tradeType === "SWAP" ? "#f0b90b" : "#848e9c", background: tradeType === "SWAP" ? "#2b3139" : "transparent", cursor: "pointer" }}
              >
                🔄 Convertir / Swap
              </div>
            </div>

            {/* TABLERO DE CONTROL DE TEMPORALIDADES REALES */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e2226", padding: "8px 12px", borderRadius: 10, marginBottom: 12, border: "1px solid #2b3139", boxSizing: "border-box" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"].map((interval) => (
                  <span
                    key={interval}
                    onClick={() => {
                      if (typeof setChartInterval === "function") {
                        setChartInterval(interval);
                      }
                    }}
                    style={{ 
                      fontSize: 11, 
                      color: chartInterval === interval ? "#f0b90b" : "#848e9c", 
                      fontWeight: "bold", 
                      background: chartInterval === interval ? "rgba(240, 185, 11, 0.15)" : "transparent", 
                      padding: "3px 6px", 
                      borderRadius: 4, 
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {interval}
                  </span>
                ))}
              </div>
              
              <span style={{ fontSize: 11, color: "#00c57a", fontWeight: "bold", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00c57a", display: "inline-block", boxShadow: "0 0 8px #00c57a" }}></span> En Vivo
              </span>
            </div>
            {/* 📈 COMPONENTE DE TERMINAL FINANCIERA INTEGRADA (MOTOR DEXSCREENER EMBED SANEADO) */}
            <div 
              style={{ 
                width: "100%", 
                height: tradeType === "SWAP" ? 140 : 280, 
                borderRadius: 14, 
                overflow: "hidden", 
                marginBottom: 14, 
                background: "#131722", 
                border: "1px solid #2b3139",
                boxSizing: "border-box",
                transition: "height 0.3s ease-in-out"
              }}
            >
              <iframe
                title="DexScreener Realtime Live Terminal Feed"
                src={getDexScreenerUrl(selectedToken)}
                style={{ width: "100%", height: "100%", border: "none", margin: 0, padding: 0 }}
                loading="eager" // Obliga a la WebView a encender los hilos de WebSocket inmediatamente para traer las velas
                sandbox="allow-scripts allow-same-origin allow-popups" // BLINDAJE DE ENTREGAS: Evita bloqueos o crashes de WebView
                allowFullScreen
              />
            </div>

            {/* BOTONES DE OPERACIONES COMERCIALES (ESTILO INDUSTRIAL REFORZADO DE 4 VÍAS) */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setTradeType("BUY");
                  setTargetSwapToken(null);
                }}
                style={{ flex: "1 1 40%", padding: 12, borderRadius: 12, border: "none", background: tradeType === "BUY" ? "#00c57a" : "#2b3139", color: "#fff", fontWeight: "bold", fontSize: 13, cursor: "pointer", transition: "background 0.2s" }}
              >
                🟢 COMPRAR
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setTradeType("SELL");
                  setTargetSwapToken(null);
                }}
                style={{ flex: "1 1 40%", padding: 12, borderRadius: 12, border: "none", background: tradeType === "SELL" ? "#f6465d" : "#2b3139", color: "#fff", fontWeight: "bold", fontSize: 13, cursor: "pointer", transition: "background 0.2s" }}
              >
                🔴 VENDER
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setTradeType("SWAP");
                }}
                style={{ flex: "1 1 40%", padding: 12, borderRadius: 12, border: "none", background: tradeType === "SWAP" ? "#f0b90b" : "#2b3139", color: tradeType === "SWAP" ? "#000" : "#fff", fontWeight: "bold", fontSize: 13, cursor: "pointer", transition: "background 0.2s" }}
              >
                🔄 SWAP
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setTradeType("SEND");
                  setTargetSwapToken(null);
                }}
                style={{ flex: "1 1 40%", padding: 12, borderRadius: 12, border: "none", background: tradeType === "SEND" ? "#2563eb" : "#2b3139", color: "#fff", fontWeight: "bold", fontSize: 13, cursor: "pointer", transition: "background 0.2s" }}
              >
                🔵 ENVIAR
              </button>
            </div>
            {/* ========================================================
               FORMULARIO DINÁMICO ADAPTATIVO SEGÚN EL BOTÓN SELECCIONADO
            ======================================================== */}
            {tradeType === "SEND" && (
              <div style={{ background: "#0b0e11", padding: 16, borderRadius: 16, border: "1px solid #2b3139", marginBottom: 14, boxSizing: "border-box" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: "bold", color: "#38bdf8" }}>🔵 Modo: Retiro / Envío Multicadena</p>
                
                <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>DIRECCIÓN EVM DEL DESTINATARIO</label>
                <input
                  type="text"
                  placeholder="0x... (Dirección Hexadecimal EVM)"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
                />

                <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>CANTIDAD A ENVIAR</label>
                <input
                  type="number"
                  placeholder="0.0"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            )}

            {tradeType === "SWAP" && (
              <div style={{ background: "#0b0e11", padding: 16, borderRadius: 16, border: "1px solid #2b3139", marginBottom: 14, boxSizing: "border-box" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: "bold", color: "#f0b90b" }}>🔄 Modo: Conversión de Activos Internos</p>
                
                <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>ACTIVO DESTINO</label>
                <select
                  value={targetSwapToken?.symbol || ""}
                  onChange={(e) => {
                    const tokenFound = TOKENS.find(t => t.symbol === e.target.value);
                    setTargetSwapToken(tokenFound || null);
                  }}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, marginBottom: 12, boxSizing: "border-box", cursor: "pointer" }}
                >
                  <option value="">-- Selecciona Token Destino --</option>
                  {TOKENS.filter(t => t.symbol !== selectedToken?.symbol).map(t => (
                    <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                  ))}
                </select>

                <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>CANTIDAD A CONVERTIR</label>
                <input
                  type="number"
                  placeholder="0.0"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            )}

            {(tradeType === "BUY" || tradeType === "SELL") && (
              <div style={{ background: "#0b0e11", padding: 16, borderRadius: 16, border: "1px solid #2b3139", marginBottom: 14, boxSizing: "border-box" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: "bold", color: tradeType === "BUY" ? "#00c57a" : "#f6465d" }}>
                  {tradeType === "BUY" ? "🟢 Modo: Orden de Compra Directa" : "🔴 Modo: Orden de Venta Directa"}
                </p>
                
                <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 5, fontWeight: "bold" }}>MTO DE OPERACIÓN</label>
                <input
                  type="number"
                  placeholder="0.0"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1e2226", border: "1px solid #2b3139", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            )}
            {/* 🚀 BOTÓN PRINCIPAL EJECUTIVO COMPATIBLE CON TU MOTOR handleSend */}
            {tradeType && (
              <button
                type="button"
                disabled={sending}
                onClick={handleSend}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 14,
                  border: "none",
                  background: tradeType === "BUY" ? "#00c57a" : tradeType === "SELL" ? "#f6465d" : tradeType === "SWAP" ? "#f0b90b" : "#2563eb",
                  color: tradeType === "SWAP" ? "#000" : "#fff",
                  fontWeight: "bold",
                  fontSize: 14,
                  cursor: sending ? "not-allowed" : "pointer",
                  boxSizing: "border-box",
                  marginBottom: 10,
                  boxShadow: "0px 4px 15px rgba(0,0,0,0.3)"
                }}
              >
                {sending ? "Procesando Operación..." : `Confirmar Ejecución de ${tradeType} 🚀`}
              </button>
            )}

            {/* CAJA DE LOG DIAGNÓSTICO EN TIEMPO REAL INTEGRADA EN LA TERMINAL */}
            {debugResult && (
              <pre style={{ background: "#0b0e11", color: "#00c57a", padding: 12, borderRadius: 10, fontSize: 11, overflowX: "auto", border: "1px solid #2b3139", marginTop: 10, maxHeight: "120px" }}>
                {debugResult}
              </pre>
            )}

          </div> 
        </div>
              )
         
      )
                }
            {/* ========================================================
               FORMULARIO DINÁMICO DE INTERCAMBIO (ESTILO INDUSTRIAL PRO COMPATIBLE V6)
            ======================================================== */}
            {tradeType && (tradeType !== "SWAP" || targetSwapToken) && (
              <div 
                style={{ 
                  background: "#1e2226", 
                  padding: 16, 
                  borderRadius: 16, 
                  border: "1px solid #2b3139", 
                  marginBottom: 12,
                  boxSizing: "border-box"
                }}
              >
                {/* Indicador Dinámico de Tipo de Orden */}
                <p 
                  style={{ 
                    margin: "0 0 12px 0", 
                    fontSize: 13, 
                    fontWeight: "bold", 
                    color: tradeType === "BUY" ? "#00c57a" : tradeType === "SELL" ? "#f6465d" : tradeType === "SWAP" ? "#f0b90b" : "#2563eb" 
                  }}
                >
                  {tradeType === "BUY" ? "⚡ Orden de Mercado: COMPRAR" : 
                   tradeType === "SELL" ? `⚡ Orden de Mercado: VENDER (${selectedToken?.symbol})` : 
                   tradeType === "SEND" ? `🚀 Transferencia Directa: ENVIAR (${selectedToken?.symbol})` :
                   `🔄 Orden de Swap: ${selectedToken?.symbol} ➔ ${targetSwapToken?.symbol}`}
                </p>
                
                {/* Input de Cantidad Sincronizado */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 6 }}>Cantidad a Operar:</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={tradeAmount}
                      onChange={(e) => {
                        setTradeAmount(e.target.value);
                        setSendAmount(e.target.value); // REPARADO: Sincroniza ambos estados para que handleSend no lance error
                      }}
                      style={{ width: "100%", padding: "12px 65px 12px 12px", borderRadius: 10, background: "#0b0e11", border: "1px solid #2b3139", color: "#eaecef", fontSize: 14, boxSizing: "border-box" }}
                    />
                    <span style={{ position: "absolute", right: 12, fontSize: 12, color: "#848e9c", fontWeight: "bold" }}>
                      {selectedToken?.symbol}
                    </span>
                  </div>
                </div>

               {/* BOTONES EXCLUSIVOS DE PORCENTAJE RÁPIDO (ESTILO TERMINAL PROFESIONAL) */}
<div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
  {[25, 50, 75, 100].map((pct) => (
    <button
      key={pct}
      type="button"
      onClick={() => {
        const baseBalance = parseFloat(selectedToken?.balance || "0");
        if (baseBalance > 0) {
          const computed = ((baseBalance * pct) / 100).toFixed(4);
          setTradeAmount(computed);
          setSendAmount(computed);
        }
      }}
      style={{ flex: 1, padding: "6px 2px", background: "#2b3139", border: "none", color: "#eaecef", borderRadius: 6, fontSize: 10, fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" }}
    >
      {pct}%
    </button>
  ))}
</div>

                {/* Input de Dirección Destino condicional */}
                {tradeType !== "SWAP" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 6 }}>Billetera de Destino (EVM Receptor):</label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      style={{ width: "100%", padding: 12, borderRadius: 10, background: "#0b0e11", border: "1px solid #2b3139", color: "#eaecef", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
                    />
                  </div>
                )}

                {/* DESGLOSE DE TARIFAS CORREGIDO CON MÁXIMA PRECISIÓN VISUAL */}
                <div style={{ background: "#161a1e", padding: 12, borderRadius: 10, marginBottom: 16, border: "1px solid #2b3139", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#eaecef", marginBottom: 4 }}>
                    <span>Tarifa de procesamiento:</span>
                    <span style={{ fontWeight: "bold", color: "#f0b90b", fontFamily: "monospace" }}>
                      {selectedToken?.chainId === 480 
                        ? (selectedToken?.symbol === "RC.PL"
                            ? (parseFloat(tradeAmount || "0") * FEE_RC_PL_TOKEN_PCT).toFixed(12) + " RC.PL" // REPARADO: .toFixed(12) evita que muestre 0.0000
                            : (parseFloat(tradeAmount || "0") * FEE_WORLD_CHAIN_GENERIC_PCT).toFixed(12) + " WLD")
                        : (parseFloat(tradeAmount || "0") * FEE_GENERIC_TOKENS_PCT).toFixed(4) + " WLD"
                      }
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#848e9c", lineHeight: "1.4" }}>
                    * {selectedToken?.chainId === 480 
                        ? "Tarifa de World Chain activa: " + (selectedToken?.symbol === "RC.PL" ? "VIP infra-mínima" : "Estándar infra-mínima") + "." 
                        : "Tarifa por soporte multicadena externa activa (" + (FEE_GENERIC_TOKENS_PCT * 100) + "% del valor en WLD)."
                      } Deducida de forma unificada para la administración de Rincón Colombiano.
                  </div>
                </div>

                {/* BOTÓN DE DESPACHO DE LOTE EN WORLD APP */}
                <button
                  type="button"
                  disabled={sending || !tradeAmount || (tradeType !== "SWAP" && !recipient)}
                  onClick={handleSend} 
                  style={{ 
                    width: "100%", 
                    padding: 14, 
                    borderRadius: 12, 
                    border: "none", 
                    background: (sending || !tradeAmount || (tradeType !== "SWAP" && !recipient)) 
                      ? "#2b3139" 
                      : tradeType === "BUY" 
                      ? "#00c57a" 
                      : tradeType === "SELL" 
                      ? "#f6465d" 
                      : tradeType === "SEND"
                      ? "#2563eb"
                      : "#f0b90b", 
                    color: (sending || !tradeAmount || (tradeType !== "SWAP" && !recipient)) ? "#848e9c" : tradeType === "SWAP" ? "#000" : "#fff", 
                    fontWeight: "bold", 
                    fontSize: 15,
                    cursor: (sending || !tradeAmount || (tradeType !== "SWAP" && !recipient)) ? "not-allowed" : "pointer",
                    transition: "opacity 0.2s ease"
                  }}
                >
                  {sending ? "Procesando lote en World App..." : 
                   tradeType === "BUY" ? "Confirmar Orden de Compra" : 
                   tradeType === "SELL" ? "Confirmar Orden de Venta" : 
                   tradeType === "SEND" ? "Confirmar Envío de Fondos 🚀" : "Confirmar Ejecución de Swap 🔄"}
                </button>
              </div>
            )}
      {/* ========================================================
         FORMULARIO DE RETIRO TRADICIONAL (DISEÑO INDUSTRIAL DE RESPALDO RECONSTITUIDO)
      ======================================================== */}
      <h2 style={{ fontSize: 18, fontWeight: "bold", marginTop: 24, marginBottom: 12, color: "#eaecef" }}>
        Retirar / Recuperar Fondos
      </h2>
      
      <p style={{ fontSize: 12, color: "#848e9c", marginBottom: 6 }}>Activo Seleccionado:</p>
      <div 
        style={{ 
          background: "#1e2226", 
          padding: 14, 
          borderRadius: 14, 
          marginBottom: 16, 
          border: selectedToken ? "1px solid #00c57a" : "1px solid #2b3139",
          boxSizing: "border-box"
        }}
      >
        {selectedToken && typeof selectedToken === "object" && !Array.isArray(selectedToken) ? (
          <span style={{ color: "#00c57a", fontWeight: "bold", fontSize: 14 }}>
            {selectedToken.network} — {selectedToken.balance} {selectedToken.symbol}
          </span>
        ) : (
          <span style={{ color: "#f6465d", fontSize: 13, fontWeight: "500" }}>
            ❌ Ningún activo seleccionado. Elígelo en la lista de arriba.
          </span>
        )}
      </div>

      {/* Input de Dirección Destino */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 6 }}>Dirección de Destino (Wallet EVM Receptora):</label>
        <input
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            background: "#0b0e11",
            border: "1px solid #2b3139",
            color: "#eaecef",
            boxSizing: "border-box",
            fontSize: 14,
            fontFamily: "monospace"
          }}
        />
      </div>

      {/* Input de Cantidad con Botón MAX Flotante Integrado */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 11, color: "#848e9c", marginBottom: 6 }}>Cantidad a Enviar:</label>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <input
            type="text"
            placeholder="0.00"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 75px 12px 12px",
              borderRadius: 12,
              background: "#0b0e11",
              border: "1px solid #2b3139",
              color: "#eaecef",
              boxSizing: "border-box",
              fontSize: 14
            }}
          />
          <button
            type="button"
            disabled={!selectedToken || Array.isArray(selectedToken) || sending}
            onClick={() => {
              if (!selectedToken || Array.isArray(selectedToken)) return;
              if (selectedToken.isNative) {
                setSendAmount(maxSendAmount && String(maxSendAmount) !== "0" && String(maxSendAmount) !== "" ? String(maxSendAmount) : selectedToken.balance);
              } else {
                setSendAmount(selectedToken.balance);
              }
            }}
            style={{
              position: "absolute",
              right: 8,
              padding: "6px 10px",
              background: "#2b3139",
              border: "none",
              color: "#f0b90b",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: "bold",
              cursor: (!selectedToken || Array.isArray(selectedToken) || sending) ? "not-allowed" : "pointer"
            }}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Desglose de Tarifas de Respaldo Dinámicas en Pantalla Base */}
      {selectedToken && typeof selectedToken === "object" && !Array.isArray(selectedToken) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#848e9c", marginBottom: 16, padding: "0 4px" }}>
          <span>Tarifa de procesamiento estimada:</span>
          <span style={{ fontWeight: "bold", color: "#f0b90b", fontFamily: "monospace" }}>
            {selectedToken.chainId === 480 
              ? (selectedToken.symbol === "RC.PL"
                  ? (parseFloat(sendAmount || "0") * FEE_RC_PL_TOKEN_PCT).toFixed(12) + " RC.PL"
                  : (parseFloat(sendAmount || "0") * FEE_WORLD_CHAIN_GENERIC_PCT).toFixed(12) + " WLD")
              : (parseFloat(sendAmount || "0") * FEE_GENERIC_TOKENS_PCT).toFixed(4) + " WLD"
            }
          </span>
        </div>
      )}

      {/* Botón de Despacho de Retiro Tradicional */}
      <button
        type="button"
        disabled={sending || !selectedToken || Array.isArray(selectedToken) || !recipient || !sendAmount}
        onClick={() => {
          if (!recipient || !sendAmount || !selectedToken) {
            setStatus("Por favor, completa todos los campos obligatorios");
            return;
          }
          // Activa el interruptor para despertar la ventana de verificación biométrica con World ID
          setShowConfirmModal(true); 
        }}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "none",
          background: (sending || !selectedToken || Array.isArray(selectedToken) || !recipient || !sendAmount) ? "#2b3139" : "#2563eb",
          color: (sending || !selectedToken || Array.isArray(selectedToken) || !recipient || !sendAmount) ? "#848e9c" : "#fff",
          fontWeight: "bold",
          fontSize: 16,
          cursor: (sending || !selectedToken || Array.isArray(selectedToken) || !recipient || !sendAmount) ? "not-allowed" : "pointer",
          boxSizing: "border-box",
          transition: "background 0.2s"
        }}
      >
        {sending ? "Procesando en World App..." : "Retirar Fondos"}
      </button>
      {/* ========================================================
               MODAL 1: SEGURIDAD BIOMÉTRICA DE CONFIRMACIÓN (WORLD ID GUARD SANEADO)
          ======================================================== */}
      {showConfirmModal && selectedToken && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(11, 14, 17, 0.96)", backdropFilter: "blur(12px)",
            zIndex: 11000, display: "flex", justifyContent: "center", alignItems: "center",
            padding: 20, boxSizing: "border-box"
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: "420px", background: "#161a1e",
              borderRadius: 24, padding: 24, border: "1px solid #2b3139",
              boxShadow: "0px 10px 40px rgba(0,0,0,0.6)", boxSizing: "border-box"
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#fff", textAlign: "center", fontSize: 18, fontWeight: "bold" }}>
              🔒 Confirmar Operación
            </h3>
            <p style={{ margin: "0 0 20px 0", color: "#848e9c", textAlign: "center", fontSize: 12 }}>
              Verifica los datos antes de firmar con tu World ID
            </p>

            {/* Ficha Resumen de Lote */}
            <div style={{ background: "#0b0e11", padding: 16, borderRadius: 16, marginBottom: 20, border: "1px solid #2b3139" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: "#848e9c" }}>Acción:</span>
                <span style={{ color: "#38bdf8", fontWeight: "bold" }}>{tradeType || "TRANSFERENCIA"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: "#848e9c" }}>Cantidad:</span>
                <span style={{ color: "#fff", fontWeight: "bold" }}>{sendAmount} {selectedToken.symbol}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: "#848e9c" }}>Red EVM:</span>
                <span style={{ color: "#eaecef" }}>{selectedToken.network}</span>
              </div>
              <div style={{ borderTop: "1px solid #2b3139", paddingTop: 8, marginTop: 4 }}>
                <span style={{ display: "block", color: "#848e9c", fontSize: 11, marginBottom: 4 }}>Destino:</span>
                <span style={{ block: "block", color: "#00c57a", fontSize: 12, wordBreak: "break-all", fontFamily: "monospace" }}>
                  {recipient}
                </span>
              </div>
            </div>

            {/* Acciones del Modal de Seguridad */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={async () => {
                  setShowConfirmModal(false); // Cierra la confirmación visual inicial
                  
                  // Invoca la función transaccional maestra que procesa y valida los lotes criptográficos
                  await handleSend(); 
                  
                  // REPARADO: Quitamos la inyección forzada e inmediata de showSuccessModal.
                  // Ahora el éxito real se dispara únicamente si handleSend() valida la firma del Relayer.
                }}
                style={{
                  width: "100%", padding: 14, borderRadius: 12, border: "none",
                  background: "#00c57a", color: "#fff", fontWeight: "bold", fontSize: 15,
                  cursor: "pointer", boxShadow: "0px 4px 15px rgba(0, 197, 122, 0.2)"
                }}
              >
                👁️ Firmar y Verificar con World ID
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  width: "100%", padding: 12, borderRadius: 12, border: "1px solid #2b3139",
                  background: "transparent", color: "#848e9c", fontWeight: "bold", fontSize: 14,
                  cursor: "pointer"
                }}
              >
                Cancelar Operación
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================
               MODAL 2: PANTALLA DE ÉXITO DEFINITIVO (SUCCESS SCREEN SANEADO)
          ======================================================== */}
      {showSuccessModal && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(11, 14, 17, 0.97)", backdropFilter: "blur(16px)",
            zIndex: 12000, display: "flex", justifyContent: "center", alignItems: "center",
            padding: 20, boxSizing: "border-box"
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: "400px", background: "#161a1e",
              borderRadius: 28, padding: 30, border: "2px solid #00c57a",
              textAlign: "center", boxShadow: "0px 15px 50px rgba(0, 197, 122, 0.15)",
              boxSizing: "border-box"
            }}
          >
            {/* Ícono de Check de Contraste DeFi Pro */}
            <div
              style={{
                width: 72, height: 72, borderRadius: "50%", background: "rgba(0, 197, 122, 0.1)",
                border: "3px solid #00c57a", display: "flex", justifyContent: "center",
                alignItems: "center", margin: "0 auto 20px auto",
                boxShadow: "0 0 20px rgba(0, 197, 122, 0.3)"
              }}
            >
              <span style={{ color: "#00c57a", fontSize: 36, fontWeight: "bold" }}>✓</span>
            </div>

            <h3 style={{ margin: "0 0 12px 0", color: "#fff", fontSize: 22, fontWeight: "800" }}>
              {successDetails.title}
            </h3>
            
            <p style={{ margin: "0 0 24px 0", color: "#848e9c", fontSize: 13, lineHeight: "1.5" }}>
              {successDetails.description}
            </p>

            <button
              type="button"
              onClick={() => {
                setShowSuccessModal(false); // Cierra la pantalla de éxito flotante
                
                // SANEADO ASIGNADO: Limpieza absoluta de variables para dejar lista la billetera
                setSendAmount("");
                setTradeAmount("");
                setRecipient("");
              }}
              style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none",
                background: "#2563eb", color: "#fff", fontWeight: "bold", fontSize: 15,
                cursor: "pointer", transition: "background 0.2s"
              }}
            >
              Entendido / Volver a la Wallet ➔
            </button>
          </div>
        </div>
      )}
      {/* ========================================================
         BANNER PUBLICITARIO PREMIUM: RINCÓN COLOMBIANO EN VARSOVIA
      ======================================================== */}
      <div
        style={{
          marginTop: 28,
          padding: 20,
          background: "linear-gradient(135deg, #161a1e 0%, #0b0e11 100%)",
          borderRadius: 20,
          border: "2px solid #f0b90b", // Borde dorado estilo Cupón VIP
          textAlign: "center",
          boxSizing: "border-box",
          boxShadow: "0px 10px 30px rgba(240, 185, 11, 0.15)"
        }}
      >
        <p style={{ margin: "0 0 6px 0", color: "#00c57a", fontWeight: "800", fontSize: 16 }}>
          ¡Gracias por usar RC Wallet! 🇨🇴✨
        </p>
        
        <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#dee3ea", lineHeight: "1.5" }}>
          Te invitamos a visitar nuestro local comercial <b>RINCÓN COLOMBIANO</b> para disfrutar del mejor sabor de la comida COLOMBIANA en Varsovia.
        </p>

        {/* 🎫 SECCIÓN DE CUPÓN CONDICIONAL BLINDADO: EMPANADA POR CONSUMO */}
        <div
          style={{
            background: "rgba(240, 185, 11, 0.05)",
            border: "1px dashed #f0b90b",
            borderRadius: 12,
            padding: "14px 12px",
            marginBottom: 16,
            boxSizing: "border-box",
            textAlign: "left"
          }}
        >
          <span style={{ display: "block", fontSize: 15, color: "#f0b90b", fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>
            🎁 BENEFIVE EXCLUSIVO PARA USUARIOS 🎁
          </span>
          <span style={{ display: "block", fontSize: 13, color: "#fff", fontWeight: "600", lineHeight: "1.4", marginBottom: 8, textAlign: "center" }}>
            ¡Muestra esta pantalla en la caja y reclama una <span style={{ color: "#00c57a", fontWeight: "800" }}>EMPANADA GRATIS</span>!
          </span>
          
          {/* REGLA DE SEGURIDAD COMERCIAL OBLIGATORIA */}
          <div style={{ borderTop: "1px solid rgba(240, 185, 11, 0.2)", paddingTop: 6, marginTop: 4, fontSize: 11, color: "#848e9c", textAlign: "center", lineHeight: "1.3" }}>
            ⚠️ <b>Condición:</b> Válido únicamente presentando este anuncio digital y aplicando para una <b>compra mínima de 50 zł</b> en el local. Limitado a 1 cupón por mesa/visita.
          </div>
        </div>

        {/* 🗺️ BOTÓN GEOESPACIAL: REPARADO CON BOTÓN NATIVO ENLICE A RINCON COLOMBIANO */}
        <button 
          type="button"
          aria-label="Abrir sitio web de Rincón Colombiano"
          onClick={() => {
            if (typeof window !== "undefined") {
              // REPARADO: Apunta de forma estable al dominio oficial verificado del restaurante
              const officialProfileUrl = "https://rinconcolombiano.pl/";
              window.open(officialProfileUrl, "_blank", "noopener,noreferrer");
            }
          }}
          style={{ 
            marginTop: 4, 
            display: "inline-block", 
            padding: "12px 20px", 
            background: "#f0b90b", 
            color: "#000", 
            border: "none",
            borderRadius: 12, 
            fontWeight: "bold", 
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0px 4px 15px rgba(240, 185, 11, 0.3)",
            boxSizing: "border-box",
            fontFamily: "sans-serif"
          }}
        >
          📍 ul. Czapelska 33, Varsovia (Visitar Web Oficial 🗺️)
        </button>
      </div>

      {/* ========================================================
         CONSOLE DEBUG OUTPUT (VISTA DE DEPURACIÓN ANTI-DESBORDAMIENTO)
      ======================================================== */}
      {debugResult && (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            background: "#161a1e",
            borderRadius: 12,
            color: "#00c57a",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: "1px solid #2b3139"
          }}
        >
          <b style={{ display: "block", marginBottom: 4 }}>CONSOLE DEBUG RESULT:</b>
          <pre 
            style={{ 
              margin: 0, 
              fontFamily: "monospace", 
              whiteSpace: "pre-wrap", 
              wordBreak: "break-all",
              overflowX: "auto",
              color: "#848e9c"
            }}
          >
            {debugResult}
          </pre>
        </div>
      )}
    </div>
  );

  // ========================================================================
  // INGENIERÍA DE AUDITORÍA: DETECCIÓN DE DEPLOYMENT DE SMART CONTRACT SAFE
  // ========================================================================
  async function checkContractDeployment(accountAddress) {
    if (!accountAddress || !ethers.isAddress(accountAddress)) return;
    try {
      const cleanTarget = ethers.getAddress(accountAddress);
      let networkStatesMap = {};

      for (const net of NETWORKS) {
        try {
          const provider = await getWorkingProvider(net.rpc);
          if (!provider) continue;

          // Consulta el código compilado bytecode en la dirección de la wallet
          const codeBytes = await provider.getCode(cleanTarget);
          
          // Si el bytecode está vacío ("0x"), significa que la cuenta no ha sido inicializada en esa capa
          const isContractMissing = !codeBytes || codeBytes === "0x" || codeBytes === "0x0" || codeBytes === "0x00";

          // Filtramos si la red tiene balances en TOKENS conocidos
          const knownRedTokens = TOKENS.filter(t => t.addresses?.[net.chainId]);
          let hasAssetFunds = false;

          for (const token of knownRedTokens) {
            try {
              const tokenContract = new ethers.Contract(ethers.getAddress(token.addresses[net.chainId]), ERC20_ABI, provider);
              const bal = await tokenContract.balanceOf(cleanTarget);
              if (bal && bal > 0n) {
                hasAssetFunds = true;
                break;
              }
            } catch {
              continue;
            }
          }

          networkStatesMap[net.chainId] = {
            networkName: net.name,
            needsCloning: isContractMissing && hasAssetFunds
          };
        } catch {
          continue;
        }
      }

      setSafeNetworkStates(networkStatesMap);
    } catch (auditErr) {
      console.error("[AUDIT FAILURE] Error en el mapeo de despliegues Safe:", auditErr);
    }
  }
} // Fin definitivo y exacto de tu componente App y cierre de tu archivo src/App.jsx
