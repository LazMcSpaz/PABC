// §16.2 movement relations — who may pass through whom, and which hexes halt a
// unit's move. Composes board.movementField (terrain + roads) with the
// diplomacy layer: allied/friendly factions pass through each other's units
// and Locations; neutral, wary and hostile factions BLOCK — you may step onto
// the occupied/enemy hex but stop there (a chokepoint blockade). Enemy-
// controlled Location hexes block the same way.
import { CONFIG } from "./config.js";
import { bfsDistances, movementField, movementRoute } from "./board.js";
import { CHIPS, ABILITIES, chipBlocksRail } from "./content.js";
// `passesFreely` and `supplyCutter` are pure diplomacy questions — who may
// pass whom, and what severs a line — so they live in diplomacy.js and are
// re-exported here, where every mover already looks for them.
export { passesFreely, supplyCutter } from "./diplomacy.js";
import { passesFreely } from "./diplomacy.js";
import { ensureVisibility, isHexVisible, isUnitVisibleTo } from "./visibility.js";

const BIG_BUDGET = 999; // budget-agnostic routing for display


// The set of hexes that HALT `ownerId`'s movement on entry (§16.2 blockade):
// any hex holding a non-passing foreign unit, plus any enemy-controlled
// Location hex (you can't freely march through a hostile city).
// One scan, two answers, so they can never drift apart:
//
//   blocked   every hex that halts `ownerId` on entry (ground truth).
//   unseen    the subset whose blocker `ownerId` cannot currently perceive.
//
// The second is what lets a mover keep its movement after walking into an
// ambush (board.js `surprise`). Note it is a strict subset: a hex holding both
// a visible and a hidden blocker is NOT a surprise — you could see a reason to
// stop there, so stopping costs you the advance as usual.
function blockerScan(state, ownerId, { ignoreUnits } = {}) {
  const blocked = new Set();
  const hidden = new Set();
  const visible = new Set();
  // Collected as two sets and differenced at the end rather than resolved as we
  // go: a hex can carry several blockers in any order, and one visible blocker
  // has to outrank any number of hidden ones however late it turns up.
  const note = (hex, seen) => {
    blocked.add(hex);
    (seen ? visible : hidden).add(hex);
  };

  // Night March (chip `passThroughUnits`): foreign UNITS no longer halt
  // the mover; enemy Locations still do (a city is not a picket line).
  if (!ignoreUnits) for (const u of Object.values(state.units)) {
    if (u.owner === ownerId) continue;
    if (!passesFreely(state, ownerId, u.owner)) {
      // Concealment-aware: a stealthed unit on a hex you CAN see is still a
      // surprise, which is exactly what isUnitVisibleTo already answers.
      note(u.node, isUnitVisibleTo(state, ownerId, u));
    }
  }
  for (const loc of Object.values(state.locations)) {
    if (loc.controller && loc.controller !== ownerId && !passesFreely(state, ownerId, loc.controller)) {
      // A city is remembered once explored — you do not forget where it is or
      // roughly whose it is — so an explored Location never ambushes anyone.
      note(loc.hexId, ensureVisibility(state, ownerId).explored.has(loc.hexId));
    }
  }
  // Rail doc §3 — a COMPLETED enemy blockade halts a mover the same way a unit
  // does. This is the point of the structure: it holds a road without pinning a
  // unit there forever. A construction site is not a blockade yet and blocks
  // nothing; the unit standing on it does that, above, as an ordinary unit.
  //
  // Night March (`ignoreUnits`) is about picket lines, not fortifications, so a
  // blockade still stops it — the same reasoning that keeps enemy Locations
  // blocking above.
  for (const b of Object.values(state.world?.blockades || {})) {
    if (!b.done || b.owner === ownerId) continue;
    if (!passesFreely(state, ownerId, b.owner)) {
      // Unlike a city, a blockade can go up (or come down) behind your back, so
      // it takes LIVE sight rather than memory to count as seen.
      note(b.hex, isHexVisible(state, ownerId, b.hex));
    }
  }
  for (const hex of visible) hidden.delete(hex);
  return { blocked, unseen: hidden };
}

export function movementBlockers(state, ownerId, opts) {
  return blockerScan(state, ownerId, opts).blocked;
}

// The blockers `ownerId` cannot see. Halting on one of these keeps the mover's
// remaining movement (board.js) — an ambush should cost you the advance, not
// the whole turn.
export function unseenBlockers(state, ownerId, opts) {
  return blockerScan(state, ownerId, opts).unseen;
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

// Once an unseen blocker has checked a unit's advance it keeps its movement,
// but only to fall back or sidestep — not to press on past the thing that
// stopped it. "Press on" is measured as distance from where its turn began, so
// the rule needs no notion of facing: a hex further from the start than the
// unit currently stands is closed to it for the rest of the turn.
//
// Without this the refund would gut blocking entirely — a mover could walk into
// an ambush, stop, and carry straight on for the price of one movement point,
// which would make advancing blind strictly better than scouting.
function restrictToFallback(state, unit, field) {
  const dist = bfsDistances(state.board.adjacency, unit.turnStartNode);
  const here = dist[unit.node] ?? 0;
  const out = {};
  for (const hex in field) if ((dist[hex] ?? Infinity) <= here) out[hex] = field[hex];
  return out;
}

export function unitReach(state, unit) {
  if (!unit) return {};
  const budget = unit.moveRemaining ?? unit.movement ?? 0;
  const opts = { ignoreUnits: unitPassesThroughUnits(state, unit) };
  const scan = blockerScan(state, unit.owner, opts);
  const field = movementField(state, unit.node, budget, {
    blockedThrough: scan.blocked,
    surprise: scan.unseen,
    ignoreTerrain: unitIgnoresTerrain(state, unit),
    extraCost: tollTaxedHexes(state, unit.owner),
    railEdges: unitRailEdges(state, unit),
  });
  if (!unit.checked || !unit.turnStartNode) return field;
  return restrictToFallback(state, unit, field);
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
