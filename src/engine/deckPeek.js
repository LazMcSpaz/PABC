// Peek-and-reorder flow.
//
// Engine entry:
//   pausePeekReorder(state, { playerId, deckType, peekCount, mayDiscard,
//                             message, followUp }) → state (with pendingPrompt)
//
// The UI (components/PeekReorderModal) renders the top N peeked cards
// and lets the player shuffle them into any order, optionally discarding
// one if mayDiscard is true. Submitting the choice invokes the resumer
// registered here, which applies the new order to the live deck and then
// runs the optional followUp descriptor — enabling flows like
//   "peek 4 Exploration, reorder, then draw 1 Intrigue" (Whisper Network)
// without each caller having to re-implement the prompt plumbing.

import { NotifKind, impact, notify } from "./notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "./prompts.js";

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

const DECK_KEY = {
  exploration: "explorationDeck",
  intrigue: "intrigueDeck",
};

// Follow-up handlers dispatched after the deck is reordered.
// Callers populate these by calling registerPeekFollowup().
export const PEEK_FOLLOWUPS = {};

export function registerPeekFollowup(name, fn) {
  PEEK_FOLLOWUPS[name] = fn;
}

function runFollowUp(state, followUp) {
  if (!followUp) return state;
  const fn = PEEK_FOLLOWUPS[followUp.type];
  return fn ? fn(state, followUp) : state;
}

export function pausePeekReorder(
  state,
  { playerId, deckType = "exploration", peekCount, mayDiscard = false, message, followUp = null },
) {
  const key = DECK_KEY[deckType] ?? DECK_KEY.exploration;
  const deck = state[key] ?? [];
  const actualCount = Math.min(peekCount, deck.length);
  if (actualCount === 0) return runFollowUp(state, followUp);

  const peeked = deck.slice(0, actualCount).map((c) => ({
    uid: c.uid,
    id: c.id,
    name: c.name,
    type: c.type,
    description: c.ability?.description ?? null,
  }));
  return pauseWithPrompt(state, {
    kind: "peek_reorder_choice",
    playerId,
    message:
      message ??
      `Peek the top ${actualCount} ${deckType} card${actualCount === 1 ? "" : "s"} and reorder${mayDiscard ? " (or discard one)" : ""}.`,
    options: [],
    context: { deckType, peekCount: actualCount, mayDiscard, peeked, followUp },
  });
}

// choice shape: { order: [uid, ...], discardedUid?: uid }
registerResumer("peek_reorder_choice", (state, choice, ctx) => {
  const key = DECK_KEY[ctx.deckType] ?? DECK_KEY.exploration;
  const deck = [...(state[key] ?? [])];
  const topN = deck.splice(0, ctx.peekCount);

  // Reorder by the player's chosen order; any missing cards go to the end.
  const ordered = [];
  for (const uid of choice?.order ?? []) {
    const found = topN.find((c) => c.uid === uid);
    if (found && !ordered.some((x) => x.uid === uid)) ordered.push(found);
  }
  for (const c of topN) {
    if (!ordered.some((x) => x.uid === c.uid)) ordered.push(c);
  }
  // Apply optional discard.
  const discardUid = ctx.mayDiscard ? choice?.discardedUid ?? null : null;
  const finalTop = discardUid ? ordered.filter((c) => c.uid !== discardUid) : ordered;

  let next = { ...state, [key]: [...finalTop, ...deck] };
  const discardedCard = discardUid ? ordered.find((c) => c.uid === discardUid) : null;
  next = notify(next, {
    kind: NotifKind.INFO,
    title: `Peeked ${ctx.peekCount} ${ctx.deckType} card${ctx.peekCount === 1 ? "" : "s"}`,
    message: discardedCard
      ? `Reordered and discarded ${discardedCard.name}.`
      : "Reordered and returned.",
    sourcePlayerId: ctx.followUp?.playerId ?? null,
  });
  next = runFollowUp(next, ctx.followUp);
  return next;
});

// AI heuristic: leave current order untouched, discard Events when allowed.
registerAIHeuristic("peek_reorder_choice", (_state, prompt) => {
  const ctx = prompt.context;
  const order = ctx.peeked.map((c) => c.uid);
  let discardedUid = null;
  if (ctx.mayDiscard) {
    const evt = ctx.peeked.find((c) => c.type === "Event");
    if (evt) discardedUid = evt.uid;
  }
  return { order, discardedUid };
});

// ─── Built-in follow-ups ─────────────────────────────────────────────────────

registerPeekFollowup("draw_intrigue", (state, followUp) => {
  const count = followUp.count ?? 1;
  const deck = [...state.intrigueDeck];
  const drawn = [];
  for (let i = 0; i < count && deck.length > 0; i++) drawn.push(deck.shift());
  if (drawn.length === 0) return state;
  let next = { ...state, intrigueDeck: deck };
  next = updatePlayer(next, followUp.playerId, (p) => ({
    ...p,
    intrigueHand: [...p.intrigueHand, ...drawn].slice(-3),
  }));
  return notify(next, {
    kind: NotifKind.INTRIGUE,
    title: `Drew ${drawn.length} Intrigue card${drawn.length === 1 ? "" : "s"}`,
    impacts: [impact(followUp.playerId, `+${drawn.length} Intrigue`)],
    sourcePlayerId: followUp.playerId,
  });
});
