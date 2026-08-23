// Diplomacy audit probe — the evidence behind
// docs/diplomacy-audit-2026-08-19.md, kept runnable so the findings can be
// re-checked after any fix rather than re-argued from a read of the code.
//
//   node scripts/audit-diplomacy.mjs
//
// Each block prints what the engine ACTUALLY does for one claim in the audit.
// A fixed engine should flip the marked lines; nothing here asserts, so it
// never "fails" — read the output.
import { createGame } from "../src/game/setup.js";
import * as D from "../src/game/diplomacy.js";
import { takeAITurn } from "../src/game/ai.js";
import { CONFIG } from "../src/game/config.js";

const mk = () => createGame({
  seed: 424242,
  factionIds: ["versari", "goldgrass", "lakers", "plainers"],
  humanFactionId: "versari",
  minors: [],
  size: "medium",
});
const line = (n, t) => console.log(`\n=== ${n}. ${t} ===`);

line(1, "Make Peace asks nobody");
{
  const g = mk();
  D.declareWar(g, "lakers", "versari", "test");
  console.log("  the engine's own opinion — aiAcceptsPeace(lakers):", D.aiAcceptsPeace(g, "lakers", "versari", null));
  const res = D.performDiplomacy(g, "versari", "make-peace", { faction: "lakers" });
  console.log("  result:", JSON.stringify(res), "| still at war:", D.atWar(g, "versari", "lakers"));
  console.log("  >> the ask is refusable now. was: peace happened anyway, and paid +3 Standing to both sides");
}

line(2, "Denounce is free and unlimited");
{
  const g = mk();
  const h0 = D.honorOf(g, "versari");
  for (let i = 0; i < 5; i++) D.performDiplomacy(g, "versari", "denounce", { faction: "lakers" });
  console.log("  Honor before:", h0, "after five denouncements:", D.honorOf(g, "versari"));
  console.log("  >> one of the five landed, and it cost Honor. was: all five landed, all free");
  console.log("  cooldown remaining:", D.denounceCooldown(g, "versari", "lakers"));
  console.log("  war against lakers now reads as justified:", !!D.warJustification(g, "versari", "lakers"));
}

line(3, "The deal builder's non-scrap items are inert");
{
  const g = mk();
  console.log("  valueOfItem({pact:true}):", D.valueOfItem(g, "goldgrass", { pact: true }));
  console.log("  valueOfItem({openBorders:true}):", D.valueOfItem(g, "goldgrass", { openBorders: true }));
  console.log("  valueOfItem({promise:{kind:'openBorders'}}) — the schema the engine reads:",
    D.valueOfItem(g, "goldgrass", { promise: { kind: "openBorders" } }));
  const r = D.performDiplomacy(g, "versari", "propose-deal",
    { faction: "goldgrass", give: [{ pact: true }, { openBorders: true }], get: [] });
  console.log("  offering a pact + open borders for nothing:", JSON.stringify(r));
  console.log("  >> the shorthand is still worth nothing — because it is not the schema. The drawer\n     no longer emits it; it emits {promise:{kind}}, which IS read and IS performed:");
  const g2 = mk();
  D.adjustStanding(g2, "goldgrass", "versari", 12, "t");
  D.performDiplomacy(g2, "versari", "propose-deal", { faction: "goldgrass",
    give: [{ promise: { kind: "pact" } }, { promise: { kind: "openBorders" } }],
    get: [{ resource: { resource: "scrap", amount: 3 } }] });
  console.log("     pact formed:", D.arePacted(g2, "versari", "goldgrass"),
    "| open borders:", D.hasOpenBorders(g2, "versari", "goldgrass"));
}

