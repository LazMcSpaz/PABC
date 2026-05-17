// A compact standing for one faction — VP race, scrap, actions, holdings.
import { FACTIONS, fullController, theme } from "./data.js";
import { Label, Coin } from "./kit.jsx";

export default function PlayerSummary({ state, playerId, onSelect }) {
  const faction = FACTIONS[playerId];
  const player = state.players[playerId];
  const isYou = playerId === state.youId;
  const isActive = playerId === state.activeId;

  const held = Object.values(state.hexes).filter(
    (h) => h.type === "location" && fullController(h.control?.sections) === playerId,
  ).length;
  const units = Object.values(state.units).filter((u) => u.owner === playerId).length;
  const vpPct = Math.min(100, (player.vp / state.vpGoal) * 100);

  return (
    <div
      onClick={onSelect}
      style={{
        background: isActive ? theme.panel2 : theme.panel,
        border: `1px solid ${isActive ? faction.color : theme.border}`,
        borderLeft: `4px solid ${faction.color}`,
        borderRadius: 7,
        padding: "9px 11px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: theme.text }}>
          {faction.name}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {isYou && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 0.6,
                color: theme.accent,
                border: `1px solid ${theme.accent}`,
                borderRadius: 3,
                padding: "1px 4px",
              }}
            >
              YOU
            </span>
          )}
          {isActive && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 0.6,
                color: "#15171c",
                background: faction.color,
                borderRadius: 3,
                padding: "1px 4px",
              }}
            >
              ACTIVE
            </span>
          )}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <Label>Victory</Label>
          <span style={{ fontSize: 10, fontWeight: 800, color: theme.text }}>
            {player.vp} / {state.vpGoal}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: theme.panel3, overflow: "hidden" }}>
          <div style={{ width: `${vpPct}%`, height: "100%", background: faction.color }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Coin n={player.scrap} size={13} />
        </span>
        <span style={{ color: theme.textDim }}>
          Actions{" "}
          <strong style={{ color: theme.text }}>
            {player.actions.remaining}/{player.actions.max}
          </strong>
        </span>
      </div>
      <div style={{ fontSize: 10, color: theme.textFaint }}>
        {held} location{held === 1 ? "" : "s"} held · {units}/{player.unitCap} unit
        {player.unitCap === 1 ? "" : "s"}
      </div>
    </div>
  );
}
