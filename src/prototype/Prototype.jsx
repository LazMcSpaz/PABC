// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar, a
// right-hand inspector drawer, and bottom slide-up tabs.
import { useRef, useState } from "react";
import "./prototype.css";
import { mockState } from "./mockState.js";
import { theme } from "./data.js";
import HexBoard from "./HexBoard.jsx";
import Inspector from "./Inspector.jsx";
import FactionBar from "./FactionBar.jsx";
import BottomDock from "./BottomDock.jsx";

const TOP_H = 52;
const TAB_H = 44;

export default function Prototype() {
  const state = mockState;
  const [selectedHexId, setSelectedHexId] = useState(null);
  const [shownHexId, setShownHexId] = useState(null);
  const selRef = useRef(null);
  const you = state.players[state.youId];

  function selectHex(id) {
    if (id === selRef.current) {
      closeInspector();
      return;
    }
    selRef.current = id;
    setSelectedHexId(id);
    setShownHexId(id);
  }
  function closeInspector() {
    selRef.current = null;
    setSelectedHexId(null);
    setTimeout(() => {
      if (selRef.current === null) setShownHexId(null);
    }, 320);
  }

  return (
    <div
      className="pc-root"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* TOP BAR — title, faction standings, turn controls */}
      <header
        style={{
          height: TOP_H,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 14px",
          background: theme.panel,
          borderBottom: `1px solid ${theme.border}`,
          position: "relative",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 168 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: theme.text,
            }}
          >
            Ashland Conquest
          </span>
          <span style={{ fontSize: 10, color: theme.textFaint }}>
            Round {state.round} · {state.phase} Phase
          </span>
        </div>

        <FactionBar state={state} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 168,
            justifyContent: "flex-end",
          }}
        >
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
              Actions
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>
              {you.actions.remaining} / {you.actions.max}
            </span>
          </div>
          <button
            className="pc-int"
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: `1px solid ${theme.borderLit}`,
              background: theme.panel3,
              color: theme.text,
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            End Turn
          </button>
        </div>
      </header>

      {/* BOARD — the field of battle, kept central */}
      <div
        className="pc-scroll"
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: TAB_H + 20,
          background: theme.bg,
        }}
      >
        <HexBoard state={state} selectedHexId={selectedHexId} onSelect={selectHex} />
      </div>

      {/* INSPECTOR — right-hand drawer, slides in on selection */}
      <div
        style={{
          position: "fixed",
          top: TOP_H,
          bottom: TAB_H,
          right: 0,
          width: 372,
          transform: selectedHexId ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          zIndex: 30,
          boxShadow: selectedHexId ? "-10px 0 28px rgba(0,0,0,0.5)" : "none",
          display: "flex",
        }}
      >
        <Inspector state={state} selectedHexId={shownHexId} onClose={closeInspector} />
      </div>

      {/* BOTTOM — slide-up tabs for the player's own cards */}
      <BottomDock state={state} tabHeight={TAB_H} />
    </div>
  );
}
