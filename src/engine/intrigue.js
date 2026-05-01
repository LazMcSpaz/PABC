// Intrigue card effects. Two shapes:
//   INTRIGUE_EFFECTS[id] = { apply: (state, playerId, card, opts) => newState,
//                            requires: ["target" | "twoTargets" | "buildingTarget" | null],
//                            validate?: (state, playerId, card, opts) => bool,
//                          }
// or for Immediate (reactive) cards:
//   INTRIGUE_EFFECTS[id] = { immediate: true, trigger: "...", ... }
//
// playIntrigue() applies an active (non-immediate) card: it validates the
// requirement and target, deducts an Action, removes the card from the
// player's hand, calls the effect, and emits a notification. Immediate
// cards are wired through the trigger bus in a later pass — they currently
// also land in INTRIGUE_EFFECTS so resolvePersistentEvent and raid() can
// detect them, but they aren't playable via playIntrigue().

import { calcAttack } from "./calculations.js";
import { pausePeekReorder } from "./deckPeek.js";
import { NotifKind, impact, notify } from "./notifications.js";
import { logEntry, updatePlayer } from "./stateHelpers.js";

// Buildings whose `ability.discardIfDisabled` is true (Rebuild Vanguard
// Armory) are removed from settlement entirely instead of toggling
// disabled state. Splits a uid list against a settlement and returns
// { toDisable, toDiscard }.
function splitDisableTargets(player, uids) {
  const toDisable = [];
  const toDiscard = [];
  for (const uid of uids) {
    const b = (player.settlement ?? []).find((x) => x.uid === uid);
    if (b?.ability?.discardIfDisabled) toDiscard.push(uid);
    else if (b) toDisable.push(uid);
  }
  return { toDisable, toDiscard };
}

function countBuildingsWith(player, field) {
  return (player.settlement ?? []).filter((b) => (b[field] ?? 0) > 0).length;
}

function removeFromHand(player, cardUid) {
  return { ...player, intrigueHand: player.intrigueHand.filter((c) => c.uid !== cardUid) };
}

// ─── Active (played on own turn) effects ──────────────────────────────────────

function advancedSoftware(state, playerId, card) {
  const me = state.players.find((p) => p.id === playerId);
  const count = countBuildingsWith(me, "passiveScrap");
  const gain = count * 2;
  let next = updatePlayer(state, playerId, (p) => ({ ...p, scrap: p.scrap + gain }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Advanced Software`,
    message: card.ability.description,
    impacts: [impact(playerId, `+${gain} Scrap (${count} Scrap-producing building${count === 1 ? "" : "s"})`, { scrap: gain })],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
}

function trainingRegimen(state, playerId, card) {
  const me = state.players.find((p) => p.id === playerId);
  const count = countBuildingsWith(me, "passiveAtk");
  const gain = count * 2;
  let next = updatePlayer(state, playerId, (p) => ({ ...p, bonusAtk: (p.bonusAtk ?? 0) + gain }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Training Regimen`,
    message: card.ability.description,
    impacts: [impact(playerId, `+${gain} permanent ⚔ (${count} Attack-producing building${count === 1 ? "" : "s"})`, { atk: gain })],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
}

function scrapFence(state, playerId, card) {
  const me = state.players.find((p) => p.id === playerId);
  let next = updatePlayer(state, playerId, (p) => ({ ...p, scrap: p.scrap + 5 }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Scrap Fence`,
    message: card.ability.description,
    impacts: [impact(playerId, "+5 Scrap (uncounterable)", { scrap: 5 })],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
}

function forcedMarch(state, playerId, card) {
  const me = state.players.find((p) => p.id === playerId);
  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining + 2,
    temporaryDebuffs: [
      ...(p.temporaryDebuffs ?? []),
      { stat: "atk", amount: -2, expiresOn: "owner_turn_end" },
    ],
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Forced March`,
    message: card.ability.description,
    impacts: [impact(playerId, "+2 Actions now · −2 ⚔ until next turn", { actions: 2, atk: -2 })],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
}

function deadDrop(state, playerId, card) {
  const me = state.players.find((p) => p.id === playerId);
  const deck = [...state.intrigueDeck];
  const drawn = [deck.shift(), deck.shift()].filter(Boolean);
  let next = { ...state, intrigueDeck: deck };
  next = updatePlayer(next, playerId, (p) => ({
    ...p,
    intrigueHand: [...p.intrigueHand, ...drawn],
  }));
  // Hand limit still 3 — auto-discard the oldest cards over the limit.
  next = updatePlayer(next, playerId, (p) => {
    if (p.intrigueHand.length <= 3) return p;
    return { ...p, intrigueHand: p.intrigueHand.slice(p.intrigueHand.length - 3) };
  });
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Dead Drop`,
    message: "Drew 2 Intrigue cards. (Hand-limit increase until next turn not yet wired — auto-trimmed to 3.)",
    impacts: [impact(playerId, `drew ${drawn.length} card(s)`)],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
}

// ─── Targeted (single opponent) effects ──────────────────────────────────────

function stolenMaps(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  let next = updatePlayer(state, playerId, (p) => ({ ...p, actionsRemaining: p.actionsRemaining + 2 }));
  next = updatePlayer(next, targetId, (p) => ({
    ...p,
    loseActionsNextTurn: (p.loseActionsNextTurn ?? 0) + 1,
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Stolen Maps → ${target.name}`,
    message: card.ability.description,
    impacts: [
      impact(playerId, "+2 Actions now", { actions: 2 }),
      impact(targetId, "−1 Action next turn", { actions: -1 }),
    ],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "warning",
  });
}

function infectedHardware(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    temporaryDebuffs: [
      ...(p.temporaryDebuffs ?? []),
      { stat: "def", amount: -4, expiresOn: "owner_turn_end" },
    ],
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Infected Hardware → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, "−4 🛡 until their next turn", { def: -4 })],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "alert",
  });
}

