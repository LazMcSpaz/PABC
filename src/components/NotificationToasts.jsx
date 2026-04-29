import { useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 10000;
const MAX_VISIBLE = 5;

const severityStyles = {
  info: { borderColor: "#3a5a8a", background: "#1a2538" },
  warning: { borderColor: "#8a6a2e", background: "#2a1f12" },
  alert: { borderColor: "#8a3a3a", background: "#2a1212" },
};

function ToastCard({ notif, players, onDismiss }) {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFading(true), TOAST_DURATION_MS - 400);
    const u = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(u);
    };
  }, [onDismiss]);

  const sev = severityStyles[notif.severity] ?? severityStyles.info;
  return (
    <div
      role="status"
      style={{
        border: `1px solid ${sev.borderColor}`,
        background: sev.background,
        padding: "0.5rem 0.6rem",
        borderRadius: 6,
        color: "#f5f5f5",
        fontSize: 12,
        lineHeight: 1.4,
        transition: "opacity 300ms ease",
        opacity: fading ? 0 : 1,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong style={{ fontSize: 13 }}>{notif.title}</strong>
        <button
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: 11,
          }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {notif.message ? (
        <div style={{ opacity: 0.85, marginTop: 2 }}>{notif.message}</div>
      ) : null}
      {notif.impacts?.length > 0 ? (
        <ul style={{ margin: "6px 0 0", padding: "0 0 0 14px" }}>
          {notif.impacts.map((i, idx) => {
            const p = players.find((x) => x.id === i.playerId);
            return (
              <li key={idx} style={{ color: p?.color }}>
                <span style={{ opacity: 0.85 }}>{p?.name ?? `p${i.playerId}`}:</span>{" "}
                <span>{i.text}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default function NotificationToasts({ state }) {
  const [visible, setVisible] = useState([]);
  const seenRef = useRef(null);
  const all = state?.notifications ?? [];

  useEffect(() => {
    // First mount of a game session: ignore existing notifications so we
    // don't toast historical entries every time we reload the component.
    if (seenRef.current === null) {
      seenRef.current = new Set(all.map((n) => n.id));
      return;
    }
    const fresh = all.filter((n) => !seenRef.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seenRef.current.add(n.id));
    setVisible((v) => [...v, ...fresh]);
  }, [all]);

  const dismiss = (id) => setVisible((v) => v.filter((x) => x.id !== id));

  if (visible.length === 0) return null;
  const toShow = visible.slice(-MAX_VISIBLE);

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "min(340px, calc(100vw - 24px))",
        pointerEvents: "none",
      }}
    >
      {toShow.map((n) => (
        <div key={n.id} style={{ pointerEvents: "auto" }}>
          <ToastCard
            notif={n}
            players={state?.players ?? []}
            onDismiss={() => dismiss(n.id)}
          />
        </div>
      ))}
    </div>
  );
}
