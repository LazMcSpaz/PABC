// Phase 1 of the 2026-08-23 briefs — the legibility pass, checked against a
// live engine and the real adapter.
//
//   node scripts/check-legibility.mjs
//
// Every case in the territory research where a system was called confusing,
// arbitrary or broken was a system players could not see. This script asserts
// that the six things the briefs say are invisible are now readable, and that
// none of them leaks a number the design says must be bought.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { CONFIG } from "../src/game/config.js";
import { adaptState } from "../src/prototype/engineAdapter.js";
import { recomputeInfluence } from "../src/game/influence.js";
import { recomputeVisibility } from "../src/game/visibility.js";
import { buildPost } from "../src/game/posts.js";
import { assignTechNode } from "../src/game/stats.js";
import { performAction } from "../src/game/actions.js";
import {
  performDiplomacy, adjustStanding, standingReceipts, trespassPreview, ensureDiplomacy,
  tableOffer, positionBlocker, declareWar, formPact, atWar as atWarEngine,
  covertDetection,
} from "../src/game/diplomacy.js";
import { emit } from "../src/game/events.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + (d ?? "")}`); };

// Assigning a wheel node needs the Ability Points a Tech Level grants. The
// tests here are about what the SCREEN shows once a node is held, not about
// earning it, so they buy the level outright.
function grantNode(g, pid, ...nodes) {
  const p = g.players[pid];
  p.techLevel = Math.max(p.techLevel || 1, nodes.length + 1);
  for (const n of nodes) {
    const r = assignTechNode(g, pid, n);
    if (!r.ok) throw new Error(`could not assign ${n}: ${r.reason}`);
  }
}

const mk = () => createGame({
  seed: 424242,
  factionIds: ["versari", "goldgrass", "lakers", "plainers"],
  humanFactionId: "versari",
  minors: [],
  mapSize: "medium",
});

// --- 1. Standing has a receipt at all --------------------------------------
{
  const g = mk();
  startTurn(g);
  // Economy §6.3 — a gift is bought with political capacity, not scrap.
  g.players.versari.sway = 100;
  performDiplomacy(g, "versari", "gift", { faction: "goldgrass", standing: 3 });
  const rows = standingReceipts(g, "goldgrass", "versari");
  check("1. a gift leaves a receipt on the pair it warmed", rows.length > 0,
    "standingLog is empty after a gift");
  check("2. …naming the cause", rows[0]?.cause === "gift", `cause was ${rows[0]?.cause}`);

  // Drift and seeding are arithmetic, not acts: a receipt that logged them
  // every round would bury the acts that actually happened.
  adjustStanding(g, "goldgrass", "versari", -1, "drift");
  check("3. …and drift is NOT recorded as a cause",
    standingReceipts(g, "goldgrass", "versari").every((r) => r.cause !== "drift"),
    "drift is polluting the receipt");

  // A pair already pinned at the ceiling must not accrue a receipt for an
  // adjustment that moved nothing.
  const { standingMax } = CONFIG.diplomacy;
  adjustStanding(g, "goldgrass", "versari", 99, "test-cap");
  const n = standingReceipts(g, "goldgrass", "versari").length;
  adjustStanding(g, "goldgrass", "versari", 5, "no-op-at-cap");
  check("4. an adjustment clamped to no movement leaves no receipt",
    standingReceipts(g, "goldgrass", "versari").length === n,
    "a no-op wrote a receipt");
}

