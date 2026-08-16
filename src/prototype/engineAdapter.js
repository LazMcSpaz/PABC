// Engine ↔ prototype-UI adapter. The engine speaks kebab-case ids and
// keeps unit position on the unit (state.units[uid].node); the prototype
// components expect camelCase ids and a reverse hex → unitId pointer.
// This module owns the translation in one place so the components stay
// shape-agnostic.

import { CONFIG } from "../game/config.js";
import { reinforcementRoute } from "../game/board.js";
import { takeAITurn } from "../game/ai.js";
import {
  LOCATIONS as ENGINE_LOCATIONS,
  CHIPS as ENGINE_CHIPS,
  ABILITIES as ENGINE_ABILITIES,
  chipDisplayName,
} from "../game/content.js";
import {
  buildableChips, upgradeOption, slotCapacity, slotsUsed, locationOutput,
} from "../game/economy.js";
import { recruitCapBonus } from "../game/actions.js";
import { isUnitVisibleTo } from "../game/visibility.js";
import { factionDef } from "../game/content.js";
import {
  recognitionScore, threatScore, tolerance, trustFloor, standingTier, getStanding,
  arePacted, atWar, vassalLord, coalitionAgainst, factionIds,
  aiAcceptsPact, aiAcceptsVassalage, wouldAccept, passesRepGates,
  evaluatePactCall, canDemandTribute, hasOpenBorders, warJustification,
  openBordersStanding,
} from "../game/diplomacy.js";
import { hasTechNode } from "../game/tech.js";
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
  "troop-carrier": "troopCarrier",
  "field-glass": "fieldGlass",
  "spotter-net": "spotterNet",
  "training-grounds": "trainingGrounds",
  "defense-turrets": "defenseTurrets",
  "logistics-hub": "logisticsHub",
  "recon-team": "reconTeam",
  "civic-hall": "civicHall",
  "burning-glass": "burningGlass",
  "guest-house": "guestHouse",
  "motor-pool": "motorPool",
  "field-medics": "fieldMedics",
  "entrenching-tools": "entrenchingTools",
  "cold-camp": "coldCamp",
  "night-march": "nightMarch",
  "war-banner": "warBanner",
  "old-hands": "oldHands",
  "safe-conduct": "safeConduct",
  "relay-kit": "relayKit",
};
const UI_TO_ENGINE_CHIP = Object.fromEntries(
  Object.entries(ENGINE_TO_UI_CHIP).map(([e, u]) => [u, e]),
);

export function engineLocationIdToUi(engineId) {
  return ENGINE_TO_UI_LOC[engineId] || engineId;
}

// The Location a faction currently holds its Capital chip on, as a UI
// locationId. Derived from live state rather than from a static table: the
// engine's faction registry (src/game/content.js) carries no `capital` field
// at all, so the old `def.capital` read was always undefined — which silently
// disabled the trading-pact route line on the map. Capitals also change hands
// when a start Location is captured, which a table could never track.
function capitalLocOf(state, fid) {
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== fid) continue;
    if ((loc.chips || []).some((c) => state.chips[c]?.chipId === "capital")) {
      return engineLocationIdToUi(loc.locationId);
    }
  }
  return null;
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
    // Backfill anything the UI table has never heard of. Adding a Location to
    // the engine and forgetting the UI row used to render a nameless city; now
    // it renders with engine-correct numbers and the content id as its name
    // until someone writes a nicer one.
    if (!UI_LOCATIONS[uiId]) {
      UI_LOCATIONS[uiId] = { id: uiId, name: def.name || uiId, ability: null };
    }
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

