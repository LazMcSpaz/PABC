// §19 Exploration, Vision & Fog of War — the per-faction visibility layer.
// Supersedes §6.1's global board: there is NO single truth any player
// reads. Each faction has its own three-state fog (unexplored / explored /
// visible) plus a memory of last-known live state (the ghosts).
//
// The governing rule (§19.2): STATIC facts persist, LIVE facts don't. Once
// a hex is seen its terrain + the existence of a Location there is
// remembered forever; but unit positions, Control, Loyalty and garrison are
// trustworthy ONLY while the hex sits in that faction's `visible` set.
// Leaving vision snapshots the last-live state into `memory` — that
// snapshot is the source of the ghosts, and it is NOT updated until the hex
// is re-sighted.
//
// ZoC ≠ Vision (§19.3): ZoC *contributes* to Vision, but the two are
// separate sets — Vision can reach BEYOND ZoC (a scout in the dark) and a
// concealed enemy can sit INSIDE your ZoC unseen. This module owns the
// Vision/ghost sets; influence.js owns ZoC. They are never merged.
import { CONFIG } from "./config.js";
import { CHIPS, CAPITAL } from "./content.js";
import { emit } from "./events.js";
import { isElevation, isCover } from "./board.js";
import { hasTechNode } from "./tech.js";
import { revealPost } from "./posts.js";

// --- chip schema (§19.7 — scout / watchtower chips are authored later) ---
// recomputeVisibility reads these OPTIONAL fields off any chip def, so the
// content pass can add scout-loadout / watchtower chips without engine
// changes. No such chips exist yet; this reader is the schema of record:
//   vision     {number} — extra sight radius for the unit / Location it sits on
//   detection  {number} — extra Detection radius (pierces concealment)
//   stealth    {bool}   — conceals the carrying unit even in contact (§19.5)
// Units / Locations may also carry direct overrides set by effects
// (GRANT_VISION / scout flags): unit.visionBonus, unit.detectRange,
// unit.stealth, loc.watchVision, loc.watchDetection.
const VISION_CHIP_FIELDS = ["vision", "detection", "stealth"];

function chipDef(state, uid) {
  const inst = state.chips[uid];
  if (!inst) return null;
  if (inst.chipId === "capital") return CAPITAL;
  return CHIPS[inst.chipId] || null;
}

// Sum a numeric chip field across an entity's installed (non-dormant) chips.
function chipSum(state, chipUids, field) {
  let n = 0;
  for (const c of chipUids || []) {
    if (state.chips[c]?.disabled) continue; // §20.9 dormant chips give nothing
    const def = chipDef(state, c);
    if (def && typeof def[field] === "number") n += def[field];
  }
  return n;
}

function chipAny(state, chipUids, field) {
  for (const c of chipUids || []) {
    if (state.chips[c]?.disabled) continue;
    if (chipDef(state, c)?.[field]) return true;
  }
  return false;
}

// §17.5 Intelligence A1 (Watch Network): +1 faction-wide Vision AND +1
// faction-wide Detection. A1 ONLY — A2 (Listening Post, §17.7) is its own
// deployable Vision source, not a faction-wide buff, so it must NOT grant
// this bonus (the old A1-OR-A2 gate was a bug once A2 gained its own effect).
function intelVisionBonus(state, fid) {
  return hasTechNode(state, fid, "int-a1") ? CONFIG.fog.intelVisionBonus : 0;
}
function intelDetection(state, fid) {
  return hasTechNode(state, fid, "int-a1") ? CONFIG.fog.intelDetection : 0;
}

// --- source radii ----------------------------------------------------
export function unitVision(state, unit) {
  const onElev = isElevation(state.board.hexes[unit.node]);
  return (
    CONFIG.fog.unitVision +
    chipSum(state, unit.chips, "vision") +
    (unit.visionBonus || 0) +
    intelVisionBonus(state, unit.owner) +
    (onElev ? CONFIG.fog.elevationVisionBonus : 0)
  );
}

export function unitDetection(state, unit) {
  return (
    CONFIG.fog.unitDetection +
    chipSum(state, unit.chips, "detection") +
    (unit.detectRange || 0) +
    intelDetection(state, unit.owner)
  );
}

