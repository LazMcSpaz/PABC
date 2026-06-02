// §16.2 movement relations — who may pass through whom, and which hexes halt a
// unit's move. Composes board.movementField (terrain + roads) with the
// diplomacy layer: allied/friendly factions pass through each other's units
// and Locations; neutral, wary and hostile factions BLOCK — you may step onto
// the occupied/enemy hex but stop there (a chokepoint blockade). Enemy-
// controlled Location hexes block the same way.
import { CONFIG } from "./config.js";
import { movementField } from "./board.js";
import { getStanding } from "./standing.js";
import { arePacted, vassalLord } from "./diplomacy.js";

// May `a`'s units move freely THROUGH `b`'s units / Locations? True for the
// same faction, an alliance (pact or vassalage either way), or MUTUAL Friendly+
// Standing. Neutral/wary/hostile all block, so a single unit can hold a pass.
export function passesFreely(state, a, b) {
  if (!a || !b || a === b) return true;
  if (arePacted(state, a, b)) return true;
  if (vassalLord(state, a) === b || vassalLord(state, b) === a) return true;
  const need = CONFIG.diplomacy.tiers.friendly;
  return getStanding(state, a, b) >= need && getStanding(state, b, a) >= need;
}

// The set of hexes that HALT `ownerId`'s movement on entry (§16.2 blockade):
// any hex holding a non-passing foreign unit, plus any enemy-controlled
// Location hex (you can't freely march through a hostile city).
export function movementBlockers(state, ownerId) {
  const blocked = new Set();
  for (const u of Object.values(state.units)) {
    if (u.owner === ownerId) continue;
    if (!passesFreely(state, ownerId, u.owner)) blocked.add(u.node);
  }
  for (const loc of Object.values(state.locations)) {
    if (loc.controller && loc.controller !== ownerId && !passesFreely(state, ownerId, loc.controller)) {
      blocked.add(loc.hexId);
    }
  }
  return blocked;
}

// Terrain-, road- and blockade-aware reachability for `unit` this turn →
// { hexId: movement points remaining }. The single source of truth shared by
// the Move action, the AI, and the UI's reachable-hex highlight.
export function unitReach(state, unit) {
  if (!unit) return {};
  const budget = unit.moveRemaining ?? unit.movement ?? 0;
  return movementField(state, unit.node, budget, {
    blockedThrough: movementBlockers(state, unit.owner),
  });
}
