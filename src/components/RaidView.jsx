export default function RaidView({ state, onRaid }) {
  const targets = state.players.filter((p) => p.id !== state.activePlayerId);
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Raid</h3>
      {targets.map((t) => (
        <button
          key={t.id}
          onClick={() => onRaid(t.id, "Destroy Building")}
          style={{ marginRight: 6 }}
        >
          Raid {t.name}
        </button>
      ))}
      <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
        TODO: raid outcome execution (destroy / steal / disable) — see README known issues.
      </div>
    </section>
  );
}