// --- 2. Causes are ungated; magnitudes are espionage product ---------------
{
  const g = mk();
  startTurn(g);
  // Economy §6.3 — a gift is bought with political capacity, not scrap.
  g.players.versari.sway = 100;
  performDiplomacy(g, "versari", "gift", { faction: "goldgrass", standing: 3 });

  const plain = adaptState(g, "versari").diplomacy.factions.find((f) => f.id === "goldgrass");
  check("5. the drawer is handed the causes", (plain.standingReceipt || []).length > 0);
  check("6. …with the direction, which is free",
    plain.standingReceipt.every((r) => r.direction === "warmed" || r.direction === "cooled"));
  check("7. …and NO magnitude without the Spy Ring",
    plain.standingReceipt.every((r) => r.delta == null && r.value == null),
    "a signed delta leaked: the player can now derive the exact Standing");

  grantNode(g, "versari", "int-entry", "int-b1");
  const spied = adaptState(g, "versari").diplomacy.factions.find((f) => f.id === "goldgrass");
  const gotNumbers = (spied.standingReceipt || []).some((r) => r.delta != null);
  check("8. …which the Spy Ring buys", gotNumbers,
    `int-b1 held: ${(g.players.versari.techWheel || []).join(",")}`);
}

// --- 3. The one displayed threshold is the right one -----------------------
{
  const g = mk();
  startTurn(g);
  grantNode(g, "versari", "int-entry", "int-b1");
  const dom = adaptState(g, "versari").diplomacy.dominion;
  const row = dom.backing.find((b) => b.detail);
  check("9. the pact bar shown is pactStandingReq, not tiers.allied",
    row && row.detail.needStanding === CONFIG.diplomacy.pactStandingReq,
    `showed ${row?.detail?.needStanding}, engine asks ${CONFIG.diplomacy.pactStandingReq}`);
  check("10. …and those differ, so this was a real bug",
    CONFIG.diplomacy.pactStandingReq !== CONFIG.diplomacy.tiers.allied);
}

// --- 4. The influence field reaches the screen -----------------------------
{
  const g = mk();
  startTurn(g);
  recomputeInfluence(g);
  const view = adaptState(g, "versari");
  const withField = Object.values(view.hexes).filter((h) => (h.influence || 0) > 0);
  check("11. the viewer's own Influence is on the hexes", withField.length > 0,
    "no hex reports any influence");
  check("12. …and the dominance bar is published with it",
    view.influenceThreshold === CONFIG.influence.dominanceThreshold);
  const dominant = withField.filter((h) => h.influenceDominant);
  check("13. …and the dominant set is exactly those clearing it",
    dominant.every((h) => h.influence >= view.influenceThreshold) &&
    withField.filter((h) => h.influence >= view.influenceThreshold).length === dominant.length,
    `${dominant.length} marked dominant of ${withField.length} with any field`);
  // The cliff the overlay exists to show: dominance is a step function, so the
  // dominated count should be a small plateau rather than tracking the field
  // smoothly. Recorded rather than asserted — it is a property of the board.
  console.log(`        · ${withField.length} hexes reached, ${dominant.length} dominated` +
    ` (threshold ${view.influenceThreshold})`);
}

// --- 5. Territory is remembered, not only seen -----------------------------
{
  const g = mk();
  startTurn(g);
  recomputeInfluence(g);
  recomputeVisibility(g, "versari", { emitEvents: false });

  // Find somewhere the viewer can currently see, put a rival's border on it,
  // then take the viewer's sight away. Forcing the ZoC rather than waiting for
  // the board to produce a foreign border inside your opening sight radius is
  // deliberate: the claim under test is that the SNAPSHOT carries the border,
  // and the seed should not decide whether the test runs.
  const vis = g.visibility.versari;
  const seen = [...vis.visible].find((h) => !g.locations[h]);
  g.world.zoc[seen] = "lakers";

  // Leave. Every viewer unit and Location goes dark, which walks `seen` out of
  // the visible set through the real transition path — the one that snapshots.
  for (const u of Object.values(g.units)) if (u.owner === "versari") delete g.units[u.uid];
  for (const l of Object.values(g.locations)) {
    if (l.controller === "versari") { l.controller = null; l.sections = l.sections.map(() => null); }
  }
  recomputeVisibility(g, "versari", { emitEvents: false });

  const cell = adaptState(g).hexes[seen];
  check("14. explored-but-unseen ground still reports whose territory it was",
    cell?.fog === "explored" && cell?.zocOwner === "lakers",
    `fog ${cell?.fog}, zocOwner ${cell?.zocOwner} — the political map exists only where you are looking`);
  check("15. …flagged stale, so it is never read as live", cell?.zocStale === true,
    "a remembered border is being reported as a live one");
}

