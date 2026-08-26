// Encounter delivery (mechanical-spec §15.5, §15.8). One dispatcher
// handles all three modes — `private`, `public`, `placement` — plus
// the field-encounter draw on Move-end. The encounter schema is shared
// across all delivery paths; only the wiring differs.
//
// Registers the `PLACE_ENCOUNTER` and `DELIVER_ENCOUNTER` handlers onto
// the existing EFFECTS map at module load, so effects.js stays free of
// circular imports.
import { WORLD_ENCOUNTERS } from "./content/index.js";
// The merged field deck: the editor's export plus the hand-authored cards in
// ./content/field-encounters-repo.js, which the exporter never touches.
import { ALL_FIELD_ENCOUNTERS } from "./content/field-encounters-repo.js";
import { LOCATIONS } from "./content.js";
import { normalizeEncounter } from "./content-loader.js";
import { evalCond } from "./dsl.js";
import { applyEffects, EFFECTS, __bindWorldRegistry } from "./effects.js";
import { resolveTargets, resolveHex } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { emit } from "./events.js";
import { hasTechNode } from "./tech.js";
import { spendBeat, noteBeatHeld } from "./beatBudget.js";
import { applyPatchTo, getPatch } from "./contentPatch.js";
import { pickChoice } from "./choicePolicy.js";
import { CHIPS } from "./content.js";
import { CONFIG } from "./config.js";

// One-time normalisation — flatten {type, params} once instead of on
// every delivery. Editor-added fields (imagePath, outcomeText, …) pass
// through.
const FIELD = normalizeAll(ALL_FIELD_ENCOUNTERS);
const WORLD = normalizeAll(WORLD_ENCOUNTERS);

function normalizeAll(rawMap) {
  const out = {};
  for (const [id, raw] of Object.entries(rawMap)) out[id] = normalizeEncounter(raw);
  return out;
}

export function getEncounter(id) {
  const base = WORLD[id] || FIELD[id] || null;
  // Content Edit Mode's live rewrites (contentPatch.js). Same reasoning as
  // quests.js getQuest: one door in, so one place to merge.
  return base ? applyPatchTo(base, getPatch(id)) : null;
}

/** The encounter as authored, ignoring any live edits — the export's "from". */
export function getEncounterSource(id) {
  return WORLD[id] || FIELD[id] || null;
}

/** Every authored encounter, unpatched, for the editor's content browser. */
export function allEncounterSources() {
  return { field: { ...FIELD }, world: { ...WORLD } };
}

/**
 * The live world-encounter registry. triggers.js reads through this rather
 * than closing over the imported constant, so injected content is visible to
 * trigger evaluation — without it the trigger pipeline can only ever see
 * whatever was in src/game/content at module load, and a harness driving
 * authored content sees an empty world.
 */
export function worldEncounters() {
  return WORLD;
}

/**
 * The live field registry, for setup.js's deck seeding.
 *
 * Its own accessor for the same reason `worldEncounters` has one: setup used
 * to build the deck straight off the generated import, so a card injected by
 * `registerFieldEncounter` — or added in the repo seam — existed in the
 * registry and was never dealt. A deck built from a different list than the
 * one delivery reads is a deck with cards that cannot come up.
 */
export function fieldEncounters() {
  return FIELD;
}

/**
 * Inject an encounter at runtime. Mirrors quests.js registerQuest, and
 * exists for the same reason: the harness and the coverage walk need to
 * drive authored content without writing generated files first.
 */
export function registerWorldEncounter(def) {
  if (!def?.id) return;
  WORLD[def.id] = normalizeEncounter(def);
}
export function registerFieldEncounter(def) {
  if (!def?.id) return;
  FIELD[def.id] = normalizeEncounter(def);
}

// --- delivery dispatch -----------------------------------------------

