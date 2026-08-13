// Siege simulation — compares action-model candidates for the per-entity
// action rework, using the REAL engine (createGame + performAction), not a
// re-implementation of the combat math. Run: node scripts/sim-contest-models.mjs
//
// Models (attacker scheduling per turn; defenders always play the same):
//   A  legacy      — global 2 Actions: 2 contests/turn, whole stack fights each
//   B  naive       — per-unit actions, whole stack fights EVERY contest
//                    (the rework without the coalition rule — the steamroll case)
//   C-all  grouped — coalition rule: all units pool into ONE contest/turn
//   C-solo split   — coalition rule: every unit contests ALONE (own Strength)
//   C-pair mixed   — coalition rule: pairs contest together, odd unit solo
//
// Scenario: attacker stack starts ON an enemy Location with full sections;
// turn loop runs for real (defender heals/fortifies at its own Upkeep).
// Measured: capture rate, mean turns to capture, mean attacker Strength lost.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { performAction } from "../src/game/actions.js";
import { activePlayerId } from "../src/game/targeting.js";
import * as gStats from "../src/game/stats.js";

const TRIALS = 200;
const MAX_ROUNDS = 15;

const SCENARIOS = [
  { name: "medium city (garrison 6, no defender)", garrison: 6, defenders: 0, attackers: 2 },
  { name: "high city (garrison 8, 1 defender)", garrison: 8, defenders: 1, attackers: 3 },
  { name: "veryHigh city (garrison 10, 2 defenders)", garrison: 10, defenders: 2, attackers: 4 },
  { name: "veryHigh city, GEARED attackers (T2 blades ×3 + Bombard lead)", garrison: 10, defenders: 2, attackers: 4, gear: true },
];

// Group the alive attacker uids into per-turn contest schedules.
// Each entry: { initiator, coalition | null } — null = legacy whole-stack.
const MODELS = {
  "A  legacy 2-action": (alive) =>
    alive.slice(0, 2).map((u) => ({ initiator: u, coalition: null })),
  "B  naive per-unit": (alive) =>
    alive.map((u) => ({ initiator: u, coalition: null })),
  "C  one big push": (alive) =>
    alive.length ? [{ initiator: alive[0], coalition: alive.slice(1) }] : [],
  "C  all solo": (alive) =>
    alive.map((u) => ({ initiator: u, coalition: [] })),
  "C  pairs": (alive) => {
    const out = [];
    for (let i = 0; i < alive.length; i += 2) {
      out.push({ initiator: alive[i], coalition: alive[i + 1] ? [alive[i + 1]] : [] });
    }
    return out;
  },
};

