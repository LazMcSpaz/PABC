// Game setup — builds the initial GameState (mechanical-spec §13.3):
// the board, players, locations, units, and the tiered Market.
import { CONFIG } from "./config.js";
import { FACTIONS, MINOR_FACTIONS, LOCATIONS, CAPITAL, ABILITIES, REACTIVES, factionDef } from "./content.js";
import { FIELD_ENCOUNTERS } from "./content/index.js";
import { makeRng } from "./rng.js";
import { createIdGen } from "./ids.js";
import { buildHexGrid, generateLayout, assignTerrainFeatures, assignRoads, assignRails, bfsDistances } from "./board.js";
import { recomputeInfluence } from "./influence.js";
import { recomputeVisibility } from "./visibility.js";
import { ensureDiplomacy, seedStanding } from "./diplomacy.js";
import { recomputeVp } from "./victory.js";

// The name a faction's `seq`-th unit musters under. Walks the faction's
// authored roster (content.js `unitNames`) in order; past the end it wraps
// and suffixes a numeral, so a long game reads "Grain Guard II" rather than
// fielding two formations with the same name. Deterministic in `seq` — no
// RNG draw — so a seeded game names its units identically every replay.
const NUMERALS = ["", " II", " III", " IV", " V", " VI", " VII", " VIII"];

// Claim the next roster slot for `owner` and advance the counter. Counts
// musters rather than living units, so a replacement never inherits a dead
// formation's name. Takes anything carrying `unitsMustered`, which is how
// setup can use it while state is still being assembled.
export function nextMusterIndex(carrier, owner) {
  carrier.unitsMustered = carrier.unitsMustered || {};
  const n = carrier.unitsMustered[owner] || 0;
  carrier.unitsMustered[owner] = n + 1;
  return n;
}
export function unitNameFor(owner, seq) {
  const roster = factionDef(owner)?.unitNames;
  if (!roster || !roster.length) return `${factionDef(owner)?.name || owner} unit`;
  const i = seq % roster.length;
  const lap = Math.floor(seq / roster.length);
  return roster[i] + (NUMERALS[lap] ?? ` ${lap + 1}`);
}

// A fresh unit with the full v0.2 field set (§16.3 / plan). `moveRemaining`
// seeds to base Movement; the owner's Upkeep refreshes it from effective.
//
// `seq` is how many units this faction has already mustered this game — the
// index into its name roster. It counts musters, not living units, so a
// replacement never inherits a dead formation's name.
export function makeUnit(uid, owner, node, factionName, seq = 0) {
  return {
    uid,
    owner,
    name: unitNameFor(owner, seq),
    node,
    baseStrength: CONFIG.unit.baseStrength,
    baseMovement: CONFIG.unit.baseMovement,
    strength: CONFIG.unit.baseStrength,
    movement: CONFIG.unit.baseMovement,
    moveRemaining: CONFIG.unit.baseMovement,
    actionsRemaining: 0, // acts from its owner's NEXT Upkeep (no same-turn strike)
    movedSinceUpkeep: false,
    fortified: false,
    contestsWon: 0,
    contestsSurvived: 0,
    veteran: false,
    chips: [],
    immobilizedUntil: null,
  };
}

