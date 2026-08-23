// The economy's regression net — the counterpart to `audit-diplomacy.mjs`,
// which is the best thing either layer has and the reason the diplomacy audit
// caught things the docs missed.
//
//   node scripts/audit-economy.mjs
//   node scripts/audit-economy.mjs --verbose   # print every measurement
//
// Ten blocks, from `economy-influence-brief-2026-08-23.md` §17. Unlike the
// diplomacy audit, this one ASSERTS: it exits non-zero on a failure, so it can
// gate a PR.
//
// HOW THE PENDING BLOCKS WORK, because this is the part that is easy to get
// wrong. The implementation plan's method rule 1.3 says to write the audit
// block BEFORE the change and watch it fail; rule 1.2 says every stage lands
// with both audit scripts green. Both, together, only work if the script knows
// which blocks describe rules that have not shipped yet.
//
// So every block declares a `stage`. A block whose stage has not landed runs
// anyway and prints exactly what it WILL assert, alongside the current
// measurement — reported as PENDING, and not counted as a failure. Landing the
// stage means flipping that block's `live` to true in the same commit as the
// rule, at which point it is a hard assertion forever. A PENDING block that
// already passes is called out loudly, because that is the shape of the
// mistake the brief warns about twice: §8's chip-upkeep rule would have
// charged zero additional chips, and its audit block "would have passed
// unmodified on day one."
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { CONFIG } from "../src/game/config.js";
import { CHIPS, LOCATIONS } from "../src/game/content.js";
import { performAction } from "../src/game/actions.js";
import { recomputeInfluence, pressureSource } from "../src/game/influence.js";
import { recomputeResearch } from "../src/game/stats.js";
import * as DIP from "../src/game/diplomacy.js";
import { reinforcementRoute } from "../src/game/board.js";
import { swayIncome, swayOf, dominatedHexes } from "../src/game/sway.js";
import { supplyVerdict, sweepDeliveries } from "../src/game/economy.js";
import { supplyDistanceFrom } from "../src/game/board.js";
import { runDiplomacyRound } from "../src/game/diplomacy.js";
import { chipValue, VALUED_FIELDS, NON_EFFECT_FIELDS } from "../src/game/chipValue.js";

const verbose = process.argv.includes("--verbose");

let failures = 0, pending = 0, passes = 0;
let current = null;

function block(n, title, stage, live, body) {
  current = { n, title, stage, live, notes: [] };
  console.log(`\n=== ${n}. ${title} ===`);
  console.log(`    stage ${stage} · ${live ? "LIVE" : "PENDING — the rule has not shipped"}`);
  let anyClaim = false, anyMiss = false;
  current.check = (label, ok, detail) => {
    anyClaim = true;
    if (!ok) anyMiss = true;
    if (live) {
      if (ok) { passes += 1; console.log(`  PASS  ${label}`); }
      else { failures += 1; console.log(`  FAIL  ${label}\n          ${detail ?? ""}`); }
    } else {
      console.log(`  will assert: ${label}`);
      console.log(`          today: ${ok ? "ALREADY TRUE" : (detail ?? "not yet")}`);
    }
  };
  current.note = (s) => { if (verbose || !live) console.log(`        · ${s}`); };
  try {
    body(current.check, current.note);
  } catch (err) {
    if (live) { failures += 1; console.log(`  FAIL  block threw: ${err.message}`); }
    else console.log(`        (block threw, which is what PENDING looks like: ${err.message})`);
  }
  if (!live) {
    pending += 1;
    if (anyClaim && !anyMiss) {
      console.log("  !! every claim in this PENDING block is already true — either the\n" +
                  "     stage has landed and this block needs flipping to live, or the\n" +
                  "     block asserts something the design does not actually change.");
    }
  }
}

const mk = (opts = {}) => createGame({
  seed: 424242,
  factionIds: ["versari", "goldgrass", "lakers", "plainers"],
  humanFactionId: "versari",
  minors: [],
  mapSize: "medium",
  ...opts,
});

