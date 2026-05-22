// Locked vocabulary from docs/content-schema-v0.1.md.
// Edits here must be mirrored in that document and the engine.

export const EFFECT_TYPES = [
  // §12 — existing
  "ADJUST_RESOURCE",
  "MODIFY_STAT",
  "GRANT_ACTIONS",
  "MOVE_CARD",
  "SET_FLAG",
  "TRANSFER",
  "CONVERT",
  "SPAWN",
  "PEEK",
  "FORCE_CHOICE",
  "SURCHARGE",
  "REDIRECT",
  "CANCEL",
  // §15.10 — new
  "ADJUST_TRACK",
  "ADJUST_STANDING",
  "SET_PLAYER_FLAG",
  "QUEUE_DEFERRED",
  "START_QUEST",
  "ADVANCE_QUEST",
  "COMPLETE_QUEST",
  "PLACE_ENCOUNTER",
  "DELIVER_ENCOUNTER",
  // attrition model (base Strength = HP)
  "ADJUST_BASE_STRENGTH",
];

export const SIMPLE_RECIPIENT_TOKENS = [
  "active",
  "random",
  "chosen-by-active",
  "most-raided",
  "least-engaged",
  "claimant",
  "triggering-player",
  "each",
];

export const PARAMETERISED_RECIPIENT_TEMPLATES = [
  "lowest-standing-with",
  "highest-standing-with",
  "controller-of",
];

export const FACTION_IDS = ["versari", "goldgrass", "lakers", "plainers"];

export const HEX_FILTER_KEYS = [
  "type",
  "controlledBy",
  "notControlledBy",
  "withinHexesOf",
  "outsideHexesOf",
  "hasChip",
  "notHasChip",
  "factionAffiliation",
  "strategicValue",
  "hasAbility",
  "terrain",
];

export const HEX_TYPE_OPTIONS = ["location", "encounter", "terrain", "any"];
export const STRATEGIC_VALUE_OPTIONS = ["low", "medium", "high", "veryHigh"];
// Hex terrain predicate. Only `mountain` is special today (+1 defender);
// default terrain is null. `any` matches regardless.
export const TERRAIN_OPTIONS = ["mountain", "any"];

export const DSL_OPS = ["eq", "ne", "gt", "gte", "lt", "lte"];

export const DSL_FORMS = [
  "all",
  "any",
  "not",
  "op",
  "has_flag",
  "quest_active",
  "quest_completed",
  "controls_count",
  "control_duration",
  "literal",
];

export const DSL_PATHS = [
  "world.raidCounts.versari",
  "world.raidCounts.goldgrass",
  "world.raidCounts.lakers",
  "world.raidCounts.plainers",
  "world.ignoreCounts.versari",
  "world.ignoreCounts.goldgrass",
  "world.ignoreCounts.lakers",
  "world.ignoreCounts.plainers",
  "players.versari.tracks.trust",
  "players.versari.tracks.reputation",
  "players.versari.tracks.alignment",
  "players.versari.resource",
  "players.versari.vp",
  "players.versari.research",
  "players.versari.techLevel",
  "players.goldgrass.tracks.trust",
  "players.goldgrass.tracks.reputation",
  "players.goldgrass.tracks.alignment",
  "players.goldgrass.resource",
  "players.goldgrass.vp",
  "players.goldgrass.research",
  "players.goldgrass.techLevel",
  "players.lakers.tracks.trust",
  "players.lakers.tracks.reputation",
  "players.lakers.tracks.alignment",
  "players.lakers.resource",
  "players.lakers.vp",
  "players.lakers.research",
  "players.lakers.techLevel",
  "players.plainers.tracks.trust",
  "players.plainers.tracks.reputation",
  "players.plainers.tracks.alignment",
  "players.plainers.resource",
  "players.plainers.vp",
  "players.plainers.research",
  "players.plainers.techLevel",
  "factionStanding.versari.versari",
  "factionStanding.versari.goldgrass",
  "factionStanding.versari.lakers",
  "factionStanding.versari.plainers",
  "factionStanding.goldgrass.versari",
  "factionStanding.goldgrass.goldgrass",
  "factionStanding.goldgrass.lakers",
  "factionStanding.goldgrass.plainers",
  "factionStanding.lakers.versari",
  "factionStanding.lakers.goldgrass",
  "factionStanding.lakers.lakers",
  "factionStanding.lakers.plainers",
  "factionStanding.plainers.versari",
  "factionStanding.plainers.goldgrass",
  "factionStanding.plainers.lakers",
  "factionStanding.plainers.plainers",
  "state.round",
];

export const RESOURCE_KINDS = ["Resource", "VP", "Research"];
export const STAT_KINDS = ["Strength", "Movement"];
export const STAT_DURATIONS = [
  "permanent",
  "until_your_next_turn",
  "this_turn",
  "this_contest",
];
export const GRANT_WHEN = ["this_turn", "next_turn"];
export const ENTITY_FLAGS = [
  "disabled",
  "exhausted",
  "shielded",
  "marked",
  "immobilized",
];
export const TRACKS = ["trust", "reputation", "alignment"];
export const ENCOUNTER_MODES = ["private", "public", "placement"];
export const QUEST_MODES = ["single-player", "global"];
export const BEAT_DELIVER_MODES = ["auto", "discovered", "conditional"];
export const BEAT_MODES = ["private", "public"];

// Per-effect param defaults so adding a new row pre-fills sensibly.
export const DEFAULT_PARAMS_BY_TYPE = {
  ADJUST_RESOURCE: { resource: "Resource", amount: 0, target: "active" },
  MODIFY_STAT: {
    stat: "Strength",
    amount: 0,
    target: "active",
    duration: "this_turn",
  },
  GRANT_ACTIONS: { amount: 1, target: "active", when: "this_turn" },
  MOVE_CARD: { from: "", to: "", selector: "top", count: 1 },
  SET_FLAG: {
    flag: "exhausted",
    value: true,
    target: "active",
    duration: "this_turn",
  },
  TRANSFER: { what: "resource", amount: 0, from: "active", to: "active" },
  CONVERT: {
    from: "",
    to: "",
    rate: { cost: 1, gain: 1 },
    target: "active",
  },
  SPAWN: { source: "", zone: "", initialState: {} },
  PEEK: { deck: "", count: 1, reorder: false, target: "active" },
  FORCE_CHOICE: { chooser: "active", target: "active", options: [] },
  SURCHARGE: { action: "", extraCost: 0, block: false, window: "", target: "active" },
  REDIRECT: { field: "recipient", operation: "set", value: "" },
  CANCEL: {},
  ADJUST_TRACK: { track: "trust", amount: 0, target: "active" },
  ADJUST_STANDING: { faction: "versari", player: "active", amount: 0 },
  SET_PLAYER_FLAG: { flag: "", value: true, target: "active" },
  QUEUE_DEFERRED: { effects: [], delayRounds: 1, target: "active" },
  START_QUEST: { questId: "", claimant: "active" },
  ADVANCE_QUEST: { questId: "", beatId: "" },
  COMPLETE_QUEST: { questId: "" },
  PLACE_ENCOUNTER: { encounterId: "" },
  DELIVER_ENCOUNTER: { encounterId: "" },
  ADJUST_BASE_STRENGTH: { amount: 0, target: "active" },
};
