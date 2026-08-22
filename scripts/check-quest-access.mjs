
// Quest access: availability is a per-player question, and a faction quest is
// never offered to the faction it is about.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { registerQuest, activeQuestFor } from "../src/game/quests.js";
import { CONFIG } from "../src/game/config.js";

// Checks 1–4 are about WHO a quest can reach, which is a different question
// from how fast it reaches them. `CONFIG.quests.newPerTurn` throttles the
// second (see config.js — without it every faction started 22 quests on turn
// one), and a two-round probe under the throttle would be measuring the
// throttle. Lifted here, and exercised on its own terms in check 5.
const PACING = CONFIG.quests.newPerTurn;
CONFIG.quests.newPerTurn = 0;

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };
const ALL = ["versari", "goldgrass", "lakers", "plainers"];

const beat = (id) => ({ id, ordinal: 0, deliver: "auto", text: "t",
  choices: [{ id: `c_${id}`, label: "ok", effects: [] }] });
registerQuest({ id: "q_open", mode: "single-player", title: "o",
  beats: [beat("ob1"), { ...beat("ob2"), ordinal: 1, prerequisites: ["ob1"] }],
  completion: { rewardForClaimant: [], sharedSideEffects: [] } });
registerQuest({ id: "q_about_lakers", mode: "single-player", title: "l",
  subjectFaction: "lakers",
  beats: [beat("lb1")], completion: { rewardForClaimant: [], sharedSideEffects: [] } });

function whoGetsIt(order, questId) {
  const g = createGame({ seed: 1100, humanFactionId: order[2], factionIds: order });
  startTurn(g);
  for (let i = 0; i < 2 * g.turnOrder.length; i++) { try { endTurn(g); } catch { break; } }
  return ALL.filter((pid) => activeQuestFor(g, questId, pid)
    || g.players[pid]?.completedQuests?.[questId]);
}

for (const order of [ALL, ["goldgrass", "lakers", "plainers", "versari"],
                     ["plainers", "versari", "goldgrass", "lakers"]]) {
  const got = whoGetsIt(order, "q_open");
  check(`1. an unsubjected quest reaches all four seats (seat 0 = ${order[0]})`,
    got.length === 4, `only ${JSON.stringify(got)}`);
  const sub = whoGetsIt(order, "q_about_lakers");
  check(`2. a quest about the Lakers reaches the other three and not them (seat 0 = ${order[0]})`,
    sub.length === 3 && !sub.includes("lakers"), JSON.stringify(sub));
}

// The defect this replaces: first turn no longer decides it for everyone.
{
  const g = createGame({ seed: 1100, humanFactionId: "lakers" });
  startTurn(g);
  for (let i = 0; i < 2 * g.turnOrder.length; i++) { try { endTurn(g); } catch { break; } }
  // "has it or has had it" — a seat that took the quest and finished it inside
  // its own turn is not locked out, it is done.
  const took = (pid) => !!activeQuestFor(g, "q_open", pid)
    || !!g.players[pid]?.completedQuests?.q_open;
  check("3. a non-seat-0 player is not locked out by whoever moved first",
    took("lakers") && took("versari"),
    `lakers=${took("lakers")} versari=${took("versari")}`);
  check("4. …and each player's run is their own record, not a shared one",
    new Set(ALL.filter((p) => activeQuestFor(g, "q_open", p))
      .map((p) => activeQuestFor(g, "q_open", p))).size
      === ALL.filter((p) => activeQuestFor(g, "q_open", p)).length,
    "two players share one run record");
}

// --- and the throttle delays access without denying it -------------------
{
  CONFIG.quests.newPerTurn = PACING;
  const g = createGame({ seed: 1100, humanFactionId: "lakers" });
  startTurn(g);
  const firstTurn = ALL.map((pid) => Object.values(g.activeQuests)
    .filter((r) => r.claimant === pid).length);
  check(`5. a faction picks up at most ${PACING} quest(s) on its first turn`,
    firstTurn.every((n) => n <= PACING), JSON.stringify(firstTurn));

  // Long enough for the throttle to work through the corpus.
  for (let i = 0; i < 24 * g.turnOrder.length; i++) { try { endTurn(g); } catch { break; } }
  const took = (pid) => !!activeQuestFor(g, "q_open", pid)
    || !!g.players[pid]?.completedQuests?.q_open;
  check("6. …and every seat still gets there in the end",
    ALL.every(took), JSON.stringify(ALL.map((p) => [p, took(p)])));
}

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
