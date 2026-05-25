import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { MiniKit } from "@worldcoin/minikit-js";

export default function App() {
  const [status, setStatus] = useState("Esperando World App...");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      if (!MiniKit.isInstalled()) {
        setStatus("Abra desde World App");
        return;
      }

      if (!window.ethereum) {
        setStatus("Provider no detectado");
        return;
      }

      setStatus("World App detectada");
    } catch (error) {
      console.log(error);
      setStatus("Error detectando");
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("World App no detectada");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);

      await provider.send("eth_requestAccounts", []);

      const signer = await provider.getSigner();

      const walletAddress = await signer.getAddress();

      setAddress(walletAddress);

      const ethBalance = await provider.getBalance(walletAddress);

      setBalance(ethers.formatEther(ethBalance));

      const net = await provider.getNetwork();

      setNetwork(net.name);

      setStatus("Wallet conectada");
    } catch (err) {
      console.log(err);
      setStatus("Error conectando");
    }
  };

  return (
    <div
      style={{
        background: "#05056b",
        minHeight: "100vh",
        color: "white",
        padding: 30,
        fontFamily: "Arial",
      }}
    >
      <h1 style={{ fontSize: 70 }}>RC Wallet</h1>

      <p style={{ fontSize: 30 }}>
        Recuperación de fondos Worldcoin
      </p>

      <button
        onClick={connectWallet}
        style={{
          padding: 20,
          borderRadius: 20,
          border: "none",
          fontSize: 30,
          marginTop: 20,
        }}
      >
        Conectar Wallet
      </button>

      <hr style={{ marginTop: 40, marginBottom: 40 }} />

      <h2>Estado</h2>
      <p>{status}</p>

      <h2>Dirección</h2>
      <p>{address || "No conectada"}</p>

      <h2>ETH Balance</h2>
      <p>{balance}</p>

      <h2>Red</h2>
      <p>{network}</p>
    </div>
  );
}