line(4, "Demand Tribute never receives the amount the player set");
{
  const g = mk();
  g.players.goldgrass.resource = 50;
  g.players.versari.resource = 0;
  for (const loc of Object.values(g.locations)) if (loc.controller && loc.controller !== "goldgrass") loc.controller = "versari";
  for (const u of Object.values(g.units)) if (u.owner !== "goldgrass") u.owner = "versari";
  // Exactly the params DiplomacyDrawer sends.
  D.performDiplomacy(g, "versari", "demand-tribute",
    { faction: "goldgrass", give: [], get: [{ resource: { resource: "scrap", amount: 15 } }] });
  console.log("  after the UI-shaped call, demander holds:", g.players.versari.resource, "scrap");
  D.performDiplomacy(g, "versari", "demand-tribute",
    { faction: "goldgrass", terms: [{ resource: { resource: "scrap", amount: 15 } }] });
  console.log("  after an engine-shaped call (terms:), demander holds:", g.players.versari.resource, "scrap");
  console.log("  >> both shapes move the scrap now. was: the UI-shaped call demanded 0 and \"succeeded\"");
}

line(5, "A per-turn flow is priced at three turns and runs forever");
{
  const g = mk();
  const deal = {
    proposer: "versari", recipient: "goldgrass",
    give: [{ resource: { resource: "scrap", amount: 12 } }],
    get: [{ flow: { resource: "scrap", amountPerTurn: 4 } }],
  };
  console.log("  goldgrass values 4/turn forever at:", D.dealValue(g, "goldgrass", deal),
    "| accepts:", D.wouldAccept(g, "goldgrass", deal));
  D.performDiplomacy(g, "versari", "propose-deal", { faction: "goldgrass", give: deal.give, get: deal.get });
  const start = g.players.versari.resource;
  g.players.goldgrass.resource = 500;
  for (let i = 0; i < 20; i++) { g.round++; D.runDiplomacyRound(g); }
  console.log("  >> refused, because a perpetual flow can no longer be minted by a deal and a\n     termed one is priced on its term. was: accepted at a flat x3, then paid forever");
}

line(6, "The AI can impose a pact on the human without asking");
{
  const g = mk();
  D.adjustStanding(g, "goldgrass", "versari", 20, "test");
  D.adjustStanding(g, "versari", "goldgrass", 20, "test");
  g.activeIndex = g.turnOrder.indexOf("goldgrass");
  takeAITurn(g);
  console.log("  >> pacted without asking:", D.arePacted(g, "goldgrass", "versari"),
    "| offer waiting instead:", D.offersFor(g, "versari").map((o) => o.kind).join(",") || "(none)");
  console.log("     was: allied on the spot, no offer, no refusal possible");
}

line(7, "The AI never proposes anything to the human");
{
  const g = mk();
  const seen = new Set();
  for (let r = 0; r < 30; r++) {
    for (const f of g.turnOrder) {
      if (f === "versari") continue;
      g.activeIndex = g.turnOrder.indexOf(f);
      takeAITurn(g);
    }
    g.round++;
    D.runDiplomacyRound(g);
  }
  for (const e of g.log) {
    if (!/deal_proposed|deal_struck|tribute_demanded|denounced|pact_formed/.test(e.name)) continue;
    if (Object.values(e.payload || {}).includes("versari")) seen.add(e.name);
  }
  const tabled = new Set();
  for (const e of g.log) if (e.name === "offer_tabled" && e.payload.to === "versari") tabled.add(`${e.payload.from}:${e.payload.kind}`);
  console.log("  >> 30 rounds of AI turns, AI-originated approaches to the human:",
    [...new Set([...seen, ...tabled])].join(", ") || "(none)");
  console.log("     was: (none), every time");
}

