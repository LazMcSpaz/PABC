// The Tech Wheel (mechanical-spec §17). Four paths radiate from the
// centre — Military, Economy, Intelligence, Logistics — each 5 nodes over
// 3 layers: entry → A1 → A2 and entry → B1 → B2.
//
// Effect routing (§17.5/§17.7): nodes carry only an `effect` TAG here (the
// entries name their lever; the 16 branch nodes keep the `noop` shape). The
// real behaviour lives in the consumer modules — contest.js, stats.js,
// turn.js, economy.js, board.js, visibility.js, posts.js, actions.js — each
// gating off `hasTechNode(state, pid, "<nodeId>")`. Branch effects ADD to
// their entry (and to each other within a branch); none replaces a shallower
// one. The one branch node large enough to need its own subsystem is
// Intelligence A2 (Listening Post, §17.7) — see posts.js.
//
// This module is pure data + pure read helpers — no engine imports — so
// every effect site can ask `hasTechNode` without circular-import pain.

// Build a path's 5 nodes with the standard prereq chains.
function buildPath(path, prefix, entryEffect) {
  return {
    [`${prefix}-entry`]: { id: `${prefix}-entry`, path, layer: 1, prereq: null, effect: entryEffect },
    [`${prefix}-a1`]: { id: `${prefix}-a1`, path, layer: 2, prereq: `${prefix}-entry`, effect: { kind: "noop" } },
    [`${prefix}-a2`]: { id: `${prefix}-a2`, path, layer: 3, prereq: `${prefix}-a1`, effect: { kind: "noop" } },
    [`${prefix}-b1`]: { id: `${prefix}-b1`, path, layer: 2, prereq: `${prefix}-entry`, effect: { kind: "noop" } },
    [`${prefix}-b2`]: { id: `${prefix}-b2`, path, layer: 3, prereq: `${prefix}-b1`, effect: { kind: "noop" } },
  };
}

export const TECH_NODES = {
  ...buildPath("military", "mil", { kind: "contestRoll", amount: 1 }),
  ...buildPath("logistics", "log", { kind: "movement", amount: 1 }),
  ...buildPath("economy", "eco", { kind: "locationScrap", amount: 1 }),
  ...buildPath("intelligence", "int", { kind: "encounterRedraw" }),
};

// Display metadata for every node — entry + 4 branches per path. Each path
// has two branch themes (`branches.a`/`branches.b`) and each branch node
// carries its own name + tooltip body (§17.5 / §17.7).
export const TECH_PATHS = {
  military: {
    name: "Military",
    entryName: "Doctrine",
    entryText: "+1 to any contest roll (attacking or defending).",
    branches: {
      a: { name: "Aggression", text: "Your attacks hit harder." },
      b: { name: "Bastion", text: "Your Locations are harder to take." },
    },
    nodes: {
      a1: { name: "Vanguard", text: "+1 contest roll when you initiate the contest (stacks with Doctrine: +2 attacking, +1 defending)." },
      a2: { name: "Killing Blow", text: "When you attack and win, the loser loses 2 Strength (was 1). Your wins are twice as bloody." },
      b1: { name: "Turrets", text: "When defending a hex you control, +1 contest roll AND the fortify bonus doubles (1 → 2)." },
      b2: { name: "Citadel", text: "Locations you control gain +2 garrison Strength; Locations captured from you start at Loyalty 0 for the new owner." },
    },
  },
  logistics: {
    name: "Logistics",
    entryName: "Supply Lines",
    entryText: "+1 Movement to your units.",
    branches: {
      a: { name: "Maneuver", text: "Your units go further." },
      b: { name: "Sustainment", text: "Your units last longer." },
    },
    nodes: {
      a1: { name: "Forced March", text: "+1 Movement (stacks with Supply Lines: +2 total)." },
      a2: { name: "Forward Supply", text: "Your reinforcement convoys may route through enemy ZoC hexes — units stay supplied behind enemy lines." },
      b1: { name: "Field Hospital", text: "+1 passive heal per Upkeep on held Locations (stacks with the base heal: +2/Upkeep)." },
      b2: { name: "Supply Convoys", text: "Convoys travel +1 hex per round; scrap-to-Strength healing is 1:1 (was 2:1)." },
    },
  },
  economy: {
    name: "Economy",
    entryName: "Industry",
    entryText: "+1 scrap per turn from each Location you fully hold.",
    branches: {
      a: { name: "Industry", text: "More material." },
      b: { name: "Construction", text: "Better building." },
    },
    nodes: {
      a1: { name: "Refineries", text: "+1 scrap per Upkeep per held Location (stacks with Industry: +2 per Location)." },
      a2: { name: "Industrial Might", text: "Your Capital generates +1 Research per Upkeep (in addition to any Labs)." },
      b1: { name: "Production Lines", text: "Chip build cost reduced by 1 (floor 1)." },
      b2: { name: "Capital Works", text: "Your Capital gains +1 chip slot." },
    },
  },
  intelligence: {
    name: "Intelligence",
    entryName: "Recon",
    entryText: "When an encounter is drawn for you, you may discard it and take the next draw (stacks with Recon Team).",
    branches: {
      a: { name: "Vision", text: "See more of the map." },
      b: { name: "Espionage", text: "Read and disrupt rivals." },
    },
    nodes: {
      a1: { name: "Watch Network", text: "+1 faction-wide Vision AND +1 faction-wide Detection." },
      a2: { name: "Listening Post", text: "Unlocks the Build Listening Post action — a deployable, concealed Vision source (radius 1) on any non-Location hex you stand on. Survives by stealth, not toughness (§17.7)." },
      b1: { name: "Spy Ring", text: "You read normally-hidden rival state — each rival's Tech Wheel allocation, and their pairwise Standing with third parties." },
      b2: { name: "Saboteurs", text: "Once per round, target an enemy-controlled Location and lower its Loyalty by 1." },
    },
  },
};

// Does player `pid` have `nodeId` assigned on their wheel?
export function hasTechNode(state, pid, nodeId) {
  return !!state.players[pid]?.techWheel?.includes(nodeId);
}

// Is `nodeId`'s prerequisite satisfied for player `pid` (entry nodes have
// no prereq)?
export function prereqMet(state, pid, nodeId) {
  const node = TECH_NODES[nodeId];
  if (!node) return false;
  return node.prereq == null || hasTechNode(state, pid, node.prereq);
}
