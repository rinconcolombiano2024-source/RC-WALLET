import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { ethers } from "ethers";

import { MiniKit } from "@worldcoin/minikit-js";

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
  const scanLockRef = useRef(false);

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
  const [detectedProviders,
  setDetectedProviders] =
  useState([]);
  const [estimatedGas, setEstimatedGas] =
  useState("0");

const [maxSendAmount, setMaxSendAmount] =
  useState("0");
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
// DYNAMIC TOKEN DETECTION
// =========================

async function getDynamicTokens(
  address,
  chainId
) {

  try {

    const network =
      NETWORKS.find(
        (n) =>
          n.chainId ===
          chainId
      );

    if (!network)
      return [];

    const provider =
      await getWorkingProvider(
        network.rpc
      );

    if (!provider)
      return [];

    // =========================
    // TOKENS BASE
    // =========================

    const knownTokens =
      TOKENS.filter(
        (token) =>
          token.addresses[
            chainId
          ]
      );

    const detected = [];

    for (const token of knownTokens) {

      try {

        const tokenAddress =
          token.addresses[
            chainId
          ];

        const contract =
          new ethers.Contract(
            tokenAddress,
            ERC20_ABI,
            provider
          );

        const balance =
          await contract.balanceOf(
            address
          );

        if (balance > 0n) {

          detected.push({
            symbol:
              token.symbol,

            balance:
              ethers.formatUnits(
                balance,
                token.decimals
              ),

            decimals:
              token.decimals,

            address:
              tokenAddress,

            chainId,
          });
        }

      } catch (err) {

        console.log(
          "DYNAMIC TOKEN ERROR",
          token.symbol,
          err
        );
      }
    }

    console.log(
      "DYNAMIC TOKENS",
      detected
    );

    return detected;

  } catch (err) {

    console.log(
      "TOKEN DETECTION ERROR",
      err
    );

    return [];
  }
}
  
async function estimateNativeGas(
  chainId,
  from,
  to,
  amount
) {

  try {

    const network =
      NETWORKS.find(
        (n) =>
          n.chainId === chainId
      );

    if (!network)
      return null;

    const provider =
      await getWorkingProvider(
        network.rpc
      );

    if (!provider)
      return null;

    const gasPrice =
      await provider.getFeeData();

    const estimatedGas =
      await provider.estimateGas({
        from,
        to,
        value:
          ethers.parseEther(
            amount
          ),
      });

    const gasCost =
      estimatedGas *
      (gasPrice.gasPrice || 0n);

    return Number(
      ethers.formatEther(
        gasCost
      )
    );

  } catch (err) {

    console.log(
      "Gas estimation error",
      err
    );

    return null;
  }
}
  // =========================
// PROVIDER DETECTION
// =========================

async function detectProvider() {

  try {

    const detected = [];

    // =========================
    // WINDOW ETHEREUM
    // =========================

    if (
      typeof window.ethereum !==
      "undefined"
    ) {

      detected.push({
        name:
          "window.ethereum",

        provider:
          window.ethereum,

        hasRequest:
          typeof window.ethereum
            ?.request ===
          "function",
      });

      // =========================
      // MULTIPLE PROVIDERS
      // =========================

      if (
        Array.isArray(
          window.ethereum
            ?.providers
        )
      ) {

        for (
          const provider of
          window.ethereum
            .providers
        ) {

          detected.push({
            name:
              "ethereum.providers[]",

            provider,

            hasRequest:
              typeof provider
                ?.request ===
              "function",
          });
        }
      }
    }

    // =========================
    // WINDOW SAFE
    // =========================

    if (
      typeof window.safe !==
      "undefined"
    ) {

      detected.push({
        name:
          "window.safe",

        provider:
          window.safe,

        hasRequest:
          typeof window.safe
            ?.request ===
          "function",
      });
    }

    // =========================
    // WINDOW WORLD
    // =========================

    if (
      typeof window.world !==
      "undefined"
    ) {

      detected.push({
        name:
          "window.world",

        provider:
          window.world,

        hasRequest:
          typeof window.world
            ?.request ===
          "function",
      });
    }

    // =========================
    // MINIKIT PROVIDERS
    // =========================

    if (
      MiniKit?.provider
    ) {

      detected.push({
        name:
          "MiniKit.provider",

        provider:
          MiniKit.provider,

        hasRequest:
          typeof MiniKit
            ?.provider
            ?.request ===
          "function",
      });
    }

    if (
      MiniKit?.walletProvider
    ) {

      detected.push({
        name:
          "MiniKit.walletProvider",

        provider:
          MiniKit.walletProvider,

        hasRequest:
          typeof MiniKit
            ?.walletProvider
            ?.request ===
          "function",
      });
    }

    console.log(
      "DETECTED PROVIDERS",
      detected
    );
setDetectedProviders(
  detected
);
    return detected;

  } catch (err) {

    console.log(
      "PROVIDER DETECTION ERROR",
      err
    );

    return [];
  }
}
 // =========================