function blackout(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  const allUids = target.settlement.map((b) => b.uid);
  const { toDisable, toDiscard } = splitDisableTargets(target, allUids);
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    settlement: (p.settlement ?? []).filter((b) => !toDiscard.includes(b.uid)),
    disabledBuildingUids: [
      ...new Set([...(p.disabledBuildingUids ?? []), ...toDisable]),
    ],
    buildingsDisabledUntilOwnerTurnEnd: [
      ...new Set([...(p.buildingsDisabledUntilOwnerTurnEnd ?? []), ...toDisable]),
    ],
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  const summary = [
    toDisable.length ? `${toDisable.length} building(s) disabled until their next turn` : null,
    toDiscard.length ? `${toDiscard.length} building(s) discarded (no recovery)` : null,
  ].filter(Boolean).join(" · ");
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Blackout → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, summary || "no effect")],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "alert",
  });
}

function dataSpike(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    flags: { ...(p.flags ?? {}), nextBuildingScrapSurcharge: 3 },
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Data Spike → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, "next build costs +3 Scrap")],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "warning",
  });
}

function divertedResources(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    flags: { ...(p.flags ?? {}), divertScrapNextTurnTo: playerId },
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Diverted Resources → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, "next turn's passive Scrap goes to attacker")],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "alert",
  });
}

function misinformation(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    flags: { ...(p.flags ?? {}), nextExploreIsSurprise: true },
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Misinformation → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, "next Exploration draw treated as Surprise")],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "warning",
  });
}

function requisition(state, playerId, card, opts) {
  const targetId = opts.targetId;
  const me = state.players.find((p) => p.id === playerId);
  const target = state.players.find((p) => p.id === targetId);
  if (target.intrigueHand.length === 0) {
    let next = updatePlayer(state, playerId, (p) => ({ ...p, scrap: p.scrap + 3 }));
    next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
    return notify(next, {
      kind: NotifKind.INTRIGUE,
      title: `${me.name} played Requisition → ${target.name}`,
      message: card.ability.description,
      impacts: [impact(playerId, "+3 Scrap (target had no Intrigue)", { scrap: 3 })],
      sourceCardId: card.id,
      sourcePlayerId: playerId,
    });
  }
  const idx = Math.floor(Math.random() * target.intrigueHand.length);
  const stolen = target.intrigueHand[idx];
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    intrigueHand: p.intrigueHand.filter((c) => c.uid !== stolen.uid),
  }));
  next = updatePlayer(next, playerId, (p) => ({
    ...p,
    intrigueHand: [...p.intrigueHand, stolen].slice(-3),
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Requisition → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(playerId, `stole an Intrigue card`), impact(targetId, "lost a random Intrigue card")],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "warning",
  });
}

