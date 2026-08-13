// VP-race simulation — scripted archetype policies racing the 12-VP clock
// on the REAL engine, validating the faucet pacing BEFORE the AI encodes
// it (docs/vp-and-actions-design.md). Policies are imposed, not learned:
// each mutates the game state on a fixed timeline (captures, pacts,
// vassalage), then the turn loop runs for real — loyalty climbs, faucets
// tick, capture VP pays — and we record when 12 VP lands.
// Run: node scripts/sim-vp-race.mjs
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { ensureDiplomacy, formPact } from "../src/game/diplomacy.js";
import { LOCATIONS } from "../src/game/content.js";

const TRIALS = 60;
const MAX_ROUNDS = 40;
const THRESHOLD = 12;

function foreignCities(g, pid) {
  return Object.values(g.locations).filter((l) => {
    const def = LOCATIONS[l.locationId];
    return def && def.affiliation && def.affiliation !== pid &&
      (def.strategicValue === "high" || def.strategicValue === "veryHigh");
  });
}

// Capture a city "for real": controller flips, capture VP pays (via the
// same vpAwarded gate contest.js uses), loyalty restarts at 2, and a
// garrison is planted so integration climbs.
function seize(g, pid, loc) {
  loc.chips = loc.chips.filter((c) => g.chips[c]?.chipId !== "capital");
  loc.controller = pid; loc.loyaltyOwner = pid;
  loc.sections = loc.sections.map(() => pid);
  loc.loyalty = 2;
  if (!loc.vpAwarded) {
    g.players[pid].vp += LOCATIONS[loc.locationId]?.vpReward || 0;
    loc.vpAwarded = true;
  }
  const spare = Object.values(g.units).find((u) => u.owner === pid && !u._posted);
  if (spare) { spare.node = loc.hexId; spare._posted = loc.hexId; }
  else {
    const uid = g.nextId("unit");
    const proto = Object.values(g.units).find((u) => u.owner === pid) ||
      Object.values(g.units)[0];
    g.units[uid] = { ...proto, uid, owner: pid, chips: [], node: loc.hexId, _posted: loc.hexId };
  }
}

// Policies: (game, pid, round) -> void, applied at the top of each round.
const POLICIES = {
  "conqueror (2 cities)": (g, pid, round) => {
    const targets = foreignCities(g, pid);
    if (round === 2 && targets[0]) seize(g, pid, targets[0]);
    if (round === 5 && targets[1]) seize(g, pid, targets[1]);
  },
  "conqueror (3 cities)": (g, pid, round) => {
    const targets = foreignCities(g, pid);
    if (round === 2 && targets[0]) seize(g, pid, targets[0]);
    if (round === 5 && targets[1]) seize(g, pid, targets[1]);
    if (round === 9 && targets[2]) seize(g, pid, targets[2]);
  },
  "diplomat (pacts+vassal)": (g, pid, round) => {
    ensureDiplomacy(g);
    const others = g.turnOrder.filter((f) => f !== pid);
    if (round === 3) { formPact(g, pid, others[0]); formPact(g, pid, others[1]); }
    if (round === 8) {
      const vassal = others[0];
      g.diplomacy.vassals[vassal] = pid;
      // The vassal integrates one of ITS qualifying cities (foreign to the
      // overlord) — garrisoned, so loyalty climbs to the rung.
      const fief = foreignCities(g, pid).find((l) => LOCATIONS[l.locationId].affiliation === vassal);
      if (fief) {
        fief.controller = vassal; fief.loyaltyOwner = vassal;
        fief.sections = fief.sections.map(() => vassal);
        fief.loyalty = 4;
        const guard = Object.values(g.units).find((u) => u.owner === vassal);
        if (guard) guard.node = fief.hexId;
      }
    }
  },
  "hybrid (1 city + pacts)": (g, pid, round) => {
    ensureDiplomacy(g);
    const others = g.turnOrder.filter((f) => f !== pid);
    if (round === 3) { formPact(g, pid, others[0]); formPact(g, pid, others[1]); }
    const targets = foreignCities(g, pid);
    if (round === 4 && targets[0]) seize(g, pid, targets[0]);
  },
  "turtle (homeland only)": () => {},
};

console.log(`VP race to ${THRESHOLD} — scripted archetypes, ${TRIALS} trials, cap ${MAX_ROUNDS} rounds`);
console.log("policy                   | reach% | mean round | p10–p90");
console.log("-------------------------|--------|------------|--------");
for (const [name, policy] of Object.entries(POLICIES)) {
  const rounds = [];
  let reached = 0;
  for (let t = 0; t < TRIALS; t++) {
    const g = createGame({ seed: 60000 + t });
    startTurn(g);
    const pid = g.turnOrder[g.activeIndex];
    let done = null;
    for (let round = 1; round <= MAX_ROUNDS && done == null; round++) {
      policy(g, pid, round);
      // play out the round (nobody else acts — the racer's clock only)
      const start = g.round;
      while (g.round === start && !g.winnerId) endTurn(g);
      if (g.players[pid].vp >= THRESHOLD) done = round;
    }
    if (done != null) { reached++; rounds.push(done); }
  }
  rounds.sort((a, b) => a - b);
  const mean = rounds.length ? (rounds.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1) : "—";
  const p10 = rounds.length ? rounds[Math.floor(rounds.length * 0.1)] : "—";
  const p90 = rounds.length ? rounds[Math.floor(rounds.length * 0.9)] : "—";
  console.log(`${name.padEnd(25)}|  ${String(Math.round((100 * reached) / TRIALS)).padStart(3)}% |   ${String(mean).padStart(6)}   | ${p10}–${p90}`);
}
