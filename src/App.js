import React, { useState } from "react";

function App() {
  const [wallet, setWallet] = useState("");

  const connectWallet = async () => {
    try {

      if (window.ethereum) {

        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });

        setWallet(accounts[0]);

      } else {

        alert("Abra esta app desde World App");

      }

    } catch (err) {
      console.log(err);
      alert("Error conectando");
    }
  };

  return (
    <div
      style={{
        background: "#020b4f",
        minHeight: "100vh",
        padding: "20px",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          background: "#04115f",
          padding: "25px",
          borderRadius: "30px",
          maxWidth: "500px",
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: "60px" }}>
          RC Wallet
        </h1>

        <p style={{ fontSize: "22px" }}>
          Recuperación de fondos Worldcoin
        </p>

        <button
          onClick={connectWallet}
          style={{
            padding: "15px 30px",
            borderRadius: "15px",
            border: "none",
            fontSize: "22px",
            marginTop: "20px",
          }}
        >
          Conectar World App
        </button>

        <hr style={{ margin: "40px 0" }} />

        <h2>Dirección</h2>

        <p>
          {wallet || "No conectada"}
        </p>
      </div>
    </div>
  );
}

export default App;
