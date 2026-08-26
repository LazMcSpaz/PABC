// Is scrap ever actually scarce, and would raising prices change that?
//
//   node scripts/probe-economy.mjs
//   node scripts/probe-economy.mjs --n 10
//
// WHY. The opening reads cheap: one settlement makes 5, two starting units eat
// 2, so a faction nets +3 a turn against a chip table where 15 of 40 chips
// cost 3 or less and 29 of 40 cost 5 or less. Everything is affordable in one
// or two turns and nothing has to be weighed against anything.
//
// The obvious fix is to raise prices. The reason to measure first is that a
// price only bites while money is the thing you have least of, and there are
// three other ceilings in this game that do not move when a price does:
//
//   SLOTS    a Location holds `chipSlots` (3) plus one at Loyalty 6. Four
//            chips in a city, ever, however rich you are.
//   ACTIONS  one per Location, and `baseActions` is 0. A one-city faction
//            takes one action a turn whatever is in the bank.
//   TECH     20 chips need Tech Level 1, 17 need 3, 3 need 5.
//
// So this probe does not ask "are prices low". It asks WHICH CEILING IS
// BINDING, round by round, and then re-asks it under each candidate change.
// A scenario that moves `moneyBound` without moving `slotBound` has made the
// opening tighter and the rest of the game identical.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { takeAITurn } from "../src/game/ai.js";
import { activePlayerId } from "../src/game/targeting.js";
import { MINOR_FACTIONS, CHIPS } from "../src/game/content.js";
import { holdsLocation } from "../src/game/control.js";
import { slotCapacity, techLevelReqFor } from "../src/game/economy.js";
import { CONFIG } from "../src/game/config.js";

const argN = Number((process.argv.find((a) => a.startsWith("--n=")) || "").split("=")[1])
  || (process.argv.includes("--n") ? Number(process.argv[process.argv.indexOf("--n") + 1]) : 0);
const SEEDS = [1234, 424242, 7, 991, 4711, 8123, 20260821, 31337, 55555, 90210]
  .slice(0, argN || 6);
const ROUNDS = 30;
const MAJORS = ["versari", "goldgrass", "lakers", "plainers"];

// Costs live in CHIPS, not CONFIG, so a scenario has to write them — and put
// them back. Every scenario is applied to a pristine copy of the originals so
// they cannot stack.
const BASE_COSTS = Object.fromEntries(
  Object.entries(CHIPS).map(([id, c]) => [id, c.buildCost ?? c.cost ?? 0]));
const BASE_FREE = CONFIG.economy.freeChips;
const BASE_PER = CONFIG.economy.perExtraChip;
const BASE_CAP = CONFIG.capital.productionBonus;

function reset() {
  for (const [id, cost] of Object.entries(BASE_COSTS)) {
    if (CHIPS[id].buildCost !== undefined) CHIPS[id].buildCost = cost;
    else CHIPS[id].cost = cost;
  }
  CONFIG.economy.freeChips = BASE_FREE;
  CONFIG.economy.perExtraChip = BASE_PER;
  CONFIG.capital.productionBonus = BASE_CAP;
}
function scaleCosts(fn) {
  for (const [id, cost] of Object.entries(BASE_COSTS)) {
    if (cost <= 0) continue; // the six free chips stay free — they are rewards
    const next = Math.max(1, Math.round(fn(cost)));
    if (CHIPS[id].buildCost !== undefined) CHIPS[id].buildCost = next;
    else CHIPS[id].cost = next;
  }
}

const SCENARIOS = [
  { key: "baseline", label: "as shipped", apply: () => {} },
  { key: "x1.5", label: "costs x1.5", apply: () => scaleCosts((c) => c * 1.5) },
  { key: "x2", label: "costs x2", apply: () => scaleCosts((c) => c * 2) },
  { key: "free2", label: "freeChips 6->2", apply: () => { CONFIG.economy.freeChips = 2; } },
  { key: "free0", label: "freeChips 6->0", apply: () => { CONFIG.economy.freeChips = 0; } },
  { key: "x1.5+free2", label: "x1.5 and freeChips 2", apply: () => { scaleCosts((c) => c * 1.5); CONFIG.economy.freeChips = 2; } },
  { key: "per2", label: "upkeep 1->2 past 6", apply: () => { CONFIG.economy.perExtraChip = 2; } },
  { key: "free1", label: "freeChips 6->1", apply: () => { CONFIG.economy.freeChips = 1; } },
  // The lever nobody named: a capital makes `production + capital.productionBonus`.
  // Cutting the bonus tightens the opening without touching a single price,
  // and unlike a price it keeps tightening as the game goes on, because it is
  // income rather than a one-off.
  { key: "cap-1", label: "capital bonus -1", apply: () => { CONFIG.capital.productionBonus -= 1; } },
];

