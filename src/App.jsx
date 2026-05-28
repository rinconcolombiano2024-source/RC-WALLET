import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
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

const TOKENS = [
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

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

export default function App() {

  const mountedRef =
    useRef(true);

  const [status, setStatus] =
    useState(
      "Inicializando RC Wallet..."
    );

  const [loading, setLoading] =
    useState(false);

  const [wallet, setWallet] =
    useState("");

  const [network, setNetwork] =
    useState("");

  const [nativeBalance, setNativeBalance] =
    useState("0");

  const [tokens, setTokens] =
    useState([]);

  useEffect(() => {

    initialize();

    return () => {
      mountedRef.current = false;
    };

  }, []);

  const initialize =
    useCallback(async () => {

      try {

        if (
          typeof window ===
          "undefined"
        ) {
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

    }, []);

  async function waitForEthereum() {

    for (let i = 0; i < 40; i++) {

      try {

        if (
          typeof window !==
          "undefined"
        ) {

          if (
            window.ethereum
          ) {
            return window.ethereum;
          }

          if (
            window?.MiniKit?.ethereum
          ) {
            return window.MiniKit.ethereum;
          }
        }

      } catch (err) {

        console.log(
          "Provider waiting..."
        );
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            1000
          )
      );
    }

    return null;
  }

  function setupListeners(
    ethereum
  ) {

    if (!ethereum?.on)
      return;

    ethereum.removeAllListeners?.(
      "accountsChanged"
    );

    ethereum.removeAllListeners?.(
      "chainChanged"
    );

    ethereum.on(
      "accountsChanged",
      async (accounts) => {

        if (
          accounts?.length
        ) {

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

        setLoading(true);

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

        if (
          !accounts?.length
        ) {

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

        const balance =
          await provider.getBalance(
            address
          );

        setNativeBalance(
          Number(
            ethers.formatEther(
              balance
            )
          ).toFixed(4)
        );

        await scanAllNetworks(
          address
        );

        setStatus(
          "Wallet conectada"
        );

      } catch (err) {

        console.error(err);

        setStatus(
          err?.message ||
          "Error conectando wallet"
        );

      } finally {

        setLoading(false);
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

        await Promise.race([

          provider.getBlockNumber(),

          new Promise(
            (_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      "RPC timeout"
                    )
                  ),
                4000
              )
          ),
        ]);

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

      const foundTokens = [];

      for (const net of NETWORKS) {

        try {

          const rpcProvider =
            await getWorkingProvider(
              net.rpc
            );

          if (!rpcProvider)
            continue;

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
                Number(
                  formatted
                ) > 0
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
      }

      if (
        mountedRef.current
      ) {

        setTokens(
          foundTokens
        );

        setStatus(
          "Escaneo completado"
        );
      }

    } catch (err) {

      console.error(err);

      setStatus(
        "Error escaneando redes"
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
        disabled={loading}
      >

        {loading
          ? "Conectando..."
          : "Conectar Wallet"}

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
              border:
                "1px solid rgba(255,255,255,0.2)",
              padding: "10px",
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
