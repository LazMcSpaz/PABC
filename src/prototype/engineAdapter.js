// Engine ↔ prototype-UI adapter. The engine speaks kebab-case ids and
// keeps unit position on the unit (state.units[uid].node); the prototype
// components expect camelCase ids and a reverse hex → unitId pointer.
// This module owns the translation in one place so the components stay
// shape-agnostic.

import { CONFIG } from "../game/config.js";
import { reinforcementRoute } from "../game/board.js";
import {
  LOCATIONS as ENGINE_LOCATIONS,
  CHIPS as ENGINE_CHIPS,
  ABILITIES as ENGINE_ABILITIES,
} from "../game/content.js";
import {
  buildableChips, upgradeOption, slotCapacity, slotsUsed, locationOutput,
} from "../game/economy.js";
import {
  LOCATIONS as UI_LOCATIONS,
  UNIT_UPGRADES,
  LOCATION_UPGRADES,
  ALL_UPGRADES,
} from "./data.js";

// --- id translation (engine kebab-case ↔ UI camelCase) --------------

const ENGINE_TO_UI_LOC = {
  "the-shelf": "theShelf",
  "tin-town": "tinTown",
};
const ENGINE_TO_UI_CHIP = {
  "sharpened-blades": "sharpenedBlades",
  "drilled-troops": "drilledTroops",
  "training-grounds": "trainingGrounds",
  "defense-turrets": "defenseTurrets",
  "logistics-hub": "logisticsHub",
  "town-hall": "townHall",
  "recon-team": "reconTeam",
};
const UI_TO_ENGINE_CHIP = Object.fromEntries(
  Object.entries(ENGINE_TO_UI_CHIP).map(([e, u]) => [u, e]),
);

export function engineLocationIdToUi(engineId) {
  return ENGINE_TO_UI_LOC[engineId] || engineId;
}
export function engineChipIdToUi(engineId) {
  return ENGINE_TO_UI_CHIP[engineId] || engineId;
}
export function uiChipIdToEngine(uiId) {
  return UI_TO_ENGINE_CHIP[uiId] || uiId;
}

// --- one-time sync: align UI display constants with engine reality ---
//
// The look-pass mock chose vp/garrison/chipSlots numbers that didn't
// match the engine. The engine is the source of truth at runtime, so
// patch the UI tables once at module load so static lookups (UI's
// `garrisonBreakdown`, `locationProduction`, etc.) read engine-correct
// values. Without this, displayed garrison strengths would be wrong.
let synced = false;
export function ensureUiConstantsSynced() {
  if (synced) return;
  synced = true;

  for (const [engineId, def] of Object.entries(ENGINE_LOCATIONS)) {
    const uiId = engineLocationIdToUi(engineId);
    const uiDef = UI_LOCATIONS[uiId];
    if (!uiDef) continue;
    uiDef.garrison = CONFIG.garrisonByValue[def.strategicValue] ?? uiDef.garrison;
    uiDef.chipSlots = CONFIG.chipSlotsByValue[def.strategicValue] ?? uiDef.chipSlots;
    uiDef.vp = def.vpReward ?? uiDef.vp;
    // engine production is a range [min,max] — show the midpoint
    if (Array.isArray(def.production)) {
      uiDef.production = Math.round((def.production[0] + def.production[1]) / 2);
    }
  }

  // Labs / Recon Team / others missing from the UI palette — add lookup
  // entries so the Chip component can render them. Effect strings copied
  // from content.js descs.
  const ensureChip = (id, defaults) => {
    if (UNIT_UPGRADES[id] || LOCATION_UPGRADES[id] || ALL_UPGRADES[id]) return;
    LOCATION_UPGRADES[id] = { id, ...defaults };
    ALL_UPGRADES[id] = LOCATION_UPGRADES[id];
  };
  ensureChip("labs", {
    name: "Labs", kind: "location", cost: ENGINE_CHIPS.labs?.cost ?? 3,
    short: "+1 Tech / turn",
    effect: ENGINE_CHIPS.labs?.desc ?? "+1 Tech score",
  });
}

