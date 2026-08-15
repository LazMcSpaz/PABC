// §16.2 movement relations — who may pass through whom, and which hexes halt a
// unit's move. Composes board.movementField (terrain + roads) with the
// diplomacy layer: allied/friendly factions pass through each other's units
// and Locations; neutral, wary and hostile factions BLOCK — you may step onto
// the occupied/enemy hex but stop there (a chokepoint blockade). Enemy-
// controlled Location hexes block the same way.
import { CONFIG } from "./config.js";
import { movementField, movementRoute } from "./board.js";
import { CHIPS, ABILITIES, chipBlocksRail } from "./content.js";
import { getStanding } from "./standing.js";
import { arePacted, vassalLord } from "./diplomacy.js";

const BIG_BUDGET = 999; // budget-agnostic routing for display

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
export function movementBlockers(state, ownerId, { ignoreUnits } = {}) {
  const blocked = new Set();
  // Night March (chip `passThroughUnits`): foreign UNITS no longer halt
  // the mover; enemy Locations still do (a city is not a picket line).
  if (!ignoreUnits) for (const u of Object.values(state.units)) {
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
// Landship-class chips (`ignoresTerrain`) let their carrier treat forest
// and mountains as open ground. Dormant chips grant nothing.
export function unitIgnoresTerrain(state, unit) {
  return unit.chips.some(
    (c) => !state.chips[c]?.disabled && CHIPS[state.chips[c]?.chipId]?.ignoresTerrain,
  );
}

function unitPassesThroughUnits(state, unit) {
  return unit.chips.some(
    (c) => !state.chips[c]?.disabled && CHIPS[state.chips[c]?.chipId]?.passThroughUnits,
  );
}

// Toll Gate (ability passive MOVE_TAX): the hexes where a non-passing
// faction's toll Location taxes this mover — the Location's own hex and
// its ring. Entry there costs +amount movement.
export function tollTaxedHexes(state, ownerId) {
  const taxed = new Map(); // hexId -> extra cost
  for (const loc of Object.values(state.locations)) {
    if (!loc.controller || loc.controller === ownerId) continue;
    if (passesFreely(state, ownerId, loc.controller)) continue;
    if (!loc.abilityId) continue;
    for (const pv of ABILITIES[loc.abilityId]?.passives || []) {
      if (pv.type !== "MOVE_TAX") continue;
      const ring = [loc.hexId, ...(state.board.adjacency[loc.hexId] || [])];
      for (const h of ring) taxed.set(h, Math.max(taxed.get(h) || 0, pv.amount || 0));
    }
  }
  return taxed;
}

// Rail hops this unit may take (docs/rail-road-blockade-design.md §2.1/2.3),
// as a Map hexId -> [reachable hexIds]. Three gates, all from the doc:
//   * the unit must not carry a rail-incompatible chip (2-slot chips — a
//     Landship or a Bombard does not go on a train);
//   * the mover must control BOTH endpoint settlements, since rail is not
//     built and so has no owner other than whoever holds its stations;
//   * an enemy blockade anywhere along the line cuts it for that faction.
// Returns null when the unit can use no rail at all, so the search skips the
// whole mechanism rather than walking an empty map.
export function unitRailEdges(state, unit) {
  const links = state.board.rails;
  if (!links || !links.length) return null;
  const barred = unit.chips.some(
    (c) => !state.chips[c]?.disabled && chipBlocksRail(state.chips[c]?.chipId),
  );
  if (barred) return null;

  const controls = (hexId) => state.locations[hexId]?.controller === unit.owner;
  // A hex is cut for this mover if a unit it cannot pass freely stands there.
  const hostile = new Set();
  for (const u of Object.values(state.units)) {
    if (u.owner === unit.owner) continue;
    if (!passesFreely(state, unit.owner, u.owner)) hostile.add(u.node);
  }

  const edges = new Map();
  for (const link of links) {
    if (!controls(link.a) || !controls(link.b)) continue;
    if (link.path.some((h) => hostile.has(h))) continue; // line is cut
    if (!edges.has(link.a)) edges.set(link.a, []);
    if (!edges.has(link.b)) edges.set(link.b, []);
    edges.get(link.a).push(link.b);
    edges.get(link.b).push(link.a);
  }
  return edges.size ? edges : null;
}

export function unitReach(state, unit) {
  if (!unit) return {};
  const budget = unit.moveRemaining ?? unit.movement ?? 0;
  return movementField(state, unit.node, budget, {
    blockedThrough: movementBlockers(state, unit.owner, { ignoreUnits: unitPassesThroughUnits(state, unit) }),
    ignoreTerrain: unitIgnoresTerrain(state, unit),
    extraCost: tollTaxedHexes(state, unit.owner),
    railEdges: unitRailEdges(state, unit),
  });
}

// The exact ROUTE `unit` takes to reach `dest` this turn (same rules as
// unitReach) — for the move-preview arrow. [start, …, dest] or null.
export function unitMovePath(state, unit, dest) {
  if (!unit) return null;
  const budget = unit.moveRemaining ?? unit.movement ?? 0;
  return movementRoute(state, unit.node, budget, dest, {
    blockedThrough: movementBlockers(state, unit.owner, { ignoreUnits: unitPassesThroughUnits(state, unit) }),
    ignoreTerrain: unitIgnoresTerrain(state, unit),
    extraCost: tollTaxedHexes(state, unit.owner),
    railEdges: unitRailEdges(state, unit),
  });
}

// A budget- and blockade-agnostic terrain/road route from `from` to `to`, for
// REPLAY display (the move already happened; we just want a sensible lane the
// pawn visibly follows around mountains / along roads). Falls back to a direct
// hop if no terrain route exists.
export function displayRoute(state, from, to) {
  return movementRoute(state, from, BIG_BUDGET, to, {}) || [from, to];
}
