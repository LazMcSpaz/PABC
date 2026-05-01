// src/engine/actions/raid.js
// Raid action: from declaring a raid through reactive prompts (Signal Jammers,
// Perimeter Traps), through executing the raid outcome, to logging and
// notification. The raid runs in three phases — raid → continueRaid →
// finalizeRaid — so reactive Intrigue holders + tactical buildings can be
// prompted between phases without unwinding the action.

import { calcAttack, calcDefense, calcDefenseForRaid } from "../calculations.js";
import { fireRaidReactive } from "../intrigue.js";
import { NotifKind, impact, notify } from "../notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "../prompts.js";
import { logEntry, updatePlayer } from "../stateHelpers.js";
import { hasActiveBuilding } from "./_shared.js";

// Raids are unavailable until this round to avoid first-turn unfairness
// — players need at least one round to set up a defensive baseline before
// being raidable. Surfaced in RaidView and the AI prompt.
export const RAID_UNLOCK_ROUND = 3;

export const RAID_TYPES = Object.freeze({
  // The building outcome was renamed from "Destroy" to "Disable" — a
  // successful raid now disables the target building (the owner can
  // pay 1⚡ + 2🔩 on their turn to repair it). The constant key
  // remains DESTROY for backward compatibility with older callers and
  // logged entries.
  DESTROY: "Disable Building",
  STEAL: "Steal Intrigue",
  DISABLE: "Disable Leader",
});

// Execute the attacker's declared outcome on the chosen defender.
// Returns { state, impacts, summary } — impacts and summary feed the notification.
function executeRaidOutcome(state, attackerId, defenderId, raidType, extras) {
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);

  if (raidType === RAID_TYPES.DESTROY) {
    const uid = extras?.buildingUid;
    const building = defender.settlement.find((b) => b.uid === uid);
    if (!building) {
      return {
        state,
        impacts: [],
        summary: "no building targeted — outcome skipped",
      };
    }
    // Vanguard Outpost is immune to the Disable Building raid outcome
    // (carries forward from when this was a Destroy raid).
    if (building.id === "vanguard_outpost") {
      return {
        state,
        impacts: [impact(defenderId, `${building.name} is immune — raid outcome blocked`)],
        summary: `${building.name} is immune to Disable`,
      };
    }
    // Cards with discardIfDisabled (Vanguard Armory) are removed
    // entirely instead of getting a recoverable disable.
    if (building.ability?.discardIfDisabled) {
      const next = {
        ...state,
        players: state.players.map((p) =>
          p.id === defenderId
            ? {
                ...p,
                settlement: p.settlement.filter((b) => b.uid !== uid),
                disabledBuildingUids: (p.disabledBuildingUids ?? []).filter((x) => x !== uid),
                buildingsDisabledUntilOwnerTurnEnd: (
                  p.buildingsDisabledUntilOwnerTurnEnd ?? []
                ).filter((x) => x !== uid),
              }
            : p,
        ),
      };
      return {
        state: next,
        impacts: [
          impact(defenderId, `lost ${building.name} (no recovery)`),
          impact(attackerId, `discarded ${building.name}`),
        ],
        summary: `discarded ${building.name}`,
      };
    }
    // Default: disable the building. Note we do NOT add to
    // buildingsDisabledUntilOwnerTurnEnd — raid disables persist until
    // the owner pays the Repair cost (1⚡ + 2🔩) on their turn.
    const next = {
      ...state,
      players: state.players.map((p) =>
        p.id === defenderId
          ? {
              ...p,
              disabledBuildingUids: [
                ...new Set([...(p.disabledBuildingUids ?? []), uid]),
              ],
            }
          : p,
      ),
    };
    return {
      state: next,
      impacts: [
        impact(defenderId, `${building.name} disabled (Repair: 1⚡ + 2🔩)`),
        impact(attackerId, `disabled ${building.name}`),
      ],
      summary: `disabled ${building.name}`,
    };
  }

  if (raidType === RAID_TYPES.STEAL) {
    if ((defender.intrigueHand ?? []).length === 0) {
      return {
        state,
        impacts: [impact(defenderId, "no Intrigue to steal")],
        summary: "defender had no Intrigue",
      };
    }
    const idx = Math.floor(Math.random() * defender.intrigueHand.length);
    const stolenCard = defender.intrigueHand[idx];
    const next = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === defenderId) {
          return {
            ...p,
            intrigueHand: p.intrigueHand.filter((c) => c.uid !== stolenCard.uid),
          };
        }
        if (p.id === attackerId) {
          return { ...p, intrigueHand: [...p.intrigueHand, stolenCard].slice(-3) };
        }
        return p;
      }),
    };
    return {
      state: next,
      impacts: [
        impact(attackerId, "stole an Intrigue card"),
        impact(defenderId, "lost a random Intrigue card"),
      ],
      summary: `stole an Intrigue card`,
    };
  }

  if (raidType === RAID_TYPES.DISABLE) {
    if (!defender.leader) {
      return {
        state,
        impacts: [impact(defenderId, "no leader to disable")],
        summary: "defender had no leader",
      };
    }
    const next = {
      ...state,
      players: state.players.map((p) =>
        p.id === defenderId
          ? {
              ...p,
              leader: { ...p.leader, disabled: true },
              leaderDisabledUntilOwnerTurnEnd: true,
            }
          : p,
      ),
    };
    return {
      state: next,
      impacts: [impact(defenderId, `${defender.leader.name} disabled until next turn`)],
      summary: `disabled ${defender.leader.name}`,
    };
  }

  return { state, impacts: [], summary: "unknown raid type — no outcome" };
}

