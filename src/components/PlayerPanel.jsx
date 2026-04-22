import { calcAttack, calcDefense, calcPassiveScrap, calcVP } from "../engine/calculations.js";
import SettlementView from "./SettlementView.jsx";

export default function PlayerPanel({ player, active }) {
  const style = {
    padding: "0.75rem",
    borderRadius: 6,
    border: active ? `2px solid ${player.color}` : "1px solid #333",
    background: "#222",
  };
  return (
    <div style={style}>
      <div style={{ fontWeight: 600, color: player.color }}>{player.name}</div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        VP {calcVP(player)} · Scrap {player.scrap} · ATK {calcAttack(player)} · DEF{" "}
        {calcDefense(player)} · +{calcPassiveScrap(player)}/turn
      </div>
      <SettlementView settlement={player.settlement} leader={player.leader} />
    </div>
  );
}
