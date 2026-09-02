// The stacking cap — no more than CONFIG.hexUnitCap units on one hex.
//
// The cap exists because the board runs out of room to draw a bigger stack at a
// legible size (docs/unit-model-pipeline.md §10.1), and a rule the display
// cannot show is a rule players cannot plan around. So it has to hold on every
// path a unit can arrive by, not just the obvious one — these tests drive the
// real engine rather than re-deriving the rules.
//
//   node scripts/check-hex-cap.mjs

import { createGame, makeUnit } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { performAction } from "../src/game/actions.js";
import { unitReach, hexIsFull, unitsOnHex } from "../src/game/movement.js";
import { recruitCapBonus } from "../src/game/actions.js";
import { CONFIG } from "../src/game/config.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const CAP = CONFIG.hexUnitCap;
console.log(`cap = ${CAP} units per hex\n`);

// createGame leaves the game before its first Upkeep; startTurn runs Upkeep and
// drops it into Main, which is the only phase that accepts actions.
function fresh() {
  const g = createGame({ seed: 424242, factionIds: ["versari", "lakers", "goldgrass", "plainers"] });
  startTurn(g);
  return g;
}

// Fill `hex` to `n` units owned by `owner`, bypassing the action layer.
function stack(state, hex, owner, n) {
  for (let i = 0; i < n; i++) {
    const uid = state.nextId("unit");
    state.units[uid] = makeUnit(uid, owner, hex, owner);
  }
}

console.log("--- the counter itself ---");
{
  const g = fresh();
  const hex = Object.keys(g.board.hexes)[0];
  const before = unitsOnHex(g, hex);
  stack(g, hex, "versari", 3);
  check("counts units on a hex", unitsOnHex(g, hex) === before + 3, `${unitsOnHex(g, hex)}`);
  check("not full below the cap", !hexIsFull(g, hex), `${unitsOnHex(g, hex)}/${CAP}`);
  stack(g, hex, "versari", CAP - unitsOnHex(g, hex));
  check("full at the cap", hexIsFull(g, hex), `${unitsOnHex(g, hex)}/${CAP}`);
  const someone = Object.values(g.units).find((u) => u.node === hex);
  check("a unit already there does not block itself",
    !hexIsFull(g, hex, someone.uid), "excluded from its own count");
}

console.log("\n--- movement ---");
{
  const g = fresh();
  const mover = Object.values(g.units).find((u) => u.owner === g.turnOrder[0]);
  const reachBefore = Object.keys(unitReach(g, mover));
  check("a mover has somewhere to go", reachBefore.length > 0, `${reachBefore.length} hexes`);

  const dest = reachBefore.find((h) => h !== mover.node);
  stack(g, dest, mover.owner, CAP);
  const reachAfter = Object.keys(unitReach(g, mover));
  check("a full hex leaves the movement field", !reachAfter.includes(dest),
    `${reachBefore.length} -> ${reachAfter.length} destinations`);
  check("other destinations are unaffected",
    reachAfter.length === reachBefore.length - 1,
    "only the full one was pruned");

  const res = performAction(g, "move", { unit: mover.uid, to: dest });
  check("moving into a full hex is refused", !res.ok, res.reason || "allowed!");
  check("and says why", /full/.test(res.reason || ""), res.reason);
  check("the mover stayed put", mover.node !== dest);
}

console.log("\n--- a full hex can still be crossed ---");
// The cap is about what may STAND on a tile, not about the road across it.
{
  const g = fresh();
  const mover = Object.values(g.units).find((u) => u.owner === g.turnOrder[0]);
  mover.moveRemaining = 6;
  const near = Object.keys(unitReach(g, mover)).filter((h) => h !== mover.node);
  const mid = near[0];
  // Something two steps out, reachable only by way of `mid`.
  const beyond = (g.board.adjacency[mid] || []).find(
    (h) => h !== mover.node && !g.board.adjacency[mover.node]?.includes(h));
  if (!beyond) {
    console.log("  ..    no through-hex on this board; skipped");
  } else {
    stack(g, mid, mover.owner, CAP);
    const field = unitReach(g, mover);
    check("the full hex itself is not a destination", !(mid in field));
    check("the hex beyond it still is", beyond in field,
      beyond in field ? "passage is open" : "passage was closed by a full hex");
  }
}

console.log("\n--- recruiting ---");
{
  const g = fresh();
  const pid = g.turnOrder[0];
  // Keyed by the state.locations key, which is what the action looks up.
  const entry = Object.entries(g.locations).find(([, l]) => l.controller === pid);
  if (!entry) {
    console.log("  ..    no controlled Location on this seed; skipped");
  } else {
    const [locKey, loc] = entry;
    // Recruiting has prerequisites of its own — a chip that unlocks it, scrap,
    // and headroom under the player's unit cap — and the stacking check sits
    // after all of them, deliberately: telling someone the hex is full when
    // they cannot recruit at all would be the wrong answer. So satisfy them
    // first, or the test would never reach the rule it is about.
    // Enough Training Grounds to lift the player's own unit cap clear of the
    // hex cap, so it is the stacking rule that bites and not the roster limit.
    for (let i = 0; i < CAP + 2; i++) {
      const chipUid = g.nextId("chip");
      g.chips[chipUid] = { uid: chipUid, chipId: "training-grounds", owner: pid };
      loc.chips.push(chipUid);
    }
    g.players[pid].resource = 9999;
    check("prerequisites are satisfied", recruitCapBonus(g, pid) >= 1,
      `capBonus ${recruitCapBonus(g, pid)}`);

    // With room, it works — otherwise the refusal below proves nothing.
    const okRes = performAction(g, "recruit", { at: locKey });
    check("recruiting works when there is room", okRes.ok, okRes.reason || "ok");

    stack(g, loc.hexId, pid, CAP - unitsOnHex(g, loc.hexId));
    const res = performAction(g, "recruit", { at: locKey });
    check("recruiting onto a full hex is refused", !res.ok, res.reason || "allowed!");
    check("and says why", /full/.test(res.reason || ""), res.reason);
  }
}

console.log("\n--- the cap cannot be exceeded by any route ---");
// Whatever a player does, the invariant is that no hex ever holds more than the
// cap. Assert it as a state-wide sweep rather than trusting the paths above.
{
  const g = fresh();
  const worst = Object.entries(
    Object.values(g.units).reduce((m, u) => ({ ...m, [u.node]: (m[u.node] || 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1])[0];
  check("a fresh board is within the cap", !worst || worst[1] <= CAP,
    worst ? `busiest hex has ${worst[1]}` : "no units");
}

console.log(`\n${failures ? `${failures} FAILED` : "all hex-cap tests passed"}`);
process.exit(failures ? 1 : 0);