function sabotage(state, playerId, card, opts) {
  const me = state.players.find((p) => p.id === playerId);
  if (calcAttack(me) < 2) return state;
  const { targetId, buildingUid } = opts;
  const target = state.players.find((p) => p.id === targetId);
  const building = target.settlement.find((b) => b.uid === buildingUid);
  if (!building) return state;
  const discardInstead = !!building.ability?.discardIfDisabled;
  let next = updatePlayer(state, targetId, (p) =>
    discardInstead
      ? {
          ...p,
          settlement: (p.settlement ?? []).filter((b) => b.uid !== buildingUid),
        }
      : {
          ...p,
          disabledBuildingUids: [
            ...new Set([...(p.disabledBuildingUids ?? []), buildingUid]),
          ],
          buildingsDisabledUntilOwnerTurnEnd: [
            ...new Set([
              ...(p.buildingsDisabledUntilOwnerTurnEnd ?? []),
              buildingUid,
            ]),
          ],
        },
  );
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId, buildingId: building.id });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Sabotage → ${target.name}'s ${building.name}`,
    message: card.ability.description,
    impacts: [
      impact(
        targetId,
        discardInstead
          ? `${building.name} discarded (no recovery)`
          : `${building.name} disabled until next turn`,
      ),
    ],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "alert",
  });
}

function whisperNetwork(state, playerId, card) {
  const me = state.players.find((p) => p.id === playerId);
  let next = logEntry(state, { type: "intrigue", cardId: card.id, playerId });
  next = notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Whisper Network`,
    message: card.ability.description,
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
  return pausePeekReorder(next, {
    playerId,
    deckType: "exploration",
    peekCount: 4,
    mayDiscard: false,
    message: "Whisper Network: reorder the top 4 Exploration cards, then draw 1 Intrigue.",
    followUp: { type: "draw_intrigue", count: 1, playerId },
  });
}

function falseFlag(state, playerId, card, opts) {
  const me = state.players.find((p) => p.id === playerId);
  const targetIds = opts.targetIds ?? [];
  const impacts = [];
  let next = state;
  for (const tId of targetIds) {
    next = updatePlayer(next, tId, (p) => {
      if (p.scrap >= 2) {
        impacts.push(impact(tId, "paid 2 Scrap", { scrap: -2 }));
        return { ...p, scrap: p.scrap - 2 };
      }
      impacts.push(impact(tId, "could not pay — −1 permanent ⚔", { atk: -1 }));
      return { ...p, bonusAtk: (p.bonusAtk ?? 0) - 1 };
    });
  }
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetIds });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played False Flag`,
    message: card.ability.description,
    impacts,
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "warning",
  });
}

// ─── Reactive / Immediate effects ────────────────────────────────────────────
//
// These cards never go through playIntrigue() — they fire automatically when
// a matching game event happens, consuming the card from the holder's hand.
// Each fireXxx function returns { state, ...flags } so the calling action can
// mutate its behavior (cancel, redirect, halve rewards, etc.).
//
// When multiple opponents hold matching cards, priority is: the first card id
// in the trigger's priority list that exists in any opponent's hand wins.

function findHolder(state, cardIdPriority, excludePlayerId) {
  for (const cardId of cardIdPriority) {
    for (const p of state.players) {
      if (p.id === excludePlayerId) continue;
      const card = (p.intrigueHand ?? []).find((c) => c.id === cardId && c.immediate);
      if (card) return { holderId: p.id, card };
    }
  }
  return null;
}

function consumeCard(state, holderId, cardUid) {
  return updatePlayer(state, holderId, (p) => ({
    ...p,
    intrigueHand: p.intrigueHand.filter((c) => c.uid !== cardUid),
  }));
}

