import React, {
useEffect,
useState,
useCallback,
} from "react";

import { MiniKit } from "@worldcoin/minikit-js";

import { ethers } from "ethers";

const NETWORKS = [
{
name: "Ethereum",
chainId: 1,
symbol: "ETH",
rpc: [
"https://ethereum-rpc.publicnode.com",
"https://rpc.ankr.com/eth",
],
},

{
name: "Optimism",
chainId: 10,
symbol: "ETH",
rpc: [
"https://mainnet.optimism.io",
"https://rpc.ankr.com/optimism",
],
},

{
name: "BNB Chain",
chainId: 56,
symbol: "BNB",
rpc: [
"https://bsc-dataseed.binance.org",
"https://rpc.ankr.com/bsc",
],
},

{
name: "Base",
chainId: 8453,
symbol: "ETH",
rpc: [
"https://mainnet.base.org",
"https://base-rpc.publicnode.com",
],
},

{
name: "World Chain",
chainId: 480,
symbol: "ETH",
rpc: [
"https://worldchain-mainnet.g.alchemy.com/public",
"https://worldchain.drpc.org",
],
},
];

const ERC20_ABI = [
"function balanceOf(address owner) view returns (uint256)",
];

const TOKENS = [
{
symbol: "WLD",
decimals: 18,
addresses: {
480:
"0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
},
},

{
symbol: "USDC",
decimals: 6,
addresses: {
1:
"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",

  10:
    "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",

  56:
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",

  8453:
    "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
},

},
];