// --- state shape adaptation -----------------------------------------

// Build the `rows: [[hexId, …]]` layout from engine hex coordinates.
function buildRows(state) {
  const byRow = {};
  for (const h of Object.values(state.board.hexes)) {
    (byRow[h.row] ||= []).push(h);
  }
  return Object.keys(byRow)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => byRow[r].sort((a, b) => a.col - b.col).map((h) => h.id));
}

function adaptChips(state, chipUids) {
  return (chipUids || []).map((uid) => engineChipIdToUi(state.chips[uid]?.chipId));
}

// Build a human-readable description of an engine ability from its
// actual cost + effects, so the UI shows what the Location really does
// (the look-pass data.js carried unrelated placeholder flavour).
function describeEffectShort(e) {
  switch (e.type) {
    case "GRANT_ACTIONS":
      return `gain ${e.amount} Action${Math.abs(e.amount) === 1 ? "" : "s"}${
        e.when === "next_turn" ? " next turn" : ""
      }`;
    case "ADJUST_RESOURCE": {
      const res = e.resource === "Resource" ? "scrap" : e.resource;
      return `${e.amount >= 0 ? "gain" : "lose"} ${Math.abs(e.amount)} ${res}`;
    }
    case "ADJUST_TRACK":
      return `${e.amount >= 0 ? "+" : ""}${e.amount} ${e.track}`;
    default:
      return e.type;
  }
}

export function describeAbility(abilityId) {
  const ability = ENGINE_ABILITIES[abilityId];
  if (!ability) return null;
  const opt = ability.activated?.[0];
  if (!opt) return { name: ability.name, text: "Passive ability." };
  const costParts = [];
  if (opt.cost?.action) costParts.push(`${opt.cost.action} Action`);
  if (opt.cost?.resource) costParts.push(`${opt.cost.resource} scrap`);
  const costPhrase = costParts.length ? `Spend ${costParts.join(" + ")} to ` : "";
  const effPhrase = (opt.effects || []).map(describeEffectShort).join(", ") || "act";
  const sentence = costPhrase
    ? `${costPhrase}${effPhrase}.`
    : `${effPhrase.charAt(0).toUpperCase()}${effPhrase.slice(1)}.`;
  return { name: ability.name, text: `${sentence} Once per turn.` };
}

function adaptChipsWithUids(state, chipUids) {
  return (chipUids || []).map((uid) => ({
    uid,
    chipId: engineChipIdToUi(state.chips[uid]?.chipId),
  }));
}

function turnOrdinal(state) {
  return state.round * state.turnOrder.length + state.activeIndex;
}

function isImmobilized(state, unit) {
  if (unit.immobilizedUntil == null) return false;
  return turnOrdinal(state) <= unit.immobilizedUntil;
}