// What an AI seat (or the headless harness) answers with.
//
// This used to be `return 0` — the first eligible choice, on every card, for
// every faction. choicePolicy.js scores the options against the faction's
// temperament instead, so the Lakers take the fight, the Goldgrass buy their
// way out of it, the Versari take the thing that opens a door later, and the
// Free Plainers take whatever pays today. It is deterministic, so a seed still
// replays identically.
function headlessPick(state, cardId, eligible, pid, ctx) {
  return pickChoice(state, pid, cardId, eligible, ctx);
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
  // Choice conditions are the recipient's question — "can YOU take this
  // option" — so they resolve `active` to whoever is being shown the card,
  // which is not necessarily the seat whose turn it is.
  const subCtx = { ...ctx, sourcePlayer: pid, asPlayer: pid };
  const eligible = (enc.choices || []).filter((c) =>
    c.condition == null ? true : evalCond(state, c.condition, subCtx),
  );
  if (!eligible.length) return null;

  // The human player, with no interactive channel open.
  //
  // This is the case that made every world encounter and every quest beat
  // invisible: they are delivered from the round-end pipeline (turn.js
  // runRoundEnd), which is synchronous and passes no `ctx.interact`, so
  // headlessPick silently took choice 0 on the player's behalf and the card
  // was never shown. A UI cannot answer synchronously from inside endTurn.
  //
  // So instead of deciding for them, park it: the encounter goes on a queue
  // with everything needed to resolve it later, and the UI drains that queue
  // once control returns. AI players and the headless harness are unaffected
  // — they still resolve inline, which keeps the harness deterministic.
  if (pid === state.humanFactionId && !ctx.interact) {
    return queueForPlayer(state, enc, pid, eligible, subCtx);
  }

  let pickedIdx = headlessPick(state, enc.id, eligible, pid, subCtx);
  if (ctx.interact) {
    const picked = ctx.interact({
      kind: "encounterChoice",
      encounter: enc.id, player: pid,
      title: enc.title, art: enc.art, imagePath: enc.imagePath, text: enc.text,
      choices: eligible.map((c) => ({ id: c.id, label: c.label, outcomeText: c.outcomeText,
                                      dismiss: c.dismiss === true })),
    });
    const idx =
      typeof picked === "number"
        ? picked
        : eligible.findIndex((c) => c.id === picked || c.label === picked);
    // A UI's `interact` is opened for ONE card — the field encounter the
    // move is about to draw. A Move can surface a second one in the same
    // action (walking onto a hex that also holds a discovered quest beat),
    // and that card's id is not the one the UI is answering for. It used to
    // fall through to headlessPick and resolve at choice 0 without ever
    // being shown: the player lost a unit, or a quest, to a decision nobody
    // made. Park it instead, exactly as the no-channel path does.
    if (idx >= 0) pickedIdx = idx;
    else if (pid === state.humanFactionId) return queueForPlayer(state, enc, pid, eligible, subCtx);
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

// --- pending player encounters ---------------------------------------
//
// A queue of encounters waiting on a human decision. Each entry carries the
// definition (so the UI can render text, art and choices without another
// lookup) and the slice of context the effects will need when they finally
// run — who it is for, where it happened, and which quest beat it belongs to.

function queueForPlayer(state, enc, pid, eligible, subCtx) {
  state.pendingEncounters = state.pendingEncounters || [];
  // Keyed off a monotonic counter, not the queue's length. Length is reused
  // the moment an entry is answered and spliced out, so the same card queued
  // twice across a game could land on the same id — and the UI tracks the
  // open card by id ("is the one I am showing still in the queue?").
  state.pendingEncounterSeq = (state.pendingEncounterSeq || 0) + 1;
  const entry = {
    id: `pending-${state.pendingEncounterSeq}-${enc.id}`,
    encounterId: enc.id,
    recipient: pid,
    title: enc.title ?? null,
    text: enc.text ?? "",
    art: enc.art ?? null,
    imagePath: enc.imagePath ?? null,
    choices: eligible.map((c) => ({
      id: c.id, label: c.label, outcomeText: c.outcomeText ?? null,
      // Set on the single synthesised choice of a narrative beat, so the UI can
      // show an acknowledgement rather than a one-item list of options.
      dismiss: c.dismiss === true,
    })),
    // Only the transferable parts of ctx — no functions, so this stays
    // plain data that could be serialised with the rest of the state.
    ctx: {
      sourcePlayer: pid,
      // The card is theirs; its effects must resolve as theirs whenever
      // they get round to answering it.
      asPlayer: pid,
      sourceHex: subCtx.sourceHex ?? null,
      sourceUnit: subCtx.sourceUnit ?? null,
      questId: subCtx.questId ?? null,
      beatId: subCtx.beatId ?? null,
      claimant: subCtx.claimant ?? null,
    },
    def: enc,
    queuedAt: state.round,
  };
  state.pendingEncounters.push(entry);
  return { encounterId: enc.id, recipient: pid, queued: true };
}

/** Anything waiting on this player right now. */
export function pendingEncountersFor(state, pid) {
  return (state.pendingEncounters || []).filter((p) => p.recipient === pid);
}

/**
 * Resolve the queued encounter `pendingId` by taking choice `choiceId`.
 * This is the deferred half of presentToPlayer: same events, same effect
 * application, same ordering — only the decision arrives later.
 */
export function resolvePendingEncounter(state, pendingId, choiceId, ctx = {}) {
  const queue = state.pendingEncounters || [];
  const idx = queue.findIndex((p) => p.id === pendingId);
  if (idx < 0) return null;
  const entry = queue[idx];
  queue.splice(idx, 1);

  const enc = entry.def;
  const choice = (enc.choices || []).find((c) => c.id === choiceId)
    // Fall back to the first still-offered choice rather than doing nothing,
    // so a stale id from the UI cannot strand the queue.
    || (enc.choices || []).find((c) => entry.choices.some((e) => e.id === c.id));
  if (!choice) return null;

  const subCtx = { ...ctx, ...entry.ctx };
  emit(state, "encounter_delivered", {
    encounter: enc.id, recipient: entry.recipient,
    choiceId: choice.id, choiceLabel: choice.label,
  });
  applyChoiceEffects(state, choice, entry.recipient, subCtx);
  emit(state, "encounter_resolved", {
    encounter: enc.id, recipient: entry.recipient, choiceId: choice.id,
  });
  return { recipient: entry.recipient, choiceId: choice.id, choiceLabel: choice.label };
}

// --- field-encounter draw (§15.8) ------------------------------------

// Called from actions.js runMove when a unit ends Move on an encounter
// hex that isn't in refresh cooldown. Draws the top of the deck, sets
// the hex's refresh cooldown, and delivers as a private encounter to
// the unit's owner.
const FIELD_HEX_COOLDOWN = 3;

// Any chip carrying `encounterRedraws` (Recon Team today; content may add
// alternatives later) on `pid`'s Locations grants that many encounter
// discards, stacking with the §17.5 Intelligence entry node. Schema-driven
// rather than an id special case — content.js's own header says the
// engine never branches on chip ids, so this reads the field like every
// other chip bonus does.
export function encounterRedrawBudget(state, pid, unit) {
  let n = hasTechNode(state, pid, "int-entry") ? 1 : 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) n += CHIPS[state.chips[c]?.chipId]?.encounterRedraws || 0;
  }
  // Trailwise: the drawing unit's own chips grant redraws too.
  for (const c of unit?.chips || []) {
    if (state.chips[c]?.disabled) continue;
    n += CHIPS[state.chips[c]?.chipId]?.encounterRedraws || 0;
  }
  return n;
}

