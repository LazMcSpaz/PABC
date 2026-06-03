// Game setup — builds the initial GameState (mechanical-spec §13.3):
// the board, players, locations, units, and the tiered Market.
import { CONFIG } from "./config.js";
import { FACTIONS, MINOR_FACTIONS, LOCATIONS, CAPITAL, ABILITIES, REACTIVES, factionDef } from "./content.js";
import { FIELD_ENCOUNTERS } from "./content/index.js";
import { makeRng } from "./rng.js";
import { createIdGen } from "./ids.js";
import { buildHexGrid, generateLayout, assignTerrainFeatures, assignRoads, bfsDistances } from "./board.js";
import { recomputeInfluence } from "./influence.js";
import { recomputeVisibility } from "./visibility.js";
import { ensureDiplomacy, seedStanding } from "./diplomacy.js";

// A fresh unit with the full v0.2 field set (§16.3 / plan). `moveRemaining`
// seeds to base Movement; the owner's Upkeep refreshes it from effective.
export function makeUnit(uid, owner, node, factionName) {
  return {
    uid,
    owner,
    name: `${factionName} unit`, // flavor names arrive with content
    node,
    baseStrength: CONFIG.unit.baseStrength,
    baseMovement: CONFIG.unit.baseMovement,
    strength: CONFIG.unit.baseStrength,
    movement: CONFIG.unit.baseMovement,
    moveRemaining: CONFIG.unit.baseMovement,
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
} = {}) {
  const rng = makeRng(seed);
  const uid = createIdGen();
  const majors = factionIds || Object.keys(FACTIONS); // v0.1: default all four
  // §18.4.1 minors join as full factions (players) with a seat + unit. The
  // default headless game passes none, so it is byte-for-byte unchanged.
  const seededMinors = (minors || []).filter((m) => MINOR_FACTIONS[m]);
  const playing = [...majors, ...seededMinors];

  const grid = buildHexGrid(CONFIG.testMap);
  const layout = generateLayout(rng, grid, FACTIONS, LOCATIONS);

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
  assignRoads(grid.adjacency, hexes, Object.values(layout.factionStart));

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
      vp: 0,
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

    // Every High / Very High location gets one random ability (§6.3),
    // and that ability costs the location one of its chip slots.
    let abilityId = null;
    if (def.strategicValue === "high" || def.strategicValue === "veryHigh") {
      const pool = Object.values(ABILITIES).filter(
        (a) => a.eligibleTier === def.strategicValue || a.eligibleTier === "either",
      );
      if (pool.length) abilityId = rng.pick(pool).id;
    }
    const chipSlots = Math.max(
      0,
      CONFIG.chipSlotsByValue[def.strategicValue] - (abilityId ? 1 : 0),
    );

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
      units[u] = makeUnit(u, fid, node, FACTIONS[fid].name);
    }
  }
  // §18.4.1 — one defending unit on each seated minor's seat.
  for (const fid of seededMinors) {
    if (!minorSeat[fid]) continue;
    const u = uid("unit");
    units[u] = makeUnit(u, fid, minorSeat[fid], factionDef(fid).name);
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
    rng, // live seeded generator — contest dice draw from it
    nextId: uid, // shared instance id generator — used by runtime Recruit
    humanFactionId,
    round: 1,
    phase: "Upkeep",
    turnOrder: [...playing],
    activeIndex: 0,
    players,
    board: { hexes, adjacency: grid.adjacency },
    locations,
    units,
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
  for (const fid of playing) recomputeVisibility(state, fid, { emitEvents: false });
  // §18.4–§18.5 — init the diplomacy layer + global reputations, then seed
  // faction↔faction Standing from temperament compatibility + relationship
  // + a PER-SEED jitter (alliance variety). The jitter uses an ISOLATED rng
  // so the main contest stream is untouched; human rows start neutral.
  ensureDiplomacy(state);
  seedStanding(state, makeRng((seed ^ 0x517cc1b7) >>> 0));
  return state;
}