export function adaptState(state) {
  ensureUiConstantsSynced();

  // hex → ordered list of unit uids. Multiple tokens render per hex (in
  // arc slots), so we keep the full list. The human's units come first
  // so the player's own unit takes the prime slot and is what the
  // Inspector's single-unit Contest path keys off.
  const unitsByHex = {};
  for (const u of Object.values(state.units)) {
    (unitsByHex[u.node] ||= []).push(u);
  }
  const unitIdsAt = {};
  const unitAt = {};
  for (const [node, list] of Object.entries(unitsByHex)) {
    const ordered = [...list].sort((a, b) => {
      const am = a.owner === state.humanFactionId ? 0 : 1;
      const bm = b.owner === state.humanFactionId ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.uid < b.uid ? -1 : 1; // stable
    });
    unitIdsAt[node] = ordered.map((u) => u.uid);
    unitAt[node] = ordered[0].uid;
  }

  const units = {};
  for (const u of Object.values(state.units)) {
    units[u.uid] = {
      id: u.uid,
      uid: u.uid,
      owner: u.owner,
      name: u.name,
      // Use base stats here so UI's unitEffective() can re-derive deltas
      // from the chip list.
      strength: u.baseStrength,
      movement: u.baseMovement,
      effectiveStrength: u.strength,
      effectiveMovement: u.movement,
      moveRemaining: u.moveRemaining ?? u.movement,
      fortified: !!u.fortified,
      veteran: !!u.veteran,
      chips: adaptChips(state, u.chips),
      chipUids: [...u.chips],
      immobilized: isImmobilized(state, u),
      node: u.node,
    };
  }

  const hexes = {};
  for (const h of Object.values(state.board.hexes)) {
    const hex = {
      id: h.id,
      type: h.type,
      row: h.row,
      col: h.col,
    };
    if (unitAt[h.id]) hex.unitId = unitAt[h.id];
    if (unitIdsAt[h.id]) hex.unitIds = unitIdsAt[h.id];
    const loot = state.hexLoot?.[h.id];
    if (loot?.length) {
      hex.loot = loot.length;
      hex.lootChips = loot.map((uid) => engineChipIdToUi(state.chips[uid]?.chipId));
    }
    if (h.type === "location") {
      const loc = state.locations[h.id];
      hex.locationId = engineLocationIdToUi(loc.locationId);
      hex.engineLocationId = loc.locationId;
      hex.control = {
        sections: [...loc.sections],
        // §18.2 Loyalty — the 8-slice centre pie (replaces foothold/decay).
        // `loyalty` is null until a player holds full Control; `loyaltyDanger`
        // mirrors the engine's `loyalty_failing` threshold so the UI can warn
        // before any Control peels.
        loyalty: loc.loyalty,
        loyaltyMax: CONFIG.loyalty.ceiling,
        loyaltyDanger:
          loc.loyalty != null && loc.loyalty <= CONFIG.loyalty.dangerThreshold,
        chips: adaptChips(state, loc.chips),
        chipUids: [...loc.chips],
        // Engine-derived: the ability eats one base slot, so this is
        // lower than the UI's static LOCATIONS[id].chipSlots whenever
        // a Location carries an ability (§6.3).
        chipSlots: loc.chipSlots,
        abilityId: loc.abilityId,
        ability: loc.abilityId ? describeAbility(loc.abilityId) : null,
        abilityUsedThisTurn:
          loc.abilityActivatedTurn === state.round * state.turnOrder.length + state.activeIndex,
      };
      hex.garrison = loc.garrison; // engine's live garrison (incl. capital bonus)
      hex.production = loc.production;
      hex.abilityId = loc.abilityId;
      hex.controller = loc.controller;
      // §20 Economy & City Development — Output, the guns/butter slider, the
      // active build, and the §20.6 build menu / upgrade view sets. Computed
      // only for Locations the controller fully holds (build is theirs alone).
      hex.economy = loc.controller ? adaptEconomy(state, loc) : null;
    }
    hexes[h.id] = hex;
  }

  const players = {};
  for (const [pid, p] of Object.entries(state.players)) {
    players[pid] = {
      id: pid,
      scrap: p.resource,
      vp: p.vp,
      // §17 Tech Wheel
      research: p.research || 0,
      techLevel: p.techLevel || 1,
      techWheel: [...(p.techWheel || [])],
      abilityPointsAvailable: (p.techLevel || 1) - 1 - (p.techWheel?.length || 0),
      actions: { ...p.actions },
      unitCap: CONFIG.baseUnitCap + countTrainingGrounds(state, pid),
      isAI: !!p.isAI,
      hand: [...p.hand],
      handChips: adaptChipsWithUids(state, p.hand),
    };
  }

  // §20.2 — the Market is retired; there is no shared chip catalogue to
  // surface. Chips are built per-Location (see hex.economy above).

  return {
    round: state.round,
    phase: state.phase,
    youId: state.humanFactionId,
    activeId: state.turnOrder[state.activeIndex],
    vpGoal: CONFIG.vpThreshold,
    techThresholds: [...CONFIG.tech.researchThresholds],
    maxTechLevel: CONFIG.tech.maxLevel,
    players,
    units,
    hexes,
    rows: buildRows(state),
    winnerId: state.winnerId,
    // v0.2 §16.5 — in-transit field reinforcements, for board overlay /
    // unit panel ETA display.
    reinforcements: (state.reinforcements || []).map((r) => ({ ...r })),
    // Surface the raw engine state so Phase-4 action handlers can reach
    // engine APIs without re-deriving everything.
    engineState: state,
  };
}

