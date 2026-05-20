// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn } from "./turn.js";
import { performAction } from "./actions.js";
import { applyEffect } from "./effects.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS, ABILITIES, REACTIVES } from "./content.js";
import { loadFieldEncounters, findUnsupportedTypes, choiceIsRunnable } from "./content-loader.js";
import { CONFIG } from "./config.js";

const seed = Number(process.argv[2]) || 42;
const line = (s = "") => console.log(s);

const game = createGame({ seed });
line(`\n=== Ashland Conquest — engine harness (seed ${seed}) ===`);

// --- board ---
line("\nBOARD  (loc[CTRL]  ~encounter~  wasteland;  * = unit)");
const unitAt = {};
for (const u of Object.values(game.units)) unitAt[u.node] = true;
const byRow = {};
for (const h of Object.values(game.board.hexes)) (byRow[h.row] ||= []).push(h);
const maxW = Math.max(...Object.values(byRow).map((r) => r.length));
for (const row of Object.keys(byRow).sort((a, b) => a - b)) {
  const cells = byRow[row]
    .sort((a, b) => a.col - b.col)
    .map((h) => {
      let label;
      if (h.type === "location") {
        const loc = game.locations[h.id];
        const ctrl = loc.controller ? loc.controller.slice(0, 3).toUpperCase() : "—";
        label = `${LOCATIONS[loc.locationId].name}[${ctrl}]`;
      } else label = h.type === "encounter" ? "~encounter~" : "wasteland";
      return (label + (unitAt[h.id] ? "*" : "")).padEnd(17);
    });
  line("  " + " ".repeat((maxW - byRow[row].length) * 9) + cells.join(""));
}

// --- begin play ---
startTurn(game);
line(`\nround ${game.round} · phase ${game.phase} · active ${activePlayerId(game)}`);

line("\nAFTER FIRST UPKEEP  (active player collects location production)");
for (const p of Object.values(game.players)) {
  line(
    `  ${FACTIONS[p.factionId].name.padEnd(20)} ` +
      `scrap ${p.resource}  actions ${p.actions.remaining}/${p.actions.max}`,
  );
}

// --- effect library demo ---
const me = activePlayerId(game);
const myUnit = Object.values(game.units).find((u) => u.owner === me);
const ctx = { sourcePlayer: me };
line(`\nEFFECT DEMO  (active: ${me})`);
line(
  `  before  scrap ${game.players[me].resource}  ` +
    `unit STR ${myUnit.strength}  actions ${game.players[me].actions.remaining}`,
);
applyEffect(game, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 5, target: "active_player" }, ctx);
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: 3, target: myUnit.uid, duration: "this_turn" }, ctx);
applyEffect(game, { type: "GRANT_ACTIONS", amount: 1, target: "active_player" }, ctx);
line(
  `  after   scrap ${game.players[me].resource}  ` +
    `unit STR ${myUnit.strength}  actions ${game.players[me].actions.remaining}`,
);

// --- action layer (Layer 3.1: Move + Recruit) ---
line("\nACTIONS  (Layer 3.1 — Move + Recruit)");
const mover = Object.values(game.units).find((u) => u.owner === me);
const dest = game.board.adjacency[mover.node][0];
const mv = performAction(game, "move", { unit: mover.uid, to: dest });
line(`  move ${mover.uid} -> ${dest}: ${mv.ok ? "ok" : "blocked — " + mv.reason}`);

const homeLoc = Object.values(game.locations).find((l) => l.controller === me);
const noTG = performAction(game, "recruit", { at: homeLoc.hexId });
line(`  recruit, no Training Grounds: ${noTG.ok ? "ok" : "blocked — " + noTG.reason}`);

// stage a Training Grounds chip + scrap, then the recruit succeeds
const tgChip = game.nextId("chip");
game.chips[tgChip] = { uid: tgChip, chipId: "training-grounds" };
homeLoc.chips.push(tgChip);
game.players[me].resource += CONFIG.unitRecruitCost;
const rec = performAction(game, "recruit", { at: homeLoc.hexId });
line(`  recruit, staged: ${rec.ok ? `ok — spawned ${rec.unit}` : "blocked — " + rec.reason}`);

// --- contest resolver (Layer 3.2 — capture a Location, then a raid) ---
line("\nCONTEST  (Layer 3.2 — Strength + 1d6 per side, defender wins ties)");

// Stake the active player with Actions and a decisive unit so the demo
// resolves the same way regardless of the dice.
applyEffect(game, { type: "GRANT_ACTIONS", amount: 20, target: "active_player" }, ctx);
const champ = Object.values(game.units).find((u) => u.owner === me);
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: 30, target: champ.uid, duration: "this_turn" }, ctx);

