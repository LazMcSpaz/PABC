// Resolve due deferred-effect packets at end of round
// (mechanical-spec §15.6, §15.12). Runs BEFORE trigger evaluation so a
// resolved consequence can drive a trigger this same round.
//
// A packet is created by QUEUE_DEFERRED (effects.js); its `effects`
// already have `active` / `active_player` tokens snapshotted to the
// concrete pid that was active at queue time, so resolution lands on
// the original queuer rather than whoever happens to be active later.
import { applyEffects } from "./effects.js";
import { emit } from "./events.js";

export function sweepDeferred(state) {
  const queue = state.deferred;
  if (!queue?.length) return [];

  const due = [];
  const remaining = [];
  for (const packet of queue) {
    if (packet.dueRound <= state.round) due.push(packet);
    else remaining.push(packet);
  }
  state.deferred = remaining;

  for (const packet of due) {
    // A packet carrying `satisfiedIfFlag` is a DEADLINE: the player was
    // racing a clock, and which branch runs depends on whether they beat it.
    // Without the field this is exactly the old unconditional behaviour, so
    // every existing packet is unaffected.
    //
    // This is what makes a visible countdown mean something. A timer that
    // fires the same effects whether or not you acted is decoration; the
    // missed branch is the mechanic.
    const met = packet.satisfiedIfFlag
      ? !!state.players?.[packet.originalActive]?.flags?.[packet.satisfiedIfFlag]?.value
      : true;
    const effects = met ? packet.effects : (packet.onMissed || []);
    applyEffects(state, effects, {
      source: packet.source,
      deferredFrom: packet.queuedAt,
      sourcePlayer: packet.originalActive,
      // The sweep runs from the round-end pipeline with seat 0 nominally
      // active. Anything in the packet that still names `active` means the
      // player who queued it, not whoever the clock happens to be on.
      asPlayer: packet.originalActive,
    });
    emit(state, "deferred_resolved", {
      dueRound: packet.dueRound,
      queuedAt: packet.queuedAt,
      effectCount: effects.length,
    });
    if (packet.satisfiedIfFlag) {
      emit(state, met ? "deadline_met" : "deadline_expired", {
        player: packet.originalActive,
        label: packet.label || null,
        flag: packet.satisfiedIfFlag,
        dueRound: packet.dueRound,
      });
    }
  }
  return due;
}

/**
 * The deadlines `pid` can currently see, soonest first.
 *
 * Reads the same `state.deferred` queue the sweep resolves — there is no
 * second list to keep in step. `roundsLeft` is in ROUNDS, which is the unit
 * the rest of the HUD already uses for durations ("for N rounds" in the
 * diplomacy drawer), so the number on screen is the number the player counts.
 */
export function activeDeadlines(state, pid) {
  return (state.deferred || [])
    .filter((p) => p.visible && (!pid || p.originalActive === pid))
    .map((p) => ({
      label: p.label,
      player: p.originalActive,
      dueRound: p.dueRound,
      roundsLeft: Math.max(0, p.dueRound - state.round),
      satisfiedIfFlag: p.satisfiedIfFlag || null,
      met: p.satisfiedIfFlag
        ? !!state.players?.[p.originalActive]?.flags?.[p.satisfiedIfFlag]?.value
        : null,
    }))
    .sort((a, b) => a.dueRound - b.dueRound);
}
