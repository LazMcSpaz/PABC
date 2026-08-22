
// Deadline primitive: a deferred packet that says so out loud.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { activeDeadlines } from "../src/game/deferred.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };
const P = "lakers";                         // NOT seat 0 — deadlines are player-scoped
const fresh = () => { const g = createGame({ seed: 4242, humanFactionId: P }); startTurn(g); return g; };
const rounds = (g, n) => { for (let i = 0; i < n * g.turnOrder.length; i++) endTurn(g); };
const arm = (g, extra) => applyEffect(g, {
  type: "QUEUE_DEFERRED", delayRounds: 3, target: P,
  effects: [{ type: "SET_PLAYER_FLAG", flag: "siege_won", value: true, target: "active" }],
  ...extra }, { sourcePlayer: P, asPlayer: P });

// 1. an ordinary packet is untouched by any of this
{
  const g = fresh();
  arm(g, {});
  check("1. a packet with no deadline fields is invisible and fires as before",
    activeDeadlines(g, P).length === 0,
    JSON.stringify(activeDeadlines(g, P)));
  rounds(g, 4);
  check("1b. …and it still lands", g.players[P].flags?.siege_won?.value === true, "did not fire");
}

// 2. a visible deadline shows a countdown that ticks
{
  const g = fresh();
  arm(g, { visible: true, label: "Clan Tempest marches", satisfiedIfFlag: "marched",
           onMissed: [{ type: "SET_PLAYER_FLAG", flag: "fought_without_you", value: true, target: "active" }] });
  const d0 = activeDeadlines(g, P);
  check("2. it is visible, labelled, and counts in rounds",
    d0.length === 1 && d0[0].label === "Clan Tempest marches" && d0[0].roundsLeft === 3,
    JSON.stringify(d0));
  rounds(g, 2);
  check("2b. the countdown ticks down as rounds pass",
    activeDeadlines(g, P)[0]?.roundsLeft === 1,
    JSON.stringify(activeDeadlines(g, P)));
}

// 3. missed: the player never acted
{
  const g = fresh();
  arm(g, { visible: true, label: "L", satisfiedIfFlag: "marched",
           onMissed: [{ type: "SET_PLAYER_FLAG", flag: "fought_without_you", value: true, target: "active" }] });
  rounds(g, 4);
  check("3. a missed deadline runs onMissed, not the effects",
    g.players[P].flags?.fought_without_you?.value === true && !g.players[P].flags?.siege_won,
    `won=${!!g.players[P].flags?.siege_won?.value} missed=${!!g.players[P].flags?.fought_without_you?.value}`);
  check("3b. …and says so in the log",
    g.log.some((e) => e.name === "deadline_expired" && e.payload.player === P), "no deadline_expired");
  check("3c. …and clears off the HUD once resolved", activeDeadlines(g, P).length === 0, "still shown");
}

// 4. met: the player acted in time
{
  const g = fresh();
  arm(g, { visible: true, label: "L", satisfiedIfFlag: "marched",
           onMissed: [{ type: "SET_PLAYER_FLAG", flag: "fought_without_you", value: true, target: "active" }] });
  applyEffect(g, { type: "SET_PLAYER_FLAG", flag: "marched", value: true, target: P },
    { sourcePlayer: P, asPlayer: P });
  check("4. the HUD shows a met deadline as met before it fires",
    activeDeadlines(g, P)[0]?.met === true, JSON.stringify(activeDeadlines(g, P)));
  rounds(g, 4);
  check("4b. a met deadline runs its effects, not onMissed",
    g.players[P].flags?.siege_won?.value === true && !g.players[P].flags?.fought_without_you,
    `won=${!!g.players[P].flags?.siege_won?.value}`);
  check("4c. …and says so in the log",
    g.log.some((e) => e.name === "deadline_met" && e.payload.player === P), "no deadline_met");
}

// 5. several at once, soonest first, and scoped to their owner
{
  const g = fresh();
  const other = g.turnOrder.find((x) => x !== P);
  applyEffect(g, { type: "QUEUE_DEFERRED", delayRounds: 7, visible: true, label: "later",
    effects: [] }, { sourcePlayer: P, asPlayer: P });
  applyEffect(g, { type: "QUEUE_DEFERRED", delayRounds: 2, visible: true, label: "sooner",
    effects: [] }, { sourcePlayer: P, asPlayer: P });
  applyEffect(g, { type: "QUEUE_DEFERRED", delayRounds: 1, visible: true, label: "theirs",
    effects: [] }, { sourcePlayer: other, asPlayer: other });
  const mine = activeDeadlines(g, P);
  check("5. multiple deadlines coexist, soonest first",
    mine.length === 2 && mine[0].label === "sooner" && mine[1].label === "later",
    JSON.stringify(mine));
  check("5b. another player's deadline is not on your HUD",
    !mine.some((d) => d.label === "theirs")
      && activeDeadlines(g, other).some((d) => d.label === "theirs"),
    JSON.stringify(activeDeadlines(g, other)));
}

console.log(`\n${fail ? `${fail} FAILED` : "all checks passed"}`);
process.exit(fail ? 1 : 0);
