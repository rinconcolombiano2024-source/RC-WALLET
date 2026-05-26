import React, {
  useEffect,
  useState,
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
    ],
  },
];

const TOKENS = [
  {
    symbol: "WLD",
    decimals: 18,

    addresses: {
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",

      8453:
        "0x163f8C2467924be0ae7B5347228CABF260318753",
    },
  },

  {
    symbol: "USDC",
    decimals: 6,

    addresses: {
      1: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",

      10: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",

      56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",

      8453:
        "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
    },
  },
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",

  "function decimals() view returns (uint8)",

  "function symbol() view returns (string)",

  "function name() view returns (string)",
];

export default function App() {
  const [status, setStatus] =
    useState(
      "Inicializando RC Wallet..."
    );

  const [wallet, setWallet] =
    useState("");

  const [provider, setProvider] =
    useState(null);

  const [network, setNetwork] =
    useState("");

  const [nativeBalance, setNativeBalance] =
    useState("0");

  const [tokens, setTokens] =
    useState([]);

  const [selectedNetwork, setSelectedNetwork] =
    useState("");

  useEffect(() => {
    initializeMiniKit();
  }, []);

  async function initializeMiniKit() {
    try {
      setStatus(
        "Inicializando MiniKit..."
      );

      MiniKit.install();

      await new Promise((resolve) =>
        setTimeout(resolve, 4000)
      );

      const installed =
        MiniKit.isInstalled();

      console.log(
        "MiniKit:",
        installed
      );

      const ethereum =
        await waitForEthereum();

      if (!ethereum) {
        setStatus(
          "Provider World App no detectado"
        );

        return;
      }

      setupListeners(ethereum);

      const savedWallet =
        localStorage.getItem(
          "rc_wallet_address"
        );

      if (savedWallet) {
        await connectWallet();
      } else {
        setStatus(
          "RC Wallet listo para conectar"
        );
      }

    } catch (err) {
      console.error(err);

      setStatus(
        "Error inicializando MiniKit"
      );
    }
  }

  async function waitForEthereum() {
    for (let i = 0; i < 30; i++) {

      if (
        typeof window !== "undefined" &&
        window.ethereum
      ) {
        console.log(
          "Provider encontrado"
        );

        return window.ethereum;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 1000)
      );
    }

    return null;
  }

  function setupListeners(ethereum) {
    if (!ethereum?.on) return;

    ethereum.on(
      "accountsChanged",
      async (accounts) => {
        if (accounts?.length) {
          const address =
            accounts[0];

          setWallet(address);

          localStorage.setItem(
            "rc_wallet_address",
            address
          );

          await scanAllNetworks(
            address
          );
        }
      }
    );

    ethereum.on(
      "chainChanged",
      async () => {
        window.location.reload();
      }
    );
  }

  async function connectWallet() {
    try {
      setStatus(
        "Conectando wallet..."
      );

      const ethereum =
        await waitForEthereum();

      if (!ethereum) {
        setStatus(
          "Provider Ethereum no encontrado"
        );

        return;
      }

      const accounts =
        await ethereum.request({
          method: "eth_requestAccounts",
        });

      if (!accounts?.length) {
        setStatus(
          "No se encontraron cuentas"
        );

        return;
      }

      const address = accounts[0];

      setWallet(address);

      localStorage.setItem(
        "rc_wallet_address",
        address
      );

      const ethersProvider =
        new ethers.BrowserProvider(
          ethereum
        );

      setProvider(ethersProvider);

      const net =
        await ethersProvider.getNetwork();

      setNetwork(
        `${net.name} (${net.chainId})`
      );

      setSelectedNetwork(
        Number(net.chainId)
      );

      const balance =
        await ethersProvider.getBalance(
          address
        );

      setNativeBalance(
        Number(
          ethers.formatEther(balance)
        ).toFixed(4)
      );

      setStatus(
        "Wallet conectada correctamente"
      );

      await scanAllNetworks(address);

    } catch (err) {
      console.error(err);

      setStatus(
        err?.message ||
          "Error conectando wallet"
      );
    }
  }

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

            if (!rpcProvider)
              return;

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

                address:
                  "Native Coin",
              });
            }

            await Promise.all(
              TOKENS.map(async (token) => {
                try {
                  const tokenAddress =
                    token.addresses[
                      net.chainId
                    ];

                  if (!tokenAddress)
                    return;

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

                      address:
                        tokenAddress,
                    });
                  }

                } catch (err) {
                  console.log(
                    "Token error:",
                    token.symbol
                  );
                }
              })
            );

          } catch (err) {
            console.log(
              "Network error:",
              net.name
            );
          }
        })
      );

      setTokens(foundTokens);

      localStorage.setItem(
        "rc_wallet_tokens",
        JSON.stringify(foundTokens)
      );

      setStatus(
        "Escaneo multi-chain completado"
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "15px",
        }}
      >
        <img
          src="https://i.imgur.com/Xd8N7xB.png"
          alt="logo"
          width="70"
          style={{
            borderRadius: "50%",
            animation:
              "spin 12s linear infinite",
          }}
        />

        <h1
          style={{
            fontSize: "50px",
            margin: 0,
          }}
        >
          RC Wallet
        </h1>
      </div>

      <h2
        style={{
          marginTop: "20px",
        }}
      >
        Recovery Multi-Chain Wallet
      </h2>

      <button
        onClick={connectWallet}
        style={{
          padding: "18px",
          fontSize: "22px",
          borderRadius: "18px",
          border: "none",
          marginTop: "20px",
          cursor: "pointer",
          width: "100%",
        }}
      >
        Conectar Wallet
      </button>

      <hr
        style={{
          margin: "30px 0",
        }}
      />

      <h2>Estado</h2>

      <p>{status}</p>

      <h2>Wallet</h2>

      <p
        style={{
          wordBreak: "break-all",
        }}
      >
        {wallet || "No conectada"}
      </p>

      <h2>Red Actual</h2>

      <p>{network || "-"}</p>

      <h2>Balance Nativo</h2>

      <p>{nativeBalance}</p>

      <hr
        style={{
          margin: "30px 0",
        }}
      />

      <h2>
        Cambiar Red
      </h2>

      <select
        value={selectedNetwork}
        onChange={(e) => {
          setSelectedNetwork(
            e.target.value
          );

          switchNetwork(
            e.target.value
          );
        }}
        style={{
          width: "100%",
          padding: "15px",
          borderRadius: "10px",
          marginTop: "10px",
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

      <hr
        style={{
          margin: "30px 0",
        }}
      />

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
              background:
                "#1111aa",

              padding: "15px",

              borderRadius:
                "15px",

              marginBottom:
                "15px",
            }}
          >
            <p>
              <b>Token:</b>{" "}
              {token.symbol}
            </p>

            <p>
              <b>Balance:</b>{" "}
              {token.balance}
            </p>

            <p>
              <b>Red:</b>{" "}
              {token.network}
            </p>

            <p
              style={{
                wordBreak:
                  "break-all",

                fontSize:
                  "12px",
              }}
            >
              {token.address}
            </p>
          </div>
        )
      )}

      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
}
