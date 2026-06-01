// §17.5 Intelligence B1 (Spy Ring) — the read half of the Espionage branch.
// A B1 holder reads normally-hidden rival state: each rival's Tech Wheel
// allocation, and their pairwise Standing toward third parties. The engine
// just EXPOSES the data here (a pure query); the UI consumes it later.
import { hasTechNode } from "./tech.js";

// Returns { techWheel, factionStanding } for `rivalPid` as seen by
// `viewerPid`, or null when the viewer lacks Spy Ring (or the rival is gone).
// `techWheel` is the rival's assigned node ids; `factionStanding` is the
// rival's row of pairwise Standing toward every other actor. Both are
// shallow copies so a reader can't mutate engine state.
export function readRivalIntel(state, viewerPid, rivalPid) {
  if (!hasTechNode(state, viewerPid, "int-b1")) return null;
  const rival = state.players[rivalPid];
  if (!rival) return null;
  return {
    techWheel: [...(rival.techWheel || [])],
    factionStanding: { ...(state.factionStanding?.[rivalPid] || {}) },
  };
}