export function raid(state, attackerId, targetId, raidType = RAID_TYPES.DESTROY, extras = {}) {
  if (state.pendingPrompt) return state;
  if (state.globalFlags?.raidsBlocked) return state;
  if (state.round < RAID_UNLOCK_ROUND) return state;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === targetId);
  if (!attacker || !defender || attacker.actionsRemaining < 1) return state;
  if (attacker.raidedThisRound?.includes(targetId)) return state;

  // Action + raid-cap are consumed up-front so Immediate reactive cards can't
  // be replayed for free if they cancel the raid.
  let next = updatePlayer(state, attackerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
    raidedThisRound: [...(p.raidedThisRound ?? []), targetId],
  }));

  // Immediate reactive cards: decoy_caravan can redirect the raid;
  // emergency_protocols can force the attacker to pay 3 Scrap or abandon.
  const reactive = fireRaidReactive(next, attackerId, targetId);
  next = reactive.state;
  if (reactive.cancel) {
    return logEntry(next, { type: "raid", attackerId, targetId, cancelled: true });
  }
  const effectiveDefenderId = reactive.redirectTo ?? targetId;

  return continueRaid(next, {
    attackerId,
    defenderId: effectiveDefenderId,
    raidType,
    extras,
    decisions: {},
  });
}

function continueRaid(state, ctx) {
  const { attackerId, defenderId } = ctx;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);

  // Phase: Signal Jammers (attacker opt-in).
  if (ctx.decisions.jammer === undefined) {
    if (hasActiveBuilding(attacker, "signal_jammers") && attacker.scrap >= 2) {
      return pauseWithPrompt(state, {
        kind: "signal_jammers_choice",
        playerId: attackerId,
        message: `Spend 2 Scrap on Signal Jammers to reduce ${defender.name}'s 🛡 by 2 for this raid?`,
        options: [
          { value: "spend", label: "Spend 2 Scrap (−2 🛡 target)" },
          { value: "skip", label: "Skip" },
        ],
        context: ctx,
      });
    }
    ctx = { ...ctx, decisions: { ...ctx.decisions, jammer: "skip" } };
  }
  if (ctx.decisions.jammer === "spend") {
    state = updatePlayer(state, attackerId, (p) => ({ ...p, scrap: p.scrap - 2 }));
    state = notify(state, {
      kind: NotifKind.INTRIGUE,
      title: `${attacker.name} fired Signal Jammers`,
      message: `Spent 2 Scrap — ${defender.name}'s Defense is reduced by 2 this raid.`,
      impacts: [impact(attackerId, "−2 Scrap", { scrap: -2 })],
      sourceCardId: "signal_jammers",
      sourcePlayerId: attackerId,
      severity: "warning",
    });
  }

  // Phase: Perimeter Traps (defender opt-in).
  if (ctx.decisions.traps === undefined) {
    const defNow = state.players.find((p) => p.id === defenderId);
    if (hasActiveBuilding(defNow, "perimeter_traps") && defNow.scrap >= 2) {
      const atkCurrent = calcAttack(attacker);
      return pauseWithPrompt(state, {
        kind: "perimeter_traps_choice",
        playerId: defenderId,
        message: `${attacker.name} is raiding you (⚔${atkCurrent}). Spend 2 Scrap on Perimeter Traps for +2 🛡?`,
        options: [
          { value: "spend", label: "Spend 2 Scrap (+2 🛡)" },
          { value: "skip", label: "Skip" },
        ],
        context: ctx,
      });
    }
    ctx = { ...ctx, decisions: { ...ctx.decisions, traps: "skip" } };
  }
  if (ctx.decisions.traps === "spend") {
    state = updatePlayer(state, defenderId, (p) => ({ ...p, scrap: p.scrap - 2 }));
    state = notify(state, {
      kind: NotifKind.INTRIGUE,
      title: `${defender.name} fired Perimeter Traps`,
      message: `Spent 2 Scrap — +2 🛡 against ${attacker.name}'s raid.`,
      impacts: [impact(defenderId, "−2 Scrap", { scrap: -2 })],
      sourceCardId: "perimeter_traps",
      sourcePlayerId: defenderId,
      severity: "warning",
    });
  }

  return finalizeRaid(state, ctx);
}

