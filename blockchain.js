import { ethers } from "ethers";
import { NETWORKS } from "./config.js";

export function normalizeAddress(address) {
  if (!address || typeof address !== "string") {
    throw new Error("Dirección inválida");
  }
  try {
    return ethers.getAddress(address);
  } catch {
    throw new Error("Dirección no válida");
  }
}

export async function getProvider(network) {
  return new ethers.JsonRpcProvider(network.rpc);
}

export async function scanAllNetworks(address, customTokens = []) {
  const normalized = normalizeAddress(address);
  const assets = [];
  const networks = {};

  for (const network of NETWORKS) {
    try {
      const provider = await getProvider(network);
      const code = await provider.getCode(normalized);
      const accountKind = code !== "0x" ? "contract" : "eoa";

      networks[network.chainId] = {
        status: "online",
        accountKind,
      };

      // Scan native balance
      const balance = await provider.getBalance(normalized);
      if (balance > 0n) {
        assets.push({
          id: `${network.chainId}:native`,
          chainId: network.chainId,
          network: network.name,
          networkName: network.name,
          symbol: "ETH",
          address: null,
          isNative: true,
          decimals: 18,
          rawBalance: balance,
          balance: ethers.formatUnits(balance, 18),
          displayBalance: ethers.formatUnits(balance, 18).slice(0, 10),
          accountKind,
        });
      }

      // Scan ERC20 tokens
      const tokensToScan = [
        { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
        { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
        { symbol: "DAI", address: "0x6b175474e89094c44da98b954eedeac495271d0f" },
        ...(customTokens.filter((t) => t.chainId === network.chainId) || []),
      ];

      for (const token of tokensToScan) {
        try {
          const contract = new ethers.Contract(
            token.address,
            [
              "function balanceOf(address) view returns (uint256)",
              "function decimals() view returns (uint8)",
              "function symbol() view returns (string)",
            ],
            provider,
          );

          const [balance, decimals, symbol] = await Promise.all([
            contract.balanceOf(normalized),
            contract.decimals(),
            contract.symbol(),
          ]);

          if (balance > 0n) {
            assets.push({
              id: `${network.chainId}:${token.address.toLowerCase()}`,
              chainId: network.chainId,
              network: network.name,
              networkName: network.name,
              symbol: symbol || token.symbol,
              address: token.address,
              isNative: false,
              decimals,
              rawBalance: balance,
              balance: ethers.formatUnits(balance, decimals),
              displayBalance: ethers.formatUnits(balance, decimals).slice(0, 10),
              accountKind,
            });
          }
        } catch {
          // Token no disponible en esta red
        }
      }
    } catch (error) {
      networks[network.chainId] = {
        status: "offline",
        error: error instanceof Error ? error.message : "Error",
      };
    }
  }

  return { assets, networks };
}

export async function sendWithExternalWallet({
  provider,
  asset,
  recipient,
  amount,
}) {
  const signer = await provider.getSigner();
  
  if (asset.isNative) {
    const tx = await signer.sendTransaction({
      to: recipient,
      value: ethers.parseUnits(amount, 18),
    });
    return {
      hash: tx.hash,
      pending: false,
    };
  } else {
    const contract = new ethers.Contract(
      asset.address,
      ["function transfer(address to, uint256 amount) returns (bool)"],
      signer,
    );
    const tx = await contract.transfer(
      recipient,
      ethers.parseUnits(amount, asset.decimals),
    );
    return {
      hash: tx.hash,
      pending: false,
    };
  }
}
