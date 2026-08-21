// One blockade per road, so a hex holds as many as it has roads.
//
// A tile the road runs straight through takes two; a T-junction takes three; a
// dead-end takes one. The cap is not a number — it is the shape of the road
// network at that hex, which is the only rule that makes sense when what you
// are closing IS a road.
//
//   node scripts/check-blockade-capacity.mjs

import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import {
  startBlockade, blockadesOn, blockadeAt, blockadeCapacity, roadEdgesOf,
  freeRoadEdges, destroyBlockade, activeBlockadesOn, blockadeKey, supplyEdgeFor,
} from "../src/game/blockades.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fresh() {
  const g = createGame({ seed: 424242, factionIds: ["versari", "lakers", "goldgrass", "plainers"] });
  startTurn(g);
  g.world.blockades = g.world.blockades || {};
  return g;
}

// Build a synthetic road shape on the board so every case is covered, rather
// than hoping a seed happens to produce a T-junction.
function shapeRoads(g, hub, arms) {
  for (const h of Object.values(g.board.hexes)) h.road = false;
  g.board.hexes[hub].road = true;
  const nbs = (g.board.adjacency[hub] || []).slice(0, arms);
  for (const n of nbs) g.board.hexes[n].road = true;
  return nbs;
}

const g0 = fresh();
const hub = Object.keys(g0.board.hexes).find((h) => (g0.board.adjacency[h] || []).length >= 3);
check("found a hex with at least three neighbours", !!hub, hub);

console.log("\n--- capacity follows the roads ---");
for (const [arms, label] of [[1, "dead end"], [2, "road straight through"], [3, "T-junction"]]) {
  const g = fresh();
  shapeRoads(g, hub, arms);
  check(`${label}: capacity ${arms}`, blockadeCapacity(g, hub) === arms,
    `${blockadeCapacity(g, hub)} (roads: ${roadEdgesOf(g, hub).join(", ")})`);
}

console.log("\n--- filling a junction ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  for (let i = 0; i < 3; i++) {
    const free = freeRoadEdges(g, hub);
    check(`${i} built: ${3 - i} road(s) still free`, free.length === 3 - i, free.join(", "));
    startBlockade(g, "versari", hub, "u1", free[0]);
  }
  check("three blockades stand on one hex", blockadesOn(g, hub).length === 3,
    `${blockadesOn(g, hub).length}`);
  check("no road is left open", freeRoadEdges(g, hub).length === 0);
  check("each sits on a different road",
    new Set(blockadesOn(g, hub).map((b) => b.edge)).size === 3,
    blockadesOn(g, hub).map((b) => b.edge).join(", "));
  check("every one is on a real road",
    blockadesOn(g, hub).every((b) => arms.includes(b.edge)));
}

console.log("\n--- two roads means two, not three ---");
{
  const g = fresh();
  shapeRoads(g, hub, 2);
  startBlockade(g, "versari", hub, "u1");
  startBlockade(g, "versari", hub, "u1");
  check("both roads take one", blockadesOn(g, hub).length === 2);
  check("there is no third road to close", freeRoadEdges(g, hub).length === 0,
    "capacity is the road count, not a fixed number");
}

console.log("\n--- the action layer refuses an over-build ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 2);
  // Drive validate directly: the Build action also wants supply, a crew and
  // scrap, and none of that is what this test is about.
  const { ACTIONS } = await import("../src/game/actions.js");
  const validate = ACTIONS["build-blockade"].validate;
  const ctx = { pid: "versari", player: g.players.versari, params: { hex: hub } };
  for (const e of arms) startBlockade(g, "versari", hub, "u1", e);
  const full = validate(g, ctx);
  check("a fully blockaded hex is refused", !full.ok, full.reason);
  check("and says the roads are all closed", /road/.test(full.reason || ""), full.reason);

  const g2 = fresh();
  const arms2 = shapeRoads(g2, hub, 3);
  startBlockade(g2, "versari", hub, "u1", arms2[0]);
  const dup = validate(g2, { ...ctx, params: { hex: hub, edge: arms2[0] } });
  check("naming a road that is already closed is refused", !dup.ok, dup.reason);
  const bogus = validate(g2, { ...ctx, params: { hex: hub, edge: "nowhere" } });
  check("naming a road that does not exist is refused", !bogus.ok, bogus.reason);
}

