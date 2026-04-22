export default function CardModal({ card, onClose }) {
  if (!card) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#222", padding: "1rem", borderRadius: 6, minWidth: 280 }}
      >
        <h3 style={{ marginTop: 0 }}>{card.name}</h3>
        <div style={{ fontSize: 13 }}>{card.ability ?? "No ability"}</div>
        <button onClick={onClose} style={{ marginTop: "0.75rem" }}>
          Close
        </button>
      </div>
    </div>
  );
}
