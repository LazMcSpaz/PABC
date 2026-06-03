// Token substitution for player-facing flavor text. Authors write
// `{faction:lowest-standing-with-active}` in beat text or choice labels;
// at display time the engine resolves the token to a real faction /
// location / unit name based on current state.
//
// Resolution model:
//   - Tokens look like `{kind:selector}`. Both parts are required.
//   - Unknown tokens or selectors that can't be satisfied resolve to a
//     generic fallback ("someone", "a place", "a unit"). The text is
//     never blank or visibly broken.
//   - The renderer should call resolveTokens BEFORE wiki-markup parsing,
//     so a resolved name can itself contain [[wiki-links]] in the future
//     if we ever want that (today resolvers return plain strings).
//
// Adding a new token: append to FACTION_SELECTORS / LOCATION_SELECTORS /
// UNIT_SELECTORS. The editor's VariablePicker reads the same lists for
// its dropdown.

import { FACTIONS, MINOR_FACTIONS, LOCATIONS, factionDef } from "./content.js";
import { bfsDistances } from "./board.js";

const FALLBACK = {
  faction: "someone",
  location: "a place",
  unit: "a unit",
};

// ----- Resolver registry -----

const FACTION_SELECTORS = {
  active: (state) => state.turnOrder?.[state.activeIndex] ?? null,
  recipient: (state, ctx) => ctx?.sourcePlayer ?? state.turnOrder?.[state.activeIndex] ?? null,
  "lowest-standing-with-active": (state) => extremeStandingFid(state, "low"),
  "highest-standing-with-active": (state) => extremeStandingFid(state, "high"),
  "hostile-to-active": (state) => firstAtWarFid(state),
};

const LOCATION_SELECTORS = {
  "active-capital": (state) => {
    const active = state.turnOrder?.[state.activeIndex];
    if (!active) return null;
    return capitalHexOf(state, active);
  },
  "strategic-near-active": (state) => {
    const active = state.turnOrder?.[state.activeIndex];
    if (!active) return null;
    return nearestStrategicLocation(state, active);
  },
  "contested": (state) => firstContestedLocation(state),
};

const UNIT_SELECTORS = {
  "strongest-active": (state) => extremeOwnedUnit(state, state.turnOrder?.[state.activeIndex], "max"),
  "weakest-active": (state) => extremeOwnedUnit(state, state.turnOrder?.[state.activeIndex], "min"),
};

// ----- Public registry (also used by the editor's VariablePicker) -----

// Each entry: { token, label } — token is what gets inserted in text,
// label is the plain-English description shown in the picker.
export const TEXT_TOKENS = [
  { token: "{faction:active}",                    label: "active player's faction" },
  { token: "{faction:recipient}",                 label: "encounter recipient's faction" },
  { token: "{faction:lowest-standing-with-active}", label: "faction that likes active player least" },
  { token: "{faction:highest-standing-with-active}", label: "faction that likes active player most" },
  { token: "{faction:hostile-to-active}",         label: "a faction currently at war with active player" },
  { token: "{location:active-capital}",           label: "active player's capital" },
  { token: "{location:strategic-near-active}",    label: "nearest strategic Location to active player" },
  { token: "{location:contested}",                label: "a Location currently being contested" },
  { token: "{unit:strongest-active}",             label: "active player's strongest unit" },
  { token: "{unit:weakest-active}",               label: "active player's weakest unit" },
];

// ----- Main resolver -----

const TOKEN_RE = /\{(faction|location|unit):([a-z0-9-]+)\}/gi;

export function resolveTokens(state, text, ctx = {}) {
  if (typeof text !== "string" || text.indexOf("{") < 0) return text ?? "";
  return text.replace(TOKEN_RE, (match, kind, selector) => {
    const k = kind.toLowerCase();
    const s = selector.toLowerCase();
    try {
      if (k === "faction") return resolveFaction(state, s, ctx);
      if (k === "location") return resolveLocation(state, s, ctx);
      if (k === "unit") return resolveUnit(state, s, ctx);
    } catch {
      /* fall through to fallback */
    }
    return FALLBACK[k] ?? match;
  });
}

function resolveFaction(state, selector, ctx) {
  const fn = FACTION_SELECTORS[selector];
  if (!fn) return FALLBACK.faction;
  const fid = fn(state, ctx);
  return fid ? (factionName(fid) ?? FALLBACK.faction) : FALLBACK.faction;
}

