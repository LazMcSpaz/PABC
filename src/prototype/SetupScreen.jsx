// Faction & seed picker. The first thing the player sees on a fresh
// browser; calling onStart({seed, humanFactionId}) hands control to the
// game screen.
import { useState } from "react";
import "./prototype.css";
import { FACTIONS as UI_FACTIONS, theme } from "./data.js";
import { Btn } from "./kit.jsx";

const FACTIONS = ["versari", "lakers", "goldgrass", "plainers"];

export default function SetupScreen({ onStart }) {
  const [picked, setPicked] = useState("versari");
  const [seedText, setSeedText] = useState("");

  function start() {
    const seed = Number(seedText) || Math.floor(Math.random() * 1e9);
    onStart({ seed, humanFactionId: picked, key: `${seed}:${picked}:${Date.now()}` });
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: theme.boardBg,
        color: theme.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: "94vw",
          background: theme.plate,
          border: `1px solid ${theme.borderLit}`,
          borderRadius: 12,
          padding: 28,
          boxShadow: theme.shadowDeep,
        }}
      >
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: theme.textFaint,
            fontWeight: 600,
          }}
        >
          A demo of
        </div>
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 38,
            fontWeight: 800,
            letterSpacing: 2.4,
            marginTop: 4,
          }}
        >
          <span style={{ color: theme.text }}>Ashland </span>
          <span style={{ color: theme.accent }}>Conquest</span>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: theme.textDim,
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          Lead one faction against three AI opponents. First to 12 victory
          points takes the wasteland.
        </div>

        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: theme.textFaint,
            marginTop: 24,
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          Pick your faction
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {FACTIONS.map((fid) => {
            const f = UI_FACTIONS[fid];
            const on = picked === fid;
            return (
              <button
                key={fid}
                className="pc-int"
                onClick={() => setPicked(fid)}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: 7,
                  border: on ? `2px solid ${f.color}` : `1px solid ${theme.border}`,
                  background: on
                    ? `linear-gradient(180deg, ${f.color}33, ${theme.panel2})`
                    : theme.panel2,
                  cursor: "pointer",
                  color: theme.text,
                  fontFamily: theme.fontDisplay,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  boxShadow: on ? `0 0 18px ${f.color}55` : "none",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: f.color }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 10.5, color: theme.textDim, fontWeight: 500 }}>
                  {fid === "versari" && "Disciplined infantry, garrison-oriented."}
                  {fid === "lakers" && "Mobility from the lakeshore — fast skirmishers."}
                  {fid === "goldgrass" && "Resource-rich coalition, deep economy."}
                  {fid === "plainers" && "Roving wasteland raiders, opportunistic."}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: theme.textFaint,
            marginTop: 20,
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Seed (optional)
        </div>
        <input
          value={seedText}
          onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="random"
          style={{
            width: "100%",
            padding: "9px 12px",
            background: theme.panel2,
            border: `1px solid ${theme.border}`,
            borderRadius: 5,
            color: theme.text,
            fontFamily: theme.fontDisplay,
            fontSize: 13,
            letterSpacing: 0.6,
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="primary" onClick={start}>
            Begin
          </Btn>
        </div>
      </div>
    </div>
  );
}
