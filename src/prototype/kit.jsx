// Shared UI primitives — restyled for the wasteland art pass.
import { theme } from "./data.js";

export function Label({ children, style }) {
  return (
    <div
      style={{
        fontFamily: theme.fontDisplay,
        fontSize: 11,
        letterSpacing: 1.8,
        textTransform: "uppercase",
        color: theme.textDim,
        fontWeight: 600,
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
        background: theme.plate,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        boxShadow: `${theme.shadow}, inset 0 1px 0 rgba(255,255,255,0.045)`,
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
            padding: "9px 12px",
            background: "rgba(0,0,0,0.26)",
            borderBottom: `1px solid ${theme.border}`,
            borderRadius: "8px 8px 0 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 3, height: 13, background: theme.accent, borderRadius: 1 }} />
            <Label>{title}</Label>
          </div>
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
        fontFamily: theme.fontDisplay,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 3,
        whiteSpace: "nowrap",
        color: filled ? "#15110a" : color,
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
          background: "radial-gradient(circle at 34% 28%, #f3d27e, #9b7220 72%, #6b4e16)",
          border: "1px solid #4a3712",
          boxShadow: "0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.25)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {n != null && (
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontWeight: 700,
            fontSize: 13,
            color: theme.text,
          }}
        >
          {n}
        </span>
      )}
    </span>
  );
}

// A victory-point star — how many VP a location is worth.
export function Vp({ n, size = 16 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 2 L14.47 8.6 L21.51 8.91 L15.99 13.3 L17.88 20.09 L12 16.2 L6.12 20.09 L8.01 13.3 L2.49 8.91 L9.53 8.6 Z"
          fill="#e8a93f"
          stroke="#4a3712"
          strokeWidth="1"
        />
      </svg>
      {n != null && (
        <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize: 13, color: theme.text }}>
          {n}
        </span>
      )}
    </span>
  );
}

export function Stat({ label, value, color = theme.text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Label>{label}</Label>
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 17, fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}

export function Divider({ style }) {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${theme.border} 12%, ${theme.border} 88%, transparent)`,
        ...style,
      }}
    />
  );
}

const BTN_VARIANTS = {
  primary: {
    background: "linear-gradient(180deg, #f0b956, #d8901f)",
    border: "1px solid #8a5e16",
    color: "#211606",
    boxShadow: "0 2px 0 #6e4a12, 0 4px 10px rgba(0,0,0,0.42)",
  },
  ghost: {
    background: "linear-gradient(180deg, #332b20, #241e16)",
    border: `1px solid ${theme.borderLit}`,
    color: theme.text,
    boxShadow: "0 2px 0 rgba(0,0,0,0.45)",
  },
};

export function Btn({ children, onClick, variant = "ghost", disabled, full, size = "md", style }) {
  const pad = size === "sm" ? "5px 11px" : "8px 16px";
  const fs = size === "sm" ? 11 : 12.5;
  return (
    <button
      className="pc-int"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: theme.fontDisplay,
        fontWeight: 600,
        fontSize: fs,
        letterSpacing: 1,
        textTransform: "uppercase",
        padding: pad,
        borderRadius: 5,
        cursor: disabled ? "not-allowed" : "pointer",
        width: full ? "100%" : "auto",
        ...BTN_VARIANTS[variant],
        ...(disabled ? { opacity: 0.4, boxShadow: "none" } : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, title, style }) {
  return (
    <button
      className="pc-int"
      onClick={onClick}
      title={title}
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        border: `1px solid ${theme.borderLit}`,
        background: "linear-gradient(180deg, #332b20, #241e16)",
        color: theme.textDim,
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
