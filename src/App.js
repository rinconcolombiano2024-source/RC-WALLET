import React, { useState } from "react";
import { ethers } from "ethers";

export default function App() {

  const [status, setStatus] = useState("Esperando conexión");
  const [address, setAddress] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");
  const [tokens, setTokens] = useState([]);

  async function connectWallet() {

    try {

      // Detectar provider
      const providerDetected =
        window.ethereum ||
        window.worldEthereum ||
        window.web3?.currentProvider;

      if (!providerDetected) {
        alert("World App no detectada");
        setStatus("Provider no detectado");
        return;
      }

      // Crear provider ethers v6
      const provider = new ethers.BrowserProvider(providerDetected);

      // Solicitar cuentas
      await provider.send("eth_requestAccounts", []);

      // Obtener signer
      const signer = await provider.getSigner();

      // Dirección
      const userAddress = await signer.getAddress();

      setAddress(userAddress);

      // Balance ETH
      const ethBalance = await provider.getBalance(userAddress);

      setBalance(
        parseFloat(
          ethers.formatEther(ethBalance)
        ).toFixed(4)
      );

      // Red
      const net = await provider.getNetwork();

      setNetwork(net.name);

      setStatus("Wallet conectada");

      // TOKENS A DETECTAR
      const tokenList = [

        {
          name: "WLD",
          symbol: "WLD",
          contract: "0x163f8c2467924be0ae7b5347228cabf260318753"
        },

        {
          name: "USDC",
          symbol: "USDC",
          contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48"
        }

      ];

      const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      let detected = [];

      for (const token of tokenList) {

        try {

          const contract = new ethers.Contract(
            token.contract,
            abi,
            provider
          );

          const rawBalance =
            await contract.balanceOf(userAddress);

          const decimals =
            await contract.decimals();

          const formatted =
            ethers.formatUnits(rawBalance, decimals);

          if (parseFloat(formatted) > 0) {

            detected.push({
              symbol: token.symbol,
              balance: parseFloat(formatted).toFixed(4)
            });

          }

        } catch (err) {
          console.log(err);
        }

      }

      setTokens(detected);

      alert("RC Wallet conectada correctamente");

    } catch (err) {

      console.log(err);

      alert("Error conectando wallet");

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
          onClick={connectWallet}
          style={{
            padding: "15px",
            borderRadius: "15px",
            border: "none",
            fontSize: "20px",
            marginTop: "20px",
            cursor: "pointer"
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
          tokens.length === 0 ? (
            <p>No hay tokens detectados</p>
          ) : (
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
