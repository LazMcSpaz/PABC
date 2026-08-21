// The Rainmaker — the third way to win (docs/rainmaker-questline-design.md,
// docs/rainmaker-implementation-notes.md).
//
// A device that makes rain, on a board where water is the binding constraint.
// One exists. Everyone can chase it; only one faction can hold it; holding it
// switched on for three rounds ends the game.
//
// WHY THIS IS ITS OWN MODULE rather than content in quests.js. The quest engine
// models a quest as a chain of beats delivered to ONE claimant, with progress
// stored on the quest. Every load-bearing rule here is the opposite of that:
//
//   * progress is PER FACTION on a SHARED object — four factions hold four
//     different stages of the same line at once;
//   * the object changes hands and the progress does NOT go with it;
//   * the object exists on the board, outlives every unit around it, and can
//     sit owned by nobody at all;
//   * the line ends for EVERYONE when the device is destroyed.
//
// So this owns the state and the lifecycle, the way blockades.js and posts.js
// own theirs, and the narrative beats stay ordinary encounter content dispatched
// through the existing machinery.
//
// Imports stay to config + events + board, deliberately: turn.js, movement.js
// and contest.js all have to call INTO this, so anything it needs back from them
// arrives as a parameter rather than an import.
import { CONFIG } from "./config.js";
import { emit } from "./events.js";
import { bfsDistances } from "./board.js";

// The line, start to finish. Numbered so "further along" is a comparison and
// the UI can draw a bar; named so nothing downstream reads a bare integer.
export const STAGE = {
  MYTH: 0,        // the hook. No cost, no benefit, always re-enterable.
  RESEARCH: 1,    // build a lab (or buy the research off someone who has one)
  REGION: 2,      // "somewhere on this landmass"
  SEARCH: 3,      // find the site — last stage of the parallel phase
  SITE: 4,        // understand it in place. THE EXCLUSIVE PHASE OPENS HERE.
  TRANSPORT: 5,   // one hex per turn, all the way home
  INSTALL: 6,     // four turns, and a lab in the destination capital
  SPECIALIST: 7,  // the one person who can finish it
  ACTIVATION: 8,  // switch on, and hold for three rounds
};
export const FINAL_STAGE = STAGE.ACTIVATION;

// Where the whole line is, which is not the same as where any one faction is.
//   parallel   nobody has reached the site. Everyone races, nobody blocks.
//   exclusive  someone holds it. Everyone else is hunting, not pursuing.
//   ended      won, or the device is destroyed. Nothing more happens.
export const PHASE = { PARALLEL: "parallel", EXCLUSIVE: "exclusive", ENDED: "ended" };

// What the device is doing. `loose` is the one people forget: the device is not
// cargo and not a unit, so wiping out an escort — or eliminating its owner
// outright — leaves it sitting on its hex belonging to nobody (notes §4, §5).
export const DEVICE = {
  BURIED: "buried",       // at the site, not yet extracted
  CARRIED: "carried",     // in transport, owner + carrier unit
  LOOSE: "loose",         // on a hex, unowned, first to arrive chooses
  INSTALLED: "installed", // in a capital, being fitted or running
  DESTROYED: "destroyed",
};

const R = () => CONFIG.rainmaker;

export function rainmakerState(state) {
  return state.world?.rainmaker || null;
}

// --- site selection ---------------------------------------------------

