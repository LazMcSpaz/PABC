export default function SettlementView({ settlement, leader, onInspect }) {
  const chip = (card, extra = {}) => (
    <span
      key={card.uid}
      onClick={onInspect ? () => onInspect(card) : undefined}
      title={card.ability?.description ?? card.flavor ?? ""}
      style={{
        padding: "2px 6px",
        border: "1px solid #444",
        borderRadius: 3,
        fontSize: 12,
        cursor: onInspect ? "pointer" : "default",
        ...extra,
      }}
    >
      {card.name}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {leader && chip(leader, { borderColor: "#888", fontWeight: 600 })}
      {settlement.map((b) => chip(b))}
      {settlement.length === 0 && !leader && (
        <span style={{ opacity: 0.5, fontSize: 12 }}>Empty settlement</span>
      )}
    </div>
  );
}
