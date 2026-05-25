import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function App() {

  const [providerReady, setProviderReady] = useState(false);
  const [status, setStatus] = useState("Iniciando...");
  const [address, setAddress] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");
  const [tokens, setTokens] = useState([]);

  // BUSCAR PROVIDER
  async function detectProvider() {

    return new Promise((resolve) => {

      let tries = 0;

      const interval = setInterval(() => {

        tries++;

        // Provider principal
        if (window.ethereum) {

          clearInterval(interval);

          resolve(window.ethereum);

          return;
        }

        // Algunos wallets usan providers[]
        if (
          window.ethereum &&
          window.ethereum.providers
        ) {

          const found =
            window.ethereum.providers.find(
              (p) => p
            );

          if (found) {

            clearInterval(interval);

            resolve(found);

            return;
          }
        }

        if (tries > 20) {

          clearInterval(interval);

          resolve(null);
        }

      }, 1000);

    });

  }

  // AUTO DETECCIÓN
  useEffect(() => {

    async function init() {

      const provider =
        await detectProvider();

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

      const ethereum =
        await detectProvider();

      if (!ethereum) {

        alert(
          "World App no detectada"
        );

        setStatus(
          "Provider no detectado"
        );

        return;
      }

      // REQUEST MANUAL
      const accounts =
        await ethereum.request({
          method: "eth_requestAccounts"
        });

      if (
        !accounts ||
        accounts.length === 0
      ) {

        alert("Sin cuentas");

        return;
      }

      // ETHERS V6
      const provider =
        new ethers.BrowserProvider(
          ethereum
        );

      const signer =
        await provider.getSigner();

      const userAddress =
        await signer.getAddress();

      setAddress(userAddress);

      // RED
      const chain =
        await provider.getNetwork();

      setNetwork(
        chain.name || chain.chainId.toString()
      );

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

      // TOKENS ERC20
      const tokenContracts = [

        {
          symbol: "WLD",
          address:
            "0x163f8c2467924be0ae7b5347228cabf260318753"
        },

        {
          symbol: "USDC",
          address:
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48"
        }

      ];

      const abi = [

        "function balanceOf(address owner) view returns (uint256)",

        "function decimals() view returns (uint8)",

        "function symbol() view returns (string)"
      ];

      let detected = [];

      for (const token of tokenContracts) {

        try {

          const contract =
            new ethers.Contract(
              token.address,
              abi,
              provider
            );

          const rawBalance =
            await contract.balanceOf(
              userAddress
            );

          const decimals =
            await contract.decimals();

          const formatted =
            ethers.formatUnits(
              rawBalance,
              decimals
            );

          if (
            parseFloat(formatted) > 0
          ) {

            detected.push({

              symbol: token.symbol,

              balance:
                parseFloat(
                  formatted
                ).toFixed(4),

              contract:
                token.address
            });

          }

        } catch (err) {

          console.log(
            "Error token:",
            err
          );

        }

      }

      setTokens(detected);

      setStatus(
        "Wallet conectada"
      );

      // EVENTOS
      ethereum.on?.(
        "accountsChanged",
        () => {
          window.location.reload();
        }
      );

      ethereum.on?.(
        "chainChanged",
        () => {
          window.location.reload();
        }
      );

      alert(
        "RC Wallet conectada correctamente"
      );

    } catch (err) {

      console.log(err);

      setStatus("Error");

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

        <hr style={{ margin: "30px 0" }} />

        <h2>Tokens Detectados</h2>

        {
          tokens.length === 0
          ? (
            <p>
              No hay tokens detectados
            </p>
          )
          : (
            tokens.map(
              (token, index) => (

                <div
                  key={index}
                  style={{
                    marginBottom: "15px"
                  }}
                >

                  <p>
                    {token.symbol}
                  </p>

                  <p>
                    Balance:
                    {" "}
                    {token.balance}
                  </p>

                </div>

              )
            )
          )
        }

      </div>

    </div>

  );

  }
