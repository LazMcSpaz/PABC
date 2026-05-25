// Game setup — builds the initial GameState (mechanical-spec §13.3):
// the board, players, locations, units, and the tiered Market.
import { CONFIG } from "./config.js";
import { FACTIONS, LOCATIONS, CAPITAL, ABILITIES, REACTIVES } from "./content.js";
import { FIELD_ENCOUNTERS } from "./content/index.js";
import { makeRng } from "./rng.js";
import { createIdGen } from "./ids.js";
import { buildHexGrid, generateLayout } from "./board.js";

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
} = {}) {
  const rng = makeRng(seed);
  const uid = createIdGen();
  const playing = factionIds || Object.keys(FACTIONS); // v0.1: default all four

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
    // +1. Full terrain generation is deferred; harness/tests may set it.
    hexes[id] = { id, row: hex.row, col: hex.col, type: layout.type[id], terrain: null };
  }

  // --- players ---
  const players = {};
  for (const fid of playing) {
    players[fid] = {
      id: fid,
      factionId: fid,
      isAI: humanFactionId != null && humanFactionId !== fid,
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

  // --- units: CONFIG.startingUnits per faction (§16.3), on/near start ---
  const units = {};
  for (const fid of playing) {
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

  return {
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
    },
    factionStanding: Object.fromEntries(
      playing.map((fid) => [fid, Object.fromEntries(playing.map((pid) => [pid, 0]))]),
    ),
    triggerCooldowns: {},
    deferred: [],
    activeQuests: {},
  };
}
