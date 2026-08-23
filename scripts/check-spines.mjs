// Phase 3 of the 2026-08-23 briefs — posture, interests, the courtship ladder
// and Sway, checked against a live engine.
//
//   node scripts/check-spines.mjs
//
// These four are one design and the implementation plan says so: the ladder is
// what Sway is for, Sway is what stops the ladder being free and instant, and
// §6.4's payment rules are what stop the two of them deadlocking into "no
// pacts are possible at all". So they are asserted together.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { CONFIG } from "../src/game/config.js";
import { takeAITurn } from "../src/game/ai.js";
import { adaptState } from "../src/prototype/engineAdapter.js";
import * as D from "../src/game/diplomacy.js";
import { setStanding } from "../src/game/standing.js";
import { interestsOf, interestToward } from "../src/game/interests.js";
import { swayIncome, swayOf } from "../src/game/sway.js";
import { recomputeInfluence } from "../src/game/influence.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + (d ?? "")}`); };

const P = CONFIG.diplomacy.posture;
const SW = CONFIG.sway;

const mk = (opts = {}) => createGame({
  seed: 424242,
  factionIds: ["versari", "goldgrass", "lakers", "plainers"],
  humanFactionId: "versari",
  minors: [],
  mapSize: "medium",
  ...opts,
});

// --- 1. Interests are derived, ranked, and about something ----------------
{
  const g = mk();
  startTurn(g);
  // Park somebody's army on Goldgrass's ground: that is a `quiet` interest,
  // and it is the passive kind that must never pay Standing.
  D.ensureDiplomacy(g);
  const theirs = Object.values(g.locations).find((l) => l.controller === "goldgrass");
  for (const u of Object.values(g.units)) if (u.owner === "versari") u.node = theirs.hexId;
  const wants = interestsOf(g, "goldgrass");
  check("1. a faction has ranked, structured wants", wants.length > 0,
    "interestsOf returned nothing on a board with an army parked in somebody's capital");
  check("2. …ordered strongest first",
    wants.every((w, i) => i === 0 || wants[i - 1].weight >= w.weight));
  check("3. …and each names its subject", wants.every((w) => w.subject != null));
  const quiet = wants.find((w) => w.kind === "quiet");
  check("4. an army in their fields is a `quiet` want", !!quiet,
    wants.map((w) => w.kind).join(","));
  check("5. …and it is NOT costly — a condition you satisfy by doing nothing\n" +
        "      must pay no Standing, or the ladder becomes a faucet",
    quiet && quiet.costly === false);
  // A homeland somebody else holds is the costly kind.
  const omara = Object.values(g.locations).find((l) => l.locationId === "omara");
  if (omara) {
    omara.controller = "lakers"; omara.sections = omara.sections.map(() => "lakers");
    const reclaim = interestsOf(g, "goldgrass").find((w) => w.kind === "reclaim");
    check("6. a homeland in somebody else's hands is a `reclaim` want", !!reclaim);
    check("7. …and that one IS costly", reclaim && reclaim.costly === true);
  }
}

