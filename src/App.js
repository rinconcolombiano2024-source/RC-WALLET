export default function App() {
  return (
    <div
      style={{
        backgroundColor: "#020b2d",
        minHeight: "100vh",
        padding: "20px",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          maxWidth: "500px",
          margin: "0 auto",
          backgroundColor: "#06123f",
          padding: "20px",
          borderRadius: "20px",
        }}
      >
        <h1 style={{ fontSize: "48px", marginBottom: "10px" }}>
          RC Wallet
        </h1>

        <p style={{ marginBottom: "20px" }}>
          Recuperación de fondos Worldcoin
        </p>

        <button
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          Conectar World App
        </button>

        <hr />

        <h2>Dirección</h2>

        <h2>ETH Balance</h2>

        <p>0</p>

        <hr />

        <h2>Enviar Tokens</h2>

        <input
          placeholder="Dirección destino"
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "10px",
            borderRadius: "10px",
            border: "none",
          }}
        />

        <input
          placeholder="Cantidad"
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "20px",
            borderRadius: "10px",
            border: "none",
          }}
        />

        <hr />

        <h2>Tokens Detectados</h2>
      </div>
    </div>
  );
}
