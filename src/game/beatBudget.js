// How many quest beats one player may be handed in a turn.
//
// Beats arrive from three places that know nothing about each other — the
// fan-out when a quest starts or advances (quests.js), the round-end pulse
// that re-checks gated beats (also quests.js), and a unit walking onto a
// discovered marker (encounters.js). Each was individually reasonable and
// together they could hand a player five or six cards between one turn and
// the next, which is a stack of modal windows to click through rather than a
// story to follow.
//
// So the budget is per player, per turn, and shared across all three. It is
// deliberately NOT per delivery mode: the player experiences cards, not
// delivery modes, and a cap that only counted one kind would leave the others
// free to overwhelm.
//
// Nothing is lost when the budget runs out. A direct-delivery beat is simply
// not marked delivered, so the next pass picks it up; a marker stays on its
// hex to be walked onto again. Both are retries, not drops.
//
// Its own module rather than a corner of quests.js because both quests.js and
// encounters.js need it and quests.js already imports encounters.js — putting
// it in either one closes an import cycle.
import { CONFIG } from "./config.js";
import { emit } from "./events.js";

function budgets(state) {
  state.beatBudget = state.beatBudget || {};
  return state.beatBudget;
}

/**
 * Called from startTurn — the allowance for the seat about to play.
 *
 * Not simply zero. Beats delivered to a human go onto the pending queue and
 * are read when control comes back, so beats handed over at the round-end
 * pulse are still unread when the next turn begins. Zeroing here would let a
 * fresh three stack on top of them and put six cards in front of a player who
 * was promised three. What is already waiting is already spent.
 *
 * Only quest beats count. A field or world encounter waiting in the same queue
 * is not a beat and is paced by its own rules.
 */
export function resetBeatBudget(state, pid) {
  if (!pid) return;
  const waiting = (state.pendingEncounters || [])
    .filter((p) => p.recipient === pid && p.ctx?.questId).length;
  budgets(state)[pid] = waiting;
}

/** How many more beats this player may receive this turn. */
export function beatsRemaining(state, pid) {
  const cap = CONFIG.quests?.beatsPerTurn ?? 0;
  if (!cap || !pid) return Infinity; // 0 disables the cap entirely
  return Math.max(0, cap - (budgets(state)[pid] || 0));
}

/**
 * Take one beat out of `pid`'s allowance.
 *
 * Returns false when there was none to take, and the caller must then leave
 * the beat undelivered — spending and delivering have to stay one decision or
 * the budget drifts away from what the player actually saw.
 */
export function spendBeat(state, pid) {
  if (!pid) return true;
  if (beatsRemaining(state, pid) <= 0) return false;
  const b = budgets(state);
  b[pid] = (b[pid] || 0) + 1;
  return true;
}

/** Say so in the log, once, so a held beat is not mistaken for a lost one. */
export function noteBeatHeld(state, pid, questId, beatId, reason) {
  emit(state, "quest_beat_held", {
    player: pid, questId, beatId, reason,
    cap: CONFIG.quests?.beatsPerTurn ?? 0,
  });
}