// §AI replay — run one AI turn and hand the UI exactly what it needs to
// replay it: the pre-turn unit positions + owners (the deferred-display
// baseline) and the slice of events the turn emitted. The engine stays
// synchronous; the cinematics are the caller's job (useAIReplay). The slice
// contract — `events === state.log.slice(preTurnLogLen)` — is asserted by the
// headless harness, the one engine-touching surface of this feature.
export function runAITurnWithReplay(state) {
  const preTurnLogLen = state.log.length;
  const positions = {};
  const owners = {};
  for (const u of Object.values(state.units)) {
    positions[u.uid] = u.node;
    owners[u.uid] = u.owner;
  }
  takeAITurn(state);
  return { events: state.log.slice(preTurnLogLen), positions, owners, preTurnLogLen };
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
    case "MODIFY_STAT":
      return `give a stationed unit ${e.amount >= 0 ? "+" : ""}${e.amount} ${e.stat}${e.duration === "this_turn" ? " this turn" : ""}`;
    case "MOVE_CARD":
      return "draw a Reactive card";
    case "DISABLE_CHIP":
      return "disable an enemy chip until your next turn";
    case "STRIP_CHIP":
      return "rip a chip off an enemy unit here (drops as loot)";
    case "GRANT_CHIP":
      return e.pool === "reward" ? "dig up a random reward chip" : "grant a chip";
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

  // §19 — the adapter now serves ONLY the viewing player's fog. `viewer` is
  // the human faction; `vis` is its per-faction visibility (or null in any
  // pre-fog/headless path, in which case everything is shown — back-compat).
  const viewer = state.humanFactionId;
  const vis = viewer ? state.visibility?.[viewer] : null;
  const fogOf = (id) =>
    !vis ? "visible" : vis.visible.has(id) ? "visible" : vis.explored.has(id) ? "explored" : "unexplored";
  // A unit is shown only if the viewer can actually see it (live sight +
  // concealment/detection); own units always show. Hidden enemies are
  // omitted entirely — the human reads the same fog the AI does.
  const canSeeUnit = (u) => !vis || isUnitVisibleTo(state, viewer, u);

  // hex → ordered list of VISIBLE unit uids. Multiple tokens render per hex
  // (arc slots). The human's units come first so the player's own unit
  // takes the prime slot and is what the Inspector's Contest path keys off.
  const unitsByHex = {};
  for (const u of Object.values(state.units)) {
    if (!canSeeUnit(u)) continue;
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
    if (!canSeeUnit(u)) continue; // §19 — don't leak hidden enemies to the UI
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

  const zoc = state.world?.zoc || {};
  const hexes = {};
  for (const h of Object.values(state.board.hexes)) {
    const fog = fogOf(h.id);
    const live = fog === "visible";
    const mem = vis?.memory?.[h.id] || null;
    const hex = {
      id: h.id,
      type: h.type,
      row: h.row,
      col: h.col,
      // §19 three-state fog: "visible" | "explored" | "unexplored".
      fog,
      // §19.4 terrain features (known once explored) — drive LoS + UI texture.
      elevation: fog === "unexplored" ? false : !!h.elevation,
      cover: fog === "unexplored" ? false : !!h.cover,
      // §16.2 road modifier (movement only) — shown once the hex is explored.
      road: fog === "unexplored" ? false : !!h.road,
      // Rail runs over the same hexes; the board draws it as its own network.
      rail: fog === "unexplored" ? false : !!h.rail,
      // §18.3 ZoC — only where the viewer has live sight (it's live info).
      // `zocForeign` marks another faction's ground; `zocTrespassing` means
      // one of the VIEWER's units is standing on it right now (the border
      // renders hotter as the "you are trespassing" cue).
      zocOwner: live ? zoc[h.id] || null : null,
      zocForeign: live && !!zoc[h.id] && zoc[h.id] !== viewer,
      zocTrespassing: live && !!zoc[h.id] && zoc[h.id] !== viewer
        && (unitIdsAt[h.id] || []).some((uid) => state.units[uid]?.owner === viewer),
    };
    // Live unit tokens only on visible hexes.
    if (live && unitAt[h.id]) hex.unitId = unitAt[h.id];
    if (live && unitIdsAt[h.id]) hex.unitIds = unitIdsAt[h.id];
    // §19.2 ghosts — dimmed last-known enemy markers on explored-but-not-
    // visible hexes, read from the viewer's frozen memory snapshot.
    if (!live && mem?.ghosts?.length) {
      hex.ghosts = mem.ghosts.map((g) => ({
        owner: g.owner, strength: g.strength, round: g.round, stale: true, false: !!g.false,
      }));
    }
    // Blockades (rail doc §3). Live sight only — a fortification is not
    // concealed the way a listening post is, but it can still be built or torn
    // down behind your back, so a remembered one would be a lie. A site under
    // construction reports `done: false` so the board can show it as scaffolding
    // rather than as something that already stops you.
    const bl = live ? state.world?.blockades?.[h.id] : null;
    if (bl) {
      hex.blockade = {
        owner: bl.owner,
        done: !!bl.done,
        progress: bl.progress || 0,
        cost: bl.cost,
      };
    }
    const loot = state.hexLoot?.[h.id];
    if (live && loot?.length) {
      hex.loot = loot.length;
      hex.lootChips = loot.map((uid) => engineChipIdToUi(state.chips[uid]?.chipId));
    }
    if (h.type === "location" && fog !== "unexplored") {
      const loc = state.locations[h.id];
      hex.locationId = engineLocationIdToUi(loc.locationId);
      hex.engineLocationId = loc.locationId;
      if (live) {
        // Visible — real-time truth (§19.2).
        hex.control = {
          sections: [...loc.sections],
          loyalty: loc.loyalty,
          loyaltyMax: CONFIG.loyalty.ceiling,
          loyaltyDanger: loc.loyalty != null && loc.loyalty <= CONFIG.loyalty.dangerThreshold,
          chips: adaptChips(state, loc.chips),
          chipUids: [...loc.chips],
          chipSlots: loc.chipSlots,
          abilityId: loc.abilityId,
          ability: loc.abilityId ? describeAbility(loc.abilityId) : null,
          abilityUsedThisTurn:
            loc.abilityActivatedTurn === state.round * state.turnOrder.length + state.activeIndex,
        };
        hex.garrison = loc.garrison;
        hex.production = loc.production;
        hex.abilityId = loc.abilityId;
        hex.controller = loc.controller;
        hex.economy = loc.controller ? adaptEconomy(state, loc) : null;
      } else {
        // Explored — LAST-KNOWN snapshot only (§19.2); dimmed, possibly stale.
        // Build is the controller's private business — never shown when fogged.
        const ml = mem?.location || {};
        hex.stale = true;
        hex.control = {
          sections: ml.sections ? [...ml.sections] : [...loc.sections].map(() => "neutral"),
          loyalty: ml.loyalty ?? null,
          loyaltyMax: CONFIG.loyalty.ceiling,
          loyaltyDanger: false,
          chips: [],
          chipUids: [],
          chipSlots: loc.chipSlots,
          abilityId: null,
          ability: null,
          abilityUsedThisTurn: false,
        };
        hex.garrison = ml.garrison ?? null;
        hex.production = null;
        hex.controller = ml.controller ?? null;
        hex.economy = null;
      }
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
      // Per-entity actions: the HUD dial aggregates what this faction can
      // still DO — every unit/Location action left plus wildcards. Max is
      // the same census at full refresh.
      actions: (() => {
        const unitActs = Object.values(state.units).filter((u) => u.owner === p.id);
        const locActs = Object.values(state.locations).filter((l) => l.controller === p.id);
        const remaining = p.actions.remaining +
          unitActs.reduce((n, u) => n + (u.actionsRemaining ?? 0), 0) +
          locActs.reduce((n, l) => n + (l.actionsRemaining ?? 0), 0);
        return { remaining, max: p.actions.remaining + unitActs.length + locActs.length };
      })(),
      unitCap: CONFIG.baseUnitCap + recruitCapBonus(state, pid),
      isAI: !!p.isAI,
      isMinor: !!p.isMinor,
      hand: [...p.hand],
      handChips: adaptChipsWithUids(state, p.hand),
      // §18.5 global reputations (public).
      menace: p.menace || 0,
      honor: p.honor == null ? CONFIG.diplomacy.honor.start : p.honor,
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
    // §18.3 / §19 — the ZoC owner map, FOGGED to where the viewer has live
    // sight (ZoC is live info), and the viewer's OWN Influence field only.
    zoc: vis
      ? Object.fromEntries(Object.entries(zoc).filter(([h]) => vis.visible.has(h)))
      : { ...zoc },
    influence: viewer ? { [viewer]: state.world?.influence?.[viewer] || {} } : (state.world?.influence || {}),
    // §19 — the viewer's fog summary, for HUD legends / minimap.
    fog: vis
      ? { explored: [...vis.explored], visible: [...vis.visible] }
      : null,
    // §18 — the political layer for the Diplomacy screen. Standing &
    // reputation are PUBLIC (fog limits positions, not politics).
    diplomacy: adaptDiplomacy(state, viewer),
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
      name: chipDisplayName(o.chipId, loc.controller),
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
        name: chipDisplayName(opt.chipId, loc.controller),
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
          name: chipDisplayName(ab.chipId, loc.controller),
          cost: ab.cost,
          progress: loc.buildProgress || 0,
          remaining: Math.max(0, ab.cost - (loc.buildProgress || 0)),
        }
      : null,
    buildMenu,
    upgrades,
  };
}

// §18 — the Diplomacy screen view from `viewer`'s seat: its global
// reputations + Recognition progress, and a row per other faction with
// Standing, relation, the derived gates, and a courtship hint.
function adaptDiplomacy(state, viewer) {
  if (!state.diplomacy || !viewer) return null;
  const dip = state.diplomacy;
  const me = state.players[viewer];
  const rec = recognitionScore(state, viewer);
  const spyRing = hasTechNode(state, viewer, "int-b1");
  const factions = factionIds(state).filter((f) => f !== viewer).map((f) => {
    const def = factionDef(f) || {};
    const sToward = getStanding(state, f, viewer); // their Standing toward you
    const sFrom = getStanding(state, viewer, f); // yours toward them
    const vof = vassalLord(state, f);
    const tol = tolerance(state, f, viewer); // their Menace tolerance of you
    const floor = trustFloor(state, f); // Honor they require
    const myMenace = me?.menace || 0;
    const myHonor = me?.honor ?? CONFIG.diplomacy.honor.start;
    const tier = standingTier(sToward);
    return {
      id: f,
      name: def.name || f,
      // Public scoreboard — VP is common knowledge (the race is visible
      // even when the map is not). Null for factions with no player seat.
      vp: state.players[f]?.vp ?? null,
      color: def.color || "#888",
      tier: def.tier || "major",
      temperament: def.temperament,
      scope: def.scope,
      standing: sToward,
      standingTier: tier,
      yourStanding: sFrom,
      pacted: arePacted(state, f, viewer),
      atWar: atWar(state, f, viewer),
      vassalOfYou: vof === viewer,
      lordOfYou: vassalLord(state, viewer) === f,
      inCoalition: (coalitionAgainst(state, viewer)?.members || []).includes(f),
      menace: state.players[f]?.menace || 0,
      honor: state.players[f]?.honor ?? CONFIG.diplomacy.honor.start,
      // Exact gate numbers are espionage product — Spy Ring (int-b1) only.
      // The anonymised markers below stay public (coarse read, no numbers).
      tolerance: spyRing ? Math.round(tol * 10) / 10 : null,
      trustFloor: spyRing ? Math.round(floor * 10) / 10 : null,
      threat: Math.round(threatScore(state, f) * 10) / 10,
      wants: factionWants(def),
      // §3.2 — plain-English sentiment, derived from tier + reputation
      // extremes. Used on the landing row + faction detail header.
      sentenceShort: shortSentence(tier, myMenace, tol, myHonor, floor),
      sentenceLong: longSentence(def, tier, sToward, myMenace, tol, myHonor, floor),
      // Anonymised reputation bars — 0..1 markers for the UI to render
      // without showing raw numbers.
      menaceMarker: myMenace / Math.max(0.001, tol),         // 1.0 = at tolerance
      honorMarker: (myHonor - floor) / Math.max(0.001, 5 - floor), // 0 = at floor
      menaceBeyondTolerance: myMenace > tol,
      honorBelowFloor: myHonor < floor,
      // Their third-party agreements — gated by Spy Ring (§17.5 B1).
      thirdParty: spyRing ? thirdPartySummary(state, f, viewer) : null,
      // Their tech-wheel — also gated by Spy Ring.
      theirTechWheel: spyRing ? (state.players[f]?.techWheel || []) : null,
      // Available verbs against this faction, with reasons + outcome hints.
      verbs: availableVerbsAgainst(state, viewer, f),
      // Inbox + capital (for map binding).
      capital: capitalLocOf(state, f),
      // §5.3 trading-pact route status — read straight off the agreement
      // shape on `state.diplomacy.agreements` so the map can draw the
      // capital-to-capital line green (clear) or amber (suspended).
      tradingPact: findTradingPact(state, viewer, f),
      // §1.4 passive agreements (open-borders, allied-vision) — exposed
      // so the relationship panel can summarise active toggles.
      openBordersFromYou: hasOpenBorders(state, f, viewer), // they may transit your land
      openBordersFromThem: hasOpenBorders(state, viewer, f), // you may transit theirs
    };
  });
  return {
    youId: viewer,
    youCapital: capitalLocOf(state, viewer),
    menace: me?.menace || 0,
    honor: me?.honor ?? CONFIG.diplomacy.honor.start,
    threat: Math.round(threatScore(state, viewer) * 10) / 10,
    recognition: {
      score: rec.total,
      threshold: CONFIG.diplomacy.recognition.threshold,
      contributors: rec.contributors,
      met: rec.total >= CONFIG.diplomacy.recognition.threshold,
      // Per-faction backing checklist — WHO backs your claim and, for the
      // rest, a coarse why-not. Coarse status is common knowledge; the
      // precise numbers behind it (their exact Standing toward you, their
      // Menace tolerance / Honor floor) are Spy Ring product.
      backing: recognitionBacking(state, viewer, spyRing),
      // Summit VP already banked (first-time backers, once each per game).
      summits: [...(dip.recognizedEver?.[viewer] || [])],
      summitVp: CONFIG.diplomacy.recognition.summitVp,
    },
    coalitionAgainstYou: coalitionAgainst(state, viewer)?.members || null,
    factions,
    pacts: dip.pacts.map((p) => ({ a: p.a, b: p.b, vassal: !!p.vassal })),
    wars: dip.wars.map((w) => ({ a: w.a, b: w.b })),
    coalitions: dip.coalitions.map((c) => ({ target: c.target, members: c.members })),
    vassals: { ...dip.vassals },
    spyRing,
    // §3.2 — warring-pair picker for the Mediate pane. Only pairs
    // involving neither the viewer nor their vassal show.
    warringPairs: pickWarringPairs(state, viewer),
    // §1.8 — incoming pact-call inbox: AI allies calling you into their wars.
    // Each carries live accept/refuse consequence previews (computed off the
    // current state, not a stored snapshot — always honest).
    // Envoy audiences — AI warnings the player answers in a dialogue box.
    pendingWarnings: (dip.pendingWarnings || []).map((w) => ({
      id: w.id,
      kind: w.kind,
      from: w.from,
      fromName: w.from ? (factionDef(w.from)?.name || w.from) : null,
      temperament: w.temperament || null,
      reason: w.reason || null,
      threat: w.threat ?? null,
      placateScrap: CONFIG.diplomacy.warnings.placateScrap,
      canPlacate: (me?.resource || 0) >= CONFIG.diplomacy.warnings.placateScrap,
      defyStandingHit: CONFIG.diplomacy.warnings.defyStandingHit,
    })),
    pendingCalls: (dip.pendingCalls || []).map((c) => ({
      id: c.id,
      from: c.from, fromName: factionDef(c.from)?.name || c.from,
      target: c.target, targetName: factionDef(c.target)?.name || c.target,
      expiresOnRound: c.expiresOnRound,
      ifAccept: `Declare war on ${factionDef(c.target)?.name || c.target}`,
      ifRefuse: `−${CONFIG.diplomacy.pactCall.declineStandingHit} Standing with ${factionDef(c.from)?.name || c.from} · −${CONFIG.diplomacy.honor.breakLoss} Honor`,
    })),
  };
}

// Recognition checklist — one row per other faction, mirroring
// recognitionScore's gates exactly so the screen never lies about the
// score. Coarse `status`/`hint` are common knowledge; `detail` (exact
// Standing and gate numbers) rides only with the Spy Ring.
function recognitionBacking(state, viewer, spyRing) {
  const rc = CONFIG.diplomacy.recognition;
  const tiers = CONFIG.diplomacy.tiers;
  const me = state.players[viewer];
  const coal = coalitionAgainst(state, viewer);
  return factionIds(state).filter((f) => f !== viewer).map((f) => {
    const def = factionDef(f) || {};
    const s = getStanding(state, f, viewer);
    const isVassal = vassalLord(state, f) === viewer;
    const allied = arePacted(state, f, viewer) && standingTier(s) === "allied";
    const gatesPass = passesRepGates(state, f, viewer);
    let status, weight = 0, hint;
    if (coal && coal.members.includes(f)) {
      status = "coalition";
      hint = "Marches in the coalition against you — lends your claim nothing while it stands.";
    } else if (!gatesPass) {
      status = "blocked";
      hint = "Your reputation fails their gates — too much Menace for their tolerance, or your Honor sits below their floor.";
    } else if (isVassal) {
      status = "backs"; weight = rc.vassalWeight;
      hint = "Your vassal — full backing.";
    } else if (allied) {
      status = "backs"; weight = rc.alliedWeight;
      hint = "A sworn ally at Allied regard — backs your claim.";
    } else if (arePacted(state, f, viewer)) {
      status = "warming";
      hint = "Pacted, but their regard hasn't reached Allied yet.";
    } else {
      status = "cold";
      hint = "No pact — courtship hasn't begun.";
    }
    const detail = spyRing ? {
      standing: s,
      needStanding: tiers.allied,
      yourMenace: me?.menace || 0,
      theirTolerance: Math.round(tolerance(state, f, viewer) * 10) / 10,
      yourHonor: me?.honor ?? CONFIG.diplomacy.honor.start,
      theirFloor: Math.round(trustFloor(state, f) * 10) / 10,
    } : null;
    return { id: f, name: def.name || f, tier: def.tier || "major", status, weight, hint, detail };
  });
}

// Per-faction qualitative sentiment, modulated by reputation extremes.
function shortSentence(tier, menace, tol, honor, floor) {
  let base = {
    allied: "Looks on you as a trusted partner",
    friendly: "Welcomes your presence",
    neutral: "Tolerates you with caution",
    wary: "Watches you with suspicion",
    hostile: "Considers you an enemy",
  }[tier] || "Watches you";
  if (menace > tol) base += " — but your aggression unsettles them";
  if (honor < floor) base += " — but your broken word puts them on edge";
  return base + ".";
}
function longSentence(def, tier, standing, menace, tol, honor, floor) {
  const lines = [];
  switch (tier) {
    case "allied":
      lines.push(`The ${def.name || "faction"} treats you as a trusted partner — willing to back your plays and stand at your side.`);
      break;
    case "friendly":
      lines.push(`The ${def.name || "faction"} welcomes your presence. Doors open, deals get a fair hearing, and they'll listen when you ask.`);
      break;
    case "neutral":
      lines.push(`The ${def.name || "faction"} tolerates you with caution — businesslike, neither warm nor sharp.`);
      break;
    case "wary":
      lines.push(`The ${def.name || "faction"} watches you with suspicion. Asks come hard; favours come harder.`);
      break;
    case "hostile":
      lines.push(`The ${def.name || "faction"} considers you an enemy. Few words will move them; force usually speaks louder.`);
      break;
    default:
      lines.push(`The ${def.name || "faction"} watches you.`);
  }
  if (menace > tol) {
    lines.push("Your record of aggression is past what they can stomach — they expect you to come for them next.");
  } else if (menace > tol * 0.66) {
    lines.push("Your reputation for force is getting close to what they can tolerate.");
  }
  if (honor < floor) {
    lines.push("Your broken promises mean they will not trust your word — pacts and deals are off the table until that changes.");
  }
  switch (def.temperament) {
    case "warlord": lines.push("They respect a useful sword — name them a target and they'll listen."); break;
    case "pacifist": lines.push("They prize trade and clean hands — they'll favour an honest dealer."); break;
    case "opportunist": lines.push("They go with whoever is winning — show them you are, and they'll come around."); break;
    case "schemer": lines.push("They trade in leverage. Useful intel and well-placed allies cost less than gold here."); break;
    case "honorable": lines.push("They keep their word and expect the same. Promises matter; broken ones close the door."); break;
  }
  return lines.join(" ");
}

function thirdPartySummary(state, f, viewer) {
  const out = { pacts: [], wars: [] };
  for (const other of factionIds(state)) {
    if (other === f || other === viewer) continue;
    if (arePacted(state, f, other)) out.pacts.push(other);
    if (atWar(state, f, other)) out.wars.push(other);
  }
  return out;
}

function pickWarringPairs(state, viewer) {
  const seen = new Set();
  const pairs = [];
  for (const w of state.diplomacy.wars) {
    if (w.a === viewer || w.b === viewer) continue;
    const key = [w.a, w.b].sort().join("·");
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ a: w.a, b: w.b });
  }
  return pairs;
}

