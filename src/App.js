import React, { useState } from "react";

function App() {

  const [wallet, setWallet] = useState("No conectada");
  const [status, setStatus] = useState("Esperando conexión");

  async function connectWallet() {

    try {

      setStatus("Conectando...");

      // Intenta detectar providers
      const provider =
        window.ethereum ||
        window.worldcoin ||
        window.worldapp;

      console.log("Provider:", provider);

      // Si existe ethereum
      if (window.ethereum) {

        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });

        if (accounts.length > 0) {

          setWallet(accounts[0]);

          setStatus("Conectada con ethereum");

          return;
        }
      }

      // Detecta World App browser
      const userAgent = navigator.userAgent;

      console.log(userAgent);

      if (
        userAgent.includes("WorldApp") ||
        userAgent.includes("Worldcoin")
      ) {

        setStatus("World App detectada");

        alert(
          "World App detectada. Actualmente esta versión necesita integración oficial SDK."
        );

        return;
      }

      alert("No se detectó provider");

      setStatus("Sin provider");

    } catch (error) {

      console.log(error);

      setStatus("Error");

      alert("Error conectando");

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
          onClick={connectWallet}
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
          Conectar World App
        </button>

        <hr />

        <h2
          style={{
            fontSize: "45px",
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
            fontSize: "45px",
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
