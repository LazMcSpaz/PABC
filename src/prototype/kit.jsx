// Small shared UI primitives so every panel reads consistently.
import { theme } from "./data.js";

export function Label({ children, style }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: theme.textFaint,
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Panel({ title, right, children, style, bodyStyle, scroll }) {
  return (
    <section
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...style,
      }}
    >
      {title != null && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <Label>{title}</Label>
          {right}
        </header>
      )}
      <div
        className={scroll ? "pc-scroll" : undefined}
        style={{
          padding: 12,
          flex: 1,
          overflowY: scroll ? "auto" : "visible",
          minHeight: 0,
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function Pill({ children, color = theme.textDim, filled }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        color: filled ? "#13151a" : color,
        background: filled ? color : "transparent",
        border: `1px solid ${color}`,
      }}
    >
      {children}
    </span>
  );
}

// A scrap "coin" — the game's spendable currency.
export function Coin({ n, size = 16 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #e7c468, #9b7220)",
          border: "1px solid #5e451a",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {n != null && (
        <span style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{n}</span>
      )}
    </span>
  );
}

export function Stat({ label, value, color = theme.text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Label>{label}</Label>
      <span style={{ fontSize: 16, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

export function Divider({ style }) {
  return <div style={{ height: 1, background: theme.border, ...style }} />;
}
