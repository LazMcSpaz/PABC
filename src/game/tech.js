// The Tech Wheel (mechanical-spec §17). Four paths radiate from the
// centre — Military, Economy, Intelligence, Logistics — each 5 nodes over
// 3 layers: entry → A1 → A2 and entry → B1 → B2. Only the four entry nodes
// carry real effects today; the 16 branch nodes are PLACEHOLDERS (noop).
//
// This module is pure data + pure read helpers — no engine imports — so
// every effect site (stats / contest / turn / encounters) can ask
// `hasTechNode` without circular-import pain.

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

// Display metadata for the four entries (UI tooltips). Branch nodes show
// "TBD" — see TECH_NODES[id].effect.kind === "noop".
export const TECH_PATHS = {
  military: { name: "Military", entryName: "Doctrine", entryText: "+1 to any contest roll (attacking or defending)." },
  logistics: { name: "Logistics", entryName: "Supply Lines", entryText: "+1 Movement to your units." },
  economy: { name: "Economy", entryName: "Industry", entryText: "+1 scrap per turn from each Location you fully hold." },
  intelligence: { name: "Intelligence", entryName: "Recon", entryText: "When an encounter is drawn for you, you may discard it and take the next draw (stacks with Recon Team)." },
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