// §20 — the per-Location economy view: Output, the guns/butter slider, the
// active build, and the §20.6 DISPLAY-CONTRACT sets. APPEND-ONLY exposure.
//   buildMenu  — only Tech-allowed chips; Loyalty-locked ones carry `locked`
//                + `reason` (Tech-forbidden chips are omitted entirely).
//   upgrades   — keyed by installed chip uid: ALWAYS the next tier if one
//                exists, `locked` when EITHER Tech or Loyalty is short.
function adaptEconomy(state, loc) {
  const cap = slotCapacity(loc);
  const used = slotsUsed(state, loc.chips);
  const ab = loc.activeBuild;

  const buildMenu = buildableChips(state, loc).map((o) => {
    const fits = o.def.kind === "unit"
      ? hasStationedUnitWithBay(state, loc, o.def.slots || 1)
      : used + (o.def.slots || 1) <= cap;
    return {
      chipId: o.chipId,
      uiChipId: engineChipIdToUi(o.chipId),
      name: o.def.name,
      kind: o.def.kind,
      cost: o.def.buildCost ?? o.def.cost ?? 0,
      slots: o.def.slots || 1,
      desc: o.def.desc || "",
      locked: o.locked,
      reason: o.locked ? o.reason : (!fits ? (o.def.kind === "unit" ? "no unit stationed here" : "no free slot") : null),
      buildable: !o.locked && fits,
    };
  });

  const upgrades = {};
  const collect = (chipUid) => {
    const opt = upgradeOption(state, loc, chipUid);
    if (opt) {
      upgrades[chipUid] = {
        chipId: opt.chipId,
        uiChipId: engineChipIdToUi(opt.chipId),
        name: opt.def.name,
        cost: opt.def.buildCost ?? opt.def.cost ?? 0,
        desc: opt.def.desc || "",
        locked: opt.locked,
        reason: opt.reason,
      };
    }
  };
  for (const c of loc.chips) collect(c);
  for (const u of Object.values(state.units)) {
    if (u.owner === loc.controller && u.node === loc.hexId) for (const c of u.chips) collect(c);
  }

  return {
    output: locationOutput(state, loc),
    slider: loc.buildSlider ?? 0,
    progress: loc.buildProgress || 0,
    slotCapacity: cap,
    slotsUsed: used,
    activeBuild: ab
      ? {
          kind: ab.kind,
          chipId: ab.chipId,
          uiChipId: engineChipIdToUi(ab.chipId),
          name: ENGINE_CHIPS[ab.chipId]?.name || ab.chipId,
          cost: ab.cost,
          progress: loc.buildProgress || 0,
          remaining: Math.max(0, ab.cost - (loc.buildProgress || 0)),
        }
      : null,
    buildMenu,
    upgrades,
  };
}

function hasStationedUnitWithBay(state, loc, slots) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== loc.controller || u.node !== loc.hexId) continue;
    if (slotsUsed(state, u.chips) + slots <= CONFIG.unit.baySlots) return true;
  }
  return false;
}