// Raid declared. Defender may hold decoy_caravan (redirect) or emergency_protocols
// (force attacker to pay 3 Scrap or abandon). decoy_caravan has priority since
// it completely sidesteps the raid.
export function fireRaidReactive(state, attackerId, defenderId) {
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);
  if (!defender) return { state };

  // decoy_caravan (held by defender)
  const decoyCard = defender.intrigueHand.find(
    (c) => c.id === "decoy_caravan" && c.immediate,
  );
  if (decoyCard) {
    const candidates = state.players.filter(
      (p) => p.id !== attackerId && p.id !== defenderId,
    );
    if (candidates.length === 0) {
      // Nowhere to redirect — card doesn't fire.
    } else {
      const newTarget = candidates[Math.floor(Math.random() * candidates.length)];
      let next = consumeCard(state, defenderId, decoyCard.uid);
      next = notify(next, {
        kind: NotifKind.INTRIGUE,
        title: `${defender.name} played Decoy Caravan`,
        message: `Raid from ${attacker.name} redirected to ${newTarget.name}.`,
        impacts: [impact(defenderId, "discarded Decoy Caravan"), impact(newTarget.id, "now target of raid")],
        sourceCardId: "decoy_caravan",
        sourcePlayerId: defenderId,
        severity: "alert",
      });
      return { state: next, redirectTo: newTarget.id };
    }
  }

  // emergency_protocols (held by defender)
  const epCard = defender.intrigueHand.find(
    (c) => c.id === "emergency_protocols" && c.immediate,
  );
  if (epCard) {
    let next = consumeCard(state, defenderId, epCard.uid);
    if (attacker.scrap >= 3) {
      next = updatePlayer(next, attackerId, (p) => ({ ...p, scrap: p.scrap - 3 }));
      next = notify(next, {
        kind: NotifKind.INTRIGUE,
        title: `${defender.name} played Emergency Protocols`,
        message: `${attacker.name} paid 3 Scrap to continue the raid.`,
        impacts: [
          impact(defenderId, "discarded Emergency Protocols"),
          impact(attackerId, "−3 Scrap", { scrap: -3 }),
        ],
        sourceCardId: "emergency_protocols",
        sourcePlayerId: defenderId,
        severity: "warning",
      });
      return { state: next };
    }
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: `${defender.name} played Emergency Protocols`,
      message: `${attacker.name} couldn't afford 3 Scrap — raid abandoned.`,
      impacts: [impact(defenderId, "discarded Emergency Protocols"), impact(attackerId, "raid abandoned")],
      sourceCardId: "emergency_protocols",
      sourcePlayerId: defenderId,
      severity: "alert",
    });
    return { state: next, cancel: true };
  }

  return { state };
}

// Peek at whether any opponent holds a Vulture or Salvage Rights they
// could fire if the resolver completes the challenge. Used by
// resolveCard to surface a holder-approval prompt before the reactive
// auto-fires. Does not mutate state or consume the card.
export function peekChallengeReactiveHolder(state, resolverId) {
  const match = findHolder(state, ["vulture", "salvage_rights"], resolverId);
  if (!match) return null;
  return {
    holderId: match.holderId,
    cardId: match.card.id,
    cardName: match.card.name,
  };
}

// Opponent successfully resolved a Challenge. vulture steals ALL rewards;
// salvage_rights claims half the Scrap reward.
export function fireChallengeResolveReactive(state, resolverId, card, repeats = 1) {
  const match = findHolder(state, ["vulture", "salvage_rights"], resolverId);
  if (!match) return { state };
  const { holderId, card: intrigue } = match;
  const holder = state.players.find((p) => p.id === holderId);
  const resolver = state.players.find((p) => p.id === resolverId);

  if (intrigue.id === "vulture") {
    // Card is consumed; rewards redirect to holder.
    let next = consumeCard(state, holderId, intrigue.uid);
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: `${holder.name} played Vulture`,
      message: `Stole the rewards from ${resolver.name}'s ${card.name}.`,
      sourceCardId: "vulture",
      sourcePlayerId: holderId,
      severity: "alert",
    });
    return { state: next, stolenByHolderId: holderId };
  }

  // salvage_rights: holder claims half scrap reward; resolver still gets the other half + VP.
  // Multi-resolved challenges scale the half by `repeats` so the holder's
  // share follows the actual reward yield.
  const half = Math.floor(((card.scrapReward ?? 0) * repeats) / 2);
  let next = consumeCard(state, holderId, intrigue.uid);
  next = notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${holder.name} played Salvage Rights`,
    message: `Claimed half the Scrap reward from ${resolver.name}'s ${card.name}.`,
    impacts: [
      impact(holderId, `+${half} Scrap`, { scrap: half }),
      impact(resolverId, `−${half} Scrap (half diverted)`, { scrap: -half }),
    ],
    sourceCardId: "salvage_rights",
    sourcePlayerId: holderId,
    severity: "warning",
  });
  return { state: next, halvedToHolderId: holderId, halvedAmount: half };
}