function finalizeRaid(state, ctx) {
  const { attackerId, defenderId, raidType, extras, decisions } = ctx;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);

  const attack = calcAttack(attacker);
  const baseDef = calcDefense(defender);
  const defenseForRaid = calcDefenseForRaid(defender);
  const jammerPenalty = decisions.jammer === "spend" ? 2 : 0;
  const trapsBonus = decisions.traps === "spend" ? 2 : 0;
  const defense = Math.max(0, defenseForRaid - jammerPenalty + trapsBonus);
  const lookoutFired = defenseForRaid > baseDef;
  const success = attack > defense;

  let next = state;
  const stolen = success ? Math.floor(defender.scrap / 2) : 0;
  if (success && stolen > 0) {
    next = updatePlayer(next, attackerId, (p) => ({ ...p, scrap: p.scrap + stolen }));
    next = updatePlayer(next, defenderId, (p) => ({ ...p, scrap: p.scrap - stolen }));
  }

  let outcomeImpacts = [];
  let outcomeSummary = "";
  if (success) {
    const result = executeRaidOutcome(next, attackerId, defenderId, raidType, extras);
    next = result.state;
    outcomeImpacts = result.impacts;
    outcomeSummary = result.summary;
  }

  next = logEntry(next, {
    type: "raid",
    attackerId,
    targetId: defenderId,
    raidType,
    success,
  });

  const defAdjustBits = [];
  if (lookoutFired) defAdjustBits.push("+2 Lookout");
  if (jammerPenalty) defAdjustBits.push("−2 Jammers");
  if (trapsBonus) defAdjustBits.push("+2 Traps");

  next = notify(next, {
    kind: NotifKind.RAID,
    title: success
      ? `Raid succeeded: ${attacker.name} → ${defender.name} (${raidType})`
      : `Raid failed: ${attacker.name} → ${defender.name}`,
    message: (success
      ? `⚔${attack} vs 🛡${defense}. Defender wins ties.${stolen > 0 ? ` Attacker stole ${stolen} Scrap.` : ""}${outcomeSummary ? ` Outcome: ${outcomeSummary}.` : ""}`
      : `⚔${attack} vs 🛡${defense}. No reward (defender wins ties).`) +
      (defAdjustBits.length ? ` Defense: ${defAdjustBits.join(", ")}.` : ""),
    impacts: success
      ? [
          ...(stolen > 0
            ? [
                impact(attackerId, `+${stolen}🔩`, { scrap: stolen }),
                impact(defenderId, `−${stolen}🔩`, { scrap: -stolen }),
              ]
            : []),
          ...outcomeImpacts,
        ]
      : [impact(attackerId, "attack repelled")],
    sourcePlayerId: attackerId,
    severity: success ? "alert" : "info",
  });
  return next;
}

registerResumer("signal_jammers_choice", (state, choice, ctx) => {
  return continueRaid(state, { ...ctx, decisions: { ...(ctx.decisions ?? {}), jammer: choice } });
});
registerResumer("perimeter_traps_choice", (state, choice, ctx) => {
  return continueRaid(state, { ...ctx, decisions: { ...(ctx.decisions ?? {}), traps: choice } });
});

// AI heuristics. Signal Jammers: spend if the 2-point reduction would
// flip an otherwise-failing raid into a success. Perimeter Traps: spend
// if the 2-point boost would flip an otherwise-winning raid into a fail.
registerAIHeuristic("signal_jammers_choice", (state, prompt) => {
  const { attackerId, defenderId } = prompt.context;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);
  if (!attacker || !defender) return "skip";
  const atk = calcAttack(attacker);
  const def = calcDefenseForRaid(defender);
  return atk > def - 2 && atk <= def ? "spend" : "skip";
});
registerAIHeuristic("perimeter_traps_choice", (state, prompt) => {
  const { attackerId, defenderId, decisions } = prompt.context;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);
  if (!attacker || !defender) return "skip";
  const atk = calcAttack(attacker);
  const jammerPenalty = decisions?.jammer === "spend" ? 2 : 0;
  const def = Math.max(0, calcDefenseForRaid(defender) - jammerPenalty);
  return atk > def && atk <= def + 2 ? "spend" : "skip";
});