// What this faction has already been shown, so the road stops repeating
// itself at them. An array rather than a Set because game state is saved,
// cloned and replayed, and a Set survives none of those.
function seenBy(state, pid) {
  state.seenEncounters = state.seenEncounters || {};
  state.seenEncounters[pid] = state.seenEncounters[pid] || [];
  return state.seenEncounters[pid];
}

// Fold the discard pile back into the deck.
//
// NOT the old "replace an empty deck with the discards" reshuffle. Once a
// draw can skip cards, the deck can be non-empty and still hold nothing this
// player has not already seen — while the discard pile holds three cards the
// AI drew and they never did. Appending keeps both facts true: the cards
// still in the deck stay in the deck, and the ones somebody else has already
// turned over come back round for whoever has not.
function foldDiscardsBack(state) {
  const pile = state.discards.encounter;
  if (!pile?.length) return false;
  state.encounterDeck = [...(state.encounterDeck || []), ...state.rng.shuffle(pile)];
  state.discards.encounter = [];
  return true;
}

// The index of the next card to offer `pid`, or -1.
//
// ONE CARD, ONE PLAYER, ONCE. The deck is shared by every faction, so before
// this the same eleven cards cycled past everyone: 28 draws from a 22-card
// deck in a nine-round playtest, and the human saw four cards twice. Skipping
// what this player has already been shown makes the shared deck do the thing
// it is good at — keeping a card alive for whoever has not met it — without
// making the road repeat itself at anyone.
//
// A skipped card is NOT consumed. It stays exactly where it is for the
// factions that have not seen it, which is the whole point of the pile being
// shared rather than dealt out per player at setup.
function nextOffer(state, pid) {
  const deck = state.encounterDeck || [];
  if (!CONFIG.encounters?.fieldOncePerPlayer) {
    if (!deck.length && !foldDiscardsBack(state)) return -1;
    return state.encounterDeck.length ? 0 : -1;
  }
  const seen = seenBy(state, pid);
  const find = () => (state.encounterDeck || []).findIndex((id) => !seen.includes(id));
  let i = find();
  if (i < 0 && foldDiscardsBack(state)) i = find();
  // -1 here means this faction has genuinely met every card in the game. The
  // road going quiet for them is the honest outcome and the one the design
  // asked for; `fieldOncePerPlayer: 0` is the switch back to repeats.
  return i;
}