// The site is fixed at world creation and never moves (notes §6). It is secret
// until found, but it is decided now, because "the hex is chosen at spawn" is
// what makes the player side of the search deterministic — there is a right
// answer to walk onto from the first turn of Stage 3, before any narrowing.
//
// Minimum distance is from EVERY capital, not the nearest one: the rule exists
// so no faction opens with a trivial haul, and checking only the closest lets
// the second-closest sit two hexes away.
//
// MEASURED, and it changes the rule. The notes ask for a flat 4 and call a board
// that cannot seat one a generation failure to surface loudly. On this board it
// is not a generation failure, it is arithmetic: across 12 small boards (30
// hexes, four capitals) the best any hex on the map managed was 2 — 3 on two of
// them — and not one hex reached 4. Medium (61) reaches 4 on 11 of 12; large
// (91) and huge (127) always do. So the 4 is a TARGET the board is asked for and
// the far corner is what it gets when the board is too small to give it, and the
// shortfall is reported rather than swallowed — which is what "surface loudly"
// is actually protecting: nobody should discover from a two-hex haul that the
// constraint quietly gave way.
export function chooseSiteHex(board, capitalHexes, rng, target = R().site.minCapitalDistance) {
  const dists = capitalHexes.map((h) => bfsDistances(board.adjacency, h));
  // How far each hex is from the NEAREST capital — the number the rule is about.
  const remoteness = {};
  for (const h of Object.keys(board.hexes)) {
    // Unreachable from a capital is not "far away", it is off the map as far as
    // a convoy is concerned.
    if (dists.some((d) => d[h] === undefined)) continue;
    remoteness[h] = Math.min(...dists.map((d) => d[h]));
  }
  const reachable = Object.keys(remoteness);
  if (!reachable.length) {
    throw new Error(
      `rainmaker: no hex on this board is reachable from all ${capitalHexes.length} capitals `
      + `(${capitalHexes.join(", ")}) — the site cannot be seated`,
    );
  }
  const best = Math.max(...reachable.map((h) => remoteness[h]));
  const floor = Math.min(target, best);
  // Sorted before picking so the choice depends on the seed and not on object
  // key order.
  const eligible = reachable.filter((h) => remoteness[h] >= floor).sort();
  return { hex: rng.pick(eligible), distance: floor, target, cramped: floor < target };
}

// Called once from createGame. Seeds the whole line.
export function seedRainmaker(state, capitalHexes, rng) {
  const site = chooseSiteHex(state.board, capitalHexes, rng);
  if (site.cramped) {
    // Loud, per notes §6 — in the log where a playtester reading back a game
    // will find it, with the numbers that explain the shortfall.
    emit(state, "rainmaker_site_cramped", {
      hex: site.hex, distance: site.distance, target: site.target,
      capitals: capitalHexes.length, hexes: Object.keys(state.board.hexes).length,
    });
  }
  state.world.rainmaker = {
    siteHex: site.hex,
    siteDistance: site.distance,
    phase: PHASE.PARALLEL,
    // Set when the first faction reaches Stage 3, which starts the search
    // ceiling clock (notes §6).
    searchOpenedRound: null,
    foundBy: null,
    foundRound: null,
    device: { status: DEVICE.BURIED, hex: site.hex, owner: null, carrierUid: null },
    progress: {},
    // Scarce found benefits deplete — the third faction to search a region
    // finds nothing worth hauling home (design §3).
    vehiclesFound: 0,
    // The 2-turn exclusive engagement window on a convoy. Convoys only.
    claim: null,
    activatedBy: null,
    activatedRound: null,
    destroyedBy: null,
  };
  return state.world.rainmaker;
}

// --- per-faction progress --------------------------------------------

// A faction's own line. Created on first engagement and never destroyed while
// the game runs — a faction that drops out keeps its record so its retained
// benefits and its re-entry both have somewhere to live.
export function progressFor(state, fid) {
  const rm = rainmakerState(state);
  if (!rm) return null;
  return rm.progress[fid] || null;
}

function blankProgress(fid, round) {
  return {
    fid,
    stage: STAGE.MYTH,
    joinedRound: round,
    // Stage 3 accumulation. The player's is spent walking; the AI's accrues.
    search: 0,
    // Stage 4 / 6 counters, in turns spent.
    siteTurns: 0,
    installTurns: 0,
    // Took the fast partial extraction at Stage 4 — costs turns at Stage 6.
    damaged: false,
    // Retained benefits already paid out, so re-entry never pays twice.
    retained: { lab: false, sight: false, vehicle: false },
    // Set when the exclusive phase opens on somebody else. A hunter is not
    // "behind" — their line has ended and a different one has started.
    hunting: false,
    specialist: null,
  };
}