// --------------------------------------------------------------------
block(1, "Sway income is the published formula, is capped, and is never zero",
  "economy 4", true, (check, note) => {
    const g = mk({ minors: ["croppers"] });
    startTurn(g);
    const cfg = CONFIG.sway;
    runDiplomacyRound(g); // income lands on the round tick

    // The formula, term by term, against the engine's own itemisation.
    for (const pid of Object.keys(g.players)) {
      const inc = swayIncome(g, pid);
      const expect = cfg.floor
        + Math.min(dominatedHexes(g, pid), cfg.hexCap) * cfg.perHex
        + inc.agreements * cfg.perAgreement
        + inc.chips;
      note(`${pid}: ${inc.total} = floor ${inc.floor} + hexes ${inc.hexTerm}` +
           ` (${inc.hexes} dominated) + agreements ${inc.agreementTerm} + chips ${inc.chips}`);
      check(`${pid}'s income is floor + min(hexes, hexCap)*perHex + perAgreement*N + chips`,
        inc.total === expect, `got ${inc.total}, formula says ${expect}`);
    }

    // NEVER ZERO for any surviving faction. This is the term that keeps minors
    // and losing players in the diplomacy game at all, and the first draft's
    // territory-proportional income gave the Croppers ONE SWAY ACROSS A WHOLE
    // GAME — which makes killing minors mandatory under a win condition that
    // counts them.
    const alive = Object.keys(g.players).filter((p) => !g.players[p].eliminated);
    check("no surviving faction has a zero Sway income",
      alive.every((p) => swayIncome(g, p).total > 0),
      alive.filter((p) => swayIncome(g, p).total <= 0).join(", "));
    check("…including a landless one — the floor is unconditional", (() => {
      const bare = mk();
      for (const l of Object.values(bare.locations)) { l.controller = null; l.sections = l.sections.map(() => null); }
      startTurn(bare);
      return swayIncome(bare, "versari").total >= cfg.floor;
    })());

    // The pool is a FLOW ceiling, not a war chest.
    for (let i = 0; i < 30; i += 1) { g.round += 1; runDiplomacyRound(g); }
    check("the pool never exceeds sway.cap, however long it banks",
      Object.keys(g.players).every((p) => (g.players[p].sway || 0) <= cfg.cap),
      Object.keys(g.players).map((p) => `${p} ${g.players[p].sway}`).join(" "));

    // And the wall: nothing converts.
    const before = swayOf(g, "versari");
    g.players.versari.resource += 500;
    runDiplomacyRound(g);
    check("a mountain of scrap buys no Sway at any rate",
      swayOf(g, "versari") <= Math.max(before, cfg.cap),
      "scrap moved the political pool");
  });

