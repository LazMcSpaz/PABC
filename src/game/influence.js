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
import { CHIPS, CAPITAL } from "./content.js";
import { emit } from "./events.js";
import { bfsDistances } from "./board.js";

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
    const fid = loc.controller;
    if (!fid) continue; // only fully-controlled Locations project
    const src = locationSource(state, loc);
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

// Encounter-reveal `condition` hook: "recipient's ZoC contains this hex".
export function inZoC(state, fid, hex) {
  return zocOwner(state, hex) === fid;
}

export { INFLUENCE_CHIP_FIELDS };
