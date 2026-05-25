import React, { useEffect, useState } from "react";
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
    name: "BNB",
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

      8453:
        "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",

      56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    },
  },
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",

  "function transfer(address to, uint amount) returns (bool)",

  "function decimals() view returns (uint8)",

  "function symbol() view returns (string)",

  "function name() view returns (string)",
];

export default function App() {
  const [status, setStatus] =
    useState("Iniciando...");

  const [wallet, setWallet] =
    useState("");

  const [network, setNetwork] =
    useState("");

  const [nativeBalance, setNativeBalance] =
    useState("0");

  const [tokens, setTokens] =
    useState([]);

  const [provider, setProvider] =
    useState(null);

  const [sendTo, setSendTo] =
    useState("");

  const [sendAmount, setSendAmount] =
    useState("");

  const [selectedNetwork, setSelectedNetwork] =
    useState("");

  useEffect(() => {
    autoReconnect();
  }, []);

  async function autoReconnect() {
    const savedWallet =
      localStorage.getItem(
        "rc_wallet_address"
      );

    if (savedWallet) {
      connectWallet();
    } else {
      setStatus(
        "Abra RC Wallet desde World App"
      );
    }
  }

  async function connectWallet() {
    try {
      setStatus("Conectando wallet...");

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      const installed =
        MiniKit.isInstalled();

      if (!installed) {
        setStatus(
          "Abra RC Wallet desde World App"
        );

        return;
      }

      if (!window.ethereum) {
        setStatus(
          "Provider Ethereum no detectado"
        );

        return;
      }

      const miniProvider =
        window.ethereum;

      const accounts =
        await miniProvider.request({
          method: "eth_requestAccounts",
        });

      if (!accounts?.length) {
        setStatus(
          "Wallet no conectada"
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
          miniProvider
        );

      setProvider(ethersProvider);

      const balance =
        await ethersProvider.getBalance(
          address
        );

      setNativeBalance(
        Number(
          ethers.formatEther(balance)
        ).toFixed(4)
      );

      const net =
        await ethersProvider.getNetwork();

      setNetwork(
        `${net.name} (${net.chainId})`
      );

      setSelectedNetwork(
        Number(net.chainId)
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

      for (const net of NETWORKS) {
        try {
          const rpcProvider =
            await getWorkingProvider(
              net.rpc
            );

          if (!rpcProvider) {
            continue;
          }

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
              network: net.name,

              symbol: net.symbol,

              balance:
                formattedNative,

              address:
                "Native Coin",
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
          }

        } catch (err) {
          console.log(
            "Network error:",
            net.name
          );
        }
      }

      setTokens(foundTokens);

      localStorage.setItem(
        "rc_wallet_tokens",
        JSON.stringify(foundTokens)
      );

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
      if (!window.ethereum) return;

      const hexChainId =
        "0x" +
        Number(chainId).toString(16);

      await window.ethereum.request({
        method:
          "wallet_switchEthereumChain",

        params: [
          {
            chainId: hexChainId,
          },
        ],
      });

      setStatus(
        "Red cambiada"
      );

    } catch (err) {
      console.error(err);

      alert(
        "No se pudo cambiar la red"
      );
    }
  }

  async function sendNative() {
    try {
      if (!provider) {
        alert(
          "Wallet no conectada"
        );

        return;
      }

      if (!sendTo) {
        alert(
          "Ingrese dirección"
        );

        return;
      }

      if (!sendAmount) {
        alert(
          "Ingrese cantidad"
        );

        return;
      }

      setStatus(
        "Preparando transacción..."
      );

      const signer =
        await provider.getSigner();

      const feeData =
        await provider.getFeeData();

      console.log(
        "Gas fee:",
        feeData
      );

      const tx =
        await signer.sendTransaction({
          to: sendTo,

          value:
            ethers.parseEther(
              sendAmount
            ),
        });

      setStatus(
        "Esperando confirmación..."
      );

      await tx.wait();

      setStatus(
        "Transferencia completada"
      );

      alert(
        "Fondos enviados correctamente"
      );

    } catch (err) {
      console.error(err);

      alert(
        err?.message ||
          "Error enviando fondos"
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
            fontSize: "55px",
            marginBottom: "10px",
          }}
        >
          RC Wallet
        </h1>
      </div>

      <h2>
        Recuperación Multi-Chain
      </h2>

      <button
        onClick={connectWallet}
        style={{
          padding: "20px",

          fontSize: "25px",

          borderRadius: "20px",

          border: "none",

          marginTop: "20px",

          cursor: "pointer",
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
        {wallet ||
          "No conectada"}
      </p>

      <h2>Red</h2>

      <p>{network || "-"}</p>

      <h2>Balance</h2>

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
          padding: "15px",

          borderRadius: "10px",

          width: "100%",
        }}
      >
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
          No se detectaron fondos
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

      <hr
        style={{
          margin: "30px 0",
        }}
      />

      <h2>
        Enviar Fondos
      </h2>

      <input
        placeholder="Dirección destino"
        value={sendTo}
        onChange={(e) =>
          setSendTo(
            e.target.value
          )
        }
        style={{
          width: "100%",

          padding: "15px",

          marginBottom: "15px",

          borderRadius: "10px",

          border: "none",
        }}
      />

      <input
        placeholder="Cantidad"
        value={sendAmount}
        onChange={(e) =>
          setSendAmount(
            e.target.value
          )
        }
        style={{
          width: "100%",

          padding: "15px",

          marginBottom: "15px",

          borderRadius: "10px",

          border: "none",
        }}
      />

      <button
        onClick={sendNative}
        style={{
          padding: "20px",

          fontSize: "20px",

          borderRadius: "15px",

          border: "none",

          cursor: "pointer",
        }}
      >
        Enviar Fondos
      </button>

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
