export const WORLD_CHAIN_ID = 480;

export const ADMIN_FEE_WALLET = "0x0BbbD8Eba77Db629721ccDfa0c57a9EE107fdb85";
export const RECOVERY_FEE_BPS = 200n;
export const BPS_DENOMINATOR = 10_000n;

export const RCPL_TOKEN_ADDRESS = "0xb9DEe79d682f9dA8B95761036f2763cdE25bD3e8";
export const RCPL_TARGET_PRICE_KEY = "rc_wallet_rcpl_target_price_v1";
export const RCPL_STAKING_CONTRACT = "";
export const RCPL_POOL_MANAGER_CONTRACT = "";

export const NETWORKS = Object.freeze([
  {
    name: "World Chain",
    chainId: 480,
    chainHex: "0x1e0",
    symbol: "ETH",
    rpcUrls: [
      "https://worldchain-mainnet.g.alchemy.com/public",
    ],
    explorer: "https://worldscan.org",
    writableWithMiniKit: true,
  },
  {
    name: "Ethereum",
    chainId: 1,
    chainHex: "0x1",
    symbol: "ETH",
    rpcUrls: [
      "https://ethereum-rpc.publicnode.com",
      "https://cloudflare-eth.com",
    ],
    explorer: "https://etherscan.io",
    writableWithMiniKit: false,
  },
  {
    name: "Optimism",
    chainId: 10,
    chainHex: "0xa",
    symbol: "ETH",
    rpcUrls: [
      "https://mainnet.optimism.io",
      "https://optimism-rpc.publicnode.com",
    ],
    explorer: "https://optimistic.etherscan.io",
    writableWithMiniKit: false,
  },
  {
    name: "Base",
    chainId: 8453,
    chainHex: "0x2105",
    symbol: "ETH",
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
    ],
    explorer: "https://basescan.org",
    writableWithMiniKit: false,
  },
  {
    name: "BNB Chain",
    chainId: 56,
    chainHex: "0x38",
    symbol: "BNB",
    rpcUrls: [
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc-rpc.publicnode.com",
    ],
    explorer: "https://bscscan.com",
    writableWithMiniKit: false,
  },
  {
    name: "World Chain Sepolia",
    chainId: 4801,
    chainHex: "0x12c1",
    symbol: "ETH",
    rpcUrls: [
      "https://worldchain-sepolia.g.alchemy.com/public",
    ],
    explorer: "https://sepolia.worldscan.org",
    writableWithMiniKit: false,
    testnet: true,
  },
]);

export const TOKENS = Object.freeze([
  {
    symbol: "RC.PL",
    expectedDecimals: 18,
    projectToken: true,
    addresses: {
      480: RCPL_TOKEN_ADDRESS,
    },
  },
  {
    symbol: "WLD",
    expectedDecimals: 18,
    addresses: {
      480: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
      10: "0xdC6fF44d5d932CBD77b52E5612Ba0529DC6226F1",
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",
    },
  },
  {
    symbol: "USDC",
    expectedDecimals: 6,
    addresses: {
      480: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
      10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      4801: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
    },
  },
  {
    symbol: "USDT",
    expectedDecimals: 6,
    addresses: {
      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
  },
  {
    symbol: "WBTC",
    expectedDecimals: 8,
    addresses: {
      480: "0x03C7054bcb39f7b2e5B2c7AcB37583e32D70Cfa3",
    },
  },
  {
    symbol: "WETH",
    expectedDecimals: 18,
    addresses: {
      480: "0x4200000000000000000000000000000000000006",
    },
  },
]);

export const ERC20_ABI = Object.freeze([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 value) returns (bool)",
]);
