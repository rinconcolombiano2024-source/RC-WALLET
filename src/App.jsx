import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { ethers } from "ethers";
import { MiniKit } from "@worldcoin/minikit-js";

MiniKit.install();
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
      "https://optimism-rpc.publicnode.com",
      "https://rpc.ankr.com/optimism",
    ],
  },

  {
    name: "BNB Chain",
    chainId: 56,
    hex: "0x38",
    symbol: "BNB",
    rpc: [
      "https://bsc-rpc.publicnode.com",
      "https://rpc.ankr.com/bsc",
    ],
  },

  {
    name: "Base",
    chainId: 8453,
    hex: "0x2105",
    symbol: "ETH",
    rpc: [
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org",
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

  const [status, setStatus] = useState(
    "Inicializando RC Wallet..."
  );

  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("");
  const [nativeBalance, setNativeBalance] =
    useState("0");

  const [tokensDetected, setTokensDetected] =
    useState([]);

  const [selectedToken, setSelectedToken] =
    useState("");

  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  const [sending, setSending] = useState(false);

  const [worldVerified, setWorldVerified] =
    useState(false);

  async function getWorkingProvider(rpcList) {
    for (const rpc of rpcList) {
      try {
        const provider =
          new ethers.JsonRpcProvider(rpc);

        await Promise.race([
          provider.getBlockNumber(),

          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error("RPC Timeout")
                ),
              4000
            )
          ),
        ]);

        return provider;
      } catch (err) {
        console.log("RPC falló:", rpc);
      }
    }

    return null;
  }

  const scanAllNetworks = useCallback(
    async (address) => {
      setStatus("Escaneando redes...");

      let foundTokens = [];

      for (const net of NETWORKS) {
        if (!mountedRef.current) return;

        try {
          const provider =
            await getWorkingProvider(net.rpc);

          if (!provider) continue;

          const nativeBal =
  await provider.getBalance(address);

console.log(
  net.name,
  ethers.formatEther(nativeBal)
);

if (
  nativeBal &&
  nativeBal.toString() !== "0"
) {
            foundTokens.push({
              network: net.name,
              symbol: net.symbol,
              balance: Number(
                ethers.formatEther(nativeBal)
              ).toFixed(6),
              isNative: true,
              chainId: net.chainId,
              decimals: 18,
              address: "NATIVE",
            });
          }

          for (const token of TOKENS) {
            const tokenAddress =
              token.addresses[net.chainId];

            if (!tokenAddress) continue;

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
                  symbol: token.symbol,
                  balance: Number(
                    ethers.formatUnits(
                      tokenBal,
                      token.decimals
                    )
                  ).toFixed(4),
                  isNative: false,
                  chainId: net.chainId,
                  decimals: token.decimals,
                  address: tokenAddress,
                });
              }
            } catch (err) {
              console.log(
                "Token error:",
                token.symbol,
                net.name
              );
            }
          }
        } catch (err) {
          console.log(
            "Error escaneando:",
            net.name
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 200)
        );
      }

      if (!mountedRef.current) return;

      setTokensDetected(foundTokens);

      if (foundTokens.length > 0) {
        setSelectedToken(
          JSON.stringify(foundTokens[0])
        );
      }

      setStatus("Escaneo completado");
    },
    []
  );

  async function handleWorldLogin() {
  try {
    if (!MiniKit.isInstalled()) {
      setStatus("World App no detectada");
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
          1000 * 60 * 5
      ),

    notBefore:
      new Date(),

    statement:
      "Conectar RC Wallet",
  });

console.log("WORLD RES:", res);

const payload =
  res?.finalPayload || res;

const address =
  payload?.address ||
  payload?.walletAddress;

if (!address) {
  console.log(payload);

  setStatus(
    "No se pudo obtener la wallet"
  );

  return;
}

setWallet(address);

setWorldVerified(true);

setNetwork("World App");

