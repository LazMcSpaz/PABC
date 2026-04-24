// Pure state transitions. Each function takes state + args and returns a new
// state. Never mutate inputs. Real rule enforcement fills in over time; for
// now these do the minimum to keep state transitions visible and legal.

import {
  calcActions,
  calcAttack,
  calcDefense,
  calcDefenseForRaid,
  calcPassiveScrap,
  calcVP,
} from "./calculations.js";
import { applyEvent, clearRoundEndFlags, resolvePersistentEvent } from "./events.js";
import {
  fireChallengeResolveReactive,
  fireExploreDrawReactive,
  fireRaidReactive,
} from "./intrigue.js";
import { resolveNarrativeBeat } from "./narrative.js";
import { NotifKind, impact, notify } from "./notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "./prompts.js";
import { CARD_RESOLVERS } from "./resolution.js";
import { unlockUnlockable } from "./upgrades.js";

const WIN_VP = 30;

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function log(state, entry) {
  return { ...state, log: [...state.log, { round: state.round, ...entry }] };
}

function refreshBuildingRow(state, removedIndex) {
  const nextRow = [...state.buildingRow];
  if (removedIndex != null) nextRow.splice(removedIndex, 1);
  const deck = [...state.buildingDeck];
  while (nextRow.length < 5 && deck.length) nextRow.push(deck.shift());
  return { ...state, buildingRow: nextRow, buildingDeck: deck };
}

export function build(state, playerId, buildingUid) {
  if (state.pendingPrompt) return state;
  const rowIndex = state.buildingRow.findIndex((c) => c.uid === buildingUid);
  if (rowIndex < 0) return state;
  const card = state.buildingRow[rowIndex];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const surcharge = player.flags?.nextBuildingScrapSurcharge ?? 0;
  // ServoCo Assembly: −1 Scrap on every building purchase (floors at 0,
  // applied before the Data Spike surcharge).
  const servotechDiscount = hasActiveBuilding(player, "servotech_assembly") ? 1 : 0;
  const discountedCost = Math.max(0, (card.scrapCost ?? 0) - servotechDiscount);
  const totalCost = discountedCost + surcharge;
  if (player.scrap < totalCost) return state;
  if (player.actionsRemaining < 1) return state;
  if (player.settlement.length >= 5) return state;

  let next = updatePlayer(state, playerId, (p) => {
    const flags = { ...(p.flags ?? {}) };
    delete flags.nextBuildingScrapSurcharge;
    return {
      ...p,
      scrap: p.scrap - totalCost,
      actionsRemaining: p.actionsRemaining - 1,
      settlement: [...p.settlement, card],
      flags,
    };
  });
  next = refreshBuildingRow(next, rowIndex);
  next = log(next, { type: "build", playerId, cardId: card.id });
  if (servotechDiscount > 0 && (card.scrapCost ?? 0) > 0) {
    next = notify(next, {
      kind: NotifKind.BUILD,
      title: "ServoCo Assembly discount",
      message: `${player.name} paid ${discountedCost}🔩 for ${card.name} (−${servotechDiscount} ServoCo).`,
      impacts: [impact(playerId, `−${servotechDiscount} Scrap saved`, { scrap: servotechDiscount })],
      sourcePlayerId: playerId,
    });
  }
  if (surcharge > 0) {
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: `Data Spike surcharge applied`,
      message: `${player.name} paid +${surcharge} Scrap on this build.`,
      impacts: [impact(playerId, `paid +${surcharge} surcharge`, { scrap: -surcharge })],
      sourcePlayerId: playerId,
      severity: "warning",
    });
  }
  return next;
}

export function demolish(state, playerId, buildingUid) {
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    settlement: p.settlement.filter((b) => b.uid !== buildingUid),
  }));
}

export function boost(state, playerId, stat, amount = 1) {
  if (state.pendingPrompt) return state;
  if (stat !== "atk" && stat !== "def") return state;
  const cost = 2 * amount;
  return updatePlayer(state, playerId, (p) => {
    if (p.scrap < cost) return p;
    return {
      ...p,
      scrap: p.scrap - cost,
      boosts: { ...p.boosts, [stat]: (p.boosts?.[stat] ?? 0) + amount },
    };
  });
}