// --- §6.10 the round trip, added by tier 2 ------------------------------
line(8, "A refusal comes back with a price");
{
  const g = mk();
  g.players.versari.resource = 40;
  const lowball = {
    faction: "goldgrass",
    give: [{ resource: { resource: "scrap", amount: 1 } }],
    get: [{ promise: { kind: "openBorders" } }, { promise: { kind: "nonAggression", rounds: 6 } }],
  };
  const r = D.performDiplomacy(g, "versari", "propose-deal", lowball);
  console.log("  lowballed for borders + non-aggression:", JSON.stringify(r));
  const o = D.offersFor(g, "versari")[0];
  console.log("  their counter — they give:", JSON.stringify(o?.deal.get), "for:", JSON.stringify(o?.deal.give));
  D.performDiplomacy(g, "versari", "answer-offer", { offerId: o.id, accept: true });
  console.log("  >> accepted; borders open:", D.hasOpenBorders(g, "versari", "goldgrass"),
    "| scrap left:", g.players.versari.resource);
}

line(9, "Some things are not for sale at any price");
{
  const g = mk();
  g.players.versari.resource = 200;
  D.adjustStanding(g, "goldgrass", "versari", -4, "t");
  const r = D.performDiplomacy(g, "versari", "propose-deal", {
    faction: "goldgrass",
    give: [{ resource: { resource: "scrap", amount: 150 } }],
    get: [{ promise: { kind: "pact" } }],
  });
  console.log("  150 scrap for an alliance below the Standing bar:", JSON.stringify(r));
  console.log("  >> refused with a reason, and no counter tabled:", D.offersFor(g, "versari").length === 0);
}

line(10, "Asking too often costs you");
{
  const g = mk();
  g.players.versari.resource = 0;
  const hopeless = { faction: "lakers", give: [],
    get: [{ flow: { resource: "scrap", amountPerTurn: 10, rounds: 20 } }] };
  const before = D.getStanding(g, "lakers", "versari");
  for (let i = 0; i < 5; i += 1) D.performDiplomacy(g, "versari", "propose-deal", hopeless);
  console.log("  five hopeless asks in one round: standing", before, "->", D.getStanding(g, "lakers", "versari"));
  console.log("  >> asks recorded:", D.asksThisRound(g, "versari", "lakers"),
    "| free per round:", 2);
}

// --- blocks 11-16, added with the 2026-08-23 briefs -------------------
// Numbered to match diplomacy brief §17. Blocks whose rule has not shipped
// print what they will assert and what is true today, exactly as
// `audit-economy.mjs` does — the same discipline, so a stage that lands can
// flip its block in the same commit as the rule.

line(11, "A faction never acts on a posture it has not stated at least a round earlier");
{
  console.log("  PENDING — diplomacy stage 3. Posture does not exist yet.");
  console.log("  will assert: every act carries state.diplomacy.posture[a][b].statedRound <= round - 1");
  const g = mk();
  console.log("  today: state.diplomacy.posture is", g.diplomacy.posture === undefined ? "undefined" : "present");
}

line(12, "No coalition forms against a spotless target below fearThreshold");
{
  console.log("  RESOLVED — diplomacy §9. The grounds gate ships live (coalition.groundsGate: 1).");
  // Spotless means spotless: a lead earned on VP, with nobody's homeland
  // under occupation. (The first draft of this block seized every Location
  // for versari, which manufactured three `occupation` grievances and then
  // reported the grounds gate as broken for honouring them.)
  // The band that matters is OVER coalition.threshold but UNDER fearThreshold:
  // frightening enough that the old rule would have risen, clean enough that
  // the new one should not. Walk VP up to land in it, and read threat BEFORE
  // the round — runDiplomacyRound recomputes VP from the board.
  const CC = CONFIG.diplomacy.coalition;
  const g = mk();
  g.players.versari.menace = 0;
  let t = 0;
  for (let vp = 1; vp <= 40; vp++) {
    g.players.versari.vp = vp;
    t = D.threatScore(g, "versari");
    if (t >= CC.threshold && t < CC.fearThreshold) break;
  }
  const grounds = D.coalitionGrounds(g, "versari");
  D.runDiplomacyRound(g);
  const c = g.diplomacy.coalitions.find((x) => x.target === "versari");
  console.log("  a clean runaway, Menace 0, threat", Math.round(t * 10) / 10,
    `(threshold ${CC.threshold}, fear ${CC.fearThreshold})`,
    "-> grounds:", grounds, "| coalition:", !!c);
  console.log("  >> was: a spotless leader was coalitioned on POSITION alone, which is exactly the\n" +
    "     Attila failure the research names. The 2026-08-15 log has the pure case: Goldgrass's\n" +
    "     Menace never moved once all game and it had two wars declared on it in R7 for leading.");
  console.log("  the escape hatch is still there — fear alone IS grounds past",
    CONFIG.diplomacy.coalition.fearThreshold, "so a flawless runaway is not unstoppable:");
  const gf = mk(); gf.players.versari.menace = 0; gf.players.versari.vp = 60;
  console.log("    at threat", Math.round(D.threatScore(gf, "versari") * 10) / 10,
    "-> grounds:", D.coalitionGrounds(gf, "versari"));
  console.log("  …and conduct is grounds at any position — Menace",
    CONFIG.diplomacy.coalition.menaceGrounds + ":");
  const g2 = mk(); g2.players.versari.menace = CONFIG.diplomacy.coalition.menaceGrounds;
  console.log("    grounds:", D.coalitionGrounds(g2, "versari"));
}