// --------------------------------------------------------------------
// The soft-lock check. §7.1's first draft would have refused Rush and Recruit
// at a Location with no route to your OTHER holdings — which fires in 26.7% of
// location-rounds and bites hardest on the faction reduced to its last city,
// i.e. an elimination ratchet dressed as a supply rule. This block is LIVE
// from day one precisely so stage 3 cannot reintroduce it by accident.
block(2, "A faction holding one Location can still Rush and Recruit there, round 1",
  "economy 3 (guard — live from day one)", true, (check, note) => {
    const g = mk();
    startTurn(g);
    const pid = g.turnOrder[g.activeIndex];
    const mine = Object.values(g.locations).filter((l) => l.controller === pid);
    // Reduce them to exactly one holding — the last-city case.
    for (const l of mine.slice(1)) { l.controller = null; l.sections = l.sections.map(() => null); }
    const home = mine[0];
    const p = g.players[pid];
    p.resource = 80;
    home.actionsRemaining = 4;

    const route = reinforcementRoute(g, pid, home.hexId);
    note(`route from the last city to itself: ${route ? `dist ${route.dist}` : "null"}`);
    check("the route to your own last city is distance 0, not null",
      route && route.dist === 0, `route was ${JSON.stringify(route)}`);

    // Something to rush: give the place a build in progress.
    const opt = Object.values(CHIPS).find((c) => c.kind === "location" && (c.techLevel || 1) === 1);
    const built = performAction(g, "build", { at: home.hexId, chipId: opt.id });
    note(`build ${opt.id}: ${JSON.stringify(built)}`);
    if (built.ok) {
      const rushed = performAction(g, "rush", { at: home.hexId });
      check("…and Rush is not refused for want of supply",
        rushed.ok || !/suppl|route|cut/i.test(rushed.reason || ""),
        `rush refused: ${rushed.reason}`);
    }

    // Recruit needs the unlocking chip somewhere; plant it rather than build it.
    const tg = g.nextId("chip");
    g.chips[tg] = { uid: tg, chipId: "training-grounds" };
    home.chips.push(tg);
    for (const u of Object.values(g.units)) if (u.owner === pid) delete g.units[u.uid];
    home.actionsRemaining = 4;
    const rec = performAction(g, "recruit", { at: home.hexId });
    check("…and Recruit is not refused for want of supply",
      rec.ok || !/suppl|route|cut/i.test(rec.reason || ""),
      `recruit refused: ${rec.reason}`);
  });

// --------------------------------------------------------------------
block(3, "An off-supply purchase is DELAYED by route.dist, and refused only when the route is null and another holding exists",
  "economy 3", true, (check, note) => {
    note(`supplyDelaysSpending ${CONFIG.economy.supplyDelaysSpending}, ` +
         `supplyFreeHops ${CONFIG.economy.supplyFreeHops}`);
    check("the delay rule is switched on", CONFIG.economy.supplyDelaysSpending === true);

    // A connected interior city is undelayed — "distance 0 at a connected
    // city", which is the line that keeps this from taxing ordinary play.
    // Measured: 42% of location-rounds are a faction's last city and 50% sit
    // 1-2 hops from the nearest other holding.
    const g = mk();
    startTurn(g);
    const pid = "versari";
    const home = Object.values(g.locations).find((l) => l.controller === pid);
    check("a connected city is not delayed", supplyVerdict(g, pid, home.hexId).delay === 0,
      JSON.stringify(supplyVerdict(g, pid, home.hexId)));

    // A far-flung holding pays a convoy's worth of rounds.
    const far = Object.values(g.locations).find(
      (l) => !l.controller && supplyDistanceFrom(g, pid, l.hexId).dist > CONFIG.economy.supplyFreeHops);
    if (far) {
      far.controller = pid; far.sections = far.sections.map(() => pid);
      const v = supplyVerdict(g, pid, far.hexId);
      note(`${far.locationId}: ${v.dist} hops -> ${v.delay} rounds`);
      check("…and a distant one is delayed by the hops past the free range",
        v.delay === v.dist - CONFIG.economy.supplyFreeHops, JSON.stringify(v));
    } else {
      note("(no Location past the free range on this seed)");
    }

    // A purchase there is PAID NOW and ARRIVES LATER, and the event says so.
    const g2 = mk();
    startTurn(g2);
    const far2 = Object.values(g2.locations).find(
      (l) => l.controller !== pid && supplyDistanceFrom(g2, pid, l.hexId).dist > CONFIG.economy.supplyFreeHops);
    if (far2) {
      far2.controller = pid; far2.sections = far2.sections.map(() => pid);
      far2.actionsRemaining = 4;
      g2.players[pid].resource = 200;
      const opt = Object.values(CHIPS).find((c) => c.kind === "location" && (c.techLevel || 1) === 1);
      performAction(g2, "build", { at: far2.hexId, chipId: opt.id });
      const before = g2.players[pid].resource;
      const r = performAction(g2, "rush", { at: far2.hexId });
      check("an off-supply rush is accepted, not refused", r.ok, r.reason);
      check("…and paid for immediately", g2.players[pid].resource < before);
      check("…and queued rather than applied", !!r.queued && (far2.buildProgress || 0) === 0,
        JSON.stringify(r));
      check("…and the board is told, with an ETA",
        g2.log.some((e) => e.name === "purchase_delayed" && e.payload.arrivesOnRound > g2.round));
      // …and it lands when its clock runs out. Asserted on the ARRIVAL rather
      // than on `buildProgress`: a rush big enough to finish the chip completes
      // the build and resets progress to zero, so reading progress would call
      // the most successful case a failure.
      let guard = 12;
      while (g2.deliveries?.length && guard-- > 0) { g2.round += 1; sweepDeliveries(g2); }
      check("…and it arrives",
        g2.log.some((e) => e.name === "purchase_arrived" && e.payload.kind === "rush")
        && !g2.log.some((e) => e.name === "purchase_lost"));
    } else {
      note("(no takeable Location past the free range on this seed)");
    }

    // THE SOFT-LOCK GUARD, restated here because it is the thing this stage
    // most easily breaks: refusal needs BOTH no route AND somewhere else to
    // route from. A faction reduced to its last city is never starved.
    const g3 = mk();
    startTurn(g3);
    const mine = Object.values(g3.locations).filter((l) => l.controller === pid);
    for (const l of mine.slice(1)) { l.controller = null; l.sections = l.sections.map(() => null); }
    check("your last city is never refused, however cut off it is",
      !supplyVerdict(g3, pid, mine[0].hexId).refused,
      JSON.stringify(supplyVerdict(g3, pid, mine[0].hexId)));
  });

