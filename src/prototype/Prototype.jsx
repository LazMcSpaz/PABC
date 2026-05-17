// Root of the look-pass prototype. Static mock state, light interaction
// (tile selection, card flips, chip reveals, a contest dice roll).
import { useState } from "react";
import "./prototype.css";
import { mockState } from "./mockState.js";
import { FACTIONS, LOCATIONS, fullController, theme } from "./data.js";
import { Panel, Label, Coin } from "./kit.jsx";
import HexBoard from "./HexBoard.jsx";
import Inspector from "./Inspector.jsx";
import PlayerSummary from "./PlayerSummary.jsx";
import UnitCard from "./UnitCard.jsx";
import LocationCard from "./LocationCard.jsx";
import MarketRow from "./MarketRow.jsx";

function HeaderStat({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
      <span
        style={{
          fontSize: 9,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: theme.textFaint,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 800, color: theme.text }}>{children}</span>
    </div>
  );
}

function Placeholder({ width, lines }) {
  return (
    <div
      style={{
        width,
        minHeight: 120,
        border: `1.5px dashed ${theme.border}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        textAlign: "center",
        fontSize: 11,
        color: theme.textFaint,
        lineHeight: 1.5,
      }}
    >
      {lines}
    </div>
  );
}

export default function Prototype() {
  const state = mockState;
  const [selectedHexId, setSelectedHexId] = useState("theShelf");

  const you = state.players[state.youId];
  const youFaction = FACTIONS[state.youId];
  const activeFaction = FACTIONS[state.activeId];

  const yourUnits = Object.values(state.units).filter((u) => u.owner === state.youId);
  const yourHolds = Object.values(state.hexes).filter(
    (h) => h.type === "location" && fullController(h.control.sections) === state.youId,
  );
  const yourPartials = Object.values(state.hexes)
    .filter((h) => {
      if (h.type !== "location") return false;
      const mine = h.control.sections.filter((x) => x === state.youId).length;
      return mine > 0 && mine < 3;
    })
    .map((h) => {
      const mine = h.control.sections.filter((x) => x === state.youId).length;
      return `${LOCATIONS[h.locationId].name} (${mine}/3)`;
    });

  const btn = {
    padding: "8px 16px",
    borderRadius: 6,
    border: `1px solid ${theme.borderLit}`,
    background: theme.panel3,
    color: theme.text,
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div
      className="pc-root"
      style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* HEADER */}
      <header
        style={{
          flexShrink: 0,
          height: 62,
          padding: "0 18px",
          borderBottom: `1px solid ${theme.border}`,
          background: theme.panel,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: theme.text,
            }}
          >
            Ashland Conquest
          </span>
          <span style={{ fontSize: 10.5, color: theme.textFaint, letterSpacing: 0.5 }}>
            Spatial Board · UI Prototype
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: theme.text }}>
              Round {state.round}
            </span>
            <span style={{ fontSize: 10, color: theme.textFaint }}>{state.phase} Phase</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 11px",
              borderRadius: 6,
              border: `1px solid ${activeFaction.color}`,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: activeFaction.color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: theme.text }}>
              {activeFaction.name}'s turn
            </span>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
              <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700 }}>
                Scrap
              </span>
              <Coin n={you.scrap} size={15} />
            </div>
            <HeaderStat label="Victory">
              {you.vp} / {state.vpGoal}
            </HeaderStat>
            <HeaderStat label="Actions">
              {you.actions.remaining} / {you.actions.max}
            </HeaderStat>
          </div>
          <button className="pc-int" style={btn}>
            End Turn
          </button>
        </div>
      </header>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", gap: 12, padding: 12, minHeight: 0 }}>
        {/* left — standings */}
        <div
          className="pc-scroll"
          style={{
            width: 238,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          <Label style={{ padding: "0 2px" }}>Standings</Label>
          {Object.keys(state.players).map((pid) => (
            <PlayerSummary key={pid} state={state} playerId={pid} />
          ))}
        </div>

        {/* centre — board */}
        <div
          className="pc-scroll"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
          }}
        >
          <HexBoard state={state} selectedHexId={selectedHexId} onSelect={setSelectedHexId} />
        </div>

        {/* right — inspector */}
        <div style={{ width: 348, flexShrink: 0, display: "flex" }}>
          <Inspector state={state} selectedHexId={selectedHexId} />
        </div>
      </div>

      {/* DOCK */}
      <div
        style={{
          flexShrink: 0,
          height: 292,
          display: "flex",
          gap: 12,
          padding: "0 12px 12px",
          minHeight: 0,
        }}
      >
        <Panel
          title="Your Forces"
          scroll
          style={{ flex: "0 0 244px" }}
          bodyStyle={{ display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden" }}
        >
          {yourUnits.map((u) => (
            <UnitCard key={u.id} unit={u} />
          ))}
          <Placeholder
            width={140}
            lines={`Unit cap ${yourUnits.length}/${you.unitCap}. Build a Training Grounds to recruit more.`}
          />
        </Panel>

        <Panel
          title="Your Holdings"
          scroll
          style={{ flex: "0 0 236px" }}
          bodyStyle={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", gap: 10, overflowX: "auto" }} className="pc-scroll">
            {yourHolds.map((h) => (
              <LocationCard
                key={h.id}
                locationId={h.locationId}
                control={h.control}
                width={150}
                compact
              />
            ))}
          </div>
          {yourPartials.length > 0 && (
            <div style={{ fontSize: 10, color: theme.textFaint, lineHeight: 1.5 }}>
              <span style={{ color: theme.textDim, fontWeight: 700 }}>Contesting: </span>
              {yourPartials.join(" · ")}
            </div>
          )}
        </Panel>

        <Panel title="Market Row" scroll style={{ flex: 1, minWidth: 0 }}>
          <MarketRow state={state} />
        </Panel>
      </div>
    </div>
  );
}
