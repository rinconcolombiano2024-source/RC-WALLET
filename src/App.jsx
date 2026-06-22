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
  normalizeAddress,
  scanAllNetworks,
  sendWithExternalWallet,
} from "./blockchain.js";
import { ERC20_ABI, NETWORKS, WORLD_CHAIN_ID } from "./config.js";
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

export default function App() {
  const mountedRef = useRef(false);
  const scanIdRef = useRef(0);
  const externalConnectionRef = useRef(null);

  const [miniKitReady, setMiniKitReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [targetAddress, setTargetAddress] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [connectedExternalAddress, setConnectedExternalAddress] =
    useState("");
  const [externalConnectionName, setExternalConnectionName] = useState("");
  const [externalConnecting, setExternalConnecting] = useState(false);
  const [assets, setAssets] = useState([]);
  const [networkStates, setNetworkStates] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [customTokens, setCustomTokens] = useState(readCustomTokens);
  const [customChainId, setCustomChainId] = useState(1);
  const [customTokenAddress, setCustomTokenAddress] = useState("");
  const [search, setSearch] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [proofChainId, setProofChainId] = useState(10);
  const [proofPackage, setProofPackage] = useState("");
  const [proofInput, setProofInput] = useState("");
  const [proofReport, setProofReport] = useState(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [market, setMarket] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [status, setStatus] = useState({
    type: "info",
    message:
      "Conecta World App o introduce una dirección para iniciar el diagnóstico.",
  });

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(query) ||
        asset.networkName.toLowerCase().includes(query),
    );
  }, [assets, search]);

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
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(customTokens));
  }, [customTokens]);

  useEffect(() => {
    setRecipient("");
    setAmount("");
    setLastTransaction(null);
  }, [selectedAssetId]);

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
          "No hay una ruta DEX verificable para este activo.",
          "warning",
        );
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    },
    [market, selectedAsset, showStatus],
  );

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
    async (asset, destination, amountUnits) => {
      if (!authenticated || !miniKitReady) {
        throw new Error(
          "Debes autenticar la misma cuenta dentro de World App",
        );
      }
      if (asset.chainId !== WORLD_CHAIN_ID) {
        throw new Error("MiniKit solo puede enviar transacciones en World Chain");
      }

      const currentAddress = MiniKit.user?.walletAddress;
      if (
        !currentAddress ||
        normalizeAddress(currentAddress) !== normalizeAddress(targetAddress)
      ) {
        throw new Error("La sesión actual de World App no coincide");
      }

      const transaction = asset.isNative
        ? {
            to: destination,
            value: amountUnits.toString(),
            data: "0x",
          }
        : {
            to: asset.address,
            value: "0",
            data: ERC20_INTERFACE.encodeFunctionData("transfer", [
              destination,
              amountUnits,
            ]),
          };

      const result = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [transaction],
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
    [authenticated, miniKitReady, showStatus, targetAddress],
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
          amountUnits,
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
          })),
        };
      }

      setLastTransaction({
        ...result,
        network: selectedAsset.network,
      });
      setRecipient("");
      setAmount("");
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
      externalSigner: connectedExternalAddress || null,
      externalSignerMatches: externalMatches,
      networks: networkStates,
      assets: assets.map((asset) => ({
        network: asset.networkName,
        chainId: asset.chainId,
        accountKind: asset.accountKind,
        symbol: asset.symbol,
        balance: asset.balance,
        tokenAddress: asset.address,
      })),
    };

    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showStatus("Informe de recuperación copiado.", "success");
  }, [
    assets,
    authenticated,
    connectedExternalAddress,
    externalMatches,
    networkStates,
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

  const canSendSelected =
    selectedAsset &&
    (selectedAsset.chainId === WORLD_CHAIN_ID
      ? authenticated && miniKitReady
      : externalMatches);

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
            </div>
          )}
        </section>

        {targetAddress && (
          <>
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
                placeholder="Buscar token o red"
              />

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
                        onClick={() => setSelectedAssetId(asset.id)}
                      >
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
          </>
        )}

        {selectedAsset && (
          <>
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
                  La operación se abre en el DEX correspondiente. Revisa
                  siempre precio, ruta, impacto y slippage antes de firmar.
                  RC Wallet no ejecuta swaps ocultos.
                </p>
              </>
            )}
          </section>

          <section className="card card--recovery">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Paso 4</span>
                <h2>
                  Recuperar {selectedAsset.symbol} en{" "}
                  {selectedAsset.networkName}
                </h2>
              </div>
              <RecoveryBadge
                asset={selectedAsset}
                externalMatches={externalMatches}
              />
            </div>

            {selectedAsset.chainId !== WORLD_CHAIN_ID && (
              <div className="recovery-explanation">
                <strong>Esta red no puede firmarse con MiniKit.</strong>
                <p>
                  Conecta un proveedor externo. La transferencia solo se
                  habilita si ese proveedor expone exactamente{" "}
                  <code>{compactAddress(targetAddress)}</code>.
                </p>
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

            <label className="label" htmlFor="amount">
              Cantidad
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

            <button
              className="button button--primary"
              type="button"
              disabled={!canSendSelected || sending}
              onClick={send}
            >
              {sending
                ? "Esperando confirmación…"
                : canSendSelected
                  ? "Revisar y firmar recuperación"
                  : "Firma no disponible para esta red"}
            </button>

            <p className="fine-print">
              RC Wallet no solicita frases semilla ni claves privadas. La
              aplicación no cobra comisión; solo se paga el gas de la red
              cuando corresponda.
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
              </div>
            )}
          </section>
          </>
        )}

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
        </section>

        <section className="card local-card">
          <span className="eyebrow">Publicidad local</span>
          <h2>Rincón Colombiano en Varsovia</h2>
          <p className="local-card__lead">
            Disfruta auténtica comida colombiana en
            <strong> ul. Czapelska 33, Varsovia</strong>.
          </p>
          <div className="coupon">
            <strong>🎁 Empanada gratis</strong>
            <span>
              Presenta este anuncio en la caja con una compra mínima de 50 zł.
              Un cupón por mesa o visita.
            </span>
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
            📍 Abrir Czapelska 33 en Google Maps
          </button>
        </section>

        <footer>
          RC Wallet Recovery · Sin custodia · Nunca compartas tu frase semilla
        </footer>
      </div>
    </main>
  );
}
