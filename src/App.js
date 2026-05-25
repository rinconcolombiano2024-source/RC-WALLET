import { useEffect, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { ethers } from "ethers";

export default function App() {
  const [status, setStatus] = useState("Esperando World App...");
  const [address, setAddress] = useState("No conectada");
  const [balance, setBalance] = useState("0");
  const [network, setNetwork] = useState("-");

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      if (!MiniKit.isInstalled()) {
        setStatus("Abra la app desde World App");
        return;
      }

      setStatus("World App detectada");

      const provider = window.ethereum;

      if (!provider) {
        setStatus("Provider no detectado");
        return;
      }

      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || !accounts.length) {
        setStatus("Wallet no conectada");
        return;
      }

      const userAddress = accounts[0];

      setAddress(userAddress);

      const ethersProvider = new ethers.BrowserProvider(provider);

      const balanceWei = await ethersProvider.getBalance(userAddress);

      setBalance(ethers.formatEther(balanceWei));

      const net = await ethersProvider.getNetwork();

      setNetwork(net.name);

      setStatus("Wallet conectada");
    } catch (err) {
      console.log(err);
      setStatus("Error conectando");
    }
  }

  return (
    <div
      style={{
        background: "#04146b",
        minHeight: "100vh",
        color: "white",
        padding: 30,
        fontFamily: "Arial",
      }}
    >
      <h1 style={{ fontSize: 60 }}>RC Wallet</h1>

      <p style={{ fontSize: 30 }}>
        Recuperación de fondos Worldcoin
      </p>

      <button
        onClick={init}
        style={{
          padding: 20,
          fontSize: 24,
          borderRadius: 15,
          border: "none",
          marginTop: 30,
        }}
      >
        Conectar Wallet
      </button>

      <hr style={{ marginTop: 40, marginBottom: 40 }} />

      <h2>Estado</h2>
      <p>{status}</p>

      <h2>Dirección</h2>
      <p>{address}</p>

      <h2>ETH Balance</h2>
      <p>{balance}</p>

      <h2>Red</h2>
      <p>{network}</p>
    </div>
  );
}