export function explore(state, playerId) {
  if (state.pendingPrompt) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.actionsRemaining < 1) return state;
  if (player.skipExploreThisTurn) return state;
  if (state.globalFlags?.explorationBlocked) return state;

  const deck = [...state.explorationDeck];
  const drawn = deck.shift();
  if (!drawn) return state;

  let next = {
    ...state,
    explorationDeck: deck,
  };
  next = updatePlayer(next, playerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
  }));
  next = log(next, { type: "explore", playerId, cardId: drawn.id });

  // Reactive: opponents may hold Trapped Road to force-discard the drawn card
  // (Events are immune — they always resolve).
  const reactive = fireExploreDrawReactive(next, playerId, drawn);
  next = reactive.state;
  if (reactive.cancelDraw) return next;

  next = {
    ...next,
    explorationInPlay: [...next.explorationInPlay, { card: drawn, drawnBy: playerId }],
  };

  // Events self-apply on draw (README: "Not optional. The drawing player
  // resolves them immediately."). applyEvent returns whether the card
  // should persist in play (e.g. Minefield blocks exploration).
  if (drawn.type === "Event") {
    const { state: afterEvent, persist } = applyEvent(next, drawn, playerId);
    next = afterEvent;
    if (!persist) {
      next = {
        ...next,
        explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== drawn.uid),
      };
    }
  }

  return next;
}

function hasActiveBuilding(player, buildingId) {
  const disabled = new Set(player.disabledBuildingUids ?? []);
  return (player.settlement ?? []).some((b) => b.id === buildingId && !disabled.has(b.uid));
}

