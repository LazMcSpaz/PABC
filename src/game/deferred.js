// Resolve due deferred-effect packets at end of round
// (mechanical-spec §15.6, §15.12). Runs BEFORE trigger evaluation so a
// resolved consequence can drive a trigger this same round.
//
// A packet is created by QUEUE_DEFERRED (effects.js); its `effects`
// already have `active` / `active_player` tokens snapshotted to the
// concrete pid that was active at queue time, so resolution lands on
// the original queuer rather than whoever happens to be active later.
//
// §5 anchored packets carry `anchorUnit` + `anchorHex`: the timer only
// pays out if that unit is still standing on that hex. The unit leaving
// cancels the packet immediately (cancelAnchorsOnLeave, called from the
// Move action); this sweep additionally refuses to resolve a packet whose
// anchor has broken by any other route (the unit died, was force-retreated,
// teleported, …), so a broken anchor can never fire its consequence.
import { applyEffects } from "./effects.js";
import { emit } from "./events.js";

// True when a packet's anchor still holds (or it has no anchor).
function anchorHolds(state, packet) {
  if (!packet.anchorUnit) return true;
  const u = state.units[packet.anchorUnit];
  return !!u && u.node === packet.anchorHex;
}

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

  const resolved = [];
  for (const packet of due) {
    // §5 — a due packet whose anchor has broken is discarded, not resolved.
    if (!anchorHolds(state, packet)) {
      emit(state, "deferred_cancelled", {
        reason: "anchor_broken",
        anchorUnit: packet.anchorUnit,
        anchorHex: packet.anchorHex,
        dueRound: packet.dueRound,
        queuedAt: packet.queuedAt,
      });
      continue;
    }
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
    resolved.push(packet);
  }
  return resolved;
}

// §5 — packets anchored to `uid` that a move to `destHex` would cancel (the
// unit leaving its anchor hex). A pure query the UI calls to warn "leaving
// here cancels this encounter" before committing a move. Returns [] when the
// move keeps the unit on (or returns it to) the anchor hex.
export function anchorsCancelledByMove(state, uid, destHex) {
  return (state.deferred || []).filter(
    (p) => p.anchorUnit === uid && p.anchorHex != null && p.anchorHex !== destHex,
  );
}

// §5 — cancel packets anchored to `uid` whose hex the unit has just left
// (its node is now `currentHex`). Called from runMove after the node update;
// emits a `deferred_cancelled` event per dropped packet. Returns them.
export function cancelAnchorsOnLeave(state, uid, currentHex) {
  const queue = state.deferred;
  if (!queue?.length) return [];
  const cancelled = [];
  state.deferred = queue.filter((p) => {
    if (p.anchorUnit === uid && p.anchorHex != null && p.anchorHex !== currentHex) {
      cancelled.push(p);
      return false;
    }
    return true;
  });
  for (const p of cancelled) {
    emit(state, "deferred_cancelled", {
      reason: "unit_left_hex",
      anchorUnit: p.anchorUnit,
      anchorHex: p.anchorHex,
      dueRound: p.dueRound,
      queuedAt: p.queuedAt,
    });
  }
  return cancelled;
}
