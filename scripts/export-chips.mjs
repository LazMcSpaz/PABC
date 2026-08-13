// Regenerate content/upgrade-chips.csv as a MIRROR of the live registry
// (src/game/content.js CHIPS + CHIP_SKINS). The engine never reads this
// file — content.js is the single source of truth (docs/chip-set-v0.1.md);
// this export exists so anyone browsing content/ sees the real chip set.
// Run: node scripts/export-chips.mjs
import { writeFileSync } from "node:fs";
import { CHIPS, CHIP_SKINS } from "../src/game/content.js";

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