export function resolveCard(state, playerId, cardUid, decisions = {}) {
  if (state.pendingPrompt) return state;
  const entry = state.explorationInPlay.find((e) => e.card.uid === cardUid);
  if (!entry) return state;
  const card = entry.card;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;

  const custom = CARD_RESOLVERS[card.id];
  if (typeof custom === "function") {
    const after = custom(state, playerId, card);
    return {
      ...after,
      explorationInPlay: after.explorationInPlay.filter((e) => e.card.uid !== cardUid),
    };
  }

  // Generic Challenge resolver: pay scrap, check requirements, then apply
  // rewards — which may be fully stolen by Vulture or half-skimmed by
  // Salvage Rights if an opponent holds one.
  if (card.type === "Challenge" || card.type === "Challenge (Progression)") {
    const usingArtillery = decisions.lightArtillery === "spend";
    const extraScrapCost = usingArtillery ? 1 : 0;
    const effectiveReqAtk = Math.max(0, (card.reqAtk ?? 0) - (usingArtillery ? 2 : 0));

    // Light Artillery opportunity: if the player owns an active Light
    // Artillery, has 1+ Scrap, and the 2-point requirement reduction
    // would flip the check from fail to pass, pause and ask.
    if (
      decisions.lightArtillery === undefined &&
      (card.reqAtk ?? 0) > 0 &&
      hasActiveBuilding(player, "light_artillery") &&
      player.scrap >= 1 + (card.scrapCost ?? 0) &&
      calcAttack(player) < (card.reqAtk ?? 0) &&
      calcAttack(player) >= Math.max(0, (card.reqAtk ?? 0) - 2)
    ) {
      return pauseWithPrompt(state, {
        kind: "light_artillery_choice",
        playerId,
        message: `${card.name} needs ⚔${card.reqAtk} (you have ⚔${calcAttack(player)}). Spend 1 Scrap to reduce the requirement by 2?`,
        options: [
          { value: "spend", label: "Spend 1 Scrap (−2 ⚔ requirement)" },
          { value: "skip", label: "Skip" },
        ],
        context: { playerId, cardUid, decisions },
      });
    }

    if (player.scrap < (card.scrapCost ?? 0) + extraScrapCost) return state;
    if (calcAttack(player) < effectiveReqAtk) return state;
    if (calcDefense(player) < (card.reqDef ?? 0)) return state;

    // Resolver always pays the cost up-front (plus the Light Artillery
    // surcharge, if committed).
    let next = updatePlayer(state, playerId, (p) => ({
      ...p,
      scrap: p.scrap - (card.scrapCost ?? 0) - extraScrapCost,
    }));
    if (usingArtillery) {
      next = notify(next, {
        kind: NotifKind.BUILD,
        title: `${player.name} fired Light Artillery`,
        message: `Spent 1 Scrap to reduce ${card.name}'s ⚔ requirement by 2.`,
        impacts: [impact(playerId, "−1 Scrap", { scrap: -1 })],
        sourceCardId: "light_artillery",
        sourcePlayerId: playerId,
      });
    }

    // Reactive: Vulture / Salvage Rights.
    const reactive = fireChallengeResolveReactive(next, playerId, card);
    next = reactive.state;

    const beneficiaryId = reactive.stolenByHolderId ?? playerId;
    const scrapReward = card.scrapReward ?? 0;
    const scrapHalvedAmount = reactive.halvedAmount ?? 0;

    if (reactive.stolenByHolderId != null) {
      // Full steal — holder gets everything.
      next = updatePlayer(next, beneficiaryId, (p) => ({
        ...p,
        scrap: p.scrap + scrapReward,
        bonusAtk: (p.bonusAtk ?? 0) + (card.atkReward ?? 0),
        bonusDef: (p.bonusDef ?? 0) + (card.defReward ?? 0),
        actionsRemaining: p.actionsRemaining + (card.actionReward ?? 0),
        earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
      }));
    } else if (reactive.halvedToHolderId != null) {
      // Half scrap skimmed; resolver keeps the other half and all non-scrap rewards.
      next = updatePlayer(next, reactive.halvedToHolderId, (p) => ({
        ...p,
        scrap: p.scrap + scrapHalvedAmount,
      }));
      next = updatePlayer(next, playerId, (p) => ({
        ...p,
        scrap: p.scrap + (scrapReward - scrapHalvedAmount),
        bonusAtk: (p.bonusAtk ?? 0) + (card.atkReward ?? 0),
        bonusDef: (p.bonusDef ?? 0) + (card.defReward ?? 0),
        actionsRemaining: p.actionsRemaining + (card.actionReward ?? 0),
        earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
      }));
    } else {
      // Uncontested — resolver gets everything.
      next = updatePlayer(next, playerId, (p) => ({
        ...p,
        scrap: p.scrap + scrapReward,
        bonusAtk: (p.bonusAtk ?? 0) + (card.atkReward ?? 0),
        bonusDef: (p.bonusDef ?? 0) + (card.defReward ?? 0),
        actionsRemaining: p.actionsRemaining + (card.actionReward ?? 0),
        earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
      }));
    }

    if (card.type === "Challenge (Progression)" && card.progressionTrack) {
      next = {
        ...next,
        progressionResolved: [
          ...new Set([...(next.progressionResolved ?? []), card.progressionTrack]),
        ],
      };
    }

    // Run the challenge's on-resolve ability effects. These are the
    // unlock_unlockable / draw_intrigue / add_to_hand_as_token effects
    // that progression challenges (and some regular challenges) carry on
    // top of their standard rewards.
    const abilityEffects = card.ability?.effects ?? [];
    for (const eff of abilityEffects) {
      if (eff.effect === "unlock_unlockable" && eff.unlockableId) {
        next = unlockUnlockable(next, eff.unlockableId, playerId);
      } else if (eff.effect === "draw_intrigue") {
        const count = eff.intrigueDraw ?? 1;
        const deck = [...next.intrigueDeck];
        const drawn = [];
        for (let i = 0; i < count && deck.length > 0; i++) drawn.push(deck.shift());
        if (drawn.length > 0) {
          next = { ...next, intrigueDeck: deck };
          next = updatePlayer(next, playerId, (p) => ({
            ...p,
            intrigueHand: [...p.intrigueHand, ...drawn].slice(-3),
          }));
          next = notify(next, {
            kind: NotifKind.CHALLENGE,
            title: `${card.name} granted Intrigue`,
            message: `Drew ${drawn.length} Intrigue card${drawn.length > 1 ? "s" : ""}.`,
            impacts: [impact(playerId, `+${drawn.length} Intrigue card${drawn.length > 1 ? "s" : ""}`)],
            sourceCardId: card.id,
            sourcePlayerId: playerId,
          });
        }
      }
      // add_to_hand_as_token is tracked implicitly via progressionResolved
      // — no per-card token artifact yet.
    }

    next = {
      ...next,
      explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== cardUid),
    };
    next = log(next, { type: "resolve", playerId, cardId: card.id });

    const rewardBits = [];
    if (card.scrapReward) rewardBits.push(`+${card.scrapReward}🔩`);
    if (card.atkReward) rewardBits.push(`+${card.atkReward}⚔`);
    if (card.defReward) rewardBits.push(`+${card.defReward}🛡`);
    if (card.actionReward) rewardBits.push(`+${card.actionReward}⚡`);
    if (card.vp) rewardBits.push(`+${card.vp}★`);
    if (card.scrapCost) rewardBits.unshift(`−${card.scrapCost}🔩`);
    next = notify(next, {
      kind: NotifKind.CHALLENGE,
      title: `${card.name} resolved`,
      message:
        (card.ability?.description ?? "") +
        (reactive.stolenByHolderId != null ? " (rewards stolen by Vulture)" : "") +
        (reactive.halvedToHolderId != null ? " (half scrap claimed by Salvage Rights)" : ""),
      impacts: [
        impact(playerId, rewardBits.join(" · "), {
          scrap: (card.scrapReward ?? 0) - (card.scrapCost ?? 0),
          atk: card.atkReward,
          def: card.defReward,
          actions: card.actionReward,
          vp: card.vp,
        }),
      ],
      sourceCardId: card.id,
      sourcePlayerId: playerId,
    });
    return next;
  }

  // Persistent Events (Minefield) — pay the action / meet the requirement
  // and clear the associated global flag.
  if (card.type === "Event") {
    return resolvePersistentEvent(state, playerId, card);
  }

  // Narrative beats — chain progression, branching, rewards.
  if (card.type === "Challenge (Narrative)") {
    return resolveNarrativeBeat(state, playerId, card);
  }

  // Anything unrecognized — remove from play.
  return {
    ...state,
    explorationInPlay: state.explorationInPlay.filter((e) => e.card.uid !== cardUid),
  };
}