export function createGame({
  seed = Date.now() & 0xffffffff,
  factionIds,
  humanFactionId = null,
  minors = [], // §18.4.1 — a VARIABLE subset of minor faction ids to seed
  // "small" | "medium" | "large" | "huge" (CONFIG.mapSizes). Omitted means
  // the legacy testMap board, so headless callers and the harness keep the
  // exact layouts they had before board size became selectable.
  mapSize = null,
  // How many Locations to seat, overriding the map size's default. The two are
  // deliberately independent: a small board crowded with settlements and a big
  // empty one are both legitimate games, and tying density to size made "small"
  // mean "few cities" whether or not that was what anyone wanted.
  locationBudget = null,
  // Optional rule switches from the setup screen. Every one defaults to the
  // behaviour the engine has always had, so headless callers and the harness
  // are untouched by their existence.
  //
  //   victory   which win conditions are live. Turning one off removes a way
  //             to end the game, never a way to score — VP is still tracked.
  //   fogOfWar  false leaves state.visibility EMPTY, which the whole
  //             visibility layer already reads as "everything is visible"
  //             (isHexVisible / canSee both fall through when a faction has
  //             no fog record). No second code path to keep in step.
  //   encounters  field = the share of spare hexes that become encounter
  //             sites; world = how many world triggers fire each round.
  rules = null,
} = {}) {
  const rng = makeRng(seed);
  const uid = createIdGen();
  const majors = factionIds || Object.keys(FACTIONS); // v0.1: default all four
  // §18.4.1 minors join as full factions (players) with a seat + unit. The
  // default headless game passes none, so it is byte-for-byte unchanged.
  const seededMinors = (minors || []).filter((m) => MINOR_FACTIONS[m]);
  const playing = [...majors, ...seededMinors];

  const size = (mapSize && CONFIG.mapSizes[mapSize]) || null;
  const grid = buildHexGrid(size ? size.rows : CONFIG.testMap);
  const layout = generateLayout(rng, grid, FACTIONS, LOCATIONS,
    {
      locationBudget: locationBudget ?? (size ? size.locations : CONFIG.testMapLocations),
      encounterShare: rules?.encounters?.field,
    });

  // chip-instance registry — every chip in play has a uid
  const chips = {};
  const mkChip = (chipId) => {
    const u = uid("chip");
    chips[u] = { uid: u, chipId };
    return u;
  };

  // --- board ---
  const hexes = {};
  for (const [id, hex] of Object.entries(grid.hexes)) {
    // v0.2 §16.6 — `terrain` is null for now; "mountain" gives defenders
    // +1. §19.4 adds `elevation` / `cover` flags (stamped below).
    hexes[id] = { id, row: hex.row, col: hex.col, type: layout.type[id], terrain: null, elevation: false, cover: false, road: false };
  }
  // §19.4 — stamp deterministic elevation / cover onto terrain hexes. Uses
  // an ISOLATED rng (derived from seed) so the main rng stream — and every
  // existing seed-dependent test — is byte-for-byte unchanged.
  assignTerrainFeatures(makeRng((seed ^ 0x9e3779b9) >>> 0), hexes);
  // §16.2 — lay road corridors between the faction capitals (deterministic
  // MST over the start hexes). Roads negate terrain movement cost along the
  // lane (a fast, contestable highway); cover/visibility are unaffected.
  // Roads tie settlements together, not just capitals — see assignRoads. The
  // value lookup drives how many links each one gets, so a city is a hub and a
  // town is a stop on the way.
  const settlementHexes = Object.keys(layout.placement);
  assignRoads(grid.adjacency, hexes, settlementHexes,
    (hexId) => LOCATIONS[layout.placement[hexId]]?.strategicValue || "medium");
  // Rail: pre-collapse trunk line between the major settlements. Generated,
  // never built (docs/rail-road-blockade-design.md §2.4).
  //
  // Stations are every seated Location in `CONFIG.rail.hubTiers`, not just the
  // four capitals: a trunk line stops at the big places, and stopping only at
  // capitals gave every board — 30 hexes or 127, ten cities or nineteen — the
  // same three links, with no faction holding both ends of one at setup.
  //
  // Sign-named settlements (`noRailTerminus`) are never stations: they grew up
  // around ROAD signage and a railway had no reason to stop at a lay-by. A line
  // may still run THROUGH their hex to reach somewhere that does matter.
  const railHubs = settlementHexes.filter((hexId) => {
    const def = LOCATIONS[layout.placement[hexId]];
    return def && !def.noRailTerminus
      && CONFIG.rail.hubTiers.includes(def.strategicValue);
  });
  const rails = assignRails(grid.adjacency, hexes, railHubs);

  // --- players ---
  const players = {};
  for (const fid of playing) {
    players[fid] = {
      id: fid,
      factionId: fid,
      isAI: humanFactionId != null && humanFactionId !== fid,
      // §18.4.1 minors are never the human (playable:false).
      isMinor: !!MINOR_FACTIONS[fid],
      // §18.5 global reputations — Menace (unjustified aggression) and Honor
      // (keeping your word). Tolerance / trust-floor are DERIVED, not stored.
      menace: 0,
      honor: CONFIG.diplomacy.honor.start,
      resource: 0,
      // `vp` is DERIVED (victory.js): bankedVp + whatever this faction holds
      // right now. `bankedVp` is the half that only ever goes up — recognition
      // summits, encounter grants, the alliance trickle.
      vp: 0,
      bankedVp: 0,
      tech: CONFIG.tech.start,
      actions: { remaining: CONFIG.baseActions, max: CONFIG.baseActions },
      // §17 Tech Wheel. `research` = permanent + Lab-derived (recomputed);
      // `techLevel` = derived band; `techWheel` = assigned node ids in
      // assignment order (LIFO peel on a level drop).
      research: 0,
      permanentResearch: 0,
      techLevel: 1,
      techWheel: [],
      unitCap: 1,
      hand: [],
      // Layer 5 (encounter & quest system) per spec §15.11
      tracks: { trust: 0, reputation: 0, alignment: 0 },
      flags: {},
      activeQuests: {},
      completedQuests: {},
      encounterCooldowns: {},
    };
  }

  // --- locations ---
  const locations = {};
  for (const [hexId, locId] of Object.entries(layout.placement)) {
    const def = LOCATIONS[locId];
    const isStart =
      def.affiliation &&
      playing.includes(def.affiliation) &&
      layout.factionStart[def.affiliation] === hexId;
    const controller = isStart ? def.affiliation : null;

    const locChips = [];
    let garrison = CONFIG.garrisonByValue[def.strategicValue];
    let production = rng.range(def.production[0], def.production[1]);
    if (isStart) {
      locChips.push(mkChip(CAPITAL.id));
      garrison += CONFIG.capital.garrisonBonus;
      production += CONFIG.capital.productionBonus;
    }

    // Location abilities are WITHDRAWN pending a redesign (2026-08-16). Every
    // High / Very High Location used to roll one at random from ABILITIES, and
    // it cost the Location a chip slot. The content did not earn its keep, so
    // nothing is assigned; the machinery in effects/actions/contest is intact
    // and a future pass only has to start handing ids out again.
    //
    // Side effect worth knowing: every High / Very High Location now keeps the
    // full CONFIG.chipSlotsByValue count instead of paying one for its ability.
    const abilityId = null;
    const chipSlots = CONFIG.chipSlotsByValue[def.strategicValue];

    locations[hexId] = {
      hexId,
      locationId: locId,
      controller,
      loyaltyOwner: controller,
      sections: Array(3).fill(controller || "neutral"),
      // §18.2 — starting Locations are all Capitals, inert and locked at
      // full Loyalty; neutral Locations have no Loyalty until captured.
      loyalty: controller ? CONFIG.loyalty.ceiling : null,
      chipSlots,
      chips: locChips,
      garrison,
      production,
      abilityId,
      strategicValue: def.strategicValue, // surfaced for the DSL controls_count helper
      // §20.3 City Output + guns/butter slider state. `output` is recomputed
      // each Upkeep; `buildSlider` f∈[0,1] splits it (bank scrap vs. build);
      // `activeBuild` is the current construction (null = none).
      output: production,
      buildSlider: CONFIG.economy.defaultSlider,
      buildProgress: 0,
      activeBuild: null,
      // Rail doc §3.4 — who gets this city's build output when it is building a
      // chip AND funding a blockade. "blockade" (the default) answers the map;
      // "chips" says the building matters more and makes the blockade wait.
      buildPriority: "blockade",
      // Rail doc §2.2 — hexId of a directly rail-linked settlement this one
      // pools its idle build output into, or null. Opt-in, never inferred.
      poolTarget: null,
    };
  }

  // §18.4.1 — give each seeded minor a SEAT: it takes a free neutral
  // Location nearest its associated major (so it sits as a regional power
  // near its kin/rival/foil). Landless minors (no free seat) stay political-
  // only actors. Done before units so the seat can host the minor's unit.
  const minorSeat = {}; // minor fid -> hexId
  for (const fid of seededMinors) {
    const major = MINOR_FACTIONS[fid].associatedMajor;
    const majorStart = layout.factionStart[major];
    const free = Object.values(locations).filter((l) => !l.controller && !Object.values(minorSeat).includes(l.hexId));
    if (!free.length) continue;
    const dist = majorStart ? bfsDistances(grid.adjacency, majorStart) : {};
    free.sort((a, b) => (dist[a.hexId] ?? 99) - (dist[b.hexId] ?? 99));
    const seat = free[0];
    seat.controller = fid;
    seat.loyaltyOwner = fid;
    seat.sections = [fid, fid, fid];
    seat.loyalty = CONFIG.loyalty.ceiling;
    minorSeat[fid] = seat.hexId;
  }

  // --- units: CONFIG.startingUnits per faction (§16.3), on/near start ---
  const units = {};
  // How many units each faction has mustered all game — the index into its
  // name roster. Kept on state (below) so recruits and reinforcements keep
  // counting from where setup left off.
  const musterBook = { unitsMustered: {} };
  for (const fid of majors) {
    const start = layout.factionStart[fid];
    for (let i = 0; i < (CONFIG.startingUnits || 1); i++) {
      // First unit on the start Location; extras on an adjacent
      // friendly/empty hex, else stacked on start (multi-token render).
      let node = start;
      if (i > 0) {
        const adj = (grid.adjacency[start] || []).find((h) => {
          const loc = locations[h];
          return !(loc && loc.controller && loc.controller !== fid);
        });
        node = adj || start;
      }
      const u = uid("unit");
      units[u] = makeUnit(u, fid, node, FACTIONS[fid].name, nextMusterIndex(musterBook, fid));
    }
  }
  // §18.4.1 — one defending unit on each seated minor's seat.
  for (const fid of seededMinors) {
    if (!minorSeat[fid]) continue;
    const u = uid("unit");
    units[u] = makeUnit(u, fid, minorSeat[fid], factionDef(fid).name, nextMusterIndex(musterBook, fid));
  }

  // §20.2 — the Market is retired. Chips are no longer drawn from a shared
  // pool; they are BUILT at Locations off Output (§20.4) and upgraded in
  // place (§20.5). No marketDeck / market rows are seeded.

  // --- field encounter deck (§15.8). Each authored encounter expands
  // into `copies` entries (id strings — encounters carry no per-instance
  // state, unlike chips).
  const encounterDeck = (() => {
    const seeds = [];
    for (const def of Object.values(FIELD_ENCOUNTERS)) {
      const copies = def.copies || 1;
      for (let i = 0; i < copies; i++) seeds.push(def.id);
    }
    return rng.shuffle(seeds);
  })();

  // --- reactive deck. Every Reactive's `copies` expand into instances
  // stored in the shared chips registry; the deck holds those uids.
  const reactiveDeck = (() => {
    const seeds = [];
    for (const def of Object.values(REACTIVES)) {
      for (let i = 0; i < (def.copies || 1); i++) {
        const u = uid("card");
        chips[u] = { uid: u, chipId: def.id };
        seeds.push(u);
      }
    }
    return rng.shuffle(seeds);
  })();

  // --- deal opening reactives. Without these, defenders can never react
  // and the demo loses its tactical flavour. Only deal in demo mode
  // (humanFactionId set) so the headless harness keeps its determinism.
  if (humanFactionId != null) {
    const handSize = 2;
    for (const fid of playing) {
      for (let i = 0; i < handSize && reactiveDeck.length; i++) {
        players[fid].hand.push(reactiveDeck.shift());
      }
    }
  }

  const state = {
    seed,
    // Rule switches, normalised once here so every reader gets a complete
    // object and no site has to cope with a partial or missing `rules`.
    rules: {
      victory: {
        conquest: rules?.victory?.conquest !== false,
        recognition: rules?.victory?.recognition !== false,
        elimination: rules?.victory?.elimination !== false,
      },
      fogOfWar: rules?.fogOfWar !== false,
      worldEncountersPerRound: rules?.encounters?.world ?? CONFIG.encounters.worldPerRound,
    },
    rng, // live seeded generator — contest dice draw from it
    nextId: uid, // shared instance id generator — used by runtime Recruit
    humanFactionId,
    round: 1,
    phase: "Upkeep",
    turnOrder: [...playing],
    activeIndex: 0,
    players,
    // `rails` is the link registry: the 1-MP hop is a property of the LINK,
    // not of the hexes it runs over, so hex.rail alone cannot express it.
    board: { hexes, adjacency: grid.adjacency, rails },
    locations,
    units,
    unitsMustered: musterBook.unitsMustered,
    chips,
    encounterDeck,
    reactiveDeck,
    discards: { encounter: [], reactive: [] },
    removed: [],
    modifiers: [],
    pendingActionGrants: [],
    surcharges: [],
    winnerId: null,
    reinforcements: [], // v0.2 §16.5 — pending field-reinforcement packets
    pendingSalvage: [], // interactive salvage queue (UI resolves via resolveSalvage)
    resaleRow: [],      // resold chips, 4-slot FIFO, acquirable at full cost
    hexLoot: {},        // hexId -> [chipUid] dropped when no unit could claim them
    log: [],
    // Layer 5 (encounter & quest system) per spec §15.11
    world: {
      controlHistory: Object.values(locations)
        .filter((l) => l.controller)
        .map((l) => ({ hex: l.hexId, controller: l.controller, fromRound: 0, toRound: null })),
      raidCounts: Object.fromEntries(playing.map((f) => [f, 0])),
      ignoreCounts: Object.fromEntries(playing.map((f) => [f, 0])),
      eventTimeline: [],
      encounterHexCooldowns: {},
      encounterMarkers: {},
      // §18.3 Influence & ZoC — seeded by recomputeInfluence below. `zoc`
      // is the derived owner map (hexId -> fid|null); `influence` is the
      // per-faction scalar field (fid -> hexId -> number).
      influence: {},
      zoc: {},
      // §17.7 Listening Posts — hexId -> { owner, hex, strength, paid, revealedTo }.
      listeningPosts: {},
      // Blockades (rail doc §3) — hexId -> { owner, hex, done, progress, cost,
      // builder, chips }. Under construction while `done` is false.
      blockades: {},
    },
    factionStanding: Object.fromEntries(
      playing.map((fid) => [fid, Object.fromEntries(playing.map((pid) => [pid, 0]))]),
    ),
    triggerCooldowns: {},
    deferred: [],
    activeQuests: {},
  };

  // §18.3 — establish the starting Influence field + ZoC owner map so the
  // HUD and routing have them before the first turn.
  recomputeInfluence(state);
  // §19 — seed each faction's fog from its starting sources (units + its
  // Capital + ZoC). Quietly: no spot/explore events at game creation.
  state.visibility = {};
  // Fog OFF means never building the per-faction records at all. Leaving them
  // empty is what the readers already treat as full sight, so "no fog" needs
  // no special case anywhere downstream.
  if (state.rules.fogOfWar) {
    for (const fid of playing) recomputeVisibility(state, fid, { emitEvents: false });
  }
  // §18.4–§18.5 — init the diplomacy layer + global reputations, then seed
  // faction↔faction Standing from temperament compatibility + relationship
  // + a PER-SEED jitter (alliance variety). The jitter uses an ISOLATED rng
  // so the main contest stream is untouched; human rows start neutral.
  ensureDiplomacy(state);
  seedStanding(state, makeRng((seed ^ 0x517cc1b7) >>> 0));
  // VP is held, not banked (victory.js) — so every faction opens with whatever
  // its starting homeland is worth, rather than at zero. Quietly: nobody has
  // "gained" anything yet.
  recomputeVp(state, { emitEvents: false });
  return state;
}
