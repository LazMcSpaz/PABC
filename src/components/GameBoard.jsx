import PlayerPanel from "./PlayerPanel.jsx";
import BuildingRow from "./BuildingRow.jsx";
import ExploreView from "./ExploreView.jsx";
import IntrigueView from "./IntrigueView.jsx";
import RaidView from "./RaidView.jsx";
import NarrativeView from "./NarrativeView.jsx";
import FeedbackPanel from "./FeedbackPanel.jsx";

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
  return (
    <div style={shellStyle}>
      <header>
        <strong>Ashland Conquest</strong> — Round {state.round} · Age {state.age}
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {state.players.map((p) => (
            <PlayerPanel key={p.id} player={p} active={p.id === state.activePlayerId} />
          ))}
        </div>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <BuildingRow row={state.buildingRow} onBuild={(uid) => engine.build(state.activePlayerId, uid)} />
          <ExploreView state={state} onExplore={() => engine.explore(state.activePlayerId)} />
          <IntrigueView state={state} />
          <RaidView state={state} onRaid={(targetId, raidType) => engine.raid(state.activePlayerId, targetId, raidType)} />
          <NarrativeView state={state} />
          <FeedbackPanel state={state} />
        </div>
      </div>
      <footer>
        <button onClick={engine.endTurn}>End Turn</button>
      </footer>
    </div>
  );
}
