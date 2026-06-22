export const NETWORKS = [
  {
    chainId: 480,
    name: "World Chain",
    network: "worldchain",
    explorer: "https://worldscan.org",
    rpc: "https://worldchain-mainnet.g.alchemy.com/public",
    testnet: false,
  },
  {
    chainId: 1,
    name: "Ethereum",
    network: "ethereum",
    explorer: "https://etherscan.io",
    rpc: "https://ethereum-rpc.publicnode.com",
    testnet: false,
  },
  {
    chainId: 10,
    name: "Optimism",
    network: "optimism",
    explorer: "https://optimistic.etherscan.io",
    rpc: "https://mainnet.optimism.io",
    testnet: false,
  },
  {
    chainId: 8453,
    name: "Base",
    network: "base",
    explorer: "https://basescan.org",
    rpc: "https://mainnet.base.org",
    testnet: false,
  },
  {
    chainId: 56,
    name: "BNB Chain",
    network: "binance",
    explorer: "https://bscscan.com",
    rpc: "https://bsc-dataseed.bnbchain.org",
    testnet: false,
  },
];

export const WORLD_CHAIN_ID = 480;

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];
