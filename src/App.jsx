import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { ethers } from "ethers";

import { MiniKit } from "@worldcoin/minikit-js";

MiniKit.install();

// =========================
// NETWORKS
// =========================

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
      "https://optimism-rpc.publicnode.com",
      "https://rpc.ankr.com/optimism",
    ],
  },

  {
    name: "BNB Chain",
    chainId: 56,
    symbol: "BNB",

    rpc: [
      "https://bsc-rpc.publicnode.com",
      "https://rpc.ankr.com/bsc",
    ],
  },

  {
    name: "Base",
    chainId: 8453,
    symbol: "ETH",

    rpc: [
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org",
    ],
  },

  {
    name: "World Chain",
    chainId: 480,
    symbol: "WLD",

    rpc: [
      "https://worldchain-mainnet.g.alchemy.com/public",
      "https://480.rpc.thirdweb.com",
      "https://worldchain.drpc.org",
    ],
  },
];

// =========================
// TOKENS
// =========================

const TOKENS = [
  {
    symbol: "WLD",

    decimals: 18,

    addresses: {
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",

      10: "0x163f8C2467924be0ae7B5347228CABF260318753",

      480:
        "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
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

  {
    symbol: "USDT",

    decimals: 6,

    addresses: {
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",

      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",

      56: "0x55d398326f99059fF775485246999027B3197955",

      8453:
        "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
  },
];

// =========================
// ABI
// =========================

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",

  "function transfer(address to,uint amount) returns (bool)",
];

// =========================
// APP
// =========================

export default function App() {

  const mountedRef = useRef(true);

  const [status, setStatus] = useState(
    "Inicializando RC Wallet..."
  );

  const [wallet, setWallet] = useState("");

  const [network, setNetwork] =
    useState("");

  const [nativeBalance, setNativeBalance] =
    useState("0");

  const [tokensDetected, setTokensDetected] =
    useState([]);

  const [selectedToken, setSelectedToken] =
    useState("");

  const [recipient, setRecipient] =
    useState("");

  const [sendAmount, setSendAmount] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [worldVerified, setWorldVerified] =
    useState(false);
  
  // =========================
  // RPC FALLBACK
  // =========================

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

          new Promise((_, reject) =>
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

  // =========================
  // SCAN
  // =========================

  const scanAllNetworks =
    useCallback(async (address) => {

      setStatus(
        "Escaneando redes..."
      );

      let foundTokens = [];

      for (const net of NETWORKS) {

        if (!mountedRef.current)
          return;

        try {

          const provider =
            await getWorkingProvider(
              net.rpc
            );

          if (!provider)
            continue;

          // =========================
          // NATIVA
          // =========================

          const nativeBal =
            await provider.getBalance(
              address
            );

          if (nativeBal > 0n) {

            foundTokens.push({
              network: net.name,

              symbol:
                net.chainId === 480
                  ? "WLD"
                  : net.symbol,

              balance: Number(
                ethers.formatEther(
                  nativeBal
                )
              ).toFixed(6),

              isNative: true,

              chainId: net.chainId,

              decimals: 18,

              address: "NATIVE",
            });

            if (
              net.chainId === 480
            ) {

              setNativeBalance(
                Number(
                  ethers.formatEther(
                    nativeBal
                  )
                ).toFixed(6)
              );
            }
          }

          // =========================
          // ERC20
          // =========================

          for (const token of TOKENS) {

            const tokenAddress =
              token.addresses[
                net.chainId
              ];

            if (!tokenAddress)
              continue;

            try {

              const contract =
                new ethers.Contract(
                  tokenAddress,
                  ERC20_ABI,
                  provider
                );

              const tokenBal =
                await contract.balanceOf(
                  address
                );

              if (tokenBal > 0n) {

                foundTokens.push({
                  network: net.name,

                  symbol:
                    token.symbol,

                  balance: Number(
                    ethers.formatUnits(
                      tokenBal,
                      token.decimals
                    )
                  ).toFixed(4),

                  isNative: false,

                  chainId:
                    net.chainId,

                  decimals:
                    token.decimals,

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
            "Error escaneando:",
            net.name
          );
        }
      }

      const uniqueTokens =
        foundTokens.filter(
          (
            token,
            index,
            self
          ) =>
            index ===
            self.findIndex(
              (t) =>
                t.chainId ===
                  token.chainId &&
                t.address ===
                  token.address
            )
        );

      setTokensDetected(
        uniqueTokens
      );

      if (
        uniqueTokens.length > 0
      ) {

        setSelectedToken(
          JSON.stringify(
            uniqueTokens[0]
          )
        );
      }

      setStatus(
        "Escaneo completado"
      );

    }, []);

  // =========================
  // LOGIN
  // =========================

  async function handleWorldLogin() {

    try {

      if (
        !MiniKit.isInstalled()
      ) {

        setStatus(
          "Abra desde World App"
        );

        return;
      }

      setStatus(
        "Conectando wallet..."
      );

      const res =
        await MiniKit.commandsAsync.walletAuth({
          nonce:
            Math.random()
              .toString(36)
              .substring(2),

          requestId:
            Math.random()
              .toString(36)
              .substring(2),

          expirationTime:
            new Date(
              Date.now() +
                1000 *
                  60 *
                  5
            ),

          notBefore:
            new Date(),

          statement:
            "Conectar RC Wallet",
        });

      if (
        res?.error_code
      ) {

        setStatus(
          res?.error_message ||
            "Login cancelado"
        );

        return;
      }

      const payload =
        res?.finalPayload ||
        res;

      const address =
        payload?.address ||
        payload?.walletAddress;

      if (!address) {

        setStatus(
          "No se obtuvo wallet"
        );

        return;
      }

      setWallet(address);
      localStorage.setItem(
  "rc_wallet_address",
  address
);
      setNetwork(
        "World App"
      );

      setWorldVerified(true);

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
          "Error login"
      );
    }
  }

  // =========================
  // SEND
  // =========================

  const handleSend =
  async () => {

    try {

      if (
        sending
      ) return;

      if (
        !recipient ||
        !sendAmount ||
        !selectedToken
      ) {

        setStatus(
          "Completa todos los campos"
        );

        return;
      }

      const tokenInfo =
        JSON.parse(
          selectedToken
        );

      const cleanAmount =
        sendAmount
          .trim()
          .replace(",", ".");

      const cleanRecipient =
        recipient.trim();

      if (
        !ethers.isAddress(
          cleanRecipient
        )
      ) {

        setStatus(
          "Dirección inválida"
        );

        return;
      }

      if (
        isNaN(cleanAmount) ||
        Number(cleanAmount) <= 0
      ) {

        setStatus(
          "Cantidad inválida"
        );

        return;
      }

      if (
        Number(cleanAmount) >
        Number(tokenInfo.balance)
      ) {

        setStatus(
          "Balance insuficiente"
        );

        return;
      }

      if (
        cleanRecipient.toLowerCase() ===
        wallet.toLowerCase()
      ) {

        setStatus(
          "No puedes enviarte fondos a ti mismo"
        );

        return;
      }

      setSending(true);

      setStatus(
        "Esperando confirmación..."
      );
        

        // =========================
        // NATIVA
        // =========================

        if (
          tokenInfo.isNative
        ) {

          const result =
            await MiniKit.commandsAsync.sendTransaction({
              chainId:
                "0x" +
                tokenInfo.chainId.toString(
                  16
                ),

              transactions: [
                {
                  to: cleanRecipient,

                  value:
                    "0x" +
                    ethers
                      .parseEther(
                        cleanAmount
                      )
                      .toString(16),
                },
              ],
            });

          if (
            result
              ?.finalPayload
              ?.status ===
              "success" ||
            result?.status ===
              "success"
          ) {

            setStatus(
              "Transferencia completada"
            );

            await scanAllNetworks(
              wallet
            );

          } else {

            setStatus(
              "Transacción cancelada"
            );
          }

          return;
        }

        // =========================
        // ERC20
        // =========================

        const iface =
          new ethers.Interface(
            ERC20_ABI
          );

        const data =
          iface.encodeFunctionData(
            "transfer",
            [
              cleanRecipient,

              ethers.parseUnits(
                cleanAmount,
                tokenInfo.decimals
              ),
            ]
          );

        const result =
          await MiniKit.commandsAsync.sendTransaction({
            chainId:
              "0x" +
              tokenInfo.chainId.toString(
                16
              ),

            transactions: [
              {
                to:
                  tokenInfo.address,

                data,

                value: "0x0",
              },
            ],
          });

        if (
          result?.finalPayload
            ?.status ===
            "success" ||
          result?.status ===
            "success"
        ) {

          setStatus(
            "Transferencia completada"
          );

          await scanAllNetworks(
            wallet
          );

        } else {

          setStatus(
            "Transacción cancelada"
          );
        }

      } catch (err) {

        console.error(err);

        setStatus(
  err?.shortMessage ||
  err?.message ||
  "Error enviando"
);

      } finally {

        setSending(false);
      }
    };

  // =========================
  // INIT
  // =========================

  useEffect(() => {

  mountedRef.current = true;

  async function autoReconnect() {

    try {

      if (
        !MiniKit.isInstalled()
      ) {

        return;
      }

      const storedWallet =
        localStorage.getItem(
          "rc_wallet_address"
        );

      if (!storedWallet) {

        return;
      }

      setWallet(
        storedWallet
      );

      setNetwork(
        "World App"
      );

      setWorldVerified(true);

      setStatus(
        "Reconectando wallet..."
      );

      await scanAllNetworks(
        storedWallet
      );

    } catch (err) {

      console.log(
        "Auto reconnect error",
        err
      );

    } 
  }

  autoReconnect();

  return () => {

    mountedRef.current = false;
  };

}, [scanAllNetworks]);
  // =========================
// AUTO HIDE STATUS
// =========================
  useEffect(() => {

  if (!status) return;

  const timer =
    setTimeout(() => {

      if (
        status !==
        "Inicializando RC Wallet..."
      ) {

        setStatus("");
      }

    }, 3500);

  return () =>
    clearTimeout(timer);

}, [status]);

  // =========================
  // UI
  // =========================

  return (

    <div
      style={{
        padding: 20,
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
        fontFamily: "Arial",
      }}
    >

      <h1>
  RC Wallet
</h1>

{/* =========================
   STATUS TOAST
========================= */}

{status && (
  <div
    style={{
      position: "fixed",
      top: 20,
      left: "50%",
      transform: "translateX(-50%)",
      background:
        status.includes("completada")
          ? "#16a34a"
          : status.includes("cancelada") ||
            status.includes("Error")
          ? "#dc2626"
          : "#111827",
      color: "#fff",
      padding: "16px 24px",
      borderRadius: 16,
      zIndex: 9999,
      fontWeight: "bold",
      fontSize: 16,
      boxShadow:
        "0 8px 30px rgba(0,0,0,0.5)",
      textAlign: "center",
      maxWidth: "90%",
    }}
  >
    {status}
  </div>
)}
<button
  onClick={
    handleWorldLogin
  }

  style={{
    width: "100%",
    padding: 14,
    borderRadius: 14,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 20,
  }}
>
  Iniciar sesión con World ID
</button>

<hr />

{/* =========================
   WALLET INFO
========================= */}

<p>
  Wallet:
</p>

<div
  style={{
    background: "#111827",
    padding: 12,
    borderRadius: 12,
    wordBreak: "break-all",
    marginBottom: 12,
    border: "1px solid #333",
  }}
>
  {wallet || "No conectada"}
</div>

<button
  onClick={() => {

    if (!wallet) return;

    navigator.clipboard.writeText(
      wallet
    );

    setStatus(
      "Dirección copiada"
    );
  }}

  style={{
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "none",
    background: "#16a34a",
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 20,
  }}
>
  Copiar dirección
</button>

{/* =========================
   QR WALLET
========================= */}

{wallet && (

  <div
    style={{
      display: "flex",
      justifyContent: "center",
      marginBottom: 20,
    }}
  >

    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${wallet}`}

      alt="QR Wallet"

      style={{
        width: 240,
        height: 240,
        borderRadius: 20,
        border: "4px solid #111827",
        background: "#fff",
      }}
    />

  </div>
)}
<p>
  Red: {network}
</p>

<p>
  Balance: {nativeBalance}
</p>

<p>
  World ID:
  {" "}
  {worldVerified
    ? "Verificado"
    : "No verificado"}
</p>

<hr />

<h2>
  Fondos Detectados
</h2>

{tokensDetected.length === 0 && (
  <p>
    No se detectaron fondos
  </p>
)}

{tokensDetected.map(
  (
    token,
    index
  ) => (

    <div
      key={index}

      style={{
        border:
          "1px solid #333",

        padding: 14,

        borderRadius: 14,

        marginBottom: 12,

        background:
          "#111827",
      }}
    >

      <p>
        {token.network}
      </p>

      <p>
        {token.symbol}
      </p>

      <p>
        {token.balance}
      </p>

    </div>
  )
)}

<hr />

<h2>
  Enviar Fondos
</h2>

<select
  value={
    selectedToken
  }

  onChange={(e) =>
    setSelectedToken(
      e.target.value
    )
  }

  style={{
    width: "100%",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  }}
>

  {tokensDetected.map(
    (
      token,
      index
    ) => (

      <option
        key={index}

        value={JSON.stringify(
          token
        )}
      >

        {token.network}
        {" - "}
        {token.symbol}

      </option>
    )
  )}
</select>

<input
  placeholder="Dirección destino"

  value={recipient}

  onChange={(e) =>
    setRecipient(
      e.target.value
    )
  }

  style={{
    width: "100%",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
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
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  }}
/>

<button
  disabled={sending}

  onClick={
    handleSend
  }

  style={{
    width: "100%",
    padding: 14,
    borderRadius: 14,
    border: "none",
    background:
      sending
        ? "#555"
        : "#2563eb",
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  }}
>

  {sending
    ? "Enviando..."
    : "Enviar"}

</button>

</div>
);
}
