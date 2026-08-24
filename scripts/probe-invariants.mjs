// A live invariant sweep, with a faction that uses every PLAYER verb.
//
//   node scripts/probe-invariants.mjs
//   node scripts/probe-invariants.mjs --assert
//
// WHY. The rework added five verbs that only a human can reach — Counter,
// Positions, Expose/Forge/Fabricate, and Hire — and the AI uses none of them.
// `sim-suite.mjs` plays every faction on `takeAITurn`, so not one of those
// verbs has ever run inside a moving game. They have harness fixtures, which
// check them on a frozen board, and adapter checks, which check they reach the
// screen. Nothing has watched what they do to a game over eighty rounds.
//
// It also added four recurring costs at once — Sway upkeep, occupation
// charges, the chip count surcharge, supply delay — plus chip dormancy, and
// several new round-tick sweeps that run in a fixed order. Nobody has looked at
// them COMPOSITIONALLY.
//
// So this does two things at once. One faction hammers every new verb every
// round, and after EVERY turn the whole state is swept for anything that
// should never be true. The sweep is the point: an exploit hunt only finds
// what you thought to look for, and the interesting failures in a system this
// size are the ones nobody predicted.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { takeAITurn } from "../src/game/ai.js";
import { activePlayerId } from "../src/game/targeting.js";
import { MINOR_FACTIONS, LOCATIONS } from "../src/game/content.js";
import { CONFIG } from "../src/game/config.js";
import {
  performDiplomacy, atWar, arePacted, vassalLord, mayCourt, offersFor,
  factionIds, positionsOf, positionBlocker, exposableStrikes, swayOf,
  getStanding, grievancesAgainst, coalitionAgainst, dominionStanding,
} from "../src/game/diplomacy.js";

const MAJORS = ["versari", "goldgrass", "lakers", "plainers"];
const SEEDS = [1234, 424242, 7, 991, 4711, 8123, 20260821, 31337, 55555, 90210];
const MAX_ROUNDS = 80;
const SUBJECT = "versari";

