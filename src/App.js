import React, { useState } from "react";

function App() {
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState("0");
  const [tokens, setTokens] = useState([]);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("World App no detectada");
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const account = accounts[0];
      setWallet(account);

      const ethBalance = await window.ethereum.request({
        method: "eth_getBalance",
        params: [account, "latest"],
      });

      const balanceInEth =
        parseInt(ethBalance, 16) / 1000000000000000000;

      setBalance(balanceInEth.toFixed(4));

      setTokens([
        {
          symbol: "WLD",
          amount: "120",
        },
        {
          symbol: "ETH",
          amount: balanceInEth.toFixed(4),
        },
      ]);
    } catch (error) {
      console.log(error);
      alert("Error conectando wallet");
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
        <h1 style={{ fontSize: "60px", marginBottom: "10px" }}>
          RC Wallet
        </h1>

        <p style={{ fontSize: "20px" }}>
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
            cursor: "pointer",
          }}
        >
          Conectar World App
        </button>

        <hr style={{ margin: "40px 0" }} />

        <h2 style={{ fontSize: "45px" }}>Dirección</h2>

        <p
          style={{
            wordBreak: "break-all",
            fontSize: "18px",
          }}
        >
          {wallet || "No conectada"}
        </p>

        <h2 style={{ fontSize: "45px", marginTop: "30px" }}>
          ETH Balance
        </h2>

        <p style={{ fontSize: "30px" }}>
          {balance}
        </p>

        <hr style={{ margin: "40px 0" }} />

        <h2 style={{ fontSize: "45px" }}>
          Enviar Tokens
        </h2>

        <input
          type="text"
          placeholder="Dirección destino"
          style={{
            width: "100%",
            padding: "20px",
            borderRadius: "15px",
            border: "none",
            marginTop: "20px",
            fontSize: "20px",
          }}
        />

        <input
          type="number"
          placeholder="Cantidad"
          style={{
            width: "100%",
            padding: "20px",
            borderRadius: "15px",
            border: "none",
            marginTop: "20px",
            fontSize: "20px",
          }}
        />

        <button
          style={{
            width: "100%",
            padding: "20px",
            borderRadius: "15px",
            border: "none",
            marginTop: "20px",
            fontSize: "22px",
            cursor: "pointer",
          }}
        >
          Enviar
        </button>

        <hr style={{ margin: "40px 0" }} />

        <h2 style={{ fontSize: "45px" }}>
          Tokens Detectados
        </h2>

        {tokens.map((token, index) => (
          <div
            key={index}
            style={{
              background: "#0a1d7a",
              padding: "20px",
              borderRadius: "15px",
              marginTop: "15px",
            }}
          >
            <h3 style={{ fontSize: "28px" }}>
              {token.symbol}
            </h3>

            <p style={{ fontSize: "22px" }}>
              Balance: {token.amount}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
