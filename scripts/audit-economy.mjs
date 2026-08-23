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
  "economy 4", false, (check, note) => {
    const g = mk();
    startTurn(g);
    const cfg = CONFIG.sway;
    note(`CONFIG.sway is ${cfg ? "present" : "absent — the currency does not exist yet"}`);
    check("every surviving faction has a non-zero Sway income",
      !!cfg && Object.keys(g.players).every((p) => (g.players[p].swayIncome || 0) > 0),
      "no faction has any Sway income; CONFIG.sway is not defined");
    check("income never exceeds sway.cap",
      !!cfg && Object.keys(g.players).every((p) => (g.players[p].sway || 0) <= cfg.cap),
      "nothing to cap");
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
  "economy 3", false, (check, note) => {
    const g = mk();
    startTurn(g);
    note(`CONFIG.economy.supplyDelaysSpending = ${CONFIG.economy.supplyDelaysSpending}`);
    check("the delay rule is switched on",
      CONFIG.economy.supplyDelaysSpending === true,
      "the tunable does not exist");
    check("a delayed purchase emits purchase_delayed carrying its ETA",
      g.log.some((e) => e.name === "purchase_delayed"),
      "no such event is ever emitted");
  });

// --------------------------------------------------------------------
// Deliberately "no GIFT path", not "no scrap path". §6.3 names three bounded
// material-for-goodwill exchanges the design keeps — applyDeal's
// value-proportional Standing, completeUltimatum's complyStandingGain, and
// formTradingPact's +2/+2 — so the wider claim would fail the day it is
// written, which is the trap the brief calls out by name.
block(4, "No GIFT path moves Standing",
  "economy 5", false, (check, note) => {
    const g = mk();
    const before = giftPathsMovingStanding(g);
    note(`gift paths that still move Standing: ${before.join(", ") || "(none)"}`);
    check("a scrap gift buys no Standing", before.length === 0, before.join(", "));
  });

function giftPathsMovingStanding(g) {
  const out = [];
  const s0 = DIP.getStanding(g, "goldgrass", "versari");
  g.players.versari.resource = 40;
  DIP.performDiplomacy(g, "versari", "gift", { faction: "goldgrass", amount: 8 });
  const s1 = DIP.getStanding(g, "goldgrass", "versari");
  if (s1 !== s0) out.push(`performDiplomacy('gift') moved Standing ${s0} -> ${s1}`);
  return out;
}

// --------------------------------------------------------------------
block(5, "Occupation charges every round, stops on cession or elimination, and never charges a startingController Location",
  "economy 6", false, (check, note) => {
    const g = mk();
    const stamped = Object.values(g.locations).filter((l) => l.startingController);
    note(`Locations stamped with startingController: ${stamped.length} of ${Object.keys(g.locations).length}`);
    check("setup stamps loc.startingController", stamped.length > 0,
      "no Location carries the field, so provenance cannot be told from conquest");
    // The Croppers open holding omara, whose affiliation is goldgrass — the
    // exact case the brief names, and the reason the stamp exists.
    const omara = Object.values(g.locations).find((l) => l.locationId === "omara");
    if (omara) note(`omara: affiliation ${LOCATIONS.omara?.affiliation}, controller ${omara.controller}`);
    check("an occupation charge is emitted while a rival homeland is held",
      g.log.some((e) => e.name === "occupation_charged"),
      "no such event is ever emitted");
  });

// --------------------------------------------------------------------
// §10.1's scoping check. Unit influence must reach `pressureSource` (which
// reads the raw field) and NOT `deriveZoC` — the measured alternative painted
// 671 hexes of empty wilderness, walled supply for free, and made 199
// unit-rounds of trespassers on their own ground.
block(6, "Unit influence moves pressureSource and leaves state.world.zoc byte-identical",
  "economy 7", false, (check, note) => {
    const g = mk();
    startTurn(g);
    recomputeInfluence(g);
    const zocBefore = JSON.stringify(g.world.zoc);
    // Park every unit a faction owns on one rival Location's hex.
    const victim = Object.values(g.locations).find((l) => l.controller && l.controller !== "lakers");
    if (!victim) throw new Error("no rival Location on this board");
    const stack = Object.values(g.units).filter((u) => u.owner === "lakers");
    for (const u of stack) u.node = victim.hexId;
    note(`${stack.length} lakers units parked on ${victim.locationId} (${victim.controller})`);
    recomputeInfluence(g);
    check("the ZoC map is unchanged by a unit stack",
      JSON.stringify(g.world.zoc) === zocBefore, "units are painting the ZoC map");
    check("…but the stack registers as pressure on the city",
      pressureSource(g, victim, victim.controller) === "lakers",
      `pressureSource returned ${pressureSource(g, victim, victim.controller)}`);
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
// v0.3-roadmap item 1, open since 2026-08-06. `pickBuild` scores six fields of
// roughly twenty-six; the playtest evidence is three of six factions ending a
// 15-round game with an empty tech wheel and the Lakers on 36 unspent scrap.
const SCORED_BY_PICKBUILD = ["output", "research", "garrison", "strength", "unitCapBonus", "upkeep"];
block(8, "Every chip field authored in content.js is valued by the AI",
  "economy 10", false, (check, note) => {
    const fields = new Set();
    const SKIP = new Set(["id", "name", "kind", "faction", "desc", "slots", "cost", "buildCost",
      "techLevel", "loyaltyReq", "upgradesTo", "upgradeFrom", "tags", "requires"]);
    for (const def of Object.values(CHIPS)) {
      for (const k of Object.keys(def)) if (!SKIP.has(k)) fields.add(k);
    }
    const unseen = [...fields].filter((f) => !SCORED_BY_PICKBUILD.includes(f)).sort();
    note(`authored effect fields: ${fields.size}`);
    note(`scored by pickBuild:   ${SCORED_BY_PICKBUILD.length}`);
    note(`invisible to the AI:   ${unseen.length} — ${unseen.join(", ")}`);
    check("no authored chip field is invisible to pickBuild", unseen.length === 0,
      `${unseen.length} of ${fields.size} fields score nothing`);
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
