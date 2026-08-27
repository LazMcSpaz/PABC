// The scoreboard. N seeded AI-only games on the real engine, reporting the
// numbers the 2026-08-23 diplomacy and economy briefs are graded against.
//
//   node scripts/sim-suite.mjs                 # the pinned 15-seed suite
//   node scripts/sim-suite.mjs --seeds 7,991   # a subset, for a quick look
//   node scripts/sim-suite.mjs --json out.json # machine-readable, for deltas
//   node scripts/sim-suite.mjs --baseline docs/sim-baseline.json
//                                              # …and print the delta against it
//
// WHY THIS EXISTS. Between them the two briefs name roughly fifteen numbers to
// move, and before this script the repo could measure exactly one of them
// (`node src/game/harness.js`). Eight of the proposals are explicitly
// conditioned on measurement. A scoreboard that arrives after the rules change
// turns every later decision into an argument.
//
// THE THREE GOVERNING NUMBERS (implementation plan §1.6). Any stage that
// pushes these outside the band gets retuned or reverted BEFORE the next stage
// lands — two stages deep is where you stop being able to tell which one did
// it.
//
//   ending mix (submission + mixed, of 15)   band >= 11
//   median rounds to Dominion                band  baseline +/- 4
//   games unresolved                         band  0
//
// The doc-reported values (13 / 29 / 1) are NOT this suite's baseline — see
// the note on the seeds below. docs/sim-baseline.json holds the real one.
//
// A NOTE ON THE SEEDS, AND ON THE DOC'S NUMBERS. The implementation plan asks
// for "the same 15 seeds victory-redesign-2026-08-21.md used, so today's
// numbers are directly comparable." They cannot be: that doc reports a 15-game
// AI-only suite and names exactly ONE of its seeds (1234, the game that never
// resolved), records no faction roster, no map size and no minor list, and the
// engine has moved since. Sweeping the plausible configurations reproduces
// none of its headline figures — 4 majors on the legacy board medians 46, on a
// medium board 47, with two minors 59.
//
// So the honest thing, and the thing the rest of the plan actually needs: pin
// a configuration and a seed list HERE, run it, and re-anchor the §1.6 bands
// to this suite's own baseline. The list is 1234 plus the ten seeds
// `check-route-geometry.mjs` already treats as the repo's canonical spread,
// plus four more to reach fifteen. Do not reshuffle it; comparability across
// stages is the whole point, and it is comparability with the NEXT run that
// matters, not with a number nobody can recompute.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { takeAITurn, DIPLOMACY_BRANCH_ORDER } from "../src/game/ai.js";
import { activePlayerId } from "../src/game/targeting.js";
import { MINOR_FACTIONS, factionDef } from "../src/game/content.js";
import { vassalLord, arePacted } from "../src/game/diplomacy.js";
import { CONFIG } from "../src/game/config.js";
import { readFileSync, writeFileSync } from "node:fs";

// The fifteen pinned seeds. Pinned because a moving seed set makes every
// comparison across commits meaningless.
export const SEEDS = [
  1234, 424242, 7, 991, 4711, 8123, 20260821, 31337, 55555, 90210,
  123456, 2026, 606, 77, 31415,
];

