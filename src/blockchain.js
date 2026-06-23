import { ethers } from "ethers";
import { ERC20_ABI, NETWORKS, TOKENS } from "./config.js";

const providerCache = new Map();

function timeout(promise, milliseconds, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label}: tiempo de espera agotado`)),
      milliseconds,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function normalizeAddress(address) {
  if (!ethers.isAddress(address)) {
    throw new Error("La dirección EVM no es válida");
  }
  return ethers.getAddress(address);
}

export function formatBalance(rawBalance, decimals, digits = 6) {
  const value = ethers.formatUnits(rawBalance, decimals);
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, digits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export async function getProvider(network) {
  if (providerCache.has(network.chainId)) {
    return providerCache.get(network.chainId);
  }

  for (const rpcUrl of network.rpcUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(
        rpcUrl,
        network.chainId,
        {
          staticNetwork: true,
          batchMaxCount: 1,
        },
      );
      const providerNetwork = await timeout(
        provider.getNetwork(),
        7_000,
        network.name,
      );

      if (Number(providerNetwork.chainId) !== network.chainId) {
        throw new Error("El RPC respondió con una chainId distinta");
      }

      await timeout(provider.getBlockNumber(), 7_000, network.name);
      providerCache.set(network.chainId, provider);
      return provider;
    } catch (error) {
      console.warn(`[RPC] ${network.name}: ${rpcUrl}`, error);
    }
  }

  throw new Error(`No hay un RPC disponible para ${network.name}`);
}

async function readToken(provider, network, owner, definition) {
  const rawAddress = definition.addresses?.[network.chainId];
  if (!rawAddress) return null;

  const address = normalizeAddress(rawAddress);
  const code = await timeout(
    provider.getCode(address),
    7_000,
    `${definition.symbol} bytecode`,
  );
  if (!code || code === "0x") return null;

  const contract = new ethers.Contract(address, ERC20_ABI, provider);
  const [rawBalance, decimalsValue, symbolValue] = await Promise.all([
    timeout(
      contract.balanceOf(owner),
      7_000,
      `${definition.symbol} balance`,
    ),
    timeout(
      contract.decimals(),
      7_000,
      `${definition.symbol} decimals`,
    ),
    timeout(contract.symbol(), 7_000, `${definition.symbol} symbol`),
  ]);

  if (rawBalance === 0n) return null;

  const decimals = Number(decimalsValue);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`${definition.symbol} devolvió decimales inválidos`);
  }

  return {
    id: `${network.chainId}:${address.toLowerCase()}`,
    network,
    chainId: network.chainId,
    networkName: network.name,
    address,
    isNative: false,
    symbol:
      typeof symbolValue === "string" && symbolValue.trim()
        ? symbolValue.trim()
        : definition.symbol,
    configuredSymbol: definition.symbol,
    decimals,
    rawBalance,
    balance: ethers.formatUnits(rawBalance, decimals),
    displayBalance: formatBalance(rawBalance, decimals),
    projectToken: Boolean(definition.projectToken),
    customToken: Boolean(definition.customToken),
  };
}

async function scanNetwork(network, owner, customTokens) {
  const provider = await getProvider(network);
  const accountCode = await timeout(
    provider.getCode(owner),
    7_000,
    `${network.name} account code`,
  );
  const accountKind =
    accountCode && accountCode !== "0x" ? "contract" : "no-contract";

  const assets = [];
  const nativeBalance = await timeout(
    provider.getBalance(owner),
    7_000,
    `${network.name} native balance`,
  );

  if (nativeBalance > 0n) {
    assets.push({
      id: `${network.chainId}:native`,
      network,
      chainId: network.chainId,
      networkName: network.name,
      address: null,
      isNative: true,
      symbol: network.symbol,
      configuredSymbol: network.symbol,
      decimals: 18,
      rawBalance: nativeBalance,
      balance: ethers.formatEther(nativeBalance),
      displayBalance: formatBalance(nativeBalance, 18),
      accountKind,
    });
  }

  const definitions = [
    ...TOKENS.filter((token) => token.addresses?.[network.chainId]),
    ...customTokens
      .filter((token) => token.chainId === network.chainId)
      .map((token) => ({
        symbol: token.symbol || "CUSTOM",
        customToken: true,
        addresses: { [network.chainId]: token.address },
      })),
  ];

  const results = await Promise.allSettled(
    definitions.map((definition) =>
      readToken(provider, network, owner, definition),
    ),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      assets.push({ ...result.value, accountKind });
    } else if (result.status === "rejected") {
      console.warn(`[TOKEN] ${network.name}`, result.reason);
    }
  }

  return {
    network,
    accountKind,
    assets,
  };
}

export async function scanAllNetworks(ownerAddress, customTokens = []) {
  const owner = normalizeAddress(ownerAddress);
  const results = await Promise.allSettled(
    NETWORKS.map((network) => scanNetwork(network, owner, customTokens)),
  );

  const assets = [];
  const networks = {};

  results.forEach((result, index) => {
    const network = NETWORKS[index];
    if (result.status === "fulfilled") {
      assets.push(...result.value.assets);
      networks[network.chainId] = {
        status: "online",
        accountKind: result.value.accountKind,
      };
    } else {
      networks[network.chainId] = {
        status: "offline",
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "No se pudo consultar la red",
      };
    }
  });

  const uniqueAssets = [...new Map(
    assets.map((asset) => [asset.id, asset]),
  ).values()];

  uniqueAssets.sort((left, right) => {
    if (left.chainId === 480 && right.chainId !== 480) return -1;
    if (right.chainId === 480 && left.chainId !== 480) return 1;
    if (left.chainId !== right.chainId) return left.chainId - right.chainId;
    return left.symbol.localeCompare(right.symbol);
  });

  return { owner, assets: uniqueAssets, networks };
}

export async function switchExternalNetwork(provider, network) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainHex }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: network.chainHex,
          chainName: network.name,
          nativeCurrency: {
            name: network.symbol,
            symbol: network.symbol,
            decimals: 18,
          },
          rpcUrls: network.rpcUrls,
          blockExplorerUrls: [network.explorer],
        },
      ],
    });
  }
}

export async function sendWithExternalWallet({
  provider,
  asset,
  targetAddress,
  recipient,
  amount,
  feeRecipient,
  feeAmountUnits = 0n,
}) {
  if (!provider?.request) {
    throw new Error("La conexión externa no expone un proveedor EIP-1193");
  }

  const owner = normalizeAddress(targetAddress);
  const destination = normalizeAddress(recipient);
  if (owner === destination) {
    throw new Error("La dirección de destino es igual a la dirección origen");
  }

  await switchExternalNetwork(provider, asset.network);
  const browserProvider = new ethers.BrowserProvider(provider);
  const signer = await browserProvider.getSigner();
  const signerAddress = normalizeAddress(await signer.getAddress());

  if (signerAddress !== owner) {
    throw new Error(
      "La wallet conectada no controla la dirección donde están los fondos",
    );
  }

  const amountUnits = ethers.parseUnits(amount, asset.decimals);
  if (amountUnits <= 0n) {
    throw new Error("La cantidad debe ser mayor que cero");
  }
  if (amountUnits > asset.rawBalance) {
    throw new Error("La cantidad supera el balance detectado");
  }
  const feeUnits = BigInt(feeAmountUnits);
  if (feeUnits < 0n || feeUnits >= amountUnits) {
    throw new Error("La comisión calculada no es válida");
  }
  const recipientAmountUnits = amountUnits - feeUnits;
  if (recipientAmountUnits <= 0n) {
    throw new Error("El monto neto para el usuario debe ser mayor que cero");
  }
  const normalizedFeeRecipient =
    feeUnits > 0n && feeRecipient ? normalizeAddress(feeRecipient) : null;

  const transactions = [];
  if (asset.isNative) {
    const transaction = await signer.sendTransaction({
      to: destination,
      value: recipientAmountUnits,
    });
    transactions.push(transaction);

    if (normalizedFeeRecipient) {
      const feeTransaction = await signer.sendTransaction({
        to: normalizedFeeRecipient,
        value: feeUnits,
      });
      transactions.push(feeTransaction);
    }
  } else {
    const contract = new ethers.Contract(asset.address, ERC20_ABI, signer);
    const transaction = await contract.transfer(
      destination,
      recipientAmountUnits,
    );
    transactions.push(transaction);

    if (normalizedFeeRecipient) {
      const feeTransaction = await contract.transfer(
        normalizedFeeRecipient,
        feeUnits,
      );
      transactions.push(feeTransaction);
    }
  }

  const receipts = [];
  for (const transaction of transactions) {
    receipts.push(await transaction.wait(1));
  }

  return {
    hash: transactions[0]?.hash ?? null,
    hashes: transactions.map((transaction) => transaction.hash),
    receipt: receipts[0] ?? null,
    receipts,
  };
}
