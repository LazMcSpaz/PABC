// Field-encounter sites are not signposted.
//
// The board used to draw a "?" and a tinted rim on every `encounter` hex, in
// all three renderers, plus an inspector panel explaining the mechanic. A site
// you can see three turns out is a resource to farm or a tile to route around,
// not an encounter — so the view is simply never told which hexes they are.
//
// The engine still knows: Move reads state.board.hexes directly, and that is
// what this checks has not been broken in the course of hiding it.
import { readFileSync } from "node:fs";
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { adaptState } from "../src/prototype/engineAdapter.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

const g = createGame({ seed: 1126, humanFactionId: "plainers" });
startTurn(g);

const engineSites = Object.values(g.board.hexes).filter((h) => h.type === "encounter");
check("1. the board still generates encounter sites",
  engineSites.length > 0, "no encounter hexes on a freshly generated board");

// Everything the viewer can see, at full sight — the most generous case.
for (const h of Object.values(g.board.hexes)) g.board.hexes[h.id].explored = true;
const view = adaptState(g, "plainers");
const leaked = Object.values(view.hexes).filter((h) => h.type === "encounter");
check("2. no hex reaches the view carrying the encounter type",
  leaked.length === 0, `${leaked.length} leaked: ${leaked.slice(0, 5).map((h) => h.id).join(", ")}`);
check("3. …they arrive as ordinary terrain, indistinguishable from the rest",
  engineSites.every((h) => view.hexes[h.id]?.type === "terrain"),
  JSON.stringify(engineSites.slice(0, 3).map((h) => [h.id, view.hexes[h.id]?.type])));

// The renderers, so a future edit cannot put the mark back by reading a field
// that no longer carries the answer.
for (const f of ["Hex.jsx", "HexTile.jsx", "FlatTileLayer.jsx", "Inspector.jsx"]) {
  const src = readFileSync(new URL(`../src/prototype/${f}`, import.meta.url), "utf8");
  check(`4. ${f} draws nothing from the encounter type`,
    !/type\s*===\s*"encounter"/.test(src), "still branches on it");
}

// And the engine path a Move takes is untouched.
check("5. the engine still distinguishes them, which is what Move reads",
  g.board.hexes[engineSites[0].id].type === "encounter",
  "the engine's own hex type was changed, not just the view");

console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
process.exit(fail ? 1 : 0);