function locationVision(state, loc) {
  const onElev = isElevation(state.board.hexes[loc.hexId]);
  const loyalty = loc.loyalty ?? 0;
  return (
    CONFIG.fog.locationVisionBase +
    Math.floor(loyalty * CONFIG.fog.locationVisionPerLoyalty) +
    chipSum(state, loc.chips, "vision") +
    (loc.watchVision || 0) +
    intelVisionBonus(state, loc.controller) +
    (onElev ? CONFIG.fog.elevationVisionBonus : 0)
  );
}

function locationDetection(state, loc) {
  return chipSum(state, loc.chips, "detection") + (loc.watchDetection || 0) + intelDetection(state, loc.controller);
}

function unitHasStealth(state, unit) {
  return !!unit.stealth || chipAny(state, unit.chips, "stealth");
}

// --- line-of-sight cast (§19.4) --------------------------------------
// Deterministic spread from `src` carrying `radius` sight. Each step costs
// 1, +coverSightCost to enter a cover hex. Elevation hexes BLOCK sight
// beyond them (you see the ridge, not what's behind it) — unless the source
// itself sits on elevation (`overRidges`), in which case it sees over them.
// No dice. Returns a Set of hex ids in LoS (including `src`).
function castVision(state, src, radius, overRidges) {
  const adj = state.board.adjacency;
  const hexes = state.board.hexes;
  const seen = new Set([src]);
  const reach = { [src]: radius };
  const queue = [src];
  while (queue.length) {
    // pop the frontier hex with the most remaining sight (so the strongest
    // path to each hex wins; small N — a linear scan is fine and the larger
    // map can swap in a bucket queue without changing semantics).
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (reach[queue[i]] > reach[queue[bi]]) bi = i;
    const cur = queue.splice(bi, 1)[0];
    const r = reach[cur];
    // a ridge stops sight from passing THROUGH it (still visible itself).
    if (!overRidges && cur !== src && isElevation(hexes[cur])) continue;
    for (const nb of adj[cur] || []) {
      const step = 1 + (isCover(hexes[nb]) ? CONFIG.fog.coverSightCost : 0);
      const nr = r - step;
      if (nr < 0) continue;
      if (reach[nb] === undefined || nr > reach[nb]) {
        reach[nb] = nr;
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return seen;
}

// --- per-faction state ------------------------------------------------
export function ensureVisibility(state, fid) {
  state.visibility = state.visibility || {};
  if (!state.visibility[fid]) {
    state.visibility[fid] = {
      explored: new Set(),
      visible: new Set(),
      memory: {}, // hexId -> snapshot
      spotted: new Set(), // enemy unit ids currently seen (for spot/lost events)
    };
  }
  return state.visibility[fid];
}

export function ensureAllVisibility(state) {
  for (const fid of state.turnOrder) ensureVisibility(state, fid);
}

// Snapshot a hex's LIVE state into `fid`'s memory as it leaves vision
// (§19.2). Records static terrain + last-seen Location facts + ghosts of
// any enemy units `fid` could actually see there. Ghosts are frozen — never
// updated until the hex is re-sighted.
function snapshotHex(state, fid, hex) {
  const vis = state.visibility[fid];
  const h = state.board.hexes[hex];
  const loc = state.locations[hex];
  const ghosts = [];
  for (const u of Object.values(state.units)) {
    if (u.node !== hex || u.owner === fid) continue;
    if (!canSee(state, fid, u, /*contactOnly*/ false)) continue;
    ghosts.push({ unitId: u.uid, hex, owner: u.owner, strength: u.strength, round: state.round });
  }
  vis.memory[hex] = {
    round: state.round,
    terrain: { type: h.type, elevation: isElevation(h), cover: isCover(h) },
    location: loc
      ? {
          locationId: loc.locationId,
          controller: loc.controller,
          loyalty: loc.loyalty,
          garrison: loc.garrison,
          sections: [...loc.sections],
        }
      : null,
    ghosts,
  };
}

// Record the static facts of a hex on first discovery (terrain + that a
// Location exists here) — these persist regardless of later fog.
function rememberStatic(state, fid, hex) {
  const vis = state.visibility[fid];
  if (vis.memory[hex]) return;
  const h = state.board.hexes[hex];
  const loc = state.locations[hex];
  vis.memory[hex] = {
    round: state.round,
    terrain: { type: h.type, elevation: isElevation(h), cover: isCover(h) },
    location: loc ? { locationId: loc.locationId, controller: null, loyalty: null, garrison: null, sections: null } : null,
    ghosts: [],
  };
}

// --- the recompute (§19.11) ------------------------------------------
// `fid`'s `visible` set = the LoS-limited union of its Vision sources
// (units + controlled Locations + ZoC contribution). On a hex LEAVING
// visible, its live state is snapshotted into memory. Deterministic.
// Called incrementally — per acting faction on a move, per involved
// factions on capture — NOT all-factions-every-event (the scale guard).
export function recomputeVisibility(state, fid, { emitEvents = true } = {}) {
  const vis = ensureVisibility(state, fid);
  const next = new Set();

  for (const u of Object.values(state.units)) {
    if (u.owner !== fid) continue;
    const onElev = isElevation(state.board.hexes[u.node]);
    for (const h of castVision(state, u.node, unitVision(state, u), onElev)) next.add(h);
  }
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== fid) continue;
    const onElev = isElevation(state.board.hexes[loc.hexId]);
    for (const h of castVision(state, loc.hexId, locationVision(state, loc), onElev)) next.add(h);
  }
  // §19.3 ZoC contributes sight (presence and visibility share a shape) —
  // but stays a SEPARATE set: we union ZoC-owned hexes into vision, we do
  // not merge the underlying sets.
  const zoc = state.world?.zoc || {};
  const zr = CONFIG.fog.zocVision;
  for (const hex in zoc) {
    if (zoc[hex] !== fid) continue;
    if (zr <= 0) next.add(hex);
    else for (const h of castVision(state, hex, zr, false)) next.add(h);
  }

  // §17.7 Listening Posts — each PAID post `fid` owns is a radius-1 Vision
  // source on its hex (Vision only — no Detection). Dormant (unpaid) posts
  // contribute nothing and don't appear among the owner's sources.
  const posts = state.world?.listeningPosts || {};
  for (const hex in posts) {
    const post = posts[hex];
    if (post.owner !== fid || !post.paid) continue;
    const onElev = isElevation(state.board.hexes[post.hex]);
    for (const h of castVision(state, post.hex, CONFIG.posts.range, onElev)) next.add(h);
  }

  // §17.7 Detection reveal — any post (not fid's own) whose hex sits within
  // range of an fid Detection source is revealed to fid (permanent). Reveals
  // even dormant/concealed posts: Detection pierces the stealth.
  for (const hex in posts) {
    const post = posts[hex];
    if (post.owner === fid || post.revealedTo?.includes(fid)) continue;
    if (hasDetectionAt(state, fid, post.hex)) revealPost(state, post, fid, "detection");
  }

  // Hexes leaving visible → snapshot their live state into memory (ghosts).
  for (const hex of vis.visible) if (!next.has(hex)) snapshotHex(state, fid, hex);

  // Newly explored hexes persist + record static facts; emit hex_explored.
  for (const hex of next) {
    if (!vis.explored.has(hex)) {
      vis.explored.add(hex);
      rememberStatic(state, fid, hex);
      if (emitEvents) emit(state, "hex_explored", { faction: fid, hex });
    }
  }

  vis.visible = next;

  // Spot / lose-sight diffs over enemy units (concealment-aware).
  const seenNow = new Set();
  for (const u of Object.values(state.units)) {
    if (u.owner === fid) continue;
    if (canSee(state, fid, u, false)) seenNow.add(u.uid);
  }
  if (emitEvents) {
    for (const uid of seenNow) if (!vis.spotted.has(uid)) {
      const u = state.units[uid];
      emit(state, "unit_spotted", { faction: fid, unit: uid, owner: u?.owner, hex: u?.node });
    }
    for (const uid of vis.spotted) if (!seenNow.has(uid)) {
      emit(state, "unit_lost_sight", { faction: fid, unit: uid });
    }
  }
  vis.spotted = seenNow;
  return vis;
}

// Recompute several factions at once (capture, shared-vision grants).
export function recomputeVisibilityFor(state, fids, opts) {
  for (const fid of new Set(fids)) if (fid) recomputeVisibility(state, fid, opts);
}

// --- concealment / detection (§19.5) ---------------------------------
function viewerHasUnitOn(state, fid, hex) {
  for (const u of Object.values(state.units)) if (u.owner === fid && u.node === hex) return true;
  return false;
}

// Does `fid` have a Detection source within range of `hex`?
function hasDetectionAt(state, fid, hex) {
  const adj = state.board.adjacency;
  // BFS hop distances from the target hex (cheap on this scale).
  const dist = { [hex]: 0 };
  const q = [hex];
  let maxR = 0;
  // find the largest detection radius fid fields, to bound the BFS
  for (const u of Object.values(state.units)) if (u.owner === fid) maxR = Math.max(maxR, unitDetection(state, u));
  for (const loc of Object.values(state.locations)) if (loc.controller === fid) maxR = Math.max(maxR, locationDetection(state, loc));
  if (maxR <= 0) {
    // detection range 0 still covers the hex itself (point-blank recon).
    for (const u of Object.values(state.units)) if (u.owner === fid && u.node === hex && unitDetection(state, u) >= 0 && hasAnyDetection(state, u)) return true;
    return false;
  }
  while (q.length) {
    const cur = q.shift();
    if (dist[cur] >= maxR) continue;
    for (const nb of adj[cur] || []) if (dist[nb] === undefined) { dist[nb] = dist[cur] + 1; q.push(nb); }
  }
  for (const u of Object.values(state.units)) {
    if (u.owner !== fid) continue;
    const d = dist[u.node];
    if (d !== undefined && d <= unitDetection(state, u)) return true;
  }
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== fid) continue;
    const dr = locationDetection(state, loc);
    const d = dist[loc.hexId];
    if (dr > 0 && d !== undefined && d <= dr) return true;
  }
  return false;
}

