export default function ExploreView({ state, onExplore }) {
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Exploration</h3>
      <button onClick={onExplore}>Draw Exploration Card</button>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        Deck: {state.explorationDeck.length} · In play: {state.explorationInPlay.length}
      </div>
      <ul style={{ marginTop: 6, fontSize: 13 }}>
        {state.explorationInPlay.map((e) => (
          <li key={e.card.uid}>
            {e.card.name} <span style={{ opacity: 0.6 }}>(drawn by {e.drawnBy})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
