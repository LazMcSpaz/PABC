// Game setup — builds the initial GameState (mechanical-spec §13.3):
// the board, players, locations, units, and the tiered Market.
import { CONFIG } from "./config.js";
import { FACTIONS, LOCATIONS, CHIPS, CAPITAL } from "./content.js";
import { makeRng } from "./rng.js";
import { createIdGen } from "./ids.js";
import { buildHexGrid, generateLayout } from "./board.js";

export function createGame({ seed = Date.now() & 0xffffffff, factionIds } = {}) {
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
    hexes[id] = { id, row: hex.row, col: hex.col, type: layout.type[id] };
  }

  // --- players ---
  const players = {};
  for (const fid of playing) {
    players[fid] = {
      id: fid,
      factionId: fid,
      resource: 0,
      vp: 0,
      tech: CONFIG.tech.start,
      actions: { remaining: CONFIG.baseActions, max: CONFIG.baseActions },
      unitCap: 1,
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

    // TODO (content batch): assign every High / Very High location a
    // random ability from content/location-abilities, which also costs
    // the location one chip slot.
    locations[hexId] = {
      hexId,
      locationId: locId,
      controller,
      sections: Array(3).fill(controller || "neutral"),
      foothold: controller ? 0 : null,
      footholdCap: CONFIG.footholdCap,
      chipSlots: CONFIG.chipSlotsByValue[def.strategicValue],
      chips: locChips,
      garrison,
      production,
      abilityId: null,
    };
  }

  // --- units: one per playing faction, on its starting Location ---
  const units = {};
  for (const fid of playing) {
    const u = uid("unit");
    units[u] = {
      uid: u,
      owner: fid,
      name: `${FACTIONS[fid].name} unit`, // flavor names arrive with content
      node: layout.factionStart[fid],
      strength: CONFIG.unit.baseStrength,
      movement: CONFIG.unit.baseMovement,
      chips: [],
      immobilizedUntil: null,
    };
  }

  // --- Market: three tech tiers, each a face-up row + a draw deck ---
  const market = { tiers: {} };
  for (const tier of [1, 2, 3]) {
    const pool = [];
    for (const chip of Object.values(CHIPS)) {
      if (chip.techLevel === tier) {
        for (let i = 0; i < chip.copies; i++) pool.push(mkChip(chip.id));
      }
    }
    const shuffled = rng.shuffle(pool);
    const rowSize = CONFIG.marketRowSizes[tier];
    market.tiers[tier] = {
      tier,
      rowSize,
      row: shuffled.slice(0, rowSize),
      deck: shuffled.slice(rowSize),
    };
  }

  return {
    seed,
    round: 1,
    phase: "Upkeep",
    turnOrder: [...playing],
    activeIndex: 0,
    players,
    board: { hexes, adjacency: grid.adjacency },
    locations,
    units,
    chips,
    market,
    encounterDeck: [], // content pending — encounter design batch
    reactiveDeck: [], // content pending
    discards: { encounter: [], reactive: [], market: [] },
    winnerId: null,
    log: [],
  };
}
