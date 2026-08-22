// Regression test for the `active` family.
//
//   node scripts/check-active-family.mjs
//
// Five separate defects during the content import all reduced to one
// mistake: resolving `active` — which means *whose turn is it* — where the
// question was actually *whose card is this*. They coincide only during a
// player's own turn, and encounters are overwhelmingly delivered outside it,
// from the round-end pipeline that runs after activeIndex has wrapped to
// seat 0.
//
// Each was found by a different accident, months of play apart in game time
// and hours apart in debugging. An audit found the fifth before it bit; this
// file is what keeps that true after the next feature lands.
//
// Every check below constructs a delivery to a seat that is NOT the active
// one and asserts the answer comes back as the card-holder.

import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { evalCond } from "../src/game/dsl.js";
import { resolveTargets } from "../src/game/targeting.js";
import { registerQuest } from "../src/game/quests.js";
import { registerWorldEncounter, pendingEncountersFor,
         resolvePendingEncounter } from "../src/game/encounters.js";

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        ${detail}`}`);
};

// The whole suite runs with seat 0 active and the card belonging to seat 2.
const HOLDER = "lakers";          // whose card it is
const fresh = () => {
  const g = createGame({ seed: 4242, humanFactionId: HOLDER });
  startTurn(g);                   // seat 0 (versari) holds the turn
  return g;
};

// --- 1. condition gates ----------------------------------------------
{
  const g = fresh();
  const active = g.turnOrder[g.activeIndex];
  const asHolder = { asPlayer: HOLDER, sourcePlayer: HOLDER };
  check("1. gate: `active` in a condition resolves to the card-holder",
    evalCond(g, { op: "eq", left: "active", right: HOLDER }, asHolder) === true
    && evalCond(g, { op: "eq", left: "active", right: active }, asHolder) === false,
    `gate answered for ${active} instead of ${HOLDER}`);

  check("1b. without asPlayer, `active` still means the active seat",
    evalCond(g, { op: "eq", left: "active", right: active }, {}) === true,
    "turn-scoped meaning was lost");
}

// --- 2. effect targets ------------------------------------------------
{
  const g = fresh();
  const active = g.turnOrder[g.activeIndex];
  applyEffect(g, { type: "SET_PLAYER_FLAG", flag: "probe", value: true, target: "active" },
    { asPlayer: HOLDER, sourcePlayer: HOLDER });
  applyEffect(g, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 9, target: "active" },
    { asPlayer: HOLDER, sourcePlayer: HOLDER });
  check("2. effect target: flags and resources land on the card-holder",
    g.players[HOLDER].flags?.probe?.value === true
    && !g.players[active].flags?.probe
    && g.players[HOLDER].resource >= 9,
    `flag landed on ${Object.keys(g.players).filter((p) => g.players[p].flags?.probe)}`);

  check("2b. resolveTargets honours asPlayer",
    resolveTargets(g, "active", { asPlayer: HOLDER })[0] === HOLDER,
    "resolved to the active seat");
}

// --- 3. delivery recipients -------------------------------------------
{
  const g = fresh();
  registerQuest({
    id: "q_probe_recipient", mode: "single-player", title: "p",
    beats: [{ id: "pb1", ordinal: 0, deliver: "auto", text: "t",
      choices: [{ id: "pc1", label: "ok", effects: [] }] }],
    completion: { rewardForClaimant: [], sharedSideEffects: [] },
  });
  applyEffect(g, { type: "START_QUEST", questId: "q_probe_recipient", claimant: HOLDER },
    { sourcePlayer: HOLDER, asPlayer: HOLDER });
  const queued = pendingEncountersFor(g, HOLDER);
  check("3. delivery: a beat goes to its claimant, not the active seat",
    queued.length === 1 && queued[0].recipient === HOLDER,
    `queued for ${queued.map((q) => q.recipient).join(",") || "nobody"}`);
}

// --- 4. deferred payloads ---------------------------------------------
{
  const g = fresh();
  const active = g.turnOrder[g.activeIndex];
  applyEffect(g, { type: "QUEUE_DEFERRED", delayRounds: 2, target: "active",
    effects: [{ type: "SET_PLAYER_FLAG", flag: "late", value: true, target: "active" }] },
    { asPlayer: HOLDER, sourcePlayer: HOLDER });
  for (let i = 0; i < 3 * g.turnOrder.length + 4; i++) endTurn(g);
  check("4. deferred: the payload lands on the queuer, not a bystander",
    g.players[HOLDER].flags?.late?.value === true && !g.players[active].flags?.late,
    `landed on ${Object.keys(g.players).filter((p) => g.players[p].flags?.late).join(",") || "nobody"}`);
}

// --- 5. trigger recipients --------------------------------------------
{
  const g = fresh();
  registerWorldEncounter({
    id: "we_probe", mode: "private", recipient: "active", text: "t", art: null,
    triggerCondition: true, triggerStrength: 5, triggerCooldown: 0, triggerWeight: 1,
    choices: [{ id: "wc1", label: "ok", effects: [] }],
  });
  const seats = new Set();
  for (let i = 0; i < 60; i++) {
    let guard = 20;
    for (;;) {
      const q = pendingEncountersFor(g, HOLDER);
      if (!q.length || guard-- <= 0) break;
      resolvePendingEncounter(g, q[0].id, q[0].choices[0].id, {});
    }
    endTurn(g);
  }
  for (const e of g.log) {
    if (e.name === "encounter_delivered" && e.payload.encounter === "we_probe") {
      seats.add(e.payload.recipient);
    }
  }
  check("5. triggers: a world encounter reaches more than the first seat",
    seats.size > 1,
    `only ever delivered to: ${[...seats].join(",") || "nobody"}`);
  check("5b. triggers: it reaches the non-active seat specifically",
    seats.has(HOLDER),
    `${HOLDER} never received it`);
}

console.log(`\n${failed ? `${failed} FAILED` : "all checks passed"}`);
process.exit(failed ? 1 : 0);
