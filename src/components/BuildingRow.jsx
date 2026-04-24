import Card from "./Card.jsx";

export default function BuildingRow({ row, activePlayer, onBuild, onInspect }) {
  const canAfford = (c) =>
    activePlayer.scrap >= (c.scrapCost ?? 0) &&
    activePlayer.actionsRemaining >= 1 &&
    activePlayer.settlement.length < 5;

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Building Row</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {row.map((card) => (
          <Card
            key={card.uid}
            card={card}
            onClick={() => onInspect(card)}
            disabled={false}
            action={
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuild(card.uid);
                  }}
                  disabled={!canAfford(card)}
                >
                  Build ({card.scrapCost ?? 0}🔩)
                </button>
              </div>
            }
          />
        ))}
      </div>
    </section>
  );
}
