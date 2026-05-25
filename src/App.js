import React, { useState } from "react";

export default function App() {

  const [status, setStatus] = useState("Esperando conexión");
  const [wallet, setWallet] = useState("No conectada");

  async function conectarWallet() {

    try {

      // Detectar provider
      const ethereum =
        window.ethereum ||
        window.worldEthereum;

      if (!ethereum) {

        alert("No se detectó provider");

        setStatus("Provider no detectado");

        return;
      }

      // Solicitar cuentas
      const accounts =
        await ethereum.request({
          method: "eth_requestAccounts"
        });

      if (!accounts || accounts.length === 0) {

        alert("No hay cuentas");

        return;
      }

      const address = accounts[0];

      setWallet(address);

      setStatus("World App detectada");

      alert("RC Wallet conectada correctamente");

    } catch (error) {

      console.log(error);

      alert("Error conectando");

      setStatus("Error");
    }
  }

  return (

    <div
      style={{
        background: "#020b5c",
        minHeight: "100vh",
        padding: "20px",
        color: "white",
        fontFamily: "Arial"
      }}
    >

      <div
        style={{
          background: "#06146e",
          borderRadius: "25px",
          padding: "20px"
        }}
      >

        <h1
          style={{
            fontSize: "70px"
          }}
        >
          RC Wallet
        </h1>

        <p
          style={{
            fontSize: "22px"
          }}
        >
          Recuperación de fondos Worldcoin
        </p>

        <button
          onClick={conectarWallet}
          style={{
            padding: "16px",
            borderRadius: "15px",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            marginTop: "20px"
          }}
        >
          Conectar Wallet
        </button>

        <hr style={{ margin: "30px 0" }} />

        <h2>Estado</h2>

        <p>{status}</p>

        <h2>Datos Wallet</h2>

        <p
          style={{
            wordBreak: "break-all"
          }}
        >
          {wallet}
        </p>

      </div>

    </div>

  );

}
