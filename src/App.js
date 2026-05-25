import React, { useState, useEffect } from "react";

function App() {

  const [status, setStatus] = useState("Esperando");
  const [userAgent, setUserAgent] = useState("");
  const [isWorldApp, setIsWorldApp] = useState(false);

  useEffect(() => {

    const ua = navigator.userAgent;

    setUserAgent(ua);

    if (
      ua.toLowerCase().includes("world") ||
      ua.toLowerCase().includes("wv")
    ) {

      setIsWorldApp(true);

      setStatus("World App detectada");

    } else {

      setStatus("No es World App");

    }

  }, []);

  async function conectar() {

    try {

      if (!isWorldApp) {

        alert("Abra esta app desde World App");

        return;
      }

      setStatus("Mini App abierta correctamente");

      alert("RC Wallet conectada correctamente");

    } catch (err) {

      console.log(err);

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
          onClick={conectar}
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
          Conectar
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
          World App
        </h2>

        <p
          style={{
            fontSize: "24px",
          }}
        >
          {isWorldApp ? "Sí" : "No"}
        </p>

        <h2
          style={{
            fontSize: "30px",
            marginTop: "30px",
          }}
        >
          User Agent
        </h2>

        <p
          style={{
            fontSize: "12px",
            wordBreak: "break-all",
          }}
        >
          {userAgent}
        </p>

      </div>

    </div>

  );

}

export default App;
