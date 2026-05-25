import React, { useEffect, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { ethers } from "ethers";

export default function App() {
  const [status, setStatus] = useState("Iniciando...");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      // Espera un poco para que World App cargue MiniKit
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Inicializar MiniKit
      MiniKit.install();

      // Detectar instalación
      if (!MiniKit.isInstalled()) {
        setStatus("Abra la app desde World App");
        return;
      }

      setStatus("World App detectada");

      // Obtener provider
      const provider = MiniKit.getProvider();

      if (!provider) {
        setStatus("Provider no detectado");
        return;
      }

      // Solicitar conexión wallet
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || !accounts.length) {
        setStatus("Wallet no conectada");
        return;
      }

      const wallet = accounts[0];

      setAddress(wallet);
      setStatus("Wallet conectada");

      // ethers provider
      const ethersProvider = new ethers.BrowserProvider(provider);

      // Balance
      const ethBalance = await ethersProvider.getBalance(wallet);

      setBalance(ethers.formatEther(ethBalance));

      // Red
      const net = await ethersProvider.getNetwork();

      setNetwork(net.name);
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
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
      <h1 style={{ fontSize: "70px", marginBottom: "40px" }}>
        RC Wallet
      </h1>

      <h2>Recuperación de fondos Worldcoin</h2>

      <button
        onClick={init}
        style={{
          marginTop: "40px",
          padding: "20px",
          fontSize: "30px",
          borderRadius: "20px",
          border: "none",
        }}
      >
        Conectar Wallet
      </button>

      <hr style={{ margin: "40px 0" }} />

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
