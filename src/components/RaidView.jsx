import { calcAttack, calcDefense } from "../engine/calculations.js";

export default function RaidView({ state, onRaid }) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const targets = state.players.filter((p) => p.id !== state.activePlayerId);
  const myAtk = calcAttack(active);

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Raid (⚔ {myAtk})</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {targets.map((t) => {
          const theirDef = calcDefense(t);
          const alreadyRaided = active.raidedThisRound?.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onRaid(t.id, "Destroy Building")}
              disabled={active.actionsRemaining < 1 || alreadyRaided}
              title={alreadyRaided ? "Already raided this round" : ""}
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
