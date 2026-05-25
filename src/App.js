import React, {
  useEffect,
  useState
} from "react";

import {
  MiniKit
} from "@worldcoin/minikit-js";

export default function App() {

  const [status, setStatus] =
    useState("Iniciando...");

  const [walletData, setWalletData] =
    useState(null);

  const [installed, setInstalled] =
    useState(false);

  // INICIAR
  useEffect(() => {

    async function init() {

      try {

        const isInstalled =
          MiniKit.isInstalled();

        console.log(
          "MiniKit:",
          isInstalled
        );

        if (isInstalled) {

          setInstalled(true);

          setStatus(
            "World App detectada"
          );

        } else {

          setStatus(
            "Abra RC Wallet desde World App"
          );

        }

      } catch (err) {

        console.log(err);

        setStatus(
          "Error iniciando MiniKit"
        );

      }

    }

    init();

  }, []);

  // CONECTAR
  async function connectWallet() {

    try {

      setStatus(
        "Conectando wallet..."
      );

      // AUTH OFICIAL
      const res =
        await MiniKit.commandsAsync.walletAuth({

          nonce:
            "rc-wallet-login",

          requestId:
            "rc-wallet-" + Date.now(),

          expirationTime:
            new Date(
              Date.now() + 1000 * 60 * 60
            ),

          notBefore:
            new Date()

        });

      console.log(
        "WalletAuth:",
        res
      );

      if (!res) {

        setStatus(
          "Conexión cancelada"
        );

        return;
      }

      setWalletData(res);

      setStatus(
        "Wallet conectada correctamente"
      );

      alert(
        "RC Wallet conectada correctamente"
      );

    } catch (err) {

      console.log(err);

      setStatus(
        "Error conectando wallet"
      );

      alert(
        "Error conectando wallet"
      );

    }

  }

  return (

    <div
      style={{
        background: "#020b5c",
        minHeight: "100vh",
        padding: "30px",
        color: "white",
        fontFamily: "Arial"
      }}
    >

      <div
        style={{
          background: "#06146e",
          borderRadius: "30px",
          padding: "25px"
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
          onClick={connectWallet}
          disabled={!installed}
          style={{
            padding: "16px",
            borderRadius: "15px",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            marginTop: "20px",
            opacity:
              installed ? 1 : 0.5
          }}
        >

          {
            installed
              ? "Conectar Wallet"
              : "Esperando World App..."
          }

        </button>

        <hr
          style={{
            margin: "30px 0"
          }}
        />

        <h2>Estado</h2>

        <p>{status}</p>

        <h2>Datos Wallet</h2>

        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "12px"
          }}
        >
          {
            walletData
              ? JSON.stringify(
                  walletData,
                  null,
                  2
                )
              : "No conectado"
          }
        </pre>

      </div>

    </div>

  );

}
