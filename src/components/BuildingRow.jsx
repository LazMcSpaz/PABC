export default function BuildingRow({ row, onBuild }) {
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Building Row</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {row.length === 0 && (
          <div style={{ opacity: 0.5 }}>
            No buildings available — populate src/engine/cards.js BUILDINGS.
          </div>
        )}
        {row.map((card) => (
          <button
            key={card.uid}
            onClick={() => onBuild(card.uid)}
            style={{ padding: "0.5rem", minWidth: 120 }}
          >
            <div style={{ fontWeight: 600 }}>{card.name}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Cost: {card.scrapCost ?? 0}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
