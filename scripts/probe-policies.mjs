// Scripted-policy probe — asking questions the 15-seed suite structurally
// cannot answer.
//
//   node scripts/probe-policies.mjs pacifist
//   node scripts/probe-policies.mjs spender
//
// WHY THIS EXISTS. `sim-suite.mjs` runs every faction on `takeAITurn`, which
// makes it a measurement of the RULES rather than of one scripted policy —
// that is its whole point and it is the right default. But it means the suite
// can only ever tell you what happens when everybody plays the way the AI
// plays, and three of the decisions made in this rework rest on claims about
// what happens when somebody DOESN'T:
//
//   · `attackPrice.enabled: 0`, `ai.giftAboveShareOfCap: 1` and `ai.intrigue: 0`
//     all ship dark, and all three were explained with one sentence — "this AI
//     cannot convert political capacity into progress toward winning". That
//     sentence was inferred from three correlated regressions and never tested.
//
//   · Every number in the Sway economy was tuned against an AI that barely
//     spends Sway (30% of rounds at its ceiling, gifts off, ops off). A human
//     player spends. Nothing has ever exercised the currency as a spender.
//
// So: one faction runs a scripted policy, everybody else runs `takeAITurn`.
// The scripted policies reuse the REAL `manageEconomy` and, where they can,
// the real political pass — a probe that substitutes its own stand-in for
// those is measuring the stand-in.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { takeAITurn, manageEconomy, manageDiplomacy, planContest, maybeAssignTech } from "../src/game/ai.js";
import { activePlayerId } from "../src/game/targeting.js";
import { performAction } from "../src/game/actions.js";
import { MINOR_FACTIONS, factionDef } from "../src/game/content.js";
import { CONFIG } from "../src/game/config.js";
import { bfsDistances } from "../src/game/board.js";
import {
  speakPosture, performDiplomacy, atWar, arePacted, vassalLord, mayCourt,
  isCourting, courtshipScore, swayOf, swayIncome, courtingList, exposableStrikes,
  getStanding, passesRepGates, aiAcceptsVassalage, vassalize, checkDominion,
  factionIds, dominionStanding, coalitionAgainst,
} from "../src/game/diplomacy.js";

const r1 = (n) => Math.round(n * 10) / 10;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const MAJORS = ["versari", "goldgrass", "lakers", "plainers"];
const SEEDS = [1234, 424242, 7, 991, 4711, 8123, 20260821, 31337, 55555, 90210,
  123456, 2026, 606, 77, 31415];
const MAX_ROUNDS = 80;
const SUBJECT = "versari"; // the faction under the scripted policy

// --- shared bits ------------------------------------------------------

const ownUnits = (state, pid) => Object.values(state.units).filter((u) => u.owner === pid);

// A hex the subject may take WITHOUT making war on anybody: nobody holds it,
// or it is already partly theirs. This is the load-bearing definition for the
// pacifist run — if expansion onto empty ground counted as war there would be
// no such thing as a peaceful game and the test would be vacuous.
function neutralTarget(state, pid, hexId) {
  const loc = state.locations[hexId];
  if (!loc) return false;
  if (loc.controller && loc.controller !== pid) return false;
  if (loc.sections.every((s) => s === pid)) return false;
  // …and nobody else's unit is standing on it, so the contest cannot resolve
  // into a fight with a faction.
  return !Object.values(state.units).some((u) => u.node === hexId && u.owner !== pid);
}

function nearestNeutral(state, pid, unit) {
  const dist = bfsDistances(state.board.adjacency, unit.node);
  let best = null, bestD = Infinity;
  for (const hexId of Object.keys(state.locations)) {
    if (!neutralTarget(state, pid, hexId)) continue;
    const d = dist[hexId];
    if (d != null && d < bestD) { bestD = d; best = hexId; }
  }
  return best;
}

