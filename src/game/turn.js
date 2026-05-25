// The turn loop (mechanical-spec §7) — round / phase progression, the
// Upkeep work (action reset, modifier expiry, Loyalty tick, scrap
// production) and Cleanup.
import { emit } from "./events.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { recomputeInfluence } from "./influence.js";
import { reinforcementRoute } from "./board.js";
import { TECH_NODES, hasTechNode } from "./tech.js";
import { CONFIG } from "./config.js";
import { activePlayerId } from "./targeting.js";
import { sweepDeferred } from "./deferred.js";
import { evaluateTriggers } from "./triggers.js";
import { evaluateConditionalBeats } from "./quests.js";
import { churnMarket } from "./market.js";

function expireModifiers(state, pid) {
  const own = new Set(
    Object.values(state.units).filter((u) => u.owner === pid).map((u) => u.uid),
  );
  state.modifiers = state.modifiers.filter(
    (m) => !(m.duration === "until_your_next_turn" && own.has(m.target)),
  );
}

// Loyalty tick (§18.2 — supersedes the old foothold/decay step). Loyalty
// is the 0–8 centre pie, ceiling fixed at 8. It climbs to the ceiling
// while the owner garrisons a fully-held Location and bleeds to 0 when the
// Location is neglected. The crucial rule: Control is NOT lost to ticking.
// Only once Loyalty sits at 0 *and* the Location stays neglected does one
// Control section peel to neutral per Upkeep, until the Location is fully
// neutral. A `loyalty_failing` warning always fires before any peel.
// Bringing a unit back halts the peel and lets Loyalty climb again.
// Capital Locations are inert — their Loyalty is locked at full.
// Exported so the headless harness can drive Upkeep ticks directly.
export function tickLoyalty(state, pid) {
  const cfg = CONFIG.loyalty;
  let lostControl = false;
  for (const loc of Object.values(state.locations)) {
    if (loc.loyaltyOwner !== pid) continue;
    const hasCapital = loc.chips.some((u) => state.chips[u]?.chipId === "capital");
    if (hasCapital) continue; // §18.2 — inert, locked at full

    const garrisoned = Object.values(state.units).some(
      (u) => u.owner === pid && u.node === loc.hexId,
    );

    if (garrisoned) {
      // Integrating — Loyalty rises to the fixed ceiling. A returning unit
      // also halts any in-progress peel simply by not reaching the peel path.
      if ((loc.loyalty ?? 0) < cfg.ceiling) {
        loc.loyalty = Math.min((loc.loyalty ?? 0) + cfg.risePerUpkeep, cfg.ceiling);
        emit(state, "loyalty_changed", { hex: loc.hexId, owner: pid, loyalty: loc.loyalty });
      }
      continue;
    }

    // Neglected and still loyal — bleed toward 0, never peeling Control yet.
    if ((loc.loyalty ?? 0) > 0) {
      loc.loyalty = Math.max((loc.loyalty ?? 0) - cfg.decayPerUpkeep, 0);
      emit(state, "loyalty_changed", { hex: loc.hexId, owner: pid, loyalty: loc.loyalty });
      // Surface danger BEFORE any Control peels (§18.2 UI warning) — the
      // alert lands at least one Upkeep before the first section is lost.
      if (loc.loyalty <= cfg.dangerThreshold) {
        emit(state, "loyalty_failing", {
          hex: loc.hexId, owner: pid, loyalty: loc.loyalty, imminent: loc.loyalty === 0,
        });
      }
      continue;
    }

    // Loyalty already sits at 0 and the Location is still neglected — peel
    // Control toward neutral (§18.2). Warn first, then peel.
    emit(state, "loyalty_failing", { hex: loc.hexId, owner: pid, loyalty: 0, imminent: true, peeling: true });
    for (let n = 0; n < cfg.peelPerUpkeep; n++) {
      const idx = loc.sections.indexOf(pid);
      if (idx < 0) break;
      loc.sections[idx] = "neutral";
      emit(state, "control_peeled", { hex: loc.hexId, from: pid });
      emit(state, "section_flipped", { hex: loc.hexId, cause: "loyalty" });
      if (loc.controller === pid && !loc.sections.every((s) => s === pid)) {
        loc.controller = null; // dropped below full Control
        lostControl = true;
      }
      if (!loc.sections.includes(pid)) {
        // Fully neutral — Loyalty deactivates for this Location.
        loc.loyaltyOwner = null;
        loc.loyalty = null;
        emit(state, "location_decayed", { hex: loc.hexId });
        break;
      }
    }
  }
  // A peel-driven control loss may have stripped a Lab from `pid` — sync.
  if (lostControl) recomputeResearch(state);
  // §18.3 — Loyalty rises/decays and any peel shift this faction's
  // Influence; recompute the field + ZoC once after the tick.
  recomputeInfluence(state);
}

// Fully-held locations yield their scrap production to the controller
// (§6.3.1). VP is banked one-shot on capture (see contest.js), not
// per Upkeep — the per-round drip lived briefly in an earlier demo
// pass and would have forced the win to land on round-12 regardless
// of play.
function collectProduction(state, pid) {
  // §17.5 Economy entry (Industry): +1 scrap per fully-held Location.
  const econBonus = hasTechNode(state, pid, "eco-entry")
    ? TECH_NODES["eco-entry"].effect.amount
    : 0;
  let gained = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    gained += loc.production + econBonus;
  }
  if (gained > 0) {
    state.players[pid].resource += gained;
    emit(state, "resource_gained", {
      player: pid, resource: "Resource", amount: gained, source: "production",
    });
  }
}