// --- 2. Posture is said before it is acted on -----------------------------
{
  const g = mk();
  startTurn(g);
  D.ensureDiplomacy(g);
  setStanding(g, "goldgrass", "versari", 3, "test");
  setStanding(g, "versari", "goldgrass", 3, "test");
  D.performDiplomacy(g, "goldgrass", "court", { faction: "versari" });
  const p0 = D.postureOf(g, "goldgrass", "versari");
  check("8. opening a courtship sets the posture", p0.kind === "Courting");
  check("9. …but it has not been SAID yet", p0.statedRound == null);
  check("10. …so it cannot be acted on", !D.postureStated(g, "goldgrass", "versari"));

  D.speakPosture(g, "goldgrass");
  check("11. speaking puts it on the record",
    D.postureOf(g, "goldgrass", "versari").statedRound === g.round);
  check("12. …and the board hears it",
    g.log.some((e) => e.name === "posture_stated" && e.payload.subject === "versari"));
  if (P.statedBeforeActedRounds > 0) {
    check("13. …and it is still too fresh to act on this round",
      !D.postureStated(g, "goldgrass", "versari"));
    g.round += P.statedBeforeActedRounds;
    check("14. …but not the round after", D.postureStated(g, "goldgrass", "versari"));
  }
  // The ordering fix itself: speakPosture runs at the TOP of the AI turn.
  const g2 = mk();
  startTurn(g2);
  D.ensureDiplomacy(g2);
  setStanding(g2, "goldgrass", "versari", 4, "test");
  D.performDiplomacy(g2, "goldgrass", "court", { faction: "versari" });
  g2.activeIndex = g2.turnOrder.indexOf("goldgrass");
  const before = g2.log.length;
  takeAITurn(g2);
  const slice = g2.log.slice(before);
  const spokeAt = slice.findIndex((e) => e.name === "posture_stated");
  const actedAt = slice.findIndex((e) => ["contest_declared", "war_declared", "unit_moved"].includes(e.name));
  check("15. the AI says where it stands BEFORE it acts",
    spokeAt >= 0 && (actedAt < 0 || spokeAt < actedAt),
    `spoke at ${spokeAt}, acted at ${actedAt} — this ordering is the whole telegraph argument`);
}

// --- 3. A condition is a sentence with a subject, checked against the board -
{
  const g = mk();
  startTurn(g);
  D.ensureDiplomacy(g);
  const theirs = Object.values(g.locations).find((l) => l.controller === "goldgrass");
  for (const u of Object.values(g.units)) if (u.owner === "versari") u.node = theirs.hexId;
  setStanding(g, "goldgrass", "versari", 3, "test");
  D.performDiplomacy(g, "goldgrass", "court", { faction: "versari" });
  const p = D.postureOf(g, "goldgrass", "versari");
  check("16. a courtship carries a condition", !!p.condition, JSON.stringify(p));
  const text = D.conditionText(g, "goldgrass", "versari", p.condition);
  check("17. …that renders as a sentence a player can check", typeof text === "string" && text.length > 8, text);
  console.log(`        · Goldgrass, Courting Versari: “${text}”`);
}