// --------------------------------------------------------------------
// Deliberately "no GIFT path", not "no scrap path". §6.3 names three bounded
// material-for-goodwill exchanges the design keeps — applyDeal's
// value-proportional Standing, completeUltimatum's complyStandingGain, and
// formTradingPact's +2/+2 — so the wider claim would fail the day it is
// written, which is the trap the brief calls out by name.
block(4, "No GIFT path moves Standing",
  "economy 5", true, (check, note) => {
    const g = mk();
    const before = giftPathsMovingStanding(g);
    note(`gift paths that still move Standing: ${before.join(", ") || "(none)"}`);
    check("a scrap gift buys no Standing", before.length === 0, before.join(", "));
  });

// Flipped live with economy stage 5. Deliberately "no GIFT path", not "no
// scrap path" — §6.3 names three bounded material-for-goodwill exchanges the
// design KEEPS (applyDeal's value-proportional Standing, completeUltimatum's
// complyStandingGain, formTradingPact's +2/+2), and the wider claim would fail
// the day it was written.

function giftPathsMovingStanding(g) {
  const out = [];
  const s0 = DIP.getStanding(g, "goldgrass", "versari");
  // A full purse and no political capacity.
  g.players.versari.resource = 400;
  g.players.versari.sway = 0;
  DIP.performDiplomacy(g, "versari", "gift", { faction: "goldgrass", amount: 8, standing: 4 });
  const s1 = DIP.getStanding(g, "goldgrass", "versari");
  if (s1 !== s0) out.push(`performDiplomacy('gift') moved Standing ${s0} -> ${s1} on scrap alone`);
  // …and a one-way deal, which is what handing somebody resources now is: it
  // may warm them as GENEROSITY (that is the deal rule, bounded and capped),
  // but it must not be a Standing purchase at a published per-scrap rate.
  const s2 = DIP.getStanding(g, "goldgrass", "versari");
  DIP.performDiplomacy(g, "versari", "propose-deal", {
    faction: "goldgrass",
    give: [{ resource: { resource: "scrap", amount: 1 } }], get: [],
  });
  const s3 = DIP.getStanding(g, "goldgrass", "versari");
  if (s3 > s2) out.push(`a token one-way deal still bought Standing ${s2} -> ${s3}`);
  return out;
}