setStatus(
  "Wallet conectada"
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

  async function waitForEthereum() {
    for (let i = 0; i < 20; i++) {
      if (window?.ethereum) {
        return window.ethereum;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 500)
      );
    }

    return null;
  }

  const initialize = useCallback(async () => {
  try {
    let address = "";

    if (MiniKit.isInstalled()) {
      setStatus(
        "Presiona iniciar sesión"
      );

      return;
    } else {
      const ethereum =
        await waitForEthereum();

      if (!ethereum) {
        setStatus(
          "Abre RC Wallet desde World App o MetaMask"
        );

        return;
      }

      const accounts =
        await ethereum.request({
          method: "eth_requestAccounts",
        });

      if (!accounts?.length) {
        setStatus(
          "No se detectó ninguna cuenta"
        );

        return;
      }

      address = accounts[0];

      const provider =
        new ethers.BrowserProvider(
          ethereum
        );

      const currentNetwork =
        await provider.getNetwork();

      setNetwork(
        `${currentNetwork.name} (${Number(
          currentNetwork.chainId
        )})`
      );

      const nativeBal =
        await provider.getBalance(
          address
        );

      setNativeBalance(
        Number(
          ethers.formatEther(
            nativeBal
          )
        ).toFixed(6)
      );
    }

    setWallet(address);

    await scanAllNetworks(address);

    setStatus("Wallet conectada");
  } catch (err) {
    console.error(err);

    setStatus(
      err?.message ||
        "Error inicializando"
    );
  }
}, [scanAllNetworks]);

  const handleSend = async () => {
    try {
      if (
        !recipient ||
        !sendAmount ||
        !selectedToken
      ) {
        setStatus("Completa todos los campos");
        return;
      }

      setSending(true);

      const tokenInfo =
        JSON.parse(selectedToken);

      if (MiniKit.isInstalled()) {
        setStatus(
          "Esperando confirmación..."
        );

        if (tokenInfo.isNative) {

  console.log("ANTES SEND");

const result =
  await MiniKit.commandsAsync.sendTransaction({
    transaction: [
      {
        to: recipient,
        value:
          "0x" +
          ethers
            .parseEther(sendAmount)
            .toString(16),
      },
    ],
  });

console.log("RESULT:", result);

alert(JSON.stringify(result));

  if (
    result?.finalPayload?.status === "success"
  ) {
    setStatus("Transferencia completada");
  } else {
    setStatus("Transacción cancelada");
  }

} else {

  const amount =
    ethers.parseUnits(
      sendAmount,
      tokenInfo.decimals
    );

  const iface =
    new ethers.Interface(
      ERC20_ABI
    );

  const data =
    iface.encodeFunctionData(
      "transfer",
      [recipient, amount]
    );

  alert(
  "World App aún no soporta ERC20 personalizados"
);

return;

  alert(JSON.stringify(result));

  if (
    result?.finalPayload?.status === "success"
  ) {
    setStatus("Transferencia completada");
  } else {
    setStatus("Transacción cancelada");
  }
}
      } else {
        const ethereum =
          window.ethereum;

        if (!ethereum) {
          setStatus(
            "Wallet no encontrada"
          );
          return;
        }

        await ethereum.request({
          method:
            "wallet_switchEthereumChain",
          params: [
            {
              chainId:
                "0x" +
                tokenInfo.chainId.toString(
                  16
                ),
            },
          ],
        });

        const provider =
          new ethers.BrowserProvider(
            ethereum
          );

        const signer =
          await provider.getSigner();

        if (tokenInfo.isNative) {
          const tx =
            await signer.sendTransaction({
              to: recipient,
              value:
                ethers.parseEther(
                  sendAmount
                ),
            });

          await tx.wait();
        } else {
          const contract =
            new ethers.Contract(
              tokenInfo.address,
              ERC20_ABI,
              signer
            );

          const tx =
            await contract.transfer(
              recipient,
              ethers.parseUnits(
                sendAmount,
                tokenInfo.decimals
              )
            );

          await tx.wait();
        }
      }

      await scanAllNetworks(wallet);
      
    } catch (err) {
      console.error(err);

      setStatus(
        err?.message ||
          "Error enviando"
      );
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    initialize();

    return () => {
      mountedRef.current = false;
    };
  }, [initialize]);

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial",
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
      }}
    >
      <h1>RC Wallet</h1>

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
          : status.includes("cancelada")
          ? "#dc2626"
          : "#111",
      color: "#fff",
      padding: "12px 18px",
      borderRadius: 12,
      zIndex: 9999,
      fontWeight: "bold",
      boxShadow:
        "0 4px 12px rgba(0,0,0,0.4)",
      maxWidth: "90%",
      textAlign: "center",
    }}
  >
    {status}
  </div>
)}

      <button
        onClick={handleWorldLogin}
      >
        Iniciar sesión con World ID
      </button>

      <hr />

      <p>
        <b>Wallet:</b> {wallet}
      </p>
<button
  onClick={() => {
    navigator.clipboard.writeText(wallet);

    setStatus(
      "Dirección copiada"
    );
  }}
>
  Copiar dirección
</button>

<br />
<br />

{wallet && (
  <img
    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${wallet}`}
    alt="QR Wallet"
    style={{
      borderRadius: 12,
      width: 220,
      height: 220,
    }}
  />
)}
      <p>
        <b>Red:</b> {network}
      </p>

      <p>
        <b>Balance:</b>{" "}
        {nativeBalance}
      </p>

      <p>
        <b>World ID:</b>{" "}
        {worldVerified
          ? "Verificado"
          : "No verificado"}
      </p>

      <hr />

      <h2>Fondos Detectados</h2>

      {tokensDetected.length === 0 && (
        <p>
          No se detectaron fondos
        </p>
      )}

      {tokensDetected.map(
        (token, index) => (
          <div
            key={index}
            style={{
              border:
                "1px solid #444",
              marginBottom: 10,
              padding: 10,
              borderRadius: 10,
            }}
          >
            <p>
              {token.network} -{" "}
              {token.symbol}
            </p>

            <p>
              Balance:{" "}
              {token.balance}
            </p>
          </div>
        )
      )}

      <hr />

      <h2>Enviar Fondos</h2>

      <select
        value={selectedToken}
        onChange={(e) =>
          setSelectedToken(
            e.target.value
          )
        }
      >
        {tokensDetected.map(
          (token, index) => (
            <option
              key={index}
              value={JSON.stringify(
                token
              )}
            >
              {token.network} -{" "}
              {token.symbol}
            </option>
          )
        )}
      </select>

      <br />
      <br />

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
          padding: 10,
        }}
      />

      <br />
      <br />

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
          padding: 10,
        }}
      />

      <br />
      <br />

      <button
        disabled={sending}
        onClick={handleSend}
        style={{
          padding: 12,
          width: "100%",
          fontWeight: "bold",
        }}
      >
        {sending
          ? "Enviando..."
          : "Enviar"}
      </button>
    </div>
  );
}
