// Demo AI — a deliberately flimsy rule-based opponent. Drives one full
// turn per call: loops `tryOneAction` until the player runs out of
// actions or the priority list dries up, then ends the turn. The engine
// already supplies headless defaults for sub-choices (encounter pick,
// reactive play, retreat hex), so the AI never has to touch ctx.interact.

import { performAction } from "./actions.js";
import { endTurn } from "./turn.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { CHIPS, LOCATIONS } from "./content.js";
import { CONFIG } from "./config.js";

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

  // 3. Acquire — try the cheapest affordable unit chip into the strongest
  //    unit's bay; if no unit chip fits, try a location chip on a held loc
  if (tryAcquire(state, pid)) return true;

  // 4. Recruit — if controls a Training Grounds and below the cap
  if (tryRecruit(state, pid)) return true;

  // 5. Activate any controlled location with a free / cheap ability
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

function tryAcquire(state, pid) {
  const player = state.players[pid];
  const tiers = unlockedTiers(player.tech);
  const candidates = [];
  for (const tier of tiers) {
    for (const chipUid of state.market.tiers[tier]?.row || []) {
      const def = CHIPS[state.chips[chipUid]?.chipId];
      if (!def) continue;
      if (player.resource < (def.cost || 0)) continue;
      candidates.push({ chipUid, def, tier });
    }
  }
  if (!candidates.length) return false;

  // Prefer unit chips that fit; fall back to location chips on a held loc.
  const sortedUnits = candidates
    .filter((c) => c.def.kind === "unit")
    .sort((a, b) => (b.def.strength || 0) - (a.def.strength || 0));
  const myUnits = ownUnits(state, pid)
    .sort((a, b) => b.strength - a.strength);
  for (const cand of sortedUnits) {
    for (const u of myUnits) {
      const slots = slotsUsed(state, u.chips) + cand.def.slots;
      if (slots > CONFIG.unit.baySlots) continue;
      const r = performAction(state, "acquire", {
        chip: cand.chipUid, into: { unit: u.uid },
      });
      if (r.ok) return true;
    }
  }

  const sortedLocs = candidates
    .filter((c) => c.def.kind === "location")
    .sort((a, b) => (a.def.cost || 0) - (b.def.cost || 0));
  const myLocs = Object.values(state.locations).filter((l) => l.controller === pid);
  for (const cand of sortedLocs) {
    for (const loc of myLocs) {
      const slots = slotsUsed(state, loc.chips) + cand.def.slots;
      if (slots > loc.chipSlots) continue;
      const r = performAction(state, "acquire", {
        chip: cand.chipUid, into: { location: loc.hexId },
      });
      if (r.ok) return true;
    }
  }
  return false;
}

function slotsUsed(state, chipUids) {
  let n = 0;
  for (const c of chipUids) {
    const id = state.chips[c]?.chipId;
    if (id === "capital") { n += 1; continue; }
    n += CHIPS[id]?.slots ?? 1;
  }
  return n;
}

function unlockedTiers(tech) {
  if (tech >= CONFIG.tech.tier3) return [1, 2, 3];
  if (tech >= CONFIG.tech.tier2) return [1, 2];
  return [1];
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
