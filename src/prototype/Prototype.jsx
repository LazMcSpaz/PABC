// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar and a
// bottom tab dock — with a floating tabbed window for hex inspection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { performAction } from "../game/actions.js";
import { takeAITurn } from "../game/ai.js";
import { activePlayerId } from "../game/targeting.js";
import { bfsDistances } from "../game/board.js";
import { CHIPS as ENGINE_CHIPS } from "../game/content.js";
import { CONFIG } from "../game/config.js";
import { getEncounter } from "../game/encounters.js";
import { evalCond } from "../game/dsl.js";
import { adaptState } from "./engineAdapter.js";
import EncounterModal from "./EncounterModal.jsx";
import EventFeed from "./EventFeed.jsx";

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
  const bumpTick = useCallback(() => setTick((t) => t + 1), []);

  const state = useMemo(() => adaptState(gameRef.current), [tick]);
  const [selectedHexId, setSelectedHexId] = useState(null);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [toast, setToast] = useState(null); // { kind: "error"|"info", text }
  const [encounterPrompt, setEncounterPrompt] = useState(null); // pending move + encounter pick
  const you = state.players[state.youId];
  const isYourTurn = state.activeId === state.youId && !state.winnerId;

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Drop selection when a turn changes — selected unit may no longer be
  // yours / be ready.
  useEffect(() => {
    if (!selectedUnitId) return;
    const unit = state.units[selectedUnitId];
    if (!unit || unit.owner !== state.youId) setSelectedUnitId(null);
  }, [state, selectedUnitId]);

  // Compute the set of hexes the selected unit can reach this turn.
  const reachable = useMemo(() => {
    if (!isYourTurn || !selectedUnitId) return null;
    const unit = state.units[selectedUnitId];
    if (!unit || unit.immobilized || unit.effectiveMovement <= 0) return null;
    const dists = bfsDistances(gameRef.current.board.adjacency, unit.node);
    const out = new Set();
    for (const [hex, d] of Object.entries(dists)) {
      if (d > 0 && d <= unit.effectiveMovement) out.add(hex);
    }
    return out;
  }, [tick, isYourTurn, selectedUnitId, state]);

  // --- action handlers ----------------------------------------------

  function runAction(type, params, ctx, successMsg) {
    const r = performAction(gameRef.current, type, params, ctx || {});
    if (!r.ok) {
      setToast({ kind: "error", text: r.reason });
      return r;
    }
    if (successMsg) setToast({ kind: "info", text: successMsg });
    bumpTick();
    return r;
  }

  function peekFieldEncounter(game, destHex) {
    if (game.board.hexes[destHex]?.type !== "encounter") return null;
    const cooldownUntil = game.world?.encounterHexCooldowns?.[destHex] || 0;
    if (game.round < cooldownUntil) return null;
    const id = game.encounterDeck?.[0];
    if (!id) return null;
    return getEncounter(id);
  }

  function eligibleChoiceIds(game, encounter, pid) {
    const subCtx = { sourcePlayer: pid };
    return (encounter.choices || [])
      .filter((c) => c.condition == null || evalCond(game, c.condition, subCtx))
      .map((c) => c.id);
  }

  function doMoveWithEncounterChoice(unitUid, dest, choiceId) {
    const ctx = {
      interact: (req) => {
        if (req.kind === "encounterChoice") return choiceId;
        return req?.options ? req.options[0] : null; // fallback to first
      },
    };
    const r = runAction("move", { unit: unitUid, to: dest }, ctx);
    if (r.ok) setSelectedHexId(dest);
    setEncounterPrompt(null);
  }

  function onHexClick(hexId) {
    // Reachable hex with selected unit → Move. Don't open inspector.
    if (
      isYourTurn &&
      selectedUnitId &&
      reachable?.has(hexId) &&
      state.units[selectedUnitId]?.node !== hexId
    ) {
      // Pre-flight: if the move would draw a field encounter, surface
      // the choice modal first and stash the pending move on it.
      const enc = peekFieldEncounter(gameRef.current, hexId);
      if (enc && (enc.choices || []).length > 0) {
        const elig = eligibleChoiceIds(gameRef.current, enc, state.youId);
        setEncounterPrompt({
          encounter: enc,
          choices: enc.choices,
          eligibleIds: elig.length ? elig : enc.choices.map((c) => c.id),
          unitUid: selectedUnitId,
          dest: hexId,
        });
        return;
      }
      const r = runAction("move", { unit: selectedUnitId, to: hexId });
      if (r.ok) setSelectedHexId(hexId);
      return;
    }

    // Otherwise toggle the inspector. If the hex holds your unit, also
    // auto-select that unit (saves a click).
    setSelectedHexId((cur) => (cur === hexId ? null : hexId));
    const hex = state.hexes[hexId];
    const unit = hex?.unitId ? state.units[hex.unitId] : null;
    if (unit && unit.owner === state.youId) {
      setSelectedUnitId(unit.uid);
    }
  }

  function onSelectUnit(unitUid) {
    setSelectedUnitId(unitUid);
    const unit = state.units[unitUid];
    if (unit) setSelectedHexId(unit.node);
  }

  function onContest(params) {
    return runAction("contest", params);
  }
  function onActivate(hexId) {
    return runAction("activate", { location: hexId }, null, "Ability activated.");
  }
  function onRecruit(hexId) {
    return runAction("recruit", { at: hexId }, null, "Unit recruited.");
  }
  function onAcquire(uiChip) {
    // uiChip is { uid, chipId, engineChipId }. Pick an install target:
    // unit chip → strongest of your units with bay slots; location chip
    // → cheapest controlled location with free chip slots.
    const def = gameRef.current.chips[uiChip.uid];
    const engineId = def?.chipId;
    const enginePool = gameRef.current.market.tiers[1]?.row || [];
    if (!enginePool.includes(uiChip.uid)) {
      setToast({ kind: "error", text: "Chip is no longer in the market." });
      return;
    }
    const into = pickAcquireTarget(gameRef.current, state.youId, engineId);
    if (!into) {
      setToast({ kind: "error", text: "No legal install target for this chip." });
      return;
    }
    runAction("acquire", { chip: uiChip.uid, into }, null, "Chip installed.");
  }

  function onEndTurn() {
    if (!isYourTurn) return;
    setSelectedUnitId(null);
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
            {!isYourTurn && !state.winnerId ? ` · ${state.activeId} (AI)` : ""}
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
      <div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
        <BoardViewport>
          <div style={{ position: "relative", padding: 30 }}>
            <Bracket corner="tl" />
            <Bracket corner="tr" />
            <Bracket corner="bl" />
            <Bracket corner="br" />
            <HexBoard
              state={state}
              selectedHexId={selectedHexId}
              selectedUnitId={selectedUnitId}
              reachable={reachable}
              onSelect={onHexClick}
            />
          </div>
        </BoardViewport>
        <EventFeed engineState={gameRef.current} tick={tick} />
      </div>

      {/* INSPECTOR — floating tabbed window, opens on hex selection */}
      {selectedHexId && (
        <Inspector
          state={state}
          selectedHexId={selectedHexId}
          selectedUnitId={selectedUnitId}
          isYourTurn={isYourTurn}
          onClose={() => setSelectedHexId(null)}
          onSelectUnit={onSelectUnit}
          onContest={onContest}
          onActivate={onActivate}
          onRecruit={onRecruit}
        />
      )}

      {/* BOTTOM — slide-up tabs for the player's own cards */}
      <BottomDock
        state={state}
        tabHeight={TAB_H}
        isYourTurn={isYourTurn}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelectUnit}
        onAcquire={onAcquire}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: TAB_H + 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 65,
            background: toast.kind === "error" ? "#3a1a14" : theme.plate,
            border: `1px solid ${toast.kind === "error" ? theme.accent2 : theme.borderLit}`,
            borderRadius: 6,
            padding: "8px 16px",
            color: theme.text,
            fontFamily: theme.fontDisplay,
            fontSize: 12.5,
            letterSpacing: 0.6,
            boxShadow: theme.shadowDeep,
          }}
        >
          {toast.text}
        </div>
      )}

      {encounterPrompt && (
        <EncounterModal
          encounter={encounterPrompt.encounter}
          choices={encounterPrompt.choices}
          eligibleIds={encounterPrompt.eligibleIds}
          onPick={(choiceId) =>
            doMoveWithEncounterChoice(
              encounterPrompt.unitUid,
              encounterPrompt.dest,
              choiceId,
            )
          }
          onCancel={() => setEncounterPrompt(null)}
        />
      )}

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

// Pick an install target for an Acquire — mirrors the AI's logic so the
// user doesn't have to navigate a sub-modal for the demo. Returns
// { unit } or { location } shaped param for performAction("acquire").
function pickAcquireTarget(game, pid, engineChipId) {
  const chipDef = ENGINE_CHIPS[engineChipId];
  if (!chipDef) return null;
  const slotsUsed = (chipUids) => chipUids.reduce((n, c) => {
    const id = game.chips[c]?.chipId;
    if (id === "capital") return n + 1;
    return n + (ENGINE_CHIPS[id]?.slots ?? 1);
  }, 0);

  if (chipDef.kind === "unit") {
    const mine = Object.values(game.units)
      .filter((u) => u.owner === pid)
      .sort((a, b) => b.strength - a.strength);
    for (const u of mine) {
      if (slotsUsed(u.chips) + chipDef.slots <= CONFIG.unit.baySlots) {
        return { unit: u.uid };
      }
    }
    return null;
  }
  const mine = Object.values(game.locations).filter((l) => l.controller === pid);
  for (const loc of mine) {
    if (slotsUsed(loc.chips) + chipDef.slots <= loc.chipSlots) {
      return { location: loc.hexId };
    }
  }
  return null;
}