function resolveLocation(state, selector, ctx) {
  const fn = LOCATION_SELECTORS[selector];
  if (!fn) return FALLBACK.location;
  const hexId = fn(state, ctx);
  if (!hexId) return FALLBACK.location;
  return locationName(state, hexId) ?? FALLBACK.location;
}

function resolveUnit(state, selector, ctx) {
  const fn = UNIT_SELECTORS[selector];
  if (!fn) return FALLBACK.unit;
  const unit = fn(state, ctx);
  return (unit?.name ?? unit?.uid) || FALLBACK.unit;
}

// ----- Lookup helpers -----

function factionName(fid) {
  const def = factionDef(fid) || FACTIONS[fid] || MINOR_FACTIONS[fid];
  return def?.name ?? fid;
}

function locationName(state, hexId) {
  const loc = state.locations?.[hexId];
  if (!loc) return null;
  return LOCATIONS[loc.locationId]?.name ?? loc.locationId;
}

// Standing matrix: `factionStanding[from][to]` is how `from` views `to`.
// "Lowest standing with active" = the faction `f` with the smallest
// `factionStanding[f][active]` — i.e. the one that likes active least.
function extremeStandingFid(state, kind) {
  const active = state.turnOrder?.[state.activeIndex];
  if (!active || !state.factionStanding) return null;
  let bestFid = null;
  let bestVal = kind === "low" ? Infinity : -Infinity;
  for (const fid of Object.keys(state.factionStanding)) {
    if (fid === active) continue;
    const v = state.factionStanding[fid]?.[active];
    if (v == null) continue;
    if (kind === "low" ? v < bestVal : v > bestVal) {
      bestVal = v;
      bestFid = fid;
    }
  }
  return bestFid;
}

function firstAtWarFid(state) {
  const active = state.turnOrder?.[state.activeIndex];
  if (!active) return null;
  for (const w of state.diplomacy?.wars ?? []) {
    if (w.a === active) return w.b;
    if (w.b === active) return w.a;
  }
  return null;
}

function capitalHexOf(state, fid) {
  for (const loc of Object.values(state.locations ?? {})) {
    if (loc.controller !== fid) continue;
    const hasCapital = (loc.chips ?? []).some(
      (uid) => state.chips?.[uid]?.chipId === "capital",
    );
    if (hasCapital) return loc.hexId;
  }
  return null;
}

function nearestStrategicLocation(state, fid) {
  // Distance from any of `fid`'s units. Prefer high/veryHigh strategic-value.
  const seeds = Object.values(state.units ?? {})
    .filter((u) => u.owner === fid && u.node)
    .map((u) => u.node);
  if (!seeds.length) return null;
  // Multi-source BFS by running once per seed and taking min — cheap enough
  // for the small demo board.
  let best = null;
  let bestDist = Infinity;
  for (const loc of Object.values(state.locations ?? {})) {
    if (loc.controller === fid) continue;
    const def = LOCATIONS[loc.locationId];
    if (!def || (def.strategicValue !== "high" && def.strategicValue !== "veryHigh")) continue;
    let d = Infinity;
    for (const seed of seeds) {
      const dist = bfsDistances(state.board.adjacency, seed)[loc.hexId];
      if (dist != null && dist < d) d = dist;
    }
    if (d < bestDist) {
      bestDist = d;
      best = loc.hexId;
    }
  }
  return best;
}

function firstContestedLocation(state) {
  // A Location is "contested" if a non-controller unit sits on it.
  for (const loc of Object.values(state.locations ?? {})) {
    const intruder = Object.values(state.units ?? {}).some(
      (u) => u.node === loc.hexId && u.owner && u.owner !== loc.controller,
    );
    if (intruder) return loc.hexId;
  }
  return null;
}

function extremeOwnedUnit(state, fid, kind) {
  if (!fid) return null;
  let best = null;
  let bestStr = kind === "max" ? -Infinity : Infinity;
  for (const u of Object.values(state.units ?? {})) {
    if (u.owner !== fid) continue;
    const s = u.strength ?? u.baseStrength ?? 0;
    if (kind === "max" ? s > bestStr : s < bestStr) {
      bestStr = s;
      best = u;
    }
  }
  return best;
}