export function drawFieldEncounter(state, unit, ctx = {}) {
  let offer = nextOffer(state, unit.owner);
  if (offer < 0) return null;

  // §17.5 Intelligence (Recon) + the Recon Team chip each grant one
  // discard-and-redraw. A discard sends the offered card to the deck bottom
  // and offers the next one this player has not seen; after the last discard
  // the player is committed. Headless / AI (no ctx.interact) commit to the
  // first offer, so the harness stays deterministic.
  let redraws = encounterRedrawBudget(state, unit.owner, unit);
  while (redraws > 0 && ctx.interact && state.encounterDeck.length > 1) {
    const wantDiscard = ctx.interact({
      kind: "encounterRedraw",
      encounter: state.encounterDeck[offer],
      player: unit.owner,
      remaining: redraws,
    });
    if (!wantDiscard) break;
    state.encounterDeck.push(...state.encounterDeck.splice(offer, 1));
    const next = nextOffer(state, unit.owner);
    if (next < 0) break; // nothing else unseen — keep what is in hand
    offer = next;
    redraws -= 1;
  }

  const [encounterId] = state.encounterDeck.splice(offer, 1);
  state.discards.encounter.push(encounterId);
  const seen = seenBy(state, unit.owner);
  if (!seen.includes(encounterId)) seen.push(encounterId);
  state.world.encounterHexCooldowns[unit.node] = state.round + FIELD_HEX_COOLDOWN;
  return deliverEncounter(
    state, encounterId,
    { mode: "private", recipient: unit.owner },
    // §18.3 — carry the draw hex so a choice's `zoc_contains` condition
    // can read "recipient's ZoC contains this hex" without extra wiring.
    { ...ctx, sourcePlayer: unit.owner, sourceHex: unit.node, sourceUnit: unit.uid },
  );
}

// --- placement marker (§15.5) ----------------------------------------

