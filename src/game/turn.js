// The turn loop (mechanical-spec §7) — round / phase progression, the
// Upkeep work (action reset, modifier expiry, foothold tick, scrap
// production) and Cleanup.
import { emit } from "./events.js";
import { recomputeStats, recomputeTech } from "./stats.js";
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

// Foothold tick (§6.3.2): a controlled location's grip rises while the
// owner's unit garrisons it and falls when absent; at -1 a section
// decays to neutral. Capital locations are decay-immune.
function tickFootholds(state, pid) {
  let lostControl = false;
  for (const loc of Object.values(state.locations)) {
    if (loc.footholdOwner !== pid) continue;
    const hasCapital = loc.chips.some((u) => state.chips[u]?.chipId === "capital");
    if (hasCapital) continue;

    const unitHere = Object.values(state.units).some(
      (u) => u.owner === pid && u.node === loc.hexId,
    );
    if (unitHere) {
      loc.foothold = Math.min((loc.foothold ?? 0) + 1, loc.footholdCap);
    } else {
      loc.foothold = (loc.foothold ?? 0) - 1;
      if (loc.foothold < 0) {
        const idx = loc.sections.indexOf(pid);
        if (idx >= 0) loc.sections[idx] = "neutral";
        loc.foothold = 0;
        emit(state, "section_flipped", { hex: loc.hexId, cause: "decay" });
        if (!loc.sections.every((s) => s === pid)) {
          loc.controller = null;
          lostControl = true;
        }
        if (!loc.sections.includes(pid)) {
          loc.footholdOwner = null;
          loc.foothold = null;
          emit(state, "location_decayed", { hex: loc.hexId });
        }
      }
    }
  }
  // A decay-driven control loss may have stripped a Labs from `pid` — sync.
  if (lostControl) recomputeTech(state);
}

// Fully-held locations yield their scrap production to the controller
// (§6.3.1). VP is banked one-shot on capture (see contest.js), not
// per Upkeep — the per-round drip lived briefly in an earlier demo
// pass and would have forced the win to land on round-12 regardless
// of play.
function collectProduction(state, pid) {
  let gained = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    gained += loc.production;
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
  tickFootholds(state, pid);
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
  evaluateTriggers(state);
  evaluateConditionalBeats(state);
  expirePlacementMarkers(state);
  decayWorldCounters(state);
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
