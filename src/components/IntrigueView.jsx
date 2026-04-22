export default function IntrigueView({ state }) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Intrigue Hand</h3>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {active?.intrigueHand?.length
          ? active.intrigueHand.map((c) => c.name).join(", ")
          : "Empty (max 3)"}
      </div>
      <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
        TODO: wire up card play — effects in src/engine/intrigue.js INTRIGUE_EFFECTS.
      </div>
    </section>
  );
}
