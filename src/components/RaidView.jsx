import { useState } from "react";
import { calcAttack, calcDefense } from "../engine/calculations.js";
import { RAID_TYPES } from "../engine/actions.js";

const RAID_TYPE_LIST = [RAID_TYPES.DESTROY, RAID_TYPES.STEAL, RAID_TYPES.DISABLE];

function RaidLauncherModal({ attacker, target, onConfirm, onCancel }) {
  const [raidType, setRaidType] = useState(RAID_TYPES.DESTROY);
  const [buildingUid, setBuildingUid] = useState(null);

  const myAtk = calcAttack(attacker);
  const theirDef = calcDefense(target);
  const lookoutBonus = target.settlement.some(
    (b) => b.id === "lookout_tower" && !(target.disabledBuildingUids ?? []).includes(b.uid),
  )
    ? 2
    : 0;
  const effectiveDef = theirDef + lookoutBonus;
  const wouldWin = myAtk > effectiveDef;

  const needsBuilding = raidType === RAID_TYPES.DESTROY;
  const hasAnyBuilding = target.settlement.length > 0;
  const hasLeader = !!target.leader;
  const intrigueCount = target.intrigueHand?.length ?? 0;

  const raidTypeDisabled = (t) => {
    if (t === RAID_TYPES.DESTROY) return !hasAnyBuilding;
    if (t === RAID_TYPES.DISABLE) return !hasLeader;
    return false;
  };

  const canConfirm = !needsBuilding || !!buildingUid;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#222",
          padding: "1rem",
          borderRadius: 6,
          minWidth: 340,
          maxWidth: 480,
          color: "#f5f5f5",
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Raid {target.name}
        </h3>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: "0.5rem" }}>
          Your ⚔{myAtk} vs their 🛡{theirDef}
          {lookoutBonus ? ` (+${lookoutBonus} Lookout)` : ""} — defender wins
          ties. Outcome applies only on success.
        </div>
        <div
          style={{
            fontSize: 12,
            color: wouldWin ? "#6d6" : "#e88",
            marginBottom: "0.75rem",
          }}
        >
          {wouldWin ? "Projected: success" : "Projected: fail"} — reactive
          Intrigue (Emergency Protocols, Decoy Caravan) may still intervene.
        </div>

        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Raid type</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {RAID_TYPE_LIST.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setRaidType(t);
                  setBuildingUid(null);
                }}
                disabled={raidTypeDisabled(t)}
                style={{
                  padding: "4px 8px",
                  border: raidType === t ? "2px solid #e88" : "1px solid #444",
                  background: "#1f1f1f",
                  color: "#f5f5f5",
                  fontSize: 12,
                }}
                title={
                  raidTypeDisabled(t)
                    ? t === RAID_TYPES.DESTROY
                      ? "Target has no buildings"
                      : t === RAID_TYPES.DISABLE
                        ? "Target has no leader"
                        : ""
                    : ""
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {raidType === RAID_TYPES.DESTROY ? (
          <div style={{ marginBottom: "0.5rem" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Which building?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {target.settlement.map((b) => (
                <button
                  key={b.uid}
                  onClick={() => setBuildingUid(b.uid)}
                  style={{
                    padding: "4px 8px",
                    border:
                      buildingUid === b.uid ? "2px solid #e88" : "1px solid #444",
                    background: "#1f1f1f",
                    color: "#f5f5f5",
                    fontSize: 12,
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {raidType === RAID_TYPES.STEAL ? (
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: "0.5rem" }}>
            {intrigueCount > 0
              ? `Steals 1 random Intrigue card (target holds ${intrigueCount}).`
              : "Target has no Intrigue — raid will have no effect but will still spend your Action."}
          </div>
        ) : null}

        {raidType === RAID_TYPES.DISABLE ? (
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: "0.5rem" }}>
            {hasLeader
              ? `Disables ${target.leader.name} until ${target.name}'s next turn.`
              : "Target has no leader."}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 6, marginTop: "0.75rem" }}>
          <button
            onClick={() => onConfirm({ raidType, buildingUid })}
            disabled={!canConfirm}
          >
            Launch Raid
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function RaidView({ state, onRaid }) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const targets = state.players.filter((p) => p.id !== state.activePlayerId);
  const myAtk = calcAttack(active);

  const [selectedTarget, setSelectedTarget] = useState(null);
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
              onClick={() => setSelectedTarget(t)}
              disabled={active.actionsRemaining < 1 || alreadyRaided || raidsBlocked}
              title={
                alreadyRaided
                  ? "Already raided this round"
                  : raidsBlocked
                    ? "Raids blocked this round"
                    : ""
              }
            >
              Raid {t.name} (🛡{theirDef})
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
        Successful raids steal half the defender's Scrap plus your declared
        outcome (destroy a building / steal an Intrigue / disable their leader).
      </div>
      {selectedTarget ? (
        <RaidLauncherModal
          attacker={active}
          target={selectedTarget}
          onCancel={() => setSelectedTarget(null)}
          onConfirm={({ raidType, buildingUid }) => {
            onRaid(selectedTarget.id, raidType, { buildingUid });
            setSelectedTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}
