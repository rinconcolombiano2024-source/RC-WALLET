import React, { useState } from "react";

function App() {

  const [wallet, setWallet] = useState("No conectada");
  const [status, setStatus] = useState("Esperando conexión");

  async function connectWallet() {

    try {

      setStatus("Conectando...");

      // Detecta World App / MetaMask
      const ethereum = window.ethereum;

      if (!ethereum) {

        alert("No se detectó World App");

        setStatus("World App no detectada");

        return;
      }

      // Solicitar cuentas
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts.length > 0) {

        setWallet(accounts[0]);

        setStatus("Wallet conectada");

      } else {

        setStatus("Sin cuentas");

      }

    } catch (err) {

      console.log(err);

      alert("Error conectando wallet");

      setStatus("Error");

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
            marginBottom: "10px",
          }}
        >
          RC Wallet
        </h1>

        <p
          style={{
            fontSize: "28px",
            marginBottom: "30px",
          }}
        >
          Recuperación de fondos Worldcoin
        </p>

        <button
          onClick={connectWallet}
          style={{
            padding: "18px",
            borderRadius: "15px",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            marginBottom: "30px",
          }}
        >
          Conectar World App
        </button>

        <hr />

        <h2
          style={{
            fontSize: "50px",
            marginTop: "30px",
          }}
        >
          Estado
        </h2>

        <p
          style={{
            fontSize: "28px",
          }}
        >
          {status}
        </p>

        <h2
          style={{
            fontSize: "50px",
            marginTop: "30px",
          }}
        >
          Dirección
        </h2>

        <p
          style={{
            fontSize: "18px",
            wordBreak: "break-all",
          }}
        >
          {wallet}
        </p>

      </div>

    </div>

  );

}

export default App;
