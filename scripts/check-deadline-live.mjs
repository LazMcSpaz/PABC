
// End-to-end: a visible deadline armed inside a REAL campaign — full round-end
// pipeline, AI seats playing, quests delivering — not a bare endTurn loop.
import fs from "node:fs";
import { assemble } from "./build-content.mjs";
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { takeAITurn } from "../src/game/ai.js";
import { applyEffect } from "../src/game/effects.js";
import { activeDeadlines } from "../src/game/deferred.js";
import { registerQuest } from "../src/game/quests.js";
import { registerWorldEncounter, registerFieldEncounter,
         pendingEncountersFor, resolvePendingEncounter } from "../src/game/encounters.js";

const doc = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const snap = assemble(doc);
for (const q of snap.quests) registerQuest(q);
for (const w of snap.worldEncounters) registerWorldEncounter(w);
for (const f of snap.fieldEncounters) registerFieldEncounter(f);

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

function campaign({ satisfy }) {
  const HUMAN = "lakers";
  const g = createGame({ seed: 1126, humanFactionId: HUMAN });
  startTurn(g);
  const seen = [];
  let armed = false, armedAt = null;
  for (let i = 0; i < 30 * g.turnOrder.length; i++) {
    // answer whatever the campaign hands the human, so quests keep moving
    let guard = 200;
    for (;;) {
      const q = pendingEncountersFor(g, HUMAN);
      if (!q.length || guard-- <= 0) break;
      try { resolvePendingEncounter(g, q[0].id, q[0].choices[0].id, {}); } catch { break; }
    }
    if (!armed && g.round >= 3) {
      applyEffect(g, {
        type: "QUEUE_DEFERRED", delayRounds: 5, target: HUMAN,
        label: "Clan Tempest marches", visible: true, satisfiedIfFlag: "marched",
        effects:  [{ type: "SET_PLAYER_FLAG", flag: "siege_won",         value: true, target: "active" }],
        onMissed: [{ type: "SET_PLAYER_FLAG", flag: "fought_without_you", value: true, target: "active" }],
      }, { sourcePlayer: HUMAN, asPlayer: HUMAN });
      armed = true; armedAt = g.round;
      if (satisfy) applyEffect(g, { type: "SET_PLAYER_FLAG", flag: "marched", value: true, target: HUMAN },
        { sourcePlayer: HUMAN, asPlayer: HUMAN });
    }
    if (armed) {
      const d = activeDeadlines(g, HUMAN).find((x) => x.label === "Clan Tempest marches");
      if (d) seen.push({ round: g.round, left: d.roundsLeft, met: d.met });
    }
    const before = g.activeIndex;
    try { takeAITurn(g); } catch { /* an AI seat failing is not this test's subject */ }
    if (g.activeIndex === before) { try { endTurn(g); } catch { break; } }
    if (g.winnerId) break;
  }
  return { g, seen, armedAt, HUMAN };
}

{
  const { g, seen, armedAt, HUMAN } = campaign({ satisfy: false });
  const lefts = [...new Set(seen.map((s) => s.left))];
  // The sweep resolves a packet on the round it comes due, so the countdown
  // runs 5..1 and then the deadline is gone. It never displays 0 — a timer
  // reading zero that has not yet fired would be the wrong thing to show.
  const descending = lefts.every((v, i) => i === 0 || v < lefts[i - 1]);
  check("1. the countdown appears in a live campaign and ticks down 5..1",
    seen.length > 0 && Math.max(...lefts) === 5 && Math.min(...lefts) === 1 && descending,
    `armed r${armedAt}, observed ${JSON.stringify(lefts)}`);
  check("2. a missed deadline fires its onMissed branch, in a real round-end",
    g.players[HUMAN].flags?.fought_without_you?.value === true
      && !g.players[HUMAN].flags?.siege_won,
    `missed=${!!g.players[HUMAN].flags?.fought_without_you?.value} won=${!!g.players[HUMAN].flags?.siege_won?.value}`);
  check("3. …and the event is in the game log alongside real play",
    g.log.some((e) => e.name === "deadline_expired" && e.payload.player === HUMAN
      && e.payload.label === "Clan Tempest marches"), "no deadline_expired for the human");
  check("4. it clears off the HUD once it has resolved",
    !activeDeadlines(g, HUMAN).some((d) => d.label === "Clan Tempest marches"), "still displayed");
}
{
  const { g, HUMAN } = campaign({ satisfy: true });
  check("5. a met deadline fires its effects instead, in the same conditions",
    g.players[HUMAN].flags?.siege_won?.value === true
      && !g.players[HUMAN].flags?.fought_without_you,
    `won=${!!g.players[HUMAN].flags?.siege_won?.value}`);
  check("6. …and logs deadline_met",
    g.log.some((e) => e.name === "deadline_met" && e.payload.player === HUMAN), "no deadline_met");
}
console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