// March onto a neutral Location and take all three sections.
const prize = Object.values(game.locations).find((l) => l.controller === null);
champ.node = prize.hexId;
line(`  ${champ.uid} (STR ${champ.strength}) contests ${LOCATIONS[prize.locationId].name} — garrison ${prize.garrison}`);
for (let i = 0; i < 3 && prize.controller !== me; i++) {
  const r = performAction(game, "contest", { unit: champ.uid });
  line(`   roll ${r.initiatorTotal} vs ${r.defenderTotal} -> ${r.won ? "won" : "lost"}; sections [${prize.sections.join(", ")}]`);
}
line(`  -> controller ${prize.controller || "neutral"}, foothold ${prize.foothold}`);

// Raid: drop an enemy unit on the captured Location (no neutral sections
// remain, so raids are legal) and contest it directly.
const victim = Object.values(game.units).find((u) => u.owner !== me);
victim.node = prize.hexId;
const raid = performAction(game, "contest", { unit: champ.uid, target: victim.uid });
line(`  raid ${victim.uid} (owner ${victim.owner}): roll ${raid.initiatorTotal} vs ${raid.defenderTotal} -> ${raid.won ? "won" : "lost"}`);
line(`   ${victim.uid} retreated to ${victim.node}, immobilizedUntil ${victim.immobilizedUntil}`);

// --- Layer 3.3 — Acquire + Activate + tech progression ---
line("\nMARKET / ACQUIRE  (Layer 3.3)");
applyEffect(game, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 30, target: "active_player" }, ctx);

// Pull a specific chip into a tier's face-up row by swapping out a
// non-protected chip — keeps the demo deterministic regardless of the
// seed's market shuffle. Chips passed through this helper are protected
// from later swaps, so multiple ensures stack without clobbering.
const protectedChipIds = new Set();
const ensureInRow = (tier, chipId) => {
  protectedChipIds.add(chipId);
  const m = game.market.tiers[tier];
  if (m.row.some((c) => game.chips[c]?.chipId === chipId)) return;
  const i = m.deck.findIndex((c) => game.chips[c]?.chipId === chipId);
  if (i < 0) return;
  const [pulled] = m.deck.splice(i, 1);
  const victimIdx = m.row.findIndex((c) => !protectedChipIds.has(game.chips[c]?.chipId));
  if (victimIdx < 0) { m.row.push(pulled); return; }
  const victim = m.row.splice(victimIdx, 1, pulled)[0];
  m.deck.push(victim);
};
const findChip = (tier, chipId) =>
  game.market.tiers[tier].row.find((c) => game.chips[c]?.chipId === chipId);

ensureInRow(1, "new-recruits");
ensureInRow(1, "labs");
ensureInRow(2, "sharpened-blades");

line(`  tier 1 row: ${game.market.tiers[1].row.map((c) => game.chips[c].chipId).join(", ")}`);
line(`  champ STR ${champ.strength}; scrap ${game.players[me].resource}`);
const acq1 = performAction(game, "acquire", { chip: findChip(1, "new-recruits"), into: { unit: champ.uid } });
line(`  acquire new-recruits -> ${acq1.ok ? `ok (chip ${acq1.chip})` : "blocked — " + acq1.reason}`);
line(`  champ STR ${champ.strength}; scrap ${game.players[me].resource}`);

line(`\nTECH  versari tech ${game.players[me].tech}`);
performAction(game, "acquire", { chip: findChip(1, "labs"), into: { location: prize.hexId } });
ensureInRow(1, "labs"); // bring a second copy face-up
performAction(game, "acquire", { chip: findChip(1, "labs"), into: { location: prize.hexId } });
line(`  installed 2 Labs at ${LOCATIONS[prize.locationId].name} -> tech ${game.players[me].tech}`);

const acq2 = performAction(game, "acquire", { chip: findChip(2, "sharpened-blades"), into: { unit: champ.uid } });
line(`  acquire sharpened-blades (tier 2) -> ${acq2.ok ? "ok" : "blocked — " + acq2.reason}; champ STR ${champ.strength}`);

line("\nACTIVATE");
const korad = Object.values(game.locations).find((l) => l.locationId === "korad");
const koradAbility = ABILITIES[korad.abilityId];
const before = {
  scrap: game.players[me].resource, vp: game.players[me].vp,
  actions: game.players[me].actions.remaining,
};
const act = performAction(game, "activate", { location: korad.hexId });
line(`  activate ${koradAbility.name} at Korad: ${act.ok ? "ok" : "blocked — " + act.reason}`);
line(`   scrap ${before.scrap}->${game.players[me].resource}  vp ${before.vp}->${game.players[me].vp}  actions ${before.actions}->${game.players[me].actions.remaining}`);

