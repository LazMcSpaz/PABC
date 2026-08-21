import manifest from "./src/prototype/unitSprites.json" with { type: "json" };
const MOVEMENT_TIERS = ["infantry", "vehicle_t1", "vehicle_t2"];
function unitKeyFor(faction, mov) {
  const have = manifest.units?.[faction];
  if (!have) return null;
  const want = Math.min(mov, MOVEMENT_TIERS.length - 1);
  for (let i = want; i >= 0; i--) if (have[MOVEMENT_TIERS[i]]) return MOVEMENT_TIERS[i];
  return Object.keys(have)[0] || null;
}
for (const f of ["tempest","dambarans","croppers","steeltraders","lakers"]) {
  const r = [0,1,3].map(m => `mov+${m} -> ${unitKeyFor(f,m)}`).join("   ");
  console.log(`  ${f.padEnd(13)} ${r}`);
}
console.log("  unknown faction ->", unitKeyFor("nope",3));
