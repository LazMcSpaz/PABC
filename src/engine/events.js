// src/engine/events.js
// Event card public surface.
//   applyEvent              — dispatched when an Event is drawn during exploration
//   clearRoundEndFlags      — turn-end cleanup of expired global event flags
//   resolvePersistentEvent  — re-resolve a still-in-play Event card from a turn
//
// Per-event behavior lives in ./events/effects.js as the EVENT_EFFECTS map.

import { calcAttack, calcDefense } from "./calculations.js";
import { fireEventImmunity } from "./intrigue.js";
import { NotifKind, impact, notify } from "./notifications.js";
import { logEntry } from "./stateHelpers.js";
import { EVENT_EFFECTS } from "./events/effects.js";

export function applyEvent(state, card, drawerId) {
  // Immediate reactive: any player holding Borrowed Time can consume it to
  // grant themselves immunity to this Event. Fire that first so per-player
  // effects can skip the immune set.
  const { state: afterImmunity, immuneIds } = fireEventImmunity(state, card);

  const fn = EVENT_EFFECTS[card.id];
  if (!fn) {
    // No automation — leave the card in play for manual resolution.
    return {
      state: notify(afterImmunity, {
        kind: NotifKind.EVENT,
        title: card.name,
        message: `${card.name} drawn — manual resolution required (not yet automated).`,
        sourceCardId: card.id,
        severity: "info",
      }),
      persist: true,
    };
  }
  return fn(afterImmunity, drawerId, { immuneIds });
}

export function clearRoundEndFlags(state) {
  if (!state.globalFlags?.raidsBlocked) return state;
  const next = notify(state, {
    kind: NotifKind.FLAG,
    title: "Raids unblocked",
    message: "Vanguard Remnant Patrol has expired — raids allowed again.",
  });
  return { ...next, globalFlags: { ...next.globalFlags, raidsBlocked: false } };
}

export function resolvePersistentEvent(state, playerId, card) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.actionsRemaining < 1) return state;
  if (calcAttack(player) < (card.reqAtk ?? 0)) return state;
  if (calcDefense(player) < (card.reqDef ?? 0)) return state;
  if (player.scrap < (card.scrapCost ?? 0)) return state;

  let next = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            actionsRemaining: p.actionsRemaining - 1,
            scrap: p.scrap - (card.scrapCost ?? 0),
            earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
          }
        : p,
    ),
  };

  if (card.id === "minefield") {
    next = { ...next, globalFlags: { ...next.globalFlags, explorationBlocked: false } };
  }
  next = {
    ...next,
    explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== card.uid),
  };
  next = logEntry(next, { type: "resolve_event", playerId, cardId: card.id });
  next = notify(next, {
    kind: NotifKind.EVENT,
    title: `${card.name} resolved`,
    message:
      card.id === "minefield"
        ? "Exploration unblocked."
        : `${card.name} cleared.`,
    impacts: [
      impact(
        playerId,
        `+${card.vp ?? 0} VP${card.scrapCost ? ` · −${card.scrapCost} Scrap` : ""}`,
        { vp: card.vp, scrap: -(card.scrapCost ?? 0) },
      ),
    ],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
  return next;
}
