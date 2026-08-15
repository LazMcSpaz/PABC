// §18.3 Influence & Zone of Control — a deterministic scalar field (NO
// dice) and the derived ZoC owner map. A sibling to recomputeStats /
// recomputeResearch: it is recomputed on any control / Loyalty / chip
// change. Loyalty feeds Influence — a freshly captured, low-Loyalty
// Location projects little; a fully integrated one projects strongly.
//
//   influence(faction, hex) =
//     Σ over that faction's controlled Locations within range R of:
//         ( faction base + location local influence + influence-chip bonuses )
//       × distance falloff(hex, location)
//
// A hex joins a faction's ZoC when that faction's Influence there is the
// highest AND clears the dominance threshold; ties or below-threshold →
// contested / neutral (no owner).
//
// ZoC ≠ Vision (§18.3 / §19): this is the influence-DOMINANCE set only.
// Fog builds the separate Vision set later; keep them distinct — nothing
// here writes or reads a vision set.
import { CONFIG } from "./config.js";
import { CHIPS, CAPITAL, ABILITIES } from "./content.js";
import { emit } from "./events.js";
import { bfsDistances } from "./board.js";
import { holderOf } from "./control.js";

// Influence-chip schema (§18.11 — chips are authored later, in the
// content pass). recomputeInfluence reads these optional fields off any
// chip def sitting on a controlled Location:
//   influenceBase   {number} — adds to that Location's source strength
//                              (a faction-base bump projected from here)
//   localInfluence  {number} — adds to that Location's local influence
//   influenceRange  {number} — extends range R for that Location (hops)
// No influence chips exist yet; the reader is the schema of record.
const INFLUENCE_CHIP_FIELDS = ["influenceBase", "localInfluence", "influenceRange"];

function chipDef(state, uid) {
  const inst = state.chips[uid];
  if (!inst) return null;
  if (inst.chipId === "capital") return CAPITAL;
  return CHIPS[inst.chipId] || null;
}

// Source strength a single controlled Location projects at distance 0:
// faction base + local influence (scales with this Location's Loyalty) +
// any influence-chip bonuses installed here.
function locationSource(state, loc) {
  const cfg = CONFIG.influence;
  const loyalty = loc.loyalty ?? 0; // capitals sit at the ceiling (inert)
  let src = cfg.factionBase + cfg.loyaltyScale * loyalty;
  for (const c of loc.chips) {
    const def = chipDef(state, c);
    if (!def) continue;
    src += (def.influenceBase || 0) + (def.localInfluence || 0);
  }
  return src;
}

// Range (in hops) a Location projects, plus any influence-chip extension.
function locationRange(state, loc) {
  let r = CONFIG.influence.range;
  for (const c of loc.chips) {
    const def = chipDef(state, c);
    if (def) r += def.influenceRange || 0;
  }
  // Beacon Hill (ability passive INFLUENCE_RANGE): some hills just carry
  // a signal farther — the Location projects beyond the base range.
  if (loc.abilityId) {
    for (const pv of ABILITIES[loc.abilityId]?.passives || []) {
      if (pv.type === "INFLUENCE_RANGE") r += pv.amount || 0;
    }
  }
  return r;
}

// Recompute the per-faction Influence scalar field and the derived ZoC
// owner map into state.world. Deterministic; safe to call as often as
// any control / Loyalty / chip change occurs.
export function recomputeInfluence(state) {
  const cfg = CONFIG.influence;
  const adjacency = state.board.adjacency;
  const field = {}; // fid -> { hexId: number }

  for (const loc of Object.values(state.locations)) {
    // A Location projects for whoever HOLDS it — outright, or by majority
    // at reduced strength. (Before: only 3-of-3 projected, so one flipped
    // section silenced a city and handed its own hex to a neighbour.)
    const fid = loc.controller || holderOf(loc);
    if (!fid) continue;
    const partial = fid !== loc.controller;
    let src = locationSource(state, loc);
    if (partial) src *= cfg.partialHolderScale;
    if (src <= 0) continue;
    const r = locationRange(state, loc);
    const dist = bfsDistances(adjacency, loc.hexId);
    const fac = (field[fid] ||= {});
    for (const hex in dist) {
      const d = dist[hex];
      if (d > r) continue;
      fac[hex] = (fac[hex] || 0) + src * Math.pow(cfg.falloff, d);
    }
  }

  state.world.influence = field;
  deriveZoC(state, field);
  return field;
}

// A Location's OWN hex belongs to whoever holds it, full stop — nobody
// out-influences the people standing in the city. Without this anchor a
// besieged city's hex could fall into a neighbour's ZoC, which then cited
// the rightful holder's own garrison for trespassing at home (playtest
// 2026-08-15) and made borders thrash round to round.
function anchorHeldLocations(state, next) {
  for (const loc of Object.values(state.locations)) {
    const fid = loc.controller || holderOf(loc);
    if (fid) next[loc.hexId] = fid;
  }
}

// Derive the ZoC owner map from a freshly computed field and emit
// `zone_changed` for every hex whose owner flipped. A hex is owned by the
// faction whose Influence there is strictly highest AND clears the
// dominance threshold; everything else is contested / neutral (null).
function deriveZoC(state, field) {
  const cfg = CONFIG.influence;
  const prev = state.world.zoc || {};
  const next = {};

  for (const hex in state.board.hexes) {
    let bestFid = null;
    let best = 0;
    let second = 0;
    for (const fid in field) {
      const v = field[fid][hex] || 0;
      if (v > best) { second = best; best = v; bestFid = fid; }
      else if (v > second) { second = v; }
    }
    // Clears threshold AND no tie for the lead → owned; else neutral.
    next[hex] = best >= cfg.dominanceThreshold && best > second ? bestFid : null;
  }
  anchorHeldLocations(state, next);

  state.world.zoc = next;

  const touched = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const hex of touched) {
    const from = prev[hex] || null;
    const to = next[hex] || null;
    if (from !== to) emit(state, "zone_changed", { hex, from, to });
  }
}

// --- queries (light-touch uses; §18.3) -------------------------------

// The faction whose ZoC contains `hex`, or null (contested / neutral).
export function zocOwner(state, hex) {
  return state.world?.zoc?.[hex] || null;
}

// Who is squeezing `loc` out from under `pid`? The soft-power siege reads
// the raw Influence FIELD, not the ZoC map: a Location anchors its own hex
// in the ZoC map (so its garrison is never a trespasser at home), but a
// rival projecting more Influence there is still hollowing the place out.
// Returns the strongest such rival, or null.
export function pressureSource(state, loc, pid) {
  const field = state.world?.influence;
  if (!field) return null;
  const mine = field[pid]?.[loc.hexId] || 0;
  let bestFid = null, best = mine;
  for (const fid in field) {
    if (fid === pid) continue;
    const v = field[fid][loc.hexId] || 0;
    if (v > best) { best = v; bestFid = fid; }
  }
  // Same bar the ZoC map applies: a squeeze only counts as DOMINANCE once
  // it clears the threshold. (Without this, any rival with a hair more
  // Influence pinned every city's Loyalty down and the Dominion VP faucet
  // dried up across the board.)
  if (best < CONFIG.influence.dominanceThreshold) return null;
  return bestFid;
}

// Encounter-reveal `condition` hook: "recipient's ZoC contains this hex".
export function inZoC(state, fid, hex) {
  return zocOwner(state, hex) === fid;
}

export { INFLUENCE_CHIP_FIELDS };
