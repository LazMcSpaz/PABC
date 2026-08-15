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
import { CHIPS } from "./content.js";
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

// Sum a numeric field across a blockade's installed, non-dormant chips —
// the shared reader for every §3.2 upgrade, mirroring locChipSum in turn.js.
function chipSum(state, b, field) {
  let n = 0;
  for (const c of b.chips || []) {
    if (state.chips[c]?.disabled) continue; // §20.9 dormant — passives suppressed
    n += CHIPS[state.chips[c]?.chipId]?.[field] || 0;
  }
  return n;
}

// §3.2 — static defense, plus whatever installed chips add (Palisade).
export function blockadeDefense(state, b) {
  return CONFIG.blockades.defense + chipSum(state, b, "blockadeDefense");
}

// §3.2 — its own sight footprint, plus chips (Signal Mast). Part 1's
// vision-gating is not built yet, so today this is only what the blockade
// contributes to its owner's fog; when gating lands it is also the range at
// which the blockade may halt a mover.
export function blockadeVision(state, b) {
  return CONFIG.blockades.vision + chipSum(state, b, "blockadeVision");
}

// §3.2 Toll Booth — a mature blockade's own scrap income, independent of the
// settlement that raised it. Summed per faction at Upkeep.
export function blockadeIncome(state, pid) {
  let n = 0;
  for (const b of ownedBlockades(state, pid)) {
    if (!b.done) continue;
    n += chipSum(state, b, "output");
  }
  return n;
}

// Slots a blockade's installed chips occupy, against CONFIG.blockades.chipSlots.
export function blockadeSlotsUsed(state, b) {
  let n = 0;
  for (const c of b.chips || []) n += CHIPS[state.chips[c]?.chipId]?.slots ?? 1;
  return n;
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

// §3.1/§3.4 — which of `pid`'s construction sites may draw on a settlement this
// Upkeep, and from WHICH settlement. Run once per Upkeep, before the economy
// step spends anything, because it also resolves the two ways a site can stop
// being fundable — and those are deliberately different:
//
//   * the builder is gone (dead, or it walked off)  → construction FAILS
//     outright. No partial refund; §3.1 is explicit that the pinned unit is the
//     real cost of choosing to build one.
//   * the supply line is cut                        → no progress this turn.
//     Construction stretches past the 2-turn floor rather than failing, and
//     emits so the player can see why nothing moved.
//
// Returns [{ blockade, settlement }] — `settlement` is the hexId of the nearest
// Location `pid` holds by road, which is the one that pays (§3.4). `isCut` is
// threaded in by the caller, which knows about diplomacy.
export function resolveBlockadeSites(state, pid, isCut) {
  const sites = [];
  for (const b of ownedBlockades(state, pid)) {
    // A finished blockade only wants funding while a chip is queued on it; an
    // idle one draws nothing, so its settlement keeps its whole output.
    if (b.done && !b.build) continue;

    // Only CONSTRUCTION pins a unit (§3.1). Once the structure stands, the
    // builder is long gone and an upgrade needs only the supply line.
    if (!b.done) {
      const builder = state.units[b.builder];
      if (!builder || builder.node !== b.hex || builder.owner !== pid) {
        delete state.world.blockades[b.hex];
        emit(state, "blockade_failed", { owner: pid, hex: b.hex, reason: "builder left" });
        continue;
      }
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

    sites.push({ blockade: b, settlement: supply.path[supply.path.length - 1] });
  }
  // Deterministic, and nearest-first so a settlement funding two sites finishes
  // the closer one first rather than dribbling into both.
  sites.sort((x, y) => (x.blockade.hex < y.blockade.hex ? -1 : 1));
  return sites;
}

// §3.1 — the most construction one site may absorb in a single Upkeep.
//
// This is what enforces §3.1's two-turn floor now that the rate comes from a
// settlement's output rather than a constant: a rich city cannot raise a
// blockade in one turn however much it produces. It also stops a blockade
// swallowing a whole city's build capacity — whatever it cannot take flows on
// to the city's own chip.
export function creditCap(b) {
  return Math.ceil(b.cost / Math.max(1, CONFIG.blockades.minTurns));
}

// §3.4 — put `amount` of a settlement's build output into a site. Returns what
// it could NOT take, so the caller can pass the remainder along.
//
// Routes to whichever of the two things a blockade can be building: the
// structure itself, or a §3.2 upgrade chip on a finished one. Only the
// structure is floor-capped — an upgrade is ordinary construction and a rich
// settlement may finish one in a turn, exactly as it can at a Location.
export function creditBlockade(state, b, amount) {
  if (b.done) return creditUpgrade(state, b, amount);

  const want = Math.min(amount, creditCap(b), b.cost - b.progress);
  if (want <= 0) return amount;

  b.progress += want;
  if (b.progress >= b.cost) {
    b.done = true;
    b.progress = b.cost;
    b.builder = null; // §3.2 — the builder is free to leave the moment it lands
    emit(state, "blockade_completed", { owner: b.owner, hex: b.hex });
  } else {
    emit(state, "blockade_progressed", {
      owner: b.owner, hex: b.hex, progress: b.progress, cost: b.cost,
    });
  }
  return amount - want;
}

// §3.2 — advance a queued upgrade chip, installing it once paid for.
function creditUpgrade(state, b, amount) {
  const build = b.build;
  if (!build) return amount;
  const want = Math.min(amount, build.cost - build.progress);
  if (want <= 0) return amount;

  build.progress += want;
  if (build.progress < build.cost) {
    emit(state, "blockade_progressed", {
      owner: b.owner, hex: b.hex, chipId: build.chipId,
      progress: build.progress, cost: build.cost,
    });
    return amount - want;
  }

  const uid = state.nextId("chip");
  state.chips[uid] = { uid, chipId: build.chipId };
  b.chips.push(uid);
  b.build = null;
  emit(state, "build_completed", { hex: b.hex, chip: uid, chipId: build.chipId });
  return amount - want;
}

// §3.3 — destroy-only. Unlike a Location a blockade has no VP or economic
// identity worth inheriting, so a lost contest removes it rather than flipping
// its controller.
export function destroyBlockade(state, hex, by) {
  const b = state.world?.blockades?.[hex];
  if (!b) return null;
  delete state.world.blockades[hex];
  // Its chips go with it — a destroyed structure leaves no salvage, matching
  // the demolished-in-place rule for Location chips.
  for (const c of b.chips || []) state.removed.push(c);
  emit(state, "blockade_destroyed", {
    owner: b.owner, hex, by: by || null, wasComplete: !!b.done,
  });
  return b;
}
