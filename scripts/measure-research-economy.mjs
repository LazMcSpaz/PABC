// Where research actually comes from, and how far up the tech ladder it gets
// anybody.
//
// Re-run this after any change to encounter content or to
// CONFIG.tech.researchThresholds. The baseline it is meant to be compared
// against — taken 2026-08-21, immediately BEFORE a batch of authored encounters
// was wired in — is docs/research-economy-baseline-2026-08-21.md.
//
// What it found then, and the reason this script exists: encounters alone carry
// every faction 1.4-2.4x past the top of the tech ladder, so a Lab's +1 research
// buys nothing and the AI correctly refuses to build one. If that is still true
// after the encounter batch lands, it is a deliberate design position rather
// than an accident.
//
//   node scripts/measure-research-economy.mjs
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { activePlayerId } from "../src/game/targeting.js";
import { takeAITurn } from "../src/game/ai.js";
import { CHIPS } from "../src/game/content.js";
import { CONFIG } from "../src/game/config.js";

const GAMES = Number(process.env.GAMES) || 12;
const ROUNDS = Number(process.env.ROUNDS) || 40;

const perm = [];
const fromChips = [];
const levels = {};
const built = {};

for (let i = 0; i < GAMES; i++) {
  const g = createGame({ seed: 40000 + i * 173, mapSize: ["medium", "large", "huge"][i % 3] });
  for (const p of Object.values(g.players)) p.isAI = true;
  g.humanFactionId = null;
  startTurn(g);
  let guard = 0;
  while (!g.winnerId && g.round <= ROUNDS && guard++ < 6000) {
    const pid = activePlayerId(g);
    if (g.players[pid]?.isAI) takeAITurn(g); else endTurn(g);
  }
  for (const e of g.log) {
    if (e.name === "build_completed") built[e.payload.chipId] = (built[e.payload.chipId] || 0) + 1;
  }
  for (const fid of g.turnOrder) {
    const p = g.players[fid];
    if (!p || p.splinter) continue;
    let chipResearch = 0;
    for (const loc of Object.values(g.locations)) {
      if (loc.controller !== fid) continue;
      for (const c of loc.chips) {
        if (g.chips[c]?.disabled) continue;
        chipResearch += CHIPS[g.chips[c]?.chipId]?.research || 0;
      }
    }
    perm.push(p.permanentResearch || 0);
    fromChips.push(chipResearch);
    levels[p.techLevel] = (levels[p.techLevel] || 0) + 1;
  }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const cap = CONFIG.tech.researchThresholds[CONFIG.tech.researchThresholds.length - 1];

console.log(`${GAMES} AI games to round ${ROUNDS}, ${perm.length} faction-seats\n`);
console.log(`research needed for max tech level: ${cap}  (thresholds ${CONFIG.tech.researchThresholds.join("/")})`);
console.log(`  from permanent sources (encounters): median ${median(perm)}, max ${Math.max(...perm)}`);
console.log(`  from buildings:                      median ${median(fromChips)}, max ${Math.max(...fromChips)}`);
console.log(`  seats with ANY building research:    ${fromChips.filter((n) => n > 0).length}/${fromChips.length}`);
console.log(`  tech level reached, by seat:         ${JSON.stringify(levels)}`);
const over = perm.filter((n) => n >= cap).length;
console.log(`\n  seats past the top of the ladder on encounters alone: ${over}/${perm.length}`);

console.log("\nlocation chips completed:");
const rows = Object.entries(built)
  .filter(([id]) => CHIPS[id]?.kind === "location")
  .sort((a, b) => b[1] - a[1]);
for (const [id, n] of rows) {
  const d = CHIPS[id];
  console.log(`  ${String(n).padStart(4)}  ${d.name.padEnd(20)} tech L${d.techLevel} cost ${d.cost}  research ${d.research || 0}  output ${d.output || 0}`);
}
