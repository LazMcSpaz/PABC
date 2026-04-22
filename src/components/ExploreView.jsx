import Card from "./Card.jsx";

export default function ExploreView({ state, activePlayer, onExplore, onResolve, onInspect }) {
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Exploration</h3>
      <button
        onClick={onExplore}
        disabled={activePlayer.actionsRemaining < 1 || state.explorationDeck.length === 0}
      >
        Draw Exploration Card (1⚡)
      </button>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
        Deck: {state.explorationDeck.length} · In play: {state.explorationInPlay.length}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {state.explorationInPlay.map((e) => (
          <Card
            key={e.card.uid}
            card={e.card}
            onClick={() => onInspect(e.card)}
            action={
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onResolve(e.card.uid);
                }}
              >
                Resolve
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
}
