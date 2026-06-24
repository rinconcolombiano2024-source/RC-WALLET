import EthereumProvider from "@walletconnect/ethereum-provider";
import { normalizeAddress } from "./blockchain.js";
import { NETWORKS } from "./config.js";

export const reownProjectId =
  import.meta.env.VITE_REOWN_PROJECT_ID?.trim() ?? "";

export const walletConnectConfigured = Boolean(reownProjectId);

function normalizeChainId(chainId) {
  if (typeof chainId === "number") return chainId;
  if (typeof chainId === "string" && chainId.startsWith("0x")) {
    return Number.parseInt(chainId, 16);
  }
  return Number(chainId);
}

function firstAccount(provider) {
  const accounts = provider?.accounts ?? [];
  return accounts[0] ? normalizeAddress(accounts[0]) : "";
}

function attachProviderListeners(provider, handlers = {}) {
  const onAccountsChanged = (accounts) => {
    const account = accounts?.[0];
    handlers.onAccount?.(account ? normalizeAddress(account) : "");
  };
  const onChainChanged = (chainId) => {
    handlers.onChain?.(normalizeChainId(chainId));
  };
  const onDisconnect = () => {
    handlers.onDisconnect?.();
  };

  provider.on?.("accountsChanged", onAccountsChanged);
  provider.on?.("chainChanged", onChainChanged);
  provider.on?.("disconnect", onDisconnect);

  return () => {
    provider.removeListener?.("accountsChanged", onAccountsChanged);
    provider.removeListener?.("chainChanged", onChainChanged);
    provider.removeListener?.("disconnect", onDisconnect);
  };
}

export async function connectInjectedProvider(handlers) {
  const provider = window.ethereum;
  if (!provider?.request) {
    throw new Error(
      "No se detectó MetaMask, Trust Wallet, Rabby, Coinbase Wallet, Binance Wallet u otra wallet EVM",
    );
  }

  const accounts = await provider.request({
    method: "eth_requestAccounts",
  });
  const chainId = await provider.request({
    method: "eth_chainId",
  });

  return {
    type: "injected",
    name: "Wallet del navegador",
    provider,
    account: normalizeAddress(accounts?.[0] ?? ""),
    chainId: normalizeChainId(chainId),
    cleanup: attachProviderListeners(provider, handlers),
  };
}

export async function connectWalletConnectProvider(handlers) {
  if (!walletConnectConfigured) {
    throw new Error(
      "Configura VITE_REOWN_PROJECT_ID para usar WalletConnect",
    );
  }

  const origin = window.location.origin;
  const provider = await EthereumProvider.init({
    projectId: reownProjectId,
    chains: [1],
    optionalChains: NETWORKS.map((network) => network.chainId),
    showQrModal: true,
    metadata: {
      name: "RC Wallet Recovery",
      description:
        "Recuperación asistida de activos EVM para usuarios de World App.",
      url: origin,
      icons: [`${origin}/rc-wallet-icon.svg`],
    },
    rpcMap: Object.fromEntries(
      NETWORKS.map((network) => [
        network.chainId,
        network.rpcUrls[0],
      ]),
    ),
  });

  await provider.connect();

  return {
    type: "walletconnect",
    name: "WalletConnect",
    provider,
    account: firstAccount(provider),
    chainId: normalizeChainId(provider.chainId),
    cleanup: attachProviderListeners(provider, handlers),
  };
}

export async function disconnectExternalProvider(connection) {
  connection?.cleanup?.();
  if (
    connection?.type === "walletconnect" &&
    typeof connection.provider?.disconnect === "function"
  ) {
    await connection.provider.disconnect();
  }
}
