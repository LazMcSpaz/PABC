// Which sheet does a given unit draw? Exhaustive test of the sprite matrix.
//
// The matrix is sparse and the fallbacks are the part that can quietly go wrong:
// infantry ships all four arrangements, the tier-1 vehicle has no strength
// variant, the tier-2 vehicle has no variants at all, and two chips (Bombard at
// +3 Strength, Landship at +3 Movement) have no model of their own. Every
// combination is enumerated here against every faction, so a missing sheet or a
// bad fallback shows up as a failing row rather than a blank unit on the board.
//
//   node scripts/check-unit-variants.mjs

import { spriteFor, variantFor, unitKeyFor, hasSprite, spriteScale, hitBoxStyle, drawnBox } from "../src/prototype/unitSprites.js";
import { UNIT_UPGRADES, FACTIONS } from "../src/prototype/data.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// The four playable factions, i.e. the ones that need art.
const MAJOR = ["versari", "lakers", "goldgrass", "plainers"];
const unit = (chips, veteran = false) => ({ uid: "u1", owner: "versari", veteran, chips });

console.log("--- every faction has art, under its game faction id ---");
for (const f of MAJOR) {
  check(`${f} has sprites`, hasSprite(f),
    hasSprite(f) ? Object.keys(["infantry", "vehicle_t1", "vehicle_t2"].filter((k) => spriteFor(f, k))).length
      ? ["infantry", "vehicle_t1", "vehicle_t2"].filter((k) => spriteFor(f, k)).join(", ") : "" : "no entry in the manifest");
}
check("faction ids match the game's", MAJOR.every((f) => FACTIONS[f]),
  MAJOR.filter((f) => !FACTIONS[f]).join(", ") || "all four resolve");

console.log("\n--- movement chips choose the model ---");
const MOV_CASES = [
  { chips: [], want: "infantry", why: "no chips" },
  { chips: ["drilledTroops"], want: "infantry", why: "strength only" },
  { chips: ["navigator"], want: "vehicle_t1", why: "+1 movement" },
  { chips: ["troopCarrier"], want: "vehicle_t2", why: "+2 movement" },
  { chips: ["landship"], want: "vehicle_t2", why: "+3, no model — clamps to t2" },
  { chips: ["navigator", "drilledTroops"], want: "vehicle_t1", why: "+1 mov, +1 str" },
  { chips: ["navigator", "navigator"], want: "vehicle_t2", why: "+1 and +1 stack to 2" },
  { chips: ["troopCarrier", "landship"], want: "vehicle_t2", why: "+5 clamps" },
];
for (const c of MOV_CASES) {
  const got = unitKeyFor("versari", unit(c.chips));
  check(`${c.why}: ${c.want}`, got === c.want, got === c.want ? c.chips.join("+") || "none" : `got ${got}`);
}

console.log("\n--- veteran and strength choose the arrangement ---");
// [chips, veteran] -> expected variant, per model.
const VAR_CASES = [
  { chips: [], vet: false, infantry: "std", t1: "std", t2: "base" },
  { chips: [], vet: true, infantry: "vet", t1: "vet", t2: "base" },
  { chips: ["drilledTroops"], vet: false, infantry: "std_str", t1: "std", t2: "base" },
  { chips: ["sharpenedBlades"], vet: false, infantry: "std_str", t1: "std", t2: "base" },
  { chips: ["bombard"], vet: false, infantry: "std_str", t1: "std", t2: "base" },
  { chips: ["drilledTroops"], vet: true, infantry: "vet_str", t1: "vet", t2: "base" },
  { chips: ["bombard"], vet: true, infantry: "vet_str", t1: "vet", t2: "base" },
];
for (const f of MAJOR) {
  for (const c of VAR_CASES) {
    for (const [key, want] of [["infantry", c.infantry], ["vehicle_t1", c.t1], ["vehicle_t2", c.t2]]) {
      const spec = spriteFor(f, key);
      if (!spec) { check(`${f}/${key} exists`, false, "missing"); continue; }
      const got = variantFor(unit(c.chips, c.vet), spec);
      const label = `${f}/${key} ${c.vet ? "vet" : "std"}${c.chips.length ? `+${c.chips[0]}` : ""}`;
      if (got !== want) check(`${label} -> ${want}`, false, `got ${got}`);
    }
  }
}
check("all variant resolutions correct", failures === 0, `${MAJOR.length * VAR_CASES.length * 3} combinations`);

console.log("\n--- the resolved sheet actually exists in the manifest ---");
let missing = 0;
for (const f of MAJOR) {
  for (const c of MOV_CASES) {
    for (const vet of [false, true]) {
      const u = unit(c.chips, vet);
      const spec = spriteFor(f, u);
      const v = variantFor(u, spec);
      if (!spec?.variants?.[v]?.sheet) { missing++; console.log(`    MISSING ${f} ${c.chips.join("+")||"none"} vet=${vet}`); }
    }
  }
}
check("every combination resolves to a real sheet", missing === 0,
  `${MAJOR.length * MOV_CASES.length * 2} combinations checked`);

console.log("\n--- geometry scales with the model, not hardcoded to infantry ---");
for (const f of ["versari"]) {
  const rows = ["infantry", "vehicle_t1", "vehicle_t2"].map((k) => {
    const spec = spriteFor(f, k);
    const hb = hitBoxStyle(spec);
    const db = drawnBox(spec, 0, 0);
    return { k, foot: spec.footprintMetres, cell: spec.frameWidth, hitW: hb.width, boxW: db.x1 - db.x0, below: db.y1 };
  });
  for (const r of rows) {
    console.log(`    ${r.k.padEnd(11)} footprint ${String(r.foot).padStart(4)}m  cell ${r.cell}px  hit ${r.hitW.toFixed(1)}px  below anchor ${r.below.toFixed(1)}px`);
  }
  check("hit box grows with footprint",
    rows[0].hitW < rows[1].hitW && rows[1].hitW < rows[2].hitW,
    rows.map((r) => r.hitW.toFixed(0)).join(" < "));
  check("scale is one figure for every model",
    new Set(["infantry", "vehicle_t1", "vehicle_t2"].map((k) => spriteScale(spriteFor(f, k)).toFixed(6))).size === 1,
    spriteScale(spriteFor(f, "infantry")).toFixed(4));
}

console.log("\n--- chip table sanity ---");
check("movement chips are +1/+2/+3",
  UNIT_UPGRADES.navigator.mov === 1 && UNIT_UPGRADES.troopCarrier.mov === 2 && UNIT_UPGRADES.landship.mov === 3,
  "navigator/troopCarrier/landship");
check("strength chips are +1/+2/+3",
  UNIT_UPGRADES.drilledTroops.str === 1 && UNIT_UPGRADES.sharpenedBlades.str === 2 && UNIT_UPGRADES.bombard.str === 3,
  "drilledTroops/sharpenedBlades/bombard");

console.log(`\n${failures ? `${failures} FAILED` : "all variant tests passed"}`);
process.exit(failures ? 1 : 0);