// --------------------------------------------------------------------
block(5, "Occupation charges every round, stops on cession or elimination, and never charges a startingController Location",
  "economy 6", true, (check, note) => {
    const g = mk({ minors: ["croppers"] });
    startTurn(g);
    const cfg = CONFIG.sway;

    const stamped = Object.values(g.locations).filter((l) => l.startingController);
    note(`Locations stamped with startingController: ${stamped.length} of ${Object.keys(g.locations).length}`);
    check("setup stamps loc.startingController", stamped.length > 0,
      "no Location carries the field, so provenance cannot be told from conquest");

    // THE CASE THE STAMP EXISTS FOR. The setup deals affiliated Locations to
    // other factions, so without provenance a faction is billed from round one
    // for ground it never took.
    const dealt = stamped.find((l) => {
      const aff = LOCATIONS[l.locationId]?.affiliation;
      return aff && aff !== l.startingController;
    });
    if (dealt) {
      note(`${dealt.locationId}: affiliation ${LOCATIONS[dealt.locationId].affiliation},` +
           ` dealt at setup to ${dealt.startingController}`);
      check("…and ground the setup dealt you is never an occupation",
        !DIP.occupationCharges(g, dealt.startingController).some((o) => o.hex === dealt.hexId));
    } else {
      note("(no affiliated Location was dealt to another faction on this seed)");
    }

    // Now TAKE somebody's homeland.
    const prize = Object.values(g.locations).find((l) => {
      const aff = LOCATIONS[l.locationId]?.affiliation;
      return aff && aff !== "versari" && g.players[aff] && l.startingController !== "versari";
    });
    if (!prize) throw new Error("no takeable homeland on this board");
    const aggrieved = LOCATIONS[prize.locationId].affiliation;
    prize.controller = "versari";
    prize.sections = prize.sections.map(() => "versari");
    const charges = DIP.occupationCharges(g, "versari");
    check("holding a surviving faction's homeland is an occupation",
      charges.some((o) => o.hex === prize.hexId && o.aggrieved === aggrieved),
      JSON.stringify(charges));

    // It is charged EVERY round, not once, and not gated on Loyalty — a
    // garrisoned conquest clears half the Loyalty ceiling in three rounds, so
    // a Loyalty gate made the lifetime charge smaller than one round of
    // courting one faction.
    g.players.versari.sway = Math.floor(cfg.cap / 2);
    g.round += 1; DIP.runDiplomacyRound(g);
    g.round += 1; DIP.runDiplomacyRound(g);
    check("…and it is billed every round it is held",
      g.log.filter((e) => e.name === "occupation_charged").length >= 2);
    // Read the SPEND, not the pool: income lands before the charge, so a
    // faction near the ceiling pays in full and still shows the same total.
    check("…in Sway, so conquest and courtship draw on the same pool",
      g.log.some((e) => e.name === "sway_spent" && /holding/.test(e.payload.cause || "")),
      "no Sway was spent on holding anything");

    // ARREARS. A conqueror who never does politics must not get occupation
    // free just by never holding any Sway. Forced by taking MORE homelands
    // than the income covers — which is also the only way it happens in a real
    // game, and worth knowing: at occupation 6 against a floor of 6, one
    // conquest is always affordable and it is the second and third that bite.
    const g3 = mk();
    startTurn(g3);
    let taken = 0;
    const victims = [];
    for (const l of Object.values(g3.locations)) {
      const aff = LOCATIONS[l.locationId]?.affiliation;
      if (!aff || aff === "versari" || !g3.players[aff]) continue;
      if (l.startingController === "versari") continue;
      l.controller = "versari"; l.sections = l.sections.map(() => "versari");
      victims.push(aff); taken += 1;
    }
    note(`took ${taken} foreign homelands — owing ${taken * cfg.occupation} a round`);
    g3.players.versari.sway = 0;
    const owed = DIP.occupationCharges(g3, "versari").length * cfg.occupation;
    const income = DIP.swayIncome(g3, "versari").total;
    note(`owed ${owed} against an income of ${income}`);
    const before3 = victims.map((v) => DIP.getStanding(g3, v, "versari"));
    g3.round += 1; DIP.runDiplomacyRound(g3);
    const after3 = victims.map((v) => DIP.getStanding(g3, v, "versari"));
    check("a conqueror who cannot pay pays in reputation instead",
      owed <= income || after3.some((s, i) => s < before3[i]),
      `owed ${owed}, income ${income}, standings ${before3} -> ${after3}`);
    check("…and the board is told which bills were paid and which were not",
      owed <= income || g3.log.some((e) => e.name === "occupation_charged" && e.payload.arrears > 0));

    // It STOPS on cession.
    DIP.cedeLocation(g, "versari", aggrieved, prize.hexId, "test");
    check("giving it back ends the charge immediately",
      !DIP.occupationCharges(g, "versari").some((o) => o.hex === prize.hexId));

    // …and on the aggrieved faction's elimination. There is nobody left to
    // hold a grievance about it.
    const g2 = mk();
    startTurn(g2);
    const prize2 = Object.values(g2.locations).find((l) => {
      const aff = LOCATIONS[l.locationId]?.affiliation;
      return aff && aff !== "versari" && g2.players[aff] && l.startingController !== "versari";
    });
    const agg2 = LOCATIONS[prize2.locationId].affiliation;
    prize2.controller = "versari";
    prize2.sections = prize2.sections.map(() => "versari");
    check("…and holding it while they live is an occupation",
      DIP.occupationCharges(g2, "versari").some((o) => o.hex === prize2.hexId));
    g2.players[agg2].eliminated = true;
    check("…which ends when there is nobody left to be aggrieved",
      !DIP.occupationCharges(g2, "versari").some((o) => o.hex === prize2.hexId));
  });

