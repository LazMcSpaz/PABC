// The event bus (mechanical-spec §10). `emit` records every event to the
// game log and dispatches `on`-mode triggers. The `replace` reaction
// window is added in Layer 4.
import { applyEffects } from "./effects.js";

export const EVENT_NAMES = new Set([
  "turn_started", "turn_ended", "round_ended",
  "resource_gained", "resource_spent", "tech_changed",
  "stat_modified",
  "card_acquired", "card_played", "card_revealed",
  "card_entered_zone", "card_left_zone",
  "action_spent",
  "unit_moved", "unit_recruited", "unit_retreated",
  "contest_declared", "contest_won", "contest_lost",
  "obstacle_claimed", "encounter_resolved",
  "location_spawned", "section_flipped", "location_captured", "location_decayed",
  "reward_granted",
]);

// Collect `on`-mode trigger subscriptions matching an event from records
// in play. Stub content carries no `triggers` yet, so this returns []
// today — the dispatch path is in place for when chip / location /
// ability content is authored.
export function collectTriggers(state, eventName) {
  const subs = [];
  const scan = (record, source) => {
    for (const t of record?.triggers || []) {
      if (t.trigger === eventName) subs.push({ ...t, source });
    }
  };
  for (const loc of Object.values(state.locations)) scan(loc, loc);
  return subs;
}

export function emit(state, name, payload = {}) {
  if (!EVENT_NAMES.has(name)) throw new Error(`emit: unknown event "${name}"`);
  const event = { name, payload, round: state.round, turnIndex: state.activeIndex };
  state.log.push(event);
  for (const sub of collectTriggers(state, name)) {
    if (sub.mode === "on") {
      applyEffects(state, sub.effects, { source: sub.source, event });
    }
  }
  return event;
}
