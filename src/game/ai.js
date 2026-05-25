// Demo AI — a deliberately flimsy rule-based opponent. Drives one full
// turn per call: loops `tryOneAction` until the player runs out of
// actions or the priority list dries up, then ends the turn. The engine
// already supplies headless defaults for sub-choices (encounter pick,
// reactive play, retreat hex), so the AI never has to touch ctx.interact.

import { performAction } from "./actions.js";
import { endTurn } from "./turn.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { LOCATIONS } from "./content.js";
import { CONFIG } from "./config.js";
import { buildableChips, slotCapacity, slotsUsed, stationedUnitWithBay } from "./economy.js";

const SAFETY_CAP = 10; // hard stop if priority loop ever spins

export function takeAITurn(state) {
  if (state.winnerId) return;
  const pid = activePlayerId(state);
  let guard = SAFETY_CAP;
  while (
    state.players[pid].actions.remaining > 0 &&
    guard-- > 0 &&
    !state.winnerId
  ) {
    if (!tryOneAction(state, pid)) break;
  }
  // §20 — the AI runs its economy every turn regardless of the Action budget:
  // it sets each city's guns/butter slider and queues builds (units have
  // settled after the action loop, so unit-chip builds find their garrison).
  if (!state.winnerId) manageEconomy(state, pid);
  if (!state.winnerId) endTurn(state);
}

// Returns true if the AI spent at least one Action (whether the action
// succeeded or not — failed actions don't decrement remaining, so the
// loop must give up if no priority matches a runnable action).
function tryOneAction(state, pid) {
  // 1. Contest where standing
  for (const unit of ownUnits(state, pid)) {
    if (isImmobilized(state, unit)) continue;
    const loc = state.locations[unit.node];
    if (loc && !loc.sections.every((s) => s === pid)) {
      const r = performAction(state, "contest", { unit: unit.uid });
      if (r.ok) return true;
    }
    const enemyHere = Object.values(state.units).find(
      (u) => u.node === unit.node && u.owner !== pid,
    );
    if (enemyHere && (!loc || !loc.sections.includes("neutral"))) {
      const r = performAction(state, "contest", {
        unit: unit.uid, target: enemyHere.uid,
      });
      if (r.ok) return true;
    }
  }

  // 2. Move toward the nearest contestable Location
  for (const unit of ownUnits(state, pid)) {
    if (isImmobilized(state, unit)) continue;
    const target = pickMoveTarget(state, pid, unit);
    if (target) {
      const r = performAction(state, "move", { unit: unit.uid, to: target });
      if (r.ok) return true;
    }
  }

  // 3. Recruit — if controls a Training Grounds and below the cap
  if (tryRecruit(state, pid)) return true;

  // 4. Activate any controlled location with a free / cheap ability
  if (tryActivate(state, pid)) return true;

  return false;
}

// --- helpers ----------------------------------------------------------

function ownUnits(state, pid) {
  return Object.values(state.units).filter((u) => u.owner === pid);
}

function isImmobilized(state, unit) {
  if (unit.immobilizedUntil == null) return false;
  const ord = state.round * state.turnOrder.length + state.activeIndex;
  return ord <= unit.immobilizedUntil;
}

function pickMoveTarget(state, pid, unit) {
  const dists = bfsDistances(state.board.adjacency, unit.node);
  const budget = unit.moveRemaining ?? unit.movement;
  const reachable = Object.entries(dists)
    .filter(([hex, d]) => d > 0 && d <= budget && hex !== unit.node);
  if (!reachable.length) return null;

  // Score each hex: prefer landing directly on a contestable Location.
  // Otherwise prefer the hex closest to one we don't control.
  const goals = Object.values(state.locations)
    .filter((l) => l.controller !== pid)
    .map((l) => l.hexId);
  if (!goals.length) return reachable[0][0];

  // Project each reachable hex's value off the closest goal Location.
  let best = null;
  let bestScore = -Infinity;
  for (const [hex, d] of reachable) {
    const loc = state.locations[hex];
    let score = 0;
    if (loc && loc.controller !== pid) {
      // Direct landing — favour higher-VP / higher-value targets
      const def = LOCATIONS[loc.locationId];
      score += 1000 + (def?.vpReward || 0) * 100 + (loc.production || 0) * 10;
    } else {
      // Indirect — pick the hex nearest a goal
      let nearest = Infinity;
      for (const g of goals) {
        const gd = bfsDistances(state.board.adjacency, hex)[g];
        if (gd !== undefined && gd < nearest) nearest = gd;
      }
      score += -nearest * 10 - d;
    }
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  return best;
}

// §20 — drive each city's economy: set its slider, queue a build into any
// free slot, and rush when flush with scrap. Runs once per turn, free of
// Actions (build/upgrade/rush/set-slider all cost 0).
function manageEconomy(state, pid) {
  const player = state.players[pid];
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;

    if (!loc.activeBuild) pickBuild(state, pid, loc);

    // Lean toward construction when something is queued, but keep banking a
    // share so the army still gets scrap for recruiting / reinforcing.
    const wantSlider = loc.activeBuild ? 0.7 : 0;
    if ((loc.buildSlider ?? 0) !== wantSlider) {
      performAction(state, "set-slider", { at: loc.hexId, value: wantSlider });
    }

    // Spend a flush treasury into local construction (rush a few points).
    if (loc.activeBuild && player.resource > 14) {
      performAction(state, "rush", { at: loc.hexId, amount: 3 });
    }
  }
}

// Choose what a city should build next: the highest-value buildable
// (Tech-allowed, Loyalty-unlocked, slot-fitting) chip. Prefers economy /
// research / a first Training Grounds; falls back to arming a stationed unit.
function pickBuild(state, pid, loc) {
  const options = buildableChips(state, loc).filter((o) => !o.locked);
  const haveTG = Object.values(state.locations).some(
    (l) => l.controller === pid && l.chips.some((c) => state.chips[c]?.chipId === "training-grounds"),
  );
  const score = (def) => {
    let s = (def.output || 0) * 3 + (def.research || 0) * 3 + (def.garrison || 0) + (def.strength || 0);
    if (def.id === "training-grounds" && !haveTG) s += 5;
    return s - (def.upkeep || 0); // mild aversion to upkeep when poor
  };

  // Location chips into a free slot first.
  const locFits = options
    .filter((o) => o.def.kind === "location" && slotsUsed(state, loc.chips) + (o.def.slots || 1) <= slotCapacity(loc))
    .sort((a, b) => score(b.def) - score(a.def));
  if (locFits.length) {
    return performAction(state, "build", { at: loc.hexId, chipId: locFits[0].chipId }).ok;
  }

  // Otherwise arm a stationed friendly unit with a strength chip.
  const unitFits = options
    .filter((o) => o.def.kind === "unit" && stationedUnitWithBay(state, loc, o.def.slots || 1))
    .sort((a, b) => score(b.def) - score(a.def));
  if (unitFits.length) {
    return performAction(state, "build", { at: loc.hexId, chipId: unitFits[0].chipId }).ok;
  }
  return false;
}

function tryRecruit(state, pid) {
  const player = state.players[pid];
  if (player.resource < CONFIG.unitRecruitCost) return false;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    const hasTG = loc.chips.some((c) => state.chips[c]?.chipId === "training-grounds");
    if (!hasTG) continue;
    const r = performAction(state, "recruit", { at: loc.hexId });
    if (r.ok) return true;
  }
  return false;
}

function tryActivate(state, pid) {
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    if (!loc.abilityId) continue;
    const r = performAction(state, "activate", { location: loc.hexId });
    if (r.ok) return true;
  }
  return false;
}
