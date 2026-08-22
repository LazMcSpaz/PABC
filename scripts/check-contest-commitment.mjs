// Who fights, and who pays for it.
//
// A playtest (2026-08-22) had two Strength-4 Free Plainer units take a
// garrison-10 Dambar in two rounds. The cause was a mismatch between the two
// halves of a contest: runContest counted the WHOLE STACK's Strength when the
// caller named no coalition, while contestPayer charged only the units it
// named. The AI named none. So each unit attacked at 4 (its own) + 4 (its
// neighbour's) + 1 (Concentration) for one action, and the neighbour — still
// holding its action — did the same thing straight afterwards.
//
// Two fixes, checked separately here because they are independent:
//   1. Whoever's Strength is counted, pays. That closes the hole for every
//      caller, including ones written later.
//   2. The AI commits the FEWEST units that clear its odds bar, instead of
//      swinging the whole stack at everything.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { performAction } from "../src/game/actions.js";
import { previewAttackerStrength, previewLocationContest } from "../src/game/contest.js";
import { planContest } from "../src/game/ai.js";
import { CONFIG } from "../src/game/config.js";

let fail = 0;
// `contest_declared` also starts with "contest_" — match the resolutions only.
const resolved = (g) => g.log.filter((e) => e.name === "contest_won" || e.name === "contest_lost");
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

// A Location defended by its garrison alone, and `n` of `pid`'s units on it.
function field(n, { pid = "versari", garrison = 10, strength = 4 } = {}) {
  const g = createGame({ seed: 1126, humanFactionId: "versari" });
  startTurn(g);
  const hex = Object.keys(g.locations).find((h) => g.locations[h].controller !== pid);
  // Clear the hex so the defence is the garrison alone — parked somewhere real,
  // because a unit on a null hex trips the visibility sweep.
  const elsewhere = Object.keys(g.board.hexes).find((h) => h !== hex);
  for (const u of Object.values(g.units)) if (u.node === hex) u.node = elsewhere;
  g.locations[hex].garrison = garrison;
  const units = [];
  for (let i = 0; i < n; i++) {
    const uid = `t-${i}`;
    g.units[uid] = { uid, owner: pid, node: hex, baseStrength: strength, strength,
                     chips: [], actionsRemaining: 1, name: `Test ${i}` };
    units.push(g.units[uid]);
  }
  return { g, hex, units };
}
const acted = (units) => units.map((u) => u.actionsRemaining);

// --- 1. whoever's Strength is counted, pays ------------------------------
{
  const { g, units } = field(2);
  const r = performAction(g, "contest", { unit: units[0].uid }); // no coalition — the AI's old shape
  check("1. a contest with no coalition still resolves", r.ok, r.reason);
  const ev = g.log.filter((e) => e.name === "contest_won" || e.name === "contest_lost").pop();
  check("2. …counting the whole stack's Strength, as it always did",
    ev.payload.attackerAllies === 4, `attackerAllies=${ev.payload.attackerAllies}`);
  check("3. …and now the whole stack pays for it",
    acted(units).every((a) => a === 0), `actions left: ${acted(units)}`);
  const second = performAction(g, "contest", { unit: units[1].uid });
  check("4. so the neighbour cannot attack again beside it",
    !second.ok, `second attack was allowed: ${JSON.stringify(second)}`);
}
{
  // The human's shapes are untouched: solo costs one action and gets no
  // stack bonus; pooling costs every participant's action.
  const solo = field(2);
  performAction(solo.g, "contest", { unit: solo.units[0].uid, coalition: [] });
  const soloEv = resolved(solo.g).pop();
  check("5. a named solo attack gets no ally Strength and costs one action",
    soloEv.payload.attackerAllies === 0 && acted(solo.units).join() === "0,1",
    `allies=${soloEv.payload.attackerAllies} actions=${acted(solo.units)}`);

  const pooled = field(2);
  performAction(pooled.g, "contest", { unit: pooled.units[0].uid, coalition: [pooled.units[1].uid] });
  const poolEv = resolved(pooled.g).pop();
  check("6. a pooled attack gets the ally Strength and costs both actions",
    poolEv.payload.attackerAllies === 4 && acted(pooled.units).every((a) => a === 0),
    `allies=${poolEv.payload.attackerAllies} actions=${acted(pooled.units)}`);
}

