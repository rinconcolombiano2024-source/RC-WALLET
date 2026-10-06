// ============================================================================
// RC WALLET — CONFIGURATION
// ============================================================================
//
// Regla de seguridad:
// Este archivo contiene únicamente configuración pública del sistema.
//
// NUNCA deben almacenarse aquí:
// - private keys
// - seed phrases
// - contraseñas
// - secretos de API
// - wallets privadas de usuarios
//
// La dirección receptora de una transferencia SIEMPRE debe venir del usuario
// en tiempo de ejecución.
// ============================================================================


// ============================================================================
// WORLD CHAIN
// ============================================================================

export const WORLD_CHAIN_ID = 480;


// ============================================================================
// SAFE — CONSTANTES BASE
// ============================================================================

/**
 * Sentinel utilizado por Safe para listas enlazadas de módulos.
 *
 * Safe utiliza address(0x1) como inicio/final lógico de la lista.
 */
export const SAFE_SENTINEL =
  "0x0000000000000000000000000000000000000001";

/**
 * Storage slot oficial del fallback handler de Safe.
 *
 * keccak256("fallback_manager.handler.address")
 */
export const SAFE_FALLBACK_HANDLER_STORAGE_SLOT =
  "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";

/**
 * Storage slot oficial del transaction guard de Safe.
 *
 * keccak256("guard_manager.guard.address")
 */
export const SAFE_GUARD_STORAGE_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

/**
 * Storage slot oficial del module guard de Safe.
 *
 * keccak256("module_manager.module_guard.address")
 */
export const SAFE_MODULE_GUARD_STORAGE_SLOT =
  "0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947";


// ============================================================================
// LOCAL STORAGE
// ============================================================================
//
// `vault` permanece temporalmente por compatibilidad con código legado.
// El flujo principal de RC Wallet NO debe solicitar private keys.
// ============================================================================

export const STORAGE_KEYS = Object.freeze({
  vault: "rc_wallet_external_vault_v1",
  customTokens: "rc_wallet_custom_tokens_v1",
});


// ============================================================================
// RECOVERY FEE
// ============================================================================
//
// Comisión actualmente DESACTIVADA.
//
// No cambiar RECOVERY_FEE_BPS a un valor > 0 hasta eliminar/refactorizar
// completamente la infraestructura antigua de feeRecipient.
// ============================================================================

export const RECOVERY_FEE_BPS = 0n;
export const BPS_DENOMINATOR = 10_000n;


// ============================================================================
// RC.PL
// ============================================================================

export const RCPL_TOKEN_ADDRESS =
  "0xb9DEe79d682f9dA8B95761036f2763cdE25bD3e8";

export const RCPL_TARGET_PRICE_KEY =
  "rc_wallet_rcpl_target_price_v1";

export const RCPL_STAKING_CONTRACT = "";

export const RCPL_POOL_MANAGER_CONTRACT = "";


// ============================================================================
// PERMIT2
// ============================================================================

export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";


// ============================================================================
// ERC-4337
// ============================================================================
//
// IMPORTANTE:
//
// La existencia de un EntryPoint en una blockchain NO demuestra que una
// dirección concreta soporte ERC-4337.
//
// Esta lista únicamente permite detectar infraestructura existente en la red.
// La compatibilidad de la smart account debe comprobarse independientemente.
// ============================================================================

export const ERC4337_ENTRYPOINTS = Object.freeze([
  {
    version: "v0.6",
    address: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    label: "EntryPoint ERC-4337 v0.6",
  },
]);


// ============================================================================
// CATÁLOGO DE RUTAS DE RECUPERACIÓN
// ============================================================================

