import React, { useState, useEffect } from "react";
import { MiniKit } from "@worldcoin/minikit-js";

function App() {

  const [status, setStatus] = useState("Iniciando...");
  const [walletAddress, setWalletAddress] =
    useState("No conectada");

  useEffect(() => {

    const init = async () => {

      try {

        if (!MiniKit.isInstalled()) {

          setStatus(
            "Abra RC Wallet desde World App"
          );

          return;
        }

        setStatus("World App detectada");

      } catch (error) {

        console.log(error);

        setStatus("Error iniciando");
      }
    };

    init();

  }, []);

  const connectWallet = async () => {

    try {

      setStatus("Solicitando autorización...");

      const res =
        await MiniKit.commandsAsync.walletAuth({

          nonce: "rc-wallet-login",

          requestId:
            "rc-wallet-" + Date.now(),

          expirationTime:
            new Date(
              Date.now() + 1000 * 60 * 60
            ),

          notBefore:
            new Date(),
        });

      console.log("Wallet Auth:", res);

      if (!res) {

        setStatus("Autorización cancelada");

        return;
      }

      // Intentar leer wallet address
      const address =
        res.address ||
        res.walletAddress ||
        res.wallet?.address ||
        "Wallet conectada";

      setWalletAddress(address);

      setStatus("Wallet conectada");

      alert(
        "Wallet conectada correctamente"
      );

    } catch (error) {

      console.log(error);

      setStatus("Error conectando");

      alert(
        "Error conectando wallet"
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
          padding: "25px",
          borderRadius: "25px",
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
            padding: "16px",
            width: "100%",
            borderRadius: "15px",
            border: "none",
            fontSize: "22px",
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

        <h2>Dirección Wallet</h2>

        <p
          style={{
            wordBreak: "break-all",
            fontSize: "14px",
          }}
        >
          {walletAddress}
        </p>

      </div>

    </div>
  );
}

export default App;
