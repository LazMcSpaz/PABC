// Bottom tabs for the player's own things. Each tab slides a detail
// panel up over the board; clicking the open tab slides it back down.
import { useState } from "react";
import { LOCATIONS, fullController, theme } from "./data.js";
import { Label } from "./kit.jsx";
import UnitCard from "./UnitCard.jsx";
import LocationCard from "./LocationCard.jsx";
import MarketRow from "./MarketRow.jsx";

const PANEL_H = 270;

function CapSlot({ note }) {
  return (
    <div
      style={{
        width: 150,
        minHeight: 150,
        flexShrink: 0,
        border: `1.5px dashed ${theme.border}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        textAlign: "center",
        fontSize: 10.5,
        color: theme.textFaint,
        lineHeight: 1.5,
      }}
    >
      {note}
    </div>
  );
}

export default function BottomDock({ state, tabHeight }) {
  const [open, setOpen] = useState(null);

  const you = state.players[state.youId];
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

  const tabs = [
    { id: "units", label: "Your Units", count: yourUnits.length },
    { id: "holdings", label: "Your Holdings", count: yourHolds.length },
    { id: "market", label: "Market", count: state.market.length },
  ];

  const rowStyle = { display: "flex", gap: 12, alignItems: "flex-start" };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: tabHeight + PANEL_H,
        transform: open ? "translateY(0)" : `translateY(${PANEL_H}px)`,
        transition: "transform 0.28s ease",
        zIndex: 40,
      }}
    >
      {/* slide-up panel */}
      <div
        style={{
          height: PANEL_H,
          background: theme.panel,
          borderTop: `1px solid ${theme.border}`,
          boxShadow: "0 -10px 26px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "9px 14px 0" }}>
          <Label>{tabs.find((t) => t.id === open)?.label || ""}</Label>
        </div>
        <div
          className="pc-scroll"
          style={{ flex: 1, overflow: "auto", padding: 14 }}
        >
          {open === "units" && (
            <div style={rowStyle}>
              {yourUnits.map((u) => (
                <UnitCard key={u.id} unit={u} />
              ))}
              <CapSlot
                note={`Unit cap ${yourUnits.length}/${you.unitCap}. Build a Training Grounds to recruit more.`}
              />
            </div>
          )}
          {open === "holdings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={rowStyle}>
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
                <div style={{ fontSize: 10.5, color: theme.textFaint, lineHeight: 1.5 }}>
                  <span style={{ color: theme.textDim, fontWeight: 700 }}>Contesting: </span>
                  {yourPartials.join(" · ")}
                </div>
              )}
            </div>
          )}
          {open === "market" && <MarketRow state={state} />}
        </div>
      </div>

      {/* tab bar — always visible */}
      <div
        style={{
          height: tabHeight,
          display: "flex",
          background: theme.panel2,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        {tabs.map((t) => {
          const active = open === t.id;
          return (
            <button
              key={t.id}
              className="pc-int"
              onClick={() => setOpen(active ? null : t.id)}
              style={{
                flex: 1,
                border: "none",
                borderRight: `1px solid ${theme.border}`,
                borderTop: `2px solid ${active ? theme.accent : "transparent"}`,
                background: active ? theme.panel3 : "transparent",
                color: active ? theme.text : theme.textDim,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              {t.label}
              <span style={{ color: theme.textFaint, fontWeight: 700 }}>{t.count}</span>
              <span style={{ fontSize: 9, color: theme.textFaint }}>{active ? "▼" : "▲"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
