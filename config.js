export const NETWORKS = [
  {
    chainId: 480,
    name: "World Chain",
    symbol: "ETH",
    network: "worldchain",
    explorer: "https://worldscan.org",
    rpcUrls: ["https://worldchain-mainnet.g.alchemy.com/public"],
    chainHex: "0x1e0",
    testnet: false,
  },
  {
    chainId: 1,
    name: "Ethereum",
    symbol: "ETH",
    network: "ethereum",
    explorer: "https://etherscan.io",
    rpcUrls: ["https://ethereum-rpc.publicnode.com"],
    chainHex: "0x1",
    testnet: false,
  },
  {
    chainId: 10,
    name: "Optimism",
    symbol: "ETH",
    network: "optimism",
    explorer: "https://optimistic.etherscan.io",
    rpcUrls: ["https://mainnet.optimism.io"],
    chainHex: "0xa",
    testnet: false,
  },
  {
    chainId: 8453,
    name: "Base",
    symbol: "ETH",
    network: "base",
    explorer: "https://basescan.org",
    rpcUrls: ["https://mainnet.base.org"],
    chainHex: "0x2105",
    testnet: false,
  },
  {
    chainId: 56,
    name: "BNB Chain",
    symbol: "BNB",
    network: "binance",
    explorer: "https://bscscan.com",
    rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
    chainHex: "0x38",
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

export const TOKENS = [
  {
    symbol: "USDC",
    projectToken: false,
    addresses: {
      1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      10: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      8453: "0x833589fCD6eDb6E08f4c7C32D4f71b1566469c3d",
      56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    },
  },
  {
    symbol: "USDT",
    projectToken: false,
    addresses: {
      1: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      8453: "0xfde4C96c8593536E31F26A3d5669F4E228F88B64",
      56: "0x55d398326f99059fF775485246999027B3197955",
    },
  },
  {
    symbol: "DAI",
    projectToken: false,
    addresses: {
      1: "0x6b175474e89094c44da98b954eedeac495271d0f",
      10: "0xDA10009e57fb658751B6d3757cc4e4d20D1789666",
      8453: "0x50c5725949A6F0c72E6C4a641F14DA7493d51404",
      56: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    },
  },
];