// --- 6. Influence pressure is visible on the city --------------------------
{
  const g = mk();
  g.humanFactionId = "goldgrass"; // the adapter serves exactly one viewer
  startTurn(g);
  const victim = Object.values(g.locations).find((l) => l.controller === "goldgrass");
  const rival = Object.values(g.locations).find((l) => l.controller && l.controller !== "goldgrass");
  recomputeInfluence(g);
  recomputeVisibility(g, "goldgrass", { emitEvents: false });
  // Out-project the holder on their own city's hex. `pressureSource` reads the
  // raw field, not the ZoC map — a Location anchors its own hex so its garrison
  // is never a trespasser at home, but a rival projecting more there is still
  // hollowing the place out.
  g.world.influence[rival.controller] = g.world.influence[rival.controller] || {};
  g.world.influence[rival.controller][victim.hexId] = 99;
  const cell = adaptState(g).hexes[victim.hexId];
  check("16. a squeezed city names who is squeezing it",
    cell?.control?.pressureBy === rival.controller,
    `pressureBy was ${cell?.control?.pressureBy}, expected ${rival.controller}`);
}

// --- 7. Listening posts are on the board -----------------------------------
{
  const g = mk();
  startTurn(g);
  const hex = Object.values(g.board.hexes).find((h) => h.type !== "location");
  buildPost(g, "versari", hex.id);
  recomputeVisibility(g, "versari", { emitEvents: false });
  const mine = adaptState(g).hexes[hex.id];
  check("17. you can see your own listening post", !!mine?.post && mine.post.mine === true,
    "a structure you paid for and pay upkeep on had no board presence at all");

  // Concealment, not fog, decides who else is told. The adapter serves one
  // viewer, so the rival's read means switching the viewer.
  g.humanFactionId = "lakers";
  recomputeVisibility(g, "lakers", { emitEvents: false });
  const theirs = adaptState(g).hexes[hex.id];
  check("18. …and a rival does not, until it is revealed", !theirs?.post,
    "a concealed post is leaking to a faction it was never revealed to");
}

// --- 8. The trespass cost is readable BEFORE the move ----------------------
{
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  recomputeInfluence(g);
  const zoc = g.world.zoc;
  const foreign = Object.keys(zoc).find((h) => zoc[h] && zoc[h] !== "versari" && !g.locations[h]);
  const unit = Object.values(g.units).find((u) => u.owner === "versari");
  if (!foreign) {
    console.log("        · no foreign ZoC hex on this board; skipping");
  } else {
    unit.node = foreign;
    // Make sure they can actually see the intruder — concealment is part of
    // the real rule and the preview must honour it.
    const owner = zoc[foreign];
    recomputeVisibility(g, owner, { emitEvents: false });
    g.visibility[owner].visible.add(foreign);
    const p = trespassPreview(g, unit, foreign);
    check("19. entering a rival's ground previews what it costs", !!p,
      "trespassPreview returned null on foreign ZoC the owner can see");
    if (p) {
      check("20. …starting at the ladder's first rung, which is a warning",
        p.streak === 1 && (p.distrustful || p.standingHit === CONFIG.diplomacy.trespass.escalation[0]),
        JSON.stringify(p));
      check("21. …and it is a PREVIEW: nothing was written or charged",
        !g.diplomacy.trespassRecord?.[`versari|${owner}`],
        "the preview wrote the citation record");
    }
  }
  // Your own ground is free, and the preview says so by returning null.
  const home = Object.keys(zoc).find((h) => zoc[h] === "versari");
  if (home) {
    unit.node = home;
    check("22. …and standing on your own ground previews nothing",
      trespassPreview(g, unit, home) === null);
  }
}