export default function App() {

const [status, setStatus] =
useState(
"Inicializando RC Wallet..."
);

const [wallet, setWallet] =
useState("");

const [network, setNetwork] =
useState("");

const [nativeBalance, setNativeBalance] =
useState("0");

const [tokens, setTokens] =
useState([]);

const [selectedNetwork, setSelectedNetwork] =
useState("");

useEffect(() => {

let mounted = true;

if (mounted) {
  initialize();
}

return () => {
  mounted = false;
};

}, []);

async function initialize() {

try {

  if (typeof window === "undefined") {
    return;
  }

  try {

    MiniKit.install();

  } catch (err) {

    console.log(
      "MiniKit warning"
    );
  }

  const ethereum =
    await waitForEthereum();

  if (!ethereum) {

    setStatus(
      "Abra RC Wallet desde World App"
    );

    return;
  }

  setupListeners(
    ethereum
  );

  setStatus(
    "RC Wallet listo"
  );

} catch (err) {

  console.error(err);

  setStatus(
    "Error inicializando wallet"
  );
}

}

async function waitForEthereum() {

for (let i = 0; i < 20; i++) {

  if (window.ethereum) {
    return window.ethereum;
  }

  await new Promise((resolve) =>
    setTimeout(resolve, 500)
  );
}

return null;

}

function setupListeners(
ethereum
) {

if (!ethereum?.on) return;

ethereum.removeAllListeners?.(
  "accountsChanged"
);

ethereum.removeAllListeners?.(
  "chainChanged"
);

ethereum.on(
  "accountsChanged",
  async (accounts) => {

    if (accounts?.length) {

      const address =
        accounts[0];

      setWallet(address);

      await scanAllNetworks(
        address
      );
    }
  }
);

ethereum.on(
  "chainChanged",
  () => {
    window.location.reload();
  }
);

}

const connectWallet =
useCallback(async () => {

  try {

    setStatus(
      "Conectando wallet..."
    );

    const ethereum =
      await waitForEthereum();

    if (!ethereum) {

      setStatus(
        "World App no detectado"
      );

      return;
    }

    const accounts =
      await ethereum.request({
        method:
          "eth_requestAccounts",
      });

    if (!accounts?.length) {

      setStatus(
        "Wallet no autorizada"
      );

      return;
    }

    const address =
      accounts[0];

    setWallet(address);

    const provider =
      new ethers.BrowserProvider(
        ethereum
      );

    const currentNetwork =
      await provider.getNetwork();

    setNetwork(
      `${currentNetwork.name} (${currentNetwork.chainId})`
    );

    setSelectedNetwork(
      Number(
        currentNetwork.chainId
      )
    );

    const balance =
      await provider.getBalance(
        address
      );

    setNativeBalance(
      Number(
        ethers.formatEther(balance)
      ).toFixed(4)
    );

    setStatus(
      "Wallet conectada"
    );

    await scanAllNetworks(
      address
    );

  } catch (err) {

    console.error(err);

    setStatus(
      err?.message ||
      "Error conectando wallet"
    );
  }

}, []);

async function getWorkingProvider(
rpcList
) {

for (const rpc of rpcList) {

  try {

    const provider =
      new ethers.JsonRpcProvider(
        rpc
      );

    await provider.getBlockNumber();

    return provider;

  } catch (err) {

    console.log(
      "RPC falló:",
      rpc
    );
  }
}

return null;

}

async function scanAllNetworks(
address
) {

try {

  setStatus(
    "Escaneando redes..."
  );

  let foundTokens = [];

  await Promise.all(

    NETWORKS.map(async (net) => {

      try {

        const rpcProvider =
          await getWorkingProvider(
            net.rpc
          );

        if (!rpcProvider) return;

        const nativeBalance =
          await rpcProvider.getBalance(
            address
          );

        const formattedNative =
          Number(
            ethers.formatEther(
              nativeBalance
            )
          ).toFixed(4);

        if (
          Number(formattedNative) > 0
        ) {

          foundTokens.push({
            network:
              net.name,

            symbol:
              net.symbol,

            balance:
              formattedNative,
          });
        }

        for (const token of TOKENS) {

          try {

            const tokenAddress =
              token.addresses[
                net.chainId
              ];

            if (!tokenAddress)
              continue;

            const contract =
              new ethers.Contract(
                tokenAddress,
                ERC20_ABI,
                rpcProvider
              );

            const balance =
              await contract.balanceOf(
                address
              );

            const formatted =
              ethers.formatUnits(
                balance,
                token.decimals
              );

            if (
              Number(formatted) > 0
            ) {

              foundTokens.push({
                network:
                  net.name,

                symbol:
                  token.symbol,

                balance:
                  Number(
                    formatted
                  ).toFixed(4),
              });
            }

          } catch (err) {

            console.log(
              "Token error:",
              token.symbol
            );
          }
        }

      } catch (err) {

        console.log(
          "Network error:",
          net.name
        );
      }
    })
  );

  setTokens(foundTokens);

  setStatus(
    "Escaneo completado"
  );

} catch (err) {

  console.error(err);

  setStatus(
    "Error escaneando redes"
  );
}

}

async function switchNetwork(
chainId
) {

try {

  const ethereum =
    await waitForEthereum();

  if (!ethereum) return;

  try {

    await ethereum.request({

      method:
        "wallet_switchEthereumChain",

      params: [
        {
          chainId:
            "0x" +
            Number(chainId).toString(
              16
            ),
        },
      ],
    });

  } catch (switchError) {

    const network =
      NETWORKS.find(
        (n) =>
          n.chainId ===
          Number(chainId)
      );

    if (!network) return;

    await ethereum.request({

      method:
        "wallet_addEthereumChain",

      params: [
        {
          chainId:
            "0x" +
            Number(chainId).toString(
              16),

          chainName:
            network.name,

          nativeCurrency: {
            name:
              network.symbol,

            symbol:
              network.symbol,

            decimals: 18,
          },

          rpcUrls:
            network.rpc,
        },
      ],
    });
  }

  setStatus(
    "Red cambiada correctamente"
  );

} catch (err) {

  console.error(err);

  setStatus(
    "No se pudo cambiar la red"
  );
}

}

return (

<div
  style={{
    background:
      "linear-gradient(to bottom, #05058C, #02024d)",
    minHeight: "100vh",
    color: "white",
    padding: "20px",
    fontFamily: "Arial",
  }}
>

  <h1>
    RC Wallet
  </h1>

  <button
    onClick={connectWallet}
    style={{
      padding: "15px",
      borderRadius: "10px",
      border: "none",
      cursor: "pointer",
      fontWeight: "bold",
    }}
  >
    Conectar Wallet
  </button>

  <h2>Estado</h2>
  <p>{status}</p>

  <h2>Wallet</h2>
  <p>{wallet || "No conectada"}</p>

  <h2>Red</h2>
  <p>{network || "-"}</p>

  <h2>Balance</h2>
  <p>{nativeBalance}</p>

  <h2>
    Cambiar Red
  </h2>

  <select
    value={selectedNetwork}
    onChange={(e) => {

      const value =
        Number(
          e.target.value
        );

      setSelectedNetwork(
        value
      );

      switchNetwork(value);
    }}
  >

    <option value="">
      Seleccione Red
    </option>

    {NETWORKS.map((net) => (

      <option
        key={net.chainId}
        value={net.chainId}
      >
        {net.name}
      </option>

    ))}
  </select>

  <h2>
    Tokens Detectados
  </h2>

  {tokens.length === 0 && (
    <p>
      No se encontraron fondos
    </p>
  )}

  {tokens.map(
    (token, index) => (

      <div
        key={index}
        style={{
          padding: "10px",
          border:
            "1px solid rgba(255,255,255,0.2)",
          marginBottom: "10px",
          borderRadius: "10px",
        }}
      >

        <p>
          {token.symbol}
        </p>

        <p>
          {token.balance}
        </p>

        <p>
          {token.network}
        </p>

      </div>
    )
  )}

</div>

);
}