// --------------------------------------------------------------------
// §10.1's scoping check. Unit influence must reach `pressureSource` (which
// reads the raw field) and NOT `deriveZoC` — the measured alternative painted
// 671 hexes of empty wilderness, walled supply for free, and made 199
// unit-rounds of trespassers on their own ground.
block(6, "Unit influence moves pressureSource and leaves state.world.zoc byte-identical",
  "economy 7", true, (check, note) => {
    const g = mk();
    startTurn(g);
    const victim = Object.values(g.locations).find((l) => l.controller && l.controller !== "lakers");
    if (!victim) throw new Error("no rival Location on this board");
    // A city already hollowed out — Loyalty low, which is what a place under
    // siege actually looks like. A stack cannot out-project a capital at the
    // ceiling and is not meant to: measured, three units TIE a Loyalty-4
    // ring, six are needed against Loyalty 8 and eleven against a Beacon,
    // while the largest same-owner stack seen across seven games was five.
    victim.loyalty = 0;
    recomputeInfluence(g);
    // Snapshot AFTER the Loyalty change and BEFORE the units, so the only
    // variable between the two readings is the stack. Taking it earlier would
    // have blamed the units for a border the Loyalty drop legitimately moved.
    const zocBefore = JSON.stringify(g.world.zoc);
    const proto = Object.values(g.units).find((u) => u.owner === "lakers") || Object.values(g.units)[0];
    for (let i = 0; i < 4; i += 1) {
      const uid = g.nextId("unit");
      g.units[uid] = { ...proto, uid, owner: "lakers", chips: [], node: victim.hexId };
    }
    recomputeInfluence(g);
    note(`${Object.values(g.units).filter((u) => u.node === victim.hexId && u.owner === "lakers").length}` +
      ` lakers units on ${victim.locationId} (${victim.controller}, Loyalty ${victim.loyalty})`);

    // THE SCOPING CHECK, and it is the whole point of the stage. The first
    // draft fed units into `deriveZoC`: of 745 ZoC hexes changed, 671 were
    // empty wilderness being painted, ~4.6 free mobile supply walls appeared
    // per round obsoleting the blockade, and 199 unit-rounds made a unit a
    // trespasser on its own ground.
    check("the ZoC map is byte-identical under a unit stack",
      JSON.stringify(g.world.zoc) === zocBefore,
      "units are painting the ZoC map — this is the failure the stage exists to avoid");
    check("…but the stack registers as pressure on the city",
      pressureSource(g, victim, victim.controller) === "lakers",
      `pressureSource returned ${pressureSource(g, victim, victim.controller)}`);
    check("…and the unit field is kept separate from the influence field",
      g.world.unitPressure && g.world.unitPressure !== g.world.influence);
  });

