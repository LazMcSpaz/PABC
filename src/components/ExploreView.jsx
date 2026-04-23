import Card from "./Card.jsx";

export default function ExploreView({ state, activePlayer, onExplore, onResolve, onInspect }) {
  const blocked = state.globalFlags?.explorationBlocked;
  const skipped = activePlayer.skipExploreThisTurn;
  const cannot = activePlayer.actionsRemaining < 1 || state.explorationDeck.length === 0 || blocked || skipped;
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Exploration</h3>
      <button onClick={onExplore} disabled={cannot}>
        Draw Exploration Card (1⚡)
      </button>
      {blocked ? (
        <div style={{ fontSize: 11, color: "#e88", marginTop: 4 }}>
          🚧 Exploration blocked (resolve the Minefield to lift)
        </div>
      ) : null}
      {skipped ? (
        <div style={{ fontSize: 11, color: "#e88", marginTop: 4 }}>
          🌫 Skipping exploration this turn (Ash Storm)
        </div>
      ) : null}
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
