import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function App() {

  const [status, setStatus] = useState("Iniciando...");
  const [wallet, setWallet] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");
  const [providerReady, setProviderReady] = useState(false);

  // DETECCIÓN AVANZADA
  async function getEthereumProvider() {

    // Esperar carga de World App
    await new Promise(resolve => setTimeout(resolve, 3000));

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

        const found =
          window.ethereum.providers.find(
            p =>
              p.isWorldApp ||
              p.isMetaMask ||
              p
          );

        if (found) {
          return found;
        }
      }

      // 4 legacy
      if (
        window.web3 &&
        window.web3.currentProvider
      ) {

        return window.web3.currentProvider;
      }

      return null;

    } catch (e) {

      console.log(e);

      return null;
    }
  }

  // AUTO INICIALIZAR
  useEffect(() => {

    async function init() {

      const provider =
        await getEthereumProvider();

      if (provider) {

        setProviderReady(true);

        setStatus("World App detectada");

        // Intentar auto conectar
        try {

          const accounts =
            await provider.request({
              method: "eth_accounts"
            });

          if (
            accounts &&
            accounts.length > 0
          ) {

            loadWallet(provider, accounts[0]);
          }

        } catch (e) {

          console.log(e);
        }

      } else {

        setStatus(
          "Mini App pendiente aprobación"
        );
      }
    }

    init();

  }, []);

  // CARGAR WALLET
  async function loadWallet(
    ethereum,
    address
  ) {

    try {

      const provider =
        new ethers.BrowserProvider(
          ethereum
        );

      setWallet(address);

      // BALANCE
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

      // RED
      const net =
        await provider.getNetwork();

      setNetwork(
        net.name ||
        net.chainId.toString()
      );

      setStatus("Wallet conectada");

    } catch (e) {

      console.log(e);

      setStatus(
        "Error leyendo wallet"
      );
    }
  }

  // CONECTAR
  async function connectWallet() {

    try {

      setStatus("Conectando...");

      const ethereum =
        await getEthereumProvider();

      if (!ethereum) {

        alert(
          "World App aún no aprobó completamente la Mini App"
        );

        setStatus(
          "Provider no disponible"
        );

        return;
      }

      const accounts =
        await ethereum.request({
          method: "eth_requestAccounts"
        });

      if (
        !accounts ||
        accounts.length === 0
      ) {

        setStatus("No autorizado");

        return;
      }

      await loadWallet(
        ethereum,
        accounts[0]
      );

      alert(
        "RC Wallet conectada correctamente"
      );

    } catch (e) {

      console.log(e);

      setStatus("Error conectando");

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
              : "Esperando aprobación..."
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
