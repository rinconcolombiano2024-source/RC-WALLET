import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ethers } from "ethers";
import { MiniKit } from "@worldcoin/minikit-js";
import {
  formatBalance,
  normalizeAddress,
  scanAllNetworks,
  sendWithExternalWallet,
} from "./blockchain.js";
import {
  ADMIN_FEE_WALLET,
  BPS_DENOMINATOR,
  ERC20_ABI,
  NETWORKS,
  RCPL_POOL_MANAGER_CONTRACT,
  RCPL_STAKING_CONTRACT,
  RCPL_TARGET_PRICE_KEY,
  RECOVERY_FEE_BPS,
  WORLD_CHAIN_ID,
} from "./config.js";
import {
  analyzeRecoveryProof,
  createRecoveryProofPackage,
  createRecoveryTypedData,
} from "./recovery-proof.js";
import {
  connectInjectedProvider,
  connectWalletConnectProvider,
  disconnectExternalProvider,
  walletConnectConfigured,
} from "./external-wallet.js";
import {
  formatCompactUsd,
  formatUsd,
  getTradeUrl,
  loadMarket,
} from "./market.js";

const ERC20_INTERFACE = new ethers.Interface(ERC20_ABI);
const CUSTOM_TOKENS_KEY = "rc_wallet_custom_tokens_v1";
const DEFAULT_RCPL_TARGET_PRICE = "0.10";
const DEFAULT_RCPL_LIQUIDITY_USD = "1000";

const APP_TABS = Object.freeze([
  { id: "home", label: "Inicio", icon: "⌂" },
  { id: "tokens", label: "Tokens", icon: "◈" },
  { id: "recovery", label: "Recovery", icon: "⛑" },
  { id: "markets", label: "Markets", icon: "↗" },
  { id: "tools", label: "Herramientas", icon: "⚙" },
]);

const TOKEN_OFFICIAL_LINKS = Object.freeze({
  "RC.PL": [
    {
      label: "Contrato RC.PL",
      url: "https://worldscan.org/token/0xb9DEe79d682f9dA8B95761036f2763cdE25bD3e8",
    },
    {
      label: "Rincón Colombiano",
      url: "https://maps.app.goo.gl/MKzY4KzWp8NrTBjw5?g_st=ac",
    },
  ],
  WLD: [{ label: "World oficial", url: "https://world.org" }],
  USDC: [{ label: "Circle USDC", url: "https://www.circle.com/usdc" }],
  USDT: [{ label: "Tether USDT", url: "https://tether.to" }],
  WBTC: [
    { label: "Bitcoin oficial", url: "https://bitcoin.org" },
    { label: "Wrapped BTC", url: "https://wbtc.network" },
  ],
  WETH: [{ label: "Ethereum oficial", url: "https://ethereum.org" }],
  ETH: [{ label: "Ethereum oficial", url: "https://ethereum.org" }],
  BNB: [{ label: "BNB Chain oficial", url: "https://www.bnbchain.org" }],
  GOLD: [{ label: "Precio oro XAU", url: "https://www.gold.org" }],
});

function readCustomTokens() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TOKENS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compactAddress(address) {
  return address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "";
}

function explorerAddressUrl(network, address) {
  return `${network.explorer}/address/${address}`;
}

function explorerTransactionUrl(network, hash) {
  return `${network.explorer}/tx/${hash}`;
}

function normalizeAmount(value) {
  return String(value ?? "").trim().replace(",", ".");
}

