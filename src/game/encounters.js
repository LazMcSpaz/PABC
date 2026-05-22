// Encounter delivery (mechanical-spec §15.5, §15.8). One dispatcher
// handles all three modes — `private`, `public`, `placement` — plus
// the field-encounter draw on Move-end. The encounter schema is shared
// across all delivery paths; only the wiring differs.
//
// Registers the `PLACE_ENCOUNTER` and `DELIVER_ENCOUNTER` handlers onto
// the existing EFFECTS map at module load, so effects.js stays free of
// circular imports.
import { FIELD_ENCOUNTERS, WORLD_ENCOUNTERS } from "./content/index.js";
import { LOCATIONS } from "./content.js";
import { normalizeEncounter } from "./content-loader.js";
import { evalCond } from "./dsl.js";
import { applyEffects, EFFECTS } from "./effects.js";
import { resolveTargets } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { emit } from "./events.js";
import { hasTechNode } from "./tech.js";

// One-time normalisation — flatten {type, params} once instead of on
// every delivery. Editor-added fields (imagePath, outcomeText, …) pass
// through.
const FIELD = normalizeAll(FIELD_ENCOUNTERS);
const WORLD = normalizeAll(WORLD_ENCOUNTERS);

function normalizeAll(rawMap) {
  const out = {};
  for (const [id, raw] of Object.entries(rawMap)) out[id] = normalizeEncounter(raw);
  return out;
}

export function getEncounter(id) {
  return WORLD[id] || FIELD[id] || null;
}

// --- delivery dispatch -----------------------------------------------

// Headless default mirrors FORCE_CHOICE: pick the first eligible choice.
function headlessPick(eligible) {
  return 0;
}

export function deliverEncounter(state, encounterId, options = {}, ctx = {}) {
  const enc = getEncounter(encounterId);
  if (!enc) return null;
  return deliverEncounterDef(state, enc, options, ctx);
}

// Lower-level variant — takes an encounter def directly. Used by
// quests.js to dispatch beats (which are encounter-shaped but live in
// a separate registry).
export function deliverEncounterDef(state, enc, options = {}, ctx = {}) {
  const mode = options.mode || enc.mode || "private";
  if (mode === "placement") return placeEncounterMarker(state, enc, options, ctx);
  const recipients = resolveRecipients(state, enc, mode, options, ctx);
  if (!recipients.length) return null;
  const results = [];
  for (const pid of recipients) {
    const result = presentToPlayer(state, enc, pid, ctx);
    if (result) results.push(result);
  }
  return { encounterId: enc.id, mode, recipients, results };
}

function resolveRecipients(state, enc, mode, options, ctx) {
  if (mode === "public") return [...state.turnOrder];
  const tok = options.recipient || enc.recipient || "active";
  return resolveTargets(state, tok, ctx);
}

function presentToPlayer(state, enc, pid, ctx) {
  // Filter choices by their own condition (the DSL `condition` on each
  // choice row).
  const subCtx = { ...ctx, sourcePlayer: pid };
  const eligible = (enc.choices || []).filter((c) =>
    c.condition == null ? true : evalCond(state, c.condition, subCtx),
  );
  if (!eligible.length) return null;

  let pickedIdx = headlessPick(eligible);
  if (ctx.interact) {
    const picked = ctx.interact({
      kind: "encounterChoice",
      encounter: enc.id, player: pid,
      title: enc.title, art: enc.art, imagePath: enc.imagePath, text: enc.text,
      choices: eligible.map((c) => ({ id: c.id, label: c.label, outcomeText: c.outcomeText })),
    });
    const idx =
      typeof picked === "number"
        ? picked
        : eligible.findIndex((c) => c.id === picked || c.label === picked);
    if (idx >= 0) pickedIdx = idx;
  }
  const choice = eligible[pickedIdx];

  emit(state, "encounter_delivered", {
    encounter: enc.id, recipient: pid,
    choiceId: choice.id, choiceLabel: choice.label,
  });

  applyChoiceEffects(state, choice, pid, subCtx);

  emit(state, "encounter_resolved", {
    encounter: enc.id, recipient: pid, choiceId: choice.id,
  });
  return { recipient: pid, choiceId: choice.id, choiceLabel: choice.label };
}

// A choice's `deferredDelay` (column on the choices table) wraps the
// entire effect list in a QUEUE_DEFERRED at the choice level. Inline
// QUEUE_DEFERRED effects authored among the regular effects still work
// independently.
function applyChoiceEffects(state, choice, pid, ctx) {
  const effects = choice.effects || [];
  if (choice.deferredDelay && choice.deferredDelay > 0) {
    applyEffects(state, [{
      type: "QUEUE_DEFERRED",
      delayRounds: choice.deferredDelay,
      effects,
      target: pid,
    }], ctx);
  } else {
    applyEffects(state, effects, ctx);
  }
}

// --- field-encounter draw (§15.8) ------------------------------------

// Called from actions.js runMove when a unit ends Move on an encounter
// hex that isn't in refresh cooldown. Draws the top of the deck, sets
// the hex's refresh cooldown, and delivers as a private encounter to
// the unit's owner.
const FIELD_HEX_COOLDOWN = 3;

// Recon Team chips on `pid`'s fully-held Locations — each grants one
// encounter discard (stacks with the §17.5 Intelligence entry node).
function reconTeamCount(state, pid) {
  let n = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) if (state.chips[c]?.chipId === "recon-team") n++;
  }
  return n;
}

