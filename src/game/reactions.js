// The reaction window (mechanical-spec §10.2–§10.3). For events that
// admit a `replace`-mode response, openReactionWindow builds a mutable
// pending payload, resolves replace subscribers in priority order
// (affected player first, then seat order from the active player),
// lets each rewrite the payload or cancel the action, then emits the
// event normally — at which point `on`-mode subscribers fire through
// the existing bus.
//
// Events fired through plain `emit` get no window — they just notify.
// Today only `contest_declared` uses the window; encounter delivery
// and reward_granted plug into the same driver when those systems land.
import { emit, collectTriggers, evalCondition, playReactive } from "./events.js";
import { applyEffects } from "./effects.js";

export function openReactionWindow(state, eventName, payload, ctx = {}) {
  // `noReaction` (spec §9) suppresses the window but not the event.
  if (payload.noReaction) {
    emit(state, eventName, payload, ctx);
    return payload;
  }

  const pending = { ...payload, cancelled: false };
  const replaceSubs = collectTriggers(state, eventName).filter((s) => s.mode === "replace");
  const sorted = sortByPriority(state, replaceSubs, eventName, pending);

  for (const sub of sorted) {
    if (pending.cancelled) break;
    const subCtx = {
      ...ctx, pending, source: sub.source,
      event: { name: eventName, payload: pending },
    };
    if (!evalCondition(state, sub.condition, subCtx)) continue;

    if (sub.source.kind === "reactive-card") {
      const want = ctx.interact
        ? ctx.interact({ kind: "playReactive", card: sub.source.cardId, player: sub.source.owner, event: eventName })
        : true;
      if (!want) continue;
      if (playReactive(state, sub.source)) {
        emit(state, "card_played", { player: sub.source.owner, card: sub.source.uid, cardId: sub.source.cardId });
      }
    }

    applyEffects(state, sub.effects, subCtx);
  }

  if (pending.cancelled) {
    state.log.push({
      name: eventName, payload: pending, cancelled: true,
      round: state.round, turnIndex: state.activeIndex,
    });
    return null;
  }

  // No cancellation — fire the event for on-mode subscribers.
  emit(state, eventName, pending, ctx);
  return pending;
}

// Priority ordering (§10.3): the affected / defending player resolves
// first, then everyone else in seat order starting from the active
// player. Subscribers with no clear owner sort to the end.
function sortByPriority(state, subs, eventName, payload) {
  const primary = primaryStakeholder(state, eventName, payload);
  const active = state.turnOrder[state.activeIndex];
  return [...subs].sort(
    (a, b) => priorityScore(state, a, primary, active) - priorityScore(state, b, primary, active),
  );
}

function primaryStakeholder(state, eventName, payload) {
  if (eventName === "contest_declared") {
    if (payload.kind === "raid") return state.units[payload.target]?.owner;
    return state.locations[payload.hex]?.controller;
  }
  if (eventName === "reward_granted") return payload.recipient;
  if (eventName === "card_revealed") return payload.player;
  return null;
}

function priorityScore(state, sub, primary, active) {
  const owner = sub.source?.owner;
  if (owner == null) return 500;
  if (owner === primary) return 0;
  const seat = state.turnOrder.indexOf(owner);
  if (seat < 0) return 1000;
  const activeSeat = state.turnOrder.indexOf(active);
  return 1 + ((seat - activeSeat + state.turnOrder.length) % state.turnOrder.length);
}
