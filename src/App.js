import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function App() {

  const [status, setStatus] = useState("Iniciando...");
  const [wallet, setWallet] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");
  const [providerDetected, setProviderDetected] = useState(false);

  // DETECCIÓN ULTRA AVANZADA
  async function detectProvider() {

    // Esperar carga World App
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {

      // 1
      if (window.ethereum) {
        return window.ethereum;
      }

      // 2
      if (window.worldEthereum) {
        return window.worldEthereum;
      }

      // 3
      if (
        window.ethereum &&
        window.ethereum.providers
      ) {

        const provider =
          window.ethereum.providers.find(
            p =>
              p.isWorldApp ||
              p.isMetaMask ||
              p
          );

        if (provider) {
          return provider;
        }
      }

      // 4 legacy
      if (
        window.web3 &&
        window.web3.currentProvider
      ) {

        return window.web3.currentProvider;
      }

      // 5 experimental
      if (window.provider) {
        return window.provider;
      }

      return null;

    } catch (e) {

      console.log(e);

      return null;
    }
  }

  // AUTO DETECTAR
  useEffect(() => {

    async function init() {

      const provider =
        await detectProvider();

      if (provider) {

        setProviderDetected(true);

        setStatus("World App detectada");

      } else {

        setStatus("Provider no detectado");
      }
    }

    init();

  }, []);

  // CONECTAR
  async function connectWallet() {

    try {

      setStatus("Conectando wallet...");

      const ethereum =
        await detectProvider();

      if (!ethereum) {

        setStatus("Provider no detectado");

        alert("World App no detectada");

        return;
      }

      // Solicitar cuentas
      const accounts =
        await ethereum.request({
          method: "eth_requestAccounts"
        });

      if (
        !accounts ||
        accounts.length === 0
      ) {

        setStatus("No hay cuentas");

        return;
      }

      // Provider ethers
      const provider =
        new ethers.BrowserProvider(
          ethereum
        );

      // Signer
      const signer =
        await provider.getSigner();

      // Dirección
      const address =
        await signer.getAddress();

      setWallet(address);

      // Balance ETH
      const ethBalance =
        await provider.getBalance(
          address
        );

      setBalance(
        parseFloat(
          ethers.formatEther(
            ethBalance
          )
        ).toFixed(4)
      );

      // Red
      const net =
        await provider.getNetwork();

      setNetwork(
        net.name ||
        net.chainId.toString()
      );

      setStatus("Wallet conectada");

      alert("RC Wallet conectada correctamente");

    } catch (err) {

      console.log(err);

      setStatus("Error conectando");

      alert("Error conectando wallet");
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
          style={{
            padding: "16px",
            borderRadius: "15px",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            marginTop: "20px"
          }}
        >

          {
            providerDetected
              ? "Conectar Wallet"
              : "Esperando World App..."
          }

        </button>

        <hr style={{ margin: "30px 0" }} />

        <h2>Estado</h2>

        <p>{status}</p>

        <h2>Dirección</h2>

        <p
          style={{
            wordBreak: "break-all"
          }}
        >
          {wallet}
        </p>

        <h2>ETH Balance</h2>

        <p>{balance}</p>

        <h2>Red</h2>

        <p>{network}</p>

      </div>

    </div>

  );

        }
