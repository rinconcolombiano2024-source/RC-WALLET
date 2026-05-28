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
    hex: "0x1",
    symbol: "ETH",
    rpc: [
      "https://ethereum-rpc.publicnode.com",
      "https://rpc.ankr.com/eth",
    ],
  },

  {
    name: "Optimism",
    chainId: 10,
    hex: "0xa",
    symbol: "ETH",
    rpc: [
      "https://mainnet.optimism.io",
      "https://rpc.ankr.com/optimism",
    ],
  },

  {
    name: "BNB Chain",
    chainId: 56,
    hex: "0x38",
    symbol: "BNB",
    rpc: [
      "https://bsc-dataseed.binance.org",
      "https://rpc.ankr.com/bsc",
    ],
  },

  {
    name: "Base",
    chainId: 8453,
    hex: "0x2105",
    symbol: "ETH",
    rpc: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
    ],
  },

  {
    name: "World Chain",
    chainId: 480,
    hex: "0x1e0",
    symbol: "ETH",
    rpc: [
      "https://worldchain-mainnet.g.alchemy.com/public",
      "https://worldchain.drpc.org",
    ],
  },
];

const TOKENS = [
  {
    symbol: "WLD",
    decimals: 18,

    addresses: {
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",

      10: "0x163f8C2467924be0ae7B5347228CABF260318753",

      480: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
    },
  },

  {
    symbol: "USDC",
    decimals: 6,

    addresses: {
      1: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",

      10: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",

      56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",

      8453: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
    },
  },

  {
    symbol: "USDT",
    decimals: 6,

    addresses: {
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",

      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",

      56: "0x55d398326f99059fF775485246999027B3197955",

      8453: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
  },
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
];

export default function App() {
  const mountedRef = useRef(true);

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

  const [selectedToken, setSelectedToken] =
    useState(null);

  const [recipient, setRecipient] =
    useState("");

  const [sendAmount, setSendAmount] =
    useState("");

  const [sending, setSending] =
    useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      initialize();
    }, 1500);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
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
          if (
            !MiniKit.isInstalled()
          ) {
            MiniKit.install();
          }
        } catch (err) {
          console.log(
            "MiniKit warning"
          );
        }

        const ethereum =
          await waitForEthereum();

        if (!ethereum) {
          setStatus(
            "Esperando World App..."
          );

          return;
        }

        setupListeners(
          ethereum
        );

        let accounts = [];

        try {
          accounts =
            await ethereum.request({
              method:
                "eth_accounts",
            });
        } catch (err) {
          console.log(
            "eth_accounts error"
          );
        }

        if (
          !accounts ||
          accounts.length === 0
        ) {
          try {
            accounts =
              await ethereum.request({
                method:
                  "eth_requestAccounts",
              });
          } catch (err) {
            setStatus(
              "Conexión cancelada"
            );

            return;
          }
        }

        if (
          !accounts ||
          accounts.length === 0
        ) {
          setStatus(
            "Wallet no detectada"
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
          currentNetwork.name +
            " (" +
            currentNetwork.chainId +
            ")"
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
            "Error inicializando wallet"
        );
      }
    }, []);

  async function waitForEthereum() {
    for (
      let i = 0;
      i < 40;
      i++
    ) {
      try {
        if (
          typeof window !==
          "undefined"
        ) {
          if (
            window?.ethereum
          ) {
            return window.ethereum;
          }

          if (
            window?.MiniKit
              ?.ethereum
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

  async function switchNetwork(
    chainId
  ) {
    try {
      const ethereum =
        await waitForEthereum();

      if (!ethereum)
        return false;

      const network =
        NETWORKS.find(
          (n) =>
            n.chainId ===
            chainId
        );

      if (!network)
        return false;

      try {
        await ethereum.request({
          method:
            "wallet_switchEthereumChain",

          params: [
            {
              chainId:
                network.hex,
            },
          ],
        });

        return true;
      } catch (switchError) {
        if (
          switchError.code ===
          4902
        ) {
          await ethereum.request({
            method:
              "wallet_addEthereumChain",

            params: [
              {
                chainId:
                  network.hex,

                chainName:
                  network.name,

                nativeCurrency:
                  {
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

          return true;
        }

        return false;
      }
    } catch (err) {
      return false;
    }
  }

  function setupListeners(
    ethereum
  ) {
    if (!ethereum?.on)
      return;

    try {
      ethereum.removeListener?.(
        "accountsChanged",
        () => {}
      );

      ethereum.removeListener?.(
        "chainChanged",
        () => {}
      );
    } catch (err) {
      console.log(
        "Listener cleanup"
      );
    }

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
            Number(
              formattedNative
            ) > 0
          ) {
            foundTokens.push({
              network:
                net.name,

              symbol:
                net.symbol,

              balance:
                formattedNative,

              chainId:
                net.chainId,

              isNative:
                true,
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

                  chainId:
                    net.chainId,

                  isNative:
                    false,
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

  async function sendToken() {
    try {
      if (!selectedToken) {
        setStatus(
          "Seleccione un token"
        );

        return;
      }

      if (
        !recipient ||
        !ethers.isAddress(
          recipient
        )
      ) {
        setStatus(
          "Dirección inválida"
        );

        return;
      }

      if (
        !sendAmount ||
        Number(sendAmount) <= 0
      ) {
        setStatus(
          "Cantidad inválida"
        );

        return;
      }

      const ethereum =
        await waitForEthereum();

      if (!ethereum) {
        setStatus(
          "World App no detectado"
        );

        return;
      }

      setSending(true);

      const switched =
        await switchNetwork(
          selectedToken.chainId
        );

      if (!switched) {
        setStatus(
          "No se pudo cambiar la red"
        );

        return;
      }

      const provider =
        new ethers.BrowserProvider(
          ethereum
        );

      const signer =
        await provider.getSigner();

      if (
        selectedToken.isNative
      ) {
        setStatus(
          "Confirme envío en World App..."
        );

        const tx =
          await signer.sendTransaction(
            {
              to:
                recipient,

              value:
                ethers.parseEther(
                  sendAmount
                ),
            }
          );

        await tx.wait();
      } else {
        const tokenData =
          TOKENS.find(
            (t) =>
              t.symbol ===
              selectedToken.symbol
          );

        if (!tokenData) {
          setStatus(
            "Token no soportado"
          );

          return;
        }

        const tokenAddress =
          tokenData.addresses[
            selectedToken.chainId
          ];

        const contract =
          new ethers.Contract(
            tokenAddress,
            ERC20_ABI,
            signer
          );

        setStatus(
          "Confirme envío en World App..."
        );

        const tx =
          await contract.transfer(
            recipient,

            ethers.parseUnits(
              sendAmount,
              tokenData.decimals
            )
          );

        await tx.wait();
      }

      setStatus(
        "Transferencia completada"
      );

      await scanAllNetworks(
        wallet
      );

      setSendAmount("");
      setRecipient("");
    } catch (err) {
      console.error(err);

      if (
        err?.code ===
        "ACTION_REJECTED"
      ) {
        setStatus(
          "Transacción cancelada"
        );
      } else {
        setStatus(
          err?.message ||
            "Error enviando token"
        );
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        background:
          "linear-gradient(to bottom, #05058C, #02024d)",

        minHeight:
          "100vh",

        color:
          "white",

        padding:
          "20px",

        fontFamily:
          "Arial",
      }}
    >
      <div
        style={{
          background:
            "#1616a8",

          borderRadius:
            "24px",

          padding:
            "25px",

          marginBottom:
            "25px",

          border:
            "1px solid rgba(255,255,255,0.15)",

          boxShadow:
            "0 0 25px rgba(0,0,0,0.4)",
        }}
      >
        <h1
          style={{
            fontSize:
              "54px",

            margin:
              "0",

            fontWeight:
              "bold",

            background:
              "linear-gradient(90deg,#FFD700,#2f7bff,#ff003c)",

            WebkitBackgroundClip:
              "text",

            WebkitTextFillColor:
              "transparent",
          }}
        >
          RC Wallet
        </h1>

        <h2
          style={{
            color:
              "#FFD700",

            marginTop:
              "10px",
          }}
        >
          Recovery Multi-Chain Wallet
        </h2>
      </div>

      <h2>Estado</h2>
      <p>{status}</p>

      <h2>Wallet</h2>
      <p>
        {wallet ||
          "No conectada"}
      </p>

      <h2>Red Actual</h2>
      <p>{network || "-"}</p>

      <h2>Balance Nativo</h2>
      <p>{nativeBalance}</p>

      <h2>
        Fondos Detectados
      </h2>

      {tokens.length === 0 && (
        <p>
          No se encontraron fondos
        </p>
      )}

      {tokens.map(
        (
          token,
          index
        ) => (
          <div
            key={index}
            style={{
              border:
                "1px solid rgba(255,255,255,0.2)",

              padding:
                "15px",

              marginBottom:
                "15px",

              borderRadius:
                "10px",

              background:
                "rgba(255,255,255,0.05)",
            }}
          >
            <p>
              Token:{" "}
              {token.symbol}
            </p>

            <p>
              Balance:{" "}
              {token.balance}
            </p>

            <p>
              Red:{" "}
              {token.network}
            </p>

            <button
              onClick={() => {
                setSelectedToken(
                  token
                );

                setSendAmount(
                  token.balance
                );
              }}
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginTop:
                  "10px",

                border:
                  "none",

                borderRadius:
                  "12px",

                fontWeight:
                  "bold",

                background:
                  "linear-gradient(90deg,#FFD700,#2f7bff,#ff003c)",

                color:
                  "white",
              }}
            >
              Seleccionar
            </button>
          </div>
        )
      )}

      {selectedToken && (
        <div
          style={{
            border:
              "1px solid rgba(255,255,255,0.2)",

            padding:
              "15px",

            borderRadius:
              "10px",

            marginTop:
              "20px",

            background:
              "rgba(255,255,255,0.05)",
          }}
        >
          <h2>
            Enviar Fondos
          </h2>

          <p>
            Token:{" "}
            {
              selectedToken.symbol
            }
          </p>

          <p>
            Red:{" "}
            {
              selectedToken.network
            }
          </p>

          <input
            type="text"
            placeholder="Dirección destino"
            value={recipient}
            onChange={(e) =>
              setRecipient(
                e.target.value
              )
            }
            style={{
              width:
                "100%",

              padding:
                "12px",

              marginBottom:
                "10px",

              borderRadius:
                "10px",

              border:
                "none",
            }}
          />

          <input
            type="number"
            value={sendAmount}
            onChange={(e) =>
              setSendAmount(
                e.target.value
              )
            }
            style={{
              width:
                "100%",

              padding:
                "12px",

              marginBottom:
                "10px",

              borderRadius:
                "10px",

              border:
                "none",
            }}
          />

          <button
            onClick={
              sendToken
            }
            disabled={sending}
            style={{
              width:
                "100%",

              padding:
                "14px",

              border:
                "none",

              borderRadius:
                "12px",

              fontWeight:
                "bold",

              background:
                "linear-gradient(90deg,#FFD700,#2f7bff,#ff003c)",

              color:
                "white",
            }}
          >
            {sending
              ? "Enviando..."
              : "Enviar Fondos"}
          </button>
        </div>
      )}
    </div>
  );
}
