// §17.5 Intelligence B1 (Spy Ring) — the read half of the Espionage branch.
// A B1 holder reads normally-hidden rival state: each rival's Tech Wheel
// allocation, and their pairwise Standing toward third parties. The engine
// just EXPOSES the data here (a pure query); the UI consumes it later.
import { hasTechNode } from "./tech.js";

// What a Spy Ring holder learns about `rivalPid`, or null without one.
//
// It used to be two things: the rival's tech wheel and their Standing row.
// Both predate the diplomacy rework, and after it a Spy Ring holder still
// could not see a single thing the last six phases added — not what a rival
// WANTS, not what they have publicly sworn, not what they are spending.
//
// Under Dominion, knowing what a faction wants is knowing how to ally it, so
// `interests` is the highest-value reveal in the game. It is deliberately the
// derived wants rather than the raw ledgers behind them: espionage tells you
// what somebody is after, not their internal arithmetic.
//
// Everything is a copy or a projection, so a reader cannot mutate engine
// state through it.
export function readRivalIntel(state, viewerPid, rivalPid) {
  if (!hasTechNode(state, viewerPid, "int-b1")) return null;
  const rival = state.players[rivalPid];
  if (!rival) return null;
  return {
    techWheel: [...(rival.techWheel || [])],
    factionStanding: { ...(state.factionStanding?.[rivalPid] || {}) },
    // §5 — the six derived wants. What they are after, in their order.
    interests: (READ.interestsOf?.(state, rivalPid) || []).map((w) => ({
      kind: w.kind, subject: w.subject || null, weight: Math.round(w.weight * 100) / 100,
    })),
    // §13 — what they have said to the whole board, and what they broke.
    positions: (READ.positionsOf?.(state, rivalPid) || []).map((p) => ({
      kind: p.kind, target: p.target || null, since: p.since,
      text: READ.positionText?.(state, p) || p.kind,
    })),
    // §6 — political capacity. Not the pool alone: what it is COMMITTED to is
    // the part that says whether they can afford to act.
    sway: {
      pool: READ.swayOf?.(state, rivalPid) ?? null,
      income: READ.swayIncome?.(state, rivalPid)?.total ?? null,
      courting: (READ.courtingList?.(state, rivalPid) || []).length,
    },
  };
}

// Registered by diplomacy.js at load. This module is a LEAF on purpose — it is
// imported by the adapter and by actions, and reaching into diplomacy directly
// would put a cycle through the middle of the political layer.
const READ = {};
export function registerIntelReaders(readers) { Object.assign(READ, readers); }