registerResumer("light_artillery_choice", (state, choice, ctx) => {
  return resolveCard(state, ctx.playerId, ctx.cardUid, {
    ...(ctx.decisions ?? {}),
    lightArtillery: choice,
  });
});

// AI heuristic: if the only option is "spend" (otherwise we wouldn't
// have been prompted), always spend. The prompt is only emitted when it
// flips the outcome, so spending is strictly better.
registerAIHeuristic("light_artillery_choice", () => "spend");

export const RAID_TYPES = Object.freeze({
  DESTROY: "Destroy Building",
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
    // Vanguard Outpost is immune to Destroy Building raids.
    if (building.id === "vanguard_outpost") {
      return {
        state,
        impacts: [impact(defenderId, `${building.name} is immune — destroy outcome blocked`)],
        summary: `${building.name} is immune to Destroy`,
      };
    }
    const next = {
      ...state,
      players: state.players.map((p) =>
        p.id === defenderId
          ? {
              ...p,
              settlement: p.settlement.filter((b) => b.uid !== uid),
              disabledBuildingUids: (p.disabledBuildingUids ?? []).filter((x) => x !== uid),
              buildingsDisabledUntilOwnerTurnStart: (
                p.buildingsDisabledUntilOwnerTurnStart ?? []
              ).filter((x) => x !== uid),
            }
          : p,
      ),
    };
    return {
      state: next,
      impacts: [
        impact(defenderId, `lost ${building.name}`),
        impact(attackerId, `destroyed ${building.name}`),
      ],
      summary: `destroyed ${building.name}`,
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
              leaderDisabledUntilOwnerTurnStart: true,
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
    return log(next, { type: "raid", attackerId, targetId, cancelled: true });
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

// Phased continuation of a raid: handles opt-in Signal Jammers (attacker)
// and Perimeter Traps (defender) by pausing with prompts, then finalizes
// the resolution once both decisions are in hand.
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

  next = log(next, {
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

export function endTurn(state) {
  if (state.winnerId != null) return state;
  if (state.pendingPrompt) return state;
  const idx = state.players.findIndex((p) => p.id === state.activePlayerId);
  const nextIdx = (idx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];

  // Turn-start bookkeeping for the incoming player:
  //   - re-enable buildings disabled "until owner's next turn"
  //   - expire temporary debuffs tagged for owner-turn-start
  //   - clear per-turn boosts
  //   - promote skipExploreNextTurn → skipExploreThisTurn
  //   - apply bonus/lose actions scheduled from previous events
  //   - collect passive scrap (after re-enabling so disabled buildings count)
  // Turn-end bookkeeping for the outgoing player:
  //   - clear skipExploreThisTurn (their skipped turn is over)
  let next = updatePlayer(state, state.activePlayerId, (p) => ({
    ...p,
    skipExploreThisTurn: false,
  }));
  next = updatePlayer(next, nextPlayer.id, (p) => {
    const toReenable = new Set(p.buildingsDisabledUntilOwnerTurnStart ?? []);
    const stillDisabled = (p.disabledBuildingUids ?? []).filter((uid) => !toReenable.has(uid));
    const freshDebuffs = (p.temporaryDebuffs ?? []).filter(
      (d) => d.expiresOn !== "owner_turn_start",
    );
    const flags = { ...(p.flags ?? {}) };
    delete flags.divertScrapNextTurnTo;
    const leaderRecovered = !!p.leaderDisabledUntilOwnerTurnStart;
    const revived = {
      ...p,
      boosts: { atk: 0, def: 0 },
      disabledBuildingUids: stillDisabled,
      buildingsDisabledUntilOwnerTurnStart: [],
      temporaryDebuffs: freshDebuffs,
      skipExploreThisTurn: !!p.skipExploreNextTurn,
      skipExploreNextTurn: false,
      flags,
      abilityUsedThisTurn: {},
      leader: leaderRecovered && p.leader ? { ...p.leader, disabled: false } : p.leader,
      leaderDisabledUntilOwnerTurnStart: false,
    };
    const baseActions = calcActions(revived);
    const actionsAfterSchedule = Math.max(
      0,
      baseActions +
        (p.bonusActionsNextTurn ?? 0) -
        (p.loseActionsNextTurn ?? 0),
    );
    const passiveScrap = calcPassiveScrap(revived);
    // Medic Tent (+1) / Improved Meds (+2) recover permanent Attack
    // losses each turn, clamped so bonusAtk never exceeds 0 (can't
    // grant more than the player's natural score).
    let atkRecovery = 0;
    const disabledSet = new Set(revived.disabledBuildingUids ?? []);
    for (const b of revived.settlement) {
      if (disabledSet.has(b.uid)) continue;
      if (b.ability?.effect === "recover_atk") {
        atkRecovery += b.ability.atkRecovery ?? 0;
      }
    }
    const currentBonusAtk = revived.bonusAtk ?? 0;
    const recoveredBonusAtk =
      atkRecovery > 0 && currentBonusAtk < 0
        ? Math.min(0, currentBonusAtk + atkRecovery)
        : currentBonusAtk;
    // If Diverted Resources is in effect, their passive scrap goes to the
    // thief; revived.scrap stays unchanged.
    const divertTo = p.flags?.divertScrapNextTurnTo;
    return {
      ...revived,
      scrap: revived.scrap + (divertTo != null ? 0 : passiveScrap),
      _divertedScrap: divertTo != null ? { to: divertTo, amount: passiveScrap } : null,
      actionsRemaining: actionsAfterSchedule,
      bonusActionsNextTurn: 0,
      loseActionsNextTurn: 0,
      bonusAtk: recoveredBonusAtk,
      _atkRecovered: recoveredBonusAtk - currentBonusAtk,
    };
  });

  // Notify the incoming player when Medic Tent / Improved Meds fired.
  const recovered = next.players.find(
    (p) => p.id === nextPlayer.id && (p._atkRecovered ?? 0) > 0,
  );
  if (recovered) {
    next = notify(next, {
      kind: NotifKind.BUILD,
      title: `Medic recovery for ${nextPlayer.name}`,
      message: `Recovered ${recovered._atkRecovered} ⚔ from Medic Tent / Improved Meds.`,
      impacts: [impact(nextPlayer.id, `+${recovered._atkRecovered} ⚔`, { atk: recovered._atkRecovered })],
      sourcePlayerId: nextPlayer.id,
    });
  }
  next = {
    ...next,
    players: next.players.map((p) => {
      if (!("_atkRecovered" in p)) return p;
      const { _atkRecovered: _, ...clean } = p;
      return clean;
    }),
  };

  // Surface leader recovery (disabled by a previous raid) so the owner sees
  // why their leader is contributing again this turn.
  const leaderWasDisabled = state.players.find(
    (p) => p.id === nextPlayer.id,
  )?.leaderDisabledUntilOwnerTurnStart;
  if (leaderWasDisabled && nextPlayer.leader) {
    next = notify(next, {
      kind: NotifKind.FLAG,
      title: `${nextPlayer.leader.name} recovered`,
      message: `${nextPlayer.name}'s leader is no longer disabled.`,
      impacts: [impact(nextPlayer.id, "leader active again")],
      sourcePlayerId: nextPlayer.id,
    });
  }

  // If Diverted Resources fired, credit the watcher player and emit a
  // notification. Also strip the _divertedScrap bookkeeping field.
  const divert = next.players.find((p) => p._divertedScrap != null)?._divertedScrap;
  if (divert && divert.amount > 0) {
    next = updatePlayer(next, divert.to, (p) => ({ ...p, scrap: p.scrap + divert.amount }));
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: "Diverted Resources fired",
      message: `${nextPlayer.name}'s passive Scrap was redirected this turn.`,
      impacts: [
        impact(nextPlayer.id, `lost ${divert.amount} passive Scrap`, { scrap: -divert.amount }),
        impact(divert.to, `+${divert.amount} Scrap`, { scrap: divert.amount }),
      ],
      severity: "alert",
    });
  }
  next = {
    ...next,
    players: next.players.map((p) => {
      if (p._divertedScrap == null) return p;
      const { _divertedScrap: _, ...clean } = p;
      return clean;
    }),
  };

  // New round starts when we wrap to player 0: clear raidedThisRound,
  // round-end flags (e.g. raidsBlocked), apply round_start permanent
  // bonuses (e.g. Brawlins' Circuit atk recovery), refresh the row.
  if (nextIdx === 0) {
    const roundRecoveryDeltas = new Map();
    next = {
      ...next,
      round: next.round + 1,
      players: next.players.map((p) => {
        const recover = (p.permanentBonuses ?? []).reduce((sum, b) => {
          const m = b.mechanic;
          if (m?.trigger === "round_start" && m?.effect === "recover_atk") {
            return sum + (m.amount ?? 0);
          }
          return sum;
        }, 0);
        const current = p.bonusAtk ?? 0;
        const recovered =
          recover > 0 && current < 0 ? Math.min(0, current + recover) : current;
        if (recovered !== current) roundRecoveryDeltas.set(p.id, recovered - current);
        return { ...p, raidedThisRound: [], bonusAtk: recovered };
      }),
    };
    for (const [pid, delta] of roundRecoveryDeltas) {
      const pname = next.players.find((p) => p.id === pid)?.name ?? `p${pid}`;
      next = notify(next, {
        kind: NotifKind.FLAG,
        title: `Brawlins' Circuit — ${pname}`,
        message: `Round-start recovery: +${delta} ⚔ (capped at 0).`,
        impacts: [impact(pid, `+${delta} ⚔`, { atk: delta })],
        sourcePlayerId: pid,
      });
    }
    next = clearRoundEndFlags(next);
    next = refreshBuildingRow(next, 0);
  }

  next = { ...next, activePlayerId: nextPlayer.id };

  const winner = next.players.find((p) => calcVP(p) >= WIN_VP);
  if (winner) {
    next = { ...next, winnerId: winner.id };
    next = notify(next, {
      kind: NotifKind.INFO,
      title: `${winner.name} wins!`,
      message: `Reached ${calcVP(winner)} VP.`,
      sourcePlayerId: winner.id,
      severity: "alert",
    });
  }

  return next;
}