// `--n N` extends the run past the pinned fifteen, DETERMINISTICALLY: the
// extra seeds are generated from a fixed formula, so seed 16 is the same seed
// on every machine and every commit and the first fifteen never move.
//
// Why this exists. Three switches ship dark on the strength of readings taken
// at n=15, where one seed flipping moves the ending mix by a whole point — and
// the same fifteen games have been re-read so many times that a difference of
// one or two endings has been called signal more than once in this document.
// A decision that stays set for a long time deserves a bigger sample than a
// tuning nudge does.
function seedsFor(n) {
  if (!n || n <= SEEDS.length) return SEEDS.slice(0, n || SEEDS.length);
  const out = [...SEEDS];
  // A cheap LCG off a fixed constant. Any deterministic generator would do;
  // what matters is that it never changes.
  let x = 20260823;
  while (out.length < n) {
    x = (x * 1103515245 + 12345) % 2147483648;
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

// Past this a game is called unresolved. 80 is well clear of the median so the
// cap is never the story: spot-checked at 150 rounds, the games that pass 80
// are genuinely deadlocked rather than slow, which is exactly the failure the
// diplomacy brief §15 predicts from the `mayEngage` minor-reachability hole.
const MAX_ROUNDS = 80;
const SNAPSHOT_ROUND = 15; // where the 2026-08-15 playtest took its readings

// --- argv ------------------------------------------------------------
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
// `--seeds a,b,c` names an explicit set; `--n 40` extends the pinned fifteen.
const seeds = argOf("--n")
  ? seedsFor(Number(argOf("--n")))
  : argOf("--seeds")
  ? argOf("--seeds").split(",").map((s) => Number(s.trim()))
  : SEEDS;
const jsonOut = argOf("--json");
// `--map large` runs the whole suite on a bigger board. NOT comparable
// seed-for-seed to another size — a different Location budget means a
// different `rng.shuffle` deck and therefore a different game per seed — so
// read size-vs-size as two populations, and keep the one-flag-on-one-build
// rule for everything else.
const mapSize = argOf("--map") || "medium";
const baselinePath = argOf("--baseline");
const quiet = argv.includes("--quiet");

// --set diplomacy.reach.reachabilityRounds=0,diplomacy.deals.chargeAskOnAccept=false
//
// Patches CONFIG before any game is built. This is how a stage that moves a
// governing number gets ISOLATED: the plan's rule is that a stage pushing the
// three numbers out of band is retuned or reverted before the next one lands,
// and you cannot do either without being able to run each half on its own.
// It is also how tuning happens once, at the end, rather than per stage.
const overrides = argOf("--set");
if (overrides) {
  for (const pair of overrides.split(",")) {
    const [path, raw] = pair.split("=");
    const keys = path.trim().split(".");
    let node = CONFIG;
    for (const k of keys.slice(0, -1)) {
      if (node[k] == null) throw new Error(`--set: no CONFIG path ${path}`);
      node = node[k];
    }
    const last = keys[keys.length - 1];
    const v = raw === "true" ? true : raw === "false" ? false
      : raw === "null" ? null : Number.isNaN(Number(raw)) ? raw : Number(raw);
    node[last] = v;
    if (!quiet) console.log(`  --set ${path} = ${JSON.stringify(v)}`);
  }
}

// --- one game --------------------------------------------------------

// Every faction is driven by takeAITurn. `humanFactionId` still names a
// faction because `isAI` keys off it and a few display paths want a seat, but
// nothing here ever calls endTurn on the human's behalf — the AI plays all
// four majors and every seeded minor, which is what makes the ending mix a
// measurement of the RULES rather than of one scripted policy.
function runGame(seed) {
  const g = createGame({
    seed,
    factionIds: ["versari", "goldgrass", "lakers", "plainers"],
    humanFactionId: "versari",
    minors: Object.keys(MINOR_FACTIONS),
    mapSize,
  });
  for (const p of Object.values(g.players)) p.isAI = true;
  startTurn(g);

  const snapshot = {};
  let guard = MAX_ROUNDS * (g.turnOrder.length + 2) + 64;
  let aiTurns = 0;
  while (!g.winnerId && g.round <= MAX_ROUNDS && guard-- > 0) {
    const pid = activePlayerId(g);
    if (!pid) { endTurn(g); continue; }
    const before = g.log.length;
    takeAITurn(g);
    aiTurns += 1;
    if (g.log.length === before) endTurn(g); // a wedged seat never stalls the suite
    if (!snapshot.taken && g.round > SNAPSHOT_ROUND) {
      snapshot.taken = true;
      snapshot.at = readSnapshot(g);
    }
  }
  if (!snapshot.taken) snapshot.at = readSnapshot(g);
  return summarise(g, { aiTurns, snapshot: snapshot.at, seed });
}

// The 2026-08-15 playtest's readings, taken at the same point in the game so
// the "36 scrap, Tech 1, no nodes" row means the same thing it did then.
function readSnapshot(g) {
  const rows = [];
  for (const pid of Object.keys(g.players)) {
    const p = g.players[pid];
    if (!p || factionDef(pid)?.tier === "minor") continue;
    const nodes = (p.techWheel || []).length;
    // §6 — how much GROUND it holds, recorded alongside the wheel because the
    // two rows only mean anything together. See the note on
    // `factionsWithEmptyWheelAtR15` below.
    const locs = Object.values(g.locations).filter((l) => l.controller === pid).length;
    rows.push({ pid, scrap: p.resource || 0, techLevel: p.techLevel || 1, nodes, locs });
  }
  return rows;
}

const evName = (g, name) => g.log.filter((e) => e.name === name);

function summarise(g, { aiTurns, snapshot, seed }) {
  const won = evName(g, "dominion_won")[0];
  const ending = g.winnerId ? (won?.payload?.by || "unknown") : "unresolved";

  // --- diplomacy acts, and their mix. `performDiplomacy` does not emit a
  // single "an act happened" event, so the act set is the union of the events
  // the verbs actually produce. Counting events rather than intentions means a
  // refused ask does not inflate the rate.
  const ACT_EVENTS = [
    "deal_proposed", "offer_tabled", "denounced", "ultimatum_issued",
    "pact_formed", "vassal_established", "tribute_demanded", "mediated",
    "trading_pact_formed", "grievances_settled", "peace_made",
  ];
  const acts = ACT_EVENTS.reduce((n, k) => n + evName(g, k).length, 0);
  const denouncements = evName(g, "denounced").length;

  // --- §1 — the political pass, per BRANCH.
  //
  // `actsPerAITurn` above is not the act rate and never was. The union of verb
  // events it counts leaves out the single most common act in the game:
  // opening a COURTSHIP emits `posture_changed` and nothing else, and it is
  // the only political act that climbs the ladder Dominion is made of. At
  // 61.56 courtships a game against ~270 AI turns it was missing roughly a
  // third of every act taken. The published 0.45 is a subset rate.
  //
  // `ai_political_act` is emitted by `manageDiplomacy` itself, carries the
  // name of the branch that spent the act, and so answers both questions at
  // once: what the real rate is, and — because the pass is bounded to ONE act
  // and branch order is priority — which branches are actually reachable.
  // A branch that never appears here is a branch something above it is eating.
  const political = evName(g, "ai_political_act");
  const branchMix = {};
  for (const e of political) {
    const b = e.payload?.branch || "unknown";
    branchMix[b] = (branchMix[b] || 0) + 1;
  }

  // --- wars, and how they opened. A war whose declaration is preceded by the
  // attacker's own surprise-attack Honor charge was opened by a blow, not a
  // word. `surprise_attack_honor_lost` is emitted only on that path.
  const wars = evName(g, "war_declared");
  const surprises = evName(g, "surprise_attack_honor_lost").length;
  // §12.3 — the intrigue branch, and whether it is the Sway sink it was built
  // to be. `swayRoundsAtCapShare` has read ~0.30 since phase 3 with the note
  // "wait for ops" against it every time; this is the row that settles it.
  // Courtship is the only political act that advances Dominion, so it is the
  // one to watch when a new Sway sink lands: both `ai.intrigue` and the AI
  // gift drain the pool `canSustainCourtship` reads.
  const courtOpened = evName(g, "posture_changed").filter((e) => e.payload.to === "Courting").length;
  const opsRun = evName(g, "op_expose").length + evName(g, "op_forge").length
    + evName(g, "op_fabricate").length;
  // `op_backfired` covers every covert act that was seen through, which since
  // §17.5 includes SABOTAGE — the AI runs no lies, so anything counted here is
  // a saboteur being traced. Named for what it measures rather than for the
  // branch it started in.
  const opsBackfired = evName(g, "op_backfired").length;
  const sabotageTraced = evName(g, "sabotage_traced").length;

  // --- minors: allied or vassalised RATHER THAN killed. The brief's row.
  //
  // Counted EVER, from the log, not only at the final board. Reading it off
  // the end state measures something else: a minor that was allied for twenty
  // rounds and then conquered scores zero, so the row collapses toward zero
  // whenever the war rate is high and stops reporting on reachability at all.
  // "Was this faction ever reachable by something other than an army" is the
  // question §15 is asking.
  const minorIds = Object.keys(g.players).filter((p) => factionDef(p)?.tier === "minor");
  const everCourted = new Set();
  for (const e of g.log) {
    if (e.name === "pact_formed") {
      for (const k of [e.payload?.a, e.payload?.b]) if (minorIds.includes(k)) everCourted.add(k);
    } else if (e.name === "vassal_established") {
      if (minorIds.includes(e.payload?.vassal)) everCourted.add(e.payload.vassal);
    }
  }
  let minorsAllied = 0, minorsVassal = 0, minorsDead = 0;
  for (const m of minorIds) {
    if (g.players[m]?.eliminated) minorsDead += 1;
    if (vassalLord(g, m)) { minorsVassal += 1; continue; }
    if (Object.keys(g.players).some((f) => f !== m && arePacted(g, f, m))) minorsAllied += 1;
  }

  // --- Sway. Read defensively off the player record: the currency does not
  // exist yet, so every row is zero until economy stage 4 lands. The rows are
  // here from day one so the baseline commit shows what "before" looked like
  // and the delta after stage 4 is a number rather than a new column.
  const sway = {};
  for (const pid of Object.keys(g.players)) {
    if (g.players[pid]?.eliminated) continue;
    const p = g.players[pid];
    sway[pid] = { income: p.swayIncome || 0, pool: p.sway || 0 };
  }
  // Only SURVIVING minors. A game where every minor is dead has no minor
  // income to report, and folding a 0 in there measures the war rate rather
  // than the income curve — the same confound the courted-ever row fixes.
  const minorIncomes = minorIds.filter((m) => sway[m]).map((m) => sway[m].income);
  const majorIncomes = Object.keys(sway)
    .filter((p) => factionDef(p)?.tier !== "minor").map((p) => sway[p].income);
  // Rounds spent pinned at the ceiling, as a share. The brief's target is
  // under 15%: a pool that sits at the cap is a currency that prices nothing,
  // and it is the first thing to look at when a sink does not bite.
  const capEvents = evName(g, "sway_capped").length;
  const factionRounds = Math.max(1, g.round * Object.keys(g.players).length);

  return {
    seed,
    round: g.round,
    winner: g.winnerId || null,
    ending,
    aiTurns,
    actsPerTurn: aiTurns ? acts / aiTurns : 0,
    politicalActsPerTurn: aiTurns ? political.length / aiTurns : 0,
    branchMix,
    denounceShare: acts ? denouncements / acts : 0,
    wars: wars.length,
    surpriseOpenings: surprises,
    opsRun, opsBackfired, sabotageTraced, courtOpened,
    coalitions: evName(g, "coalition_formed").length,
    minors: {
      allied: minorsAllied, vassal: minorsVassal, dead: minorsDead,
      everCourted: everCourted.size, total: minorIds.length,
    },
    // Economy rows
    endScrap: snapshot,
    emptyWheels: snapshot.filter((r) => r.nodes === 0).length,
    // The same count, split by whether the faction still holds ground. See the
    // report row for why the split is the whole finding.
    emptyWheelsLandless: snapshot.filter((r) => r.nodes === 0 && r.locs === 0).length,
    emptyWheelsWithLand: snapshot.filter((r) => r.nodes === 0 && r.locs > 0).length,
    delayedPurchases: evName(g, "purchase_delayed").length,
    supplyRefusals: evName(g, "purchase_refused_unsupplied").length,
    chipUpgrades: evName(g, "chip_upgraded").length,
    pressureEvents: evName(g, "influence_pressure").length,
    occupationCharges: evName(g, "occupation_charged").length,
    sway: {
      minMinor: minorIncomes.length ? Math.min(...minorIncomes) : null,
      maxMajor: majorIncomes.length ? Math.max(...majorIncomes) : null,
      atCapShare: capEvents / factionRounds,
      lapsedCourtships: evName(g, "courtship_lapsed").length,
    },
  };
}

// --- the suite -------------------------------------------------------

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (n) => Math.round(n * 100) / 100;
// Total branch fires across the suite, ordered by the priority the chain runs
// them in, so a starved branch reads as a hole in the middle of the list
// rather than as a name you have to notice is missing.
const sumMix = (mixes) => {
  const total = {};
  for (const m of mixes) for (const k of Object.keys(m)) total[k] = (total[k] || 0) + m[k];
  const out = {};
  for (const id of DIPLOMACY_BRANCH_ORDER) out[id] = total[id] || 0;
  for (const k of Object.keys(total)) if (!(k in out)) out[k] = total[k];
  return out;
};

const games = [];
for (const seed of seeds) {
  const t0 = Date.now();
  let g;
  try {
    g = runGame(seed);
  } catch (err) {
    g = { seed, ending: "threw", error: String(err && err.message || err), round: 0 };
    if (!quiet) console.error(`  seed ${seed} threw: ${g.error}`);
  }
  g.ms = Date.now() - t0;
  games.push(g);
  if (!quiet) {
    console.log(`  seed ${String(seed).padStart(8)}  ${String(g.ending).padEnd(11)}` +
      ` round ${String(g.round).padStart(3)}  winner ${(g.winner || "—").padEnd(10)}  ${g.ms}ms`);
  }
}

const ok = games.filter((g) => g.ending !== "threw");
const byEnding = {};
for (const g of games) byEnding[g.ending] = (byEnding[g.ending] || 0) + 1;
const resolved = ok.filter((g) => g.winner);
const mixLike = (byEnding.submission || 0) + (byEnding.mixed || 0);

const report = {
  generatedFor: seeds.length + " seeds",
  seeds,
  overrides: overrides || null,
  // --- the three governing numbers -----------------------------------
  governing: {
    endingMix: { submissionPlusMixed: mixLike, of: seeds.length, band: ">= 11" },
    medianRoundsToDominion: { value: median(resolved.map((g) => g.round)), band: "baseline +/- 4" },
    unresolved: { value: byEnding.unresolved || 0, band: "0" },
  },
  endings: byEnding,
  // --- diplomacy brief §17 --------------------------------------------
  diplomacy: {
    actsPerAITurn: r2(mean(ok.map((g) => g.actsPerTurn))),
    politicalActsPerAITurn: r2(mean(ok.map((g) => g.politicalActsPerTurn))),
    politicalBranchMix: sumMix(ok.map((g) => g.branchMix)),
    denounceShareOfActs: r2(mean(ok.map((g) => g.denounceShare))),
    warsPerGame: r2(mean(ok.map((g) => g.wars))),
    warsOpenedByUndeclaredAttack: r2(mean(ok.map((g) => g.surpriseOpenings))),
    coalitionsPerGame: r2(mean(ok.map((g) => g.coalitions))),
    courtshipsOpenedPerGame: r2(mean(ok.map((g) => g.courtOpened))),
    intrigueOpsPerGame: r2(mean(ok.map((g) => g.opsRun))),
    covertActsSeenThrough: r2(mean(ok.map((g) => g.opsBackfired))),
    sabotageTracedPerGame: r2(mean(ok.map((g) => g.sabotageTraced))),
    // At the final board — a snapshot, and confounded by the war rate.
    minorsAlliedOrVassalisedAtEnd: r2(mean(ok.map((g) => g.minors.allied + g.minors.vassal))),
    // Ever, from the log. THIS is §15's row: was the faction reachable by
    // something other than an army at any point in the game.
    minorsEverCourtedPerGame: r2(mean(ok.map((g) => g.minors.everCourted))),
    minorsKilledPerGame: r2(mean(ok.map((g) => g.minors.dead))),
  },
  // --- economy brief §17 ----------------------------------------------
  economy: {
    medianEndScrap: median(ok.flatMap((g) => g.endScrap.map((r) => r.scrap))),
    maxEndScrap: Math.max(0, ...ok.flatMap((g) => g.endScrap.map((r) => r.scrap))),
    // §6 — THIS ROW IS NOT A TECH BUG, and it was read as one for long enough
    // to be worth writing down. `maybeAssignTech` was the suspect: two majors
    // in every game reach round 15 with nothing on the wheel. Probing the
    // wheel state directly at round 15 across six seeds, EVERY faction with an
    // empty wheel also held ZERO Locations and sat at Tech Level 1 with 0-1
    // Research. There is nothing for the allocator to allocate: no ground, no
    // production, no Research, no Ability Point. `baseActions: 0` means it has
    // no actions either.
    //
    // So the row measures how often a faction is driven off the board before
    // round 15, and it belongs next to finding 5 (neither kind of player can
    // hold ground) rather than in the economy hunt. The split reports both
    // halves so the next reader does not have to re-derive it: only the
    // `WithLand` half could ever be an allocator bug, and it measures 0.
    factionsWithEmptyWheelAtR15: r2(mean(ok.map((g) => g.emptyWheels))),
    factionsEmptyWheelLandlessAtR15: r2(mean(ok.map((g) => g.emptyWheelsLandless))),
    factionsEmptyWheelHoldingLandAtR15: r2(mean(ok.map((g) => g.emptyWheelsWithLand))),
    chipUpgradesByAI: ok.reduce((n, g) => n + g.chipUpgrades, 0),
    purchasesDelayedBySupply: ok.reduce((n, g) => n + g.delayedPurchases, 0),
    purchasesRefusedUnsupplied: ok.reduce((n, g) => n + g.supplyRefusals, 0),
    influencePressureEvents: ok.reduce((n, g) => n + g.pressureEvents, 0),
    occupationCharges: ok.reduce((n, g) => n + g.occupationCharges, 0),
    swayMinorIncomeMin: (() => {
      const xs = ok.map((g) => g.sway.minMinor).filter((v) => v != null);
      return xs.length ? Math.min(...xs) : null;
    })(),
    swayLeaderToMinorRatio: (() => {
      const lo = mean(ok.map((g) => g.sway.minMinor).filter((v) => v != null));
      const hi = mean(ok.map((g) => g.sway.maxMajor).filter((v) => v != null));
      return lo > 0 ? r2(hi / lo) : null;
    })(),
    swayRoundsAtCapShare: r2(mean(ok.map((g) => g.sway.atCapShare))),
    courtshipsLapsedPerGame: r2(mean(ok.map((g) => g.sway.lapsedCourtships))),
  },
  games,
};

if (!quiet) {
  const G = report.governing;
  console.log("\n=== the three governing numbers ===");
  console.log(`  ending mix (submission + mixed)   ${G.endingMix.submissionPlusMixed} of ${G.endingMix.of}   band ${G.endingMix.band}`);
  console.log(`  median rounds to Dominion         ${G.medianRoundsToDominion.value}   band ${G.medianRoundsToDominion.band}`);
  console.log(`  games unresolved                  ${G.unresolved.value}   band ${G.unresolved.band}`);
  console.log(`  endings: ${JSON.stringify(byEnding)}`);
  console.log("\n=== diplomacy brief §17 ===");
  for (const [k, v] of Object.entries(report.diplomacy)) {
    console.log(`  ${k.padEnd(34)} ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
  console.log("\n=== economy brief §17 ===");
  for (const [k, v] of Object.entries(report.economy)) console.log(`  ${k.padEnd(34)} ${v}`);
}

if (baselinePath) {
  const base = JSON.parse(readFileSync(baselinePath, "utf8"));
  console.log(`\n=== delta against ${baselinePath} ===`);
  const walk = (a, b, path = "") => {
    for (const k of Object.keys(b)) {
      if (k === "games" || k === "seeds") continue;
      const av = a?.[k], bv = b[k];
      if (bv && typeof bv === "object") { walk(av, bv, `${path}${k}.`); continue; }
      if (typeof bv !== "number") continue;
      const d = bv - (av ?? 0);
      if (Math.abs(d) < 1e-9) continue;
      console.log(`  ${(path + k).padEnd(44)} ${av} -> ${bv}  (${d > 0 ? "+" : ""}${r2(d)})`);
    }
  };
  walk(base, report);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
