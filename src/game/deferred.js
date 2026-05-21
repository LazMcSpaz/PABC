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
    applyEffects(state, packet.effects, {
      source: packet.source,
      deferredFrom: packet.queuedAt,
      sourcePlayer: packet.originalActive,
    });
    emit(state, "deferred_resolved", {
      dueRound: packet.dueRound,
      queuedAt: packet.queuedAt,
      effectCount: packet.effects.length,
    });
  }
  return due;
}