// --- policy: PACIFIST -------------------------------------------------
//
// Never attacks a faction, ever. Takes empty ground, builds, and works the
// political layer with the engine's own pass. The question it answers is the
// one three shipped-dark switches rest on: CAN the diplomacy face close?
function pacifistTurn(state, pid) {
  speakPosture(state, pid);
  maybeAssignTech(state, pid);

  let guard = 60;
  while (guard-- > 0 && !state.winnerId) {
    let acted = false;
    // 1. Take empty ground. Never a faction's Location, never a hex with
    //    somebody else's unit on it.
    for (const unit of ownUnits(state, pid)) {
      if ((unit.actionsRemaining ?? 0) < 1) continue;
      if (!neutralTarget(state, pid, unit.node)) continue;
      const plan = planContest(state, pid, unit.node);
      if (!plan) continue;
      if (performAction(state, "contest", { unit: plan.lead, coalition: plan.support }).ok) {
        acted = true; break;
      }
    }
    if (acted) continue;
    // 2. Walk toward the nearest empty Location.
    for (const unit of ownUnits(state, pid)) {
      const to = nearestNeutral(state, pid, unit);
      if (!to || to === unit.node) continue;
      if (performAction(state, "move", { unit: unit.uid, to }).ok) { acted = true; break; }
    }
    if (acted) continue;
    // 3. Recruit and run abilities, same as the real loop does.
    for (const loc of Object.values(state.locations)) {
      if (loc.controller !== pid) continue;
      if (performAction(state, "recruit", { at: loc.hexId }).ok) { acted = true; break; }
    }
    if (acted) continue;
    for (const loc of Object.values(state.locations)) {
      if (loc.controller !== pid || !loc.abilityId) continue;
      if (performAction(state, "activate", { location: loc.hexId }).ok) { acted = true; break; }
    }
    if (!acted) break;
  }

  if (!state.winnerId) manageEconomy(state, pid);
  // The REAL political pass. A pacifist that used a hand-written diplomacy
  // policy would be measuring the hand-written policy.
  if (!state.winnerId) manageDiplomacy(state, pid);
  if (!state.winnerId) endTurn(state);
}

// --- policy: SPENDER --------------------------------------------------
//
// Plays the AI's own game but actually SPENDS its political capacity: courts
// everything it can sustain, gifts down the surplus, and runs the intrigue
// branch. Nothing in the shipped AI does any of this — gifts and ops are both
// switched off for it — so the whole Sway economy has been tuned against a
// hoarder. This is the spender it was never tested against.
function spenderTurn(state, pid) {
  // The ordinary turn first, so the army and economy are the AI's, not a
  // stand-in's. `takeAITurn` ends the turn, so run the political spending
  // BEFORE it — spending is free of Actions, exactly as the real verbs are.
  spendPolitically(state, pid);
  takeAITurn(state);
}

// Did the pool ever actually SAY NO? A budget nothing is ever refused by is
// not a budget, and this is the only reading that distinguishes "the spender
// happened not to want more" from "the spender wanted more and could not".
const REFUSALS = { court: 0, gift: 0, op: 0, wanted: 0 };

function spendPolitically(state, pid) {
  const cfg = CONFIG.sway;
  const others = factionIds(state).filter((f) => f !== pid && state.players[f]);
  let guard = 12;
  while (guard-- > 0) {
    const pool = swayOf(state, pid);
    const committed = courtingList(state, pid).length * cfg.courtUpkeep;
    const free = pool - committed;
    let spent = false;

    // 1. Court everything sustainable. The shipped AI opens ONE courtship a
    //    round (`initiativesPerRound`); a player has no such cadence limit on
    //    how many they may run at once, only on how many they can pay for.
    if (free >= cfg.courtUpkeep * 2) {
      let best = null, bestScore = 0;
      for (const f of others) {
        if (isCourting(state, pid, f) || !mayCourt(state, pid, f)) continue;
        const sc = courtshipScore(state, pid, f);
        if (sc > bestScore) { bestScore = sc; best = f; }
      }
      if (best && performDiplomacy(state, pid, "court", { faction: best }).ok) { spent = true; continue; }
    } else if (others.some((f) => !isCourting(state, pid, f) && mayCourt(state, pid, f)
      && courtshipScore(state, pid, f) > 0)) {
      REFUSALS.court += 1; REFUSALS.wanted += 1;
    }
    // 2. Run an op if there is a true one to publish.
    if (free >= cfg.opCost) {
      const target = others.find((f) => exposableStrikes(state, f, pid).length);
      if (target && performDiplomacy(state, pid, "expose", { faction: target }).ok) { spent = true; continue; }
    } else if (others.some((f) => exposableStrikes(state, f, pid).length)) {
      REFUSALS.op += 1; REFUSALS.wanted += 1;
    }
    // 3. Gift the surplus at whoever is nearest the pact bar, keeping a full
    //    round of upkeep in hand.
    if (free >= cfg.perStanding + cfg.courtUpkeep) {
      let best = null, bestGap = Infinity;
      for (const f of others) {
        if (arePacted(state, pid, f) || atWar(state, pid, f) || !mayCourt(state, pid, f)) continue;
        const gap = CONFIG.diplomacy.pactStandingReq - getStanding(state, f, pid);
        if (gap > 0 && gap < bestGap) { bestGap = gap; best = f; }
      }
      if (best && performDiplomacy(state, pid, "gift", { faction: best, standing: 1 }).ok) { spent = true; continue; }
    } else if (others.some((f) => !arePacted(state, pid, f) && !atWar(state, pid, f)
      && mayCourt(state, pid, f)
      && CONFIG.diplomacy.pactStandingReq - getStanding(state, f, pid) > 0)) {
      REFUSALS.gift += 1; REFUSALS.wanted += 1;
    }
    if (!spent) break;
  }
  // …and close the deal when the bar is met, which is what the spending was for.
  for (const f of others) {
    if (arePacted(state, pid, f) || atWar(state, pid, f) || vassalLord(state, f) === pid) continue;
    if (!mayCourt(state, pid, f)) continue;
    if (aiAcceptsVassalage(state, f, pid)) { vassalize(state, pid, f, "probe"); checkDominion(state); continue; }
    const need = CONFIG.diplomacy.pactStandingReq;
    if (getStanding(state, pid, f) >= need && getStanding(state, f, pid) >= need
      && passesRepGates(state, pid, f) && passesRepGates(state, f, pid)) {
      performDiplomacy(state, pid, "propose-pact", { faction: f });
    }
  }
}

