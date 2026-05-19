// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn } from "./turn.js";
import { performAction } from "./actions.js";
import { applyEffect } from "./effects.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS } from "./content.js";
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
