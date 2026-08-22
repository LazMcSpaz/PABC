
// Capital rebuild: a catastrophe, not an amputation.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { performAction } from "../src/game/actions.js";
import { buildableChips, hasCapital, canRebuildCapital } from "../src/game/economy.js";
import { CAPITAL } from "../src/game/content.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };
const P = "versari";
const g = createGame({ seed: 1100, humanFactionId: P });
startTurn(g);
const mine = Object.values(g.locations).filter((l) => l.controller === P);
const cap = mine.find((l) => (l.chips || []).some((c) => g.chips[c]?.chipId === "capital"));
// A second city that is nobody's capital — grabbing another faction's seat
// would leave the test subject holding two, which is not the case under test.
const isCapital = (l) => (l.chips || []).some((c) => g.chips[c]?.chipId === "capital");
const other = mine.find((l) => l !== cap && !isCapital(l))
  || Object.values(g.locations).find((l) => l !== cap && !isCapital(l));
other.controller = P;
other.sections = other.sections.map(() => P);

check("1. a faction that holds its capital cannot build another",
  hasCapital(g, P) && !canRebuildCapital(g, other)
  && !buildableChips(g, other).some((o) => o.chipId === CAPITAL.id),
  "capital offered while one is still held");
const blocked = performAction(g, "build", { at: other.hexId, chipId: "capital" });
check("1b. …and the action refuses it, not just the menu",
  !blocked.ok && /already hold a capital/.test(blocked.reason || ""), JSON.stringify(blocked));

// lose the seat, the way capture does: the chip is destroyed
for (const c of [...cap.chips]) if (g.chips[c]?.chipId === "capital") {
  cap.chips = cap.chips.filter((x) => x !== c); delete g.chips[c];
}
check("2. with no capital anywhere, the rebuild becomes available",
  !hasCapital(g, P) && canRebuildCapital(g, other)
  && buildableChips(g, other).some((o) => o.chipId === CAPITAL.id),
  `hasCapital=${hasCapital(g, P)} canRebuild=${canRebuildCapital(g, other)} ` +
  `otherController=${other.controller} offered=${JSON.stringify(buildableChips(g, other).map(o=>o.chipId).slice(0,6))}`);

const offer = buildableChips(g, other).find((o) => o.chipId === CAPITAL.id);
check("3. it is priced at the top of the build table, and not tech- or loyalty-locked",
  offer.def.buildCost === 12 && offer.def.techLevel === 1 && offer.def.loyaltyReq === 0
  && offer.locked === false,
  `cost ${offer.def.buildCost}, tech ${offer.def.techLevel}, locked ${offer.locked}`);

const started = performAction(g, "build", { at: other.hexId, chipId: "capital" });
check("4. the build starts and is charged the full price",
  started.ok && other.activeBuild?.chipId === "capital" && other.activeBuild.cost === 12,
  JSON.stringify(started) + " " + JSON.stringify(other.activeBuild));

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
