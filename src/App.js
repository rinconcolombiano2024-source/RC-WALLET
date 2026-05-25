import React, { useState } from "react";

function App() {

  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState("No conectado");

  const connectWallet = async () => {

    try {

      setStatus("Conectando...");

      // Detectar World App
      if (window.ethereum) {

        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });

        if (accounts.length > 0) {

          setWallet(accounts[0]);
          setStatus("Wallet conectada");

        } else {

          setStatus("No se encontró wallet");

        }

      } else {

        // Mensaje si no detecta provider
        setStatus("World App no disponible");

        alert(
          "World App no detectada.\n\nAbra esta Mini App directamente desde World App."
        );

      }

    } catch (error) {

      console.log(error);

      setStatus("Error de conexión");

      alert("Error conectando wallet");

    }

  };

  return (

    <div
      style={{
        backgroundColor: "#020B4F",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "Arial",
        color: "white",
      }}
    >

      <div
        style={{
          backgroundColor: "#04115F",
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
            fontSize: "24px",
            marginBottom: "30px",
          }}
        >
          Recuperación de fondos Worldcoin
        </p>

        <button
          onClick={connectWallet}
          style={{
            padding: "18px 30px",
            borderRadius: "15px",
            border: "none",
            fontSize: "22px",
            cursor: "pointer",
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
            fontSize: "22px",
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
          {wallet || "No conectada"}
        </p>

      </div>

    </div>

  );

}

export default App;
