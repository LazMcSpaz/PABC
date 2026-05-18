// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn } from "./turn.js";
import { applyEffect } from "./effects.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS } from "./content.js";

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
