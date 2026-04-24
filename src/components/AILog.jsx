function actionLabel(a) {
  switch (a.type) {
    case "build":
      return `build ${a.buildingId}`;
    case "explore":
      return "explore";
    case "raid":
      return `raid p${a.targetId}${a.raidType ? ` (${a.raidType})` : ""}`;
    case "boost":
      return `boost ${a.stat}`;
    case "play_intrigue":
      return `play "${a.cardName}"${a.targetId != null ? ` → p${a.targetId}` : ""}`;
    case "end_turn":
      return "end turn";
    default:
      return a.type ?? "?";
  }
}

export default function AILog({ state, max = 6 }) {
  const entries = (state.aiLog ?? []).slice(-max).reverse();
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>AI Log</h3>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.55 }}>No AI turns yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {entries.map((e, i) => {
            const player = state.players.find((p) => p.id === e.playerId);
            return (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  padding: 6,
                  border: "1px solid #333",
                  borderRadius: 4,
                  background: "#1f1f1f",
                }}
              >
                <div style={{ color: player?.color, fontWeight: 600 }}>
                  R{e.round} · {player?.name ?? `p${e.playerId}`}
                </div>
                {e.reasoning ? (
                  <div style={{ fontStyle: "italic", opacity: 0.85 }}>{e.reasoning}</div>
                ) : null}
                <div style={{ opacity: 0.7 }}>
                  {(e.actions ?? []).map(actionLabel).join(" → ") || "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