function placeEncounterMarker(state, enc, options, ctx) {
  const hex =
    options.hex ||
    pickHexByFilter(state, options.hexFilter || enc.placementFilter, ctx);
  if (!hex) return null;
  const expiresIn = options.expiresIn ?? enc.expiresIn;
  // A hex holds a QUEUE of discoveries, not one. This used to be a single
  // slot, and with 22 quests dropping "discovered" openers onto a board
  // that had 7 terrain hexes to offer, most placements silently destroyed
  // an earlier one — the quest stayed active with its opening beat sitting
  // on a tile that no longer pointed at it. Nothing logged; the quest just
  // never happened.
  state.world.encounterMarkers = state.world.encounterMarkers || {};
  const queue = markerQueue(state, hex);
  queue.push({
    encounterId: enc.id,
    // WHO HAS A REASON TO KNOW THIS IS HERE.
    //
    // Every `discovered` beat drops a marker, and the board used to draw none
    // of them — so a nine-round playtest put about twenty invisible sites on a
    // fifty-nine-hex map and the player found four, by walking over them. The
    // fix is NOT to draw them all. A marker on every available site turns the
    // map into a to-do list and answers a question the fiction never asked:
    // how would you know to go there?
    //
    // So a marker is drawn only for players with a reason. The trail a scene
    // just pointed you down is a reason; a quest you have never heard of is
    // not. `placeEncounterMarker` does not decide that — its caller does, and
    // passes the answer in. An empty list means the site is real, reachable
    // and on the map, and nobody can see it yet.
    knownTo: options.knownTo ? [...options.knownTo] : [],
    // Quest beats are encounter-SHAPED but live in the quest registry, not
    // in WORLD/FIELD — so `getEncounter(id)` cannot find one and a marker
    // that stored only an id could never be resolved. Every "discovered"
    // quest beat went onto the map and stayed there. Carrying the def (and
    // the quest context its ADVANCE_QUEST needs to tell routing from
    // advancing) makes the marker self-contained whatever dropped it.
    def: enc,
    questId: ctx?.questId ?? null,
    beatId: ctx?.beatId ?? null,
    claimant: ctx?.claimant ?? null,
    expiresAt: expiresIn != null ? state.round + expiresIn : null,
    placedAt: state.round,
  });
  emit(state, "location_spawned", {
    hex, kind: "encounter-marker", encounterId: enc.id,
    // The feed line differs by this: "a new site is marked" is only true if
    // somebody can see it. Carrying the audience means the feed can say where
    // when it is known, and stay silent when it is not.
    knownTo: options.knownTo ? [...options.knownTo] : [],
  });
  return { placedAt: hex };
}

// Called from runMove if the unit ends Move on a hex carrying a marker.
// Resolves as a private encounter to the unit's owner and removes the
// marker (one-shot — markers don't refresh).
export function resolveMarkerOnHex(state, hex, unit, ctx = {}) {
  const markers = state.world?.encounterMarkers;
  if (!markers?.[hex]) return null;
  if (!markerQueue(state, hex).length) return null;
  // Take the oldest discovery waiting here; any others keep waiting, so a
  // busy tile is visited more than once rather than losing its backlog.
  const queue = markerQueue(state, hex);
  // A quest marker belongs to the RUN that placed it. Quest runs are per
  // player, so the same `discovered` opener now drops a marker for each player
  // who takes that quest — and without this, whoever walked onto any of them
  // received it, including a player who had already played that beat in their
  // own run. That is how the same opener was delivered to one player twice.
  //
  // A marker with no claimant (a world encounter placed by PLACE_ENCOUNTER) is
  // open to anyone, as before.
  const idx = queue.findIndex((m) => !m.claimant || m.claimant === unit.owner);
  if (idx < 0) return null;

  // A quest beat found on the map counts against the same per-turn allowance
  // as one delivered directly (CONFIG.quests.beatsPerTurn) — the player is
  // reading a card either way. Over the cap the marker is NOT consumed: it
  // stays on its hex, and walking back onto it next turn picks it up. A world
  // encounter placed by PLACE_ENCOUNTER carries no questId and is not a beat,
  // so it is unaffected.
  const pending = queue[idx];
  if (pending.questId && !spendBeat(state, unit.owner)) {
    noteBeatHeld(state, unit.owner, pending.questId, pending.beatId, "beats-per-turn");
    // Truthy, deliberately. runMove reads a falsy result as "no marker here"
    // and falls through to the field-encounter deck draw — which would answer
    // "you have read enough for one turn" by dealing another card.
    return { held: true, hex, beatId: pending.beatId };
  }

  const marker = queue.splice(idx, 1)[0];
  if (!marker) return null;
  if (!queue.length) delete markers[hex];
  // §18.3 — carry the marker hex for `zoc_contains` choice conditions, and
  // the quest context so a beat delivered by discovery advances (and routes)
  // exactly as one delivered directly would.
  const markerCtx = {
    ...ctx,
    sourcePlayer: unit.owner,
    sourceHex: hex,
    sourceUnit: unit.uid,
    ...(marker.questId ? { questId: marker.questId } : {}),
    ...(marker.beatId ? { beatId: marker.beatId } : {}),
    ...(marker.claimant ? { claimant: marker.claimant } : {}),
  };
  // A quest discovered at a place remembers that place. Its later beats are
  // usually delivered directly (conditional / auto) and carry no hex of
  // their own, but they still talk about where it started — "this ford does
  // not go dark to you again", "leave it as it stands". Without this,
  // `encounter-hex` in an ending beat resolves to nothing and the effect
  // fizzles silently.
  if (marker.questId) {
    // Quest runs are per player, so remember the origin on the run belonging
    // to whoever walked onto the marker (falling back to the marker's own
    // claimant when it carries one).
    const owner = marker.claimant || unit.owner;
    const aq = state.activeQuests?.[`${marker.questId}|${owner}`];
    if (aq && !aq.originHex) aq.originHex = hex;
  }
  const def = marker.def || getEncounter(marker.encounterId);
  if (!def) return null;
  return deliverEncounterDef(
    state, def, { mode: "private", recipient: unit.owner }, markerCtx,
  );
}

