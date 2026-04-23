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
import { NotifKind, impact, notify } from "./notifications.js";

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function countBuildingsWith(player, field) {
  return (player.settlement ?? []).filter((b) => (b[field] ?? 0) > 0).length;
}

function removeFromHand(player, cardUid) {
  return { ...player, intrigueHand: player.intrigueHand.filter((c) => c.uid !== cardUid) };
}

function logEntry(state, entry) {
  return { ...state, log: [...(state.log ?? []), { round: state.round, ...entry }] };
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
      { stat: "atk", amount: -2, expiresOn: "owner_turn_start" },
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
      { stat: "def", amount: -4, expiresOn: "owner_turn_start" },
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
  const uids = target.settlement.map((b) => b.uid);
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    disabledBuildingUids: [...new Set([...(p.disabledBuildingUids ?? []), ...uids])],
    buildingsDisabledUntilOwnerTurnStart: [
      ...new Set([...(p.buildingsDisabledUntilOwnerTurnStart ?? []), ...uids]),
    ],
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Blackout → ${target.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, `${uids.length} building(s) disabled until their next turn`)],
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
  let next = updatePlayer(state, targetId, (p) => ({
    ...p,
    disabledBuildingUids: [...new Set([...(p.disabledBuildingUids ?? []), buildingUid])],
    buildingsDisabledUntilOwnerTurnStart: [
      ...new Set([...(p.buildingsDisabledUntilOwnerTurnStart ?? []), buildingUid]),
    ],
  }));
  next = logEntry(next, { type: "intrigue", cardId: card.id, playerId, targetId, buildingId: building.id });
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `${me.name} played Sabotage → ${target.name}'s ${building.name}`,
    message: card.ability.description,
    impacts: [impact(targetId, `${building.name} disabled until next turn`)],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
    severity: "alert",
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
};

// Plays an active (non-immediate) intrigue card from the player's hand.
// Deducts 1 Action, removes the card from hand, calls the effect, emits a
// notification. Returns state unchanged if invalid.
export function playIntrigue(state, playerId, cardUid, opts = {}) {
  if (state.winnerId != null) return state;
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