function hasAnyDetection(state, unit) {
  return CONFIG.fog.unitDetection > 0 || chipSum(state, unit.chips, "detection") > 0 || (unit.detectRange || 0) > 0;
}

// Core §19.11 concealment check, shared by render AND Contest declaration:
// `fid` sees `unit` iff the unit's hex is in fid.visible AND (it is not
// concealed OR an fid Detection source is in range). A friendly unit in
// CONTACT (own unit on the same hex) reveals non-stealth units point-blank;
// a STEALTH chip stays hidden even in contact until detected. Cover hides
// only from distant eyes (the hidden-army case), not in contact.
export function canSee(state, fid, unit, contactReveals = true) {
  if (unit.owner === fid) return true;
  const hex = unit.node;
  const stealth = unitHasStealth(state, unit);
  if (contactReveals && !stealth && viewerHasUnitOn(state, fid, hex)) return true;
  const vis = state.visibility?.[fid];
  if (!vis) return true; // no fog initialised → everything visible (back-compat)
  if (!vis.visible.has(hex)) return false;
  const concealed = stealth || isCover(state.board.hexes[hex]);
  if (concealed && !hasDetectionAt(state, fid, hex)) return false;
  return true;
}

// Public alias used by contest.js / engineAdapter.js / ai.js.
export function isUnitVisibleTo(state, fid, unit) {
  return canSee(state, fid, unit, true);
}