// --- policy: CRIPPLED -------------------------------------------------
//
// Starts the ordinary AI, then gets kneecapped at a fixed round: most of its
// ground taken, its treasury emptied, its Sway zeroed. The question is whether
// it can climb back, and it is a question the rework made urgent rather than
// academic — four recurring costs landed at once (Sway upkeep, occupation
// charges, the chip count surcharge, supply delay) plus chip dormancy, and
// nobody looked at them together.
//
// The design has refused this shape before: the first draft of the supply rule
// REFUSED off-supply purchases, and it was reverted precisely because it was
// "an elimination ratchet dressed as a supply rule". Four costs that each
// bite harder the less you hold can rebuild that ratchet by accident.
const CRIPPLE_ROUND = 20;
function crippledTurn(state, pid) {
  if (state.round === CRIPPLE_ROUND && !state.__crippled) {
    state.__crippled = true;
    const mine = Object.values(state.locations).filter((l) => l.controller === pid);
    // Leave exactly one Location — the "reduced to your last city" case the
    // supply guard was written for.
    for (const l of mine.slice(1)) {
      l.controller = null;
      l.sections = l.sections.map(() => "neutral");
      l.loyaltyOwner = null;
      l.loyalty = null;
    }
    state.players[pid].resource = 0;
    state.players[pid].sway = 0;
  }
  takeAITurn(state);
}

const POLICIES = { pacifist: pacifistTurn, spender: spenderTurn, crippled: crippledTurn, ai: null };

// --- the run ----------------------------------------------------------

