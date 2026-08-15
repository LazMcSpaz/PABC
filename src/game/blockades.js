// Blockade structures — docs/rail-road-blockade-design.md §3. A deliberate,
// buildable alternative to "just stand on a hex": persistent, contestable, and
// tied to a supply line rather than to the unit that raised it.
//
// This module owns the blockade STATE + LIFECYCLE (find / start / advance /
// complete / destroy) and the road-supply question construction depends on.
// The rest integrates at its natural sites, exactly as the Listening Post does
// (§17.7, posts.js): the Build action in actions.js, blocking in movement.js,
// Vision in visibility.js, destruction in contest.js, the tick in turn.js.
//
// Like posts.js this imports only config + events — no diplomacy, no movement.
// That is not tidiness for its own sake: movement.js has to import THIS (a
// completed blockade halts movers), so anything it needs from movement has to
// arrive as a parameter instead. Hence the `isCut` predicate threaded through
// the supply helpers rather than a `passesFreely` import.
//
// A blockade lives in one of two phases in a single record:
//
//   done: false   under construction. Holds `progress` against `cost`, and the
//                 uid of the unit pinned to the hex building it.
//   done: true    a real structure. The builder is free to leave; the blockade
//                 defends itself, sees for its owner, and halts enemy movement.
import { CONFIG } from "./config.js";
import { emit } from "./events.js";

// The blockade on `hex`, or null. A hex carries at most one (§3.1).
export function blockadeAt(state, hex) {
  return state.world?.blockades?.[hex] || null;
}

// The blockade on `hex` only if it is finished — the phase that actually
// blocks, defends and sees. Construction sites do none of those things.
export function activeBlockadeAt(state, hex) {
  const b = blockadeAt(state, hex);
  return b && b.done ? b : null;
}

export function ownedBlockades(state, pid) {
  const out = [];
  const all = state.world?.blockades || {};
  for (const hex in all) if (all[hex].owner === pid) out.push(all[hex]);
  return out;
}

// §3.2 — static defense, plus whatever installed chips add. No chip carries a
// `blockadeDefense` bonus yet; the hook is here for the content batch, the same
// way chipGarrison's is in contest.js.
export function blockadeDefense(state, b) {
  let v = CONFIG.blockades.defense;
  for (const c of b.chips || []) {
    if (state.chips[c]?.disabled) continue;
    v += CONFIG.blockades.chipDefense?.[state.chips[c]?.chipId] || 0;
  }
  return v;
}

// §3.2 — its own sight footprint. Part 1's vision-gating is not built yet, so
// today this is only what the blockade contributes to its owner's fog; when
// gating lands it is also the range at which the blockade may halt a mover.
export function blockadeVision(state, b) {
  let r = CONFIG.blockades.vision;
  for (const c of b.chips || []) {
    if (state.chips[c]?.disabled) continue;
    r += CONFIG.blockades.chipVision?.[state.chips[c]?.chipId] || 0;
  }
  return r;
}

// --- supply --------------------------------------------------------------
// §3.1/§3.4 — the road path from `hex` to the NEAREST Location `pid` fully
// controls, or null if there is no road route to one at all.
//
// Road-only BFS: a blockade is fed along road, not cross-country, which is what
// makes cutting the road meaningful. The start hex is exempt from the road
// requirement only in the sense that a blockade may only ever be built on a
// road hex anyway (validated at the build site).
//
// Returned path includes both endpoints. Deterministic: ties break on hexId, so
// two equidistant settlements always resolve the same way.
export function roadSupplyPath(state, pid, hex) {
  const hexes = state.board.hexes;
  const adjacency = state.board.adjacency;
  if (!hexes[hex]) return null;

  const prev = { [hex]: null };
  const queue = [hex];
  let found = null;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    // A Location of ours ends the search. Checked on dequeue rather than on
    // discovery so the first hit is genuinely the nearest by road distance.
    if (cur !== hex && state.locations[cur]?.controller === pid) { found = cur; break; }
    const nbs = [...(adjacency[cur] || [])].sort();
    for (const nb of nbs) {
      if (prev[nb] !== undefined) continue;
      // Travel only along road. A Location on the far end counts as reachable
      // even if its own hex was never stamped `road` — a city is a terminus,
      // not a stretch of track.
      if (!hexes[nb]?.road && state.locations[nb]?.controller !== pid) continue;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = found; c != null; c = prev[c]) path.unshift(c);
  return path;
}

