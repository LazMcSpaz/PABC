// The event bus (mechanical-spec §10). `emit` logs every event and
// fires `on`-mode subscribers. The `replace`-mode reaction window lives
// in reactions.js and wraps `emit` for events that admit cancellation /
// payload rewrites.
import { applyEffects } from "./effects.js";
import { CHIPS, CAPITAL, ABILITIES, REACTIVES } from "./content.js";
import { evalCond as dslEvalCond } from "./dsl.js";

export const EVENT_NAMES = new Set([
  "turn_started", "turn_ended", "round_ended",
  "resource_gained", "resource_spent",
  // §17 Tech Wheel
  "research_changed", "tech_level_changed", "tech_node_assigned", "tech_node_lost",
  "stat_modified",
  "card_acquired", "card_played", "card_revealed",
  "card_entered_zone", "card_left_zone",
  "action_spent",
  "unit_moved", "unit_recruited", "unit_retreated",
  "contest_declared", "contest_won", "contest_lost",
  "obstacle_claimed", "encounter_resolved",
  "location_spawned", "section_flipped", "location_captured", "location_decayed",
  // §18.2 Loyalty
  "loyalty_changed", "loyalty_failing", "control_peeled",
  // §18.3 Influence & Zone of Control
  "zone_changed",
  "reward_granted",
  // v0.2 §16 — attrition, salvage, reinforcement, veterancy
  "unit_destroyed", "unit_salvaged", "base_strength_changed",
  "unit_reinforced", "reinforcement_requested", "reinforcement_arrived",
  "veteran_promoted",
  "loot_dropped", "loot_claimed",
  // Layer 5 — encounter & quest system (spec §15.13)
  "encounter_delivered", "trigger_fired",
  "quest_started", "quest_advanced", "quest_completed",
  "standing_changed", "track_changed", "deferred_resolved",
  // §20 Economy & City Development (APPEND-ONLY — distinct keys so a parallel
  // Influence branch never collides). The Market is retired, so `market_churned`
  // is dropped with it.
  "build_started", "build_completed", "chip_upgraded",
  "chip_dormant", "chip_reactivated", "slider_changed",
  // §19 Exploration, Vision & Fog of War (APPEND-ONLY — distinct keys).
  "hex_explored", "unit_spotted", "unit_lost_sight", "ambush_triggered",
  // §17.7 Listening Post (Intelligence A2) lifecycle (APPEND-ONLY).
  "post_built", "post_destroyed", "post_dormant", "post_paid", "post_revealed",
  // §18.4–§18.13 Diplomacy (APPEND-ONLY — distinct keys).
  "menace_changed", "honor_changed", "deal_struck", "deal_proposed",
  "war_declared", "peace_made",
  "pact_formed", "pact_called", "pact_broken",
  "coalition_formed", "coalition_dissolved",
  "vassal_established", "vassal_rebelled", "tribute_paid",
  "denounced", "mediated", "recognition_changed",
  // diplomacy-spec.md §6.4 — verbs, AI eval, war tracking, open borders.
  "surprise_attack_honor_lost",
  "trading_pact_formed", "trading_pact_suspended", "trading_pact_resumed", "trading_pact_dissolved",
  "vassal_freed",
  "pact_call_requested", "pact_call_honored", "pact_call_declined",
  "tribute_demanded", "tribute_caved", "tribute_refused",
  "allied_vision_toggled", "open_borders_toggled", "gift_counter_decayed",
]);

// Resolve a chip / card instance uid to its content def. Covers Market
// chips (CHIPS), the Capital, and Reactive cards (REACTIVES) — all
// stored in state.chips as { uid, chipId }.
function defOf(state, uid) {
  const inst = state.chips[uid];
  if (!inst) return null;
  if (inst.chipId === "capital") return CAPITAL;
  return CHIPS[inst.chipId] || REACTIVES[inst.chipId] || null;
}