// --- the invariants ---------------------------------------------------
//
// Everything here is something the rules say can never happen. Each one names
// what it would MEAN if it fired, because a bare "invariant 7 failed" is a
// puzzle rather than a bug report.
function checkInvariants(state, where) {
  const bad = [];
  const say = (what) => bad.push(`${what}  [${where}, round ${state.round}]`);
  const D = CONFIG.diplomacy;

  for (const [pid, p] of Object.entries(state.players || {})) {
    if ((p.resource ?? 0) < 0) say(`${pid} holds ${p.resource} scrap — a charge went through a purse it should have refused`);
    const sway = p.sway ?? 0;
    if (sway < 0) say(`${pid} holds ${sway} Sway — a political charge overdrew the pool`);
    if (sway > CONFIG.sway.cap) say(`${pid} holds ${sway} Sway over a cap of ${CONFIG.sway.cap} — the flow ceiling leaked`);
    const h = p.honor ?? 0;
    if (h < D.honor.min || h > D.honor.max) say(`${pid} Honor ${h} outside [${D.honor.min}, ${D.honor.max}]`);
    if ((p.menace ?? 0) < 0) say(`${pid} Menace ${p.menace} — Menace has no negative meaning`);
    if (!Number.isFinite(p.vp ?? 0)) say(`${pid} VP is ${p.vp}`);
  }

  // Standing is a bounded pairwise scale; anything outside it means a writer
  // bypassed `adjustStanding`'s clamp.
  for (const a of factionIds(state)) {
    for (const b of factionIds(state)) {
      if (a === b) {
        if (state.diplomacy?.standing?.[a]?.[b] != null) say(`${a} holds a Standing toward itself`);
        continue;
      }
      const s = getStanding(state, a, b);
      if (s < D.standingMin || s > D.standingMax) say(`Standing ${a}->${b} is ${s}, outside [${D.standingMin}, ${D.standingMax}]`);
    }
  }

  // War records.
  const seenWars = new Set();
  for (const w of state.diplomacy?.wars || []) {
    if (w.a === w.b) say(`${w.a} is at war with itself`);
    const k = [w.a, w.b].sort().join("|");
    if (seenWars.has(k)) say(`two war records for ${k} — losses will be counted against the wrong one`);
    seenWars.add(k);
    if (arePacted(state, w.a, w.b)) say(`${w.a} and ${w.b} are at war AND allied`);
  }

  // Vassalage: one lord each, nobody their own lord, no cycles.
  const vassals = state.diplomacy?.vassals || {};
  for (const [v, lord] of Object.entries(vassals)) {
    if (v === lord) say(`${v} is its own vassal`);
    const chain = new Set([v]);
    let cur = lord;
    while (cur && !chain.has(cur)) { chain.add(cur); cur = vassals[cur]; }
    if (cur) say(`vassal cycle through ${v}`);
    if (atWar(state, v, lord)) say(`${v} is at war with its own lord ${lord}`);
  }

  // Coalitions.
  for (const c of state.diplomacy?.coalitions || []) {
    if (c.members.includes(c.target)) say(`${c.target} is a member of the coalition against itself`);
    if (new Set(c.members).size !== c.members.length) say(`duplicate members in the coalition against ${c.target}`);
    // The human is never DRAFTED — `recomputeCoalitions` filters them out —
    // but they can JOIN, and the road in is declaring war on the target
    // (`declareWar` enrols any declarer against a coalition's target). So the
    // invariant is not "never a member", which the first draft of this probe
    // asserted and which fired on correct behaviour; it is "never a member
    // without having declared the war themselves".
    const human = state.humanFactionId;
    if (human && c.members.includes(human) && !atWar(state, human, c.target)) {
      say(`the human is in the coalition against ${c.target} without being at war with them`);
    }
  }

  // §13 positions: no two live positions of the same kind and target, and the
  // cap holds.
  for (const pid of factionIds(state)) {
    const held = positionsOf(state, pid);
    const keys = held.map((p) => `${p.kind}|${p.target || ""}`);
    if (new Set(keys).size !== keys.length) say(`${pid} stands on the same position twice`);
    if (held.length > D.positions.max) say(`${pid} holds ${held.length} positions over a cap of ${D.positions.max}`);
  }

  // Grievance ledgers stay bounded, and nobody holds one against themselves.
  for (const [victim, book] of Object.entries(state.diplomacy?.grievances || {})) {
    for (const [offender, list] of Object.entries(book)) {
      if (victim === offender && list.length) say(`${victim} holds a grievance against itself`);
      if (list.length > D.grievance.maxPerPair) {
        say(`${victim} holds ${list.length} grievances against ${offender}, over ${D.grievance.maxPerPair}`);
      }
      // §12.3 — a forgery that outlives its window is a permanent casus belli.
      for (const g of list) {
        if (g.forged && state.round > g.forged.until + 1) {
          say(`a forged grievance ${victim}<-${offender} outlived its window (until r${g.forged.until})`);
        }
      }
    }
  }

  // The board itself.
  for (const [hexId, loc] of Object.entries(state.locations || {})) {
    if (loc.controller && !state.players[loc.controller]) say(`${hexId} is held by ${loc.controller}, who is not a player`);
    if (loc.controller && state.players[loc.controller]?.eliminated) {
      say(`${hexId} is held by ${loc.controller}, who is eliminated`);
    }
    if ((loc.loyalty ?? 0) < 0 || (loc.loyalty ?? 0) > CONFIG.loyalty.max) {
      say(`${hexId} Loyalty ${loc.loyalty} outside [0, ${CONFIG.loyalty.max}]`);
    }
    for (const c of loc.chips || []) if (!state.chips[c]) say(`${hexId} holds chip ${c}, which does not exist`);
  }
  for (const u of Object.values(state.units || {})) {
    if (!state.board.hexes[u.node]) say(`unit ${u.uid} stands on ${u.node}, which is not a hex`);
    if (!state.players[u.owner]) say(`unit ${u.uid} is owned by ${u.owner}, who is not a player`);
    for (const c of u.chips || []) if (!state.chips[c]) say(`unit ${u.uid} carries chip ${c}, which does not exist`);
  }

  return bad;
}

