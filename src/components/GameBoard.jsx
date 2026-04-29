import { useEffect, useState } from "react";
import AILog from "./AILog.jsx";
import ActionModePicker from "./ActionModePicker.jsx";
import BuildingRow from "./BuildingRow.jsx";
import CardModal from "./CardModal.jsx";
import ExploreView from "./ExploreView.jsx";
import FeedbackPanel from "./FeedbackPanel.jsx";
import IntrigueView from "./IntrigueView.jsx";
import MySettlementPanel from "./MySettlementPanel.jsx";
import NarrativeView from "./NarrativeView.jsx";
import NotificationFeed from "./NotificationFeed.jsx";
import PlayerPanel from "./PlayerPanel.jsx";
import RaidView from "./RaidView.jsx";
import UpgradesView from "./UpgradesView.jsx";

const shellStyle = {
  minHeight: "100vh",
  padding: "1rem",
  color: "#f5f5f5",
  background: "#1a1a1a",
  fontFamily: "system-ui, sans-serif",
  display: "grid",
  gap: "1rem",
};

export default function GameBoard({ state, engine }) {
  const [inspectedCard, setInspectedCard] = useState(null);
  const [actionMode, setActionMode] = useState(null);
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const aiThinking = engine.aiThinking;
  const lockUI = active?.kind === "ai" || aiThinking;

  // Reset to no-mode when the active player changes — every turn starts on
  // the welcome state so the player has to pick an action consciously.
  useEffect(() => {
    setActionMode(null);
  }, [state.activePlayerId]);

  return (
    <div style={shellStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>Ashland Conquest</strong>
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          Round {state.round} · Age {state.age} · Active:{" "}
          <span style={{ color: active?.color }}>{active?.name}</span>
          {lockUI ? <span style={{ marginLeft: 8 }}>🤖 thinking…</span> : null}
        </span>
      </header>
      <div className="app-board-grid">
        <div style={{ display: "grid", gap: "0.75rem", alignContent: "start" }}>
          {state.players.map((p) => (
            <PlayerPanel
              key={p.id}
              player={p}
              active={p.id === state.activePlayerId}
              onBoost={
                p.id === state.activePlayerId && !lockUI
                  ? (stat) => engine.boost(p.id, stat)
                  : null
              }
              onSwapLeader={
                p.id === state.activePlayerId && !lockUI
                  ? (leaderId) => engine.swapLeader(p.id, leaderId)
                  : null
              }
            />
          ))}
        </div>
        <fieldset
          disabled={lockUI}
          style={{
            border: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: "0.75rem",
            alignContent: "start",
            opacity: lockUI ? 0.6 : 1,
          }}
        >
          <MySettlementPanel
            state={state}
            activePlayer={active}
            onInspect={setInspectedCard}
            onActivate={(uid, opts) => engine.activateAbility(state.activePlayerId, uid, opts)}
            onUpgrade={(uid) => engine.upgrade(state.activePlayerId, uid)}
          />
          <ActionModePicker
            state={state}
            activePlayer={active}
            mode={actionMode}
            onModeChange={setActionMode}
          />
          {actionMode === "build" ? (
            <BuildingRow
              row={state.buildingRow}
              activePlayer={active}
              onBuild={(uid) => engine.build(state.activePlayerId, uid)}
              onInspect={setInspectedCard}
            />
          ) : null}
          {actionMode === "explore" ? (
            <ExploreView
              state={state}
              activePlayer={active}
              onExplore={() => engine.explore(state.activePlayerId)}
              onResolve={(uid) => engine.resolveCard(state.activePlayerId, uid)}
              onInspect={setInspectedCard}
            />
          ) : null}
          {actionMode === "raid" ? (
            <RaidView
              state={state}
              onRaid={(targetId, raidType, extras) =>
                engine.raid(state.activePlayerId, targetId, raidType, extras)
              }
            />
          ) : null}
          {actionMode === "intrigue" ? (
            <IntrigueView
              state={state}
              activePlayer={active}
              onInspect={setInspectedCard}
              onPlay={(cardUid, opts) =>
                engine.playIntrigue(state.activePlayerId, cardUid, opts)
              }
            />
          ) : null}
          <UpgradesView
            state={state}
            activePlayer={active}
            onInspect={setInspectedCard}
            onPurchaseUnique={(uid) => engine.purchaseUnique(state.activePlayerId, uid)}
          />
          <NarrativeView state={state} />
          <NotificationFeed state={state} />
          <AILog state={state} />
          <FeedbackPanel state={state} />
        </fieldset>
      </div>
      <footer style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={engine.endTurn} disabled={lockUI}>
          End Turn
        </button>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {active?.actionsRemaining ?? 0} Action(s) remaining
        </span>
      </footer>
      <CardModal card={inspectedCard} onClose={() => setInspectedCard(null)} />
    </div>
  );
}