// --- 9. The Saboteurs verb is reachable by a human -------------------------
{
  const g = mk();
  startTurn(g);
  const target = Object.values(g.locations).find((l) => l.controller && l.controller !== "versari");
  const before = performAction(g, "sabotage", { at: target.hexId });
  check("23. sabotage is gated on Intelligence B2", !before.ok && /int|B2|Saboteurs/i.test(before.reason || ""),
    `refused with: ${before.reason}`);
  grantNode(g, "versari", "int-entry", "int-b1", "int-b2");
  const loy0 = target.loyalty;
  const after = performAction(g, "sabotage", { at: target.hexId });
  check("24. …and with it on the wheel, a human can run it", after.ok, after.reason);
  check("25. …and it does what it says", target.loyalty === Math.max(0, loy0 - 1),
    `loyalty ${loy0} -> ${target.loyalty}`);
  const twice = performAction(g, "sabotage", { at: target.hexId });
  check("26. …once per round", !twice.ok, "sabotage ran twice in one round");
}

// --- 10. §13 — the haggle and the position are both on the SCREEN ----------
//
// Both of these are engine features whose entire point is that the player can
// reach them. A counter the drawer cannot table, or a position the drawer
// cannot say, is a function nobody will ever call — which is exactly what the
// influence field was before phase 1.
{
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  g.players.versari.resource = 60;
  const them = "lakers";
  tableOffer(g, them, "versari", {
    proposer: them, recipient: "versari",
    give: [{ promise: { kind: "nonAggression", rounds: 5 } }],
    get: [{ resource: { resource: "scrap", amount: 12 } }],
  }, { kind: "deal" });
  const a = adaptState(g, "versari").diplomacy;
  const o = (a.offers || [])[0];
  check("27. an offer on the table reaches the drawer", !!o, "no offer adapted");
  if (o) {
    // Signed FROM THE PLAYER'S SEAT — the same convention counterTheOffer
    // reads, so the stepper's number and the engine's parameter are one number.
    check("28. …carrying the scrap as a signed number the player can move",
      o.netScrap === 12, `netScrap was ${o.netScrap}`);
    check("29. …and it says the haggle is available", o.canCounter === true);
    const purse = g.players.versari.resource;
    const res = performDiplomacy(g, "versari", "counter-offer", { offerId: o.id, scrap: 5 });
    check("30. …and the verb the button calls actually runs", res.ok, res.reason);
    check("31. …and it never charges more than the player asked to pay",
      g.players.versari.resource >= purse - 5,
      `purse ${purse} -> ${g.players.versari.resource}`);
  }
  check("32. the purse the stepper stops at is on the adapted state",
    typeof a.scrap === "number");
}
{
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  const a0 = adaptState(g, "versari").diplomacy;
  const P = a0.positions;
  check("33. what you stand for reaches the drawer", !!P, "positions block missing");
  if (P) {
    check("34. …with something to say and room to say it",
      P.room > 0 && P.options.some((o) => o.available));
    check("35. …and it prices being caught before the button is pressed",
      P.breakHonorLoss > 0 && P.breakMenace > 0);
    // The offered list must be exactly what the engine will take. A UI that
    // re-derives the rules to grey out a button is a second copy of them.
    // Asked through the engine's own reader, not a re-derivation and not a
    // clone — `state` holds the seeded RNG closure and is not cloneable.
    const bad = P.options.filter((o) => o.available
      && positionBlocker(g, "versari", o.kind, o.target));
    check("36. …and every position it offers is one the engine accepts",
      bad.length === 0, `offered but refused: ${bad.map((o) => o.kind).join(", ")}`);
    const shown = P.options.find((o) => o.available);
    performDiplomacy(g, "versari", "declare-position", { kind: shown.kind, target: shown.target });
    const a1 = adaptState(g, "versari").diplomacy;
    check("37. …and once said, it reads back in words", 
      a1.positions.held.length === 1 && /\w/.test(a1.positions.held[0].text));
    check("38. …and it cannot be dropped the same round it was said",
      a1.positions.held[0].canWithdraw === false);
  }
}

