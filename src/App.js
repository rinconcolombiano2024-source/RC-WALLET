import React, { useState } from "react";

function App() {

  const [status, setStatus] = useState("Esperando conexión");
  const [wallet, setWallet] = useState("No conectada");

  const connectWallet = async () => {

    try {

      setStatus("Detectando entorno...");

      // Detectar World App
      const isWorldApp =
        navigator.userAgent.includes("WorldApp") ||
        navigator.userAgent.includes("WorldCoin") ||
        window.location !== window.parent.location;

      if (!isWorldApp) {
        alert("Abra esta app desde World App");
        setStatus("No es World App");
        return;
      }

      // Intentar provider moderno
      if (window.ethereum) {

        setStatus("Conectando provider...");

        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });

        if (accounts && accounts.length > 0) {

          setWallet(accounts[0]);

          setStatus("Wallet conectada");

          alert("RC Wallet conectada correctamente");

        } else {

          setStatus("Sin cuentas");

          alert("No se encontraron cuentas");
        }

      } else {

        setStatus("Provider no detectado");

        alert("Provider no disponible");
      }

    } catch (error) {

      console.log(error);

      setStatus("Error");

      alert("Error conectando");
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
            fontSize: "30px",
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

      </div>

    </div>
  );
}

export default App;
