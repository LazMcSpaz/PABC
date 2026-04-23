import { calcActions, calcAttack, calcDefense, calcPassiveScrap, calcVP } from "../engine/calculations.js";
import SettlementView from "./SettlementView.jsx";

export default function PlayerPanel({ player, active, onBoost }) {
  const style = {
    padding: "0.75rem",
    borderRadius: 6,
    border: active ? `2px solid ${player.color}` : "1px solid #333",
    background: "#222",
  };
  return (
    <div style={style}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, color: player.color }}>{player.name}</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{player.kind === "ai" ? "AI" : "You"}</span>
      </div>
      <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
        ★ {calcVP(player)} VP · 🔩 {player.scrap} · ⚔ {calcAttack(player)} · 🛡 {calcDefense(player)}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        +🔩{calcPassiveScrap(player)}/turn · ⚡ {player.actionsRemaining}/{calcActions(player)}
        {player.boosts?.atk || player.boosts?.def ? (
          <span>
            {" · boosts "}
            {player.boosts.atk ? `⚔+${player.boosts.atk} ` : ""}
            {player.boosts.def ? `🛡+${player.boosts.def}` : ""}
          </span>
        ) : null}
      </div>
      {(player.temporaryDebuffs ?? []).length > 0 ||
      player.skipExploreThisTurn ||
      player.skipExploreNextTurn ||
      player.bonusActionsNextTurn ||
      player.loseActionsNextTurn ? (
        <div style={{ fontSize: 11, color: "#e88", marginTop: 4 }}>
          {player.temporaryDebuffs?.map((d, i) => (
            <span key={i}>
              {d.stat.toUpperCase()} {d.amount > 0 ? "+" : ""}
              {d.amount} (until turn start){" "}
            </span>
          ))}
          {player.skipExploreThisTurn ? "skip explore · " : ""}
          {player.skipExploreNextTurn ? "skip explore next · " : ""}
          {player.bonusActionsNextTurn ? `+${player.bonusActionsNextTurn}⚡ next · ` : ""}
          {player.loseActionsNextTurn ? `-${player.loseActionsNextTurn}⚡ next` : ""}
        </div>
      ) : null}
      {active && onBoost ? (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <button onClick={() => onBoost("atk")} disabled={player.scrap < 2}>
            Boost ⚔ (2🔩)
          </button>
          <button onClick={() => onBoost("def")} disabled={player.scrap < 2}>
            Boost 🛡 (2🔩)
          </button>
        </div>
      ) : null}
      <SettlementView settlement={player.settlement} leader={player.leader} />
    </div>
  );
}