// Join, or re-join. Declining Stage 0 is never permanent and there is no lockout
// flag anywhere (notes §10) — the only cost of coming late is the turns.
export function joinRainmaker(state, fid) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase === PHASE.ENDED) return null;
  if (rm.progress[fid]) return rm.progress[fid];
  const p = blankProgress(fid, state.round);
  // The parallel phase is over: a faction engaging now is a hunter, whatever
  // it thought it was signing up for.
  if (rm.phase === PHASE.EXCLUSIVE) p.hunting = true;
  rm.progress[fid] = p;
  emit(state, "rainmaker_joined", { player: fid, round: state.round, hunting: p.hunting });
  return p;
}

// Move one faction forward. Deliberately the only writer of `stage`, so the
// event and the phase transition can never be skipped by a caller taking a
// shortcut.
export function advanceStage(state, fid, to) {
  const rm = rainmakerState(state);
  const p = rm?.progress[fid];
  if (!p || rm.phase === PHASE.ENDED) return false;
  if (to <= p.stage) return false;
  const from = p.stage;
  p.stage = to;
  emit(state, "rainmaker_advanced", { player: fid, from, to });
  if (to >= STAGE.SITE) openExclusivePhase(state, fid);
  return true;
}

// --- the exclusive phase ---------------------------------------------

// Design §2: when someone reaches Stage 4, everyone else's quest line
// terminates and converts to a hunt. This is announced, publicly, to everybody —
// it is the moment the design is built around.
export function openExclusivePhase(state, holder) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase !== PHASE.PARALLEL) return;
  rm.phase = PHASE.EXCLUSIVE;
  const converted = [];
  for (const [fid, p] of Object.entries(rm.progress)) {
    if (fid === holder) continue;
    p.hunting = true;
    // Their progress is over. It is not rolled back — the retained benefits
    // stay bought and paid for — but the stage no longer means anything, so it
    // stops where it stood rather than pretending to advance.
    converted.push(fid);
  }
  emit(state, "rainmaker_exclusive", { holder, converted });
}

// --- the device -------------------------------------------------------

// Hand the device to `fid` and start them at Stage 5 with nothing else.
//
// THE most likely mistake in the whole feature (notes §1): capturing the device
// grants the OBJECT and nothing else. Not the previous holder's stage, not their
// lab credit, not their hold clock, not a partial one of any of them. A captor
// who never built a lab must still build one at Stage 6, at full price, while
// standing in the open being publicly known — that is the vulture toll, and it
// is the only thing making the vulture strategy a decision rather than a dodge.
export function grantDevice(state, fid, { hex, carrierUid = null, reason = "seized" } = {}) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status === DEVICE.DESTROYED) return false;
  const from = rm.device.owner;
  if (from && rm.progress[from]) {
    const loser = rm.progress[from];
    // The victim keeps their buildings — a lab is a lab whoever is winning —
    // and loses every scrap of Rainmaker progress.
    loser.stage = STAGE.MYTH;
    loser.hunting = true;
    loser.siteTurns = 0;
    loser.installTurns = 0;
    loser.damaged = false;
    loser.specialist = null;
  }
  // The hold clock resets on capture and does not partially carry (notes §1).
  if (rm.activatedBy === from) { rm.activatedBy = null; rm.activatedRound = null; }
  rm.claim = null;

  const p = rm.progress[fid] || joinRainmaker(state, fid);
  rm.device.owner = fid;
  rm.device.hex = hex ?? rm.device.hex;
  rm.device.carrierUid = carrierUid;
  // `loose` means UNOWNED — that is the whole of what the word is for, and the
  // one invariant every reader downstream leans on. A holder who has not yet
  // put the thing on a particular unit is still a holder, so an owner with no
  // carrier is `carried` with a null carrier, never `loose`.
  rm.device.status = DEVICE.CARRIED;
  if (p) {
    p.stage = STAGE.TRANSPORT;
    p.hunting = false;
    p.siteTurns = 0;
    p.installTurns = 0;
    p.specialist = null;
  }
  // Whoever holds it, the exclusive phase is on.
  openExclusivePhase(state, fid);
  emit(state, "rainmaker_taken", { player: fid, from: from || null, hex: rm.device.hex, reason });
  return true;
}

