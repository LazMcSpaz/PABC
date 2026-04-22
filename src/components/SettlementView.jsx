export default function SettlementView({ settlement, leader }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {leader && (
        <span style={{ padding: "2px 6px", border: "1px solid #888", borderRadius: 3 }}>
          Leader: {leader.name}
        </span>
      )}
      {settlement.map((b) => (
        <span
          key={b.uid}
          style={{ padding: "2px 6px", border: "1px solid #444", borderRadius: 3 }}
        >
          {b.name}
        </span>
      ))}
      {settlement.length === 0 && !leader && (
        <span style={{ opacity: 0.5, fontSize: 12 }}>Empty settlement</span>
      )}
    </div>
  );
}
