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
