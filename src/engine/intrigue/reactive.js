// src/engine/intrigue/reactive.js
// Reactive (Immediate) Intrigue effects. These cards never go through
// playIntrigue() — they fire automatically when a matching game event happens,
// consuming the card from the holder's hand. Each fireXxx returns
// { state, ...flags } so the calling action can mutate its behavior (cancel,
// redirect, halve rewards, etc.).
//
// When multiple opponents hold matching cards, priority is: the first card id
// in the trigger's priority list that exists in any opponent's hand wins.

import { NotifKind, impact, notify } from "../notifications.js";
import { updatePlayer } from "../stateHelpers.js";


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
