
// `units-on-hex`: a consequence that falls on the whole force, not one column.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { resolveTargets } from "../src/game/targeting.js";
import { makeUnit } from "../src/game/setup.js";
import { recomputeStats } from "../src/game/stats.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };
const P = "lakers", OTHER = "versari";

function staged() {
  const g = createGame({ seed: 4242, humanFactionId: P });
  startTurn(g);                       // seat 0 (versari) holds the turn
  const hex = Object.values(g.locations)[0].hexId;
  for (const u of Object.values(g.units)) if (u.node === hex) delete g.units[u.uid];
  const mk = (owner, i, S) => {
    const u = makeUnit(`s-${owner}-${i}`, owner, hex, owner, i);
    u.baseStrength = S; u.strength = S; g.units[u.uid] = u; return u;
  };
  const a = mk(P, 0, 4), b = mk(P, 1, 4), c = mk(P, 2, 4);
  const enemy = mk(OTHER, 0, 4);
  // one of the player's units is somewhere else entirely
  const away = mk(P, 3, 4); away.node = Object.values(g.locations)[1].hexId;
  recomputeStats(g);
  for (const u of Object.values(g.units)) if (String(u.uid).startsWith("s-")) u.strength = u.baseStrength;
  return { g, hex, a, b, c, enemy, away };
}

// 1. resolves to the whole committed force, and only the recipient's
{
  const { g, hex, a, b, c, enemy, away } = staged();
  const got = resolveTargets(g, "units-on-hex",
    { sourceHex: hex, sourceUnit: a.uid, sourcePlayer: P, asPlayer: P });
  check("1. every unit the recipient has in the fight",
    got.length === 3 && [a, b, c].every((u) => got.includes(u.uid)),
    JSON.stringify(got));
  check("1b. …and nobody else's, and nobody who wasn't there",
    !got.includes(enemy.uid) && !got.includes(away.uid), JSON.stringify(got));
}

// 2. the existing token is untouched — one column, as every authored effect means
{
  const { g, hex, a } = staged();
  const one = resolveTargets(g, "triggering-unit",
    { sourceHex: hex, sourceUnit: a.uid, sourcePlayer: P, asPlayer: P });
  check("2. `triggering-unit` still resolves to exactly one unit",
    one.length === 1 && one[0] === a.uid, JSON.stringify(one));
}

// 3. the consequence actually lands on all of them
{
  const { g, hex, a, b, c, enemy } = staged();
  applyEffect(g, { type: "ADJUST_BASE_STRENGTH", amount: -99, target: "units-on-hex" },
    { sourceHex: hex, sourceUnit: a.uid, sourcePlayer: P, asPlayer: P });
  check("3. a failed storming costs the whole force",
    !g.units[a.uid] && !g.units[b.uid] && !g.units[c.uid], "some survived");
  check("3b. …and does not touch the enemy standing on the same hex",
    !!g.units[enemy.uid], "hit the wrong side");
}

// 4. it honours asPlayer — the card-holder's force, not the active seat's
{
  const { g, hex, a } = staged();
  const activeSeat = g.turnOrder[g.activeIndex];
  const got = resolveTargets(g, "units-on-hex", { sourceHex: hex, asPlayer: P });
  check("4. resolves within the CARD-HOLDER's units, not the active seat's",
    got.length === 3 && got.every((uid) => g.units[uid].owner === P) && activeSeat !== P,
    `${JSON.stringify(got)} (active ${activeSeat})`);
}

// 5. no hex — behaves exactly like triggering-unit, and says so
{
  const { g } = staged();
  const got = resolveTargets(g, "units-on-hex", { sourcePlayer: P, asPlayer: P });
  const one = resolveTargets(g, "triggering-unit", { sourcePlayer: P, asPlayer: P });
  check("5. with no hex it falls back to a single unit, consistently with triggering-unit",
    got.length === 1 && got[0] === one[0], `${JSON.stringify(got)} vs ${JSON.stringify(one)}`);
  check("5b. …and the fallback is recorded, not silent",
    (g.__triggeringUnitFallbacks || []).length > 0, "nothing recorded");
}

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
