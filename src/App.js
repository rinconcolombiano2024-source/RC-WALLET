import React, { useEffect, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { ethers } from "ethers";

const NETWORKS = [
  {
    name: "Ethereum",
    chainId: 1,
    rpc: "https://ethereum-rpc.publicnode.com",
  },
  {
    name: "Optimism",
    chainId: 10,
    rpc: "https://mainnet.optimism.io",
  },
  {
    name: "BNB",
    chainId: 56,
    rpc: "https://bsc-dataseed.binance.org",
  },
  {
    name: "Base",
    chainId: 8453,
    rpc: "https://mainnet.base.org",
  },
  {
    name: "World Chain",
    chainId: 480,
    rpc: "https://worldchain-mainnet.g.alchemy.com/public",
  },
];

const TOKENS = [
  {
    symbol: "WLD",
    address: "0x163f8C2467924be0ae7B5347228CABF260318753",
    decimals: 18,
  },
  {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
  },
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

export default function App() {
  const [status, setStatus] = useState("Iniciando...");
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [tokens, setTokens] = useState([]);
  const [provider, setProvider] = useState(null);

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  useEffect(() => {
    connectWallet();
  }, []);

  async function connectWallet() {
    try {
      await new Promise((r) => setTimeout(r, 2000));

      MiniKit.install();

      if (!MiniKit.isInstalled()) {
        setStatus("Abra desde World App");
        return;
      }

      const miniProvider = MiniKit.getProvider();

      if (!miniProvider) {
        setStatus("Provider no detectado");
        return;
      }

      const accounts = await miniProvider.request({
        method: "eth_requestAccounts",
      });

      if (!accounts.length) {
        setStatus("Wallet no conectada");
        return;
      }

      const address = accounts[0];

      setWallet(address);

      const ethersProvider = new ethers.BrowserProvider(miniProvider);

      setProvider(ethersProvider);

      const balance = await ethersProvider.getBalance(address);

      setEthBalance(
        Number(ethers.formatEther(balance)).toFixed(4)
      );

      const net = await ethersProvider.getNetwork();

      setNetwork(net.name);

      setStatus("Wallet conectada");

      scanAllNetworks(address);

    } catch (err) {
      console.error(err);
      setStatus(err.message);
    }
  }

  async function scanAllNetworks(address) {
    let foundTokens = [];

    for (const net of NETWORKS) {
      try {
        const rpcProvider = new ethers.JsonRpcProvider(net.rpc);

        for (const token of TOKENS) {
          try {
            const contract = new ethers.Contract(
              token.address,
              ERC20_ABI,
              rpcProvider
            );

            const balance = await contract.balanceOf(address);

            const formatted = ethers.formatUnits(
              balance,
              token.decimals
            );

            if (Number(formatted) > 0) {
              foundTokens.push({
                network: net.name,
                symbol: token.symbol,
                balance: formatted,
                address: token.address,
              });
            }
          } catch (e) {
            console.log(e);
          }
        }
      } catch (err) {
        console.log(err);
      }
    }

    setTokens(foundTokens);
  }

  async function sendNative() {
    try {
      if (!provider) return;

      const signer = await provider.getSigner();

      const tx = await signer.sendTransaction({
        to: sendTo,
        value: ethers.parseEther(sendAmount),
      });

      await tx.wait();

      alert("Enviado correctamente");

    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div
      style={{
        background: "#05058C",
        minHeight: "100vh",
        color: "white",
        padding: "20px",
        fontFamily: "Arial",
      }}
    >
      <h1 style={{ fontSize: "60px" }}>
        RC Wallet
      </h1>

      <h2>Recuperación Multi-Chain</h2>

      <button
        onClick={connectWallet}
        style={{
          padding: "20px",
          fontSize: "25px",
          borderRadius: "20px",
          border: "none",
          marginTop: "20px",
        }}
      >
        Conectar Wallet
      </button>

      <hr style={{ margin: "30px 0" }} />

      <h2>Estado</h2>
      <p>{status}</p>

      <h2>Wallet</h2>
      <p>{wallet || "No conectada"}</p>

      <h2>Red</h2>
      <p>{network}</p>

      <h2>ETH Balance</h2>
      <p>{ethBalance}</p>

      <hr style={{ margin: "30px 0" }} />

      <h2>Tokens Detectados</h2>

      {tokens.length === 0 && (
        <p>No se detectaron tokens</p>
      )}

      {tokens.map((token, index) => (
        <div
          key={index}
          style={{
            background: "#1111aa",
            padding: "15px",
            borderRadius: "15px",
            marginBottom: "15px",
          }}
        >
          <p><b>Token:</b> {token.symbol}</p>
          <p><b>Balance:</b> {token.balance}</p>
          <p><b>Red:</b> {token.network}</p>
        </div>
      ))}

      <hr style={{ margin: "30px 0" }} />

      <h2>Enviar Fondos</h2>

      <input
        placeholder="Dirección destino"
        value={sendTo}
        onChange={(e) => setSendTo(e.target.value)}
        style={{
          width: "100%",
          padding: "15px",
          marginBottom: "15px",
          borderRadius: "10px",
          border: "none",
        }}
      />

      <input
        placeholder="Cantidad ETH"
        value={sendAmount}
        onChange={(e) => setSendAmount(e.target.value)}
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
        }}
      >
        Enviar
      </button>
    </div>
  );
          }
