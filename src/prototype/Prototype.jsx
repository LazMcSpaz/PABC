// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar, a
// right-hand inspector drawer, and bottom slide-up tabs.
import { useRef, useState } from "react";
import "./prototype.css";
import { mockState } from "./mockState.js";
import { theme } from "./data.js";
import { Btn } from "./kit.jsx";
import HexBoard from "./HexBoard.jsx";
import Inspector from "./Inspector.jsx";
import FactionBar from "./FactionBar.jsx";
import BottomDock from "./BottomDock.jsx";

const TOP_H = 56;
const TAB_H = 44;

function Bracket({ corner }) {
  const c = theme.accent;
  const map = {
    tl: { top: 0, left: 0, borderTop: `2px solid ${c}`, borderLeft: `2px solid ${c}` },
    tr: { top: 0, right: 0, borderTop: `2px solid ${c}`, borderRight: `2px solid ${c}` },
    bl: { bottom: 0, left: 0, borderBottom: `2px solid ${c}`, borderLeft: `2px solid ${c}` },
    br: { bottom: 0, right: 0, borderBottom: `2px solid ${c}`, borderRight: `2px solid ${c}` },
  };
  return <div className="pc-bracket" style={map[corner]} />;
}

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
          gap: 16,
          padding: "0 16px",
          background: theme.plate,
          borderBottom: `1px solid #000`,
          boxShadow: "0 2px 0 rgba(232,169,63,0.18), 0 6px 16px rgba(0,0,0,0.5)",
          position: "relative",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 188 }}>
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: theme.text }}>Ashland </span>
            <span style={{ color: theme.accent }}>Conquest</span>
          </span>
          <span
            style={{
              fontSize: 9.5,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: theme.textFaint,
            }}
          >
            Round {state.round} · {state.phase} Phase
          </span>
        </div>

        <FactionBar state={state} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            minWidth: 188,
            justifyContent: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: theme.textFaint,
                fontWeight: 600,
              }}
            >
              Actions
            </span>
            <span
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 16,
                fontWeight: 700,
                color: theme.text,
              }}
            >
              {you.actions.remaining} / {you.actions.max}
            </span>
          </div>
          <Btn variant="primary">End Turn</Btn>
        </div>
      </header>

      {/* BOARD — the field of battle, kept central */}
      <div
        className="pc-board pc-scroll"
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: TAB_H + 20,
        }}
      >
        <div style={{ position: "relative", padding: 30 }}>
          <Bracket corner="tl" />
          <Bracket corner="tr" />
          <Bracket corner="bl" />
          <Bracket corner="br" />
          <HexBoard state={state} selectedHexId={selectedHexId} onSelect={selectHex} />
        </div>
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
          boxShadow: selectedHexId ? "-12px 0 32px rgba(0,0,0,0.6)" : "none",
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
