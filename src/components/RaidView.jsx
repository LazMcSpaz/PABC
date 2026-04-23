import { calcAttack, calcDefense } from "../engine/calculations.js";

export default function RaidView({ state, onRaid }) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const targets = state.players.filter((p) => p.id !== state.activePlayerId);
  const myAtk = calcAttack(active);

  const raidsBlocked = state.globalFlags?.raidsBlocked;
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Raid (⚔ {myAtk})</h3>
      {raidsBlocked ? (
        <div style={{ fontSize: 11, color: "#e88", marginBottom: 4 }}>
          🛑 Raids blocked this round (Vanguard Remnant Patrol)
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {targets.map((t) => {
          const theirDef = calcDefense(t);
          const alreadyRaided = active.raidedThisRound?.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onRaid(t.id, "Destroy Building")}
              disabled={active.actionsRemaining < 1 || alreadyRaided || raidsBlocked}
              title={alreadyRaided ? "Already raided this round" : raidsBlocked ? "Raids blocked this round" : ""}
            >
              Raid {t.name} (🛡{theirDef})
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
        Successful raids steal half the defender's Scrap. Outcome execution
        (destroy / steal / disable) not yet wired.
      </div>
    </section>
  );
}