// --- the player policy ------------------------------------------------
//
// Plays the ordinary AI turn, then hammers every verb only a human can reach.
// Deliberately greedy and slightly stupid: it counters every offer, stands on
// everything it can, and lies whenever it can afford to. If any of those is
// exploitable, a policy that does it every round for eighty rounds will find
// out faster than a careful one.
const USED = { counter: 0, position: 0, withdraw: 0, expose: 0, forge: 0, fabricate: 0, hire: 0 };

function playerTurn(state, pid) {
  const others = factionIds(state).filter((f) => f !== pid && state.players[f] && !state.players[f].eliminated);

  // COUNTER every offer on the table, always haggling for a better price. A
  // counter is an ASK, so if the pestering budget is not charging for it this
  // is where a player farms free negotiation.
  for (const o of offersFor(state, pid)) {
    const r = performDiplomacy(state, pid, "counter-offer", { offerId: o.id, scrap: -3 });
    if (r.ok) USED.counter += 1;
  }

  // STAND ON everything the engine will let it stand on, then drop them the
  // moment they are droppable — the cheapest possible cycle, run every round.
  for (const kind of ["noWarOn", "handsOff", "noVassals"]) {
    for (const t of kind === "noVassals" ? [null] : others) {
      if (positionBlocker(state, pid, kind, t)) continue;
      if (performDiplomacy(state, pid, "declare-position", { kind, target: t }).ok) USED.position += 1;
    }
  }
  for (const p of positionsOf(state, pid)) {
    if (performDiplomacy(state, pid, "withdraw-position", { positionId: p.id }).ok) USED.withdraw += 1;
  }

  // LIE AND PUBLISH whenever the pool allows. Fabricate is the one that buys a
  // war, so it is the one worth cycling: fabricate, let it lapse, fabricate
  // again is a free casus belli generator if the window is not doing its job.
  if (swayOf(state, pid) >= CONFIG.sway.opCost) {
    const pub = others.find((f) => exposableStrikes(state, f).length);
    if (pub && performDiplomacy(state, pid, "expose", { faction: pub }).ok) USED.expose += 1;
  }
  if (swayOf(state, pid) >= CONFIG.sway.opCost && others.length >= 2) {
    if (performDiplomacy(state, pid, "forge", { faction: others[0], against: others[1] }).ok) USED.forge += 1;
  }
  if (swayOf(state, pid) >= CONFIG.sway.opCost) {
    const t = others.find((f) => !atWar(state, pid, f));
    if (t && performDiplomacy(state, pid, "fabricate", { faction: t }).ok) USED.fabricate += 1;
  }

  // HIRE — pay somebody into a war of ours. The engine enacts `joinWar` by
  // declaring the war on acceptance, so this is the one player verb that can
  // change the shape of the board through a third party.
  const myEnemy = others.find((f) => atWar(state, pid, f));
  if (myEnemy) {
    const merc = others.find((f) => f !== myEnemy && !atWar(state, f, myEnemy)
      && !arePacted(state, f, myEnemy) && mayCourt(state, pid, f));
    if (merc) {
      const r = performDiplomacy(state, pid, "propose-deal", {
        faction: merc,
        give: [{ resource: { resource: "scrap", amount: Math.min(30, state.players[pid].resource || 0) } }],
        get: [{ promise: { kind: "joinWar", target: myEnemy } }],
      });
      if (r.accepted) USED.hire += 1;
    }
  }

  takeAITurn(state);
}

// --- run --------------------------------------------------------------

let violations = [];
const seen = new Set();
let turns = 0;

