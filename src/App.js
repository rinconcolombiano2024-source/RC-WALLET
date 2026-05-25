import "../styles.css";

export default function App() {
  return (
    <div className="app">
      <div className="card">
        <h1>RC Wallet</h1>
        <p>Recuperación de fondos Worldcoin</p>

        <button>
          Conectar World App
        </button>

        <hr />

        <h2>Dirección</h2>

        <h2>ETH Balance</h2>
        <p>0</p>

        <hr />

        <h2>Enviar Tokens</h2>

        <input placeholder="Dirección destino" />
        <input placeholder="Cantidad" />

        <hr />

        <h2>Tokens Detectados</h2>
      </div>
    </div>
  );
}
