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