// --- HexFilter resolver (content-schema §4) --------------------------

// A filter's `controlledBy` / `notControlledBy` may name a faction outright
// (`goldgrass`) or use a target token (`active`). Both spellings appear in the
// authored corpus, and the token form used to be dropped on the floor: the
// test was `state.players[f.notControlledBy]`, which is false for "active", so
// the whole clause was skipped. q_signal and q_wire both open on
// `notControlledBy: "active"` — "the settlement you're passing", the set you
// don't recognise the traffic on — and both could therefore be placed in the
// player's own capital, which is the one place the scene cannot happen.
function filterPlayer(state, token, ctx) {
  if (state.players[token]) return token;
  return resolveTargets(state, token, ctx)[0] || null;
}

function hexMatches(state, hex, f, ctx = {}) {
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
  } else if (f.controlledBy) {
    const want = filterPlayer(state, f.controlledBy, ctx);
    if (!want || loc?.controller !== want) return false;
  }

  if (f.notControlledBy === "any-player") {
    if (loc?.controller) return false;
  } else if (f.notControlledBy) {
    const want = filterPlayer(state, f.notControlledBy, ctx);
    if (want && loc?.controller === want) return false;
  }

  // Range filters anchor on another hex. The anchor may be a symbolic token
  // ("encounter-hex"), and on a freshly generated board it may name a hex
  // that does not exist at all — a named location that did not get placed,
  // or a filter authored against a different map size. bfsDistances walks
  // the adjacency table directly, so an unknown anchor used to throw and
  // take down whatever turn was placing the marker. An anchor that cannot
  // be resolved now simply matches nothing, which is how every other
  // unsatisfiable clause in this filter already behaves.
  if (f.withinHexesOf) {
    const anchor = resolveHex(state, f.withinHexesOf.hex, ctx);
    if (!anchor || !state.board.adjacency[anchor]) return false;
    const d = bfsDistances(state.board.adjacency, anchor);
    if ((d[hex] ?? Infinity) > f.withinHexesOf.range) return false;
  }
  if (f.outsideHexesOf) {
    const anchor = resolveHex(state, f.outsideHexesOf.hex, ctx);
    // An unresolvable "stay away from X" is vacuously satisfied: there is
    // no X to be near. That is the opposite default to withinHexesOf, and
    // deliberately so — both fail in the direction that loses no content.
    if (anchor && state.board.adjacency[anchor]) {
      const d = bfsDistances(state.board.adjacency, anchor);
      if ((d[hex] ?? Infinity) <= f.outsideHexesOf.range) return false;
    }
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

  // Terrain sub-type + road. The terrain+roads work track sets these on
  // each hex; until then `h.terrain` is null and `h.road` is undefined,
  // so a content author asking for a specific terrain or road simply
  // gets no matches — the filter degrades cleanly.
  if (f.terrain && f.terrain !== "any" && h.terrain !== f.terrain) return false;
  if (f.hasRoad === true && !h.road) return false;
  if (f.hasRoad === false && h.road) return false;

  return true;
}

