import React, { useState } from "react";
import { ethers } from "ethers";

function App() {

  const [status, setStatus] = useState("Esperando conexión");
  const [wallet, setWallet] = useState("No conectada");
  const [balance, setBalance] = useState("0");

  const connectWallet = async () => {

    try {

      setStatus("Buscando provider...");

      console.log("window:", window);

      // Buscar cualquier provider posible
      let ethProvider =
        window.ethereum ||
        window.worldcoin ||
        window.web3?.currentProvider ||
        null;

      // Mostrar debug
      console.log("Provider detectado:", ethProvider);

      if (!ethProvider) {

        // Buscar providers múltiples
        if (window.ethereum?.providers?.length) {
          ethProvider = window.ethereum.providers[0];
        }
      }

      if (!ethProvider) {

        setStatus("Provider no detectado");

        alert("No se detectó provider");

        return;
      }

      setStatus("Conectando wallet...");

      // Solicitar cuentas
      const accounts = await ethProvider.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {

        setStatus("Sin cuentas");

        alert("No hay cuentas disponibles");

        return;
      }

      const walletAddress = accounts[0];

      setWallet(walletAddress);

      // Crear provider ethers
      const provider = new ethers.BrowserProvider(
        ethProvider
      );

      // Leer balance ETH
      const balanceWei =
        await provider.getBalance(walletAddress);

      const balanceEth =
        ethers.formatEther(balanceWei);

      setBalance(balanceEth);

      setStatus("Wallet conectada");

      alert("Wallet conectada correctamente");

    } catch (error) {

      console.log(error);

      setStatus("Error");

      alert(
        "Error conectando: " +
        error.message
      );
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

        <h1
          style={{
            fontSize: "70px",
          }}
        >
          RC Wallet
        </h1>

        <p
          style={{
            fontSize: "28px",
          }}
        >
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

        <hr
          style={{
            marginTop: "30px",
          }}
        />

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