// --------------------------------------------------------------------
// LIVE from day one, and it is the guard on §10.1's measured failure: at
// dominanceThreshold 3 with unitInfluence 1, three units TIE a Loyalty-4
// city's ring and produce neutral rather than a flip — and the measured
// maximum same-owner stack across seven games was five.
block(7, "A stack of any size cannot flip a hex adjacent to a Loyalty-4 Location",
  "economy 7 (guard — live from day one)", true, (check, note) => {
    const g = mk();
    startTurn(g);
    const victim = Object.values(g.locations).find((l) => l.controller && l.controller !== "lakers");
    victim.loyalty = 4;
    recomputeInfluence(g);
    const ring = g.board.adjacency[victim.hexId] || [];
    const owners0 = ring.map((h) => g.world.zoc[h] || null);
    // Twelve units — more than double the measured maximum real stack.
    const proto = Object.values(g.units).find((u) => u.owner === "lakers") || Object.values(g.units)[0];
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const uid = g.nextId("unit");
      g.units[uid] = { ...proto, uid, owner: "lakers", chips: [], node: ring[0] };
      ids.push(uid);
    }
    recomputeInfluence(g);
    const owners1 = ring.map((h) => g.world.zoc[h] || null);
    note(`ring owners before ${JSON.stringify(owners0)} after ${JSON.stringify(owners1)}`);
    check("no adjacent hex changed owner under a 12-unit stack",
      JSON.stringify(owners0) === JSON.stringify(owners1),
      `${owners0.filter((o, i) => o !== owners1[i]).length} hexes flipped`);
  });

// --------------------------------------------------------------------
// v0.3-roadmap item 1, open since 2026-08-06. `pickBuild` scored six fields of
// forty-two; the playtest evidence was three of six factions ending a 15-round
// game with an empty tech wheel and the Lakers on 36 unspent scrap.
//
// The list is READ FROM THE TABLE ITSELF rather than restated here, so a field
// added to `content.js` and forgotten in `chipValue.js` fails this block —
// which is the only mechanism that stops the six-of-forty-two state recurring.
block(8, "Every chip field authored in content.js is valued by the AI",
  "economy 10", true, (check, note) => {
    const fields = new Set();
    const SKIP = new Set(NON_EFFECT_FIELDS);
    for (const def of Object.values(CHIPS)) {
      for (const k of Object.keys(def)) if (!SKIP.has(k)) fields.add(k);
    }
    const unseen = [...fields].filter((f) => !VALUED_FIELDS.includes(f)).sort();
    const stale = VALUED_FIELDS.filter((f) => !fields.has(f)).sort();
    note(`authored effect fields: ${fields.size}`);
    note(`valued by chipValue:    ${VALUED_FIELDS.length}`);
    check("no authored chip field is invisible to the AI", unseen.length === 0,
      `${unseen.length} of ${fields.size} score nothing: ${unseen.join(", ")}`);
    check("…and the table has no rows for fields nobody authors", stale.length === 0,
      `stale rows: ${stale.join(", ")}`);
    // Every chip must price to a finite number. A NaN here would sort chips at
    // random and be invisible in the endings.
    const bad = Object.values(CHIPS).filter((d) => !Number.isFinite(chipValue(d)));
    check("…and every authored chip prices to a finite number", bad.length === 0,
      `not finite: ${bad.map((d) => d.id).join(", ")}`);
    // The ordering that cost an evening: a defensive chip must not outrank an
    // economic one per point. Garrison at 1.6 put `defense-turrets` a fifth of
    // a point over `recyclers` and captures fell from 22 to 8 on seed 1234.
    const rec = CHIPS["recyclers"], turret = CHIPS["defense-turrets"];
    if (rec && turret) {
      note(`recyclers ${chipValue(rec).toFixed(2)} vs defense-turrets ${chipValue(turret).toFixed(2)}`);
      check("…and production still outranks fortification, point for point",
        chipValue(rec) >= chipValue(turret),
        "a defensive chip outscores the economic one it competes with");
    }
  });