// v0.2 §16.5 — what a Reinforce action would cost/look like for `unitUid`
// right now: the scrap to top it up, whether an instant top-up is legal
// (unit on a fully-held Location), and the field-supply ETA in turns.
export function reinforcePreview(state, unitUid) {
  const unit = state.units[unitUid];
  if (!unit) return null;
  const cap = unit.veteran ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
  const deficit = cap - unit.baseStrength;
  const loc = state.locations[unit.node];
  const onFriendlyLoc = !!(loc && loc.controller === unit.owner);
  const route = deficit > 0 ? reinforcementRoute(state, unit.owner, unit.node) : null;
  return {
    deficit,
    cost: CONFIG.heal.scrapPerStrength * deficit,
    onFriendlyLoc,
    eta: route ? route.dist : null,
    canField: !!route,
  };
}

function countTrainingGrounds(state, pid) {
  let n = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) {
      if (state.chips[c]?.chipId === "training-grounds") n++;
    }
  }
  return n;
}

// Attacker-side preview: the combined Strength of `ownerId`'s stack on
// `hexId` plus its Concentration bonus — what the attacker brings before
// the d6. Mirrors contest.js (stackStrength + concentration).
export function previewAttackerStrength(state, hexId, ownerId) {
  let strength = 0;
  let n = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner !== ownerId || u.node !== hexId) continue;
    strength += u.strength;
    n += 1;
  }
  const concentration =
    Math.min(n - 1, CONFIG.combat.concentrationCap) * CONFIG.combat.concentrationPerUnit;
  return { strength, concentration, units: n, total: strength + concentration };
}

// Preview a Location contest's defender side exactly as contest.js would
// resolve it, so the UI shows the true number the attacker must beat —
// not just the bare garrison. Mirrors defenderValue() + the
// garrison-only no-die house rule.
export function previewLocationContest(state, hexId) {
  const loc = state.locations[hexId];
  if (!loc) return null;
  const hasNeutral = loc.sections.includes("neutral");
  let chipGarrison = 0;
  for (const c of loc.chips) {
    chipGarrison += ENGINE_CHIPS[state.chips[c]?.chipId]?.garrison || 0;
  }
  let value = loc.garrison + chipGarrison;

  // A defending unit only counts when the Location is fully held by its
  // controller (no neutral sections) and that controller has a unit on
  // the hex — same gate as contest.js defendingUnit().
  // Stacked defenders fight together: sum the controller's units on the
  // hex (the strongest is the "lead" for display / attrition).
  let defendingUnit = null;
  let defenderStack = 0;
  if (!hasNeutral && loc.controller) {
    for (const u of Object.values(state.units)) {
      if (u.owner !== loc.controller || u.node !== loc.hexId) continue;
      defenderStack += u.strength;
      if (!defendingUnit || u.strength > defendingUnit.strength) defendingUnit = u;
    }
    value += defenderStack;
  }

  // §16.6 combat levers on the defender side.
  const mountain =
    state.board.hexes[hexId]?.terrain === "mountain" ? CONFIG.combat.mountainDefenseBonus : 0;
  let concentration = 0, fortify = 0, veteran = 0;
  if (defendingUnit) {
    let n = 0;
    for (const u of Object.values(state.units)) {
      if (u.owner === loc.controller && u.node === hexId && u.uid !== defendingUnit.uid) n++;
    }
    concentration = Math.min(n, CONFIG.combat.concentrationCap) * CONFIG.combat.concentrationPerUnit;
    if (defendingUnit.fortified) fortify = CONFIG.combat.fortifyBonus;
    if (defendingUnit.veteran) veteran = CONFIG.combat.veteranBonus;
  }
  value += mountain + concentration + fortify + veteran;

  // House rule: a garrison-only defence (no defending unit) does NOT
  // roll a d6 — its total is the static value.
  const defenderRollsDie = !!defendingUnit;
  return {
    value,
    garrison: loc.garrison + chipGarrison,
    defendingUnit: defendingUnit
      ? { uid: defendingUnit.uid, owner: defendingUnit.owner, strength: defendingUnit.strength }
      : null,
    modifiers: {
      mountain, concentration, fortify, veteran,
      allies: defendingUnit ? defenderStack - defendingUnit.strength : 0,
    },
    hasNeutral,
    defenderRollsDie,
  };
}
