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
  console.log("  >> peace happened anyway, and standing rose to", D.getStanding(g, "versari", "lakers"));
}

line(2, "Denounce is free and unlimited");
{
  const g = mk();
  const h0 = D.honorOf(g, "versari");
  for (let i = 0; i < 5; i++) D.performDiplomacy(g, "versari", "denounce", { faction: "lakers" });
  console.log("  Honor before:", h0, "after five denouncements:", D.honorOf(g, "versari"));
  console.log("  >> the UI promises an Honor hit; the engine charges none, and there is no cooldown");
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
  console.log("  >> pact formed:", D.arePacted(g, "versari", "goldgrass"),
    "| open borders:", D.hasOpenBorders(g, "versari", "goldgrass"));
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
  console.log("  >> the drawer sends `get`; the verb reads `terms`, and falls back to demanding 0");
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
  console.log("  >> paid 12 once, collected", g.players.versari.resource - start, "over 20 rounds; agreement still live:",
    g.diplomacy.agreements.some((a) => a.type === "deal-promise"));
}

line(6, "The AI can impose a pact on the human without asking");
{
  const g = mk();
  D.adjustStanding(g, "goldgrass", "versari", 20, "test");
  D.adjustStanding(g, "versari", "goldgrass", 20, "test");
  g.activeIndex = g.turnOrder.indexOf("goldgrass");
  takeAITurn(g);
  console.log("  >> pacted with the human after its turn:", D.arePacted(g, "goldgrass", "versari"),
    "— no offer, no prompt, no refusal possible");
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
  console.log("  >> 30 rounds of AI turns, AI-originated approaches to the human:", [...seen].join(", ") || "(none)");
}