for (const seed of SEEDS) {
  const g = createGame({
    seed, factionIds: MAJORS, humanFactionId: SUBJECT,
    minors: Object.keys(MINOR_FACTIONS), mapSize: "medium",
  });
  for (const p of Object.values(g.players)) p.isAI = true;
  startTurn(g);

  const before = checkInvariants(g, `seed ${seed} setup`);
  for (const v of before) if (!seen.has(v.split("  [")[0])) { seen.add(v.split("  [")[0]); violations.push(v); }

  let guard = MAX_ROUNDS * (g.turnOrder.length + 2) + 64;
  // Snapshot of who holds what, so a violation can say whether the LAND moved
  // to a dead faction or the FACTION died holding it — two different bugs that
  // look identical in the end state.
  let heldBefore = Object.fromEntries(Object.entries(g.locations).map(([h, l]) => [h, l.controller]));
  let deadBefore = new Set(factionIds(g).filter((f) => g.players[f]?.eliminated));
  while (!g.winnerId && g.round <= MAX_ROUNDS && guard-- > 0) {
    const pid = activePlayerId(g);
    if (!pid) { endTurn(g); continue; }
    const logLen = g.log.length;
    if (pid === SUBJECT) playerTurn(g, pid); else takeAITurn(g);
    if (g.log.length === logLen) endTurn(g);
    turns += 1;
    if (process.argv.includes("--trace")) {
      for (const [h, l] of Object.entries(g.locations)) {
        if (!l.controller || !g.players[l.controller]?.eliminated) continue;
        const landMoved = heldBefore[h] !== l.controller;
        const factionJustDied = !deadBefore.has(l.controller);
        const key = `ctl:${h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`\n  CONTROL  ${h} held by dead ${l.controller} — ` +
          (landMoved ? `LAND MOVED to them this turn (was ${heldBefore[h] || "nobody"})`
            : factionJustDied ? "THE FACTION DIED THIS TURN while holding it"
              : "neither moved this turn — carried over"));
        console.log(`    sections ${JSON.stringify(l.sections)}  loyaltyOwner ${l.loyaltyOwner}`);
        console.log(`    units on it: ${Object.values(g.units).filter((u) => u.node === h).map((u) => u.owner).join(",") || "none"}`);
        console.log(`    turn of ${pid}, round ${g.round}`);
      }
    }
    heldBefore = Object.fromEntries(Object.entries(g.locations).map(([h, l]) => [h, l.controller]));
    deadBefore = new Set(factionIds(g).filter((f) => g.players[f]?.eliminated));
    // Sweep after EVERY turn, not every round: a violation that appears and is
    // cleaned up before the round tick is still a violation, and it is the one
    // a per-round sweep would miss.
    for (const v of checkInvariants(g, `seed ${seed}`)) {
      const key = v.split("  [")[0];
      if (!seen.has(key)) {
        seen.add(key); violations.push(v);
        if (process.argv.includes("--trace")) {
          console.log(`\n  TRACE  ${v}\n  turn of ${pid}, events this turn:`);
          for (const e of g.log.slice(logLen)) {
            console.log(`    ${e.name} ${JSON.stringify(e.payload).slice(0, 160)}`);
          }
        }
      }
    }
  }
}

console.log(`\n=== ${turns} turns swept across ${SEEDS.length} games ===\n`);
console.log("  player verbs actually exercised:");
for (const [k, v] of Object.entries(USED)) console.log(`    ${k.padEnd(12)} ${v}`);

console.log(`\n  distinct invariant violations: ${violations.length}`);
for (const v of violations) console.log(`    ${v}`);

if (process.argv.includes("--assert")) {
  const unused = Object.entries(USED).filter(([, v]) => v === 0).map(([k]) => k);
  let bad = 0;
  const claim = (label, ok, detail) => {
    console.log(`\n${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        ${detail}`}`);
    if (!ok) bad += 1;
  };
  // A probe that never reached the verbs proves nothing about them.
  claim("every player-only verb was actually reached in a live game",
    unused.length === 0, `never fired: ${unused.join(", ")}`);
  claim("nothing the rules forbid ever became true",
    violations.length === 0, `${violations.length} distinct violations`);
  console.log(`\n${bad ? `${bad} FAILED` : "all claims hold"}`);
  process.exit(bad ? 1 : 0);
}
