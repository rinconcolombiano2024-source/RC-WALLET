import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { base, bsc, mainnet, optimism } from "wagmi/chains";
import { defineChain } from "viem";

export const worldchain = defineChain({
  id: 480,
  name: "World Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://worldchain-mainnet.g.alchemy.com/public"],
    },
  },
  blockExplorers: {
    default: {
      name: "Worldscan",
      url: "https://worldscan.org",
    },
  },
});

export const worldchainSepolia = defineChain({
  id: 4801,
  name: "World Chain Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://worldchain-sepolia.g.alchemy.com/public"],
    },
  },
  blockExplorers: {
    default: {
      name: "Worldscan Sepolia",
      url: "https://sepolia.worldscan.org",
    },
  },
  testnet: true,
});

export const supportedExternalChains = [
  mainnet,
  optimism,
  base,
  bsc,
  worldchain,
  worldchainSepolia,
];

export const reownProjectId =
  import.meta.env.VITE_REOWN_PROJECT_ID?.trim() ?? "";
export const walletConnectConfigured = Boolean(reownProjectId);

const origin =
  typeof window === "undefined" ? "https://example.com" : window.location.origin;

const metadata = {
  name: "RC Wallet Recovery",
  description:
    "Detección y recuperación asistida de activos EVM para usuarios de World App.",
  url: origin,
  icons: [`${origin}/rc-wallet-icon.svg`],
};

const connectors = [
  injected({
    shimDisconnect: true,
  }),
];

if (walletConnectConfigured) {
  connectors.push(
    walletConnect({
      projectId: reownProjectId,
      metadata,
      showQrModal: true,
      isNewChainsStale: false,
      qrModalOptions: {
        themeMode: "dark",
      },
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: supportedExternalChains,
  connectors,
  transports: {
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
    [optimism.id]: http("https://mainnet.optimism.io"),
    [base.id]: http("https://mainnet.base.org"),
    [bsc.id]: http("https://bsc-dataseed.bnbchain.org"),
    [worldchain.id]: http(
      "https://worldchain-mainnet.g.alchemy.com/public",
    ),
    [worldchainSepolia.id]: http(
      "https://worldchain-sepolia.g.alchemy.com/public",
    ),
  },
});