export const RECOVERY_ROUTE_CATALOG = Object.freeze([
  {
    id: "world-minikit",
    name: "World App MiniKit",
    requirement:
      "World Chain, sesión World App válida y allowlist en Developer Portal",
  },

  {
    id: "external-signer",
    name: "Wallet externa EIP-1193 / WalletConnect",
    requirement:
      "Para una EOA, la wallet firmante debe controlar exactamente la dirección donde están los fondos",
  },

  {
    id: "safe-multichain",
    name: "Safe / despliegue determinístico",
    requirement:
      "Factory, singleton, owners, threshold, fallback handler, módulos, initializer, saltNonce y creationCode deben ser verificables",
  },

  {
    id: "erc-1271",
    name: "Firma de contrato EIP-1271",
    requirement:
      "La smart account debe validar una firma real mediante isValidSignature",
  },

  {
    id: "erc-4337",
    name: "ERC-4337 UserOperation",
    requirement:
      "La cuenta debe tener módulo/implementación ERC-4337 compatible, EntryPoint correcto, bundler y firma válida",
  },

  {
    id: "bridge",
    name: "Bridge / salida a exchange",
    requirement:
      "Debe existir autoridad de firma válida en la red origen antes de intentar cualquier bridge",
  },
]);


// ============================================================================
// BRIDGES
// ============================================================================
//
// Un bridge NO resuelve ausencia de autoridad sobre la wallet origen.
//
// Solo debe utilizarse después de demostrar que la cuenta puede firmar/
// ejecutar en la blockchain donde actualmente están los activos.
// ============================================================================

export const WORLD_CHAIN_BRIDGES = Object.freeze([
  {
    name: "Alchemy Bridge",
    url: "https://worldchain-mainnet.bridge.alchemy.com",
    type: "native",
    note:
      "Bridge nativo de World Chain para depositar y retirar activos.",
  },

  {
    name: "Superbridge",
    url: "https://superbridge.app/world-chain",
    type: "native",
    note:
      "Interfaz Superchain para ETH y ERC20 entre Ethereum y World Chain.",
  },

  {
    name: "Across",
    url: "https://app.across.to",
    type: "third-party",
    note:
      "Proveedor externo para rutas compatibles entre World Chain y otras redes.",
  },

  {
    name: "Brid.gg",
    url: "https://brid.gg",
    type: "third-party",
    note:
      "Bridge para Ethereum y OP Chains, incluyendo World Chain.",
  },

  {
    name: "Synapse",
    url: "https://synapseprotocol.com",
    type: "third-party",
    note:
      "Bridge externo para transferencias entre redes compatibles.",
  },

  {
    name: "Thirdweb Universal Bridge",
    url: "https://portal.thirdweb.com/connect/pay",
    type: "third-party",
    note:
      "Ruta universal para onramp, swap y bridge en redes EVM compatibles.",
  },
]);


// ============================================================================
// NETWORKS
// ============================================================================
//
// `writableWithMiniKit` significa únicamente que RC Wallet puede utilizar
// MiniKit para esa red.
//
// NO significa que una dirección World App tenga automáticamente autoridad
// sobre la misma dirección en otras EVM.
// ============================================================================

export const NETWORKS = Object.freeze([
  {
    name: "World Chain",
    chainId: 480,
    chainHex: "0x1e0",
    symbol: "ETH",
    rpcUrls: [
      "https://worldchain-mainnet.g.alchemy.com/public",
    ],
    explorer: "https://worldscan.org",
    writableWithMiniKit: true,
  },

  {
    name: "Ethereum",
    chainId: 1,
    chainHex: "0x1",
    symbol: "ETH",
    rpcUrls: [
      "https://ethereum-rpc.publicnode.com",
      "https://cloudflare-eth.com",
    ],
    explorer: "https://etherscan.io",
    writableWithMiniKit: false,
  },

  {
    name: "Optimism",
    chainId: 10,
    chainHex: "0xa",
    symbol: "ETH",
    rpcUrls: [
      "https://mainnet.optimism.io",
      "https://optimism-rpc.publicnode.com",
    ],
    explorer: "https://optimistic.etherscan.io",
    writableWithMiniKit: false,
  },

  {
    name: "Base",
    chainId: 8453,
    chainHex: "0x2105",
    symbol: "ETH",
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
    ],
    explorer: "https://basescan.org",
    writableWithMiniKit: false,
  },

  {
    name: "BNB Chain",
    chainId: 56,
    chainHex: "0x38",
    symbol: "BNB",
    rpcUrls: [
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc-rpc.publicnode.com",
    ],
    explorer: "https://bscscan.com",
    writableWithMiniKit: false,
  },

  {
    name: "World Chain Sepolia",
    chainId: 4801,
    chainHex: "0x12c1",
    symbol: "ETH",
    rpcUrls: [
      "https://worldchain-sepolia.g.alchemy.com/public",
    ],
    explorer: "https://sepolia.worldscan.org",
    writableWithMiniKit: false,
    testnet: true,
  },
]);