function runGame(seed, policyName) {
  const policy = POLICIES[policyName];
  const g = createGame({
    seed,
    factionIds: MAJORS,
    humanFactionId: SUBJECT,
    minors: Object.keys(MINOR_FACTIONS),
    mapSize: "medium",
  });
  for (const p of Object.values(g.players)) p.isAI = true;
  startTurn(g);

  let guard = MAX_ROUNDS * (g.turnOrder.length + 2) + 64;
  while (!g.winnerId && g.round <= MAX_ROUNDS && guard-- > 0) {
    const pid = activePlayerId(g);
    if (!pid) { endTurn(g); continue; }
    const before = g.log.length;
    if (pid === SUBJECT && policy) policy(g, pid); else takeAITurn(g);
    if (g.log.length === before) endTurn(g);
  }

  const ev = (name) => g.log.filter((e) => e.name === name);
  // Recovery, for the crippled run: did it get anything back after the blow?
  const crippleAt = CRIPPLE_ROUND;
  const gainedAfter = ev("location_captured")
    .filter((e) => e.round > crippleAt && e.payload.controller === SUBJECT).length;
  const dormant = ev("chip_dormant").filter((e) => e.round > crippleAt).length;
  // Did the subject ever attack a FACTION? The pacifist claim has to be
  // checked, not assumed — a policy that quietly fights is not a test.
  const attacks = ev("surprise_attack_honor_lost").filter((e) => e.payload.attacker === SUBJECT).length
    + ev("war_declared").filter((e) => e.payload.a === SUBJECT && e.payload.cause !== "coalition").length;
  const alive = factionIds(g).filter((f) => g.players[f] && !g.players[f].eliminated);
  const subj = g.players[SUBJECT];
  // `dominionStanding` returns the three LISTS, not a score — the whole point
  // of the one condition being three faces. The number that matters is how
  // many factions are still outside all three.
  const dom = dominionStanding(g, SUBJECT);
  return {
    seed,
    winner: g.winnerId || null,
    subjectWon: g.winnerId === SUBJECT,
    rounds: g.round,
    ending: g.victoryKind || (g.winnerId ? "won" : "unresolved"),
    subjectAggressions: attacks,
    warsOnSubject: ev("war_declared").filter((e) => e.payload.b === SUBJECT).length,
    // How close the subject got: the Dominion score is the thing the whole
    // design turns on, so "did it win" is far too coarse a read.

    alive: alive.length,
    allies: dom.allied.length,
    vassals: dom.vassals.length,
    outstanding: dom.outstanding.length,
    outstandingWho: dom.outstanding.join(","),
    // How much of the board is left at all. A pacifist "1 still to deal with"
    // means something very different when the other three are dead.
    survivors: dom.others.length,
    // Counted from the LOG, not from the end state: a coalition that formed
    // and dissolved still happened, and reading only the final board hid one.
    coalitionsFormed: ev("coalition_formed").filter((e) => e.payload.target === SUBJECT).length,
    coalitioned: !!coalitionAgainst(g, SUBJECT),
    locations: Object.values(g.locations).filter((l) => l.controller === SUBJECT).length,
    scrap: subj?.resource ?? 0,
    sway: subj?.sway ?? 0,
    honor: subj?.honor ?? 0,
    menace: subj?.menace ?? 0,
    // Sway economy, from the spender's seat.
    swayIncome: swayIncome(g, SUBJECT).total,
    // Courting is a POSTURE transition, not its own event; a lapse is
    // `courtship_lapsed`. Reading the wrong names is how the first run of this
    // probe reported zero courtships for a faction that was courting.
    courtshipsOpened: ev("posture_changed")
      .filter((e) => e.payload.observer === SUBJECT && e.payload.to === "Courting").length,
    courtshipsLapsed: ev("courtship_lapsed").filter((e) => e.payload.observer === SUBJECT).length,
    // A gift moves the RECIPIENT's standing toward the giver, so the giver is
    // `player`, not `by`.
    giftsSent: ev("standing_changed")
      .filter((e) => e.payload.cause === "gift" && e.payload.player === SUBJECT).length,
    opsRun: ev("op_expose").filter((e) => e.payload.by === SUBJECT).length,
    swayCapped: ev("sway_capped").filter((e) => e.payload.player === SUBJECT).length,
    // What the board rose about, when it rose. A spotless pacifist being
    // coalitioned is the Attila failure the grounds gate exists to prevent.
    coalitionGrounds: ev("coalition_formed")
      .filter((e) => e.payload.target === SUBJECT)
      .map((e) => `${e.payload.grounds}@r${e.round}`).join(","),
    // How fast the board empties. The pacifist's "one still to deal with" means
    // something very different when the other three have been killed by
    // somebody else, and that turned out to be the usual case.
    deathRound: (() => {
      const d = ev("faction_eliminated");
      return d.length ? Math.round(mean(d.map((e) => e.round))) : null;
    })(),
    eliminations: ev("faction_eliminated").length,
    regained: gainedAfter,
    dormantChips: dormant,
    eliminatedSubject: !!g.players[SUBJECT]?.eliminated,
    survivedTo: g.players[SUBJECT]?.eliminated
      ? (ev("faction_eliminated").find((e) => e.payload.player === SUBJECT)?.round ?? null)
      : g.round,
  };
}



const policyName = process.argv[2] || "ai";
if (!(policyName in POLICIES)) {
  console.error(`unknown policy "${policyName}" — one of: ${Object.keys(POLICIES).join(", ")}`);
  process.exit(2);
}