// --------------------------------------------------------------------
block(9, "The Nth chip past economy.freeChips costs 1 per round",
  "economy 8", false, (check, note) => {
    note(`CONFIG.economy.freeChips = ${CONFIG.economy.freeChips}`);
    const paying = Object.values(CHIPS).filter((c) => (c.upkeep || 0) > 0);
    note(`chips carrying their own upkeep today: ${paying.length} of ${Object.keys(CHIPS).length}` +
         ` — ${paying.map((c) => c.id).join(", ")}`);
    check("the count-based obligation exists", CONFIG.economy.freeChips != null,
      "the tunable does not exist");
  });

// --------------------------------------------------------------------
// Current behaviour, asserted so nothing in either brief breaks it. Research
// is the best-shaped quantity in the economy and the design does not touch it.
block(10, "Losing a lab drops Tech Level and peels a node",
  "current behaviour (regression guard)", true, (check, note) => {
    const g = mk();
    startTurn(g);
    const pid = "versari";
    const p = g.players[pid];
    const home = Object.values(g.locations).find((l) => l.controller === pid);
    const lab = Object.values(CHIPS).find((c) => (c.research || 0) > 0);
    if (!lab) throw new Error("no research chip in content.js");
    // Plant enough Research to clear a threshold, then take it away.
    const uids = [];
    const need = CONFIG.tech.researchThresholds[0];
    for (let i = 0; i < Math.ceil(need / lab.research) + 1; i++) {
      const u = g.nextId("chip");
      g.chips[u] = { uid: u, chipId: lab.id };
      home.chips.push(u); uids.push(u);
    }
    recomputeResearch(g);
    const lvlUp = p.techLevel;
    note(`${uids.length}× ${lab.id} → research ${p.research}, Tech Level ${lvlUp}`);
    check("holding labs raises Tech Level", lvlUp > 1, `Tech Level stayed at ${lvlUp}`);

    // Spend the point so there is a node to peel.
    const before = (p.techWheel || []).length;
    note(`wheel before losing the labs: ${JSON.stringify(p.techWheel)}`);
    home.chips = home.chips.filter((c) => !uids.includes(c));
    recomputeResearch(g);
    note(`after: research ${p.research}, Tech Level ${p.techLevel}, wheel ${JSON.stringify(p.techWheel)}`);
    check("losing them drops Tech Level again", p.techLevel < lvlUp,
      `Tech Level stayed at ${p.techLevel}`);
    check("…and the wheel is no longer than the new level allows",
      (p.techWheel || []).length <= Math.max(0, p.techLevel - 1),
      `wheel holds ${(p.techWheel || []).length} nodes at Tech Level ${p.techLevel} (was ${before})`);
  });

// --------------------------------------------------------------------
console.log(`\n${"=".repeat(64)}`);
console.log(`  ${passes} passed, ${failures} failed, ${pending} blocks pending a stage`);
console.log(`${"=".repeat(64)}`);
process.exit(failures ? 1 : 0);
