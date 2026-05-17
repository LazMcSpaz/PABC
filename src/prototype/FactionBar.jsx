// The top faction bar — one compact box per faction (name + VP bar,
// bordered in the faction colour). Hovering a box raises a detail
// popover so the bar itself stays narrow.
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
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: theme.textDim }}>{label}</span>
      <span style={{ color: theme.text, fontWeight: 700 }}>{children}</span>
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 7px)",
        left: 0,
        width: 224,
        zIndex: 80,
        background: theme.panel2,
        border: `1px solid ${faction.color}`,
        borderRadius: 8,
        padding: 12,
        boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: faction.color }}>{faction.name}</div>
      <div style={{ height: 1, background: theme.border }} />
      <Row label="Victory points">
        {player.vp} / {state.vpGoal}
      </Row>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: theme.textDim }}>Scrap</span>
        <Coin n={player.scrap} size={13} />
      </div>
      <Row label="Actions">
        {player.actions.remaining} / {player.actions.max}
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
          width: 158,
          padding: "5px 9px",
          borderRadius: 6,
          border: `2px solid ${faction.color}`,
          background: isActive ? `${faction.color}26` : theme.panel2,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          cursor: "default",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: theme.text }}>
            {faction.short}
          </span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {isYou && (
              <span style={{ fontSize: 8, fontWeight: 800, color: theme.accent }}>YOU</span>
            )}
            {isActive && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: faction.color,
                }}
                title="Active turn"
              />
            )}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: theme.panel3, overflow: "hidden" }}>
          <div style={{ width: `${vpPct}%`, height: "100%", background: faction.color }} />
        </div>
      </div>
      {hover && <Popover state={state} pid={pid} />}
    </div>
  );
}

export default function FactionBar({ state }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flex: 1 }}>
      {Object.keys(state.players).map((pid) => (
        <FactionBox key={pid} state={state} pid={pid} />
      ))}
    </div>
  );
}