console.log(`\n=== ${SUBJECT} plays "${policyName}", everybody else plays the AI ===\n`);
const rows = [];
for (const seed of SEEDS) {
  const t0 = Date.now();
  const r = runGame(seed, policyName);
  rows.push(r);
  console.log(
    `  seed ${String(seed).padStart(8)}  ${r.subjectWon ? "SUBJECT WINS" : (r.winner || "unresolved").padEnd(12)}` +
    `  r${String(r.rounds).padStart(3)}  survivors ${r.survivors}` +
    `  allies ${r.allies} vassals ${r.vassals} left ${r.outstanding}` +
    `  atk ${String(r.subjectAggressions).padStart(2)}  ${Date.now() - t0}ms`,
  );
}

const wins = rows.filter((r) => r.subjectWon).length;
console.log(`\n  subject wins                 ${wins} of ${rows.length}`);
console.log(`  …and the board's own winner  ${rows.filter((r) => r.winner && !r.subjectWon).length}`);
console.log(`  unresolved                   ${rows.filter((r) => !r.winner).length}`);
console.log(`  mean surviving rivals        ${r1(mean(rows.map((r) => r.survivors)))}`);
console.log(`  …of which still to deal with ${r1(mean(rows.map((r) => r.outstanding)))}`);
console.log(`  mean allies / vassals at end ${r1(mean(rows.map((r) => r.allies)))} / ${r1(mean(rows.map((r) => r.vassals)))}`);
console.log(`  wars declared ON the subject ${r1(mean(rows.map((r) => r.warsOnSubject)))}`);
console.log(`  subject's own aggressions    ${r1(mean(rows.map((r) => r.subjectAggressions)))}`);
console.log(`  coalitions raised against it ${rows.reduce((n, r) => n + r.coalitionsFormed, 0)}` +
  ` across ${rows.length} games (${rows.filter((r) => r.coalitionsFormed).length} games affected)` +
  `  — on grounds: ${[...new Set(rows.flatMap((r) => r.coalitionGrounds.split(",")).filter(Boolean))].join(", ") || "(none recorded)"}`);
console.log(`\n  mean end scrap / Sway        ${r1(mean(rows.map((r) => r.scrap)))} / ${r1(mean(rows.map((r) => r.sway)))}`);
console.log(`  mean Sway income at end      ${r1(mean(rows.map((r) => r.swayIncome)))} (cap ${CONFIG.sway.cap})`);
console.log(`  mean Honor / Menace          ${r1(mean(rows.map((r) => r.honor)))} / ${r1(mean(rows.map((r) => r.menace)))}`);
console.log(`  courtships opened / lapsed   ${r1(mean(rows.map((r) => r.courtshipsOpened)))} / ${r1(mean(rows.map((r) => r.courtshipsLapsed)))}`);
console.log(`  gifts / ops                  ${r1(mean(rows.map((r) => r.giftsSent)))} / ${r1(mean(rows.map((r) => r.opsRun)))}`);
console.log(`  factions eliminated / game   ${r1(mean(rows.map((r) => r.eliminations)))}` +
  `  (mean round ${r1(mean(rows.filter((r) => r.deathRound != null).map((r) => r.deathRound)))})`);
console.log(`  rounds Sway hit the ceiling  ${r1(mean(rows.map((r) => r.swayCapped)))}`);
if (policyName === "spender") {
  console.log(`\n  times the pool SAID NO        ${REFUSALS.wanted} total` +
    ` — courtship ${REFUSALS.court}, gift ${REFUSALS.gift}, op ${REFUSALS.op}`);
  console.log("  (a budget nothing is ever refused by is not a budget)");
}
console.log(`  mean Locations held          ${r1(mean(rows.map((r) => r.locations)))}`);
if (policyName === "crippled") {
  console.log(`\n  --- after being reduced to one city at round ${CRIPPLE_ROUND} ---`);
  console.log(`  eliminated outright          ${rows.filter((r) => r.eliminatedSubject).length} of ${rows.length}`);
  console.log(`  games where it took ground back ${rows.filter((r) => r.regained > 0).length} of ${rows.length}` +
    `  (mean ${r1(mean(rows.map((r) => r.regained)))} Locations)`);
  console.log(`  mean Locations at the end    ${r1(mean(rows.map((r) => r.locations)))}`);
  console.log(`  chips that went dormant      ${r1(mean(rows.map((r) => r.dormantChips)))}`);
  console.log(`  mean rounds survived         ${r1(mean(rows.map((r) => r.survivedTo)))}`);
}
console.log();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
}