console.log("\n--- reading them back ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  for (const e of arms) startBlockade(g, "versari", hub, "u1", e);
  check("blockadeAt(hex) still answers with one", !!blockadeAt(g, hub),
    "the many callers that only ask whether the tile is held keep working");
  check("blockadeAt(hex, edge) picks the right one",
    blockadeAt(g, hub, arms[1])?.edge === arms[1], arms[1]);
  check("construction sites are not active yet", activeBlockadesOn(g, hub).length === 0);
  for (const b of blockadesOn(g, hub)) { b.done = true; }
  check("finished ones are active", activeBlockadesOn(g, hub).length === 3);
}

console.log("\n--- destroying one leaves the others ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  for (const e of arms) startBlockade(g, "versari", hub, "u1", e);
  const gone = destroyBlockade(g, hub, "lakers", arms[1]);
  check("the named blockade is removed", gone?.edge === arms[1], gone?.edge);
  check("the other two still stand", blockadesOn(g, hub).length === 2,
    blockadesOn(g, hub).map((b) => b.edge).join(", "));
  check("its road is free again", freeRoadEdges(g, hub).includes(arms[1]));
  // And the no-edge form, which is what a contest on the hex uses.
  destroyBlockade(g, hub, "lakers");
  check("destroying without an edge takes one, not all", blockadesOn(g, hub).length === 1,
    "a contest brings down one barricade");
}

console.log("\n--- keys stay unique ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  for (const e of arms) startBlockade(g, "versari", hub, "u1", e);
  const keys = Object.keys(g.world.blockades);
  check("one record per road", keys.length === 3, keys.join(" "));
  check("keys are hex|edge", keys.every((k) => k === blockadeKey(hub, k.split("|")[1])));
}

console.log("\n--- a blockade stands on the road facing home ---");
// You barricade the near side of the tile. Anywhere else and a rival can build
// on the same hex BETWEEN your barricade and your own settlement, sitting on
// the supply line behind the thing you built to protect it.
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  // Put a settlement one step down each arm in turn and check the blockade
  // follows it. Only the road toward home should ever be chosen.
  for (const home of arms) {
    for (const k of Object.keys(g.world.blockades)) delete g.world.blockades[k];
    for (const l of Object.values(g.locations)) l.controller = null;
    g.locations[home] = g.locations[home]
      || { hexId: home, controller: null, chips: [], sections: [] };
    g.locations[home].controller = "versari";
    check(`settlement toward ${home}: blockade takes that road`,
      supplyEdgeFor(g, "versari", hub) === home,
      supplyEdgeFor(g, "versari", hub));
    const b = startBlockade(g, "versari", hub, "u1");
    check(`  and startBlockade records it`, b.edge === home, b.edge);
  }
}

console.log("\n--- two factions cannot wedge in behind each other ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  for (const l of Object.values(g.locations)) l.controller = null;
  // Homes in opposite directions.
  for (const [hex, who] of [[arms[0], "versari"], [arms[1], "lakers"]]) {
    g.locations[hex] = g.locations[hex] || { hexId: hex, controller: null, chips: [], sections: [] };
    g.locations[hex].controller = who;
  }
  const mine = startBlockade(g, "versari", hub, "u1");
  const theirs = startBlockade(g, "lakers", hub, "u2");
  check("each faces its own settlement",
    mine.edge === arms[0] && theirs.edge === arms[1],
    `versari -> ${mine.edge}, lakers -> ${theirs.edge}`);
  check("neither sits on the other's road home", mine.edge !== theirs.edge,
    "no barricade lands between a rival's blockade and its settlement");
}

console.log("\n--- the home road being taken does not block the build ---");
{
  const g = fresh();
  const arms = shapeRoads(g, hub, 3);
  for (const l of Object.values(g.locations)) l.controller = null;
  g.locations[arms[0]] = g.locations[arms[0]]
    || { hexId: arms[0], controller: null, chips: [], sections: [] };
  g.locations[arms[0]].controller = "versari";
  startBlockade(g, "lakers", hub, "u2", arms[0]); // a rival got there first
  const b = startBlockade(g, "versari", hub, "u1");
  check("falls back to a free road", b.edge && b.edge !== arms[0], b.edge);
  check("and it is a real road", arms.includes(b.edge));
}

console.log(`\n${failures ? `${failures} FAILED` : "all blockade-capacity tests passed"}`);
process.exit(failures ? 1 : 0);