line(13, "A conscripted member's Standing never drops below draftStandingFloor");
{
  console.log("  RESOLVED — diplomacy §9. Drafts floor at coalition.draftStandingFloor and count as justified.");
  const g = mk();
  D.adjustStanding(g, "lakers", "versari", 5, "test");
  // Grounds, so there is a rising to be drafted into at all.
  g.players.versari.menace = 6; g.players.versari.vp = 14;
  const m0 = {};
  for (const f of D.factionIds(g)) m0[f] = g.players[f]?.menace ?? 0;
  D.runDiplomacyRound(g);
  const coal = g.diplomacy.coalitions.find((c) => c.target === "versari");
  const inCoal = (coal?.members || []).includes("lakers");
  const floor = CONFIG.diplomacy.coalition.draftStandingFloor;
  console.log("  grounds:", coal?.grounds, "| members:", (coal?.members || []).join(", ") || "(none)");
  console.log("  lakers stood at +5, drafted:", inCoal, "-> standing now", D.getStanding(g, "lakers", "versari"),
    "(floor", floor + ")");
  const belowFloor = (coal?.members || []).filter((m) => D.getStanding(g, m, "versari") < floor);
  console.log("  members below the draft floor:", belowFloor.length ? belowFloor.join(", ") : "(none)");
  const charged = (coal?.members || []).filter((m) => (g.players[m]?.menace ?? 0) > m0[m]);
  console.log("  members charged Menace for joining:", charged.length ? charged.join(", ") : "(none)");
  console.log("  >> was: a draft made a partner an enemy — +5 landed at hostile — and the declaration\n" +
    "     charged declareUnjustified, which with wM 1 raised the members' OWN threat scores and\n" +
    "     seeded the next coalition out of the last one.");
}

