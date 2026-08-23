// Location control levels — the single source of truth for "who holds
// this place, and how firmly".
//
// A Location has 3 sections. Historically only 3-of-3 counted: the moment
// a rival flipped ONE section the holder's `loc.controller` cleared and
// the place went dark for them — no output, no influence projected, no
// rights — which (playtest 2026-08-15) blocked a player out of everything
// they had invested the instant an attacker landed a single contest, and
// fed the snowball: a city that stops projecting influence loses its own
// hex to a neighbour's Zone of Control, which then cites the rightful
// holder's own troops for trespassing at home.
//
// So control is now GRADUATED:
//   full      — 3 of 3 sections. Every right.
//   majority  — 2 of 3. The place still works, at reduced capacity, and
//               still anchors its own hex. You are besieged, not evicted.
//   contested — 1 of 3 or fewer. No rights (but see `hasFooting`).
//
// This module is a LEAF (no engine imports) so every layer — influence,
// economy, turn, contest, diplomacy, UI adapter — can read the same
// answer without an import cycle.

// The faction holding a strict majority of sections, or null. Full
// control implies majority, so `holderOf` covers both.
export function holderOf(loc) {
  if (!loc?.sections?.length) return null;
  const counts = {};
  for (const s of loc.sections) {
    if (!s || s === "neutral") continue;
    counts[s] = (counts[s] || 0) + 1;
  }
  const need = Math.floor(loc.sections.length / 2) + 1;
  for (const fid in counts) if (counts[fid] >= need) return fid;
  return null;
}

// Does `fid` hold every section?
export function hasFullControl(loc, fid) {
  return !!fid && !!loc?.sections?.length && loc.sections.every((s) => s === fid);
}

// "full" | "majority" | "contested" | null (no sections at all held).
export function controlLevel(loc, fid) {
  if (!fid || !loc?.sections?.length) return null;
  if (hasFullControl(loc, fid)) return "full";
  if (holderOf(loc) === fid) return "majority";
  return loc.sections.includes(fid) ? "contested" : null;
}

// Does `fid` hold this Location firmly enough to exercise reduced rights
// (collect output, project influence, anchor its own hex, garrison it
// without being cited as a trespasser)? Majority or better.
export function holdsLocation(loc, fid) {
  return !!fid && holderOf(loc) === fid;
}

// Does `fid` have ANY foothold here (at least one section)? Used where
// mere presence matters rather than authority.
export function hasFooting(loc, fid) {
  return !!fid && !!loc?.sections?.includes(fid);
}

// --- the control ledger (economy brief §13 "Fix rather than drop") ----
//
// `state.world.controlHistory` was seeded once at setup and NEVER APPENDED
// TO, which meant `dsl.js`'s `control_duration` condition could only ever
// report on a Location a faction had held since round 0 — and returned 0 for
// every other case, including every conquest. A content author asking "have
// they held this place for three rounds?" got a silent, permanent no. That is
// a working DSL condition with no way to fire.
//
// Driven by a SWEEP rather than by hooks on each mutation site. Control
// changes hands through capture, cession, a peel to neutral, a partial-control
// interim that clears `loc.controller`, and a handful of content effects —
// five paths today and no guarantee about tomorrow, and a ledger that misses
// one is worse than no ledger, because it reads as authoritative. Comparing
// the board against the open entries is idempotent, cannot miss a path, and
// costs one pass over the Locations.
//
// The bar is `holderOf` — majority — because that is the bar every other part
// of the engine means by "hold": a besieged city still pays its holder, still
// projects, still anchors its own hex. A ledger using a stricter bar than the
// rest of the game would answer a different question from the one an author
// is asking.
export function syncControlHistory(state) {
  const world = state.world;
  if (!world) return;
  const hist = world.controlHistory = world.controlHistory || [];
  const open = new Map(); // hexId -> entry
  for (const h of hist) if (h.toRound == null) open.set(h.hex, h);
  for (const loc of Object.values(state.locations || {})) {
    const now = holderOf(loc) || null;
    const cur = open.get(loc.hexId) || null;
    if (cur && cur.controller === now) continue;      // unchanged
    if (cur) cur.toRound = state.round;               // closed: they held it until now
    if (now) hist.push({ hex: loc.hexId, controller: now, fromRound: state.round, toRound: null });
  }
  // An entry can be left open for a Location that no longer exists (nothing
  // removes Locations today, but the ledger should not be the thing that
  // assumes so).
  for (const [hex, entry] of open) {
    if (!state.locations?.[hex]) entry.toRound = state.round;
  }
}