function runTrial(seed, scenario, schedule) {
  const g = createGame({ seed });
  startTurn(g);
  const atk = g.turnOrder[g.activeIndex];
  const def = g.turnOrder.find((f) => f !== atk);
  const loc = Object.values(g.locations).find((l) => l.controller === def);

  // Stage the siege: banded garrison, full sections, staged defenders,
  // attacker stack on the wall. Strip the capital chip so loyalty behaves
  // like a normal city and garrison is exactly the band.
  loc.garrison = scenario.garrison;
  loc.sections = Array(scenario.sections || 3).fill(def);
  loc.chips = loc.chips.filter((c) => g.chips[c]?.chipId !== "capital");
  loc.loyalty = 8; loc.loyaltyOwner = def;

  const defUnits = Object.values(g.units).filter((u) => u.owner === def);
  defUnits.forEach((u, i) => {
    if (i < scenario.defenders) {
      u.node = loc.hexId; u.movedSinceUpkeep = false; u.fortified = true;
      if (scenario.defGear) {
        const uid = g.nextId("chip");
        g.chips[uid] = { uid, chipId: "sharpened-blades" };
        u.chips = [uid];
      }
    }
    else delete g.units[u.uid]; // spare defenders leave the board
  });

  // Attacker brings exactly `scenario.attackers` fresh units to the hex.
  const atkUnits = Object.values(g.units).filter((u) => u.owner === atk);
  while (atkUnits.length > scenario.attackers) delete g.units[atkUnits.pop().uid];
  while (atkUnits.length < scenario.attackers) {
    const uid = g.nextId("unit");
    g.units[uid] = { ...atkUnits[0], uid, chips: [], name: `sim-${uid}` };
    atkUnits.push(g.units[uid]);
  }
  const startingStrength = atkUnits.length * atkUnits[0].baseStrength;
  atkUnits.forEach((u, i) => {
    u.node = loc.hexId;
    if (scenario.gear) {
      const uid = g.nextId("chip");
      // Lead unit hauls the Bombard (siege rider); the rest carry T2 blades.
      g.chips[uid] = { uid, chipId: i === 0 ? "bombard" : "sharpened-blades" };
      u.chips = [uid];
    }
  });
  if (scenario.gear || scenario.defGear) {
    gStats.recomputeStats(g);
  }
  if (scenario.defGear) {
    // Geared city: a Stronghold chip on the walls (+4 garrison).
    const uid = g.nextId("chip");
    g.chips[uid] = { uid, chipId: "stronghold" };
    loc.chips.push(uid);
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // --- attacker turn (already active on round 1)
    g.players[atk].actions.remaining = 99;
    const alive = () => atkUnits.filter((u) => g.units[u.uid]).map((u) => u.uid);
    for (const step of schedule(alive())) {
      if (!g.units[step.initiator]) continue;
      if (loc.controller === atk) break;
      performAction(g, "contest", {
        unit: step.initiator,
        ...(step.coalition != null ? { coalition: step.coalition.filter((u) => g.units[u]) } : {}),
      });
    }
    const lost = startingStrength -
      atkUnits.reduce((n, u) => n + (g.units[u.uid]?.baseStrength || 0), 0);
    if (loc.controller === atk) return { captured: true, turns: round, lost };
    if (!alive().length) return { captured: false, turns: round, lost };

    // --- everyone else's turns (defender heals/fortifies at its Upkeep)
    do { endTurn(g); startTurn(g); } while (activePlayerId(g) !== atk);
  }
  const lost = startingStrength -
    atkUnits.reduce((n, u) => n + (g.units[u.uid]?.baseStrength || 0), 0);
  return { captured: false, turns: MAX_ROUNDS, lost };
}

for (const scenario of SCENARIOS) {
  console.log(`\n=== ${scenario.name} — ${scenario.attackers} attackers (str 4 each) ===`);
  console.log("model              | capture% | mean turns | mean str lost");
  console.log("-------------------|----------|------------|--------------");
  for (const [name, schedule] of Object.entries(MODELS)) {
    let caps = 0, turnSum = 0, lostSum = 0;
    for (let i = 0; i < TRIALS; i++) {
      const r = runTrial(20000 + i, scenario, schedule);
      if (r.captured) { caps++; turnSum += r.turns; }
      lostSum += r.lost;
    }
    const rate = ((100 * caps) / TRIALS).toFixed(0).padStart(7);
    const turns = caps ? (turnSum / caps).toFixed(1).padStart(9) : "      —  ";
    const lost = (lostSum / TRIALS).toFixed(1).padStart(11);
    console.log(`${name.padEnd(19)}|${rate}% |${turns}  |${lost}`);
  }
}

// --- Sensitivity: section count (the capture clock) and geared defenders.
const SENS_MODELS = ["A  legacy 2-action", "B  naive per-unit", "C  one big push"];
console.log("\n=== SENSITIVITY: sections × geared defenders (veryHigh, both sides geared) ===");
console.log("sections | defense           | model              | capture% | mean turns");
console.log("---------|-------------------|--------------------|----------|----------");
for (const sections of [3, 4, 5]) {
  for (const defGear of [false, true]) {
    for (const name of SENS_MODELS) {
      const scenario = {
        garrison: 10, defenders: 2, attackers: 4, gear: true, defGear, sections,
        name: "sens",
      };
      let caps = 0, turnSum = 0;
      for (let i = 0; i < TRIALS; i++) {
        const r = runTrial(40000 + i, scenario, MODELS[name]);
        if (r.captured) { caps++; turnSum += r.turns; }
      }
      const rate = ((100 * caps) / TRIALS).toFixed(0).padStart(7);
      const turns = caps ? (turnSum / caps).toFixed(1).padStart(8) : "     —  ";
      console.log(`    ${sections}    | ${(defGear ? "geared (str+2, +4 wall)" : "plain").padEnd(18)}| ${name.padEnd(19)}|${rate}% |${turns}`);
    }
  }
}
