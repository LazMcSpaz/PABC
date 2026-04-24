const severityStyles = {
  info: { borderColor: "#3a5a8a" },
  warning: { borderColor: "#8a6a2e" },
  alert: { borderColor: "#8a3a3a" },
};

export default function NotificationFeed({ state, max = 30 }) {
  const entries = (state.notifications ?? []).slice(-max).reverse();
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Event Feed</h3>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.55 }}>No notifications yet.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 6,
            maxHeight: 320,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {entries.map((n) => {
            const sev = severityStyles[n.severity] ?? severityStyles.info;
            return (
              <div
                key={n.id}
                style={{
                  border: `1px solid ${sev.borderColor}`,
                  background: "#1f1f1f",
                  borderRadius: 4,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{n.title}</strong>
                  <span style={{ opacity: 0.55, fontSize: 11 }}>R{n.round}</span>
                </div>
                {n.message ? (
                  <div style={{ opacity: 0.85, marginTop: 2 }}>{n.message}</div>
                ) : null}
                {n.impacts?.length > 0 ? (
                  <ul style={{ margin: "4px 0 0", padding: "0 0 0 14px" }}>
                    {n.impacts.map((i, idx) => {
                      const p = state.players.find((x) => x.id === i.playerId);
                      return (
                        <li key={idx} style={{ color: p?.color }}>
                          <span style={{ opacity: 0.85 }}>
                            {p?.name ?? `p${i.playerId}`}:
                          </span>{" "}
                          <span>{i.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