// Opponent just drew from the Exploration deck. trapped_road forces discard
// (except Events — they always resolve).
export function fireExploreDrawReactive(state, drawerId, card) {
  if (card?.type === "Event") return { state };
  const match = findHolder(state, ["trapped_road"], drawerId);
  if (!match) return { state };
  const { holderId, card: intrigue } = match;
  const holder = state.players.find((p) => p.id === holderId);
  const drawer = state.players.find((p) => p.id === drawerId);
  let next = consumeCard(state, holderId, intrigue.uid);
  next = notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${holder.name} played Trapped Road`,
    message: `${drawer.name}'s ${card.name} discarded before resolution.`,
    sourceCardId: "trapped_road",
    sourcePlayerId: holderId,
    severity: "warning",
  });
  return { state: next, cancelDraw: true };
}

// Event drawn. Any player holding borrowed_time may use it to grant themselves
// immunity to the event. Each holder independently consumes one card.
export function fireEventImmunity(state, card) {
  const immune = new Set();
  let next = state;
  for (const p of state.players) {
    const bt = p.intrigueHand.find((c) => c.id === "borrowed_time" && c.immediate);
    if (!bt) continue;
    immune.add(p.id);
    next = consumeCard(next, p.id, bt.uid);
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: `${p.name} played Borrowed Time`,
      message: `Unaffected by ${card.name} this round.`,
      sourceCardId: "borrowed_time",
      sourcePlayerId: p.id,
    });
  }
  return { state: next, immuneIds: immune };
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const INTRIGUE_EFFECTS = {
  advanced_software: { requires: null, apply: advancedSoftware },
  training_regimen: { requires: null, apply: trainingRegimen },
  scrap_fence: { requires: null, apply: scrapFence },
  forced_march: { requires: null, apply: forcedMarch },
  dead_drop: { requires: null, apply: deadDrop },
  stolen_maps: { requires: "target", apply: stolenMaps },
  infected_hardware: { requires: "target", apply: infectedHardware },
  blackout: { requires: "target", apply: blackout },
  data_spike: { requires: "target", apply: dataSpike },
  diverted_resources: { requires: "target", apply: divertedResources },
  misinformation: { requires: "target", apply: misinformation },
  requisition: { requires: "target", apply: requisition },
  sabotage: { requires: "buildingTarget", apply: sabotage },
  false_flag: { requires: "twoTargets", apply: falseFlag },
  whisper_network: { requires: null, apply: whisperNetwork },
};

// Plays an active (non-immediate) intrigue card from the player's hand.
// Deducts 1 Action, removes the card from hand, calls the effect, emits a
// notification. Returns state unchanged if invalid.
export function playIntrigue(state, playerId, cardUid, opts = {}) {
  if (state.winnerId != null) return state;
  if (state.pendingPrompt) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.actionsRemaining < 1) return state;
  const card = player.intrigueHand.find((c) => c.uid === cardUid);
  if (!card) return state;
  if (card.immediate) return state; // immediates are handled via the trigger bus
  const entry = INTRIGUE_EFFECTS[card.id];
  if (!entry || typeof entry.apply !== "function") return state;

  // Validate target requirements.
  switch (entry.requires) {
    case "target":
      if (opts.targetId == null) return state;
      if (!state.players.some((p) => p.id === opts.targetId && p.id !== playerId)) return state;
      break;
    case "twoTargets": {
      const ids = opts.targetIds ?? [];
      if (ids.length !== 2) return state;
      if (ids.some((id) => !state.players.some((p) => p.id === id && p.id !== playerId))) return state;
      if (ids[0] === ids[1]) return state;
      break;
    }
    case "buildingTarget": {
      const { targetId, buildingUid } = opts;
      if (targetId == null || !buildingUid) return state;
      const target = state.players.find((p) => p.id === targetId && p.id !== playerId);
      if (!target) return state;
      if (!target.settlement.some((b) => b.uid === buildingUid)) return state;
      break;
    }
    default:
      break;
  }

  // Deduct action + remove card from hand, then apply effect.
  let next = updatePlayer(state, playerId, (p) => ({
    ...removeFromHand(p, cardUid),
    actionsRemaining: p.actionsRemaining - 1,
  }));
  next = entry.apply(next, playerId, card, opts);
  return next;
}
