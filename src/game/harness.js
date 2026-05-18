// Headless harness — `node src/game/harness.js [seed]` builds a game and
// prints it, so engine layers can be verified without the UI.
import { createGame } from "./setup.js";
import { FACTIONS, LOCATIONS } from "./content.js";

const seed = Number(process.argv[2]) || 42;
const game = createGame({ seed });

console.log(`\n=== Ashland Conquest — engine harness ===`);
console.log(`seed ${game.seed} · round ${game.round} · phase ${game.phase}\n`);

console.log("PLAYERS");
for (const p of Object.values(game.players)) {
  console.log(
    `  ${FACTIONS[p.factionId].name.padEnd(20)} ` +
      `scrap ${p.resource}  VP ${p.vp}  tech ${p.tech}  ` +
      `actions ${p.actions.remaining}/${p.actions.max}  unitCap ${p.unitCap}`,
  );
}

console.log("\nUNITS");
for (const u of Object.values(game.units)) {
  console.log(`  ${u.name.padEnd(26)} @ ${u.node}  STR ${u.strength}  MOV ${u.movement}`);
}

console.log("\nBOARD  (loc[CTRL]  ~encounter~  wasteland;  * = unit present)");
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
      } else if (h.type === "encounter") {
        label = "~encounter~";
      } else {
        label = "wasteland";
      }
      if (unitAt[h.id]) label += "*";
      return label.padEnd(17);
    });
  console.log("  " + " ".repeat((maxW - byRow[row].length) * 9) + cells.join(""));
}

console.log("\nLOCATIONS");
for (const loc of Object.values(game.locations)) {
  const def = LOCATIONS[loc.locationId];
  console.log(
    `  ${def.name.padEnd(12)} ${def.strategicValue.padEnd(9)} ` +
      `garrison ${String(loc.garrison).padStart(2)}  scrap/turn ${loc.production}  ` +
      `slots ${loc.chips.length}/${loc.chipSlots}  ` +
      `${loc.controller ? "held by " + loc.controller : "neutral"}`,
  );
}

console.log("\nMARKET");
for (const tier of [1, 2, 3]) {
  const t = game.market.tiers[tier];
  console.log(
    `  Tier ${tier}  row: ${t.row.map((u) => game.chips[u].chipId).join(", ")}  ` +
      `(deck ${t.deck.length})`,
  );
}
console.log("");
