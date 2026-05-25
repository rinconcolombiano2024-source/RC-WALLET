import React, { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";

function App() {

  const [wallet, setWallet] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [status, setStatus] = useState("Esperando");

  useEffect(() => {

    detectarWorldApp();

  }, []);

  async function detectarWorldApp() {

    const ua = navigator.userAgent;

    if (
      ua.toLowerCase().includes("world")
    ) {

      setStatus("World App detectada");

    } else {

      setStatus("No es World App");

    }

  }

  async function conectarWallet() {

    try {

      if (!window.ethereum) {

        alert("Provider no disponible");

        return;
      }

      setStatus("Conectando wallet...");

      const provider = new BrowserProvider(window.ethereum);

      await provider.send("eth_requestAccounts", []);

      const signer = await provider.getSigner();

      const address = await signer.getAddress();

      const ethBalance = await provider.getBalance(address);

      setWallet(address);

      setBalance(
        Number(ethBalance) / 1000000000000000000
      );

      setStatus("Wallet conectada");

    } catch (err) {

      console.log(err);

      setStatus("Error conectando");

      alert("Error conectando wallet");

    }

  }

  return (

    <div
      style={{
        background: "#020B4F",
        minHeight: "100vh",
        padding: "20px",
        color: "white",
        fontFamily: "Arial",
      }}
    >

      <div
        style={{
          background: "#04115F",
          borderRadius: "30px",
          padding: "30px",
          maxWidth: "500px",
          margin: "0 auto",
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
          onClick={conectarWallet}
          style={{
            padding: "18px",
            borderRadius: "15px",
            border: "none",
            fontSize: "22px",
            cursor: "pointer",
            marginTop: "20px",
            marginBottom: "30px",
          }}
        >
          Conectar Wallet
        </button>

        <hr />

        <h2
          style={{
            fontSize: "40px",
            marginTop: "30px",
          }}
        >
          Estado
        </h2>

        <p
          style={{
            fontSize: "24px",
          }}
        >
          {status}
        </p>

        <h2
          style={{
            fontSize: "40px",
            marginTop: "30px",
          }}
        >
          Dirección
        </h2>

        <p
          style={{
            fontSize: "16px",
            wordBreak: "break-all",
          }}
        >
          {wallet}
        </p>

        <h2
          style={{
            fontSize: "40px",
            marginTop: "30px",
          }}
        >
          ETH Balance
        </h2>

        <p
          style={{
            fontSize: "24px",
          }}
        >
          {balance}
        </p>

      </div>

    </div>

  );

}

export default App;
