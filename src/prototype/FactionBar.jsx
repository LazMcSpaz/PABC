// The top faction bar — one compact plate per faction (name + VP bar,
// flagged in the faction colour). Hovering raises a detail popover.
import { useState } from "react";
import { FACTIONS, LOCATIONS, fullController, theme } from "./data.js";
import { Coin } from "./kit.jsx";

function holdingsOf(state, pid) {
  return Object.values(state.hexes).filter(
    (h) => h.type === "location" && fullController(h.control?.sections) === pid,
  );
}

function Popover({ state, pid }) {
  const faction = FACTIONS[pid];
  const player = state.players[pid];
  const held = holdingsOf(state, pid);
  const units = Object.values(state.units).filter((u) => u.owner === pid).length;

  const Row = ({ label, children }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
      <span style={{ color: theme.textDim }}>{label}</span>
      <span style={{ color: theme.text, fontWeight: 600 }}>{children}</span>
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 9px)",
        left: 0,
        width: 228,
        zIndex: 80,
        background: theme.plate,
        border: `1px solid ${faction.color}`,
        borderRadius: 7,
        padding: 12,
        boxShadow: theme.shadowDeep,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: faction.color,
          textTransform: "uppercase",
        }}
      >
        {faction.name}
      </div>
      <div style={{ height: 1, background: theme.border }} />
      <Row label="Victory points">
        {player.vp} / {state.vpGoal}
      </Row>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <span style={{ color: theme.textDim }}>Scrap</span>
        <Coin n={player.scrap} size={13} />
      </div>
      <Row label="Actions">
        {player.actions.remaining} / {player.actions.max}
      </Row>
      <Row label="Tech Level">
        {player.techLevel} · {player.research} research
      </Row>
      <Row label="Locations held">{held.length}</Row>
      <Row label="Units">
        {units} / {player.unitCap}
      </Row>
      <Row label="Capital">{LOCATIONS[faction.capital]?.name}</Row>
    </div>
  );
}

function FactionBox({ state, pid }) {
  const [hover, setHover] = useState(false);
  const faction = FACTIONS[pid];
  const player = state.players[pid];
  const isActive = pid === state.activeId;
  const isYou = pid === state.youId;
  const vpPct = Math.min(100, (player.vp / state.vpGoal) * 100);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="pc-int"
        style={{
          width: 162,
          borderRadius: 5,
          border: `1px solid ${isActive ? faction.color : theme.border}`,
          borderTop: `3px solid ${faction.color}`,
          background: isActive
            ? `linear-gradient(180deg, ${faction.color}2e, ${theme.panel2})`
            : theme.plate,
          boxShadow: isActive
            ? `0 0 12px ${faction.color}66, inset 0 1px 0 rgba(255,255,255,0.05)`
            : "inset 0 1px 0 rgba(255,255,255,0.04)",
          padding: "5px 9px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          cursor: "default",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: theme.text,
            }}
          >
            {faction.short}
          </span>
          <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {isYou && (
              <span
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: theme.accent,
                }}
              >
                YOU
              </span>
            )}
            <span
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 10,
                fontWeight: 700,
                color: theme.textDim,
              }}
            >
              {player.vp}
            </span>
          </span>
        </div>
        <div
          style={{
            height: 7,
            borderRadius: 4,
            background: "#15110c",
            border: "1px solid rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${vpPct}%`,
              height: "100%",
              background: `linear-gradient(180deg, ${faction.color}, ${faction.color}aa)`,
            }}
          />
        </div>
      </div>
      {hover && <Popover state={state} pid={pid} />}
    </div>
  );
}

export default function FactionBar({ state }) {
  return (
    <div style={{ display: "flex", gap: 9, justifyContent: "center", flex: 1 }}>
      {Object.keys(state.players).map((pid) => (
        <FactionBox key={pid} state={state} pid={pid} />
      ))}
    </div>
  );
}