// Is `hex`'s supply line to its nearest owned settlement intact for `pid`?
// `isCut(hexId)` is supplied by the caller and answers "does something hostile
// to pid sit here" — it lives outside this module so movement.js can import
// blockades.js without the reverse dependency (see the header).
//
// Returns { path, cut } so a caller can report WHERE it broke, not just that it
// did — a supply line that silently fails is the kind of thing that reads as a
// bug rather than as an enemy doing something to you.
export function supplyStatus(state, pid, hex, isCut) {
  const path = roadSupplyPath(state, pid, hex);
  if (!path) return { path: null, cut: null, ok: false };
  const cut = path.find((h) => h !== hex && isCut(h)) || null;
  return { path, cut, ok: !cut };
}

// --- lifecycle -----------------------------------------------------------
// §3.1 — begin construction. The caller (actions.js) validates the road hex,
// the supply line, the builder and the cost; this creates the state.
export function startBlockade(state, owner, hex, builderUid) {
  state.world.blockades = state.world.blockades || {};
  const b = {
    owner,
    hex,
    done: false,
    progress: 0,
    cost: CONFIG.blockades.cost,
    builder: builderUid,
    chips: [],
  };
  state.world.blockades[hex] = b;
  emit(state, "blockade_started", { owner, hex, unit: builderUid, cost: b.cost });
  return b;
}

// §3.1 — one Upkeep's worth of construction for every site `pid` owns.
//
// Three things can happen to a site, and they are deliberately different:
//
//   * the builder is gone (dead, or it walked off)  → construction FAILS
//     outright. No partial refund; §3.1 is explicit that the pinned unit is the
//     real cost of choosing to build one.
//   * the supply line is cut                        → no progress this turn.
//     Construction stretches past the 2-turn floor rather than failing, and
//     emits so the player can see why nothing moved.
//   * otherwise                                     → progress accrues.
//
// `isCut` is threaded in by the caller (turn.js), which knows about diplomacy.
//
// The rate is flat for now. docs/rail-road-blockade-design.md §3.4 makes it the
// connected settlement's surplus output, sharing one mechanism with rail's
// production pooling (§2.2); that work is deferred, and this is the single line
// it replaces.
export function advanceBlockades(state, pid, isCut) {
  for (const b of ownedBlockades(state, pid)) {
    if (b.done) continue;

    const builder = state.units[b.builder];
    if (!builder || builder.node !== b.hex || builder.owner !== pid) {
      delete state.world.blockades[b.hex];
      emit(state, "blockade_failed", { owner: pid, hex: b.hex, reason: "builder left" });
      continue;
    }

    const supply = supplyStatus(state, pid, b.hex, isCut);
    if (!supply.ok) {
      emit(state, "blockade_stalled", {
        owner: pid, hex: b.hex,
        reason: supply.path ? "supply line cut" : "no road to a held settlement",
        at: supply.cut,
      });
      continue;
    }

    b.progress += CONFIG.blockades.buildRate;
    if (b.progress >= b.cost) {
      b.done = true;
      b.progress = b.cost;
      b.builder = null; // §3.2 — the builder is free to leave the moment it lands
      emit(state, "blockade_completed", { owner: pid, hex: b.hex });
    } else {
      emit(state, "blockade_progressed", {
        owner: pid, hex: b.hex, progress: b.progress, cost: b.cost,
      });
    }
  }
}

// §3.3 — destroy-only. Unlike a Location a blockade has no VP or economic
// identity worth inheriting, so a lost contest removes it rather than flipping
// its controller.
export function destroyBlockade(state, hex, by) {
  const b = state.world?.blockades?.[hex];
  if (!b) return null;
  delete state.world.blockades[hex];
  emit(state, "blockade_destroyed", {
    owner: b.owner, hex, by: by || null, wasComplete: !!b.done,
  });
  return b;
}