/**
 * Pick a hex matching `filter`.
 *
 * `filter` may be a single HexFilter object OR an **ordered list** of them,
 * tried in order until one matches. The list is the fallback clause content
 * could not otherwise express: `hexMatches` ANDs every key and has no OR and
 * no NOT, so "put it beside the tracks if you can, anywhere in their land if
 * you can't" had no way to be written.
 *
 * That mattered because a filter which merely *usually* matches is not a
 * softer version of one that always does — a beat whose placement misses is
 * a beat nobody sees, and where a later quest gates on a flag only that beat
 * writes, one unlucky board silently costs two quests. An ordered list lets
 * an author state the preferred placement and the guaranteed one, and get
 * both.
 */
export function pickHexByFilter(state, filter, ctx = {}) {
  if (Array.isArray(filter)) {
    for (const f of filter) {
      const hit = pickHexByFilter(state, f, ctx);
      if (hit) return hit;
    }
    return null;
  }
  const matching = Object.keys(state.board.hexes).filter((h) => hexMatches(state, h, filter, ctx));
  if (!matching.length) return null;
  // Spread discoveries out: prefer a matching hex that is not already
  // holding one. Falls back to the full set when every match is occupied,
  // so a congested board stacks rather than failing to place.
  const free = matching.filter((h) => !markerQueue(state, h, false).length);
  return state.rng.pick(free.length ? free : matching);
}

/**
 * The same filter, restricted to Locations `pid` currently controls.
 *
 * quests.js asks this to decide whether a settlement beat is a journey or a
 * scene: a beat set at a Goldgrass hall is a journey to everyone except the
 * player who holds one, who is already standing in it. Returns null when
 * nothing matches, which is the "then it stays a marker" answer.
 *
 * Held is `controller`, not affiliation — the filter has usually already said
 * which faction the place BELONGS to, and this asks the different question of
 * who holds it now.
 */
export function pickHeldHexByFilter(state, filter, pid, ctx = {}) {
  if (!pid) return null;
  if (Array.isArray(filter)) {
    for (const f of filter) {
      const hit = pickHeldHexByFilter(state, f, pid, ctx);
      if (hit) return hit;
    }
    return null;
  }
  const held = Object.keys(state.board.hexes).filter((h) =>
    state.locations[h]?.controller === pid && hexMatches(state, h, filter, ctx));
  if (!held.length) return null;
  return state.rng.pick(held);
}

// The discovery queue on a hex. Tolerates the pre-queue single-object shape
// so a state saved before this change still reads.
function markerQueue(state, hex, create = true) {
  const markers = state.world?.encounterMarkers;
  if (!markers) return [];
  let q = markers[hex];
  if (q == null) {
    if (!create) return [];
    q = markers[hex] = [];
  } else if (!Array.isArray(q)) {
    q = markers[hex] = [q];
  }
  return q;
}

export { markerQueue };

// --- effect handlers — registered into the shared EFFECTS map ---

EFFECTS.PLACE_ENCOUNTER = function (state, e, ctx) {
  const enc = getEncounter(e.encounterId);
  if (!enc) return;
  placeEncounterMarker(state, enc, {
    hex: e.hex, hexFilter: e.hexFilter, expiresIn: e.expiresIn,
  }, ctx);
};

EFFECTS.DELIVER_ENCOUNTER = function (state, e, ctx) {
  // Per-beat gating — the author can attach a `condition` to the routing
  // effect itself. If it evaluates false, the next beat is silently
  // skipped (the choice's other effects still run). Lets a choice
  // probe "if you have a medic chip, you advance to the rescue beat;
  // otherwise the encounter just ends."
  if (e.condition != null && !evalCond(state, e.condition, ctx)) {
    emit(state, "encounter_delivery_skipped", {
      encounterId: e.encounterId, reason: "condition_false",
    });
    return;
  }
  deliverEncounter(state, e.encounterId, {
    mode: e.mode, recipient: e.recipient,
  }, ctx);
};

// Let effects.js (PEEK scope:"settlement") see the live world registry
// without importing this module and closing the cycle.
__bindWorldRegistry(worldEncounters);