// §5.3 trading-pact route status — pluck the agreement off
// state.diplomacy.agreements and surface { active, suspended,
// suspendedRounds } so the map can draw the dotted line green or amber.
// Returns null when no trading-pact agreement exists between the two.
function findTradingPact(state, a, b) {
  const agrs = state.diplomacy?.agreements || [];
  for (const agr of agrs) {
    if (agr.type !== "trading-pact") continue;
    const ab = (agr.partyA === a && agr.partyB === b) || (agr.partyA === b && agr.partyB === a)
            || (agr.a === a && agr.b === b) || (agr.a === b && agr.b === a);
    if (!ab) continue;
    return {
      id: agr.id,
      active: !agr.suspended,
      suspended: !!agr.suspended,
      suspendedRounds: agr.suspendedRounds || 0,
      since: agr.since,
    };
  }
  return null;
}

// §4 — Hidden / Visible-disabled / Visible-enabled per (verb, target).
// Each verb returns { state, reason?, outcome? }. Hidden verbs are
// omitted from the list (the UI doesn't render them at all).
function availableVerbsAgainst(state, viewer, fid) {
  const me = state.players[viewer];
  const them = state.players[fid];
  const scrap = me?.resource || 0;
  const pacted = arePacted(state, viewer, fid);
  const war = atWar(state, viewer, fid);
  const myVassal = vassalLord(state, fid) === viewer;
  const myLord = vassalLord(state, viewer) === fid;
  const out = [];
  const def = factionDef(fid) || {};
  const D = CONFIG.diplomacy || {};
  const tier = standingTier(getStanding(state, fid, viewer));
  const myMenace = me?.menace || 0;
  const tol = tolerance(state, fid, viewer);
  const myHonor = me?.honor ?? D.honor?.start ?? 5;
  const floor = trustFloor(state, fid);

  // 1) Gift (always available, just gates affordability + clean rep).
  if (myLord) {
    // Hidden — gift to your own lord doesn't make sense (you owe them, this verb is for outsiders).
  } else if (myVassal) {
    // Hidden — vassal already pays into your bank.
  } else {
    if (scrap < 5) out.push({ verb: "gift", state: "disabled", reason: "Not enough scrap (need 5)." });
    else out.push({ verb: "gift", state: "enabled", outcome: "Costs you 5 scrap; raises their Standing toward you." });
  }

  // 2) Propose Pact
  if (!myLord && !myVassal && !pacted) {
    if (war) {
      out.push({ verb: "propose-pact", state: "disabled", reason: "You are at war." });
    } else if (aiAcceptsPact(state, fid, viewer)) {
      out.push({ verb: "propose-pact", state: "enabled", outcome: "Will likely accept." });
    } else {
      let reason = "They aren't ready for an alliance.";
      const stand = getStanding(state, fid, viewer);
      const req = D.pactStandingReq ?? 1;
      // Name the NUMBER, not the tier. A pact needs 6 while the Friendly tier
      // starts at 5, so "needs Friendly+ (currently Friendly)" is a sentence
      // that reads as a bug — the player can see they are Friendly.
      if (stand < req) {
        reason = `Their regard for you is ${stand >= 0 ? "+" : ""}${stand} (${tier}); a pact needs +${req}.`;
      }
      else if (!passesRepGates(state, fid, viewer)) {
        if (myMenace > tol) reason = "Your Menace is past their Tolerance.";
        else if (myHonor < floor) reason = "Your Honor is below their floor.";
        else reason = "Reputation gates closed.";
      }
      out.push({ verb: "propose-pact", state: "disabled", reason });
    }
  }

  // 3) Declare War (only when not already at war, not your lord/vassal, and they're engageable).
  if (!war && !myLord && !myVassal) {
    if (pacted) {
      out.push({ verb: "declare-war", state: "disabled", reason: "Break the pact first." });
    } else if (warJustification(state, viewer, fid)) {
      out.push({
        verb: "declare-war", state: "enabled",
        outcome: "JUSTIFIED — your grievance is on record. Fighting this war costs no Menace.",
      });
    } else {
      out.push({
        verb: "declare-war", state: "enabled",
        outcome: "UNPROVOKED — fighting them will raise your Menace. Denounce them first to declare a just war.",
      });
    }
  }

  // 4) Make Peace (only when at war).
  if (war) {
    out.push({ verb: "make-peace", state: "enabled", outcome: "End the war. They will accept if you've stopped pressing them." });
  }

  // 5) Sue for Peace (when at war, same engine call — kept distinct as a deal builder).
  // Pre-loaded with the peace promise + optional side terms. Same accept logic.
  if (war) {
    out.push({ verb: "sue-for-peace", state: "enabled", outcome: "Offer terms alongside the peace promise; they accept on terms they value." });
  }

  // 6) Custom Deal (propose-deal) — always available outside vassal relationships.
  if (!myLord && !myVassal) {
    out.push({ verb: "propose-deal", state: "enabled", outcome: "They accept deals where your offer outweighs your ask." });
  }

  // 7) Demand Tribute — engine gates on a power ratio; refusal stains
  // your Honor and may auto-declare war.
  if (!myLord && !myVassal && !pacted) {
    if (canDemandTribute(state, viewer, fid)) {
      out.push({ verb: "demand-tribute", state: "enabled", outcome: "Strong enough to coerce — they likely cave; refusal stains your Honor." });
    } else {
      out.push({ verb: "demand-tribute", state: "disabled", reason: "Not strong enough to coerce them." });
    }
  }

  // 8) Vassalize (engine handles eligibility; UI shows disabled with reason).
  // A pacted faction that would ACCEPT still shows the verb — patronage's
  // ally → protectorate upgrade is the peaceful road to a vassal.
  if (!myLord && !myVassal) {
    if (aiAcceptsVassalage(state, fid, viewer)) {
      const cornered = atWar(state, fid, viewer)
        || getStanding(state, fid, viewer) <= CONFIG.diplomacy.tiers.wary;
      out.push({
        verb: "vassalize", state: "enabled",
        outcome: cornered ? "They will accept submission." : "They would welcome your protection.",
      });
    } else if (!pacted) {
      out.push({ verb: "vassalize", state: "disabled", reason: "They will not submit." });
    }
  }

  // 9) Free Vassal (only when this faction is your vassal).
  if (myVassal) {
    out.push({ verb: "free-vassal", state: "enabled", outcome: "Release them. Honor rises; you lose their tribute." });
  }

  // 10) Denounce — public condemnation; visible whenever you have any standing with them.
  if (!myLord && !myVassal) {
    out.push({ verb: "denounce", state: "enabled", outcome: "Standing falls on both sides; you take an Honor hit but signal allies." });
  }

  // 11) Mediate — surfaced from the warring-pair list; this verb is for the action pane.
  out.push({ verb: "mediate", state: "enabled", outcome: "Open the mediation pane and choose a warring pair to broker peace between." });

  // 12) Pact Call (outgoing) — only meaningful when you're at war with someone AND have a pact with them.
  if (pacted) {
    // Need at least one war the ally could join.
    const myWars = factionIds(state).filter((t) => t !== viewer && t !== fid && atWar(state, viewer, t));
    if (myWars.length > 0) {
      // Use evaluatePactCall against each candidate target to give the
      // best-case outcome hint without committing to a target yet.
      const wouldHonor = myWars.some((t) => evaluatePactCall(state, fid, viewer, t).honor);
      out.push({
        verb: "pact-call",
        state: "enabled",
        outcome: wouldHonor
          ? "Will likely honor against at least one of your wars."
          : "May refuse — their loyalty or fear of the target is low.",
      });
    } else {
      out.push({ verb: "pact-call", state: "disabled", reason: "You have no active wars to call them into." });
    }
  }

  // 13) Trading Pact (§6) — needs Neutral+ both ways, rep gates, and a
  // capital-to-capital route. Engine returns specific reasons; we only
  // surface the common ones here.
  const tradingActive = findTradingPact(state, viewer, fid);
  if (!myLord && !myVassal && !war) {
    if (tradingActive) {
      out.push({
        verb: "dissolve-trading-pact",
        state: "enabled",
        outcome: "Closes the trade route. You and they lose the per-round scrap and the permanent Research floor is kept.",
      });
    } else {
      const standOK = getStanding(state, viewer, fid) >= (D.tiers?.neutral ?? 0)
                   && getStanding(state, fid, viewer) >= (D.tiers?.neutral ?? 0);
      if (!standOK) {
        out.push({ verb: "trading-pact", state: "disabled", reason: "Standing needs Neutral+ on both sides." });
      } else if (!passesRepGates(state, fid, viewer)) {
        const why = myMenace > tol ? "Your Menace is past their Tolerance."
                  : myHonor < floor ? "Your Honor is below their floor."
                  : "Reputation gates closed.";
        out.push({ verb: "trading-pact", state: "disabled", reason: why });
      } else {
        out.push({ verb: "trading-pact", state: "enabled", outcome: "Opens a route between your capitals — per-round scrap each side + a permanent Research floor." });
      }
    }
  }

  // 14) Open Borders + Allied Vision passive toggles.
  if (!myLord && !myVassal && !war) {
    // Ask the engine for the same verdict it will give when the button is
    // pressed, rather than offering the verb unconditionally and letting it
    // fail. The gate is MUTUAL, and the drawer only shows one direction, so an
    // unexplained refusal here looked like a bug in the standing tiers.
    const ob = openBordersStanding(state, viewer, fid);
    out.push(ob.ok
      ? {
        verb: "set-open-borders",
        state: "enabled",
        outcome: "Opens both territories to each other's units while it stands.",
      }
      : {
        verb: "set-open-borders",
        state: "disabled",
        reason: `${ob.reason.charAt(0).toUpperCase()}${ob.reason.slice(1)}.`,
      });
    out.push({
      verb: "toggle-open-borders",
      state: "enabled",
      outcome: "Toggle the current open-borders agreement on or off from your side.",
    });
  }
  if (pacted) {
    out.push({
      verb: "toggle-allied-vision",
      state: "enabled",
      outcome: "Toggle sharing line-of-sight with the ally on or off.",
    });
  }

  return out;
}

// §18.8 — what a faction values, surfaced as a courtship hint.
function factionWants(def) {
  switch (def.temperament) {
    case "warlord": return "joint wars & targets";
    case "pacifist": return "trade routes, open borders, your Honor";
    case "opportunist": return "back the leader — routes & favourable deals";
    case "schemer": return "intel, leverage, useful allies";
    case "honorable": return "honest dealings & a clean record";
    default: return "good relations";
  }
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

// previewAttackerStrength / previewLocationContest now live in
// contest.js (the engine owns the math they mirror; the AI needs them
// too, not just this UI adapter) — re-exported here so Inspector.jsx /
// Prototype.jsx don't need to change their import path.
export { previewAttackerStrength, previewLocationContest } from "../game/contest.js";