// --- 11. §12.3 — the intrigue branch is reachable, and reads its own risk ---
//
// A lie whose chance of being seen through the player cannot read before
// pressing is a coin flip, not a decision. This is the one number on the card
// that has to be there.
{
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  g.players.versari.sway = 500;
  const a = adaptState(g, "versari").diplomacy;
  const I = a.intrigue;
  check("39. the intrigue branch reaches the drawer", !!I, "intrigue block missing");
  if (I) {
    check("40. …with its price on it", I.cost === CONFIG.sway.opCost && I.affordable);
    check("41. …and the chance of being seen through, before the press",
      I.caughtPercent > 0 && I.caughtPercent < 100, `caughtPercent ${I.caughtPercent}`);
    check("42. …and what being caught costs",
      I.caughtHonorLoss > 0 && I.caughtMenace > 0 && I.lastsRounds > 0);
    check("43. …and a target list that says why Expose is unavailable",
      I.targets.length > 0 && I.targets.every((t) => t.canExpose === false));
    // Give it something true to publish, and the offer must appear.
    const them = I.targets[0].id;
    emit(g, "attack_unwitnessed", { attacker: them, victim: "goldgrass", hex: null });
    const a2 = adaptState(g, "versari").diplomacy;
    const t2 = a2.intrigue.targets.find((t) => t.id === them);
    // The strike really happened — the event is in the log — and it is STILL
    // invisible, because §12.3 now asks how you would have heard about it.
    check("44. …and a real strike stays invisible without ears",
      g.log.some((e) => e.name === "attack_unwitnessed" && e.payload.attacker === them)
      && t2.canExpose === false);
    // §12.3 — Expose is gated on the Intelligence branch, so the card has to
    // say whether you have ears at all. Without that, a player with no
    // apparatus sees a row of greyed names and no reason why.
    check("45. …and the card says whether you can hear anything at all",
      a2.intrigue.apparatus === null && /no way of learning/.test(a2.intrigue.apparatusText),
      `apparatus ${a2.intrigue.apparatus}`);
    check("46. …so with no apparatus, nothing is exposable",
      t2.canExpose === false);
    g.players.versari.techWheel = ["int-entry", "int-b1"];
    const a3 = adaptState(g, "versari").diplomacy;
    const t3 = a3.intrigue.targets.find((t) => t.id === them);
    check("47. …and a Spy Ring both opens it and says it was the Spy Ring",
      a3.intrigue.apparatus === "spy-ring" && t3.canExpose && t3.exposeVia === "spy-ring");
    const res = performDiplomacy(g, "versari", "expose", { faction: them });
    check("48. …and the verb the button calls actually runs", res.ok, res.reason);
    check("49. …and it charges the Sway the card quoted",
      g.players.versari.sway === 500 - CONFIG.sway.opCost);
  }
}

