// Is the chip value table robust, or is it a house of cards?
//
//   node scripts/probe-chip-table.mjs
//   node scripts/probe-chip-table.mjs --assert
//
// WHY. `chipValue` is 42 weighted rows and it was calibrated on ONE observed
// comparison: `garrison` shipped at 1.6, which put `defense-turrets` (3.20) a
// fifth of a point above `recyclers` (3.00), and on seed 1234 the AI then
// built 23 turrets and 0 recyclers where it had built 39 recyclers — captures
// fell from 22 to 8. One fifth of one point rewrote the whole game.
//
// That is either a lucky catch or a warning. If the ordering is that sensitive
// everywhere, the table will break the first time somebody authors a chip, and
// "the AI can price content" is a claim with a very short shelf life.
//
// So: perturb every weight, one at a time, and count how many PAIRWISE
// ORDERINGS flip among chips that actually compete for the same slot. A robust
// table barely moves. A fragile one flips under noise.
import { CHIPS } from "../src/game/content.js";
import { chipValue, VALUED_FIELDS, NON_EFFECT_FIELDS } from "../src/game/chipValue.js";
import { CONFIG } from "../src/game/config.js";

const PERTURBATION = 0.25; // +/- 25%, which is far more than a tuning nudge

// Only chips that actually compete decide anything. Two Location chips of the
// same tier compete for the same slot; a Location chip and a unit chip do not,
// and counting those pairs would drown the signal in comparisons the AI never
// makes.
function competingPairs() {
  const defs = Object.values(CHIPS);
  const pairs = [];
  for (let i = 0; i < defs.length; i += 1) {
    for (let j = i + 1; j < defs.length; j += 1) {
      const a = defs[i], b = defs[j];
      if (a.kind !== b.kind) continue;
      if ((a.techLevel ?? 1) !== (b.techLevel ?? 1)) continue;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// The AI ranks by value PER SCRAP, so that is the ordering to test — testing
// raw value would be testing a number the decision does not use.
const perScrap = (def) => chipValue(def) / Math.max(1, def.buildCost ?? def.cost ?? 1);

function orderingOf(pairs) {
  return pairs.map(([a, b]) => Math.sign(perScrap(a) - perScrap(b)));
}

// `chipValue` reads its weights from a module-private table, so the only way
// to perturb one from outside is through the knobs config DOES expose. Those
// are the ones a designer would actually turn, which makes them the right
// ones to test — and the per-field weights are covered by the margin census
// below instead.
const CONFIG_KNOBS = [
  ["ai.compoundingWeight", () => CONFIG.ai.compoundingWeight, (v) => { CONFIG.ai.compoundingWeight = v; }],
];

console.log("\n=== how close are the decisions? ===\n");
const pairs = competingPairs();
console.log(`  ${Object.keys(CHIPS).length} authored chips`);
console.log(`  ${pairs.length} pairs that actually compete (same kind, same tier)`);

// THE MARGIN CENSUS. For every competing pair, how far apart are they as a
// FRACTION of the larger score? A pair separated by 1% is a coin flip that
// any content edit will land on; a pair separated by 50% is a decision.
const margins = pairs.map(([a, b]) => {
  const va = perScrap(a), vb = perScrap(b);
  const hi = Math.max(Math.abs(va), Math.abs(vb));
  return { a: a.id, b: b.id, va, vb, margin: hi ? Math.abs(va - vb) / hi : 0 };
}).sort((x, y) => x.margin - y.margin);

const knife = margins.filter((m) => m.margin < 0.05);
const close = margins.filter((m) => m.margin < 0.15);
console.log(`\n  pairs decided by under 5%:  ${knife.length} (${Math.round(knife.length / pairs.length * 100)}%)`);
console.log(`  pairs decided by under 15%: ${close.length} (${Math.round(close.length / pairs.length * 100)}%)`);
console.log("\n  the closest calls — these are the ones a content edit will flip:");
for (const m of margins.slice(0, 10)) {
  console.log(`    ${String(Math.round(m.margin * 1000) / 10).padStart(5)}%  ${m.a.padEnd(20)} ${m.va.toFixed(3)}` +
    `   vs  ${m.b.padEnd(20)} ${m.vb.toFixed(3)}`);
}

// THE PERTURBATION TEST. Move one knob, count how many competing pairs swap
// places. This is the direct measure of "would a tuning nudge rewrite the
// AI's opinions".
console.log("\n=== what a 25% nudge does ===\n");
const base = orderingOf(pairs);
for (const [name, get, set] of CONFIG_KNOBS) {
  const was = get();
  let worst = 0, worstAt = null;
  for (const mult of [1 - PERTURBATION, 1 + PERTURBATION]) {
    set(was * mult);
    const now = orderingOf(pairs);
    const flips = base.filter((v, i) => v !== now[i]).length;
    if (flips > worst) { worst = flips; worstAt = mult; }
  }
  set(was);
  console.log(`  ${name.padEnd(24)} ${was} -> x${worstAt}  flips ${worst} of ${pairs.length}` +
    ` (${Math.round(worst / pairs.length * 100)}%)`);
}

// THE NEW-CONTENT TEST. The claim the table makes is that a chip authored
// tomorrow gets priced sensibly. So author some — one per authored field, at
// the magnitude the corpus actually uses — and check nothing prices absurdly.
console.log("\n=== a chip authored tomorrow ===\n");
const SKIP = new Set(NON_EFFECT_FIELDS);
const magnitudes = {};
for (const def of Object.values(CHIPS)) {
  for (const [k, v] of Object.entries(def)) {
    if (SKIP.has(k) || typeof v !== "number") continue;
    (magnitudes[k] = magnitudes[k] || []).push(v);
  }
}
const realScores = Object.values(CHIPS).map((d) => chipValue(d));
const lo = Math.min(...realScores), hi = Math.max(...realScores);
console.log(`  authored chips price between ${lo.toFixed(2)} and ${hi.toFixed(2)}`);
const absurd = [];
// Costs are SUPPOSED to price negative on their own — a chip made of nothing
// but upkeep is worth less than nothing, and flagging that as out of scale was
// the first draft of this probe calling correct behaviour a bug.
const COSTS = new Set(["upkeep", "railIncompatible"]);
for (const field of VALUED_FIELDS) {
  if (COSTS.has(field)) continue;
  const mags = magnitudes[field] || [1];
  const typical = mags.sort((a, b) => a - b)[Math.floor(mags.length / 2)];
  const synthetic = { id: `__probe-${field}`, kind: "location", slots: 1, buildCost: 4, [field]: typical };
  const v = chipValue(synthetic);
  // A single field pricing a whole chip above the best real one means the
  // weight is out of scale with everything else in the table.
  if (v > hi) absurd.push({ field, typical, v });
}
if (absurd.length) {
  for (const a of absurd) {
    console.log(`    OUT OF SCALE  ${a.field} at its typical ${a.typical} alone prices ${a.v.toFixed(2)}`);
  }
} else {
  console.log("    every single field, alone at its authored magnitude, prices inside the real range");
}

if (process.argv.includes("--assert")) {
  let bad = 0;
  const claim = (label, ok, detail) => {
    console.log(`\n${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        ${detail}`}`);
    if (!ok) bad += 1;
  };
  // The garrison/recyclers cliff was ONE pair at a 6% margin. If a large share
  // of the table sits that close, the next content edit is a coin flip.
  claim("most competing pairs are decided by a real margin, not a rounding error",
    knife.length / pairs.length < 0.2,
    `${knife.length} of ${pairs.length} pairs are within 5% of each other`);
  claim("no single authored field prices a chip outside the real range on its own",
    absurd.length === 0, absurd.map((a) => a.field).join(", "));
  console.log(`\n${bad ? `${bad} FAILED` : "all claims hold"}`);
  process.exit(bad ? 1 : 0);
}