// v0.2 §16.2 — refresh each owned unit's move budget from its effective
// Movement, and roll the §16.6 fortify flag (a unit that didn't move on
// its previous turn is "dug in"). Must run after recomputeStats so
// `unit.movement` reflects chips / modifiers.
function refreshMoveBudget(state, pid) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    u.moveRemaining = u.movement;
    u.fortified = !u.movedSinceUpkeep;
    u.movedSinceUpkeep = false;
  }
}

// v0.2 §16.5 — at Upkeep, each unit on a Location its owner fully holds
// mends +1 base Strength, up to its cap. The supply-line "fall back to
// re-secure and heal" half of the loop.
function passiveHeal(state, pid) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    const loc = state.locations[u.node];
    if (!loc || loc.controller !== pid) continue;
    const cap = u.veteran ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
    if (u.baseStrength >= cap) continue;
    const before = u.baseStrength;
    u.baseStrength = Math.min(cap, u.baseStrength + CONFIG.heal.passivePerTurn);
    recomputeStats(state);
    emit(state, "unit_reinforced", { unit: u.uid, amount: u.baseStrength - before });
  }
}

// Run a player's Upkeep and open their turn at the Main phase.
export function startTurn(state) {
  if (state.winnerId) return state;
  const pid = activePlayerId(state);
  state.phase = "Upkeep";
  emit(state, "turn_started", { player: pid });

  const p = state.players[pid];
  p.actions.remaining = p.actions.max;
  state.pendingActionGrants = state.pendingActionGrants.filter((g) => {
    if (g.player === pid) {
      p.actions.remaining += g.amount;
      return false;
    }
    return true;
  });

  expireModifiers(state, pid);
  recomputeStats(state);
  refreshMoveBudget(state, pid);
  tickLoyalty(state, pid);
  passiveHeal(state, pid);
  collectProduction(state, pid);
  churnMarket(state);

  // Preparation (the optional stat-buy step) is folded in once Layer 3
  // gives it something to do; for now the turn opens straight into Main.
  state.phase = "Main";
  return state;
}

// End the active player's turn, run Cleanup, advance to the next. On
// round rollover, runs the §15.12 end-of-round pipeline before the
// next player's Upkeep starts.
export function endTurn(state) {
  if (state.winnerId) return state;
  const pid = activePlayerId(state);
  state.phase = "Cleanup";
  state.modifiers = state.modifiers.filter((m) => m.duration !== "this_turn");
  emit(state, "turn_ended", { player: pid });

  state.activeIndex += 1;
  if (state.activeIndex >= state.turnOrder.length) {
    state.activeIndex = 0;
    state.round += 1;
    emit(state, "round_ended", { round: state.round - 1 });
    runRoundEnd(state);
  }
  return startTurn(state);
}

// The §15.12 round-end pipeline. Deferred resolution comes first so a
// queued consequence can update the state that triggers then read.
function runRoundEnd(state) {
  sweepDeferred(state);
  sweepReinforcements(state);
  evaluateTriggers(state);
  evaluateConditionalBeats(state);
  expirePlacementMarkers(state);
  decayWorldCounters(state);
}

// v0.2 §16.5 — advance in-transit field reinforcements. Each round the
// convoy covers one more hex; it re-targets a moving unit by recomputing
// the supply route from its owner's nearest Location to the unit's
// *current* node, and delivers when it has travelled far enough. A packet
// whose target died is dropped.
function sweepReinforcements(state) {
  if (!state.reinforcements?.length) return;
  const keep = [];
  for (const r of state.reinforcements) {
    const unit = state.units[r.targetUnit];
    if (!unit) continue; // target destroyed — convoy disbands
    r.traveled = (r.traveled || 0) + 1;
    const route = reinforcementRoute(state, r.owner, unit.node);
    if (route && r.traveled >= route.dist) {
      const cap = unit.veteran ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
      const before = unit.baseStrength;
      unit.baseStrength = Math.min(cap, unit.baseStrength + r.amount);
      recomputeStats(state);
      emit(state, "reinforcement_arrived", {
        player: r.owner, unit: unit.uid, amount: unit.baseStrength - before,
      });
    } else {
      keep.push(r); // still en route (or momentarily walled off)
    }
  }
  state.reinforcements = keep;
}

function expirePlacementMarkers(state) {
  const markers = state.world?.encounterMarkers;
  if (!markers) return;
  for (const [hex, m] of Object.entries(markers)) {
    if (m.expiresAt != null && m.expiresAt < state.round) delete markers[hex];
  }
}

// Soft decay so raid / ignore counters reflect *recent* activity
// (§15.3). Multiplicative, floored — counter at 10 takes 22 rounds to
// reach 0 with no new entries; gentle enough that a single skipped
// round doesn't erase context.
function decayWorldCounters(state) {
  const w = state.world;
  if (!w) return;
  for (const k of Object.keys(w.raidCounts || {})) {
    w.raidCounts[k] = Math.floor(w.raidCounts[k] * 0.9);
  }
  for (const k of Object.keys(w.ignoreCounts || {})) {
    w.ignoreCounts[k] = Math.floor(w.ignoreCounts[k] * 0.9);
  }
}
