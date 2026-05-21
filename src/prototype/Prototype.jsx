// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar and a
// bottom tab dock — with a floating tabbed window for hex inspection.
import { useMemo, useRef, useState } from "react";
import "./prototype.css";
import { theme } from "./data.js";
import { Btn } from "./kit.jsx";
import HexBoard from "./HexBoard.jsx";
import BoardViewport from "./BoardViewport.jsx";
import Inspector from "./Inspector.jsx";
import FactionBar from "./FactionBar.jsx";
import BottomDock from "./BottomDock.jsx";
import { createGame } from "../game/setup.js";
import { startTurn, endTurn } from "../game/turn.js";
import { takeAITurn } from "../game/ai.js";
import { activePlayerId } from "../game/targeting.js";
import { adaptState } from "./engineAdapter.js";

const TOP_H = 56;
const TAB_H = 44;

// Initial seed + human faction. A future setup screen (Phase 6) will let
// the player choose these; for now they are fixed so dev iteration is
// deterministic.
const INITIAL_SEED = 42;
const INITIAL_HUMAN = "versari";

function bootGame() {
  const game = createGame({ seed: INITIAL_SEED, humanFactionId: INITIAL_HUMAN });
  startTurn(game);
  // If the human happens not to be first in seat order, run AIs until
  // it's their turn.
  driveAIsThroughHumanTurn(game);
  return game;
}

function driveAIsThroughHumanTurn(game) {
  let guard = 12;
  while (!game.winnerId && guard-- > 0) {
    const pid = activePlayerId(game);
    if (!game.players[pid].isAI) return;
    takeAITurn(game);
  }
}

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
  // The engine mutates a single GameState in place; we hold a ref to it
  // and bump a tick to trigger a re-adapt + re-render after each mutation.
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = bootGame();
  const [tick, setTick] = useState(0);
  const bumpTick = () => setTick((t) => t + 1);

  const state = useMemo(() => adaptState(gameRef.current), [tick]);
  const [selectedHexId, setSelectedHexId] = useState(null);
  const you = state.players[state.youId];
  const isYourTurn = state.activeId === state.youId && !state.winnerId;

  function selectHex(id) {
    setSelectedHexId((cur) => (cur === id ? null : id));
  }
  function closeWindow() {
    setSelectedHexId(null);
  }

  function onEndTurn() {
    if (!isYourTurn) return;
    endTurn(gameRef.current);
    driveAIsThroughHumanTurn(gameRef.current);
    bumpTick();
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
          <Btn variant="primary" onClick={onEndTurn} disabled={!isYourTurn}>
            End Turn
          </Btn>
        </div>
      </header>

      {/* BOARD — the field of battle; drag to pan, wheel to zoom */}
      <BoardViewport>
        <div style={{ position: "relative", padding: 30 }}>
          <Bracket corner="tl" />
          <Bracket corner="tr" />
          <Bracket corner="bl" />
          <Bracket corner="br" />
          <HexBoard state={state} selectedHexId={selectedHexId} onSelect={selectHex} />
        </div>
      </BoardViewport>

      {/* INSPECTOR — floating tabbed window, opens on hex selection */}
      {selectedHexId && (
        <Inspector state={state} selectedHexId={selectedHexId} onClose={closeWindow} />
      )}

      {/* BOTTOM — slide-up tabs for the player's own cards */}
      <BottomDock state={state} tabHeight={TAB_H} />

      {state.winnerId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: theme.plate,
              border: `2px solid ${theme.accent}`,
              borderRadius: 12,
              padding: "30px 50px",
              textAlign: "center",
              boxShadow: theme.shadowDeep,
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: theme.textFaint,
                marginBottom: 8,
              }}
            >
              Victory
            </div>
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 32,
                fontWeight: 700,
                color: theme.accent,
              }}
            >
              {state.players[state.winnerId]?.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
