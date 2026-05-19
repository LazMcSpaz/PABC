// Bottom tabs for the player's own things. The tab bar is pinned to the
// foot of the screen and is always visible; selecting a tab slides a
// detail panel up over the board, and re-selecting it slides it away.
import { useState } from "react";
import { LOCATIONS, fullController, theme } from "./data.js";
import { Label } from "./kit.jsx";
import UnitCard from "./UnitCard.jsx";
import HoldingCard from "./HoldingCard.jsx";
import MarketRow from "./MarketRow.jsx";

const PANEL_H = 300;

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
    <>
      {/* slide-up detail panel — sits directly above the tab bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: tabHeight,
          height: PANEL_H,
          zIndex: 39,
          transform: open ? "translateY(0)" : `translateY(${PANEL_H}px)`,
          transition: "transform 0.28s ease",
          background: theme.plate,
          borderTop: `1px solid #000`,
          boxShadow: "0 -12px 30px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div style={{ padding: "9px 14px 0" }}>
          <Label>{tabs.find((t) => t.id === open)?.label || ""}</Label>
        </div>
        <div className="pc-scroll" style={{ flex: 1, overflow: "auto", padding: 14 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {yourHolds.map((h) => (
                  <HoldingCard key={h.id} locationId={h.locationId} control={h.control} />
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

      {/* tab bar — pinned to the bottom of the screen, never moves */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: tabHeight,
          zIndex: 41,
          display: "flex",
          background: theme.plate,
          borderTop: `2px solid #000`,
          boxShadow: "inset 0 2px 0 rgba(232,169,63,0.16), 0 -4px 14px rgba(0,0,0,0.45)",
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
                borderRight: `1px solid #000`,
                borderTop: `2px solid ${active ? theme.accent : "transparent"}`,
                background: active
                  ? "linear-gradient(180deg, rgba(232,169,63,0.18), rgba(232,169,63,0.03))"
                  : "transparent",
                color: active ? theme.text : theme.textDim,
                fontFamily: theme.fontDisplay,
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: active ? theme.accent : theme.textFaint,
                  background: "rgba(0,0,0,0.35)",
                  borderRadius: 3,
                  padding: "1px 5px",
                }}
              >
                {t.count}
              </span>
              <span style={{ fontSize: 9, color: theme.textFaint }}>{active ? "▼" : "▲"}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
