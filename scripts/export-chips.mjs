// Regenerate content/upgrade-chips.csv as a MIRROR of the live registry
// (src/game/content.js CHIPS + CHIP_SKINS). The engine never reads this
// file — content.js is the single source of truth (docs/chip-set-v0.1.md);
// this export exists so anyone browsing content/ sees the real chip set.
// Run: node scripts/export-chips.mjs
import { writeFileSync } from "node:fs";
import { CHIPS, CHIP_SKINS, ABILITIES } from "../src/game/content.js";

const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const header = [
  "Chip ID", "Name", "Kind", "Stat Type", "Slots", "Tech Level", "Cost",
  "Upkeep", "Loyalty Req", "Upgrades To", "Faction", "Effect",
  "Versari Name", "Goldgrass Name", "Lakers Name", "Plainers Name",
];

const rows = Object.values(CHIPS).map((c) => {
  const skin = CHIP_SKINS[c.id] || {};
  return [
    c.id, c.name, c.kind, c.statType || "", c.slots || 1, c.techLevel || 1,
    c.cost ?? "", c.upkeep || "", c.loyaltyReq || 0, c.upgradesTo || "",
    c.faction || "", c.desc || "",
    skin.versari || "", skin.goldgrass || "", skin.lakers || "", skin.plainers || "",
  ].map(esc).join(",");
});

const out = [
  "# GENERATED from src/game/content.js — do not hand-edit; run scripts/export-chips.mjs",
  header.join(","),
  ...rows,
].join("\n") + "\n";

writeFileSync(new URL("../content/upgrade-chips.csv", import.meta.url), out);
console.log(`wrote content/upgrade-chips.csv (${rows.length} chips)`);

// --- location abilities mirror ---------------------------------------
const abilityHeader = ["Ability ID", "Name", "Eligible Tier", "Effect"];
const describe = (a) => {
  const parts = [];
  for (const pv of a.passives || []) {
    if (pv.type === "SUPPRESS_CHIP_BONUSES") parts.push("Passive: attacking units get no chip Strength in contests here.");
    if (pv.type === "INFLUENCE_RANGE") parts.push(`Passive: +${pv.amount} Influence range for this location.`);
    if (pv.type === "HEAL_HERE") parts.push(`Passive: units standing here (any owner) heal +${pv.amount} at Upkeep.`);
    if (pv.type === "MOVE_TAX") parts.push(`Passive: enemies pay +${pv.amount} movement entering this location's hex or its ring.`);
  }
  for (const opt of a.activated || []) {
    const cost = [];
    if (opt.cost?.action) cost.push(`${opt.cost.action} Action`);
    if (opt.cost?.resource) cost.push(`${opt.cost.resource} Scrap`);
    const once = opt.oncePerGame ? ", once per game" : "";
    const eff = (opt.effects || []).map((e) => e.type).join(", ");
    parts.push(`Activated (${cost.join(" + ") || "free"}${once}): ${eff}.`);
  }
  return parts.join(" ");
};
const abilityRows = Object.values(ABILITIES).map((a) =>
  [a.id, a.name, a.eligibleTier, describe(a)].map(esc).join(","));
const abilityOut = [
  "# GENERATED from src/game/content.js — do not hand-edit; run scripts/export-chips.mjs",
  abilityHeader.join(","),
  ...abilityRows,
].join("\n") + "\n";
writeFileSync(new URL("../content/location-abilities.csv", import.meta.url), abilityOut);
console.log(`wrote content/location-abilities.csv (${abilityRows.length} abilities)`);