// Is `hex` in `fid`'s current live vision?
export function isHexVisible(state, fid, hex) {
  const vis = state.visibility?.[fid];
  return vis ? vis.visible.has(hex) : true;
}

// --- §19 effect helpers (REVEAL_REGION / GRANT_VISION / PLANT_FALSE_INTEL) ---

// Mark a region explored + temporarily visible for a faction (a reveal
// pulse / shared map data). Adds to explored and visible immediately.
export function revealRegion(state, fid, hexes) {
  const vis = ensureVisibility(state, fid);
  for (const hex of hexes) {
    if (!state.board.hexes[hex]) continue;
    if (!vis.explored.has(hex)) { vis.explored.add(hex); rememberStatic(state, fid, hex); emit(state, "hex_explored", { faction: fid, hex }); }
    vis.visible.add(hex);
  }
}

// Plant a false ghost in a rival's memory (§19.8 espionage / sabotage):
// write a fabricated last-known marker into an explored-but-not-visible hex.
export function plantFalseGhost(state, fid, hex, ghost) {
  const vis = ensureVisibility(state, fid);
  if (!vis.explored.has(hex)) return false;
  const mem = vis.memory[hex] || (vis.memory[hex] = { round: state.round, terrain: null, location: null, ghosts: [] });
  mem.ghosts.push({ unitId: ghost.unitId || "phantom", hex, owner: ghost.owner, strength: ghost.strength ?? 0, round: state.round, false: true });
  return true;
}

export { VISION_CHIP_FIELDS };