// SCAN
// =========================

const scanAllNetworks =
  useCallback(async (address) => {

    if (scanLockRef.current)
      return;

    scanLockRef.current = true;

    try {

      setStatus(
        "Escaneando redes..."
      );

      let foundTokens = [];

      for (const net of NETWORKS) {

        if (!mountedRef.current) {

          scanLockRef.current = false;

          return;
        }

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
// DYNAMIC TOKENS
// =========================

const dynamicTokens =
  await getDynamicTokens(
    address,
    net.chainId
  );

for (
  const token of
  dynamicTokens
) {

  foundTokens.push({
    network:
      net.name,

    symbol:
      token.symbol,

    balance:
      Number(
        token.balance
      ).toFixed(4),

    isNative: false,

    chainId:
      token.chainId,

    decimals:
      token.decimals,

    address:
      token.address,
  });
}
        } catch (err) {

          console.log(
            "Error escaneando:",
            net.name,
            err
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

    } catch (err) {

      console.log(
        "SCAN ERROR",
        err
      );

      setStatus(
        "Error escaneando redes"
      );

    } finally {

      scanLockRef.current = false;
    }

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
await MiniKit.walletAuth({
    nonce:
      Math.random()
        .toString(36)
        .substring(2),
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
      console.log(
  "WINDOW ETHEREUM",
  window.ethereum
);

console.log(
  "WINDOW",
  window
);

console.log(
  "MINIKIT",
  MiniKit
);
const providers =
  await detectProvider();

console.log(
  "FOUND PROVIDERS",
  providers
);
setTimeout(async () => {

  await scanAllNetworks(
    address
  );

}, 2500);

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
      if (!worldVerified) {

  setStatus(
    "Debes iniciar sesión primero"
  );

  return;
      }
const hasEthereumProvider =

  typeof window.ethereum !==
    "undefined" &&

  typeof window.ethereum.request ===
    "function";

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
  isNaN(Number(cleanAmount)) ||
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
      if (!wallet) {

  setStatus(
    "Wallet no conectada"
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

      if (tokenInfo.isNative) {

  const gasEstimate =
    await estimateNativeGas(
      tokenInfo.chainId,
      wallet,
      cleanRecipient,
      cleanAmount
    );

  if (gasEstimate === null) {

    setStatus(
      "No se pudo calcular gas"
    );

    return;
  }

  setEstimatedGas(
    gasEstimate.toFixed(8)
  );

  const availableBalance =
    Number(tokenInfo.balance) -
    gasEstimate;

  if (
    Number(cleanAmount) >
    availableBalance
  ) {

    setStatus(
      "Fondos insuficientes para gas"
    );

    return;
  }

  setMaxSendAmount(
    availableBalance.toFixed(8)
  );
      }
      setSending(true);

      setStatus(
        "Esperando confirmación..."
      );
        

// =========================
// NATIVO
// =========================

if (
  tokenInfo.isNative
) {

  try {

    setStatus(
      "Preparando transacción..."
    );

    // =========================
    // WORLD CHAIN
    // =========================

    if (
      tokenInfo.chainId === 480
    ) {

      if (
        !MiniKit?.commands
      ) {

        setStatus(
          "MiniKit no disponible"
        );

        setSending(false);

        return;
      }

      const txPayload = {
        reference:
          `rc-native-${Date.now()}`,

        to:
          cleanRecipient,

        value:
          ethers
            .parseEther(
              cleanAmount
            )
            .toString(),
      };

      console.log(
        "WORLD NATIVE PAYLOAD",
        txPayload
      );

      const result =
        await MiniKit.commands.sendTransaction({

          transaction: [
            txPayload,
          ],
        });

      console.log(
        "WORLD NATIVE RESULT",
        JSON.stringify(
          result,
          null,
          2
        )
      );

      if (
        !result
      ) {

        setStatus(
          "Sin respuesta MiniKit"
        );

        setSending(false);

        return;
      }

      if (
        result?.finalPayload
          ?.status ===
        "error"
      ) {

        setStatus(
          result.finalPayload
            ?.error_code ||

          "Transacción rechazada"
        );

        setSending(false);

        return;
      }

      const txId =
        result?.finalPayload
          ?.transaction_id;

      if (!txId) {

        setStatus(
          "No hubo tx hash"
        );

        setSending(false);

        return;
      }

      console.log(
        "WORLD NATIVE HASH",
        txId
      );

      setStatus(
        "Transferencia completada"
      );

      setTimeout(async () => {

        try {

          await scanAllNetworks(
            wallet
          );

        } catch (err) {

          console.log(
            "RESCAN ERROR",
            err
          );
        }

      }, 3000);

    } else {

      // =========================
      // EVM EXTERNO
      // =========================

      if (
        !hasEthereumProvider
      ) {

        setStatus(
          "Provider no disponible"
        );

        setSending(false);

        return;
      }

      const hexChainId =
        "0x" +
        Number(
          tokenInfo.chainId
        ).toString(16);

      try {

        await window.ethereum.request({

          method:
            "wallet_switchEthereumChain",

          params: [
            {
              chainId:
                hexChainId,
            },
          ],
        });

      } catch (switchError) {

        console.log(
          "SWITCH ERROR",
          switchError
        );
      }

      const txHash =
        await window.ethereum.request({

          method:
            "eth_sendTransaction",

          params: [
            {
              from:
                wallet,

              to:
                cleanRecipient,

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

      console.log(
        "EVM NATIVE HASH",
        txHash
      );

      if (!txHash) {

        setStatus(
          "No hubo tx hash"
        );

        setSending(false);

        return;
      }

      setStatus(
        "Transferencia enviada"
      );

      setTimeout(async () => {

        try {

          await scanAllNetworks(
            wallet
          );

        } catch (err) {

          console.log(
            "RESCAN ERROR",
            err
          );
        }

      }, 3000);
    }

  } catch (err) {

    console.error(
      "NATIVE SEND ERROR",
      err
    );

    setStatus(
      err?.message ||

      "Error enviando nativo"
    );

  } finally {

    setSending(false);
  }

  return;
}
      
// =========================
// ERC20
// =========================

try {

  setStatus(
    "Preparando transferencia..."
  );

  // =========================
  // ERC20 CALLDATA
  // =========================

  const iface =
    new ethers.Interface([
      "function transfer(address to,uint256 amount)"
    ]);

  const encodedData =
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

  // =========================
  // WORLD CHAIN ERC20
  // =========================

  if (
    tokenInfo.chainId === 480
  ) {

    if (
      !MiniKit?.commands
    ) {

      setStatus(
        "MiniKit no disponible"
      );

      setSending(false);

      return;
    }

    const txPayload = {

      reference:
        `rc-erc20-${Date.now()}`,

      to:
        tokenInfo.address,

      data:
        encodedData,

      value: "0",
    };

    console.log(
      "WORLD ERC20 PAYLOAD",
      txPayload
    );

    const result =
      await MiniKit.commands.sendTransaction({

        transaction: [
          txPayload,
        ],
      });

    console.log(
      "WORLD ERC20 RESULT",
      JSON.stringify(
        result,
        null,
        2
      )
    );

    // =========================
    // VALIDATE RESULT
    // =========================

    if (
      !result
    ) {

      setStatus(
        "Sin respuesta MiniKit"
      );

      setSending(false);

      return;
    }

    if (
      result?.finalPayload
        ?.status ===
      "error"
    ) {

      setStatus(
        result.finalPayload
          ?.error_code ||

        "Transferencia rechazada"
      );

      setSending(false);

      return;
    }

    const txId =
      result?.finalPayload
        ?.transaction_id;

    if (!txId) {

      setStatus(
        "No hubo tx hash"
      );

      setSending(false);

      return;
    }

    console.log(
      "WORLD ERC20 HASH",
      txId
    );

    setStatus(
      "ERC20 enviado"
    );

    setTimeout(async () => {

      try {

        await scanAllNetworks(
          wallet
        );

      } catch (err) {

        console.log(
          "RESCAN ERROR",
          err
        );
      }

    }, 3000);

  } else {

    // =========================
    // EXTERNAL EVM ERC20
    // =========================

    if (
      !hasEthereumProvider
    ) {

      setStatus(
        "Provider no disponible"
      );

      setSending(false);

      return;
    }

    const hexChainId =
      "0x" +
      Number(
        tokenInfo.chainId
      ).toString(16);

    // =========================
    // SWITCH NETWORK
    // =========================

    try {

      await window.ethereum.request({

        method:
          "wallet_switchEthereumChain",

        params: [
          {
            chainId:
              hexChainId,
          },
        ],
      });

    } catch (switchError) {

      console.log(
        "SWITCH ERROR",
        switchError
      );
    }

    // =========================
    // SEND ERC20
    // =========================

    const txHash =
      await window.ethereum.request({

        method:
          "eth_sendTransaction",

        params: [
          {
            from:
              wallet,

            to:
              tokenInfo.address,

            data:
              encodedData,
          },
        ],
      });

    console.log(
      "EVM ERC20 HASH",
      txHash
    );

    if (!txHash) {

      setStatus(
        "No hubo tx hash"
      );

      setSending(false);

      return;
    }

    setStatus(
      "ERC20 enviado"
    );

    setTimeout(async () => {

      try {

        await scanAllNetworks(
          wallet
        );

      } catch (err) {

        console.log(
          "RESCAN ERROR",
          err
        );
      }

    }, 3000);
  }

} catch (err) {

  console.error(
    "ERC20 SEND ERROR",
    err
  );

  setStatus(
    err?.message ||

    "Error enviando ERC20"
  );

} finally {

  setSending(false);
}
      
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

      setTimeout(async () => {

  await scanAllNetworks(
    storedWallet
  );

}, 2500);

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
{/* =========================
PROVIDERS
========================= */}

<div
  style={{
    marginTop: 20,
    padding: 10,
    background: "#111",
    borderRadius: 10,
    fontSize: 12,
    color: "#00ff99",
    wordBreak:
      "break-word",
  }}
>

  <b>
    Detected Providers
  </b>

  {detectedProviders
    .length === 0 ? (

    <div>
      Ninguno detectado
    </div>

  ) : (

    detectedProviders.map(
      (
        item,
        index
      ) => (

        <div
          key={index}
          style={{
            marginTop: 8,
          }}
        >
          {item.name}
          {" "}
          {item.hasRequest
            ? "✅"
            : "❌"}
        </div>
      )
    )
  )}
</div>
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

      <button
  onClick={() => {

   let explorer = "";

if (token.chainId === 1) {

  explorer =
    token.isNative

      ? `https://etherscan.io/address/${wallet}`

      : `https://etherscan.io/token/${token.address}?a=${wallet}`;

}

else if (token.chainId === 10) {

  explorer =
    token.isNative

      ? `https://optimistic.etherscan.io/address/${wallet}`

      : `https://optimistic.etherscan.io/token/${token.address}?a=${wallet}`;

}

else if (token.chainId === 8453) {

  explorer =
    token.isNative

      ? `https://basescan.org/address/${wallet}`

      : `https://basescan.org/token/${token.address}?a=${wallet}`;

}

else if (token.chainId === 56) {

  explorer =
    token.isNative

      ? `https://bscscan.com/address/${wallet}`

      : `https://bscscan.com/token/${token.address}?a=${wallet}`;

}

else if (token.chainId === 480) {

  explorer =
    token.isNative

      ? `https://worldscan.org/address/${wallet}`

      : `https://worldscan.org/token/${token.address}?a=${wallet}`;

}
    window.open(
      explorer,
      "_blank"
    );
  }}

  style={{
    marginTop: 10,
    padding:
      "8px 12px",
    borderRadius: 8,
    border: "none",
    background:
      "#2563eb",
    color: "white",
    cursor: "pointer",
  }}
>
  Abrir Explorer
</button>
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
  onClick={() => {

    if (!selectedToken)
      return;

    const tokenInfo =
      JSON.parse(
        selectedToken
      );

    if (
      tokenInfo.isNative
    ) {

      setSendAmount(
        maxSendAmount ||
        tokenInfo.balance
      );

    } else {

      setSendAmount(
        tokenInfo.balance
      );
    }
  }}

  style={{
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "none",
    background: "#374151",
    color: "#fff",
    marginBottom: 14,
    fontWeight: "bold",
  }}
>
  MAX
</button>
      
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