// --- 2. the AI commits the minimum --------------------------------------
{
  // Three Strength-4 units against a garrison of 10. Concentration is +2
  // throughout (three bodies stand there either way), so: 1 unit → 6, a 33%
  // shot; 2 units → 10, certain. Two is the answer; the third keeps its turn.
  const { g, hex, units } = field(3);
  const def = previewLocationContest(g, hex, { attacker: "versari" });
  check("7. the fixture is the Dambar shape — garrison 10, no defending die",
    def.value === 10 && def.defenderRollsDie === false,
    `value=${def.value} rollsDie=${def.defenderRollsDie}`);

  const plan = planContest(g, "versari", hex);
  check("8. the AI commits two of the three, not all three",
    plan && 1 + plan.support.length === 2, JSON.stringify(plan));
  check("9. …and expects to win", plan.chance === 1, `chance=${plan.chance}`);

  performAction(g, "contest", { unit: plan.lead, coalition: plan.support });
  const spare = units.filter((u) => u.uid !== plan.lead && !plan.support.includes(u.uid));
  check("10. the uncommitted unit keeps its action for something else",
    spare.length === 1 && spare[0].actionsRemaining === 1,
    `spare: ${spare.map((u) => `${u.uid}=${u.actionsRemaining}`)}`);
}
{
  // One unit is enough when one unit is enough.
  const { g, hex } = field(3, { garrison: 3 });
  const plan = planContest(g, "versari", hex);
  check("11. against a weak garrison it commits a single unit",
    plan && plan.support.length === 0, JSON.stringify(plan));
}
{
  // And it declines a fight the whole stack cannot win.
  const { g, hex } = field(2, { garrison: 40 });
  check("12. it refuses a fight even the whole stack cannot clear",
    planContest(g, "versari", hex) === null, "it planned an attack it should not");
}

// --- 3. risk appetite decides the size of the force ----------------------
{
  // The bar is `acceptableOdds`, already scaled by aggression — so the same
  // fight costs a warlord fewer units than a cautious faction, with no second
  // set of numbers to keep in step.
  const { g, hex } = field(3, { garrison: 8 });
  const atk1 = previewAttackerStrength(g, hex, "versari", { committed: ["t-0"] });
  const bold = { ...CONFIG.ai };
  const commitCount = (aggression) => {
    CONFIG.ai.contestWinProbBase = 0.55;
    CONFIG.ai.contestWinProbAggressionScale = 0.35;
    const saved = g.players.versari;
    // Drive the dial through the same door acceptableOdds reads.
    const plan = planContest(g, "versari", hex);
    return plan ? 1 + plan.support.length : null;
  };
  const solo = previewAttackerStrength(g, hex, "versari", { committed: ["t-0"] }).total;
  check(`13. a lone unit here brings ${solo} against ${8} — a real gamble, not a certainty`,
    solo > 8 - 6 && solo <= 8 + 6, `total=${solo}`);
  // Low bar → one unit is enough; high bar → it brings a friend.
  CONFIG.ai.contestWinProbBase = 0.10; CONFIG.ai.contestWinProbAggressionScale = 0;
  const reckless = planContest(g, "versari", hex);
  CONFIG.ai.contestWinProbBase = 0.95; CONFIG.ai.contestWinProbAggressionScale = 0;
  const cautious = planContest(g, "versari", hex);
  Object.assign(CONFIG.ai, bold);
  check("14. a lower odds bar commits fewer units than a higher one",
    reckless && cautious && (1 + reckless.support.length) < (1 + cautious.support.length),
    `reckless=${reckless && 1 + reckless.support.length} cautious=${cautious && 1 + cautious.support.length}`);
}

// --- 4. the original defect, end to end ----------------------------------
{
  // Two Strength-4 units, garrison 10 — the exact Dambar situation. Under the
  // old behaviour this was two attacks at 9+d6 (83% each). It must now be one
  // attack, whatever the AI decides to do.
  const { g, hex, units } = field(2);
  const plan = planContest(g, "versari", hex);
  performAction(g, "contest", { unit: plan.lead, coalition: plan.support });
  const contests = resolved(g).length;
  const left = units.reduce((n, u) => n + (u.actionsRemaining ?? 0), 0);
  check("15. two units against a garrison of 10 get ONE attack between them",
    contests === 1 && left === 0,
    `${contests} contest(s), ${left} action(s) left`);
}

console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
process.exit(fail ? 1 : 0);
