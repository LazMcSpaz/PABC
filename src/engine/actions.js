// src/engine/actions.js
// Pure state transitions. Each function takes state + args and returns a new
// state. Never mutate inputs.
//
// Implementation lives under ./actions/ split by concern:
//   settlement.js  → build, demolish, repair, boost
//   exploration.js → explore, resolveCard
//   raid.js        → raid (+ RAID_TYPES, RAID_UNLOCK_ROUND)
//   turn.js        → endTurn
//
// This barrel preserves the existing public API. Importing actions.js also
// loads each submodule, which is necessary for their registerResumer / AI
// heuristic side effects to take effect.

export { build, demolish, repair, boost } from "./actions/settlement.js";
export { explore, resolveCard } from "./actions/exploration.js";
export { RAID_TYPES, RAID_UNLOCK_ROUND, raid } from "./actions/raid.js";
export { endTurn } from "./actions/turn.js";
