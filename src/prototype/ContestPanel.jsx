// A contest preview — Strength + 1d6 per side, defender wins ties.
// Self-contained so the dice mechanic is demonstrable without an engine.
import { useState } from "react";
import { theme } from "./data.js";
import { Label, Btn } from "./kit.jsx";

const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ n }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 7,
        background: "linear-gradient(160deg, #f4ecda, #cdbf9f)",
        border: "1px solid #6b5f44",
        boxShadow: "0 2px 5px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.65)",
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gridTemplateRows: "repeat(3,1fr)",
        padding: 5,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {n && PIPS[n].includes(i) && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#2a2118",
                boxShadow: "inset 0 1px 1px rgba(0,0,0,0.6)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Side({ title, name, score, die, total, color, won, decided }) {
  return (
    <div
      style={{
        flex: 1,
        background: won ? `${color}1f` : theme.panel2,
        border: `1px solid ${won ? color : theme.border}`,
        borderRadius: 7,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
        boxShadow: won ? `0 0 12px ${color}55` : "none",
        opacity: decided && !won ? 0.62 : 1,
      }}
    >
      <Label>{title}</Label>
      <div
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 12,
          fontWeight: 600,
          color: theme.text,
          textAlign: "center",
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: theme.fontDisplay, fontSize: 24, fontWeight: 700, color }}>
          {score}
        </span>
        <span style={{ color: theme.textFaint, fontWeight: 700 }}>+</span>
        <Die n={die} />
      </div>
      <div style={{ fontSize: 9.5, color: theme.textFaint }} className="pc-prose">
        Strength + 1d6
      </div>
      <div
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 22,
          fontWeight: 700,
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
          decided={!!r}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontFamily: theme.fontDisplay,
            fontSize: 12,
            fontWeight: 700,
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
          decided={!!r}
        />
      </div>
      <Btn variant="primary" full onClick={roll}>
        {r ? "Roll again" : "Roll 2d6"}
      </Btn>
      {r && (
        <div
          style={{
            textAlign: "center",
            fontFamily: theme.fontDisplay,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: winner === "attacker" ? theme.good : theme.accent2,
          }}
        >
          {winner === "attacker"
            ? "Attacker wins — a section flips."
            : "Defender holds — ties go to the defender."}
        </div>
      )}
    </div>
  );
}
