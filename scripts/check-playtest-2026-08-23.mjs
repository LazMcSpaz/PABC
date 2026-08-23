// Three fixes from the 2026-08-23 playtest.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { performAction } from "../src/game/actions.js";
import { meetsTech, techReqFor, techLevelReqFor } from "../src/game/economy.js";
import { CHIPS, MINOR_FACTIONS } from "../src/game/content.js";
import { adaptState } from "../src/prototype/engineAdapter.js";
import { dominionStanding } from "../src/game/diplomacy.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

// --- 1. reinforcing spends the reinforced unit's action -----------------
{
  const g = createGame({ seed: 1126, humanFactionId: "versari" });
  startTurn(g);
  const pid = g.turnOrder[g.activeIndex];
  const loc = Object.values(g.locations).find((l) => l.controller === pid);
  const unit = Object.values(g.units).find((u) => u.owner === pid);
  unit.node = loc.hexId;
  unit.baseStrength = 2; unit.strength = 2;      // something to top up
  unit.actionsRemaining = 1; loc.actionsRemaining = 1;
  g.players[pid].resource = 50;

  const r = performAction(g, "reinforce", { unit: unit.uid, mode: "instant" });
  check("1. reinforcing works", r.ok, r.reason);
  check("2. …and costs the reinforced unit its action",
    unit.actionsRemaining === 0, `unit has ${unit.actionsRemaining} left`);
  check("3. …so it cannot be topped up and still attack the same turn",
    !performAction(g, "contest", { unit: unit.uid, coalition: [] }).ok,
    "a reinforced unit still acted");
}

// --- 2. the Advanced Lab unlocks at Tech Level 2 ------------------------
{
  const lab = CHIPS["advanced-lab"];
  check("4. the Advanced Lab asks for Tech Level 2", techReqFor(lab) === 2, `asks for ${techReqFor(lab)}`);
  check("5. a Tech Level 2 player may build it", meetsTech({ techLevel: 2 }, lab), "still gated");
  check("6. a Tech Level 1 player may not", !meetsTech({ techLevel: 1 }, lab), "gate is gone entirely");
  // The tier mapping is untouched — this is one chip's override, not a
  // sweeping change to every tier-2 building.
  check("7. the tier gate itself is unchanged (tier 2 still means L3)",
    techLevelReqFor(2) === 3, `tier 2 now maps to ${techLevelReqFor(2)}`);
  const others = Object.values(CHIPS).filter((c) => (c.techLevel || 1) === 2 && c.id !== "advanced-lab");
  check(`8. …so other tier-2 chips still need L3 (${others.length} of them)`,
    others.every((c) => techReqFor(c) === 3),
    others.filter((c) => techReqFor(c) !== 3).map((c) => c.id).join(", "));
}

// --- 3. the victory checklist and its count agree ----------------------
{
  // Seeded WITH minors: they are the half of the condition the screen made
  // look untrue, so a fixture without them would assert nothing.
  const g = createGame({ seed: 1126, humanFactionId: "versari",
                         minors: ["tempest", "steeltraders"] });
  startTurn(g);
  const victim = "steeltraders";          // the faction destroyed in the playtest
  g.players[victim].eliminated = true;

  const view = adaptState(g, "versari");
  const rec = view.diplomacy.recognition;
  const st = dominionStanding(g, "versari");

  check("9. a destroyed faction leaves the victory checklist",
    !rec.backing.some((b) => b.id === victim),
    `${victim} is still listed as something to deal with`);
  check("10. the checklist has exactly one row per faction the count counts",
    rec.backing.length === rec.threshold && rec.threshold === st.others.length,
    `${rec.backing.length} rows vs a threshold of ${rec.threshold}`);
  check("11. …and the rows marked dealt-with match the score exactly",
    rec.backing.filter((b) => b.status === "backs").length === rec.score,
    `${rec.backing.filter((b) => b.status === "backs").length} rows say dealt with, score says ${rec.score}`);

  // Minors are in the count — the thing the screen made look untrue.
  const minors = g.turnOrder.filter((f) => MINOR_FACTIONS[f] && !g.players[f].eliminated);
  check(`13. minor factions count toward the condition (${minors.length} alive: ${minors.join(", ")})`,
    minors.length > 0 && minors.every((m) => rec.backing.some((b) => b.id === m)),
    minors.length ? "a minor is missing from the checklist" : "the fixture seeded no minors");
  check("14. …and are inside the threshold the header shows",
    rec.threshold === g.turnOrder.filter((f) => f !== "versari" && !g.players[f].eliminated).length,
    `threshold ${rec.threshold} vs ${g.turnOrder.filter((f) => f !== "versari" && !g.players[f].eliminated).length} living rivals`);

  // And a destroyed faction is not rendered as a live power.
  const row = view.diplomacy.factions.find((f) => f.id === victim);
  check("15. a destroyed faction is flagged as gone in the powers list",
    row && row.eliminated === true, JSON.stringify(row && { id: row.id, eliminated: row.eliminated }));
  check("16. …while living rivals are not",
    view.diplomacy.factions.filter((f) => f.id !== victim).every((f) => !f.eliminated),
    "a living faction is flagged eliminated");
}

console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
process.exit(fail ? 1 : 0);