// Scan every source of triggers in the game state — locations, their
// installed chips, their assigned abilities, unit chips, and Reactive
// cards in player hands. Used by both `emit` (for `on` mode) and the
// reaction window (for `replace` mode).
export function collectTriggers(state, eventName) {
  const subs = [];
  const addFrom = (record, source) => {
    for (const t of record?.triggers || []) {
      if (t.trigger !== eventName) continue;
      subs.push({
        source, mode: t.mode || "on",
        condition: t.condition, effects: t.effects,
      });
    }
  };

  for (const loc of Object.values(state.locations)) {
    addFrom(loc, { kind: "location", uid: loc.hexId, owner: loc.controller });
    for (const chipUid of loc.chips) {
      if (state.chips[chipUid]?.disabled) continue; // §20.9 dormant — passives suppressed
      const def = defOf(state, chipUid);
      if (def?.triggers) {
        addFrom(def, { kind: "location-chip", uid: chipUid, owner: loc.controller, hexId: loc.hexId });
      }
    }
    if (loc.abilityId) {
      const ab = ABILITIES[loc.abilityId];
      if (ab?.triggers) {
        addFrom(ab, { kind: "ability", uid: loc.abilityId, owner: loc.controller, hexId: loc.hexId });
      }
    }
  }

  for (const unit of Object.values(state.units)) {
    for (const chipUid of unit.chips) {
      if (state.chips[chipUid]?.disabled) continue; // §20.9 dormant — passives suppressed
      const def = defOf(state, chipUid);
      if (def?.triggers) {
        addFrom(def, { kind: "unit-chip", uid: chipUid, owner: unit.owner, unitUid: unit.uid });
      }
    }
  }

  for (const player of Object.values(state.players)) {
    for (const cardUid of player.hand) {
      const inst = state.chips[cardUid];
      const def = inst && REACTIVES[inst.chipId];
      if (def?.triggers) {
        addFrom(def, { kind: "reactive-card", uid: cardUid, cardId: inst.chipId, owner: player.id });
      }
    }
  }

  return subs;
}

// Lightweight condition evaluator — the full DSL from content-schema
// v0.1 lands with the encounter pipeline. v0.1 covers the keyword
// shorthands the Reactive stubs actually use.
export function evalCondition(state, condition, ctx) {
  if (!condition) return true;
  if (typeof condition === "function") return !!condition(state, ctx);
  if (condition === "defender-owns-source") {
    const p = ctx.event?.payload || {};
    const defender = p.kind === "raid"
      ? state.units[p.target]?.owner
      : state.locations[p.hex]?.controller;
    return defender != null && defender === ctx.source?.owner;
  }
  if (condition === "recipient-is-source") {
    return ctx.event?.payload?.recipient === ctx.source?.owner;
  }
  // The loser of a contest is the `player` in the payload (the
  // initiator who failed). Symmetric to `defender-owns-source` so a
  // card held by the loser can fire on contest_lost.
  if (condition === "loser-is-source") {
    return ctx.event?.payload?.player === ctx.source?.owner;
  }
  // Object-form conditions are full DSL expressions — delegate.
  if (typeof condition === "object") return dslEvalCond(state, condition, ctx);
  return true;
}

// Move a Reactive from its holder's hand to the reactive discard.
// Called when a subscriber backed by a hand-held card actually fires.
export function playReactive(state, source) {
  const hand = state.players[source.owner]?.hand;
  if (!hand) return false;
  const i = hand.indexOf(source.uid);
  if (i < 0) return false;
  hand.splice(i, 1);
  state.discards.reactive.push(source.uid);
  return true;
}

export function emit(state, name, payload = {}, ctx = {}) {
  if (!EVENT_NAMES.has(name)) throw new Error(`emit: unknown event "${name}"`);
  const event = { name, payload, round: state.round, turnIndex: state.activeIndex };
  state.log.push(event);

  for (const sub of collectTriggers(state, name)) {
    if (sub.mode !== "on") continue;
    const subCtx = { ...ctx, source: sub.source, event };
    if (!evalCondition(state, sub.condition, subCtx)) continue;
    // Reactive cards in hand must be "played" before their effects
    // resolve. ctx.interact gates that for UI use; headless auto-plays.
    if (sub.source.kind === "reactive-card") {
      const want = ctx.interact
        ? ctx.interact({ kind: "playReactive", card: sub.source.cardId, player: sub.source.owner, event: name })
        : true;
      if (!want) continue;
      playReactive(state, sub.source);
      // Note: card_played is emitted by the reaction window when it
      // plays a card; on-mode plays from inside emit() would recurse,
      // so we just log the move via the discard push above.
    }
    applyEffects(state, sub.effects, subCtx);
  }

  // Plain JS event hooks (no content/DSL) — used by systems that need to react
  // to engine events in code, e.g. diplomacy's war-record bookkeeping
  // (unit_destroyed / location_captured / contest_won). Registered once via
  // registerEventHook; fired after content triggers so they see settled state.
  const hooks = state.eventHooks?.[name];
  if (hooks) for (const fn of hooks) fn(state, payload, event);

  return event;
}

// Register a code listener for an engine event. Idempotent per (name, fn)
// pair is the caller's responsibility (e.g. a one-shot install guard).
export function registerEventHook(state, name, fn) {
  state.eventHooks = state.eventHooks || {};
  (state.eventHooks[name] = state.eventHooks[name] || []).push(fn);
}
