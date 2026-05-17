// A contest preview — Strength + 1d6 per side, defender wins ties.
// Self-contained so the dice mechanic is demonstrable without an engine.
import { useState } from "react";
import { theme } from "./data.js";
import { Label } from "./kit.jsx";

function Die({ n }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        background: theme.panel3,
        border: `1px solid ${theme.borderLit}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 17,
        fontWeight: 800,
        color: n == null ? theme.textFaint : theme.text,
      }}
    >
      {n == null ? "·" : n}
    </div>
  );
}

function Side({ title, name, score, die, total, color, won }) {
  return (
    <div
      style={{
        flex: 1,
        background: theme.panel2,
        border: `1px solid ${won ? color : theme.border}`,
        borderRadius: 7,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
      }}
    >
      <Label>{title}</Label>
      <div style={{ fontSize: 12, fontWeight: 800, color: theme.text, textAlign: "center" }}>
        {name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{score}</span>
        <span style={{ color: theme.textFaint, fontWeight: 700 }}>+</span>
        <Die n={die} />
      </div>
      <div style={{ fontSize: 10, color: theme.textFaint }}>Strength + 1d6</div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 800,
          color: total == null ? theme.textFaint : won ? color : theme.textDim,
        }}
      >
        {total == null ? "—" : total}
      </div>
    </div>
  );
}

export default function ContestPanel({ attacker, defender }) {
  const [r, setR] = useState(null);
  const roll = () =>
    setR({ a: 1 + Math.floor(Math.random() * 6), d: 1 + Math.floor(Math.random() * 6) });

  const aTotal = r ? attacker.strength + r.a : null;
  const dTotal = r ? defender.value + r.d : null;
  const winner = r ? (aTotal > dTotal ? "attacker" : "defender") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <Side
          title="Attacker"
          name={attacker.name}
          score={attacker.strength}
          die={r?.a}
          total={aTotal}
          color={theme.accent2}
          won={winner === "attacker"}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 11,
            fontWeight: 800,
            color: theme.textFaint,
          }}
        >
          VS
        </div>
        <Side
          title="Defender"
          name={defender.name}
          score={defender.value}
          die={r?.d}
          total={dTotal}
          color={theme.accent}
          won={winner === "defender"}
        />
      </div>
      <button
        className="pc-int"
        onClick={roll}
        style={{
          padding: "9px 0",
          borderRadius: 7,
          border: `1px solid ${theme.borderLit}`,
          background: theme.accent,
          color: "#15171c",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        {r ? "Roll again" : "Roll 2d6"}
      </button>
      {r && (
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: 800,
            color: winner === "attacker" ? theme.good : theme.accent2,
          }}
        >
          {winner === "attacker"
            ? "Attacker wins — a section flips."
            : "Defender holds (ties go to the defender)."}
        </div>
      )}
    </div>
  );
}