// The question every sample asks: with the money this faction is holding, in
// the cities it holds, at the Tech Level it has — is there anything it could
// build? And if not, which ceiling said no?
function readCeilings(g, fid) {
  const locs = Object.values(g.locations).filter((l) => holdsLocation(l, fid));
  if (!locs.length) return null;
  const held = g.players[fid].resource;
  const tl = g.players[fid].techLevel || 1;
  let anySlot = false, anyAffordable = false, anyTech = false;
  for (const loc of locs) {
    const room = loc.chips.length < slotCapacity(loc, g);
    if (room) anySlot = true;
    for (const def of Object.values(CHIPS)) {
      if (def.kind && def.kind !== "location") continue;
      const cost = def.buildCost ?? def.cost ?? 0;
      const needTl = def.techLevelReq ?? techLevelReqFor(def.techLevel ?? 1);
      if (tl < needTl) continue;
      anyTech = true;
      if (cost <= held) { anyAffordable = true; if (room) return { bound: "none", held, locs: locs.length }; }
    }
  }
  // Ordered by which wall you hit first when you try to spend.
  const bound = !anySlot ? "slots" : !anyTech ? "tech" : !anyAffordable ? "money" : "none";
  return { bound, held, locs: locs.length };
}

function runScenario(sc) {
  reset();
  sc.apply();
  const tally = { none: 0, money: 0, slots: 0, tech: 0 };
  const early = { none: 0, money: 0, slots: 0, tech: 0 }; // rounds 1-8
  let heldSum = 0, heldN = 0, chipsBuilt = 0, firstBuild = [];
  for (const seed of SEEDS) {
    const g = createGame({ seed, factionIds: MAJORS, humanFactionId: "versari",
      minors: Object.keys(MINOR_FACTIONS), mapSize: "medium" });
    for (const p of Object.values(g.players)) p.isAI = true;
    startTurn(g);
    let guard = ROUNDS * (g.turnOrder.length + 2) + 64;
    let sampled = 0;
    while (!g.winnerId && g.round <= ROUNDS && guard-- > 0) {
      if (g.round !== sampled) {
        sampled = g.round;
        for (const f of MAJORS) {
          if (g.players[f].eliminated) continue;
          const r = readCeilings(g, f);
          if (!r) continue;
          tally[r.bound] += 1;
          if (g.round <= 8) early[r.bound] += 1;
          heldSum += r.held; heldN += 1;
        }
      }
      if (!activePlayerId(g)) { endTurn(g); continue; }
      const before = g.log.length;
      takeAITurn(g);
      if (g.log.length === before) endTurn(g);
    }
    const builds = g.log.filter((e) => e.name === "chip_built" || e.name === "build_completed");
    chipsBuilt += builds.length;
    const first = builds.find((e) => MAJORS.includes(e.payload?.player));
    if (first) firstBuild.push(first.round ?? 0);
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
  const eTotal = Object.values(early).reduce((a, b) => a + b, 0) || 1;
  return {
    label: sc.label,
    moneyAll: tally.money / total,
    moneyEarly: early.money / eTotal,
    slotsAll: tally.slots / total,
    freeAll: tally.none / total,
    medianHeld: Math.round(heldSum / Math.max(1, heldN)),
    buildsPerGame: (chipsBuilt / SEEDS.length).toFixed(1),
  };
}

console.log(`\n${SEEDS.length} seeds x ${ROUNDS} rounds x 4 majors — which ceiling is binding?\n`);
console.log("scenario              money-bound  (rounds 1-8)  slot-bound  nothing-bound  med.held  builds/game");
const rows = [];
for (const sc of SCENARIOS) {
  const r = runScenario(sc);
  rows.push(r);
  const pct = (x) => `${String(Math.round(x * 100)).padStart(3)}%`;
  console.log(
    `${r.label.padEnd(22)}${pct(r.moneyAll)}        ${pct(r.moneyEarly)}       ${pct(r.slotsAll)}       ${pct(r.freeAll)}` +
    `        ${String(r.medianHeld).padStart(4)}      ${String(r.buildsPerGame).padStart(5)}`);
}
reset();
console.log("\n  money-bound   = held scrap could not buy anything it had room and tech for");
console.log("  slot-bound    = every city full, so no price would have mattered");
console.log("  nothing-bound = it could have built something and chose not to\n");
