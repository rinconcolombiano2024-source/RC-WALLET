import React, { useState } from "react";
import { ethers } from "ethers";
import { MiniKit } from "@worldcoin/minikit-js";

export default function App() {

  const [status, setStatus] = useState("Esperando conexión");
  const [address, setAddress] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");
  const [tokens, setTokens] = useState([]);

  async function verifyWorldApp() {

    try {

      if (!MiniKit.isInstalled()) {

        alert("Abra esta Mini App desde World App");

        setStatus("World App no detectada");

        return;

      }

      alert("World App detectada correctamente");

      setStatus("World App detectada");

    } catch (err) {

      console.log(err);

      setStatus("Error detectando World App");

    }

  }

  async function connectWallet() {

    try {

      if (!MiniKit.isInstalled()) {

        alert("Abra esta app desde World App");

        return;

      }

      const providerDetected = window.ethereum;

      if (!providerDetected) {

        alert("Provider no disponible aún");

        setStatus("Provider no detectado");

        return;

      }

      const provider =
        new ethers.BrowserProvider(providerDetected);

      await provider.send(
        "eth_requestAccounts",
        []
      );

      const signer = await provider.getSigner();

      const userAddress =
        await signer.getAddress();

      setAddress(userAddress);

      const ethBalance =
        await provider.getBalance(userAddress);

      setBalance(
        parseFloat(
          ethers.formatEther(ethBalance)
        ).toFixed(4)
      );

      const net =
        await provider.getNetwork();

      setNetwork(net.name);

      setStatus("Wallet conectada");

      const tokenList = [

        {
          name: "WLD",
          symbol: "WLD",
          contract:
            "0x163f8c2467924be0ae7b5347228cabf260318753"
        }

      ];

      const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      let detected = [];

      for (const token of tokenList) {

        try {

          const contract =
            new ethers.Contract(
              token.contract,
              abi,
              provider
            );

          const raw =
            await contract.balanceOf(userAddress);

          const decimals =
            await contract.decimals();

          const formatted =
            ethers.formatUnits(raw, decimals);

          if (parseFloat(formatted) > 0) {

            detected.push({
              symbol: token.symbol,
              balance:
                parseFloat(formatted).toFixed(4)
            });

          }

        } catch (err) {

          console.log(err);

        }

      }

      setTokens(detected);

      alert("Wallet conectada correctamente");

    } catch (err) {

      console.log(err);

      alert("Error conectando");

      setStatus("Error");

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
          padding: "25px",
          borderRadius: "25px"
        }}
      >

        <h1 style={{ fontSize: "70px" }}>
          RC Wallet
        </h1>

        <p style={{ fontSize: "20px" }}>
          Recuperación de fondos Worldcoin
        </p>

        <button
          onClick={verifyWorldApp}
          style={{
            padding: "15px",
            borderRadius: "15px",
            border: "none",
            marginTop: "20px",
            marginRight: "10px",
            fontSize: "18px"
          }}
        >
          Verificar World App
        </button>

        <button
          onClick={connectWallet}
          style={{
            padding: "15px",
            borderRadius: "15px",
            border: "none",
            marginTop: "20px",
            fontSize: "18px"
          }}
        >
          Conectar Wallet
        </button>

        <hr style={{ margin: "30px 0" }} />

        <h2>Estado</h2>
        <p>{status}</p>

        <h2>Dirección</h2>
        <p style={{ wordBreak: "break-all" }}>
          {address}
        </p>

        <h2>ETH Balance</h2>
        <p>{balance}</p>

        <h2>Red</h2>
        <p>{network}</p>

        <hr style={{ margin: "30px 0" }} />

        <h2>Tokens Detectados</h2>

        {
          tokens.length === 0
          ? (
            <p>No hay tokens detectados</p>
          )
          : (
            tokens.map((token, index) => (
              <div key={index}>
                <p>
                  {token.symbol}: {token.balance}
                </p>
              </div>
            ))
          )
        }

      </div>

    </div>

  );

          }