// --- Layer 4 — reaction window ---
line("\nREACTION WINDOW  (Layer 4 — Reactives in defender's hand)");

// Cancel out earlier this_turn buffs so the contest dice actually matter.
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: -33, target: champ.uid, duration: "this_turn" }, ctx);

// Stage: goldgrass garrisons its capital (Omara) with its unit.
const omara = Object.values(game.locations).find((l) => l.controller === "goldgrass");
const goldUnit = Object.values(game.units).find((u) => u.owner === "goldgrass");
goldUnit.node = omara.hexId;
champ.node = omara.hexId;

const giveReactive = (player, cardId) => {
  const i = game.reactiveDeck.findIndex((c) => game.chips[c]?.chipId === cardId);
  if (i < 0) return null;
  const card = game.reactiveDeck.splice(i, 1)[0];
  game.players[player].hand.push(card);
  return card;
};

// Demo 1: defender holds Steady Hand (on-mode, +2 STR to defending unit)
const sh = giveReactive("goldgrass", "steady-hand");
line(`  ${LOCATIONS[omara.locationId].name}: garrison ${omara.garrison}, defender ${goldUnit.uid} STR ${goldUnit.strength}`);
line(`  goldgrass holds Reactive: ${REACTIVES[game.chips[sh].chipId].name}`);
line(`  champ STR ${champ.strength} attacks…`);
const r1 = performAction(game, "contest", { unit: champ.uid });
line(`   rolls ${r1.initiatorRoll} vs ${r1.defenderRoll}; totals ${r1.initiatorTotal} vs ${r1.defenderTotal} (defValue ${r1.defenderValue}); ${r1.won ? "won" : r1.cancelled ? "cancelled" : "lost"}`);
line(`   hand=${game.players.goldgrass.hand.length} reactive-discard=${game.discards.reactive.length}`);

// Demo 2: defender holds False Flag (replace-mode, cancels)
const ff = giveReactive("goldgrass", "false-flag");
line(`\n  goldgrass holds Reactive: ${REACTIVES[game.chips[ff].chipId].name}`);
const sectionsBefore = [...omara.sections];
const r2 = performAction(game, "contest", { unit: champ.uid });
line(`   result: ${r2.won ? "won" : r2.cancelled ? "cancelled — contest aborted before the roll" : "lost"}`);
line(`   sections unchanged: ${JSON.stringify(omara.sections) === JSON.stringify(sectionsBefore)}; hand=${game.players.goldgrass.hand.length} reactive-discard=${game.discards.reactive.length}`);

// --- Editor → engine snapshot smoke test ---
line("\nCONTENT SNAPSHOT  (editor → engine pipeline smoke test)");
const fieldEncs = loadFieldEncounters();
const ids = Object.keys(fieldEncs);
line(`  loaded ${ids.length} field encounter${ids.length === 1 ? "" : "s"} from src/game/content/`);

const unsupported = findUnsupportedTypes(fieldEncs);
if (unsupported.length) {
  line(`  effect types pending engine support: ${unsupported.join(", ")}`);
}

const runnable = ids.filter((id) => fieldEncs[id].choices.some(choiceIsRunnable));
line(`  ${runnable.length}/${ids.length} encounters have at least one fully-runnable choice today`);

if (runnable.length) {
  const pickId = runnable[0];
  const enc = fieldEncs[pickId];
  const choiceIdx = enc.choices.findIndex(choiceIsRunnable);
  const choice = enc.choices[choiceIdx];
  line(`  demo: "${pickId}" → choice "${choice.label}"`);
  const scrapBefore = game.players[me].resource;
  const vpBefore = game.players[me].vp;
  const techBefore = game.players[me].tech;
  for (const eff of choice.effects) applyEffect(game, eff, ctx);
  const dr = (a, b) => `${a}->${b}`;
  line(`   active player ${me}: scrap ${dr(scrapBefore, game.players[me].resource)}, vp ${dr(vpBefore, game.players[me].vp)}, tech ${dr(techBefore, game.players[me].tech)}`);
}

// --- play out round 1 ---
line("\nPLAY ROUND 1  (each player ends their turn)");
for (let i = 0; i < game.turnOrder.length; i++) endTurn(game);
line(`  -> now round ${game.round}, phase ${game.phase}, active ${activePlayerId(game)}`);
for (const p of Object.values(game.players)) {
  line(`  ${FACTIONS[p.factionId].name.padEnd(20)} scrap ${p.resource}`);
}

// --- event log tail ---
line("\nEVENT LOG  (last 14)");
for (const ev of game.log.slice(-14)) {
  line(`  ${ev.name.padEnd(18)} ${JSON.stringify(ev.payload)}`);
}
line("");