// --- the regression gate ---------------------------------------------
//
// `--assert` turns the probe into something CI can run. Only the pacifist run
// asserts, and it asserts the two things this probe was built to find out:
//
//   1. The diplomacy face CLOSES. A faction that never attacks anybody must be
//      able to win. Three features ship dark on the strength of a claim that
//      it could not, and that claim turned out to be false.
//   2. A SPOTLESS faction is not coalitioned. This is the Attila failure, and
//      the static audit block that was supposed to guard it could not see this
//      case: it tests one frozen board, and the failure only appears over a
//      full game, as `powerLead` inflates against a shrinking field. Measured
//      before the fix: 10 coalitions raised across 15 games, every early one
//      on `fear`, against a faction with Menace 0.
if (process.argv.includes("--assert") && policyName === "crippled") {
  // THE ANTI-RATCHET CLAIM. The design has refused this shape once already —
  // the first draft of the supply rule refused off-supply purchases and was
  // reverted for being "an elimination ratchet dressed as a supply rule". Four
  // smaller costs landing at once rebuilt one by accident: a faction cut down
  // to one city at round 20 took ground back in 0 of 15 games, against 4 of 15
  // with the new costs switched off.
  //
  // The claim is NOT that a beaten faction usually recovers — it usually
  // should not, and 13 of 15 still die. It is that the door is not one-way.
  let bad = 0;
  const recovered = rows.filter((r) => r.regained > 0).length;
  const claim = (label, ok, detail) => {
    console.log(`\n${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        ${detail}`}`);
    if (!ok) bad += 1;
  };
  console.log();
  claim("a faction cut down to one city can still take ground back",
    recovered >= 2,
    `${recovered} of ${rows.length} games saw any recovery — the costs have become a one-way door`);
  console.log(`\n${bad ? `${bad} FAILED` : "all claims hold"}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--assert")) {
  if (policyName !== "pacifist") {
    console.error("--assert only means anything for the pacifist or crippled policies");
    process.exit(2);
  }
  const raised = rows.reduce((n, r) => n + r.coalitionsFormed, 0);
  // THE ASSERTION IS ABOUT THE MECHANISM, NOT A COUNT, and the first draft got
  // that wrong: it asserted `raised <= 2`, a bar fitted to a single post-fix
  // observation, and an unrelated change to the AI's build policy moved the
  // board enough to fail it at 3. Counting the wrong thing produces exactly
  // that — a test that fails for reasons it was not written about.
  //
  // What the failure actually looked like: 10 coalitions across 15 games,
  // SEVEN of them on `fear` grounds between rounds 12 and 21, against a
  // faction with Menace 0 — because `powerLead` inflated against a shrinking
  // field. What correct behaviour looks like: the occasional `grievance` (a
  // pacifist that settles an empty AFFILIATED Location has genuinely taken
  // somebody's homeland, and the occupation rule says so) and the occasional
  // `fear` on a lead it really has earned.
  //
  // So the claim is: EARLY FEAR IS THE TELL. A rising on fear alone, inside
  // the first 25 rounds, against a faction that has attacked nobody, is the
  // Attila failure and nothing else.
  const earlyFear = rows.flatMap((r) => r.coalitionGrounds.split(",").filter(Boolean))
    .map((g) => ({ kind: g.split("@")[0], round: Number(g.split("@r")[1]) }))
    .filter((g) => g.kind === "fear" && g.round <= 25);
  const aggressions = rows.reduce((n, r) => n + r.subjectAggressions, 0);
  let bad = 0;
  const claim = (label, ok, detail) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        ${detail}`}`);
    if (!ok) bad += 1;
  };
  console.log();
  claim("the pacifist really never attacked anybody", aggressions === 0,
    `${aggressions} aggressions — the policy is not testing what it says`);
  claim("a faction that never attacks can still win", wins > 0,
    "0 wins — the diplomacy face does not close, which would justify the dark switches");
  claim("a spotless faction is not ganged up on out of FEAR, early",
    earlyFear.length <= 1,
    `${earlyFear.length} early-fear risings against a Menace-0 faction` +
    ` (was 7 of 10 before powerLead stopped measuring attrition)`);
  claim("…and is not ganged up on routinely at all", raised <= rows.length / 3,
    `${raised} coalitions raised across ${rows.length} games`);
  console.log(`\n${bad ? `${bad} FAILED` : "all claims hold"}`);
  process.exit(bad ? 1 : 0);
}
