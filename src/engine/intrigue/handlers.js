// src/engine/intrigue/handlers.js
// Active (player-initiated, on-turn) Intrigue effects. Each handler runs after
// playIntrigue() has validated the play, paid the action cost, and removed the
// card from hand. Handlers receive (state, playerId, card, opts?) and return a
// new state. The aggregated INTRIGUE_EFFECTS registry that maps card.id → these
// handlers lives in intrigue.js.

import { calcAttack } from "../calculations.js";
import { pausePeekReorder } from "../deckPeek.js";
import { NotifKind, impact, notify } from "../notifications.js";
import { logEntry, updatePlayer } from "../stateHelpers.js";

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

// ─── Active (played on own turn) effects ──────────────────────────────────────

export function advancedSoftware(state, playerId, card) {
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

export function trainingRegimen(state, playerId, card) {
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

export function scrapFence(state, playerId, card) {
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

export function forcedMarch(state, playerId, card) {
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

export function deadDrop(state, playerId, card) {
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

export function stolenMaps(state, playerId, card, opts) {
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

export function infectedHardware(state, playerId, card, opts) {
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

export function blackout(state, playerId, card, opts) {
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

export function dataSpike(state, playerId, card, opts) {
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

export function divertedResources(state, playerId, card, opts) {
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

export function misinformation(state, playerId, card, opts) {
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

export function requisition(state, playerId, card, opts) {
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

export function sabotage(state, playerId, card, opts) {
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

export function whisperNetwork(state, playerId, card) {
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

export function falseFlag(state, playerId, card, opts) {
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
