
// A purely narrative beat, exercised in a real campaign: delivered, dismissed,
// quest advanced, next beat opened — on the human path AND the headless one.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { registerQuest, activeQuestFor } from "../src/game/quests.js";
import { takeAITurn } from "../src/game/ai.js";
import { pendingEncountersFor, resolvePendingEncounter } from "../src/game/encounters.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

registerQuest({
  id: "q_flavour", mode: "single-player", title: "f",
  beats: [
    { id: "fb1", ordinal: 0, deliver: "auto", text: "Something happens. No options.", choices: [] },
    { id: "fb2", ordinal: 1, deliver: "auto", text: "And then this.", prerequisites: ["fb1"],
      choices: [{ id: "fc2", label: "ok", effects: [] }] },
  ],
  completion: { rewardForClaimant: [], sharedSideEffects: [] },
});
// A beat whose choices all filter out must STILL be skipped — the two cases
// look identical at the eligibility check and only one of them is a card.
registerQuest({
  id: "q_gatedaway", mode: "single-player", title: "g",
  beats: [{ id: "gb1", ordinal: 0, deliver: "auto", text: "t",
            choices: [{ id: "gc1", label: "no", condition: { has_flag: { player: "active", flag: "never_set" } },
                        effects: [] }] }],
  completion: { rewardForClaimant: [], sharedSideEffects: [] },
});

function campaign({ human, answer }) {
  const g = createGame({ seed: 1126, humanFactionId: human });
  startTurn(g);
  for (const qid of ["q_flavour", "q_gatedaway"]) {
    applyEffect(g, { type: "START_QUEST", questId: qid, claimant: human },
      { sourcePlayer: human, asPlayer: human });
  }
  for (let i = 0; i < 12 * g.turnOrder.length; i++) {
    if (answer) {
      let guard = 50;
      for (;;) {
        const q = pendingEncountersFor(g, human);
        if (!q.length || guard-- <= 0) break;
        const card = q[0];
        try { resolvePendingEncounter(g, card.id, card.choices[0]?.id, {}); } catch { break; }
      }
    }
    const before = g.activeIndex;
    try { takeAITurn(g); } catch { /* other seats are not the subject */ }
    if (g.activeIndex === before) { try { endTurn(g); } catch { break; } }
  }
  const delivered = g.log.filter((e) => e.name === "encounter_delivered").map((e) => String(e.payload.encounter));
  return { g, delivered, human };
}

// --- the human path: the card is parked, shown, and dismissed --------------
{
  const g = createGame({ seed: 1126, humanFactionId: "lakers" });
  startTurn(g);
  applyEffect(g, { type: "START_QUEST", questId: "q_flavour", claimant: "lakers" },
    { sourcePlayer: "lakers", asPlayer: "lakers" });
  const parked = pendingEncountersFor(g, "lakers").find((p) => p.ctx.beatId === "fb1");
  check("1. a narrative beat is parked for the human, not silently skipped",
    !!parked, "nothing queued for fb1");
  check("2. it offers exactly one acknowledgement, flagged for the UI",
    parked.choices.length === 1 && parked.choices[0].dismiss === true
      && parked.choices[0].label === "Continue",
    JSON.stringify(parked?.choices));
  resolvePendingEncounter(g, parked.id, parked.choices[0].id, {});
  check("3. dismissing advances the quest",
    (activeQuestFor(g, "q_flavour", "lakers")?.completedBeats || []).includes("fb1"),
    JSON.stringify(activeQuestFor(g, "q_flavour", "lakers")?.completedBeats));
  const next = pendingEncountersFor(g, "lakers").some((p) => p.ctx.beatId === "fb2");
  check("4. …and the next beat opens", next, "fb2 never became available");
}

// --- a real campaign, answering as the human ------------------------------
{
  const { g, delivered, human } = campaign({ human: "lakers", answer: true });
  check("5. in a live campaign the narrative beat and its successor both deliver",
    delivered.some((x) => x.endsWith(":beat:fb1")) && delivered.some((x) => x.endsWith(":beat:fb2")),
    JSON.stringify(delivered.filter((x) => x.includes("q_flavour"))));
  check("6. a beat whose choices all filter out is still correctly skipped",
    !delivered.some((x) => x.endsWith(":beat:gb1"))
      && !(activeQuestFor(g, "q_gatedaway", human)?.completedBeats || []).includes("gb1"),
    "a fully-gated beat was shown");
}

// --- the headless path: an AI claimant must not hang or throw --------------
{
  const g = createGame({ seed: 1126, humanFactionId: "goldgrass" });
  startTurn(g);
  applyEffect(g, { type: "START_QUEST", questId: "q_flavour", claimant: "lakers" },
    { sourcePlayer: "lakers", asPlayer: "lakers" });
  for (let i = 0; i < 8 * g.turnOrder.length; i++) {
    const before = g.activeIndex;
    try { takeAITurn(g); } catch {}
    if (g.activeIndex === before) { try { endTurn(g); } catch { break; } }
  }
  const delivered = g.log.filter((e) => e.name === "encounter_delivered").map((e) => String(e.payload.encounter));
  check("7. an AI claimant resolves it inline and moves on",
    delivered.some((x) => x.endsWith(":beat:fb1")) && delivered.some((x) => x.endsWith(":beat:fb2")),
    JSON.stringify(delivered.filter((x) => x.includes("q_flavour"))));
}

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
