import React, { useState } from "react";
import { ethers } from "ethers";

function App() {
  const [status, setStatus] = useState("Esperando conexión");
  const [wallet, setWallet] = useState("No conectada");
  const [balance, setBalance] = useState("0");

  const connectWallet = async () => {
    try {

      // Detectar provider
      let providerObject = null;

      if (window.ethereum) {
        providerObject = window.ethereum;
      }

      // World App / MiniKit
      if (window.worldcoin) {
        providerObject = window.worldcoin;
      }

      if (!providerObject) {
        alert("Provider no disponible");
        setStatus("Provider no detectado");
        return;
      }

      setStatus("Conectando...");

      // Crear provider ethers
      const provider = new ethers.BrowserProvider(providerObject);

      // Solicitar cuentas
      await provider.send("eth_requestAccounts", []);

      // Obtener signer
      const signer = await provider.getSigner();

      // Obtener dirección
      const address = await signer.getAddress();

      // Obtener balance
      const ethBalance = await provider.getBalance(address);

      setWallet(address);

      setBalance(
        ethers.formatEther(ethBalance)
      );

      setStatus("Wallet conectada");

      alert("RC Wallet conectada correctamente");

    } catch (error) {
      console.log(error);

      setStatus("Error");

      alert("Error conectando wallet");
    }
  };

  return (
    <div
      style={{
        background: "#020b52",
        minHeight: "100vh",
        padding: "20px",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          background: "#04106d",
          padding: "20px",
          borderRadius: "20px",
        }}
      >
        <h1 style={{ fontSize: "70px" }}>
          RC Wallet
        </h1>

        <p style={{ fontSize: "30px" }}>
          Recuperación de fondos Worldcoin
        </p>

        <button
          onClick={connectWallet}
          style={{
            padding: "15px",
            borderRadius: "15px",
            border: "none",
            fontSize: "20px",
            marginTop: "20px",
          }}
        >
          Conectar Wallet
        </button>

        <hr style={{ marginTop: "30px" }} />

        <h2>Estado</h2>
        <p>{status}</p>

        <h2>Dirección</h2>
        <p
          style={{
            wordBreak: "break-all",
          }}
        >
          {wallet}
        </p>

        <h2>ETH Balance</h2>
        <p>{balance}</p>
      </div>
    </div>
  );
}

export default App;
