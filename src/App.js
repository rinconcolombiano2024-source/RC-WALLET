import React, { useEffect, useState } from "react";

function App() {

  const [status, setStatus] = useState("Esperando conexión");
  const [wallet, setWallet] = useState("No conectada");

  useEffect(() => {

    detectarWorldApp();

  }, []);

  async function detectarWorldApp() {

    const ua = navigator.userAgent;

    console.log("USER AGENT:", ua);

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

      setStatus("Conectando...");

      // NUEVO MÉTODO
      if (window.WorldApp) {

        const walletData =
          await window.WorldApp.getUser();

        console.log(walletData);

        setWallet(
          JSON.stringify(walletData)
        );

        setStatus("Wallet conectada");

      } else {

        alert(
          "SDK World App no disponible"
        );

        setStatus(
          "SDK no disponible"
        );

      }

    } catch (err) {

      console.log(err);

      alert("Error conectando");

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
          Datos Wallet
        </h2>

        <p
          style={{
            fontSize: "14px",
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