export function drawFieldEncounter(state, unit, ctx = {}) {
  const ensureDeck = () => {
    if (!state.encounterDeck?.length && state.discards.encounter?.length) {
      state.encounterDeck = state.rng.shuffle(state.discards.encounter);
      state.discards.encounter = [];
    }
    return (state.encounterDeck?.length || 0) > 0;
  };
  if (!ensureDeck()) return null;

  // §17.5 Intelligence (Recon) + the Recon Team chip each grant one
  // discard-and-redraw. A discard sends the drawn card to the deck bottom
  // and draws the next; after the last discard the player is committed.
  // Headless / AI (no ctx.interact) commit to the first draw, so the
  // harness stays deterministic.
  let redraws = (hasTechNode(state, unit.owner, "int-entry") ? 1 : 0)
    + reconTeamCount(state, unit.owner);
  while (redraws > 0 && ctx.interact && state.encounterDeck.length > 1) {
    const top = state.encounterDeck[0];
    const wantDiscard = ctx.interact({
      kind: "encounterRedraw", encounter: top, player: unit.owner, remaining: redraws,
    });
    if (!wantDiscard) break;
    state.encounterDeck.push(state.encounterDeck.shift()); // bottom of deck
    ensureDeck();
    redraws -= 1;
  }

  const encounterId = state.encounterDeck.shift();
  state.discards.encounter.push(encounterId);
  state.world.encounterHexCooldowns[unit.node] = state.round + FIELD_HEX_COOLDOWN;
  return deliverEncounter(
    state, encounterId,
    { mode: "private", recipient: unit.owner },
    { ...ctx, sourcePlayer: unit.owner },
  );
}

// --- placement marker (§15.5) ----------------------------------------

function placeEncounterMarker(state, enc, options, ctx) {
  const hex =
    options.hex ||
    pickHexByFilter(state, options.hexFilter || enc.placementFilter);
  if (!hex) return null;
  const expiresIn = options.expiresIn ?? enc.expiresIn;
  state.world.encounterMarkers = state.world.encounterMarkers || {};
  state.world.encounterMarkers[hex] = {
    encounterId: enc.id,
    expiresAt: expiresIn != null ? state.round + expiresIn : null,
    placedAt: state.round,
  };
  emit(state, "location_spawned", { hex, kind: "encounter-marker", encounterId: enc.id });
  return { placedAt: hex };
}

// Called from runMove if the unit ends Move on a hex carrying a marker.
// Resolves as a private encounter to the unit's owner and removes the
// marker (one-shot — markers don't refresh).
export function resolveMarkerOnHex(state, hex, unit, ctx = {}) {
  const markers = state.world?.encounterMarkers;
  if (!markers?.[hex]) return null;
  const { encounterId } = markers[hex];
  delete markers[hex];
  return deliverEncounter(
    state, encounterId,
    { mode: "private", recipient: unit.owner },
    { ...ctx, sourcePlayer: unit.owner },
  );
}

// --- HexFilter resolver (content-schema §4) --------------------------

function hexMatches(state, hex, f) {
  if (!f) return true;
  const h = state.board.hexes[hex];
  if (!h) return false;
  const loc = state.locations[hex];

  if (f.type && f.type !== "any" && h.type !== f.type) return false;

  if (f.controlledBy === "neutral") {
    if (loc?.controller != null) return false;
  } else if (f.controlledBy === "any-player") {
    if (!loc?.controller) return false;
  } else if (f.controlledBy === "any") {
    if (!loc) return false;
  } else if (f.controlledBy && state.players[f.controlledBy]) {
    if (loc?.controller !== f.controlledBy) return false;
  }

  if (f.notControlledBy === "any-player") {
    if (loc?.controller) return false;
  } else if (f.notControlledBy && state.players[f.notControlledBy]) {
    if (loc?.controller === f.notControlledBy) return false;
  }

  if (f.withinHexesOf) {
    const d = bfsDistances(state.board.adjacency, f.withinHexesOf.hex);
    if ((d[hex] ?? Infinity) > f.withinHexesOf.range) return false;
  }
  if (f.outsideHexesOf) {
    const d = bfsDistances(state.board.adjacency, f.outsideHexesOf.hex);
    if ((d[hex] ?? Infinity) <= f.outsideHexesOf.range) return false;
  }

  if (f.hasChip && !loc?.chips?.some((c) => state.chips[c]?.chipId === f.hasChip)) return false;
  if (f.notHasChip && loc?.chips?.some((c) => state.chips[c]?.chipId === f.notHasChip)) return false;

  if (f.factionAffiliation) {
    const aff = LOCATIONS[loc?.locationId]?.affiliation;
    if (f.factionAffiliation === "unaffiliated") {
      if (aff) return false;
    } else if (f.factionAffiliation !== "any") {
      if (aff !== f.factionAffiliation) return false;
    }
  }

  if (f.strategicValue && loc?.strategicValue !== f.strategicValue) return false;

  if (f.hasAbility === "any") { if (!loc?.abilityId) return false; }
  else if (f.hasAbility === "none") { if (loc?.abilityId) return false; }
  else if (f.hasAbility && loc?.abilityId !== f.hasAbility) return false;

  return true;
}

export function pickHexByFilter(state, filter) {
  const matching = Object.keys(state.board.hexes).filter((h) => hexMatches(state, h, filter));
  if (!matching.length) return null;
  return state.rng.pick(matching);
}

// --- effect handlers — registered into the shared EFFECTS map ---

EFFECTS.PLACE_ENCOUNTER = function (state, e, ctx) {
  const enc = getEncounter(e.encounterId);
  if (!enc) return;
  placeEncounterMarker(state, enc, {
    hex: e.hex, hexFilter: e.hexFilter, expiresIn: e.expiresIn,
  }, ctx);
};

EFFECTS.DELIVER_ENCOUNTER = function (state, e, ctx) {
  deliverEncounter(state, e.encounterId, {
    mode: e.mode, recipient: e.recipient,
  }, ctx);
};
