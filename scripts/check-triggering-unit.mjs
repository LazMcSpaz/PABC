
// Verification for the `triggering-unit` token.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { resolveTargets } from "../src/game/targeting.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

const P = "lakers";
const g = createGame({ seed: 4242, humanFactionId: P });
startTurn(g);                                  // seat 0 (versari) holds the turn
const mine = Object.values(g.units).filter((u) => u.owner === P);
const u = mine[0];

// 1. resolves to the unit on the delivery context, not to a player
check("1. resolves to the triggering unit",
  resolveTargets(g, "triggering-unit", { sourceUnit: u.uid, sourcePlayer: P, asPlayer: P })[0] === u.uid,
  `got ${resolveTargets(g, "triggering-unit", { sourceUnit: u.uid, sourcePlayer: P })[0]}`);

// 2. the old spelling still resolves to a PLAYER — nothing silently changed
check("2. `active` is unchanged and still a player id",
  resolveTargets(g, "active", { asPlayer: P })[0] === P, "active moved");

// 3. ADJUST_BASE_STRENGTH now actually wounds
const before = u.baseStrength;
applyEffect(g, { type: "ADJUST_BASE_STRENGTH", amount: -1, target: "triggering-unit" },
  { sourceUnit: u.uid, sourcePlayer: P, asPlayer: P });
check("3. ADJUST_BASE_STRENGTH wounds the triggering unit",
  g.units[u.uid] && g.units[u.uid].baseStrength === before - 1,
  `baseStrength ${before} -> ${g.units[u.uid]?.baseStrength}`);

// 4. ...and -99 destroys it, which is what four authored effects intend
applyEffect(g, { type: "ADJUST_BASE_STRENGTH", amount: -99, target: "triggering-unit" },
  { sourceUnit: u.uid, sourcePlayer: P, asPlayer: P });
check("4. -99 destroys the triggering unit", !g.units[u.uid], "unit survived");

// 5. the authored spelling is still a no-op, so the corpus must be converted
const u2 = Object.values(g.units).find((x) => x.owner === P);
const b2 = u2.baseStrength;
applyEffect(g, { type: "ADJUST_BASE_STRENGTH", amount: -99, target: "active" },
  { sourceUnit: u2.uid, sourcePlayer: P, asPlayer: P });
check("5. target:\"active\" remains a silent no-op (conversion is required)",
  g.units[u2.uid] && g.units[u2.uid].baseStrength === b2, "active unexpectedly hit a unit");

// 6. no triggering unit on the context -> strongest owned unit, and it is RECORDED
const g2 = createGame({ seed: 4242, humanFactionId: P });
startTurn(g2);
const owned = Object.values(g2.units).filter((x) => x.owner === P);
const strongest = owned.slice().sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))[0];
const r = resolveTargets(g2, "triggering-unit", { sourcePlayer: P, asPlayer: P });
check("6. no triggering unit -> strongest owned unit, recorded not silent",
  r[0] === strongest.uid && (g2.__triggeringUnitFallbacks || []).length === 1,
  `got ${r[0]}, fallbacks=${(g2.__triggeringUnitFallbacks || []).length}`);

// 7. a player with no units returns [] rather than a bogus id
const g3 = createGame({ seed: 4242, humanFactionId: P });
startTurn(g3);
for (const x of Object.values(g3.units)) if (x.owner === P) delete g3.units[x.uid];
check("7. no units at all -> empty, not a stray token",
  resolveTargets(g3, "triggering-unit", { sourcePlayer: P, asPlayer: P }).length === 0, "returned something");

// 8. honours asPlayer: a card held by lakers while versari holds the turn
const g4 = createGame({ seed: 4242, humanFactionId: P });
startTurn(g4);
const active = g4.turnOrder[g4.activeIndex];
const theirs = Object.values(g4.units).find((x) => x.owner === active);
const got = resolveTargets(g4, "triggering-unit", { asPlayer: P })[0];
check("8. falls back within the CARD-HOLDER's units, not the active seat's",
  got && g4.units[got].owner === P && got !== theirs.uid,
  `resolved to a unit owned by ${g4.units[got]?.owner}`);

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