// --- 12. Economy §9 — HIRE reaches the deal composer -----------------------
//
// "Fight X with me" has been a real deal item since §6.10 — priced by
// `wantsDead`, enacted by declaring the war on acceptance, refused when the
// target is their ally — and the composer could not say it, so paying somebody
// to join your war was engine-only.
{
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  declareWar(g, "versari", "lakers", "test");
  const a = adaptState(g, "versari").diplomacy;
  const gg = a.factions.find((x) => x.id === "goldgrass");
  check("50. a third party you could hire against your enemy is offered",
    (gg?.couldHireAgainst || []).some((t) => t.id === "lakers"),
    JSON.stringify(gg?.couldHireAgainst));
  check("51. …and the mirror — a war of theirs you could join — is offered too", (() => {
    const g2 = mk(); startTurn(g2); ensureDiplomacy(g2);
    declareWar(g2, "goldgrass", "plainers", "test");
    const a2 = adaptState(g2, "versari").diplomacy;
    const f2 = a2.factions.find((x) => x.id === "goldgrass");
    return (f2?.couldFightFor || []).some((t) => t.id === "plainers");
  })());
  // …and it is never offered against their own ally, because the engine will
  // refuse it — an offer the drawer makes that the engine rejects is worse
  // than no offer at all.
  const g3 = mk(); startTurn(g3); ensureDiplomacy(g3);
  declareWar(g3, "versari", "lakers", "test");
  formPact(g3, "goldgrass", "lakers", "test");
  const a3 = adaptState(g3, "versari").diplomacy;
  const gg3 = a3.factions.find((x) => x.id === "goldgrass");
  check("52. …and never against somebody they are allied to",
    !(gg3?.couldHireAgainst || []).some((t) => t.id === "lakers"));
  // The term the composer emits is the one the engine enacts.
  const res = performDiplomacy(g, "versari", "propose-deal", {
    faction: "goldgrass",
    give: [{ resource: { resource: "scrap", amount: 40 } }],
    get: [{ promise: { kind: "joinWar", target: "lakers" } }],
  });
  check("53. …and a hire the engine accepts opens the war it names",
    !res.accepted || atWarEngine(g, "goldgrass", "lakers"),
    `accepted ${res.accepted}, at war ${atWarEngine(g, "goldgrass", "lakers")}`);
}

// --- 13. §12.3/§17.5 — the covert acts read their own risk, both ways -------
//
// Sabotage was the only covert act with no risk at all, and Spy Ring — a node
// whose whole identity is counter-intelligence — did nothing to help its
// holder catch somebody lying about them. Both now go through one roll, and
// both halves have to be READABLE or the player is flipping a coin.
{
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  const bare = covertDetection(g, "versari", "lakers");
  g.players.lakers.techWheel = ["int-entry", "int-b1"];
  check("54. a victim's Spy Ring raises the chance a lie about them is seen through",
    covertDetection(g, "versari", "lakers") > bare,
    `${bare} -> ${covertDetection(g, "versari", "lakers")}`);

  // …and the Saboteurs button quotes what being traced costs, before the press.
  g.players.versari.techWheel = ["int-entry", "int-b1", "int-b2"];
  const target = Object.values(g.locations).find((l) => l.controller && l.controller !== "versari");
  const before = g.players.versari.honor;
  const res = performAction(g, "sabotage", { at: target.hexId });
  check("55. sabotage still runs", res.ok, res.reason);
  check("56. …and reports whether it was traced", typeof res.caught === "boolean");
  check("57. …and being traced is what costs Honor, not the sabotage itself",
    res.caught ? g.players.versari.honor < before : g.players.versari.honor === before);
}
{
  // §17.5 B1 — the political reveal reaches the drawer.
  const g = mk();
  startTurn(g);
  ensureDiplomacy(g);
  const blind = adaptState(g, "versari").diplomacy.factions.find((f) => f.id === "lakers");
  check("58. without a Spy Ring the political intel is withheld", blind.theirIntel === null);
  g.players.versari.techWheel = ["int-entry", "int-b1"];
  const seen = adaptState(g, "versari").diplomacy.factions.find((f) => f.id === "lakers");
  check("59. with one, what they are after reaches the drawer",
    !!seen.theirIntel && Array.isArray(seen.theirIntel.interests));
  check("60. …with their names resolved, not raw ids",
    seen.theirIntel.interests.every((w) => !w.subject || !!w.subjectName));
  check("61. …and what they can afford",
    typeof seen.theirIntel.sway.pool === "number");
}

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);




process.exit(fail ? 1 : 0);
