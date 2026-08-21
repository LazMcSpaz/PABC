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
export { passesFreely, supplyCutter, hasRailAccess } from "./diplomacy.js";
import { passesFreely, hasRailAccess } from "./diplomacy.js";
import { isHexExplored, isHexVisible, isUnitVisibleTo, canSeeUnitAt } from "./visibility.js";
import { isHaulingDevice, deviceMovedThisRound } from "./rainmaker.js";

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
function blockerScan(state, ownerId, { ignoreUnits, mover } = {}) {
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
      note(loc.hexId, isHexExplored(state, ownerId, loc.hexId));
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
    // `paid === false` is a dormant position — standing, but unmanned, so the
    // road is open through it until its owner clears the arrears.
    if (!b.done || b.paid === false || b.owner === ownerId) continue;
    if (!passesFreely(state, ownerId, b.owner)) {
      // Rail doc Part 1 — a blockade is a GARRISON, not a wall. It only halts
      // a mover its owner can actually SEE arriving, asked at the blockade's
      // own hex (the position being entered, not wherever the mover is
      // standing while the field is computed). A stealthed unit therefore
      // walks straight through unless the owner has Detection covering that
      // hex — Signal Mast is what buys it.
      //
      // With no `mover` this stays ground truth: `movementBlockers(state, fid)`
      // is a "what would stop this faction" query with no particular unit in
      // hand, and answering it with a guess would be worse than answering it
      // with the map.
      if (mover && !canSeeUnitAt(state, b.owner, mover, b.hex)) continue;
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

  // Rail doc §2.3 — you may work a station you hold, or one whose holder has
  // granted you running rights (a pact grants them implicitly). Unheld track
  // is nobody's to close. This is what turns rail from a purely territorial
  // asset into something diplomacy can open.
  const controls = (hexId) => {
    const holder = state.locations[hexId]?.controller;
    if (!holder) return true;
    return holder === unit.owner || hasRailAccess(state, unit.owner, holder);
  };
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

// --- stacking ---------------------------------------------------------
// How many units stand on `hex`, every owner counted. Enemies only share a hex
// in passing (arriving on one starts a contest), so this is normally one side's
// stack, but the cap is on the tile rather than on a player: it exists because
// the tile runs out of room to draw them, and the board does not care who owns
// what it cannot show.
export function unitsOnHex(state, hex, exclude = null) {
  let n = 0;
  for (const u of Object.values(state.units)) {
    if (u.node === hex && u.uid !== exclude) n++;
  }
  return n;
}

// Is `hex` full? `exclude` lets a unit already standing there be discounted, so
// a mover never blocks itself.
export function hexIsFull(state, hex, exclude = null) {
  return unitsOnHex(state, hex, exclude) >= CONFIG.hexUnitCap;
}

// The convoy hauling the Rainmaker covers exactly one hex per turn, and NOTHING
// modifies that (rainmaker notes §2): not roads, not rail, not the +1 movement
// the holder may have earned racing for the thing, not terrain, not a chip, not
// a tech, and not a modifier nobody has written yet.
//
// So this is built from the adjacency and nothing else, rather than by starting
// from the ordinary field and subtracting the bonuses we happen to know about.
// Default-deny is the whole point: the failure the notes describe is a player
// who raced, lost, stole the convoy, and hauled it home at two hexes a turn on
// the vehicle they earned racing for it.
//
// Everything that is not a movement bonus still applies. A full hex is still
// full, and a blocked hex still stops the convoy dead — it is entered and the
// step is over, which is what one hex per turn means anyway.
function convoyField(state, unit) {
  if (deviceMovedThisRound(state)) return {};
  const out = {};
  for (const nb of state.board.adjacency[unit.node] || []) {
    if (hexIsFull(state, nb, unit.uid)) continue;
    out[nb] = 0; // arriving spends the step, whatever the unit's Movement says
  }
  return out;
}

export function unitReach(state, unit) {
  if (!unit) return {};
  if (isHaulingDevice(state, unit)) return convoyField(state, unit);
  const budget = unit.moveRemaining ?? unit.movement ?? 0;
  const opts = { ignoreUnits: unitPassesThroughUnits(state, unit), mover: unit };
  const scan = blockerScan(state, unit.owner, opts);
  const field = movementField(state, unit.node, budget, {
    blockedThrough: scan.blocked,
    surprise: scan.unseen,
    ignoreTerrain: unitIgnoresTerrain(state, unit),
    extraCost: tollTaxedHexes(state, unit.owner),
    railEdges: unitRailEdges(state, unit),
  });
  // A full hex may still be walked THROUGH — the cap is about what can stand
  // on a tile, not about the road across it — so this prunes destinations after
  // the field is built rather than treating a full hex as impassable.
  for (const hex in field) {
    if (hexIsFull(state, hex, unit.uid)) delete field[hex];
  }
  if (!unit.checked || !unit.turnStartNode) return field;
  return restrictToFallback(state, unit, field);
}

// The exact ROUTE `unit` takes to reach `dest` this turn (same rules as
// unitReach) — for the move-preview arrow. [start, …, dest] or null.
export function unitMovePath(state, unit, dest) {
  if (!unit) return null;
  // A convoy's route is never more than a single step, so there is no lane to
  // draw around a mountain — and routing it through movementRoute would let the
  // road costs it is meant to ignore back in through the preview.
  if (isHaulingDevice(state, unit)) {
    return dest in convoyField(state, unit) ? [unit.node, dest] : null;
  }
  const budget = unit.moveRemaining ?? unit.movement ?? 0;
  return movementRoute(state, unit.node, budget, dest, {
    blockedThrough: movementBlockers(state, unit.owner, {
      ignoreUnits: unitPassesThroughUnits(state, unit), mover: unit,
    }),
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