// ============================================================================
// TOKENS
// ============================================================================
//
// La ausencia de un token en esta lista NO significa que la wallet no tenga
// otros activos.
//
// Un RPC estándar no descubre automáticamente todos los ERC-20 de una wallet.
// Para eso será necesario un indexador.
// ============================================================================

export const TOKENS = Object.freeze([
  {
    symbol: "RC.PL",
    expectedDecimals: 18,
    projectToken: true,
    addresses: {
      480: RCPL_TOKEN_ADDRESS,
    },
  },

  {
    symbol: "WLD",
    expectedDecimals: 18,
    addresses: {
      480: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
      10: "0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1",
      1: "0x163f8C2467924be0ae7B5347228CABF260318753",
    },
  },

  {
    symbol: "USDC",
    expectedDecimals: 6,
    addresses: {
      480: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
      10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      4801: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
    },
  },

  {
    symbol: "USDT",
    expectedDecimals: 6,
    addresses: {
      10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
  },

  {
    symbol: "WBTC",
    expectedDecimals: 8,
    addresses: {
      480: "0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3",
    },
  },

  {
    symbol: "WETH",
    expectedDecimals: 18,
    addresses: {
      480: "0x4200000000000000000000000000000000000006",
    },
  },

  {
    symbol: "GOLD",
    expectedDecimals: 18,
    addresses: {
      480: "0x25aC3DB36bDCE12b9E4340ffb62B8DC1c0b5EF91",
    },
  },

  {
    symbol: "SUSHI",
    expectedDecimals: 18,
    addresses: {
      480: "0x6A1cD7B1981FdEEb8f8702B36C4b225389658E29",
    },
  },

  {
    symbol: "MADS",
    expectedDecimals: 18,
    addresses: {
      480: "0x39fCEFD22C3407E3e4CdCD60831631Ff6A1cD7B1",
    },
  },

  {
    symbol: "RCOL",
    expectedDecimals: 18,
    addresses: {
      480: "0x78BCefd3407E3e4cdCD60831631Ff6A1CD7b25aC",
    },
  },

  {
    symbol: "CUSTOM",
    expectedDecimals: 18,
    addresses: {
      480: "0xfEA3A03B06c31F863f62789d80C2b335904a9c05",
    },
  },

  {
    symbol: "CUSTOM2",
    expectedDecimals: 18,
    addresses: {
      480: "0xb15e3ce3588b1B8887Cf3F4bA9FC680432478Cfe",
    },
  },
]);


// ============================================================================
// ERC-20 ABI
// ============================================================================

export const ERC20_ABI = Object.freeze([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 value) returns (bool)",
]);


// ============================================================================
// SAFE INTROSPECTION ABI
// ============================================================================
//
// `masterCopy()` es implementado por el proxy Safe y permite identificar
// la implementación/singleton que utiliza la cuenta.
//
// `nonce()` es imprescindible para construir posteriormente una verdadera
// Safe transaction y evitar replay.
//
// Estos métodos son únicamente de inspección. Detectar una Safe NO significa
// que RC Wallet ya pueda mover sus fondos.
// ============================================================================

export const SAFE_INTROSPECTION_ABI = Object.freeze([
  "function VERSION() view returns (string)",

  "function masterCopy() view returns (address)",

  "function getOwners() view returns (address[])",

  "function getThreshold() view returns (uint256)",

  "function nonce() view returns (uint256)",

  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
]);


// ============================================================================
// ERC-1271 ABI
// ============================================================================
//
// IMPORTANTE:
//
// Un revert usando una firma ficticia NO demuestra que el contrato no soporte
// EIP-1271.
//
// La prueba definitiva requiere hash + firma reales.
// ============================================================================

export const ERC1271_ABI = Object.freeze([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);
