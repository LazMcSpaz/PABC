// Engine ↔ prototype-UI adapter. The engine speaks kebab-case ids and
// keeps unit position on the unit (state.units[uid].node); the prototype
// components expect camelCase ids and a reverse hex → unitId pointer.
// This module owns the translation in one place so the components stay
// shape-agnostic.

import { CONFIG } from "../game/config.js";
import { locationActionCapacity } from "../game/turn.js";
import { reinforcementRoute } from "../game/board.js";
import { takeAITurn } from "../game/ai.js";
import {
  LOCATIONS as ENGINE_LOCATIONS,
  CHIPS as ENGINE_CHIPS,
  ABILITIES as ENGINE_ABILITIES,
  chipDisplayName,
} from "../game/content.js";
import {
  buildableChips, upgradeOption, slotCapacity, slotsUsed, locationOutput, meetsTech,
  unitUpkeepFor, chipUpkeepFor, chipsHeldBy,
} from "../game/economy.js";
import { recruitCapBonus } from "../game/actions.js";
import { blockadeAt, blockadesOn, supplyStatus, blockadeSlotsUsed, blockadeIncome } from "../game/blockades.js";
import { supplyCutter } from "../game/movement.js";
import { postAt, isPostVisibleTo, ownedPosts } from "../game/posts.js";
import { isUnitVisibleTo } from "../game/visibility.js";
import { factionDef } from "../game/content.js";
import {
  threatScore, tolerance, trustFloor, standingTier, getStanding, standingReceipts,
  arePacted, atWar, vassalLord, coalitionAgainst, factionIds,
  aiAcceptsPact, aiAcceptsVassalage, aiAcceptsPeace, wouldAccept, passesRepGates,
  denounceCooldown, denounceWarrant, denounceGrounds, grievanceWeight, grievancesAgainst,
  reputationLog, settleableWeight, unitsInTerritory, ultimatumCooldown,
  dominionStanding, dominionCountdown,
  tradeRouteOpen,
  cedeableLocations, locationWorth,
  asksThisRound, flowRounds, promiseRounds,
  evaluatePactCall, canDemandTribute, hasOpenBorders, warJustification,
  openBordersStanding,
  railAccessStanding,
  hasRailAccess,
  // §5/§6 — posture and political capacity.
  postureOf, conditionText, isCourting, mayBeginCourtship, courtingList,
  positionsOf, positionText, positionKinds, citablePositions, positionBlocker,
  opsEnabled, exposableStrikes, lieDetectionChance, exposureApparatus,
  swayIncome, swayOf, swayLedger, canSustainCourtship,
} from "../game/diplomacy.js";
import { hasTechNode } from "../game/tech.js";
import { holderOf } from "../game/control.js";
import { pressureSource } from "../game/influence.js";
import {
  LOCATIONS as UI_LOCATIONS,
  UNIT_UPGRADES,
  LOCATION_UPGRADES,
  ALL_UPGRADES,
  resourceLabel,
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
// The hex a faction's Capital sits on — where the camera should open the
// game. Same live derivation as capitalLocOf, but returning the board key the
// geometry is indexed by rather than a UI location id. Falls back to the
// faction's first unit so a faction that has already lost its Capital (or a
// scenario that starts without one) still gets a sensible home view.
export function homeHexFor(state, fid) {
  for (const loc of Object.values(state.locations || {})) {
    if (loc.controller !== fid) continue;
    if ((loc.chips || []).some((c) => state.chips[c]?.chipId === "capital")) return loc.hexId;
  }
  for (const loc of Object.values(state.locations || {})) {
    if (loc.controller === fid) return loc.hexId;
  }
  for (const u of Object.values(state.units || {})) {
    if (u.owner === fid) return u.node;
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
    // The authored prose from content/locations.csv, folded into the engine
    // registry and carried across here so the Location window has something
    // to say about a place beyond its numbers.
    uiDef.flavour = def.flavour ?? uiDef.flavour ?? null;
    uiDef.basis = def.basis ?? uiDef.basis ?? null;
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

// What a chip list costs its owner each Upkeep (§20.9, and economy §8's count
// surcharge on top). One reader, so every place the UI quotes an upkeep quotes
// the same number the engine charges — the count surcharge is exactly the kind
// of cost that would otherwise appear only on the ledger, which is where a
// player stops trusting the numbers.
function chipUpkeep(state, chipUids, owner = null) {
  let n = 0;
  if (!owner) {
    for (const c of chipUids || []) n += ENGINE_CHIPS[state.chips[c]?.chipId]?.upkeep || 0;
    return n;
  }
  for (const c of chipUids || []) n += chipUpkeepFor(state, owner, c);
  return n;
}

// ECONOMY §8 — what ONE MORE chip would add to the round's bill, beyond
// whatever it authors itself. Zero until the free allowance is used up.
function marginalChipSurcharge(state, fid) {
  const cfg = CONFIG.economy;
  if (!fid || !cfg.perExtraChip || cfg.freeChips == null) return 0;
  return chipsHeldBy(state, fid).length >= cfg.freeChips ? cfg.perExtraChip : 0;
}

// A unit's FULL per-turn bill: its own keep (1, doubled once the bay is full)
// plus whatever its chips charge on top. A Landship-carrying unit pays for
// both the bay being full AND the chip, and the panel should say so.
function unitTotalUpkeep(state, u) {
  return unitUpkeepFor(state, u) + chipUpkeep(state, u.chips, u.owner);
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
      return `${e.amount >= 0 ? "gain" : "lose"} ${Math.abs(e.amount)} ${resourceLabel(e.resource)}`;
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
      // Standing armies eat — surfaced per unit so the bill is legible where
      // the unit is, not only as a lump sum at Upkeep.
      upkeep: unitTotalUpkeep(state, u),
      baseUpkeep: unitUpkeepFor(state, u),
      unsupplied: !!u.unsupplied,
      // Per-entity actions: does this unit still have its action? Only ever
      // answered for the viewer's own units — whether a rival has already
      // committed theirs is their turn's business, not something the board
      // should quietly hand over.
      canAct: u.owner === viewer ? (u.actionsRemaining ?? 0) > 0 : null,
      node: u.node,
    };
  }

  const zoc = state.world?.zoc || {};
  // §11 — the viewer's OWN raw Influence field. It has been computed nine
  // times a round and threaded to this file since the layer shipped, and
  // consumed by nothing: grep every .jsx and there was no heatmap, no readout,
  // no tooltip. Surfacing the number per hex is what makes the §4 dominance
  // cliff legible instead of mysterious — source under 6 dominates 1 hex, 6 to
  // just under 12 dominates 7, 12 or more dominates 19, and a player who
  // cannot see the field cannot see why 11 scrap of influence chips bought
  // them nothing.
  //
  // Own field only. A rival's projection is what the ZoC ring already shows,
  // at the resolution the design intends: you learn WHOSE ground it is, not
  // how much slack they have on it.
  const ownField = (viewer && state.world?.influence?.[viewer]) || {};
  const domThreshold = CONFIG.influence.dominanceThreshold;
  const hexes = {};
  for (const h of Object.values(state.board.hexes)) {
    const fog = fogOf(h.id);
    const live = fog === "visible";
    const mem = vis?.memory?.[h.id] || null;
    const hex = {
      id: h.id,
      // The board is not told which hexes carry a field encounter.
      //
      // An `encounter` hex used to draw a "?" and a tinted rim, so the player
      // could see every site on the map and route around them or farm them at
      // will — and a card you saw coming three turns out is not much of an
      // encounter. The engine keeps the distinction (actions.js reads
      // state.board.hexes directly on Move, which is untouched by this); the
      // VIEW simply never learns it, so no renderer, inspector panel or later
      // feature can leak it by accident.
      type: h.type === "encounter" ? "terrain" : h.type,
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
      // §18.3 ZoC. Live where the viewer can see; REMEMBERED where they have
      // explored (economy brief §11). This used to be live-only, so the
      // political map existed only where you happened to be looking — you
      // could not read whose ground you were about to walk into, which is the
      // one thing a border is for. A remembered border carries `zocStale` and
      // renders with the fog-memory treatment, so it is never mistaken for a
      // live reading.
      //
      // `zocForeign` marks another faction's ground; `zocTrespassing` means
      // one of the VIEWER's units is standing on it right now (the border
      // renders hotter as the "you are trespassing" cue) — and that one stays
      // live-only, because it is a fact about right now.
      zocOwner: live ? (zoc[h.id] || null) : (mem?.zocOwner || null),
      zocStale: !live && !!mem?.zocOwner,
      zocForeign: live
        ? (!!zoc[h.id] && zoc[h.id] !== viewer)
        : (!!mem?.zocOwner && mem.zocOwner !== viewer),
      zocTrespassing: live && !!zoc[h.id] && zoc[h.id] !== viewer
        && (unitIdsAt[h.id] || []).some((uid) => state.units[uid]?.owner === viewer),
      // Your own Influence here, and whether it clears the dominance bar.
      // Your projection is a fact about YOU, so it is not fog-gated the way a
      // rival's ZoC is — but it is still hidden on ground you have never seen,
      // because a heatmap over black is just a map.
      influence: fog === "unexplored" ? null
        : Math.round((ownField[h.id] || 0) * 10) / 10,
      influenceDominant: fog !== "unexplored" && (ownField[h.id] || 0) >= domThreshold,
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
    // A hex holds one blockade per road out of it, so this is a list. `blockade`
    // stays as the first of them for the panels that only ask whether the tile
    // is held; the board draws them all, one per road.
    // §11 / §17.7 — the listening post. It has a full concealment and reveal
    // model, an upkeep, a Strength and a destruction path, and NO board icon:
    // a player could not see their own. Concealment is the rule that decides
    // who is told, not fog — a revealed post stays revealed permanently, and
    // your own is always yours to see, so this is deliberately not live-gated
    // the way a blockade is.
    const post = postAt(state, h.id);
    if (post && viewer && isPostVisibleTo(state, viewer, post) && fog !== "unexplored") {
      hex.post = {
        owner: post.owner,
        mine: post.owner === viewer,
        // Unpaid posts go DORMANT: they see nothing until they are paid
        // again. That is a thing the owner has to be able to notice.
        dormant: post.paid === false,
        strength: post.strength,
      };
    }

    const bls = live ? blockadesOn(state, h.id) : [];
    if (bls.length) {
      hex.blockades = bls.map((bl) => ({
        owner: bl.owner,
        edge: bl.edge,
        done: !!bl.done,
        progress: bl.progress || 0,
        cost: bl.cost,
      }));
      [hex.blockade] = hex.blockades;
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
          // §11 — WHO is squeezing this city, if anyone. Influence pressure is
          // the best mechanic in the layer — a soft siege that bleeds Loyalty
          // and is diplomatically priced, connecting three systems — and its
          // only signal was one line of feed text. A city being hollowed out
          // should say so on the city.
          pressureBy: pressureSource(state, loc, loc.controller || holderOf(loc)) || null,
          chips: adaptChips(state, loc.chips),
          chipUids: [...loc.chips],
          chipSlots: loc.chipSlots,
          abilityId: loc.abilityId,
          ability: loc.abilityId ? describeAbility(loc.abilityId) : null,
          abilityUsedThisTurn:
            loc.abilityActivatedTurn === state.round * state.turnOrder.length + state.activeIndex,
        };
        hex.garrison = loc.garrison;
        // …and the same question for a city, on the same terms. A count, not
        // a flag: a Logistics Hub city holds two, and the board says so.
        hex.actionsReady = loc.controller === viewer ? (loc.actionsRemaining ?? 0) : 0;
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
      // Per-entity actions: the HUD aggregates what this faction can still DO
      // — every unit/Location action left plus wildcards. Max is the same
      // census at full refresh.
      //
      // The total alone was the whole readout, and it answered the wrong
      // question: "3 actions" while the player still had to click every unit
      // and every city to find out WHICH three. The roster below is that
      // answer, and it is built only for the viewer — a rival's remaining
      // actions are not the board's to give away.
      actions: (() => {
        const unitActs = Object.values(state.units).filter((u) => u.owner === p.id);
        const locActs = Object.values(state.locations).filter((l) => l.controller === p.id);
        const remaining = p.actions.remaining +
          unitActs.reduce((n, u) => n + (u.actionsRemaining ?? 0), 0) +
          locActs.reduce((n, l) => n + (l.actionsRemaining ?? 0), 0);
        const roster = p.id !== viewer ? null : {
          units: unitActs.map((u) => ({
            uid: u.uid, name: u.name, node: u.node,
            ready: (u.actionsRemaining ?? 0) > 0,
            unsupplied: !!u.unsupplied,
          })),
          locations: locActs.map((l) => ({
            hexId: l.hexId,
            name: ENGINE_LOCATIONS[l.locationId]?.name || l.locationId,
            // A Logistics Hub city works overtime, so it holds more than one
            // — the pip row draws each separately rather than rounding the
            // second away, and `capacity` is the engine's own refresh rule
            // rather than the UI guessing at it.
            ready: l.actionsRemaining ?? 0,
            capacity: locationActionCapacity(state, l),
          })),
          wildcards: p.actions.remaining,
        };
        // Max counts a hub city's SECOND action too. Assuming one per city
        // let `remaining` climb past `max` — a full-strength turn reading
        // "8/7" — because the engine had already handed the hub two.
        const max = p.actions.remaining + unitActs.length
          + locActs.reduce((n, l) => n + locationActionCapacity(state, l), 0);
        return { remaining, max, roster };
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
    // Not a goal any more — VP is the closing standing. Kept only so the
    // phone bar has a fallback before `dominion` arrives.
    vpGoal: CONFIG.vpThreshold,
    techThresholds: [...CONFIG.tech.researchThresholds],
    maxTechLevel: CONFIG.tech.maxLevel,
    players,
    units,
    hexes,
    rows: buildRows(state),
    winnerId: state.winnerId,
    // HOW they won — conquest, diplomacy, submission, or the mix. The end
    // screen used to show only a VP table, which since VP stopped being the
    // condition told a player nothing about what actually ended the game.
    winnerBy: state.winnerId
      ? ([...(state.log || [])].reverse().find((e) => e.name === "dominion_won")?.payload?.by || null)
      : null,
    // v0.2 §16.5 — in-transit field reinforcements, for board overlay /
    // unit panel ETA display.
    reinforcements: (state.reinforcements || []).map((r) => ({ ...r })),
    // §18.3 / §19 — the ZoC owner map, FOGGED to where the viewer has live
    // sight (ZoC is live info), and the viewer's OWN Influence field only.
    zoc: vis
      ? Object.fromEntries(Object.entries(zoc).filter(([h]) => vis.visible.has(h)))
      : { ...zoc },
    influence: viewer ? { [viewer]: state.world?.influence?.[viewer] || {} } : (state.world?.influence || {}),
    // The dominance bar, so the overlay's legend can name the number rather
    // than the UI hard-coding a copy of a tunable.
    influenceThreshold: CONFIG.influence.dominanceThreshold,
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
      // The one-chip-per-stat-family rule is a UNIT constraint, so the
      // per-unit outfit menu needs the family to explain a refusal.
      statType: o.def.statType || null,
      cost: o.def.buildCost ?? o.def.cost ?? 0,
      // What it would ACTUALLY cost to keep: its own upkeep plus economy §8's
      // count surcharge if it would land past the free allowance. Quoting the
      // authored number alone would understate the bill for exactly the player
      // who most needs to see it — the one with a lot of chips.
      upkeep: (o.def.upkeep || 0) + marginalChipSurcharge(state, loc.controller),
      surcharged: marginalChipSurcharge(state, loc.controller) > 0,
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
        // An upgrade REPLACES a chip in its own slot, so the count does not
        // change and no surcharge applies — only the new chip's own upkeep.
        upkeep: opt.def.upkeep || 0,
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

  // The GARRISON's own bays, kept separate from the Location's chip slots.
  //
  // Unit chips never consumed a Location slot in the engine — but the build
  // menu was only reachable by clicking an EMPTY Location slot, so once a city
  // filled up its stationed units could no longer be outfitted at all, and a
  // unit chip's upgrade never rendered anywhere. The two economies are
  // genuinely separate and now read that way.
  const garrison = [];
  for (const u of Object.values(state.units)) {
    if (u.owner !== loc.controller || u.node !== loc.hexId) continue;
    const bayUsed = slotsUsed(state, u.chips);
    garrison.push({
      uid: u.uid,
      name: u.name || "Unit",
      bayUsed,
      baySlots: CONFIG.unit.baySlots,
      upkeep: unitTotalUpkeep(state, u),
      unsupplied: !!u.unsupplied,
      // Each stat family admits one chip — surfaced so the menu can say WHY a
      // second Strength chip is refused rather than just greying out.
      statTypes: u.chips
        .map((c) => ENGINE_CHIPS[state.chips[c]?.chipId]?.statType)
        .filter(Boolean),
      chips: u.chips.map((c) => ({
        uid: c,
        chipId: state.chips[c]?.chipId,
        uiChipId: engineChipIdToUi(state.chips[c]?.chipId),
        name: chipDisplayName(state.chips[c]?.chipId, loc.controller),
        disabled: !!state.chips[c]?.disabled,
        upkeep: ENGINE_CHIPS[state.chips[c]?.chipId]?.upkeep || 0,
        upgrade: upgrades[c] || null,
      })),
    });
  }

  // Rail doc §2.2 — the settlements this one may pool into. Mirrors
  // validateSetPoolTarget exactly (direct link, both stations held by the same
  // faction), so the menu can never offer a target the engine will refuse.
  const poolTargets = [];
  for (const link of state.board.rails || []) {
    const far = link.a === loc.hexId ? link.b : link.b === loc.hexId ? link.a : null;
    if (far == null) continue;
    const dest = state.locations[far];
    if (!dest || dest.controller !== loc.controller) continue;
    poolTargets.push({
      hexId: far,
      name: ENGINE_LOCATIONS[dest.locationId]?.name || far,
      building: !!dest.activeBuild,
    });
  }
  // Rail doc §3.4 — does this settlement actually fund a blockade? The
  // priority toggle is meaningless without one, so the UI can hide it.
  const fundsBlockade = Object.values(state.world?.blockades || {}).some(
    (b) => !b.done && b.owner === loc.controller,
  );

  return {
    output: locationOutput(state, loc),
    slider: loc.buildSlider ?? 0,
    progress: loc.buildProgress || 0,
    slotCapacity: cap,
    slotsUsed: used,
    // Pooling (§2.2) + funding priority (§3.4) — engine actions that had no
    // control anywhere in the UI until now.
    garrison,
    poolTarget: loc.poolTarget ?? null,
    poolTargetName: loc.poolTarget
      ? (ENGINE_LOCATIONS[state.locations[loc.poolTarget]?.locationId]?.name || loc.poolTarget)
      : null,
    poolTargets,
    poolBlocked: loc.activeBuild ? "this settlement is building something of its own" : null,
    buildPriority: loc.buildPriority || "blockade",
    fundsBlockade,
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
// reputations + Dominion progress, and a row per other faction with
// Standing, relation, the derived gates, and a courtship hint.
function adaptDiplomacy(state, viewer) {
  if (!state.diplomacy || !viewer) return null;
  const dip = state.diplomacy;
  const me = state.players[viewer];
  const spyRing = hasTechNode(state, viewer, "int-b1");
  const viewerVis = state.visibility?.[viewer] || null;
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
      // Destroyed factions stay on this list — their history with you is
      // still worth reading — but they must not be rendered as a live power.
      // Left unflagged, a faction with no units and no ground showed as
      // "NEUTRAL · tolerates you with caution", inviting the player to court
      // somebody who no longer exists.
      eliminated: !!state.players[f]?.eliminated,
      // Public scoreboard — VP is common knowledge (the race is visible
      // even when the map is not). Null for factions with no player seat.
      vp: state.players[f]?.vp ?? null,
      // The books between you, both ways. This is the relationship the
      // engine has always kept and never shown — a war being "justified" was
      // a boolean nobody could see the reason for.
      ledger: {
        theyHold: grievanceLedger(state, f, viewer),
        youHold: grievanceLedger(state, viewer, f),
        theirWeight: grievanceWeight(state, f, viewer),
        yourWeight: grievanceWeight(state, viewer, f),
        // What a settlement could actually clear. An occupation is not in
        // the past, so it is not on this number — giving the place back is
        // the only thing that ends it.
        settleable: settleableWeight(state, f, viewer) + settleableWeight(state, viewer, f),
      },
      // How many of their units are standing inside your borders — the thing
      // a "get out" ultimatum is about, and the check on whether one is
      // even sayable.
      unitsInYourTerritory: unitsInTerritory(state, f, viewer).length,
      // §3.2 — the cities each side could actually put on a table. What THEY
      // hold is fog-gated: you cannot ask for a place you have never seen,
      // which is the Intelligence path buying its way into the deal builder
      // the same way it bought its way into denouncement.
      theyCouldCede: cedeableLocations(state, f)
        .filter((hex) => !viewerVis || viewerVis.explored.has(hex))
        .map((hex) => cessionOption(state, hex, viewer)),
      color: def.color || "#888",
      tier: def.tier || "major",
      temperament: def.temperament,
      scope: def.scope,
      standing: sToward,
      standingTier: tier,
      yourStanding: sFrom,
      pacted: arePacted(state, f, viewer),
      atWar: atWar(state, f, viewer),
      // ECONOMY §9 — HIRE. "Fight X with me" has been a real deal item since
      // §6.10 (`promise.joinWar`, enacted by declaring the war on acceptance,
      // priced by `wantsDead`) and the composer could not offer it, so paying
      // somebody to join your war was engine-only. These are the two lists the
      // pane needs: who you could hire them against, and who they could hire
      // YOU against — the same term, read from both seats.
      couldHireAgainst: factionIds(state)
        .filter((x) => x !== viewer && x !== f && state.players[x]
          && atWar(state, viewer, x) && !arePacted(state, f, x))
        .map((x) => ({ id: x, name: factionDef(x)?.name || x })),
      couldFightFor: factionIds(state)
        .filter((x) => x !== viewer && x !== f && state.players[x]
          && atWar(state, f, x) && !arePacted(state, viewer, x))
        .map((x) => ({ id: x, name: factionDef(x)?.name || x })),
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
      // shape on `state.diplomacy.agreements` so the map can draw the route
      // line green (clear) or amber (suspended).
      tradingPact: findTradingPact(state, viewer, f),
      // …and WHICH two cities are carrying it. The line used to be drawn
      // capital-to-capital because that was the only route a pact could have;
      // now it can run between any two cities, so the engine names the pair it
      // actually found rather than the map guessing at a pair that may not be
      // on the route at all. Null while the route is severed — there is no
      // line to draw when nothing is getting through.
      tradeRoute: (() => {
        const r = tradeRouteOpen(state, viewer, f);
        if (!r) return null;
        return {
          fromLocId: engineLocationIdToUi(state.locations[r.from]?.locationId),
          toLocId: engineLocationIdToUi(state.locations[r.to]?.locationId),
          by: r.by,
        };
      })(),
      // §1.4 passive agreements (open-borders, allied-vision) — exposed
      // so the relationship panel can summarise active toggles.
      openBordersFromYou: hasOpenBorders(state, f, viewer), // they may transit your land
      openBordersFromThem: hasOpenBorders(state, viewer, f), // you may transit theirs
      // §5 — WHERE THEY STAND, and what they want from you. This is the one
      // line that fixes the legibility complaint: "Courting — wants you clear
      // of Omara" tells a player everything the old tier word did not.
      //
      // The posture and its condition are PUBLIC (§12.2). How close you are to
      // the threshold behind it is not — that is Spy Ring product, and the
      // discipline is legible rule, purchasable magnitude.
      posture: (() => {
        const p = postureOf(state, f, viewer);         // theirs toward you
        const mine = postureOf(state, viewer, f);      // yours toward them
        return {
          kind: p.kind,
          condition: conditionText(state, f, viewer, p.condition),
          conditionKind: p.condition?.kind || null,
          // A condition you satisfy by doing nothing pays no Standing (§7.3).
          // Saying which is which is the difference between a player planning
          // around the ladder and guessing at it.
          costly: p.condition?.costly ?? null,
          since: p.since,
          statedRound: p.statedRound,
          // Whether they have said it out loud yet. An unstated posture cannot
          // be acted on, so it is also not yet something you have been told.
          stated: p.statedRound != null,
          courtingYou: p.kind === "Courting",
          courtRounds: p.kind === "Courting" ? state.round - p.since : 0,
          // …and your side of it.
          yours: mine.kind,
          youAreCourting: mine.kind === "Courting",
          yourCourtRounds: mine.kind === "Courting" ? state.round - mine.since : 0,
        };
      })(),
      // §12.1 — WHY they stand where they do. Causes only, ordered, unsigned:
      // Standing is the one value the win condition reads and §12.2 says its
      // magnitude is purchasable rather than readable, so a signed running
      // total would hand the player the exact number the Spy Ring sells. The
      // reasons are never hidden; the numbers ride with int-b1.
      standingReceipt: standingReceiptsFor(state, f, viewer, spyRing),
    };
  });
  return {
    youId: viewer,
    youCapital: capitalLocOf(state, viewer),
    // The purse, so the haggle stepper can stop where the money does rather
    // than letting the player table a counter the engine will refuse.
    scrap: me?.resource || 0,
    menace: me?.menace || 0,
    honor: me?.honor ?? CONFIG.diplomacy.honor.start,
    threat: Math.round(threatScore(state, viewer) * 10) / 10,
    // §6/§11 — political capacity, itemised, with a ledger. Scrap buys what a
    // faction HAS; Sway buys what a faction THINKS, and nothing converts. A
    // political income the player cannot break down is a number they cannot
    // plan around — and the territorial term especially, because the dominance
    // cliff means an extra point of Loyalty is worth 0 hexes or 12 and nothing
    // in between.
    sway: (() => {
      const inc = swayIncome(state, viewer);
      const cfg = CONFIG.sway;
      const courting = courtingList(state, viewer);
      const committed = courting.length * cfg.courtUpkeep;
      return {
        pool: swayOf(state, viewer),
        cap: cfg.cap,
        income: inc.total,
        parts: {
          floor: inc.floor,
          territory: inc.hexTerm,
          hexes: inc.hexes,
          hexesCounted: inc.hexesCounted,
          hexCap: cfg.hexCap,
          agreements: inc.agreementTerm,
          agreementCount: inc.agreements,
          chips: inc.chips,
        },
        // What is already spoken for every round, and what is left.
        committed,
        net: inc.total - committed,
        courting: courting.map((fid) => ({
          id: fid, name: factionDef(fid)?.name || fid,
          rounds: state.round - postureOf(state, viewer, fid).since,
        })),
        // Prices, published. A currency whose costs are hidden is a currency
        // the player cannot budget.
        costs: {
          courtUpkeep: cfg.courtUpkeep,
          perStanding: cfg.perStanding,
          opCost: cfg.opCost,
          occupation: cfg.occupation,
        },
        ledger: swayLedger(state, viewer).map((e) => ({
          delta: e.delta, cause: e.cause, round: e.round, value: e.value,
        })),
      };
    })(),
    // The win condition: every surviving faction eliminated, your ally, or
    // your vassal — held for `holdRounds`. It used to be a weighted score
    // against a threshold of 6, which never once decided a game.
    dominion: (() => {
      const st = dominionStanding(state, viewer);
      const left = dominionCountdown(state, viewer);
      return {
        allied: st.allied,
        vassals: st.vassals,
        outstanding: st.outstanding,
        // How many rivals are dealt with, out of how many are still alive.
        score: st.allied.length + st.vassals.length,
        threshold: st.others.length,
        contributors: [...st.vassals, ...st.allied],
        met: st.met,
        // The clock: null until the arrangement is complete, then counting
        // down while it holds. This is the player's warning that somebody is
        // about to win, and their window to do something about it.
        holdRounds: CONFIG.victory.holdRounds,
        roundsLeft: left,
        // Per-faction checklist — WHO is dealt with and, for the rest, a
        // coarse why-not. Coarse status is common knowledge; the precise
        // numbers behind it are Spy Ring product.
        backing: dominionBacking(state, viewer, spyRing),
      };
    })(),
    // Where your own numbers came from, act by act.
    receipts: {
      menace: repReceipts(state, viewer, "menace"),
      honor: repReceipts(state, viewer, "honor"),
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
    // §3.2 — your own cities, as deal items. One list, not one per faction:
    // what you can give does not depend on who you are talking to. The
    // engine decides what qualifies (full control, never your seat, never
    // your last ground) so the picker cannot offer something unofferable.
    youCouldCede: cedeableLocations(state, viewer).map((hex) => cessionOption(state, hex, viewer)),
    // §6.10 — offers on the table awaiting your answer: an AI's own approach,
    // or the counter-terms one came back with when it refused your proposal.
    // Rendered as readable term lists rather than raw items, so the drawer
    // never has to know the deal schema.
    offers: (dip.offers || []).filter((o) => o.to === viewer).map((o) => ({
      id: o.id,
      kind: o.kind,
      isCounter: !!o.isCounter,
      note: o.note || null,
      from: o.from,
      fromName: factionDef(o.from)?.name || o.from,
      // How they say it, so the audience box speaks in their voice.
      temperament: factionDef(o.from)?.temperament || null,
      expiresOnRound: o.expiresOnRound,
      roundsLeft: Math.max(0, o.expiresOnRound - state.round),
      // From the READER's seat. `give` is what the deal's PROPOSER hands
      // over — which is not always the other party: a counter-offer is
      // their answer to terms the viewer wrote, so the viewer is still the
      // proposer on it and `give` is what the viewer pays.
      ...(() => {
        const viewerProposes = o.deal.proposer === viewer;
        const mine = viewerProposes ? o.deal.give : o.deal.get;
        const theirs = viewerProposes ? o.deal.get : o.deal.give;
        const scrapIn = (items) => (items || []).reduce(
          (n, it) => n + (it.resource?.resource === "scrap" ? (it.resource.amount || 0) : 0), 0);
        return {
          youGet: (theirs || []).map((it) => describeDealItem(it, state)),
          youGive: (mine || []).map((it) => describeDealItem(it, state)),
          affordable: (mine || []).every(
            (it) => it.resource?.resource !== "scrap"
              || (me?.resource || 0) >= (it.resource.amount || 0),
          ),
          // §13 — the haggle. `netScrap` is signed FROM THE PLAYER'S SEAT, the
          // same convention `counterTheOffer` reads, so the stepper's number
          // and the engine's parameter are the same number and nothing has to
          // be flipped between the two.
          netScrap: scrapIn(mine) - scrapIn(theirs),
          // A counter can only move scrap, so an offer with no scrap in it and
          // nothing the player can pay with is not hagglable.
          canCounter: (me?.resource || 0) > 0 || scrapIn(theirs) > 0 || scrapIn(mine) > 0,
        };
      })(),
    })),
    // §12.3 — the intrigue branch, as three offers with their prices and their
    // risks on the face of them. A lie whose chance of being seen through the
    // player cannot read before pressing is a coin flip, not a decision.
    intrigue: (() => {
      if (!opsEnabled()) return null;
      const cost = CONFIG.sway.opCost;
      const caught = lieDetectionChance(state, viewer);
      const o = CONFIG.sway.ops;
      // Do you have ANY way of learning what happens quietly? The card says so
      // once, at the top, rather than leaving the player to infer it from a row
      // of greyed-out names.
      const apparatus = exposureApparatus(state, viewer, null)
        || (ownedPosts(state, viewer).some((p) => !p.dormant) ? "listening-post" : null)
        || (hasTechNode(state, viewer, "int-a1") ? "scouts" : null);
      return {
        cost,
        affordable: swayOf(state, viewer) >= cost,
        // null means blind: no Spy Ring, no live post, no detection.
        apparatus,
        apparatusText: apparatus === "spy-ring" ? "Your Spy Ring hears what happens quietly."
          : apparatus === "listening-post" ? "Your listening posts hear what happens in earshot."
          : apparatus === "scouts" ? "Your scouts can piece together what they can see."
          : "You have no way of learning what anyone does quietly — Intelligence B1, "
            + "a listening post, or Intelligence A1 with eyes on the place.",
        // Rounded for display only; the engine rolls the exact number.
        caughtPercent: Math.round(caught * 100),
        caughtHonorLoss: o.caughtHonorLoss,
        caughtMenace: o.caughtMenace,
        lastsRounds: o.lieDecaysAfterRounds,
        targets: factionIds(state).filter((f) => f !== viewer && state.players[f]).map((f) => {
          const strikes = exposableStrikes(state, f, viewer);
          return {
            id: f,
            name: factionDef(f)?.name || f,
            // Expose needs grounds and says what they are; the other two are
            // lies and need only somebody to tell them about.
            canExpose: strikes.length > 0,
            exposeAgainst: strikes[0]?.payload?.victim
              ? (factionDef(strikes[0].payload.victim)?.name || strikes[0].payload.victim)
              : null,
            // WHICH EAR HEARD IT. Not decoration: the whole point of gating
            // Expose on the Intelligence branch is that the branch becomes
            // visibly worth taking, and a player who is never told their Spy
            // Ring is what made this possible has not learned that.
            exposeVia: strikes[0]?.apparatus || null,
            canFabricate: grievanceWeight(state, viewer, f) === 0,
            fabricateWhy: grievanceWeight(state, viewer, f) > 0
              ? "you already have something real to hold against them" : null,
          };
        }),
      };
    })(),
    // §13 — what you stand for, in public, at nobody's request. A promise is
    // bilateral and priced; a position is unilateral and free to keep. It is
    // the only political act in the game that is not a transaction, which is
    // why it is the only one that can build a reputation rather than spend one.
    positions: (() => {
      const cfg = CONFIG.diplomacy.positions;
      if (!cfg?.enabled) return null;
      const held = positionsOf(state, viewer).map((p) => ({
        id: p.id, kind: p.kind, target: p.target,
        targetName: p.target ? (factionDef(p.target)?.name || p.target) : null,
        text: positionText(state, p),
        since: p.since,
        heldRounds: state.round - p.since,
        // A position cannot be dropped the moment it becomes inconvenient.
        canWithdraw: state.round - p.since >= cfg.minRounds,
        withdrawIn: Math.max(0, cfg.minRounds - (state.round - p.since)),
      }));
      // What you could still stand on. Built by ASKING THE ENGINE rather than
      // by re-deriving the rules here, so the drawer can never offer a
      // position `declarePosition` would refuse.
      const options = [];
      for (const kind of positionKinds()) {
        const targets = kind === "noVassals"
          ? [null]
          : factionIds(state).filter((f) => f !== viewer);
        for (const t of targets) {
          const why = positionBlocker(state, viewer, kind, t);
          options.push({
            kind, target: t,
            targetName: t ? (factionDef(t)?.name || t) : null,
            text: positionText(state, { kind, target: t }),
            available: !why, why,
          });
        }
      }
      return {
        held, options,
        max: cfg.max, room: Math.max(0, cfg.max - held.length),
        breakHonorLoss: cfg.breakHonorLoss,
        breakMenace: cfg.breakMenace,
        withdrawHonorLoss: cfg.withdrawHonorLoss,
        // Ones you have already broken and are still being named for.
        cited: citablePositions(state, viewer).map((p) => ({
          id: p.id, text: positionText(state, p), broken: p.broken,
        })),
      };
    })(),
    // §6.11 — threats standing over you, and the ones you have made. An
    // ultimatum binds the issuer too, so both directions are the player's
    // business: the second list is a clock they are running against
    // themselves.
    ultimatums: (dip.ultimatums || []).filter((u) => u.to === viewer).map((u) => ({
      id: u.id,
      from: u.from,
      fromName: factionDef(u.from)?.name || u.from,
      temperament: factionDef(u.from)?.temperament || null,
      kind: u.demand.kind,
      amount: u.demand.amount ?? null,
      demandText: u.demand.kind === "tribute"
        ? `${u.demand.amount} scrap`
        : "your units out of their territory",
      defied: !!u.defied,
      roundsLeft: Math.max(0, u.expiresOnRound - state.round),
      canComply: u.demand.kind === "tribute"
        ? (me?.resource || 0) >= u.demand.amount
        : unitsInTerritory(state, viewer, u.from).length === 0,
      // Why complying is not simply the safe option, and defying is not
      // simply the brave one.
      ifDefy: `They gain a righteous war on you — and lose ${CONFIG.diplomacy.ultimatum.bluffHonorLoss} Honor if they do not take it.`,
    })),
    ultimatumsIssued: (dip.ultimatums || []).filter((u) => u.from === viewer).map((u) => ({
      id: u.id,
      to: u.to,
      toName: factionDef(u.to)?.name || u.to,
      demandText: u.demand.kind === "tribute"
        ? `${u.demand.amount} scrap`
        : "their units out of your territory",
      defied: !!u.defied,
      roundsLeft: Math.max(0, (u.defied ? u.mustActBy : u.expiresOnRound) - state.round),
    })),
    // How many times you have already asked each faction for something this
    // round — past `freeAsks` a refusal starts costing Standing.
    asks: Object.fromEntries(factionIds(state)
      .filter((f) => f !== viewer)
      .map((f) => [f, asksThisRound(state, viewer, f)])),
    freeAsks: CONFIG.diplomacy.offers.freeAsksPerRound,
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

// A reputation change, in words. The engine records a `cause` on every one —
// these are terse machine strings ("attack:lakers", "denounced-by:goldgrass"),
// and this is the one place that turns them into a sentence.
function repCauseText(state, cause) {
  if (!cause) return "unrecorded";
  const [key, who] = String(cause).split(":");
  const name = who ? (factionDef(who)?.name || who) : null;
  const fixed = {
    decay: "time and clean play",
    "truce-broken": "striking through a truce",
    "surprise-attack": "attacking undeclared",
    "pact-broken": "abandoning an alliance",
    "promise-broken": "breaking your word",
    "pact-honored": "answering an ally's call",
    "pact-declined": "refusing an ally's call",
    mediator: "brokering a peace",
    "made-amends": "making amends",
    "agreement-kept": "keeping an agreement to its term",
    "denounce-warranted": "denouncing a faction that had earned it",
    "denounce-baseless": "an accusation you could not support",
    "demand-tribute": "demanding tribute under threat",
    "influence-pressure": "squeezing a rival's city",
    trespass: "marching through territory not yours",
  }[key];
  if (fixed) return fixed;
  if (key === "attack") return `attacking ${name}`;
  if (key === "declare") return `declaring war on ${name} without grounds`;
  if (key === "denounced-by") return `${name} put your name to it in public`;
  return key.replace(/-/g, " ");
}

// Why a faction stands where it does toward you — the Standing receipt
// (diplomacy brief §12.1). Deliberately NOT shaped like `repReceipts`: that
// one renders a signed delta per line, and doing the same here would let a
// player add up the exact Standing the Spy Ring is supposed to sell. Causes
// are ungated; magnitudes appear only with int-b1.
//
// The direction word carries the whole meaning without a number. "They have
// not forgotten Tin Town" is the sentence the brief asks for.
const STANDING_CAUSE_TEXT = {
  gift: "your gifts",
  "trading-pact": "the trade between you",
  "pact-honored": "you answered their call",
  "pact-declined": "you left their call unanswered",
  "promise-broken": "you broke your word to them",
  "location-captured": "you took ground they call theirs",
  "location-ceded": "ground of theirs changed hands",
  "raid-won": "your raiders",
  trespass: "your columns on their ground",
  "influence-pressure": "you are squeezing their city",
  pestered: "you asked once too often",
  denounce: "you named them in public",
  "denounce-friend": "you named their friend in public",
  "denounce-enemy": "you named an enemy of theirs in public",
  "denounce-baseless": "an accusation you could not support",
  mediator: "you brokered their peace",
  "ultimatum-met": "you gave in to their demand",
  "tribute-refused": "you refused their demand",
  defied: "you told their envoy where to put it",
  coalition: "the coalition put you on opposite sides",
  "common-cause": "you march in the same bloc",
  "freed-clemency": "you released a vassal they wanted kept",
  "toggle-vision": "the vision arrangement between you",
  "toggle-borders": "the borders arrangement between you",
  "guest-house": "the hospitality of the Guest House",
  truce: "the truce between you",
  freed: "you let them go",
  encounter: "something that happened out in the waste",
  deal: "the deals you have struck",
};
function standingReceiptsFor(state, from, to, spyRing) {
  return standingReceipts(state, from, to).map((e) => {
    const text = STANDING_CAUSE_TEXT[e.cause] || String(e.cause).replace(/-/g, " ");
    return {
      cause: e.cause,
      round: e.round,
      // The one thing that IS free: which way it moved. A player must be able
      // to tell a grievance from a courtesy without buying espionage.
      direction: e.delta > 0 ? "warmed" : "cooled",
      text,
      // Espionage product. Null without the Spy Ring.
      delta: spyRing ? e.delta : null,
      value: spyRing ? e.value : null,
    };
  });
}

// The receipts behind a number. This is the difference between a stat and a
// story: "Menace 9" told the player nothing about which of their own acts
// they were being judged for.
function repReceipts(state, pid, stat) {
  return reputationLog(state, pid, stat).map((e) => ({
    delta: e.delta,
    round: e.round,
    text: `${e.delta > 0 ? "+" : ""}${e.delta} · ${repCauseText(state, e.cause)} · round ${e.round}`,
  }));
}

// A faction's grievances against another, in words, worst first — the
// dossier the drawer renders. Reads the same ledger `warJustification` and
// `denounceWarrant` do, so what the player is shown is exactly what the
// engine is acting on.
const GRIEVANCE_TEXT = {
  "surprise-attack": "attacked undeclared",
  "truce-broken": "struck through a truce",
  "pact-broken": "abandoned the alliance",
  "promise-broken": "broke their word",
};
function grievanceLedger(state, victim, offender) {
  return grievancesAgainst(state, victim, offender)
    .slice()
    .sort((a, b) => b.severity - a.severity || b.round - a.round)
    .map((e) => {
      const where = e.at ? describeHex(state, e.at) : null;
      // An occupation is a standing condition, not something that happened
      // on a round, so it reads in the present tense and cites no date.
      const text = e.kind === "occupation"
        ? `holds ${where || "ground they call theirs"} — theirs by right`
        : `${GRIEVANCE_TEXT[e.kind] || e.kind}${where ? ` at ${where}` : ""} — round ${e.round}`;
      return { kind: e.kind, round: e.round, severity: e.severity, at: where, standing: !!e.standing, text };
    });
}

// One city, as the deal builder needs to see it: what it is called, what it
// is worth to the viewer, and whose homeland it is. The worth is the same
// number the engine prices the deal on — the builder does not get its own
// arithmetic, because two valuations that disagree is how a player learns
// not to trust the one on screen.
function cessionOption(state, hex, viewer) {
  const loc = state.locations[hex];
  const def = ENGINE_LOCATIONS[loc?.locationId] || {};
  return {
    hexId: hex,
    name: def.name || hex,
    vp: def.vpReward || 0,
    output: loc?.output ?? 0,
    holder: loc?.controller || null,
    affiliation: def.affiliation || null,
    affiliationName: def.affiliation ? (factionDef(def.affiliation)?.name || def.affiliation) : null,
    yoursByRight: def.affiliation === viewer,
    worth: Math.round(locationWorth(state, viewer, hex) * 10) / 10,
  };
}

// One deal term, in words. The drawer used to build its own item objects and
// its own labels; now the engine's schema is described in exactly one place.
// `state` is optional and only a Location needs it — every other item kind
// carries its own text, but a city is a hexId until the board says what
// stands there.
function describeDealItem(it, state) {
  if (!it) return "";
  if (it.location) {
    const loc = state?.locations?.[it.location.hexId];
    return ENGINE_LOCATIONS[loc?.locationId]?.name || it.location.hexId;
  }
  if (it.resource?.resource === "scrap") return `${it.resource.amount} scrap`;
  if (it.resource) return `${it.resource.amount} ${it.resource.resource}`;
  if (it.flow) {
    return `${it.flow.amountPerTurn} scrap/turn for ${flowRounds(it.flow)} rounds`;
  }
  if (it.research) return `${it.research.amount} research`;
  if (it.settlement) return "all grievances settled";
  if (it.chip) return "a chip";
  if (it.intel) return it.intel.kind === "mapData" ? "map data" : "intelligence";
  if (it.promise) {
    const rounds = promiseRounds(it.promise);
    switch (it.promise.kind) {
      case "pact": return "an alliance";
      case "peace": return "peace";
      case "openBorders": return "open borders";
      case "joinWar": return `war on ${factionDef(it.promise.target)?.name || it.promise.target}`;
      case "nonAggression": return `non-aggression for ${rounds} rounds`;
      case "dontAlly": return `no alliance with ${factionDef(it.promise.target)?.name || it.promise.target} for ${rounds} rounds`;
      case "tribute": return `tribute for ${rounds} rounds`;
      default: return it.promise.kind;
    }
  }
  return "something";
}

// The victory checklist — one row per other faction, mirroring
// `dominionStanding` EXACTLY, so the screen can never disagree with the
// condition about who is dealt with.
//
// It used to mirror the retired weighted Recognition instead, which asked for
// Allied *regard* on top of a pact and applied a reputation gate of its own —
// so a pacted-but-merely-friendly rival read as "warming" on screen while the
// engine counted them. The gates still bite, one level up: a bully cannot get
// the pact in the first place.
//
// Coarse `status`/`hint` are common knowledge; `detail` (exact Standing and
// gate numbers) rides only with the Spy Ring.
//
// The eliminated filter is the "EXACTLY" above, and it was missing. Without it
// this listed a row per faction that ever played while the count above it
// (`dominionStanding`) counted only the living — so a game with one faction
// destroyed showed five rows, three of them reading DEALT WITH, under a header
// saying "2 of 4". Both numbers were right about different populations, which
// is the worst way for a screen to be right.
//
// A destroyed faction is not a task, so it leaves the list with the count. The
// victory rule is about who is STILL STANDING; the dead are not a box to tick.
function dominionBacking(state, viewer, spyRing) {
  const me = state.players[viewer];
  const coal = coalitionAgainst(state, viewer);
  return factionIds(state)
    .filter((f) => f !== viewer && !state.players[f]?.eliminated)
    .map((f) => {
    const def = factionDef(f) || {};
    const s = getStanding(state, f, viewer);
    let status, hint;
    if (vassalLord(state, f) === viewer) {
      status = "backs";
      hint = "Your vassal — dealt with.";
    } else if (arePacted(state, f, viewer)) {
      status = "backs";
      hint = "Your ally — dealt with.";
    } else if (coal && coal.members.includes(f)) {
      status = "coalition";
      hint = "Marches in the coalition against you. They will not deal while it stands.";
    } else if (!passesRepGates(state, f, viewer)) {
      status = "blocked";
      hint = "Your reputation fails their gates — too much Menace for their tolerance, or your Honor sits below their floor. They will not ally you, and you cannot make them submit by talking.";
    } else {
      status = "cold";
      hint = "Neither ally nor vassal. Court them, subdue them, or take their ground.";
    }
    const detail = spyRing ? {
      standing: s,
      // §12.2 — the ONE number this screen shows, and it showed the wrong
      // bar. A pact needs `pactStandingReq` (6); this read `tiers.allied`
      // (8), so the single place the threshold is displayed asked for two
      // more Standing than the engine does.
      needStanding: CONFIG.diplomacy.pactStandingReq,
      yourMenace: me?.menace || 0,
      theirTolerance: Math.round(tolerance(state, f, viewer) * 10) / 10,
      yourHonor: me?.honor ?? CONFIG.diplomacy.honor.start,
      theirFloor: Math.round(trustFloor(state, f) * 10) / 10,
    } : null;
    return { id: f, name: def.name || f, tier: def.tier || "major", status, hint, detail };
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

  const SW = CONFIG.sway;
  const sway = swayOf(state, viewer);
  const courtingThem = isCourting(state, viewer, fid);

  // 0) COURT. §5's overture — the middle the layer was missing, and now the
  // only road to an alliance for anybody. It has to be the first verb on the
  // list, because a player who cannot find it cannot form a pact at all.
  if (!myLord && !myVassal && !pacted) {
    if (courtingThem) {
      out.push({
        verb: "end-courtship", state: "enabled",
        outcome: `You are courting them (round ${state.round - postureOf(state, viewer, fid).since}). ` +
          `Calling it off frees ${SW.courtUpkeep} Sway a round.`,
      });
    } else if (war) {
      out.push({ verb: "court", state: "disabled", reason: "You are at war." });
    } else if (!mayBeginCourtship(state, viewer, fid)) {
      const stand = getStanding(state, viewer, fid);
      out.push({
        verb: "court", state: "disabled",
        reason: stand < (D.tiers?.neutral ?? -1)
          ? `You think too little of them (${stand >= 0 ? "+" : ""}${stand}) to be seen courting them.`
          : !passesRepGates(state, viewer, fid)
          ? "Their reputation is in your way."
          : "They are beyond your reach.",
      });
    } else if (!canSustainCourtship(state, viewer)) {
      // The SHARED rule, not a UI approximation of it. A courtship is a
      // running cost, so the bar is "can you keep paying" — and the human and
      // the AI have to answer to the same one, or the bar is asymmetric.
      const running = courtingList(state, viewer).length;
      out.push({
        verb: "court", state: "disabled",
        reason: running
          ? `You are already spending ${running * SW.courtUpkeep} Sway a round on courtships, ` +
            `against an income of ${swayIncome(state, viewer).total}. Call one off, or widen your reach.`
          : `Not enough Sway to keep one running — ${SW.courtUpkeep} a round, ` +
            `against an income of ${swayIncome(state, viewer).total}.`,
      });
    } else {
      out.push({
        verb: "court", state: "enabled",
        outcome: `Costs ${SW.courtUpkeep} Sway every round it runs. States your condition and ` +
          `earns Standing while they keep it — a pact needs ${CONFIG.diplomacy.posture.courtRounds} ` +
          `rounds of courtship behind it, from either side.`,
      });
    }
  }

  // 1) Gift — priced in SWAY (economy §6.3). Scrap buys what a faction has;
  // Sway buys what a faction thinks, and the wall between them is the design.
  if (myLord) {
    // Hidden — gift to your own lord doesn't make sense (you owe them, this verb is for outsiders).
  } else if (myVassal) {
    // Hidden — vassal already pays into your bank.
  } else if (sway < SW.perStanding) {
    out.push({
      verb: "gift", state: "disabled",
      reason: `Not enough Sway — ${SW.perStanding} per point of regard, you hold ${sway}.`,
    });
  } else {
    out.push({
      verb: "gift", state: "enabled",
      outcome: `${SW.perStanding} Sway per point of their regard, with diminishing returns ` +
        `if you lean on them too often. Costs no scrap.`,
    });
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
      const need = CONFIG.diplomacy.posture.courtRounds;
      const worked = Math.max(
        isCourting(state, fid, viewer) ? state.round - postureOf(state, fid, viewer).since : 0,
        courtingThem ? state.round - postureOf(state, viewer, fid).since : 0,
      );
      if (stand < req) {
        reason = `Their regard for you is ${stand >= 0 ? "+" : ""}${stand} (${tier}); a pact needs +${req}.`;
      }
      // §7.2/§7.3 — Standing was never the whole bar, and saying so is the
      // point. An alliance out of a clear sky is unearned; the same alliance
      // after rounds of somebody publicly working the relationship is not.
      else if (!courtingThem && !isCourting(state, fid, viewer)) {
        reason = "Nobody is courting anybody. Open a courtship first — an alliance is not a thing you ask for cold.";
      } else if (worked < need) {
        reason = `The courtship is ${worked} round${worked === 1 ? "" : "s"} old; an alliance wants ${need}.`;
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
        outcome: "JUSTIFIED — your grievance is on record. Neither the declaration nor the fighting costs Menace.",
      });
    } else {
      out.push({
        verb: "declare-war", state: "enabled",
        outcome: `UNPROVOKED — +${CONFIG.diplomacy.menace.declareUnjustified} Menace the moment you declare, and more with every attack. Denounce them first to declare a just war.`,
      });
    }
  }

  // 4) Make Peace (only when at war). A bare ask with nothing attached —
  // whether they take it rides entirely on how tired of the war they are.
  if (war) {
    out.push({
      verb: "make-peace", state: "enabled",
      outcome: aiAcceptsPeace(state, fid, viewer, null)
        ? "They have had enough of this war and would take a plain ceasefire."
        : "They are not tired of this war yet. Offer them something (Sue for Peace) or make it cost them more.",
    });
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

  // 9b) Ultimatum — the step between asking and attacking.
  if (!myLord && !myVassal && !war) {
    const U = CONFIG.diplomacy.ultimatum;
    const cd = ultimatumCooldown(state, viewer, fid);
    const standing = (state.diplomacy?.ultimatums || []).some((u) => u.from === viewer && u.to === fid);
    if (standing) {
      out.push({ verb: "issue-ultimatum", state: "disabled", reason: "One already stands over them." });
    } else if (cd > 0) {
      out.push({
        verb: "issue-ultimatum", state: "disabled",
        reason: `You threatened them too recently — ${cd} more round${cd === 1 ? "" : "s"}.`,
      });
    } else {
      out.push({
        verb: "issue-ultimatum", state: "enabled",
        outcome: `+${U.menaceOnIssue} Menace now. They have ${U.deadlineRounds} rounds. Defiance hands you a JUST war — but if you then do nothing, the board watches you back down and it costs ${U.bluffHonorLoss} Honor.`,
      });
    }
  }

  // 10) Denounce — public condemnation, and the formal first step of a just
  // war. Costs Honor and cannot be repeated until its cooldown clears.
  if (!myLord && !myVassal) {
    const cd = denounceCooldown(state, viewer, fid);
    if (cd > 0) {
      out.push({
        verb: "denounce", state: "disabled",
        reason: `Already denounced — the accusation stands for ${cd} more round${cd === 1 ? "" : "s"}.`,
      });
    } else {
      // Denouncing is judged the same way declaring war is: on whether you
      // have grounds. The verb reads completely differently in the two cases,
      // so say which one the player is looking at.
      const g = denounceGrounds(state, viewer, fid);
      const warrant = g?.kind || null;
      const H = CONFIG.diplomacy.honor;
      const grounds = ((kind) => {
        const base = {
          menace: "their aggression is past what you will overlook",
          honor: "their word is worth nothing and everyone knows it",
          "pact-broken": "they broke their pact with you",
          "promise-broken": "they broke their word to you",
          "truce-broken": "they struck you through a truce",
          "surprise-attack": "they attacked you undeclared",
          occupation: "they are sitting on ground that is yours by right",
        }[kind] || "you have grounds";
        // Cite the act, with the receipt the ledger now keeps.
        if (!g?.entry) return base;
        const where = g.entry.at ? ` at ${describeHex(state, g.entry.at)}` : "";
        // A standing condition has no date — it is true right now.
        if (g.entry.standing) return `${base}${where}`;
        return `${base}${where}, round ${g.entry.round}`;
      })(warrant);
      out.push({
        verb: "denounce", state: "enabled",
        outcome: warrant
          ? `WARRANTED — ${grounds}. +${H.denounceWarrantedGain} Honor, and any faction that reads them the same way warms to you. Makes a war on them JUST for ${CONFIG.diplomacy.justWar.denounceWindowRounds} rounds.`
          : `BASELESS — they have done nothing you can point to. −${H.denounceLoss} Honor, and factions with no quarrel with them will hold it against you. It justifies no war.`,
      });
    }
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
  // route from any of your cities to any of theirs. Engine returns specific
  // reasons; we only
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
    // Rail doc §2.3 — running rights. A lower bar than open borders and only
    // one direction: this is YOUR grant over YOUR stations, so the drawer can
    // read the gate off the one side it actually knows.
    const ra = railAccessStanding(state, viewer, fid);
    const granted = hasRailAccess(state, fid, viewer);
    out.push(ra.ok || granted
      ? {
        verb: "set-rail-access",
        state: "enabled",
        outcome: granted
          ? "Revoke their running rights over your rail — their freight and troops stop using your stations."
          : "Let their units and trade run over the rail lines your settlements hold.",
      }
      : {
        verb: "set-rail-access",
        state: "disabled",
        reason: `${ra.reason.charAt(0).toUpperCase()}${ra.reason.slice(1)}.`,
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
// The full economic ledger for a faction: what each holding earns, what each
// standing asset costs, and the net.
//
// ONE computation, because the top bar's running total and the Economy panel's
// itemisation must never disagree — a HUD that says +3/turn over a list that
// visibly adds to −1 is worse than showing neither. `upkeepSummary` below is
// just this report's totals.
//
// Mirrors the order the engine charges in (turn.js): Output and tolls in, then
// chips, posts, blockades and units out.
export function economyReport(state, fid) {
  const locations = [];
  let income = 0;
  let chipCost = 0;

  for (const loc of Object.values(state.locations)) {
    const full = loc.controller === fid;
    if (!full && holderOf(loc) !== fid) continue;

    // A besieged city (majority-held, not outright) still works, at reduced
    // capacity — control.js.
    let output = locationOutput(state, loc);
    if (!full) output = Math.floor(output * CONFIG.economy.partialOutputScale);

    // BANKED is what actually reaches the treasury. A settlement with
    // something under construction keeps only the butter half of its slider;
    // one with nothing to build banks all of it, because throughput is never
    // wasted (economy.js processLocationEconomy).
    const diverting = !!loc.activeBuild || !!loc.poolTarget;
    const f = Math.max(0, Math.min(1, loc.buildSlider ?? CONFIG.economy.defaultSlider));
    const banked = diverting ? Math.floor((1 - f) * output) : output;
    income += banked;

    const chips = [];
    for (const c of loc.chips) {
      const def = ENGINE_CHIPS[state.chips[c]?.chipId];
      if (!def?.upkeep) continue;
      chips.push({
        uid: c,
        name: chipDisplayName(state.chips[c]?.chipId, fid),
        upkeep: def.upkeep,
        dormant: !!state.chips[c]?.disabled,
      });
      chipCost += def.upkeep;
    }

    locations.push({
      hexId: loc.hexId,
      name: ENGINE_LOCATIONS[loc.locationId]?.name || loc.locationId,
      besieged: !full,
      output,
      banked,
      // Why banked is short of output, when it is — so a player reading a low
      // number can see it is a choice they made, not a loss.
      diverting: diverting ? (loc.activeBuild ? "building" : "pooling") : null,
      chips,
      chipUpkeep: chips.reduce((n, c) => n + c.upkeep, 0),
    });
  }
  locations.sort((a, b) => b.banked - a.banked || a.name.localeCompare(b.name));

  const tolls = blockadeIncome(state, fid);
  income += tolls;

  const units = [];
  let army = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner !== fid) continue;
    const cost = unitTotalUpkeep(state, u);
    army += cost;
    units.push({
      uid: u.uid,
      name: u.name || "Unit",
      hexId: u.node,
      at: describeHex(state, u.node),
      upkeep: cost,
      unsupplied: !!u.unsupplied,
    });
  }
  units.sort((a, b) => b.upkeep - a.upkeep || a.name.localeCompare(b.name));

  const structures = [];
  let structureCost = 0;
  for (const b of Object.values(state.world?.blockades || {})) {
    if (b.owner !== fid) continue;
    // An unfinished site costs nothing yet — it is paid for out of a
    // settlement's build output, not from the treasury.
    const cost = (b.done ? CONFIG.blockades.upkeep : 0) + chipUpkeep(state, b.chips, fid);
    if (!b.done && cost === 0) continue;
    structureCost += cost;
    structures.push({
      kind: "blockade", hexId: b.hex, name: "Blockade", at: describeHex(state, b.hex),
      upkeep: cost, dormant: b.done && b.paid === false,
    });
  }
  for (const post of Object.values(state.world?.listeningPosts || {})) {
    if (post.owner !== fid) continue;
    structureCost += CONFIG.posts.upkeep;
    structures.push({
      kind: "post", hexId: post.hex, name: "Listening post", at: describeHex(state, post.hex),
      upkeep: CONFIG.posts.upkeep, dormant: post.paid === false,
    });
  }
  structures.sort((a, b) => b.upkeep - a.upkeep || String(a.hexId).localeCompare(String(b.hexId)));

  const upkeep = chipCost + army + structureCost;
  return {
    income, tolls, upkeep, net: income - upkeep,
    chips: chipCost, army, structures: structureCost,
    locations, units, structureList: structures,
  };
}

// Where something is, in words. `h2-0` is a board-generation key, not a place
// a player has any way to find — it was reaching the Economy ledger as the
// stated position of any unit not standing on a Location, and as the only
// caption on every blockade and listening post. A Location has a name; open
// ground doesn't, so describe the ground itself by the same features that
// actually matter to a unit standing on it (§16.6 elevation/cover, §16.2
// road/rail), which is also the only reason a player parks a unit out there.
export function describeHex(state, hexId) {
  const named = ENGINE_LOCATIONS[state.locations?.[hexId]?.locationId]?.name;
  if (named) return named;
  const hex = state.board?.hexes?.[hexId];
  if (!hex) return "In the field";
  const features = [];
  if (hex.elevation) features.push("high ground");
  if (hex.cover) features.push("cover");
  if (hex.rail) features.push("on the rail");
  else if (hex.road) features.push("on the road");
  return features.length ? `In the field · ${features.join(" · ")}` : "In the field";
}

// Just the totals, for the top bar. Derived from the same report the Economy
// panel itemises, so the two can never drift.
export function upkeepSummary(state, fid) {
  const r = economyReport(state, fid);
  return { income: r.income, upkeep: r.upkeep, net: r.net, chips: r.chips, army: r.army, structures: r.structures };
}

// Rail doc §3 — the whole state of the blockade on `hex`, for its own window.
//
// A blockade is selected like a settlement, not reached through whichever unit
// happens to be standing on it: it is a structure that outlives the unit that
// raised it, and asking a player to keep a unit parked there to manage it made
// it feel like a unit ability rather than a place on the map.
//
// Returns null on a hex with no blockade. `viewer` is the faction looking:
// everything actionable is gated on owning it, and a foreign blockade reports
// only what is visible from outside.
export function blockadeView(state, hex, viewer) {
  const b = blockadeAt(state, hex);
  if (!b) return null;
  const mine = b.owner === viewer;
  const player = state.players?.[viewer];
  const cut = mine ? supplyCutter(state, viewer) : null;
  const supply = mine ? supplyStatus(state, viewer, hex, cut) : null;

  const view = {
    hex,
    owner: b.owner,
    mine,
    done: !!b.done,
    paid: b.paid !== false,
    progress: b.progress || 0,
    cost: b.cost || 0,
    upkeep: CONFIG.blockades.upkeep,
    defense: CONFIG.blockades.defense,
    vision: CONFIG.blockades.vision,
    builder: b.builder || null,
    installed: [],
    chips: [],
    slotsUsed: 0,
    slotCap: CONFIG.blockades.chipSlots,
    building: null,
    supply: supply ? { path: !!supply.path, ok: !!supply.ok } : null,
  };
  if (!mine) return view;

  for (const c of b.chips || []) {
    view.installed.push({
      uid: c,
      chipId: state.chips[c]?.chipId,
      name: chipDisplayName(state.chips[c]?.chipId, viewer),
      desc: ENGINE_CHIPS[state.chips[c]?.chipId]?.desc || "",
      disabled: !!state.chips[c]?.disabled,
      upkeep: ENGINE_CHIPS[state.chips[c]?.chipId]?.upkeep || 0,
    });
  }
  view.slotsUsed = blockadeSlotsUsed(state, b);
  if (b.build) {
    view.building = {
      chipId: b.build.chipId,
      name: chipDisplayName(b.build.chipId, viewer),
      cost: b.build.cost,
      progress: b.progress || 0,
    };
  }

  // What may be fitted, mirroring validateUpgradeBlockade so the menu never
  // offers something the engine will refuse.
  if (b.done && player) {
    for (const def of Object.values(ENGINE_CHIPS)) {
      if (def.kind !== "blockade") continue;
      if (!meetsTech(player, def)) continue; // Tech-forbidden → not shown at all
      let reason = null;
      if (b.build) reason = "already building something";
      else if ((b.chips || []).some((c) => state.chips[c]?.chipId === def.id)) reason = "already installed";
      else if (view.slotsUsed + (def.slots || 1) > view.slotCap) reason = "no free slot";
      else if (!supply?.path) reason = "no road back to a settlement you hold";
      else if (!supply?.ok) reason = "that road connection is cut";
      view.chips.push({
        chipId: def.id,
        name: chipDisplayName(def.id, viewer),
        desc: def.desc || "",
        cost: def.buildCost ?? def.cost ?? 0,
        slots: def.slots || 1,
        upkeep: def.upkeep || 0,
        buildable: !reason,
        reason,
      });
    }
  }
  return view;
}

// Can this unit BREAK GROUND on a blockade where it stands? This half stays a
// unit action and stays in the UnitPanel: there is no blockade to select until
// one exists, so it has nowhere else to live.
//
// Every refusal mirrors validateBuildBlockade so the button explains itself
// rather than failing on click.
export function blockadeBuildOffer(state, unitUid) {
  const unit = state.units?.[unitUid];
  if (!unit) return null;
  const pid = unit.owner;
  const player = state.players?.[pid];
  const hex = unit.node;
  const cell = state.board.hexes[hex];
  if (!player || !cell) return null;
  // Nothing to offer on ground a blockade could never go on — most of the
  // board — so the panel does not grow a permanently-dead section.
  if (!cell.road || state.locations[hex]) return null;
  if (blockadeAt(state, hex)) return null; // one stands here; its own window has it

  const supply = supplyStatus(state, pid, hex, supplyCutter(state, pid));
  let reason = null;
  if (postAt(state, hex)) reason = "a listening post occupies this hex";
  else if (!supply.path) reason = "no road back to a settlement you hold";
  else if (!supply.ok) reason = "that road connection is cut";
  else if (player.resource < CONFIG.blockades.buildCost) reason = "not enough scrap";

  return {
    can: !reason,
    reason,
    cost: CONFIG.blockades.buildCost,
    turns: CONFIG.blockades.minTurns,
    upkeep: CONFIG.blockades.upkeep,
    // §7.2 — WHAT IT WOULD CUT, before you pay for it.
    //
    // The research is blunt about this: economic strangulation needs an
    // immediate visible number, and the canonical failure is blockades that
    // are mechanically real and emotionally dead because "the impact isn't
    // visually obvious, creating the false impression that blockades don't
    // work at all." `routeCutter` and the drain rule already answer the
    // question; nobody was asking it. This is the display work that makes
    // severing supply the visible verb.
    preview: blockadePreview(state, pid, hex),
  };
}

// Whose Output this site would bite, and by how much — plus whose supply it
// would sever. Reads the same rules the blockade itself will run on, so the
// preview cannot promise something the barricade will not deliver.
function blockadePreview(state, pid, hex) {
  const drain = CONFIG.blockades.drainOutput || 0;
  const ring = new Set([hex, ...(state.board.adjacency[hex] || [])]);
  const strangles = [];
  for (const loc of Object.values(state.locations)) {
    if (!loc.controller || loc.controller === pid) continue;
    if (!ring.has(loc.hexId)) continue;
    const output = locationOutput(state, loc);
    strangles.push({
      hexId: loc.hexId,
      name: ENGINE_LOCATIONS[loc.locationId]?.name || loc.locationId,
      owner: loc.controller,
      ownerName: factionDef(loc.controller)?.name || loc.controller,
      output,
      // What it would fall TO. Floored at 0 — a strangled city produces
      // nothing, it does not owe.
      after: Math.max(0, output - drain),
      drain: Math.min(output, drain),
    });
  }
  // …and whose overland routes run through here. A blockade on a trunk road
  // cuts more than the city next to it.
  const cuts = [];
  for (const fid of factionIds(state)) {
    if (fid === pid) continue;
    const before = supplyStatus(state, fid, hex, supplyCutter(state, fid));
    if (before?.path) {
      cuts.push({ id: fid, name: factionDef(fid)?.name || fid });
    }
  }
  return { drainPerRound: drain, strangles, routesThrough: cuts };
}

// §17.7 — can this unit dig in a listening post where it stands? Same shape
// and same home as the blockade controls above, and for the same reason: a
// post goes on a plain hex, and a plain hex opens no window.
export function postAction(state, unitUid) {
  const unit = state.units?.[unitUid];
  if (!unit) return null;
  const pid = unit.owner;
  const player = state.players?.[pid];
  const hex = unit.node;
  if (!player || !state.board.hexes[hex]) return null;

  const here = postAt(state, hex);
  // Relay Kit (chip `postsWithoutTech`): the artifact IS the know-how, so a
  // carrier stands in for the Intelligence A2 assignment.
  const kitted = unit.chips.some(
    (c) => !state.chips[c]?.disabled && ENGINE_CHIPS[state.chips[c]?.chipId]?.postsWithoutTech,
  );

  let reason = null;
  if (state.locations[hex]) reason = "not on a settlement";
  else if (here) reason = here.owner === pid ? "you already have a post here" : "a post already occupies this hex";
  else if (blockadeAt(state, hex)) reason = "a blockade occupies this hex";
  else if (!hasTechNode(state, pid, "int-a2") && !kitted) reason = "needs Intelligence A2 (Listening Post)";
  else if (player.resource < CONFIG.posts.buildCost) reason = "not enough scrap";

  return {
    can: !reason,
    reason,
    cost: CONFIG.posts.buildCost,
    upkeep: CONFIG.posts.upkeep,
    range: CONFIG.posts.range,
    mine: !!here && here.owner === pid,
  };
}

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
// Visible deadlines for the HUD countdown — read straight off the deferred
// queue, so the number shown is the number that will fire.
export { activeDeadlines } from "../game/deferred.js";