line(14, "A player position broken is cited by name within 3 rounds");
{
  console.log("  RESOLVED — diplomacy §13. state.diplomacy.positions exists and the citation is live.");
  const g = mk();
  const PC = CONFIG.diplomacy.positions;
  const me = "versari", them = "lakers";
  const decl = D.performDiplomacy(g, me, "declare-position", { kind: "noWarOn", target: them });
  console.log("  versari stands on:", decl.ok ? D.positionText(g, decl.position) : `(refused: ${decl.reason})`);
  const h0 = g.players[me].honor, m0 = g.players[me].menace;
  D.declareWar(g, me, them, "player");
  console.log("  …then declares war. Honor", h0, "->", g.players[me].honor,
    "| Menace", m0, "->", g.players[me].menace);
  const cites = D.citablePositions(g, me, them);
  console.log("  citable by the wronged party, this round:", cites.length,
    cites.length ? `-> "${D.positionText(g, cites[0])}"` : "");
  const grounds = D.denounceGrounds(g, them, me);
  console.log("  what lakers would denounce them FOR:", grounds?.kind,
    grounds?.text ? `-> "${grounds.text}"` : "");
  let stillCitable = 0;
  for (let i = 1; i <= PC.citeWithinRounds + 1; i++) {
    g.round += 1;
    if (D.citablePositions(g, me, them).length) stillCitable = i;
  }
  console.log(`  stays news for ${stillCitable} round(s) after the break (window ${PC.citeWithinRounds})`);
  console.log("  >> was: positions did not exist. The half that DID was bilateral — ENACTED/standing");
  console.log("     promise kinds read by breakPromiseIfAny, and dontAllyPledge blocking formPact.");
  console.log("     What was missing was the player VOLUNTEERING one, unasked and in public, and");
  console.log("     the board naming it back. Breaking one now costs", PC.breakHonorLoss, "Honor (a");
  console.log("     bilateral promise costs", CONFIG.diplomacy.honor.breakLoss + "),", PC.breakMenace,
    "Menace, and a severity-" + CONFIG.diplomacy.grievance.severity["position-broken"], "grievance.");
}

line(15, "Every surviving faction is reachable by ally, vassal or elimination, from turn 1");
{
  const g = createGame({
    seed: 424242,
    factionIds: ["versari", "goldgrass", "lakers", "plainers"],
    humanFactionId: "versari",
    minors: ["tempest", "croppers", "steeltraders", "dambarans"],
    mapSize: "medium",
  });
  D.ensureDiplomacy(g);
  const ids = D.factionIds(g);
  const unreachable = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      // Elimination is never gated, so the question is whether EITHER of the
      // other two doors can ever open. `mayCourt` is that question.
      if (!D.mayCourt(g, a, b)) unreachable.push(`${a}->${b}`);
    }
  }
  console.log("  pairs with no ally/vassal door on round 1:", unreachable.length ? unreachable.join(", ") : "(none)");
  console.log("  …and after the reachability window (round " + (CONFIG.diplomacy.reach.reachabilityRounds + 1) + "):");
  g.round = CONFIG.diplomacy.reach.reachabilityRounds + 1;
  const stillClosed = [];
  for (const a of ids) for (const b of ids) if (a !== b && !D.mayCourt(g, a, b)) stillClosed.push(`${a}->${b}`);
  console.log("   ", stillClosed.length ? stillClosed.join(", ") : "(none — every pair is reachable)");
  console.log("  >> was: a scope:\"local\" minor outside ai.localityRadius could be neither allied nor");
  console.log("     vassalised, only killed — while dominionStanding counted it anyway. 6 of 15 games");
  console.log("     never resolved. The escape opens the ALLY and VASSAL doors only: widening mayEngage");
  console.log("     itself also widened the war path and took unresolved from 6 to 11.");
}

line(16, "A full-corpus quest playthrough never pushes Honor below any live faction's trustFloor");
{
  console.log("  PENDING — diplomacy stage 8 (the trust->Honor merge).");
  const g = mk();
  const floors = D.factionIds(g).map((f) => `${f} ${Math.round(D.trustFloor(g, f) * 10) / 10}`);
  console.log("  live trust floors:", floors.join(" · "));
  console.log("  honor.decayPerRound:", CONFIG.diplomacy.honor.decayPerRound,
    "— Honor does not recover passively, which is the hazard.");
  console.log("  >> the 23 authored `trust` writes sum to -16. Merged at full magnitude into a stat");
  console.log("     that never recovers, a normal spread of quest choices can push a player under");
  console.log("     several factions' floors, and passesRepGates hard-gates every pact on it — the");
  console.log("     diplomacy face would close permanently. Three mitigations, all three needed:");
  console.log("     halve the magnitudes, give Honor a positive decayPerRound, and assert this block.");
}
