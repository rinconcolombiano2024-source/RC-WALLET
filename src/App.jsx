import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { ethers } from "ethers";

const NETWORKS = [
  {
    name: "Ethereum",
    chainId: 1,
    hex: "0x1",
    symbol: "ETH",
    rpc: [
      "https://publicnode.com",
      "https://ankr.com",
    ],
  },
  {
    name: "Optimism",
    chainId: 10,
    hex: "0xa",
    symbol: "ETH",
    rpc: [
      "https://optimism.io",
      "https://ankr.com",
    ],
  },
  {
    name: "BNB Chain",
    chainId: 56,
    hex: "0x38",
    symbol: "BNB",
    rpc: [
      "https://binance.org",
      "https://ankr.com",
    ],
  },
  {
    name: "Base",
    chainId: 8453,
    hex: "0x2105",
    symbol: "ETH",
    rpc: [
      "https://base.org",
      "https://publicnode.com",
    ],
  },
  {
    name: "World Chain",
    chainId: 480,
    hex: "0x1e0",
    symbol: "ETH",
    rpc: [
      "https://alchemy.com",
      "https://drpc.org",
    ],
  },
];

const TOKENS = [
  {
    symbol: "WLD",
    decimals: 18,
    addresses: {
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",
      10: "0x163f8C2467924be0ae7B5347228CABF260318753",
      480: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
    },
  },
  {
    symbol: "USDC",
    decimals: 6,
    addresses: {
      1: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      10: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      8453: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
    },
  },
  {
    symbol: "USDT",
    decimals: 6,
    addresses: {
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      56: "0x55d398326f99059fF775485246999027B3197955",
      8453: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
  },
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
];

export default function App() {
  const mountedRef = useRef(true);

  // Estados de Conexión e Información
  const [status, setStatus] = useState("Inicializando RC Wallet...");
  const [wallet, setWallet] = useState("");
  const [network, setNetwork] = useState("");
  const [nativeBalance, setNativeBalance] = useState("0");
  const [tokensDetected, setTokensDetected] = useState([]);

  // Estados del Formulario de Envío Manual
  const [selectedToken, setSelectedToken] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);

  // 1. Encontrar un nodo RPC funcional de forma segura con Timeout
  async function getWorkingProvider(rpcList) {
    for (const rpc of rpcList) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc);
        await Promise.race([
          provider.getBlockNumber(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC Timeout")), 3000)
          ),
        ]);
        return provider;
      } catch (err) {
        console.log(`Fallo en nodo RPC: ${rpc}`);
      }
    }
    return null;
  }

  // 2. Función completa para escanear balances (Anti Rate-Limit)
  const scanAllNetworks = useCallback(async (address) => {
    setStatus("Buscando fondos en múltiples redes...");
    let tempDetectedTokens = [];

    for (const net of NETWORKS) {
      if (!mountedRef.current) return;

      const provider = await getWorkingProvider(net.rpc);
      if (!provider) continue;

      try {
        // Consultar balance nativo de la moneda de la red (ETH / BNB)
        const bal = await provider.getBalance(address);
        if (bal > 0n) {
          tempDetectedTokens.push({
            network: net.name,
            symbol: net.symbol,
            balance: Number(ethers.formatEther(bal)).toFixed(4),
            isNative: true,
            chainId: net.chainId,
            address: "NATIVO",
            decimals: 18,
          });
        }

        // Consultar los tokens ERC20 configurados para esta red
        for (const token of TOKENS) {
          const tokenAddress = token.addresses[net.chainId];
          if (!tokenAddress) continue;

          const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const tokenBal = await contract.balanceOf(address);

          if (tokenBal > 0n) {
            tempDetectedTokens.push({
              network: net.name,
              symbol: token.symbol,
              balance: Number(ethers.formatUnits(tokenBal, token.decimals)).toFixed(4),
              isNative: false,
              address: tokenAddress,
              chainId: net.chainId,
              decimals: token.decimals,
            });
          }
        }
      } catch (err) {
        console.error(`Error escaneando red ${net.name}:`, err);
      }

      // Pausa controlada de 150ms para evitar respuestas HTTP 429 (Too Many Requests)
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (mountedRef.current) {
      setTokensDetected(tempDetectedTokens);
      // Auto-seleccionar el primer activo detectado en el formulario si existe
      if (tempDetectedTokens.length > 0) {
        setSelectedToken(JSON.stringify(tempDetectedTokens[0]));
      }
    }
  }, []);

  // 3. Inicialización adaptada al entorno (World App MiniKit o Navegador Web3 tradicional)
  const initialize = useCallback(async () => {
    try {
      if (typeof window === "undefined") return;

      console.log("Análisis de inyección:", {
        ethereum: !!window.ethereum,
        miniKit: !!window.MiniKit,
      });

      let address = "";
      let provider = null;
      let chainId = 1;

      // ENTORNO A: Ejecución interna dentro de la World App (MiniKit oficial)
      if (window.MiniKit) {
        setStatus("Conectando con World App MiniKit...");
        
        if (typeof window.MiniKit.isInstalled === "function" && !window.MiniKit.isInstalled()) {
          setStatus("MiniKit no está listo en el dispositivo móvil");
          return;
        }

        const response = await window.MiniKit.commands.walletAddress();
        if (response?.address) {
          address = response.address;
        } else {
          setStatus("Acceso a cuenta rechazado en World App");
          return;
        }
      } 
      // ENTORNO B: Ejecución en Navegadores convencionales (MetaMask, OKX, etc.)
      else {
        const ethereum = await waitForEthereum();
        if (!ethereum) {
          setStatus("Error: Abre la app dentro de World App o usa un navegador Web3");
          return;
        }

        setupListeners(ethereum);
        let accounts = [];

        try {
          accounts = await ethereum.request({ method: "eth_accounts" });
        } catch (err) {
          console.log("Error al consultar cuentas activas");
        }

        if (!accounts || accounts.length === 0) {
          try {
            accounts = await ethereum.request({ method: "eth_requestAccounts" });
          } catch (err) {
            setStatus("Conexión rechazada por el usuario");
            return;
          }
        }

        if (!accounts || accounts.length === 0) {
          setStatus("Billetera Web3 no detectada");
          return;
        }

        address = accounts[0];
        provider = new ethers.BrowserProvider(ethereum);
        const currentNetwork = await provider.getNetwork();
        chainId = Number(currentNetwork.chainId);
      }

      if (!mountedRef.current) return;

      setWallet(address);
      const activeNet = NETWORKS.find((n) => n.chainId === chainId) || NETWORKS[0];
      setNetwork(`${activeNet.name} (${activeNet.chainId})`);

      if (provider) {
        const balance = await provider.getBalance(address);
        setNativeBalance(Number(ethers.formatEther(balance)).toFixed(4));
      }

      await scanAllNetworks(address);
      setStatus("Wallet conectada con éxito");

    } catch (err) {
      console.error(err);
      if (mountedRef.current) {
        setStatus(err?.message || "Error general de sincronización");
      }
    }
  }, [scanAllNetworks]);

  async function waitForEthereum() {
    for (let i = 0; i < 15; i++) {
      if (typeof window !== "undefined" && window?.ethereum) {
        return window.ethereum;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  function setupListeners(ethereum) {
    if (!ethereum?.on) return;
    ethereum.on("accountsChanged", async (accounts) => {
      if (accounts?.length && mountedRef.current) {
        setWallet(accounts[0]);
        await scanAllNetworks(accounts[0]);
      }
    });
    ethereum.on("chainChanged", () => {
      window.location.reload();
    });
  }

  // 4. Lógica de transferencia adaptada
  const handleSend = async () => {
    if (!recipient || !sendAmount || !selectedToken) {
      setStatus("Error: Rellena todos los campos del envío.");
      return;
    }

    setSending(true);
    setStatus("Procesando transferencia...");

    try {
      const tokenInfo = JSON.parse(selectedToken);

      // CASO A: Envío desde World App usando comandos del SDK
      if (window.MiniKit) {
        setStatus("Esperando confirmación nativa en World App...");
        
        let txCommandPayload = [];

        if (tokenInfo.isNative) {
          // Transferencia de moneda nativa de la red
          txCommandPayload = [
            {
              to: recipient,
              value: ethers.parseEther(sendAmount).toString(),
            }
          ];
        } else {
          // Transferencia de token ERC20 (WLD, USDC, USDT)
          const parsedAmount = ethers.parseUnits(sendAmount, tokenInfo.decimals).toString();
          txCommandPayload = [
            {
              address: tokenInfo.address,
              abi: ERC20_ABI,
              functionName: "transfer",
            }
            }
      }
    }
    
