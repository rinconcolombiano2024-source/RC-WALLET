import React, { useState } from "react";
import { ethers } from "ethers";

const TOKENS = [
  {
    symbol: "WLD",
    decimals: 18,
    address: "0x163f8C2467924be0ae7B5347228CABF260318753",
  },

  {
    symbol: "USDT",
    decimals: 6,
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },

  {
    symbol: "USDC",
    decimals: 6,
    address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  },
];

export default function App() {
  const [wallet, setWallet] = useState("");
  const [provider, setProvider] = useState<any>(null);
  const [balance, setBalance] = useState("0");
  const [tokens, setTokens] = useState<any[]>([]);
  const [sendTo, setSendTo] = useState("");
  const [amount, setAmount] = useState("");

  const connectWallet = async () => {
    try {
      const ethereum = (window as any).ethereum;

      if (!ethereum) {
        alert("Abra RC Wallet desde World App");
        return;
      }

      await ethereum.request({
        method: "eth_requestAccounts",
      });

      const browserProvider = new ethers.BrowserProvider(ethereum);

      setProvider(browserProvider);

      const signer = await browserProvider.getSigner();

      const address = await signer.getAddress();

      setWallet(address);

      const ethBalance = await browserProvider.getBalance(address);

      setBalance(parseFloat(ethers.formatEther(ethBalance)).toFixed(4));

      const detectedTokens = [];

      for (const token of TOKENS) {
        try {
          const abi = [
            "function balanceOf(address owner) view returns (uint256)",
          ];

          const contract = new ethers.Contract(
            token.address,
            abi,
            browserProvider
          );

          const rawBalance = await contract.balanceOf(address);

          const formatted = ethers.formatUnits(rawBalance, token.decimals);

          detectedTokens.push({
            ...token,
            balance: formatted,
          });
        } catch (err) {
          console.log(err);
        }
      }

      setTokens(detectedTokens);

      alert("Wallet conectada");
    } catch (err) {
      console.log(err);

      alert("Error conectando wallet");
    }
  };

  const sendToken = async (tokenAddress: string, decimals: number) => {
    try {
      if (!provider) {
        alert("Conecte wallet");
        return;
      }

      const signer = await provider.getSigner();

      const abi = [
        "function transfer(address to,uint256 amount) returns (bool)",
      ];

      const contract = new ethers.Contract(tokenAddress, abi, signer);

      const tx = await contract.transfer(
        sendTo,
        ethers.parseUnits(amount, decimals)
      );

      alert("Enviando token...");

      await tx.wait();

      alert("Token enviado");
    } catch (err) {
      console.log(err);

      alert("Error enviando token");
    }
  };

  return (
    <div
      style={{
        background: "#020617",
        minHeight: "100vh",
        color: "white",
        padding: "20px",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          maxWidth: "700px",
          margin: "0 auto",
          background: "#0f172a",
          padding: "30px",
          borderRadius: "20px",
        }}
      >
        <h1 style={{ textAlign: "center" }}>RC Wallet</h1>

        <p style={{ textAlign: "center" }}>Recuperación de fondos Worldcoin</p>

        <button onClick={connectWallet}>Conectar World App</button>

        <hr />

        <h3>Dirección</h3>

        <p>{wallet}</p>

        <h3>ETH Balance</h3>

        <p>{balance}</p>

        <hr />

        <h2>Enviar Tokens</h2>

        <input
          placeholder="Dirección destino"
          value={sendTo}
          onChange={(e) => setSendTo(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
          }}
        />

        <input
          placeholder="Cantidad"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
          }}
        />

        <hr />

        <h2>Tokens Detectados</h2>

        {tokens.map((token, index) => (
          <div
            key={index}
            style={{
              border: "1px solid gray",
              padding: "15px",
              marginBottom: "10px",
              borderRadius: "10px",
            }}
          >
            <h3>{token.symbol}</h3>

            <p>Balance: {token.balance}</p>

            <button onClick={() => sendToken(token.address, token.decimals)}>
              Enviar {token.symbol}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