// --- 4. The ladder: costly pays, passive does not -------------------------
//
// §7.3's rule, and it is the one that keeps the ladder from being a faucet: a
// condition the other party satisfies BY DOING NOTHING must pay no Standing.
// "Stay off my lawn" is free to obey and would otherwise mint two Standing
// every round for changing nothing.
{
  // PASSIVE. An army in their fields — they satisfy it by leaving, which
  // costs them nothing they hold.
  const g = mk();
  startTurn(g);
  D.ensureDiplomacy(g);
  const mine = Object.values(g.locations).find((l) => l.controller === "versari");
  for (const u of Object.values(g.units)) if (u.owner === "goldgrass") u.node = mine.hexId;
  setStanding(g, "versari", "goldgrass", 2, "test");
  D.performDiplomacy(g, "versari", "court", { faction: "goldgrass" });
  const cond = D.postureOf(g, "versari", "goldgrass").condition;
  check("18. an army in your fields makes a PASSIVE condition",
    cond?.kind === "quiet" && cond.costly === false, JSON.stringify(cond));
  // …and now they leave, so it is held.
  for (const u of Object.values(g.units)) {
    if (u.owner === "goldgrass") {
      const home = Object.values(g.locations).find((l) => l.controller === "goldgrass");
      u.node = home.hexId;
    }
  }
  const s0 = D.getStanding(g, "versari", "goldgrass");
  g.round += 1; D.runDiplomacyRound(g);
  check("19. …and holding it pays NOTHING — the faucet stays shut",
    D.getStanding(g, "versari", "goldgrass") === s0,
    `${s0} -> ${D.getStanding(g, "versari", "goldgrass")}: a condition satisfied by doing nothing minted Standing`);

  // COSTLY. They owe you for something, and making amends is a real
  // concession — they give up the clean record, you give up the righteous war.
  const g2 = mk();
  startTurn(g2);
  D.ensureDiplomacy(g2);
  D.recordGrievance(g2, "versari", "goldgrass", "promise-broken");
  setStanding(g2, "versari", "goldgrass", 2, "test");
  D.performDiplomacy(g2, "versari", "court", { faction: "goldgrass" });
  const c2 = D.postureOf(g2, "versari", "goldgrass").condition;
  check("20. an unsettled grievance makes a COSTLY condition",
    c2?.kind === "redress" && c2.costly === true, JSON.stringify(c2));
  const t0 = D.getStanding(g2, "versari", "goldgrass");
  g2.round += 1; D.runDiplomacyRound(g2);
  check("21. …and while it is UNMET, it pays nothing either",
    D.getStanding(g2, "versari", "goldgrass") === t0,
    `${t0} -> ${D.getStanding(g2, "versari", "goldgrass")}`);
  // Settle it: the condition is now held, and a costly condition held pays.
  D.settleGrievances(g2, "versari", "goldgrass");
  const t1 = D.getStanding(g2, "versari", "goldgrass");
  g2.round += 1; D.runDiplomacyRound(g2);
  check("22. …but meeting it pays courtStandingGain",
    D.getStanding(g2, "versari", "goldgrass") - t1 === P.courtStandingGain,
    `${t1} -> ${D.getStanding(g2, "versari", "goldgrass")}, expected +${P.courtStandingGain}`);
  check("23. …and drift did not eat it — an actively worked pair is exempt",
    D.getStanding(g2, "versari", "goldgrass") > t1);
}

// --- 5. §7.2 — one bar means BOTH roads -----------------------------------
{
  const g = mk();
  startTurn(g);
  D.ensureDiplomacy(g);
  setStanding(g, "goldgrass", "versari", 12, "test");
  setStanding(g, "versari", "goldgrass", 12, "test");
  g.players.versari.menace = 0; g.players.versari.honor = 8;
  check("24. Standing far past the bar is NOT enough on its own",
    !D.aiAcceptsPact(g, "goldgrass", "versari"),
    "an alliance still arrives out of a clear sky");
  D.performDiplomacy(g, "versari", "court", { faction: "goldgrass" });
  check("25. …and a courtship is not instant either",
    !D.aiAcceptsPact(g, "goldgrass", "versari"));
  g.round += P.courtRounds;
  check("26. …but after courtRounds of somebody working it, yes",
    D.aiAcceptsPact(g, "goldgrass", "versari"));
  // §6.4 rule 2: EITHER side's Courting unlocks it. This is the row that keeps
  // the diplomacy face open at all — if only the AI's counts and the AI cannot
  // afford to court, the human can never form a pact by any route.
  const g2 = mk();
  startTurn(g2);
  D.ensureDiplomacy(g2);
  setStanding(g2, "goldgrass", "versari", 12, "test");
  setStanding(g2, "versari", "goldgrass", 12, "test");
  g2.players.versari.menace = 0; g2.players.versari.honor = 8;
  D.performDiplomacy(g2, "goldgrass", "court", { faction: "versari" }); // THEY court
  g2.round += P.courtRounds;
  check("27. the OTHER side's courtship unlocks it too",
    D.aiAcceptsPact(g2, "goldgrass", "versari"),
    "only the asker's courtship counts — that is the asymmetric bar the brief rejects");
}