// The device with nobody holding it: escort wiped out, owner eliminated, or a
// convoy abandoned. It is NOT destroyed and it does NOT revert to the site — it
// stays where it stands until somebody physically arrives (notes §4, §5).
export function looseDevice(state, { hex = null, reason = "escort lost" } = {}) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status === DEVICE.DESTROYED) return false;
  const from = rm.device.owner;
  if (from && rm.progress[from]) {
    const loser = rm.progress[from];
    loser.stage = STAGE.MYTH;
    loser.hunting = true;
    loser.siteTurns = 0;
    loser.installTurns = 0;
    loser.specialist = null;
  }
  if (rm.activatedBy === from) { rm.activatedBy = null; rm.activatedRound = null; }
  rm.device.hex = hex ?? rm.device.hex;
  rm.device.owner = null;
  rm.device.carrierUid = null;
  rm.device.status = DEVICE.LOOSE;
  rm.claim = null;
  emit(state, "rainmaker_loose", { hex: rm.device.hex, from: from || null, reason });
  return true;
}

// Destroying it ends the line for EVERY faction, permanently (notes §7). No
// respawn, no second device, and — the part that goes wrong — no AI background
// counters left running toward something that no longer exists. Every record is
// closed here rather than left for each system to notice on its own.
export function destroyDevice(state, byFid, { reason = "destroyed" } = {}) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status === DEVICE.DESTROYED) return false;
  rm.device.status = DEVICE.DESTROYED;
  rm.device.owner = null;
  rm.device.carrierUid = null;
  rm.phase = PHASE.ENDED;
  rm.claim = null;
  rm.activatedBy = null;
  rm.activatedRound = null;
  rm.destroyedBy = byFid || null;
  for (const p of Object.values(rm.progress)) {
    p.stage = STAGE.MYTH;
    p.hunting = false;
    p.search = 0;
    p.siteTurns = 0;
    p.installTurns = 0;
    p.specialist = null;
  }
  emit(state, "rainmaker_destroyed", { player: byFid || null, reason });
  return true;
}

// The device's owner has been eliminated. Which of the two endings applies
// depends only on where the device was, never on who did the eliminating —
// notes §5 is explicit that the killer and the claimant are frequently the same
// faction and must not be assumed to be.
export function onHolderEliminated(state, fid) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.owner !== fid) return false;
  return looseDevice(state, { reason: "holder eliminated" });
}

// --- readers the rest of the game asks with ---------------------------

// Is this hex carrying the loose device, for a unit that just arrived to claim?
export function looseDeviceAt(state, hex) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.LOOSE) return null;
  return rm.device.hex === hex ? rm.device : null;
}

// The unit currently hauling it, if any. Movement asks this to clamp a mover to
// one hex per turn, and it has to answer by UID rather than by hex — two units
// can stand on the same tile and only one of them is carrying anything.
export function deviceCarrier(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.CARRIED) return null;
  return rm.device.carrierUid || null;
}

export function isHaulingDevice(state, unit) {
  if (!unit) return false;
  return deviceCarrier(state) === unit.uid;
}

// Public, coarse, and late (design §7). What everyone may know about everyone:
// the stage, and nothing about garrisons, routes or remaining strength.
export function publicStanding(state) {
  const rm = rainmakerState(state);
  if (!rm) return null;
  return {
    phase: rm.phase,
    // The site's position is public from the moment it is found and secret
    // before it, which is the whole of the information design in one field.
    siteHex: rm.foundBy ? rm.siteHex : null,
    foundBy: rm.foundBy,
    device: rm.phase === PHASE.PARALLEL
      ? null
      : { status: rm.device.status, owner: rm.device.owner, hex: rm.device.hex },
    holders: Object.values(rm.progress)
      .map((p) => ({ fid: p.fid, stage: p.stage, hunting: p.hunting }))
      .sort((a, b) => b.stage - a.stage || a.fid.localeCompare(b.fid)),
    destroyed: rm.device.status === DEVICE.DESTROYED,
  };
}
