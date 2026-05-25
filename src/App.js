import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function App() {

  const [status, setStatus] = useState("Iniciando...");
  const [address, setAddress] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");
  const [providerReady, setProviderReady] = useState(false);

  // DETECTAR PROVIDER
  async function getProvider() {

    // Esperar un poco
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Ethereum normal
    if (window.ethereum) {
      return window.ethereum;
    }

    // Algunos wallets usan providers[]
    if (
      window.ethereum &&
      window.ethereum.providers
    ) {

      const provider =
        window.ethereum.providers.find(
          p => p.isMetaMask || p.isWorldApp || p
        );

      if (provider) {
        return provider;
      }
    }

    // World App WebView fallback
    if (window.web3?.currentProvider) {
      return window.web3.currentProvider;
    }

    return null;
  }

  useEffect(() => {

    async function init() {

      const provider = await getProvider();

      if (provider) {

        setProviderReady(true);

        setStatus("World App detectada");

      } else {

        setStatus("Provider no detectado");
      }
    }

    init();

  }, []);

  async function connectWallet() {

    try {

      setStatus("Conectando...");

      const ethereum = await getProvider();

      if (!ethereum) {

        alert("World App no detectada");

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

      const provider =
        new ethers.BrowserProvider(
          ethereum
        );

      const signer =
        await provider.getSigner();

      const userAddress =
        await signer.getAddress();

      setAddress(userAddress);

      // BALANCE ETH
      const ethBalance =
        await provider.getBalance(
          userAddress
        );

      setBalance(
        parseFloat(
          ethers.formatEther(
            ethBalance
          )
        ).toFixed(4)
      );

      // RED
      const chain =
        await provider.getNetwork();

      setNetwork(
        chain.name || chain.chainId.toString()
      );

      setStatus("Wallet conectada");

      alert("Wallet conectada correctamente");

    } catch (err) {

      console.log(err);

      setStatus("Error");

      alert("Error conectando");
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
            providerReady
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
          {address}
        </p>

        <h2>ETH Balance</h2>

        <p>{balance}</p>

        <h2>Red</h2>

        <p>{network}</p>

      </div>

    </div>

  );

}
