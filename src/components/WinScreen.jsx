export default function WinScreen({ winner, onReset }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#f5f5f5",
        background: "#1a1a1a",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ color: winner?.color ?? "#fff" }}>{winner?.name} wins!</h1>
      <button onClick={onReset} style={{ marginTop: "1rem" }}>
        New Game
      </button>
    </div>
  );
}
