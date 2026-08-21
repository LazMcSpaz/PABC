// Which sheet does a given unit draw? Exhaustive test of the sprite matrix.
//
// The matrix is sparse and the fallbacks are the part that can quietly go wrong.
// Infantry ships five cuts, the tier-1 vehicle has no strength variant, the
// tier-2 vehicle and the landship have none at all, and the minor factions ship
// infantry only — so a chipped minor unit has to fall all the way back to the
// foot model rather than to nothing. Two chips (Bombard, Landship) fill both
// bays and override rather than accumulate. Every combination is enumerated
// here against every faction, so a missing sheet or a bad fallback shows up as
// a failing row rather than a blank unit on the board.
//
//   node scripts/check-unit-variants.mjs

import { spriteFor, variantFor, unitKeyFor, hasSprite, spriteScale, hitBoxStyle, drawnBox, structureFor } from "../src/prototype/unitSprites.js";
import { UNIT_UPGRADES, FACTIONS } from "../src/prototype/data.js";
import { engineChipIdToUi } from "../src/prototype/engineAdapter.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// The four playable factions, i.e. the ones with the full model range.
const MAJOR = ["versari", "lakers", "goldgrass", "plainers"];
// Minors fight too, and now ship infantry of their own.
const MINOR = ["tempest", "croppers", "steeltraders", "dambarans"];
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
  { chips: ["landship"], want: "landship", why: "its own hull" },
  { chips: ["navigator", "drilledTroops"], want: "vehicle_t1", why: "+1 mov, +1 str" },
  { chips: ["navigator", "navigator"], want: "vehicle_t2", why: "+1 and +1 stack to 2" },
  { chips: ["bombard"], want: "infantry", why: "a siege piece, still on foot" },
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
  { chips: ["bombard"], vet: false, infantry: "bombard", t1: "std", t2: "base" },
  { chips: ["drilledTroops"], vet: true, infantry: "vet_str", t1: "vet", t2: "base" },
  // Bombard beats promotion: the siege silhouette is the readable thing, and
  // there is no veteran cut of it. The vehicles have no bombard cut at all.
  { chips: ["bombard"], vet: true, infantry: "bombard", t1: "vet", t2: "base" },
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

console.log("\n--- engine chip ids survive the trip to the UI table ---");
// The engine names chips in kebab-case and the UI table is camelCase, so every
// installed chip passes through engineChipIdToUi before the sprite code sees it.
// If that mapping ever loses one, the symptom is silent and confusing: the unit
// panel still shows the chip and the stat still applies (both read the engine),
// but the sprite never promotes. Assert the round trip for all six unit chips.
for (const [engineId, wantStr, wantMov] of [
  ["navigator", 0, 1],
  ["troop-carrier", 0, 2],
  ["landship", 0, 3],
  ["drilled-troops", 1, 0],
  ["sharpened-blades", 2, 0],
  ["bombard", 3, 0],
]) {
  const uiId = engineChipIdToUi(engineId);
  const def = UNIT_UPGRADES[uiId];
  check(`${engineId} -> ${uiId}`,
    !!def && (def.str || 0) === wantStr && (def.mov || 0) === wantMov,
    def ? `str=${def.str} mov=${def.mov}` : "not in UNIT_UPGRADES — sprite would never promote");
}
// And end to end: an engine-named movement chip must reach the vehicle sheet.
{
  const u = { uid: "e2e", owner: "versari", veteran: false, chips: [engineChipIdToUi("navigator")] };
  check("engine 'navigator' promotes to vehicle_t1", unitKeyFor("versari", u) === "vehicle_t1",
    `${unitKeyFor("versari", u)} / ${variantFor(u, spriteFor("versari", u))}`);
}

console.log("\n--- minor factions ---");
for (const f of MINOR) {
  check(`${f} has infantry`, !!spriteFor(f, "infantry"), hasSprite(f) ? "yes" : "NO ART");
  // They ship no vehicles, so every chip has to land back on the foot model
  // rather than on nothing — or a chipped minor unit would vanish.
  const worst = { uid: "m", owner: f, veteran: true, chips: ["landship"] };
  check(`${f}: a landship chip still resolves`, !!spriteFor(f, worst),
    `${unitKeyFor(f, worst)} / ${variantFor(worst, spriteFor(f, worst))}`);
  check(`${f} has the bombard cut`, !!spriteFor(f, "infantry")?.variants?.bombard);
}

console.log("\n--- the two-slot chips override rather than accumulate ---");
// Bombard and Landship each fill both bays, so they can never combine with
// another upgrade. That is what lets them be read as a plain override.
for (const f of MAJOR) {
  for (const vet of [false, true]) {
    const bomb = { uid: "b", owner: f, veteran: vet, chips: ["bombard"] };
    check(`${f}: bombard${vet ? " + veteran" : ""} -> infantry/bombard`,
      unitKeyFor(f, bomb) === "infantry" && variantFor(bomb, spriteFor(f, bomb)) === "bombard",
      `${unitKeyFor(f, bomb)}/${variantFor(bomb, spriteFor(f, bomb))}`);
    const ship = { uid: "l", owner: f, veteran: vet, chips: ["landship"] };
    check(`${f}: landship${vet ? " + veteran" : ""} -> landship`,
      unitKeyFor(f, ship) === "landship", unitKeyFor(f, ship));
  }
}

console.log("\n--- tollbooths are blockade art, never a unit ---");
for (const f of MAJOR) {
  check(`${f} has a tollbooth`, !!structureFor(f, "tollbooth"));
  check(`${f}: tollbooth is not reachable as a unit model`,
    !["infantry", "vehicle_t1", "vehicle_t2", "landship"].includes("tollbooth")
    && !structureFor(f, "infantry"),
    "structureFor rejects unit keys");
}
// No chip combination may ever select it.
{
  const chipIds = Object.keys(UNIT_UPGRADES);
  let hit = null;
  for (const a of chipIds) for (const b of chipIds) {
    const u = { uid: "x", owner: "versari", veteran: false, chips: [a, b] };
    if (unitKeyFor("versari", u) === "tollbooth") hit = `${a}+${b}`;
  }
  check("no chip pair selects a tollbooth", hit === null, hit || `${chipIds.length ** 2} pairs checked`);
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