// --- 6. Sway: income, the wall, and the sink ------------------------------
{
  const g = mk({ minors: ["croppers"] });
  startTurn(g);
  D.runDiplomacyRound(g);
  const minor = swayIncome(g, "croppers").total;
  const major = Math.max(...["versari", "goldgrass", "lakers", "plainers"].map((p) => swayIncome(g, p).total));
  console.log(`        · minor income ${minor}, best major ${major}, ratio ${(major / minor).toFixed(2)}:1`);
  check("28. a minor is never locked out of politics", minor >= SW.floor);
  check("29. …and the leader's advantage is bounded, not a dividend",
    major / minor <= 3.5, `ratio ${(major / minor).toFixed(2)}:1 — the brief's target is <= 3:1`);

  // The wall, at the faucet.
  const poolBefore = swayOf(g, "versari");
  g.players.versari.resource = 999;
  g.round += 1; D.runDiplomacyRound(g);
  check("30. scrap buys no Sway at any rate",
    swayOf(g, "versari") <= Math.max(poolBefore + swayIncome(g, "versari").total, SW.cap));

  // …and at the sinks: a gift is bought with capacity, not cash.
  const g3 = mk();
  startTurn(g3); D.ensureDiplomacy(g3);
  g3.players.versari.resource = 999; g3.players.versari.sway = 0;
  const s0 = D.getStanding(g3, "goldgrass", "versari");
  const r = D.performDiplomacy(g3, "versari", "gift", { faction: "goldgrass", standing: 3 });
  check("31. a full purse and no capacity buys no goodwill", !r.ok);
  check("32. …and moved nothing", D.getStanding(g3, "goldgrass", "versari") === s0);
  g3.players.versari.sway = 3 * SW.perStanding;
  check("33. …capacity does", D.performDiplomacy(g3, "versari", "gift", { faction: "goldgrass", standing: 3 }).ok);
  check("34. …at the published rate", g3.players.versari.sway === 0);

  // Courtship is a RUNNING cost, and a faction that cannot pay drops it.
  const g4 = mk();
  startTurn(g4); D.ensureDiplomacy(g4);
  setStanding(g4, "versari", "goldgrass", 4, "test");
  D.performDiplomacy(g4, "versari", "court", { faction: "goldgrass" });
  g4.players.versari.sway = 0;
  // Strip the income to nothing except the floor, which is below courtUpkeep.
  for (const l of Object.values(g4.locations)) {
    if (l.controller === "versari") { l.controller = null; l.sections = l.sections.map(() => null); }
  }
  // The territorial term reads the ZoC map, so the field has to be told the
  // holdings are gone — otherwise the faction is bankrupt on paper and still
  // collecting rent on hexes it no longer owns.
  recomputeInfluence(g4);
  g4.round += 1; D.runDiplomacyRound(g4);
  check("35. a courtship nobody can pay for is called off",
    !D.isCourting(g4, "versari", "goldgrass"),
    "a bankrupt faction is still courting — the sink does not bite");
  check("36. …and the board is told why",
    g4.log.some((e) => e.name === "courtship_lapsed"));
}

// --- 7. It all reaches the screen -----------------------------------------
{
  const g = mk();
  startTurn(g);
  D.ensureDiplomacy(g);
  setStanding(g, "goldgrass", "versari", 4, "test");
  D.performDiplomacy(g, "goldgrass", "court", { faction: "versari" });
  D.speakPosture(g, "goldgrass");
  const view = adaptState(g).diplomacy;
  const row = view.factions.find((f) => f.id === "goldgrass");
  check("37. the drawer is told where they stand", row?.posture?.kind === "Courting");
  check("38. …and what they want, in words", typeof row.posture.condition === "string");
  check("39. …and whether that condition pays anything", row.posture.costly != null);
  check("40. the player's own capacity is itemised", view.sway && view.sway.parts.floor === SW.floor);
  check("41. …with the prices published", view.sway.costs.courtUpkeep === SW.courtUpkeep);
  check("42. …and a ledger of where it went", Array.isArray(view.sway.ledger));
  // Court has to be reachable, or a human cannot form a pact at all.
  const verbs = (row.verbs || []).map((v) => v.verb);
  check("43. Court is on the verb list", verbs.includes("court") || verbs.includes("end-courtship"),
    verbs.join(","));
}

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
