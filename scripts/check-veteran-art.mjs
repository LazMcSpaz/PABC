// Old Hands rents veteran status — and the board has to agree with the rules.
//
// `effectiveVeteran` (src/game/stats.js) is the engine's single veteran read:
// the chip carries `veteranEquiv`, and contest bonuses, the Strength cap and the
// heal cap all go through it. The prototype had its own, weaker read — the raw
// `unit.veteran` flag — in two places, so a unit that FOUGHT as a veteran was
// drawn in its non-veteran arrangement and its Reinforce preview quoted the
// non-veteran cap. Both are the same bug: a second definition of a rule.
//
// These drive the real engine rather than restating the rule, so the test fails
// if either definition drifts again.
//
//   node scripts/check-veteran-art.mjs

import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { effectiveVeteran } from "../src/game/stats.js";
import { CONFIG } from "../src/game/config.js";
import { adaptState, reinforcePreview } from "../src/prototype/engineAdapter.js";
import { spriteFor, variantFor } from "../src/prototype/unitSprites.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fresh() {
  const g = createGame({ seed: 424242, factionIds: ["versari", "lakers", "goldgrass", "plainers"] });
  startTurn(g);
  return g;
}

// The variant the board would draw for the adapter's view of `uid`.
function drawnVariant(state, uid) {
  const u = adaptState(state).units[uid];
  if (!u) return null;
  const spec = spriteFor(u.owner, u);
  return spec ? variantFor(u, spec) : null;
}

const g = fresh();
const anyUnit = Object.values(g.units).find((u) => u.owner === "versari" && !u.veteran);

console.log("--- baseline: an ordinary unit draws the standard cut ---");
check("not a veteran to the rules", !effectiveVeteran(g, anyUnit));
check("draws std", drawnVariant(g, anyUnit.uid) === "std", drawnVariant(g, anyUnit.uid));

console.log("\n--- Old Hands: the rules promote it, so the board must too ---");
applyEffect(g, { type: "GRANT_CHIP", chipId: "old-hands" }, { sourceUnit: anyUnit.uid });
check("chip installed",
  anyUnit.chips.some((c) => g.chips[c]?.chipId === "old-hands"));
check("counts as a veteran to the rules", effectiveVeteran(g, anyUnit));
check("adapter reports it as a veteran", adaptState(g).units[anyUnit.uid].veteran === true);
check("draws the veteran cut", drawnVariant(g, anyUnit.uid) === "vet", drawnVariant(g, anyUnit.uid));

console.log("\n--- and the Reinforce preview quotes the veteran cap ---");
// Erode the unit so there is a deficit to quote at all.
anyUnit.baseStrength = 1;
const cap = CONFIG.unit.veteranStrengthCap;
const preview = reinforcePreview(g, anyUnit.uid);
check(`deficit is against the veteran cap (${cap})`, preview.deficit === cap - 1,
  `deficit ${preview.deficit}, expected ${cap - 1}`);
check("cost follows the same deficit",
  preview.cost === CONFIG.heal.scrapPerStrength * preview.deficit,
  `${preview.cost} scrap`);

console.log("\n--- a disabled chip rents nothing ---");
// effectiveVeteran ignores a disabled chip, so the board has to as well, or an
// unpaid unit keeps a promotion it no longer has.
const chipUid = anyUnit.chips.find((c) => g.chips[c]?.chipId === "old-hands");
g.chips[chipUid].disabled = true;
check("not a veteran to the rules once disabled", !effectiveVeteran(g, anyUnit));
check("adapter agrees", adaptState(g).units[anyUnit.uid].veteran === false);
check("draws std again", drawnVariant(g, anyUnit.uid) === "std", drawnVariant(g, anyUnit.uid));

console.log(failures ? `\n${failures} failure(s)` : "\nveteran art OK");
process.exit(failures ? 1 : 0);