function isValidAmount(value) {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function readStoredValue(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function calculateRecoveryFee(amountUnits) {
  return (amountUnits * RECOVERY_FEE_BPS) / BPS_DENOMINATOR;
}

function percentFromBps(bps) {
  return Number(bps) / 100;
}

function buildFeeBreakdown(asset, amountValue) {
  if (!asset) return null;
  const cleanAmount = normalizeAmount(amountValue);
  if (!isValidAmount(cleanAmount)) return null;

  try {
    const grossUnits = ethers.parseUnits(cleanAmount, asset.decimals);
    if (grossUnits <= 0n) return null;
    const feeUnits = calculateRecoveryFee(grossUnits);
    const recipientUnits = grossUnits - feeUnits;

    return {
      grossUnits,
      feeUnits,
      recipientUnits,
      gross: formatBalance(grossUnits, asset.decimals, 8),
      fee: formatBalance(feeUnits, asset.decimals, 8),
      recipient: formatBalance(recipientUnits, asset.decimals, 8),
    };
  } catch {
    return null;
  }
}

function parsePositiveNumber(value) {
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function tokenOfficialLinks(asset) {
  if (!asset) return [];
  return (
    TOKEN_OFFICIAL_LINKS[asset.symbol] ??
    TOKEN_OFFICIAL_LINKS[asset.configuredSymbol] ??
    []
  );
}

function routeStatusLabel(status) {
  if (status === "ready") return "Listo";
  if (status === "needs-action") return "Falta acción";
  if (status === "future") return "Futuro";
  return "Bloqueado";
}

function qrImageUrl(value, size = 260) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
}

function extractEvmAddressFromQr(value) {
  const rawValue = String(value ?? "").trim();
  const match = rawValue.match(/0x[a-fA-F0-9]{40}/);
  if (!match) {
    throw new Error("El QR no contiene una dirección EVM válida");
  }
  return normalizeAddress(match[0]);
}

async function pollWorldUserOperation(userOpHash, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(
      `https://developer.world.org/api/v2/minikit/userop/${userOpHash}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`No se pudo consultar la operación (${response.status})`);
    }

    const result = await response.json();
    if (result.status === "success" && result.transaction_hash) {
      return result;
    }
    if (result.status === "failed") {
      throw new Error("La operación falló antes de confirmarse");
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  return {
    status: "pending",
    userOpHash,
    transaction_hash: null,
  };
}

function Status({ status }) {
  if (!status.message) return null;

  return (
    <div className={`status status--${status.type}`} role="status">
      {status.message}
    </div>
  );
}

function RecoveryBadge({ asset, externalMatches }) {
  if (asset.chainId === WORLD_CHAIN_ID) {
    return <span className="badge badge--green">Firma World App</span>;
  }
  if (externalMatches) {
    return <span className="badge badge--green">Firma externa disponible</span>;
  }
  return <span className="badge badge--amber">Solo detección</span>;
}

function getNativeGasAsset(assets, chainId) {
  return (
    assets.find((asset) => asset.chainId === chainId && asset.isNative) ??
    null
  );
}

function safeSameAddress(left, right) {
  try {
    return Boolean(left && right && normalizeAddress(left) === normalizeAddress(right));
  } catch {
    return false;
  }
}

function createRecoveryDiagnosis({
  asset,
  authenticated,
  miniKitReady,
  authenticatedWorldAddress,
  targetAddress,
  externalMatches,
  connectedExternalAddress,
  nativeGasAsset,
}) {
  if (!asset) return null;

  const worldSessionMatches = safeSameAddress(
    authenticatedWorldAddress,
    targetAddress,
  );
  const hasNativeGas =
    asset.isNative || Boolean(nativeGasAsset?.rawBalance > 0n);
  const accountIsContract = asset.accountKind === "contract";

  if (asset.chainId === WORLD_CHAIN_ID) {
    if (authenticated && miniKitReady && worldSessionMatches) {
      return {
        level: "recoverable",
        title: "✅ Recuperable con World App",
        route: "MiniKit / World Chain",
        action:
          "Completa la wallet receptora, el monto y firma dentro de World App. Si es ERC20, el token/contrato debe estar permitido en el Developer Portal de World.",
      };
    }

    return {
      level: "partial",
      title: "⚠️ Recuperable, falta sesión World App",
      route: "Autenticación World App",
      action:
        "Pulsa “Autenticar con World App” con la misma cuenta que contiene los fondos. RC Wallet no moverá nada si la sesión no coincide.",
    };
  }

  if (externalMatches) {
    if (!hasNativeGas) {
      return {
        level: "partial",
        title: "⚠️ Recuperable, falta gas",
        route: "Wallet externa + gas de red",
        action: `La wallet conectada coincide, pero para mover ${asset.symbol} en ${asset.networkName} necesitas un poco de ${asset.network.symbol} en esa misma dirección para pagar gas.`,
      };
    }

    return {
      level: accountIsContract ? "partial" : "recoverable",
      title: accountIsContract
        ? "⚠️ Posible con smart wallet compatible"
        : "✅ Recuperable con wallet externa",
      route: accountIsContract
        ? "Proveedor externo de smart account"
        : "MetaMask / Trust Wallet / Binance Wallet / WalletConnect",
      action: accountIsContract
        ? "La dirección tiene bytecode. Solo funcionará si la wallet externa puede ejecutar transacciones desde esa smart account exacta."
        : "Completa destinatario y monto. RC Wallet abrirá la firma en la wallet externa conectada.",
    };
  }

  if (connectedExternalAddress) {
    return {
      level: "blocked",
      title: "❌ La wallet conectada no controla esos fondos",
      route: "Firma externa no coincidente",
      action:
        "Si Trust Wallet la muestra como solo lectura/watch-only, no tiene la llave para firmar. Desconecta y prueba con una wallet que controle exactamente la misma dirección, no una cuenta importada solo para mirar.",
    };
  }

  return {
    level: accountIsContract ? "partial" : "blocked",
    title: accountIsContract
      ? "⚠️ Requiere propietarios o módulos de smart account"
      : "❌ Falta firmante externo exacto",
    route: accountIsContract
      ? "Safe / ERC-4337 / soporte del proveedor"
      : "Wallet externa con la misma dirección",
    action: accountIsContract
      ? "Genera la prueba RC Link y revisa si existe compatibilidad EIP-1271. Si no existe un módulo/propietario autorizado en esa red, la app solo puede documentar el caso."
      : "Conecta MetaMask, Trust Wallet, Binance Wallet o WalletConnect con la dirección exacta y con capacidad de firmar. Si la cuenta aparece como solo lectura, ninguna app puede mover los fondos.",
  };
}

function stopQrScannerStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export default function App() {
  const mountedRef = useRef(false);
  const scanIdRef = useRef(0);
  const externalConnectionRef = useRef(null);
  const sendSectionRef = useRef(null);
  const qrVideoRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrScanActiveRef = useRef(false);

  const [activeTab, setActiveTab] = useState("home");
  const [miniKitReady, setMiniKitReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticatedWorldAddress, setAuthenticatedWorldAddress] =
    useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [connectedExternalAddress, setConnectedExternalAddress] =
    useState("");
  const [externalConnectionName, setExternalConnectionName] = useState("");
  const [externalConnecting, setExternalConnecting] = useState(false);
  const [assets, setAssets] = useState([]);
  const [networkStates, setNetworkStates] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [tokenScreenOpen, setTokenScreenOpen] = useState(false);
  const [customTokens, setCustomTokens] = useState(readCustomTokens);
  const [customChainId, setCustomChainId] = useState(1);
  const [customTokenAddress, setCustomTokenAddress] = useState("");
  const [search, setSearch] = useState("");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [feeAccepted, setFeeAccepted] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const [qrScannerError, setQrScannerError] = useState("");
  const [lastTransaction, setLastTransaction] = useState(null);
  const [proofChainId, setProofChainId] = useState(10);
  const [proofPackage, setProofPackage] = useState("");
  const [proofInput, setProofInput] = useState("");
  const [proofReport, setProofReport] = useState(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [market, setMarket] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [rcplTargetPrice, setRcplTargetPrice] = useState(() =>
    readStoredValue(RCPL_TARGET_PRICE_KEY, DEFAULT_RCPL_TARGET_PRICE),
  );
  const [rcplLiquidityUsd, setRcplLiquidityUsd] = useState(
    DEFAULT_RCPL_LIQUIDITY_USD,
  );
  const [status, setStatus] = useState({
    type: "info",
    message:
      "Conecta World App o introduce una dirección para iniciar el diagnóstico.",
  });

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const selectedTokenLinks = useMemo(
    () => tokenOfficialLinks(selectedAsset),
    [selectedAsset],
  );

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter(
      (asset) => {
        const matchesNetwork =
          networkFilter === "all" || String(asset.chainId) === networkFilter;
        const matchesQuery =
          !query ||
          asset.symbol.toLowerCase().includes(query) ||
          asset.networkName.toLowerCase().includes(query) ||
          asset.address?.toLowerCase().includes(query);

        return matchesNetwork && matchesQuery;
      },
    );
  }, [assets, networkFilter, search]);

  const externalMatches = useMemo(() => {
    if (!targetAddress || !connectedExternalAddress) return false;
    try {
      return (
        normalizeAddress(targetAddress) ===
        normalizeAddress(connectedExternalAddress)
      );
    } catch {
      return false;
    }
  }, [connectedExternalAddress, targetAddress]);

  const selectedNativeGasAsset = useMemo(
    () =>
      selectedAsset
        ? getNativeGasAsset(assets, selectedAsset.chainId)
        : null,
    [assets, selectedAsset],
  );

  const selectedRecoveryDiagnosis = useMemo(
    () =>
      createRecoveryDiagnosis({
        asset: selectedAsset,
        authenticated,
        miniKitReady,
        authenticatedWorldAddress,
        targetAddress,
        externalMatches,
        connectedExternalAddress,
        nativeGasAsset: selectedNativeGasAsset,
      }),
    [
      authenticated,
      authenticatedWorldAddress,
      connectedExternalAddress,
      externalMatches,
      miniKitReady,
      selectedAsset,
      selectedNativeGasAsset,
      targetAddress,
    ],
  );

  const feeBreakdown = useMemo(
    () => buildFeeBreakdown(selectedAsset, amount),
    [amount, selectedAsset],
  );

  const portfolioSummary = useMemo(() => {
    const onlineNetworks = Object.values(networkStates).filter(
      (state) => state.status === "online",
    ).length;
    const worldAssets = assets.filter(
      (asset) => asset.chainId === WORLD_CHAIN_ID,
    ).length;
    const externalAssets = assets.length - worldAssets;

    return {
      onlineNetworks,
      totalAssets: assets.length,
      worldAssets,
      externalAssets,
    };
  }, [assets, networkStates]);

  const homeAssets = useMemo(() => assets.slice(0, 5), [assets]);

  const viewClass = useCallback(
    (tabId) => `app-view ${activeTab === tabId ? "app-view--active" : ""}`,
    [activeTab],
  );

  const estimateAssetValue = useCallback(
    (asset) => {
      if (
        asset.id === selectedAssetId &&
        market?.priceUsd &&
        Number.isFinite(Number(asset.balance))
      ) {
        return formatUsd(Number(asset.balance) * Number(market.priceUsd));
      }

      return "Pendiente de mercado";
    },
    [market, selectedAssetId],
  );

  const rcplAsset = useMemo(
    () => assets.find((asset) => asset.symbol === "RC.PL") ?? null,
    [assets],
  );

  const rcplPlan = useMemo(() => {
    const targetPrice = parsePositiveNumber(rcplTargetPrice);
    const liquidityUsd = parsePositiveNumber(rcplLiquidityUsd);
    const rcplForOneSide =
      targetPrice > 0 && liquidityUsd > 0
        ? liquidityUsd / 2 / targetPrice
        : 0;

    return {
      targetPrice,
      liquidityUsd,
      rcplForOneSide,
      stableSideUsd: liquidityUsd / 2,
    };
  }, [rcplLiquidityUsd, rcplTargetPrice]);

  const maximumRecoveryRoutes = useMemo(() => {
    const externalAssets = assets.filter(
      (asset) => asset.chainId !== WORLD_CHAIN_ID,
    );
    const contractAssets = assets.filter(
      (asset) => asset.accountKind === "contract",
    );
    const hasWorldChainAssets = assets.some(
      (asset) => asset.chainId === WORLD_CHAIN_ID,
    );

    return [
      {
        id: "world-minikit",
        status:
          authenticated && miniKitReady
            ? hasWorldChainAssets
              ? "ready"
              : "needs-action"
            : "needs-action",
        title: "World Chain / MiniKit",
        description:
          "Ruta oficial para mover fondos en World Chain. Requiere sesión World App y allowlist de tokens/contratos en Developer Portal.",
        next:
          authenticated && miniKitReady
            ? "Selecciona un activo de World Chain y firma con World App."
            : "Autentica con World App dentro de la Mini App.",
      },
      {
        id: "external-signer",
        status: externalMatches
          ? "ready"
          : connectedExternalAddress
            ? "blocked"
            : "needs-action",
        title: "Wallet externa firmante",
        description:
          "Ruta para Ethereum, Optimism, Base y BNB cuando MetaMask, Trust, Binance Wallet o WalletConnect firman desde la misma dirección.",
        next: externalMatches
          ? "Completa destino, monto y acepta comisión para abrir firma externa."
          : connectedExternalAddress
            ? "La wallet conectada no firma desde la dirección de los fondos."
            : "Conecta una wallet externa que no sea solo lectura/watch-only.",
      },
      {
        id: "rc-link",
        status: proofReport
          ? proofReport.classification === "deployed-smart-account-signature"
            ? "ready"
            : proofReport.classification === "counterfactual-smart-account"
              ? "needs-action"
              : "blocked"
          : authenticated
            ? "needs-action"
            : "needs-action",
        title: "RC Link / EIP-1271",
        description:
          "Prueba si la firma de World App tiene autoridad verificable en una red externa mediante EIP-712/EIP-1271.",
        next: proofReport
          ? proofReport.nextStep
          : "Firma una prueba dentro de World App y analízala para saber si se puede construir relayer.",
      },
      {
        id: "counterfactual",
        status: contractAssets.length ? "needs-action" : "future",
        title: "Smart account contrafactual",
        description:
          "Si la dirección es una smart account aún no desplegada en la red destino, solo se puede recuperar con factory, owners, módulos, initializer y salt exactos.",
        next:
          "Recolectar datos verificables del despliegue original. No se deben adivinar parámetros.",
      },
      {
        id: "recovery-relayer",
        status:
          proofReport?.classification === "deployed-smart-account-signature"
            ? "ready"
            : "needs-action",
        title: "Relayer RC Recovery",
        description:
          "Infraestructura que RC Wallet puede crear para ejecutar rescates de smart accounts cuando la firma EIP-1271 sea válida.",
        next:
          proofReport?.classification === "deployed-smart-account-signature"
            ? "Diseñar simulación, relayer y contrato destino para ejecución segura."
            : "Primero debe existir una prueba RC Link válida en la red objetivo.",
      },
      {
        id: "support-dossier",
        status: externalAssets.length ? "ready" : "needs-action",
        title: "Expediente para soporte / emisor",
        description:
          "Paquete técnico con red, contrato, balance, dirección, pruebas y estado de firma para World, exchange, emisor o auditoría.",
        next:
          externalAssets.length
            ? "Copiar expediente máximo y adjuntarlo en soporte."
            : "Escanear una dirección con fondos externos.",
      },
      {
        id: "future-vault",
        status: "future",
        title: "RC Rescue Vault futuro",
        description:
          "Contrato preventivo para depósitos futuros con recuperación social/firmas múltiples. Protege nuevos fondos, no rescata fondos ya atrapados.",
        next:
          "Crear contrato auditado, owners, guardianes, timelock y política de comisiones.",
      },
    ];
  }, [
    assets,
    authenticated,
    connectedExternalAddress,
    externalMatches,
    miniKitReady,
    proofReport,
  ]);

  const showStatus = useCallback((message, type = "info") => {
    if (mountedRef.current) setStatus({ message, type });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const result = MiniKit.install();
    setMiniKitReady(Boolean(result?.success));

    if (result?.success && MiniKit.user?.walletAddress) {
      try {
        const address = normalizeAddress(MiniKit.user.walletAddress);
        setTargetAddress(address);
        setManualAddress(address);
      } catch {
        // Cached MiniKit state is only a convenience; SIWE still verifies login.
      }
    }

    return () => {
      mountedRef.current = false;
      scanIdRef.current += 1;
      externalConnectionRef.current?.cleanup?.();
      qrScanActiveRef.current = false;
      stopQrScannerStream(qrStreamRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(customTokens));
  }, [customTokens]);

  useEffect(() => {
    setRecipient("");
    setAmount("");
    setFeeAccepted(false);
    setLastTransaction(null);
    setShowSendConfirm(false);
  }, [selectedAssetId]);

  useEffect(() => {
    setFeeAccepted(false);
  }, [amount, recipient]);

  useEffect(() => {
    localStorage.setItem(RCPL_TARGET_PRICE_KEY, rcplTargetPrice);
  }, [rcplTargetPrice]);

  useEffect(() => {
    if (!selectedAsset) {
      setMarket(null);
      setMarketError("");
      setMarketLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let intervalId;

    const refreshMarket = async () => {
      try {
        if (mountedRef.current) setMarketLoading(true);
        const result = await loadMarket(
          selectedAsset,
          controller.signal,
        );
        if (!controller.signal.aborted && mountedRef.current) {
          setMarket(result);
          setMarketError(
            result ? "" : "No existe un mercado líquido verificable.",
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError" && mountedRef.current) {
          setMarket(null);
          setMarketError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el mercado",
          );
        }
      } finally {
        if (!controller.signal.aborted && mountedRef.current) {
          setMarketLoading(false);
        }
      }
    };

    void refreshMarket();
    intervalId = window.setInterval(refreshMarket, 30_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [selectedAsset]);

  const openTrade = useCallback(
    (action) => {
      const url = getTradeUrl(action, selectedAsset, market);
      if (!url) {
        showStatus(
          "Función preparada: requiere proveedor de liquidez, DEX u onramp compatible para este activo.",
          "warning",
        );
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    },
    [market, selectedAsset, showStatus],
  );

  const openSendForm = useCallback(() => {
    setTokenScreenOpen(false);
    setActiveTab("recovery");
    window.setTimeout(() => {
      sendSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      document.getElementById("recipient")?.focus();
    }, 450);
  }, []);

  const openTokenScreen = useCallback((assetId) => {
    setSelectedAssetId(assetId);
    setTokenScreenOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const loginWithWorldApp = useCallback(async () => {
    try {
      if (!miniKitReady) {
        showStatus("Abre RC Wallet dentro de World App.", "warning");
        return;
      }

      showStatus("Solicitando autenticación segura a World App…");
      const nonceResponse = await fetch("/api/nonce", {
        credentials: "include",
        cache: "no-store",
      });
      if (!nonceResponse.ok) {
        throw new Error("No se pudo crear el nonce de autenticación");
      }

      const { nonce } = await nonceResponse.json();
      const result = await MiniKit.walletAuth({
        nonce,
        statement: "Iniciar sesión en RC Wallet Recovery",
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });

      if (result.executedWith === "fallback") {
        throw new Error("La autenticación debe ejecutarse dentro de World App");
      }

      const verifyResponse = await fetch("/api/complete-siwe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: result.data, nonce }),
      });
      const verification = await verifyResponse.json();

      if (!verifyResponse.ok || !verification.isValid) {
        throw new Error(
          verification.error ?? "La firma SIWE no pudo verificarse",
        );
      }

      const address = normalizeAddress(verification.address);
      setTargetAddress(address);
      setManualAddress(address);
      setAuthenticatedWorldAddress(address);
      setAuthenticated(true);
      showStatus("World App autenticada correctamente.", "success");
    } catch (error) {
      console.error("[WORLD AUTH]", error);
      showStatus(
        error instanceof Error ? error.message : "Falló la autenticación",
        "error",
      );
    }
  }, [miniKitReady, showStatus]);

  const useManualAddress = useCallback(() => {
    try {
      const address = normalizeAddress(manualAddress);
      setTargetAddress(address);
      setAuthenticatedWorldAddress("");
      setAuthenticated(false);
      showStatus(
        "Dirección cargada en modo de análisis. Esto no demuestra control sobre sus fondos.",
        "warning",
      );
    } catch (error) {
      showStatus(error.message, "error");
    }
  }, [manualAddress, showStatus]);

  const scan = useCallback(async () => {
    if (!targetAddress || scanning) return;

    const currentScanId = scanIdRef.current + 1;
    scanIdRef.current = currentScanId;
    setScanning(true);
    showStatus("Escaneando redes y contratos configurados…");

    try {
      const result = await scanAllNetworks(targetAddress, customTokens);
      if (!mountedRef.current || scanIdRef.current !== currentScanId) return;

      setAssets(result.assets);
      setNetworkStates(result.networks);
      setSelectedAssetId((current) =>
        result.assets.some((asset) => asset.id === current)
          ? current
          : (result.assets[0]?.id ?? ""),
      );

      showStatus(
        result.assets.length
          ? `Escaneo completado: ${result.assets.length} activo(s) con balance.`
          : "No se encontraron balances entre los activos configurados.",
        "success",
      );
    } catch (error) {
      console.error("[SCAN]", error);
      showStatus(
        error instanceof Error ? error.message : "Falló el escaneo",
        "error",
      );
    } finally {
      if (mountedRef.current && scanIdRef.current === currentScanId) {
        setScanning(false);
      }
    }
  }, [customTokens, scanning, showStatus, targetAddress]);

  useEffect(() => {
    if (targetAddress) void scan();
    // The scan is intentionally triggered only when the target address changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAddress]);

  useEffect(() => {
    if (!connectedExternalAddress || !targetAddress) {
      return;
    }

    if (externalMatches) {
      showStatus(
        "La wallet externa controla exactamente la dirección analizada. Las firmas externas quedan habilitadas.",
        "success",
      );
    } else {
      showStatus(
        `La wallet conectada (${compactAddress(connectedExternalAddress)}) no coincide con la dirección que contiene los fondos. No se habilitarán retiros.`,
        "warning",
      );
    }
  }, [
    connectedExternalAddress,
    externalMatches,
    showStatus,
    targetAddress,
  ]);

  const connectExternal = useCallback(
    async (method) => {
      try {
        if (!targetAddress) {
          throw new Error(
            "Primero carga la dirección que contiene los fondos",
          );
        }

        setExternalConnecting(true);
        await disconnectExternalProvider(externalConnectionRef.current);

        const handlers = {
          onAccount: (account) => {
            if (mountedRef.current) setConnectedExternalAddress(account);
          },
          onDisconnect: () => {
            if (mountedRef.current) {
              externalConnectionRef.current = null;
              setConnectedExternalAddress("");
              setExternalConnectionName("");
            }
          },
        };

        const connection =
          method === "walletconnect"
            ? await connectWalletConnectProvider(handlers)
            : await connectInjectedProvider(handlers);

        externalConnectionRef.current = connection;
        setConnectedExternalAddress(connection.account);
        setExternalConnectionName(connection.name);
      } catch (error) {
        showStatus(
          error instanceof Error
            ? error.message
            : "No se pudo conectar la wallet",
          "error",
        );
      } finally {
        if (mountedRef.current) setExternalConnecting(false);
      }
    },
    [showStatus, targetAddress],
  );

  const disconnectExternal = useCallback(async () => {
    await disconnectExternalProvider(externalConnectionRef.current);
    externalConnectionRef.current = null;
    setConnectedExternalAddress("");
    setExternalConnectionName("");
    showStatus("Wallet externa desconectada.");
  }, [showStatus]);

  const stopQrScanner = useCallback(() => {
    qrScanActiveRef.current = false;
    stopQrScannerStream(qrStreamRef.current);
    qrStreamRef.current = null;
    if (qrVideoRef.current) {
      qrVideoRef.current.srcObject = null;
    }
    setQrScanning(false);
  }, []);

  const startQrScanner = useCallback(async () => {
    try {
      setQrScannerError("");

      if (!("BarcodeDetector" in window)) {
        throw new Error(
          "Este navegador no permite escanear QR desde la web. Usa la cámara del teléfono y pega la dirección manualmente.",
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("No se pudo acceder a la cámara en este navegador");
      }

      const detector = new window.BarcodeDetector({
        formats: ["qr_code"],
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      qrStreamRef.current = stream;
      qrScanActiveRef.current = true;
      setQrScanning(true);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        await qrVideoRef.current.play();
      } else {
        throw new Error("No se pudo abrir la vista de cámara");
      }

      const scanFrame = async () => {
        if (!qrScanActiveRef.current || !qrVideoRef.current) return;

        try {
          const barcodes = await detector.detect(qrVideoRef.current);
          const rawValue = barcodes?.[0]?.rawValue;
          if (rawValue) {
            const address = extractEvmAddressFromQr(rawValue);
            setRecipient(address);
            stopQrScanner();
            showStatus("Dirección receptora cargada desde QR.", "success");
            return;
          }
        } catch {
          // Keep scanning until a valid QR appears or the user stops it.
        }

        window.setTimeout(scanFrame, 450);
      };

      void scanFrame();
    } catch (error) {
      stopQrScanner();
      const message =
        error instanceof Error ? error.message : "No se pudo escanear el QR";
      setQrScannerError(message);
      showStatus(message, "warning");
    }
  }, [showStatus, stopQrScanner]);

  const addCustomToken = useCallback(() => {
    try {
      const address = normalizeAddress(customTokenAddress);
      const chainId = Number(customChainId);
      const id = `${chainId}:${address.toLowerCase()}`;

      if (
        customTokens.some(
          (token) =>
            `${token.chainId}:${token.address.toLowerCase()}` === id,
        )
      ) {
        throw new Error("Ese contrato ya fue agregado");
      }

      setCustomTokens((current) => [
        ...current,
        { chainId, address, symbol: "CUSTOM" },
      ]);
      setCustomTokenAddress("");
      showStatus(
        "Contrato agregado. Pulsa “Escanear de nuevo” para consultar su balance.",
        "success",
      );
    } catch (error) {
      showStatus(error.message, "error");
    }
  }, [customChainId, customTokenAddress, customTokens, showStatus]);

  const sendFromWorldChain = useCallback(
    async (asset, destination, recipientAmountUnits, feeAmountUnits) => {
      if (!authenticated || !miniKitReady) {
        throw new Error(
          "Debes autenticar la misma cuenta dentro de World App",
        );
      }
      if (asset.chainId !== WORLD_CHAIN_ID) {
        throw new Error("MiniKit solo puede enviar transacciones en World Chain");
      }

      if (
        !authenticatedWorldAddress ||
        normalizeAddress(authenticatedWorldAddress) !==
          normalizeAddress(targetAddress)
      ) {
        throw new Error(
          "La cuenta autenticada no coincide. Pulsa “Autenticar con World App” nuevamente.",
        );
      }

      // `MiniKit.user.walletAddress` is cached client state. The address
      // verified by SIWE on the backend is the authoritative session address.
      const cachedAddress = MiniKit.user?.walletAddress;
      if (
        cachedAddress &&
        normalizeAddress(cachedAddress) !==
          normalizeAddress(authenticatedWorldAddress)
      ) {
        console.warn(
          "[WORLD SESSION] MiniKit cache differs from verified SIWE address",
        );
      }

      const feeRecipient = normalizeAddress(ADMIN_FEE_WALLET);
      const transactions = [];

      if (asset.isNative) {
        transactions.push({
            to: destination,
            value: recipientAmountUnits.toString(),
            data: "0x",
        });
        if (feeAmountUnits > 0n) {
          transactions.push({
            to: feeRecipient,
            value: feeAmountUnits.toString(),
            data: "0x",
          });
        }
      } else {
        transactions.push({
            to: asset.address,
            value: "0",
            data: ERC20_INTERFACE.encodeFunctionData("transfer", [
              destination,
              recipientAmountUnits,
            ]),
        });
        if (feeAmountUnits > 0n) {
          transactions.push({
            to: asset.address,
            value: "0",
            data: ERC20_INTERFACE.encodeFunctionData("transfer", [
              feeRecipient,
              feeAmountUnits,
            ]),
          });
        }
      }

      const result = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions,
      });

      if (
        result.executedWith === "fallback" ||
        result.data?.status !== "success" ||
        !result.data?.userOpHash
      ) {
        throw new Error(
          result.data?.errorMessage ??
            "World App no aceptó la operación",
        );
      }

      showStatus(
        "Operación enviada. Esperando confirmación en World Chain…",
      );
      const operation = await pollWorldUserOperation(result.data.userOpHash);

      return {
        route: "minikit",
        userOpHash: result.data.userOpHash,
        hash: operation.transaction_hash,
        pending: operation.status === "pending",
      };
    },
    [
      authenticated,
      authenticatedWorldAddress,
      miniKitReady,
      showStatus,
      targetAddress,
    ],
  );

  const send = useCallback(async () => {
    if (!selectedAsset || sending) return;

    try {
      const destination = normalizeAddress(recipient);
      const owner = normalizeAddress(targetAddress);
      if (destination === owner) {
        throw new Error("El destino es igual a la dirección origen");
      }

      const cleanAmount = normalizeAmount(amount);
      if (!isValidAmount(cleanAmount)) {
        throw new Error("Introduce una cantidad decimal válida");
      }

      const amountUnits = ethers.parseUnits(
        cleanAmount,
        selectedAsset.decimals,
      );
      if (amountUnits <= 0n) {
        throw new Error("La cantidad debe ser mayor que cero");
      }
      if (amountUnits > selectedAsset.rawBalance) {
        throw new Error("La cantidad supera el balance detectado");
      }
      const feeAmountUnits = calculateRecoveryFee(amountUnits);
      const recipientAmountUnits = amountUnits - feeAmountUnits;
      if (recipientAmountUnits <= 0n) {
        throw new Error("El monto neto después de comisión debe ser mayor que cero");
      }
      if (!feeAccepted) {
        throw new Error(
          `Debes aceptar la comisión transparente del ${percentFromBps(
            RECOVERY_FEE_BPS,
          )}% antes de firmar`,
        );
      }

      if (
        selectedAsset.isNative &&
        amountUnits === selectedAsset.rawBalance
      ) {
        throw new Error(
          "En monedas nativas debes dejar saldo para pagar el gas",
        );
      }

      setSending(true);
      setLastTransaction(null);

      let result;
      if (selectedAsset.chainId === WORLD_CHAIN_ID) {
        result = await sendFromWorldChain(
          selectedAsset,
          destination,
          recipientAmountUnits,
          feeAmountUnits,
        );
      } else {
        const externalConnection = externalConnectionRef.current;
        if (!externalMatches || !externalConnection?.provider) {
          throw new Error(
            "Conecta una wallet externa que exponga exactamente la dirección con fondos",
          );
        }

        showStatus(
          `Abriendo la firma externa en ${selectedAsset.networkName}…`,
        );
        result = {
          route: "external",
          ...(await sendWithExternalWallet({
            provider: externalConnection.provider,
            asset: selectedAsset,
            targetAddress,
            recipient: destination,
            amount: cleanAmount,
            feeRecipient: ADMIN_FEE_WALLET,
            feeAmountUnits,
          })),
        };
      }

      setLastTransaction({
        ...result,
        network: selectedAsset.network,
      });
      setRecipient("");
      setAmount("");
      setFeeAccepted(false);
      showStatus(
        result.pending
          ? "La operación sigue pendiente. Conserva el userOpHash."
          : "Transferencia confirmada en la blockchain.",
        result.pending ? "warning" : "success",
      );

      setTimeout(() => {
        if (mountedRef.current) void scan();
      }, 4_000);
    } catch (error) {
      console.error("[SEND]", error);
      showStatus(
        error instanceof Error ? error.message : "La transferencia falló",
        "error",
      );
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [
    amount,
    externalMatches,
    feeAccepted,
    recipient,
    scan,
    selectedAsset,
    sendFromWorldChain,
    sending,
    showStatus,
    targetAddress,
  ]);

  const copyRecoveryReport = useCallback(async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      targetAddress,
      authenticatedWithWorldApp: authenticated,
      authenticatedWorldAddress: authenticatedWorldAddress || null,
      externalSigner: connectedExternalAddress || null,
      externalSignerMatches: externalMatches,
      recoveryFee: {
        wallet: ADMIN_FEE_WALLET,
        percent: percentFromBps(RECOVERY_FEE_BPS),
        basisPoints: Number(RECOVERY_FEE_BPS),
      },
      networks: networkStates,
      assets: assets.map((asset) => ({
        network: asset.networkName,
        chainId: asset.chainId,
        accountKind: asset.accountKind,
        symbol: asset.symbol,
        balance: asset.balance,
        tokenAddress: asset.address,
        recovery: createRecoveryDiagnosis({
          asset,
          authenticated,
          miniKitReady,
          authenticatedWorldAddress,
          targetAddress,
          externalMatches,
          connectedExternalAddress,
          nativeGasAsset: getNativeGasAsset(assets, asset.chainId),
        }),
      })),
    };

    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showStatus("Informe de recuperación copiado.", "success");
  }, [
    assets,
    authenticated,
    authenticatedWorldAddress,
    connectedExternalAddress,
    externalMatches,
    miniKitReady,
    networkStates,
    showStatus,
    targetAddress,
  ]);

  const copySelectedRescuePlan = useCallback(async () => {
    if (!selectedAsset || !selectedRecoveryDiagnosis) return;

    const plan = {
      generatedAt: new Date().toISOString(),
      targetAddress,
      asset: {
        network: selectedAsset.networkName,
        chainId: selectedAsset.chainId,
        accountKind: selectedAsset.accountKind,
        symbol: selectedAsset.symbol,
        balance: selectedAsset.balance,
        tokenAddress: selectedAsset.address,
      },
      signerState: {
        worldAppAuthenticated: authenticated,
        authenticatedWorldAddress: authenticatedWorldAddress || null,
        externalSigner: connectedExternalAddress || null,
        externalSignerMatches: externalMatches,
      },
      gasState: {
        nativeSymbol: selectedAsset.network.symbol,
        nativeBalance: selectedNativeGasAsset?.balance ?? "0",
      },
      recoveryFee: {
        wallet: ADMIN_FEE_WALLET,
        percent: percentFromBps(RECOVERY_FEE_BPS),
        breakdown: feeBreakdown,
      },
      diagnosis: selectedRecoveryDiagnosis,
      safety:
        "RC Wallet no pide frase semilla. La comisión se muestra y debe aceptarse antes de firmar.",
    };

    await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
    showStatus("Plan de rescate copiado.", "success");
  }, [
    authenticated,
    authenticatedWorldAddress,
    connectedExternalAddress,
    externalMatches,
    selectedAsset,
    feeBreakdown,
    selectedNativeGasAsset,
    selectedRecoveryDiagnosis,
    showStatus,
    targetAddress,
  ]);

  const copyMaximumRecoveryDossier = useCallback(async () => {
    const dossier = {
      format: "rc-wallet-maximum-recovery-dossier",
      version: 1,
      generatedAt: new Date().toISOString(),
      targetAddress,
      hardRule:
        "No se pueden mover fondos sin una firma válida de la dirección, una smart account compatible o intervención legítima del emisor/soporte. RC Wallet no crea llaves privadas retroactivas.",
      commercialModel: {
        recoveryFeeWallet: ADMIN_FEE_WALLET,
        recoveryFeePercent: percentFromBps(RECOVERY_FEE_BPS),
      },
      session: {
        miniKitReady,
        authenticated,
        authenticatedWorldAddress: authenticatedWorldAddress || null,
        connectedExternalAddress: connectedExternalAddress || null,
        externalSignerMatches: externalMatches,
      },
      proofReport,
      routes: maximumRecoveryRoutes,
      networks: networkStates,
      assets: assets.map((asset) => ({
        id: asset.id,
        network: asset.networkName,
        chainId: asset.chainId,
        symbol: asset.symbol,
        balance: asset.balance,
        displayBalance: asset.displayBalance,
        tokenAddress: asset.address,
        isNative: asset.isNative,
        accountKind: asset.accountKind,
        explorer: explorerAddressUrl(asset.network, targetAddress),
      })),
      buildableInfrastructure: [
        {
          name: "RC Recovery Relayer",
          purpose:
            "Ejecutar rescates cuando exista firma EIP-1271 válida o smart account compatible.",
          requirement:
            "Prueba RC Link válida, simulación exitosa, allowlist y control de replay.",
        },
        {
          name: "RC Counterfactual Deployer",
          purpose:
            "Desplegar smart account en red destino solo con parámetros exactos verificados.",
          requirement:
            "Factory, singleton, owners, modules, initializer, salt y bytecode hash exactos.",
        },
        {
          name: "RC Rescue Vault",
          purpose:
            "Proteger depósitos futuros con recuperación social, guardianes y timelock.",
          requirement:
            "Contrato auditado. No recupera fondos enviados antes de existir.",
        },
      ],
    };

    await navigator.clipboard.writeText(JSON.stringify(dossier, null, 2));
    showStatus("Expediente máximo de recuperación copiado.", "success");
  }, [
    assets,
    authenticated,
    authenticatedWorldAddress,
    connectedExternalAddress,
    externalMatches,
    maximumRecoveryRoutes,
    miniKitReady,
    networkStates,
    proofReport,
    showStatus,
    targetAddress,
  ]);

  const generateRecoveryProof = useCallback(async () => {
    try {
      if (!authenticated || !miniKitReady || !targetAddress) {
        throw new Error("Autentica primero la cuenta dentro de World App");
      }

      setProofBusy(true);
      setProofReport(null);
      showStatus(
        "Solicitando una firma de compatibilidad. Esta prueba no mueve fondos…",
      );

      const typedData = createRecoveryTypedData(
        targetAddress,
        proofChainId,
      );
      const result = await MiniKit.signTypedData(typedData);

      if (
        result.executedWith === "fallback" ||
        result.data?.status !== "success" ||
        !result.data?.signature ||
        !result.data?.address
      ) {
        throw new Error(
          result.data?.errorMessage ??
            "World App no entregó una firma compatible",
        );
      }

      const proof = createRecoveryProofPackage({
        typedData,
        signature: result.data.signature,
        signerAddress: result.data.address,
      });
      const serialized = JSON.stringify(proof, null, 2);
      setProofPackage(serialized);
      setProofInput(serialized);
      showStatus(
        "Prueba generada. Analízala en la versión web externa.",
        "success",
      );
    } catch (error) {
      console.error("[RECOVERY PROOF]", error);
      showStatus(
        error instanceof Error
          ? error.message
          : "No se pudo generar la prueba",
        "error",
      );
    } finally {
      if (mountedRef.current) setProofBusy(false);
    }
  }, [
    authenticated,
    miniKitReady,
    proofChainId,
    showStatus,
    targetAddress,
  ]);

  const inspectRecoveryProof = useCallback(async () => {
    try {
      setProofBusy(true);
      setProofReport(null);
      showStatus("Analizando firma y despliegue de la cuenta…");
      const report = await analyzeRecoveryProof(proofInput);
      setProofReport(report);
      showStatus(
        "Diagnóstico criptográfico completado.",
        report.classification === "signature-not-portable"
          ? "warning"
          : "success",
      );
    } catch (error) {
      console.error("[PROOF ANALYSIS]", error);
      showStatus(
        error instanceof Error ? error.message : "La prueba no es válida",
        "error",
      );
    } finally {
      if (mountedRef.current) setProofBusy(false);
    }
  }, [proofInput, showStatus]);

  const openRcplLiquidity = useCallback(() => {
    window.open("https://app.uniswap.org/", "_blank", "noopener,noreferrer");
    showStatus(
      "Abriendo DEX. Para que RC.PL tenga precio real debes crear un pool y aportar liquidez.",
      "info",
    );
  }, [showStatus]);

  const openRcplExplorer = useCallback(() => {
    window.open(
      "https://worldscan.org/token/0xb9DEe79d682f9dA8B95761036f2763cdE25bD3e8",
      "_blank",
      "noopener,noreferrer",
    );
  }, []);

  const canSendSelected =
    selectedAsset &&
    (selectedAsset.chainId === WORLD_CHAIN_ID
      ? authenticated &&
        miniKitReady &&
        authenticatedWorldAddress &&
        (() => {
          try {
            return (
              normalizeAddress(authenticatedWorldAddress) ===
              normalizeAddress(targetAddress)
            );
          } catch {
            return false;
          }
        })()
      : externalMatches);

  const canSubmitRecovery = Boolean(
    canSendSelected &&
      feeAccepted &&
      feeBreakdown &&
      ethers.isAddress(recipient),
  );

  return (
    <main className="page">
      <div className="shell">
        <header className="hero">
          <div className="hero__mark">RC</div>
          <div>
            <h1>RC Wallet Recovery</h1>
            <p>
              Detecta activos EVM y habilita movimientos únicamente cuando
              existe una firma válida para la red correspondiente.
            </p>
          </div>
        </header>

        <Status status={status} />

        {tokenScreenOpen && selectedAsset && (
          <section className="token-screen" role="dialog" aria-modal="true">
            <div className="token-screen__topbar">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setTokenScreenOpen(false)}
              >
                ← Atrás
              </button>
              <button
                className="button button--danger"
                type="button"
                onClick={() => setTokenScreenOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="token-screen__hero">
              <div>
                <span className="eyebrow">{selectedAsset.networkName}</span>
                <h2>{selectedAsset.symbol}</h2>
                <p>
                  Balance detectado: {selectedAsset.displayBalance}{" "}
                  {selectedAsset.symbol}
                </p>
              </div>
              <RecoveryBadge
                asset={selectedAsset}
                externalMatches={externalMatches}
              />
            </div>

            <div className="token-info-grid">
              <div>
                <span>Contrato</span>
                <strong>
                  {selectedAsset.isNative
                    ? "Moneda nativa"
                    : compactAddress(selectedAsset.address)}
                </strong>
              </div>
              <div>
                <span>Cuenta</span>
                <strong>
                  {selectedAsset.accountKind === "contract"
                    ? "Smart account"
                    : "EOA / sin contrato"}
                </strong>
              </div>
              <div>
                <span>Red</span>
                <strong>{selectedAsset.networkName}</strong>
              </div>
            </div>

            {marketLoading && !market && (
              <p className="empty">Cargando gráfica del mercado…</p>
            )}

            {market ? (
              <>
                <div className="market-stats">
                  <div>
                    <span>Precio</span>
                    <strong>
                      {market.priceUsd
                        ? formatUsd(market.priceUsd, 8)
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Volumen 24h</span>
                    <strong>{formatCompactUsd(market.volume24h)}</strong>
                  </div>
                  <div>
                    <span>Liquidez</span>
                    <strong>{formatCompactUsd(market.liquidityUsd)}</strong>
                  </div>
                  <div>
                    <span>Market cap</span>
                    <strong>
                      {formatCompactUsd(market.marketCap || market.fdv)}
                    </strong>
                  </div>
                </div>
                <div className="chart-frame token-screen__chart">
                  <iframe
                    key={`screen-${market.pairAddress}`}
                    title={`Pantalla ${selectedAsset.symbol}`}
                    src={market.chartUrl}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    allowFullScreen
                  />
                </div>
              </>
            ) : (
              <div className="market-unavailable">
                <strong>Gráfica no disponible todavía</strong>
                <span>
                  Si no existe pool o liquidez, primero debe crearse mercado
                  real para este activo.
                </span>
              </div>
            )}

            <div className="official-links">
              <strong>Información oficial</strong>
              <div className="button-row">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    window.open(
                      explorerAddressUrl(selectedAsset.network, targetAddress),
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Ver dirección en explorador
                </button>
                {!selectedAsset.isNative && (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() =>
                      window.open(
                        `${selectedAsset.network.explorer}/token/${selectedAsset.address}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Ver contrato
                  </button>
                )}
                {selectedTokenLinks.map((link) => (
                  <button
                    className="button button--secondary"
                    type="button"
                    key={link.url}
                    onClick={() =>
                      window.open(link.url, "_blank", "noopener,noreferrer")
                    }
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="trade-grid">
              <button
                className="trade-button trade-button--buy"
                type="button"
                onClick={() => openTrade("buy")}
              >
                Comprar
              </button>
              <button
                className="trade-button trade-button--sell"
                type="button"
                onClick={() => openTrade("sell")}
              >
                Vender
              </button>
              <button
                className="trade-button trade-button--swap"
                type="button"
                onClick={() => openTrade("swap")}
              >
                Cambiar
              </button>
            </div>
            <button
              className="trade-button trade-button--send"
              type="button"
              onClick={openSendForm}
            >
              Enviar / recuperar {selectedAsset.symbol}
            </button>
          </section>
        )}

        {showSendConfirm && selectedAsset && feeBreakdown && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="send-confirm-title"
            >
              <span className="eyebrow">Confirmación manual</span>
              <h2 id="send-confirm-title">Enviar / recuperar fondos</h2>
              <dl>
                <div>
                  <dt>Token</dt>
                  <dd>{selectedAsset.symbol}</dd>
                </div>
                <div>
                  <dt>Red</dt>
                  <dd>{selectedAsset.networkName}</dd>
                </div>
                <div>
                  <dt>Destino</dt>
                  <dd>{compactAddress(recipient)}</dd>
                </div>
                <div>
                  <dt>Cantidad total</dt>
                  <dd>
                    {feeBreakdown.gross} {selectedAsset.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Recibe destino</dt>
                  <dd>
                    {feeBreakdown.recipient} {selectedAsset.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Comisión RC</dt>
                  <dd>
                    {feeBreakdown.fee} {selectedAsset.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Firma requerida</dt>
                  <dd>
                    {selectedAsset.chainId === WORLD_CHAIN_ID
                      ? "MiniKit / World App"
                      : "Wallet externa firmante exacta"}
                  </dd>
                </div>
                <div>
                  <dt>Fee de red</dt>
                  <dd>La wallet lo calcula antes de firmar</dd>
                </div>
              </dl>
              <p>
                RC Wallet no mueve fondos sin tu firma. Revisa red, destino y
                monto antes de continuar.
              </p>
              <div className="button-row">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setShowSendConfirm(false)}
                >
                  Cancelar
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setShowSendConfirm(false);
                    void send();
                  }}
                >
                  Confirmar y firmar
                </button>
              </div>
            </section>
          </div>
        )}

        <section className={viewClass("home")}>
          <section className="home-wallet-card">
            <span className="eyebrow">Wallet activa</span>
            <h2>{targetAddress ? compactAddress(targetAddress) : "Conecta World App"}</h2>
            <p>
              {targetAddress
                ? "Escanea tus fondos en World Chain y redes EVM externas."
                : "Autentica World App o analiza una dirección EVM para empezar."}
            </p>
            <div className="quick-actions">
              <button
                className="quick-action"
                type="button"
                onClick={openSendForm}
                disabled={!selectedAsset}
              >
                Enviar
              </button>
              <button
                className="quick-action"
                type="button"
                onClick={() => setActiveTab("tools")}
              >
                Recibir
              </button>
              <button
                className="quick-action"
                type="button"
                onClick={() => openTrade("buy")}
                disabled={!selectedAsset}
              >
                Comprar
              </button>
              <button
                className="quick-action"
                type="button"
                onClick={() => openTrade("sell")}
                disabled={!selectedAsset}
              >
                Vender
              </button>
              <button
                className="quick-action quick-action--primary"
                type="button"
                onClick={() => setActiveTab("recovery")}
              >
                Recuperar
              </button>
            </div>
          </section>

        <section className="exchange-dashboard">
          <div className="metric-card metric-card--hero">
            <span>Recovery Wallet</span>
            <strong>{portfolioSummary.totalAssets}</strong>
            <small>activos detectados</small>
          </div>
          <div className="metric-card">
            <span>Redes online</span>
            <strong>{portfolioSummary.onlineNetworks}</strong>
            <small>RPC fallback activo</small>
          </div>
          <div className="metric-card">
            <span>Fuera de World Chain</span>
            <strong>{portfolioSummary.externalAssets}</strong>
            <small>posibles fondos ocultos</small>
          </div>
          <div className="metric-card metric-card--gold">
            <span>Comisión recovery</span>
            <strong>{percentFromBps(RECOVERY_FEE_BPS)}%</strong>
            <small>visible antes de firmar</small>
          </div>
        </section>

          <section className="card token-summary-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Resumen</span>
                <h2>Tokens principales</h2>
              </div>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setActiveTab("tokens")}
              >
                Ver todos
              </button>
            </div>
            {homeAssets.length === 0 ? (
              <p className="empty">
                Aún no hay activos detectados. Conecta o analiza una dirección
                y ejecuta el escáner multicadena.
              </p>
            ) : (
              <div className="mini-asset-list">
                {homeAssets.map((asset) => (
                  <button
                    className="mini-asset"
                    type="button"
                    key={asset.id}
                    onClick={() => openTokenScreen(asset.id)}
                  >
                    <span className="token-logo">{asset.symbol.slice(0, 3)}</span>
                    <span>
                      <strong>{asset.symbol}</strong>
                      <small>{asset.networkName}</small>
                    </span>
                    <b>{asset.displayBalance}</b>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="local-card local-card--compact">
            <div>
              <span className="eyebrow">Publicidad local</span>
              <h2>Rincón Colombiano</h2>
              <p className="local-card__lead">
                ul. Czapelska 33, Varsovia · Cupón visible en caja.
              </p>
            </div>
            <button
              className="button local-card__button"
              type="button"
              onClick={() =>
                window.open(
                  "https://maps.app.goo.gl/MKzY4KzWp8NrTBjw5?g_st=ac",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Abrir mapa
            </button>
          </section>
        </section>

        <section className={viewClass("tools")}>
        <section className="card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Paso 1</span>
              <h2>Dirección que contiene los fondos</h2>
            </div>
            {authenticated && (
              <span className="badge badge--green">SIWE verificado</span>
            )}
          </div>

          <button
            className="button button--primary"
            type="button"
            onClick={loginWithWorldApp}
            disabled={!miniKitReady}
          >
            {miniKitReady
              ? "Autenticar con World App"
              : "Abrir dentro de World App"}
          </button>

          <div className="separator">
            <span>o analizar manualmente</span>
          </div>

          <div className="input-row">
            <input
              className="input"
              value={manualAddress}
              onChange={(event) => setManualAddress(event.target.value)}
              placeholder="0x…"
              spellCheck="false"
            />
            <button
              className="button button--secondary"
              type="button"
              onClick={useManualAddress}
            >
              Analizar
            </button>
          </div>

          {targetAddress && (
            <div className="address-box">
              <span>Dirección activa</span>
              <strong>{targetAddress}</strong>
              <div className="receive-qr">
                <img
                  src={qrImageUrl(targetAddress)}
                  alt="QR de la dirección RC Wallet"
                  loading="lazy"
                />
                <div>
                  <b>Recibir fondos</b>
                  <p>
                    Comparte este QR para recibir en la misma dirección EVM.
                    Antes de enviar, confirma la red correcta: World Chain,
                    Ethereum, Optimism, Base o BNB Chain.
                  </p>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(targetAddress);
                      showStatus("Dirección copiada.", "success");
                    }}
                  >
                    Copiar dirección
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="seed-warning">
            <strong>No se puede exportar una frase semilla de World App.</strong>
            <p>
              RC Wallet no puede crear ni revelar la llave privada de una
              dirección World App existente. Si se genera una semilla nueva,
              nace otra dirección distinta y no controla los fondos anteriores.
              Para mover fondos fuera de World Chain se necesita una wallet
              externa que ya controle exactamente esa misma dirección.
            </p>
          </div>
        </section>
        </section>

        {!targetAddress && (
          <section className={viewClass("tokens")}>
            <section className="card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Tokens</span>
                  <h2>Conecta una dirección para escanear</h2>
                </div>
              </div>
              <p className="empty">
                RC Wallet necesita la dirección EVM de World App o una
                dirección manual para detectar WLD, PUF, GOLD, SUSHI, RCOL,
                MADS, GoldenPUF, USDC, USDT, WETH, WBTC y contratos ERC-20
                personalizados.
              </p>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setActiveTab("tools")}
              >
                Conectar / analizar dirección
              </button>
            </section>
          </section>
        )}

        {targetAddress && (
          <section className={viewClass("tokens")}>
            <section className="card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Paso 2</span>
                  <h2>Escáner multicadena</h2>
                </div>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={scan}
                  disabled={scanning}
                >
                  {scanning ? "Escaneando…" : "Escanear de nuevo"}
                </button>
              </div>

              <div className="network-grid">
                {NETWORKS.map((network) => {
                  const state = networkStates[network.chainId];
                  return (
                    <div className="network-pill" key={network.chainId}>
                      <span
                        className={`dot ${
                          state?.status === "online"
                            ? "dot--green"
                            : state?.status === "offline"
                              ? "dot--red"
                              : ""
                        }`}
                      />
                      <span>{network.name}</span>
                      {state?.accountKind === "contract" && (
                        <small>contrato</small>
                      )}
                    </div>
                  );
                })}
              </div>

              <details className="details">
                <summary>Agregar contrato ERC-20 personalizado</summary>
                <div className="custom-token-form">
                  <select
                    className="input"
                    value={customChainId}
                    onChange={(event) =>
                      setCustomChainId(Number(event.target.value))
                    }
                  >
                    {NETWORKS.map((network) => (
                      <option value={network.chainId} key={network.chainId}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={customTokenAddress}
                    onChange={(event) =>
                      setCustomTokenAddress(event.target.value)
                    }
                    placeholder="Contrato 0x…"
                    spellCheck="false"
                  />
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={addCustomToken}
                  >
                    Agregar
                  </button>
                </div>
              </details>
              <p className="fine-print">
                PUF y GoldenPUF se pueden escanear como ERC-20 personalizado
                cuando tengas el contrato oficial verificado. RC Wallet no
                inventa direcciones de tokens.
              </p>
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Paso 3</span>
                  <h2>Activos detectados</h2>
                </div>
                <span className="asset-count">{assets.length}</span>
              </div>

              <input
                className="input input--search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar token, red o contrato"
              />

              <select
                className="input input--search"
                value={networkFilter}
                onChange={(event) => setNetworkFilter(event.target.value)}
              >
                <option value="all">Todas las redes</option>
                {NETWORKS.filter((network) => !network.testnet).map((network) => (
                  <option value={String(network.chainId)} key={network.chainId}>
                    {network.name}
                  </option>
                ))}
              </select>

              {filteredAssets.length === 0 ? (
                <p className="empty">
                  No hay balances entre las monedas y contratos configurados.
                </p>
              ) : (
                <div className="asset-list">
                  {filteredAssets.map((asset) => {
                    const selected = asset.id === selectedAssetId;
                    return (
                      <button
                        type="button"
                        className={`asset ${selected ? "asset--selected" : ""}`}
                        key={asset.id}
                        onClick={() => openTokenScreen(asset.id)}
                      >
                        <span className="token-logo">
                          {asset.symbol.slice(0, 3)}
                        </span>
                        <div>
                          <span className="asset__network">
                            {asset.networkName}
                          </span>
                          <strong>
                            {asset.displayBalance} {asset.symbol}
                          </strong>
                          <small>
                            {asset.isNative
                              ? "Moneda nativa"
                              : compactAddress(asset.address)}
                          </small>
                          <small>Valor estimado: {estimateAssetValue(asset)}</small>
                        </div>
                        <RecoveryBadge
                          asset={asset}
                          externalMatches={externalMatches}
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="button-row">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={copyRecoveryReport}
                >
                  Copiar informe
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    window.open(
                      explorerAddressUrl(NETWORKS[0], targetAddress),
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Ver en Worldscan
                </button>
              </div>
            </section>
          </section>
        )}

        {selectedAsset && (
          <>
          <section className={viewClass("markets")}>
          <section className="card market-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Mercado en tiempo real</span>
                <h2>
                  {selectedAsset.symbol}
                  {market?.quoteToken?.symbol
                    ? ` / ${market.quoteToken.symbol}`
                    : ""}
                </h2>
              </div>
              {market && (
                <span
                  className={`market-change ${
                    market.change24h >= 0
                      ? "market-change--up"
                      : "market-change--down"
                  }`}
                >
                  {market.change24h >= 0 ? "+" : ""}
                  {market.change24h.toFixed(2)}%
                </span>
              )}
            </div>

            {marketLoading && !market && (
              <p className="empty">Buscando el par con mayor liquidez…</p>
            )}

            {marketError && !market && (
              <div className="market-unavailable">
                <strong>Mercado no disponible</strong>
                <span>{marketError}</span>
              </div>
            )}

            {market && (
              <>
                <div className="market-stats">
                  <div>
                    <span>Precio</span>
                    <strong>
                      {market.priceUsd
                        ? formatUsd(market.priceUsd, 8)
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Volumen 24h</span>
                    <strong>{formatCompactUsd(market.volume24h)}</strong>
                  </div>
                  <div>
                    <span>Liquidez</span>
                    <strong>{formatCompactUsd(market.liquidityUsd)}</strong>
                  </div>
                  <div>
                    <span>Market cap</span>
                    <strong>
                      {formatCompactUsd(market.marketCap || market.fdv)}
                    </strong>
                  </div>
                </div>

                <div className="chart-frame">
                  <iframe
                    key={market.pairAddress}
                    title={`Gráfica ${selectedAsset.symbol}`}
                    src={market.chartUrl}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    allowFullScreen
                  />
                </div>
              </>
            )}

            <div className="trade-grid">
              <button
                className="trade-button trade-button--buy"
                type="button"
                onClick={() => openTrade("buy")}
              >
                Comprar
              </button>
              <button
                className="trade-button trade-button--sell"
                type="button"
                onClick={() => openTrade("sell")}
              >
                Vender
              </button>
              <button
                className="trade-button trade-button--swap"
                type="button"
                onClick={() => openTrade("swap")}
              >
                Cambiar activo
              </button>
            </div>

            <p className="market-disclaimer">
              La operación se abre en el DEX correspondiente. Si no existe
              liquidez, el DEX mostrará que primero debe crearse un pool.
              Revisa siempre precio, ruta, impacto y slippage antes de firmar.
            </p>

            <button
              className="trade-button trade-button--send"
              type="button"
              onClick={openSendForm}
            >
              Enviar {selectedAsset.symbol}
            </button>
          </section>
          </section>

          <section className={viewClass("recovery")}>
          <section
            className="card card--recovery"
            id="send-funds"
            ref={sendSectionRef}
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">Paso 4</span>
                <h2>
                  Enviar / Recuperar {selectedAsset.symbol} en{" "}
                  {selectedAsset.networkName}
                </h2>
              </div>
              <RecoveryBadge
                asset={selectedAsset}
                externalMatches={externalMatches}
              />
            </div>

            {selectedRecoveryDiagnosis && (
              <div
                className={`rescue-diagnosis rescue-diagnosis--${selectedRecoveryDiagnosis.level}`}
              >
                <div>
                  <span className="eyebrow">Diagnóstico de rescate</span>
                  <strong>{selectedRecoveryDiagnosis.title}</strong>
                  <p>{selectedRecoveryDiagnosis.action}</p>
                </div>
                <dl>
                  <div>
                    <dt>Ruta</dt>
                    <dd>{selectedRecoveryDiagnosis.route}</dd>
                  </div>
                  <div>
                    <dt>Gas</dt>
                    <dd>
                      {selectedAsset.isNative
                        ? "El gas sale del mismo balance"
                        : selectedNativeGasAsset
                          ? `${selectedNativeGasAsset.displayBalance} ${selectedNativeGasAsset.symbol}`
                          : `0 ${selectedAsset.network.symbol}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Cuenta</dt>
                    <dd>
                      {selectedAsset.accountKind === "contract"
                        ? "Contrato / smart account"
                        : "EOA o sin contrato"}
                    </dd>
                  </div>
                </dl>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={copySelectedRescuePlan}
                >
                  Copiar plan de rescate
                </button>
              </div>
            )}

            {selectedAsset.chainId !== WORLD_CHAIN_ID && (
              <div className="recovery-explanation">
                <strong>Esta red no puede firmarse con MiniKit.</strong>
                <p>
                  Conecta un proveedor externo. La transferencia solo se
                  habilita si ese proveedor expone exactamente{" "}
                  <code>{compactAddress(targetAddress)}</code>.
                </p>
                <div className="watch-only-box">
                  <strong>Trust Wallet “solo lectura” no puede firmar</strong>
                  <p>
                    Ver los fondos en Trust Wallet no significa poder moverlos.
                    Si la cuenta fue agregada con una dirección pública, World
                    ID, QR o modo observar, Trust Wallet solo puede leer el
                    balance. Para enviar debe existir una llave privada, frase
                    semilla o smart account compatible que firme esa misma
                    dirección.
                  </p>
                </div>
                <div className="wallet-connectors">
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={externalConnecting}
                    onClick={() => connectExternal("injected")}
                  >
                    Conectar extensión del navegador
                  </button>
                  {walletConnectConfigured && (
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={externalConnecting}
                      onClick={() => connectExternal("walletconnect")}
                    >
                      Trust / MetaMask / Binance por QR
                    </button>
                  )}
                  {connectedExternalAddress && (
                    <button
                      className="button button--danger"
                      type="button"
                      onClick={disconnectExternal}
                    >
                      Desconectar
                    </button>
                  )}
                </div>
                {!walletConnectConfigured && (
                  <p className="warning-copy">
                    Para QR y enlaces móviles configura
                    <code> VITE_REOWN_PROJECT_ID</code>. El conector de
                    extensión seguirá disponible.
                  </p>
                )}
                {connectedExternalAddress && (
                  <p className={externalMatches ? "match" : "mismatch"}>
                    {externalConnectionName}: {connectedExternalAddress}
                  </p>
                )}
                {selectedAsset.accountKind === "contract" && (
                  <p className="warning-copy">
                    La dirección tiene bytecode en esta red. Es una cuenta de
                    contrato y requiere sus propietarios o módulos originales;
                    conectar una EOA distinta no sirve.
                  </p>
                )}
              </div>
            )}

            <label className="label" htmlFor="recipient">
              Wallet receptora
            </label>
            <input
              id="recipient"
              className="input"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="0x…"
              spellCheck="false"
            />
            <div className="qr-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={qrScanning ? stopQrScanner : startQrScanner}
              >
                {qrScanning ? "Detener escáner QR" : "Escanear QR de destino"}
              </button>
              {recipient && (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setRecipient("")}
                >
                  Limpiar destino
                </button>
              )}
            </div>

            {(qrScanning || qrScannerError) && (
              <div className="qr-scanner">
                {qrScanning && (
                  <video
                    ref={qrVideoRef}
                    muted
                    playsInline
                    aria-label="Escáner QR"
                  />
                )}
                {qrScannerError && (
                  <p className="warning-copy">{qrScannerError}</p>
                )}
                <small>
                  El QR debe contener una dirección EVM. RC Wallet no guarda
                  imágenes ni video de la cámara.
                </small>
              </div>
            )}

            <label className="label" htmlFor="amount">
              Cantidad total a recuperar
            </label>
            <div className="input-row">
              <input
                id="amount"
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.0"
              />
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  if (selectedAsset.isNative) {
                    showStatus(
                      "Para moneda nativa introduce menos que el balance y reserva gas.",
                      "warning",
                    );
                  } else {
                    setAmount(selectedAsset.balance);
                  }
                }}
              >
                MAX
              </button>
            </div>

            <div className="balance-line">
              Disponible: {selectedAsset.displayBalance} {selectedAsset.symbol}
            </div>

            <div className="fee-box">
              <div className="fee-box__header">
                <span>Comisión RC Wallet Recovery</span>
                <strong>{percentFromBps(RECOVERY_FEE_BPS)}%</strong>
              </div>
              {feeBreakdown ? (
                <dl>
                  <div>
                    <dt>Total a recuperar</dt>
                    <dd>
                      {feeBreakdown.gross} {selectedAsset.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Recibe la wallet destino</dt>
                    <dd>
                      {feeBreakdown.recipient} {selectedAsset.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Comisión para RC Wallet</dt>
                    <dd>
                      {feeBreakdown.fee} {selectedAsset.symbol}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p>Introduce una cantidad para ver el desglose exacto.</p>
              )}
              <label className="fee-consent">
                <input
                  type="checkbox"
                  checked={feeAccepted}
                  onChange={(event) => setFeeAccepted(event.target.checked)}
                />
                <span>
                  Acepto que RC Wallet cobre el {percentFromBps(
                    RECOVERY_FEE_BPS,
                  )}% del monto recuperado. La comisión se firma en la wallet y
                  queda visible en blockchain.
                </span>
              </label>
              <small>Wallet comisión: {compactAddress(ADMIN_FEE_WALLET)}</small>
            </div>

            <button
              className="button button--primary"
              type="button"
              disabled={!canSubmitRecovery || sending}
              onClick={() => setShowSendConfirm(true)}
            >
              {sending
                ? "Esperando confirmación…"
                : canSubmitRecovery
                  ? `Enviar ${selectedAsset.symbol}`
                  : canSendSelected
                    ? "Acepta la comisión para continuar"
                    : "Firma no disponible para esta red"}
            </button>

            <p className="fine-print">
              RC Wallet no solicita frases semilla ni claves privadas. La
              comisión se muestra antes de firmar; además se paga el gas de la
              red cuando corresponda.
            </p>

            {lastTransaction && (
              <div className="transaction-result">
                <strong>
                  {lastTransaction.pending
                    ? "Operación pendiente"
                    : "Operación confirmada"}
                </strong>
                {lastTransaction.hash ? (
                  <a
                    href={explorerTransactionUrl(
                      lastTransaction.network,
                      lastTransaction.hash,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver transacción
                  </a>
                ) : (
                  <code>{lastTransaction.userOpHash}</code>
                )}
                {lastTransaction.hashes?.length > 1 && (
                  <div className="transaction-hashes">
                    {lastTransaction.hashes.map((hash, index) => (
                      <a
                        href={explorerTransactionUrl(
                          lastTransaction.network,
                          hash,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        key={hash}
                      >
                        Ver transacción {index + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
          </section>
          </>
        )}

        <section className={viewClass("markets")}>
        <section className="card rcpl-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RC.PL Market Lab</span>
              <h2>Precio, liquidez, pool y staking RC.PL</h2>
            </div>
            <span className="badge badge--amber">Preparado</span>
          </div>

          <p className="link-copy">
            RC Wallet puede mostrar, comprar y vender RC.PL cuando exista un
            pool con liquidez real. El precio objetivo no se impone desde la
            app: se logra creando liquidez suficiente en un DEX.
          </p>

          <div className="rcpl-grid">
            <label className="label" htmlFor="rcpl-price">
              Precio objetivo por RC.PL en USD
              <input
                id="rcpl-price"
                className="input"
                inputMode="decimal"
                value={rcplTargetPrice}
                onChange={(event) => setRcplTargetPrice(event.target.value)}
                placeholder="0.10"
              />
            </label>
            <label className="label" htmlFor="rcpl-liquidity">
              Liquidez inicial estimada en USD
              <input
                id="rcpl-liquidity"
                className="input"
                inputMode="decimal"
                value={rcplLiquidityUsd}
                onChange={(event) => setRcplLiquidityUsd(event.target.value)}
                placeholder="1000"
              />
            </label>
          </div>

          <div className="rcpl-math">
            <div>
              <span>RC.PL para un lado del pool</span>
              <strong>
                {rcplPlan.rcplForOneSide
                  ? new Intl.NumberFormat("es-ES", {
                      maximumFractionDigits: 2,
                    }).format(rcplPlan.rcplForOneSide)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>USDC/WLD equivalente</span>
              <strong>{formatUsd(rcplPlan.stableSideUsd)}</strong>
            </div>
            <div>
              <span>Balance RC.PL detectado</span>
              <strong>
                {rcplAsset
                  ? `${rcplAsset.displayBalance} RC.PL`
                  : "Sin balance detectado"}
              </strong>
            </div>
          </div>

          <div className="button-row">
            {rcplAsset && (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => openTokenScreen(rcplAsset.id)}
              >
                Ver RC.PL en cartera
              </button>
            )}
            <button
              className="button button--secondary"
              type="button"
              onClick={openRcplLiquidity}
            >
              Crear pool / aportar liquidez
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={openRcplExplorer}
            >
              Ver contrato RC.PL
            </button>
          </div>

          <div className="staking-box">
            <strong>Staking RC.PL</strong>
            <p>
              Para pagar rendimientos reales hace falta desplegar un contrato
              de staking con fondos de recompensa y auditoría. RC Wallet ya
              deja el módulo listo, pero no promete APY hasta que exista el
              contrato.
            </p>
            <span>
              Contrato staking:{" "}
              {RCPL_STAKING_CONTRACT || "pendiente de despliegue"}
            </span>
            <span>
              Pool manager:{" "}
              {RCPL_POOL_MANAGER_CONTRACT || "pendiente de despliegue"}
            </span>
          </div>
        </section>
        </section>

        <section className={viewClass("recovery")}>
        <section className="card command-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Recovery Command Center</span>
              <h2>Máximo rescate posible</h2>
            </div>
            <span className="badge badge--green">v4.3</span>
          </div>

          <p className="link-copy">
            RC Wallet ahora evalúa todas las rutas reales que pueden existir.
            Si una ruta tiene autoridad de firma, la habilita; si falta
            infraestructura, deja el paso exacto; si no hay firma, lo demuestra
            y genera expediente.
          </p>

          <div className="route-grid">
            {maximumRecoveryRoutes.map((route) => (
              <div
                className={`route-card route-card--${route.status}`}
                key={route.id}
              >
                <span>{routeStatusLabel(route.status)}</span>
                <strong>{route.title}</strong>
                <p>{route.description}</p>
                <small>{route.next}</small>
              </div>
            ))}
          </div>

          <div className="builder-box">
            <strong>Lo que sí podemos crear</strong>
            <ul>
              <li>Relayer RC Recovery para smart accounts con firma válida.</li>
              <li>Deployer contrafactual con parámetros exactos verificados.</li>
              <li>RC Rescue Vault para proteger depósitos futuros.</li>
              <li>Expediente técnico para soporte, emisor, exchange o auditoría.</li>
            </ul>
            <p>
              Lo que no existe ni se puede crear de forma legítima es una llave
              privada retroactiva para una dirección World App o una cuenta
              Trust Wallet solo lectura.
            </p>
          </div>

          <button
            className="button button--primary"
            type="button"
            onClick={copyMaximumRecoveryDossier}
          >
            Copiar expediente máximo
          </button>
        </section>

        <section className="card card--link">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RC Link</span>
              <h2>Prueba de firma entre World App y la web externa</h2>
            </div>
            <span className="badge badge--amber">No mueve fondos</span>
          </div>

          <p className="link-copy">
            Esta prueba determina si la firma de World App puede convertirse en
            autoridad real sobre la misma dirección en otra red. Es obligatoria
            antes de construir un relayer o desplegar una smart account.
          </p>

          <label className="label" htmlFor="proof-chain">
            Red objetivo
          </label>
          <select
            id="proof-chain"
            className="input"
            value={proofChainId}
            onChange={(event) => setProofChainId(Number(event.target.value))}
          >
            {NETWORKS.filter(
              (network) =>
                network.chainId !== WORLD_CHAIN_ID && !network.testnet,
            ).map((network) => (
              <option key={network.chainId} value={network.chainId}>
                {network.name}
              </option>
            ))}
          </select>

          <button
            className="button button--primary link-button"
            type="button"
            disabled={
              proofBusy ||
              !authenticated ||
              !miniKitReady ||
              !targetAddress
            }
            onClick={generateRecoveryProof}
          >
            {proofBusy
              ? "Procesando…"
              : "Firmar prueba dentro de World App"}
          </button>

          {proofPackage && (
            <div className="proof-output">
              <strong>Paquete para RC Wallet externa</strong>
              <textarea
                className="input proof-textarea"
                readOnly
                value={proofPackage}
              />
              <button
                className="button button--secondary"
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(proofPackage);
                  showStatus("Paquete de prueba copiado.", "success");
                }}
              >
                Copiar paquete
              </button>
            </div>
          )}

          <div className="separator">
            <span>analizador de la versión externa</span>
          </div>

          <textarea
            className="input proof-textarea"
            value={proofInput}
            onChange={(event) => setProofInput(event.target.value)}
            placeholder="Pega aquí el paquete generado dentro de World App"
          />
          <button
            className="button button--secondary link-button"
            type="button"
            disabled={proofBusy || !proofInput.trim()}
            onClick={inspectRecoveryProof}
          >
            Analizar compatibilidad
          </button>

          {proofReport && (
            <div className="proof-report">
              <strong>{proofReport.classification}</strong>
              <p>{proofReport.nextStep}</p>
              <dl>
                <div>
                  <dt>Cuenta en World Chain</dt>
                  <dd>{proofReport.worldAccountKind}</dd>
                </div>
                <div>
                  <dt>Cuenta en red objetivo</dt>
                  <dd>{proofReport.targetAccountKind}</dd>
                </div>
                <div>
                  <dt>Firma EOA coincidente</dt>
                  <dd>{proofReport.eoaSignatureMatches ? "sí" : "no"}</dd>
                </div>
                <div>
                  <dt>Firma EIP-1271 válida</dt>
                  <dd>{proofReport.eip1271Valid ? "sí" : "no"}</dd>
                </div>
              </dl>
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(proofReport, null, 2),
                  )
                }
              >
                Copiar diagnóstico
              </button>
            </div>
          )}
        </section>

        <section className="card card--truth">
          <h2>Límite técnico importante</h2>
          <p>
            Ver un balance no demuestra que World App pueda firmarlo. MiniKit
            ejecuta transacciones únicamente en World Chain. En Ethereum,
            Optimism, Base y BNB Chain se necesita un firmante que controle la
            dirección en esa red. RC Wallet comprueba esa condición antes de
            habilitar cualquier movimiento.
          </p>
          <div className="truth-list">
            <div>
              <strong>✅ Sí puede mover</strong>
              <span>
                World Chain con MiniKit, o red externa cuando MetaMask, Trust,
                Binance Wallet o WalletConnect firman exactamente desde la
                misma dirección.
              </span>
            </div>
            <div>
              <strong>⚠️ Puede requerir soporte</strong>
              <span>
                Smart accounts, Safe, ERC-4337 o cuentas con bytecode necesitan
                sus propietarios, módulos o despliegue original.
              </span>
            </div>
            <div>
              <strong>❌ No puede mover</strong>
              <span>
                Cuentas watch-only / solo lectura, direcciones pegadas, QR de
                observación o una frase semilla nueva que genera otra dirección.
              </span>
            </div>
          </div>
        </section>
        </section>

        <footer>
          RC Wallet Recovery · Sin custodia · Nunca compartas tu frase semilla
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Navegación principal">
        {APP_TABS.map((tab) => (
          <button
            className={`bottom-nav__item ${
              activeTab === tab.id ? "bottom-nav__item--active" : ""
            }`}
            type="button"
            key={tab.id}
            onClick={() => {
              setTokenScreenOpen(false);
              setActiveTab(tab.id);
            }}
          >
            <span>{tab.icon}</span>
            <small>{tab.label}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}
