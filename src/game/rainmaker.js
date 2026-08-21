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
import { factionDef, registerRuntimeFaction } from "./content.js";

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
    stageSince: round,
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
  p.stageSince = state.round;
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
// What it costs `fid` to end the line for everybody, and whether they can pay.
// A faction with no seat at all (an engine-driven destruction) pays nothing,
// which is the only way `byFid` is ever null.
export function destroyBlocker(state, fid) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status === DEVICE.DESTROYED) return "there is nothing left to destroy";
  if (!fid) return null;
  const have = state.players?.[fid]?.resource || 0;
  if (have < R().destroyCost) return `it takes ${R().destroyCost} scrap to be sure of it`;
  return null;
}

export function destroyDevice(state, byFid, { reason = "destroyed", free = false } = {}) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status === DEVICE.DESTROYED) return false;
  if (!free && destroyBlocker(state, byFid)) return false;
  if (!free && byFid && state.players?.[byFid]) {
    state.players[byFid].resource -= R().destroyCost;
    emit(state, "resource_spent", {
      player: byFid, resource: "Resource", amount: R().destroyCost, source: "rainmaker-denial",
    });
  }
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

// --- the parallel phase (stages 0-3) ---------------------------------

// Stage 0 is a hook, not a gate. It is offered to everybody at once, declining
// costs nothing but the turns, and there is no lockout flag anywhere — a
// faction may enter the line at any later point, from the top (notes §10).
export function openMyth(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.mythOpened || rm.phase === PHASE.ENDED) return false;
  rm.mythOpened = state.round;
  emit(state, "rainmaker_myth", { round: state.round });
  return true;
}

export function mythIsOpen(state) {
  return !!rainmakerState(state)?.mythOpened;
}

// What counts as a lab for the installation. The Rainmaker's own workshop is
// one, which is the whole reason it exists.
export const LAB_CHIPS = new Set(["labs", "advanced-lab", "rainmaker-lab"]);

// Why `fid` may not raise the Rainmaker's workshop at `hexId`, or null if they
// may. It is the answer to "am I gated out of the lab" — so it must be null
// exactly when the installation is what needs one.
export function rainmakerLabBlocker(state, fid, hexId) {
  const rm = rainmakerState(state);
  if (!rm) return "there is no Rainmaker";
  if (rm.device.owner !== fid) return "only whoever holds the Rainmaker builds one";
  const home = capitalHexOf(state, fid);
  if (!home || hexId !== home) return "it is raised around the machine, in your capital";
  if (rm.device.hex !== home) return "the machine is not home yet";
  if (labHexOf(state, fid, { capitalOnly: true })) return "there is already a lab here";
  return null;
}

// A lab in any settlement this faction holds. Stage 1 builds one; Stage 6
// demands one in the capital specifically, which is a different question asked
// of the same building.
export function labHexOf(state, fid, { capitalOnly = false } = {}) {
  for (const loc of Object.values(state.locations || {})) {
    if (loc.controller !== fid) continue;
    if (capitalOnly && !(loc.chips || []).some((c) => state.chips?.[c]?.chipId === "capital")) continue;
    const lab = (loc.chips || []).some((c) => {
      const id = state.chips?.[c]?.chipId;
      return LAB_CHIPS.has(id) && !state.chips[c]?.disabled;
    });
    if (lab) return loc.hexId;
  }
  return null;
}

// The parallel phase's own pulse. Stages 0-2 are a build task on a timer, so
// they advance here rather than waiting for anybody to click anything: the myth
// is a hook the faction has already taken by joining, the research is the lab,
// and the region is an interval. Each pays its retained benefit on the way out,
// which is what makes the line worth starting for a faction with no intention
// of finishing it.
export function tickStages(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase === PHASE.ENDED) return;
  const cfg = R().stages;
  for (const p of Object.values(rm.progress)) {
    if (p.hunting) continue;
    const elapsed = state.round - (p.stageSince ?? p.joinedRound ?? state.round);
    if (p.stage === STAGE.MYTH) {
      // Committing IS the hook — a faction that joined has begun.
      advanceStage(state, p.fid, STAGE.RESEARCH);
    } else if (p.stage === STAGE.RESEARCH) {
      // Two paths, one requirement: a lab you built, or a lab you took off
      // somebody who built one. Both leave you holding a lab.
      if (labHexOf(state, p.fid) && elapsed >= cfg.researchTurns) {
        p.retained.lab = true;
        advanceStage(state, p.fid, STAGE.REGION);
      }
    } else if (p.stage === STAGE.REGION) {
      if (elapsed >= cfg.regionTurns) {
        p.retained.sight = true;
        advanceStage(state, p.fid, STAGE.SEARCH);
      }
    }
  }
  // The salvaged vehicle rides with one stack and outlives the unit it was
  // handed to — a benefit described as permanent should not evaporate because
  // the truck that carried it lost a fight.
  for (const p of Object.values(rm.progress)) {
    if (!p.retained.vehicle) continue;
    if (p.vehicleUnit && state.units?.[p.vehicleUnit]) continue;
    const heir = Object.values(state.units || {}).find((u) => u.owner === p.fid);
    if (!heir) { p.vehicleUnit = null; continue; }
    p.vehicleUnit = heir.uid;
    heir.movementBonus = (heir.movementBonus || 0) + R().retained.moveBonus;
  }
}

// --- the search (stage 3), one system with two resolutions ------------

// Which tier of narrowing this much progress has bought.
function narrowingRadius(progress) {
  let radius = null;
  for (const tier of R().search.narrowing) {
    if (progress >= tier.at) radius = tier.radius;
  }
  return radius;
}

// The area a faction has narrowed the site down to. Centred on the TRUE hex and
// only ever shrinking, which is what makes the two fairness rules hold at once:
// the answer is always inside it, so nothing can rule the answer out; and a hex
// the player has stood on without finding anything is genuinely not the site, so
// excluding it later is not a lie. The player is never told "not here" about
// anywhere — only that the area is smaller than it was.
export function candidateArea(state, fid) {
  const rm = rainmakerState(state);
  if (!rm) return [];
  const p = rm.progress[fid];
  const radius = narrowingRadius(p?.search ?? 0);
  if (radius == null) return Object.keys(state.board.hexes);
  const d = bfsDistances(state.board.adjacency, rm.siteHex);
  return Object.keys(state.board.hexes).filter((h) => (d[h] ?? Infinity) <= radius);
}

// How fast `fid` closes on it this round.
//
// A player searches by WALKING — a base rate for having the map open, plus a
// share for every unit actually inside the candidate area. An AI accrues a flat
// background counter and paths nothing at all, at a rate deliberately below what
// a player gets for looking (design §5.3). Same counter, same ceiling, two
// resolutions.
export function searchRate(state, fid) {
  const cfg = R().search;
  if (state.players?.[fid]?.isAI) return cfg.aiRatePerTurn;
  const area = new Set(candidateArea(state, fid));
  let inArea = 0;
  for (const u of Object.values(state.units || {})) {
    if (u.owner === fid && area.has(u.node)) inArea++;
  }
  return cfg.baseRatePerTurn + inArea * cfg.perUnitRate;
}

// Somebody found it. The site goes PUBLIC immediately — the finder gets a free
// step at the site and roughly two turns of uncontested access, but nobody ever
// loses to a discovery they could not have seen coming (design §5.3).
export function findSite(state, fid, how) {
  const rm = rainmakerState(state);
  if (!rm || rm.foundBy || rm.phase === PHASE.ENDED) return false;
  const p = rm.progress[fid] || joinRainmaker(state, fid);
  if (!p) return false;
  rm.foundBy = fid;
  rm.foundRound = state.round;
  p.search = 1;
  // The salvaged vehicle is a FOUND benefit, so it depletes: the first two
  // finders haul something home and the third finds a picked-over site.
  if (rm.vehiclesFound < R().retained.vehicleFinders) {
    rm.vehiclesFound += 1;
    p.retained.vehicle = true;
  }
  if (p.stage < STAGE.SEARCH) p.stage = STAGE.SEARCH;
  // One free step at the site, banked until the finder actually gets a crew
  // there — spending it the moment it is granted would burn it on a hex they
  // are not standing on.
  p.siteBonus = 1;
  emit(state, "rainmaker_found", { player: fid, hex: rm.siteHex, how, round: state.round });
  return true;
}

// A unit walked onto a hex. THE fairness guarantee, and the rule the notes say
// is most likely to be quietly violated: if the unit enters the site, the site
// is found, that turn, always.
//
// No gate of any kind sits in front of this — not fog, not a unit type, not an
// action, not a search-progress threshold, not whether the narrowing has reached
// that region, and not whether the faction had engaged the line at all. A
// faction that stumbles onto it while doing something else joins the line by
// walking into it, which costs them nothing they had and gives them nothing they
// have not earned: they still have no lab, and Stage 6 will ask for one.
export function onUnitEnteredHex(state, unit, hex) {
  const rm = rainmakerState(state);
  if (!rm || rm.foundBy || rm.phase === PHASE.ENDED) return false;
  if (hex !== rm.siteHex) return false;
  // The ONE thing in front of the guarantee, and it is not a gate on the
  // faction: before the myth surfaces there is nothing to find. Measured — with
  // no such rule, 5 of 12 real games had the site walked over by an ordinary
  // patrol in rounds 3 and 4, several rounds before the line was even offered,
  // which skipped the entire parallel phase, its race and its retained benefits
  // and handed the exclusive phase to whoever happened to be passing.
  //
  // Note what this is NOT: it is not per-faction, not per-stage, and not a
  // progress threshold. Once the myth is public, a faction that declined it
  // outright still finds the site by walking into it.
  if (!rm.mythOpened) return false;
  return findSite(state, unit.owner, "entered the hex");
}

// The round pulse: accrue, then check the ceiling.
export function tickSearch(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.foundBy || rm.phase === PHASE.ENDED) return;
  const searchers = Object.values(rm.progress).filter((p) => p.stage >= STAGE.SEARCH && !p.hunting);
  if (!searchers.length) return;
  if (rm.searchOpenedRound == null) rm.searchOpenedRound = state.round;
  for (const p of searchers) {
    p.search = Math.min(1, p.search + searchRate(state, p.fid));
  }
  // The ceiling, which applies to the player exactly as it does to an AI: a
  // player who has searched hardest must be able to win it. The line can never
  // stall the game.
  if (state.round - rm.searchOpenedRound < R().search.ceilingTurns) return;
  const best = searchers.reduce((a, b) => (!a || b.search > a.search
    || (b.search === a.search && b.fid < a.fid) ? b : a), null);
  if (best) findSite(state, best.fid, "search ceiling");
}

// The +1 sight the survey data bought, permanent and non-stacking. Read by
// visibility.js the same way the intel bonus is.
export function rainmakerSightBonus(state, fid) {
  const p = rainmakerState(state)?.progress?.[fid];
  return p?.retained?.sight ? R().retained.sightBonus : 0;
}

// --- the site (stage 4), where the exclusive phase opens --------------

// Who has units standing on the site right now.
function factionsOnSite(state) {
  const rm = rainmakerState(state);
  const here = new Set();
  for (const u of Object.values(state.units || {})) {
    if (u.node === rm.siteHex) here.add(u.owner);
  }
  return [...here].sort();
}

// Lift the device off the site and put it on somebody's shoulders.
//
// `damaged` is the fast partial extraction: it buys turns here and spends more
// of them at the installation, which is the second path Stage 4 owes the
// two-path rule. It is set AFTER the grant, because taking the device
// deliberately clears the previous holder's counters and this is not one of
// them — it is a property of the device, not of anyone's progress.
export function extractDevice(state, fid, { damaged = false } = {}) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.BURIED) return false;
  let best = null;
  for (const u of Object.values(state.units || {})) {
    if (u.owner !== fid || u.node !== rm.siteHex) continue;
    if (!best || u.strength > best.strength) best = u;
  }
  if (!best) return false;
  grantDevice(state, fid, {
    hex: rm.siteHex, carrierUid: best.uid,
    reason: damaged ? "extracted in a hurry" : "extracted",
  });
  rm.device.damaged = !!damaged;
  emit(state, "rainmaker_extracted", { player: fid, hex: rm.siteHex, damaged: !!damaged });
  return true;
}

// The second path at Stage 4: take it now and pay for it later. Available once
// the crew has been on site at all, so it is a shortcut rather than a way to
// skip the beat entirely.
export function extractEarly(state, fid) {
  const rm = rainmakerState(state);
  const p = rm?.progress?.[fid];
  if (!p || p.stage !== STAGE.SITE || (p.siteTurns || 0) < 1) return false;
  return extractDevice(state, fid, { damaged: true });
}

// The round pulse for the site. Understanding the thing before it can be moved
// is what makes its holder a stationary, publicly known target for the first
// time — so presence is the whole requirement, and losing the hex loses the
// work.
export function tickSite(state) {
  const rm = rainmakerState(state);
  if (!rm || !rm.foundBy || rm.device.status !== DEVICE.BURIED) return;
  if (rm.phase === PHASE.ENDED) return;
  const here = factionsOnSite(state);
  for (const p of Object.values(rm.progress)) {
    if (!here.includes(p.fid)) p.siteTurns = 0;
  }
  // Two factions standing on it are fighting over it, not studying it.
  if (here.length !== 1) return;
  const fid = here[0];
  const p = rm.progress[fid] || joinRainmaker(state, fid);
  if (!p) return;
  if (p.stage < STAGE.SITE) advanceStage(state, fid, STAGE.SITE);
  // The finder's head start — one free step, plus the couple of turns of
  // uncontested access that being first to the hex buys on its own.
  p.siteTurns = (p.siteTurns || 0) + 1 + (p.siteBonus || 0);
  p.siteBonus = 0;
  emit(state, "rainmaker_site_worked", { player: fid, turns: p.siteTurns });
  if (p.siteTurns >= R().stages.siteTurns) extractDevice(state, fid);
}

// --- the haul (stage 5) ----------------------------------------------

// A faction's seat, by hex. The convoy's destination, and the only place the
// device can be installed.
export function capitalHexOf(state, fid) {
  for (const loc of Object.values(state.locations || {})) {
    if (loc.controller !== fid) continue;
    if ((loc.chips || []).some((c) => state.chips?.[c]?.chipId === "capital")) return loc.hexId;
  }
  return null;
}

// The hex the convoy is standing on, or null if there is no convoy — the device
// is buried, installed, loose or gone. Everything that asks "is this the convoy"
// goes through here so no caller has to remember which statuses count.
export function convoyHex(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.CARRIED) return null;
  return rm.device.hex;
}

// Has the device already taken its one step this round? Each faction acts once
// per round, so per-round and per-turn are the same question asked from
// different ends, and the round is the one that cannot be reset by anything
// handing a unit a fresh movement budget mid-turn.
export function deviceMovedThisRound(state) {
  const rm = rainmakerState(state);
  return !!rm && rm.device.movedRound === state.round;
}

// The carrier moved. Drag the device with it, spend the convoy's step for the
// round, and check whether it just got home.
//
// The device is dragged rather than derived from the carrier's position because
// the two come apart the moment the carrier dies: a device whose hex is "wherever
// my carrier is" has nowhere to be once there is no carrier (notes §4).
export function onCarrierMoved(state, unit, to) {
  const rm = rainmakerState(state);
  if (!rm || !isHaulingDevice(state, unit)) return false;
  rm.device.hex = to;
  rm.device.movedRound = state.round;
  emit(state, "rainmaker_hauled", { player: unit.owner, unit: unit.uid, hex: to });
  const home = capitalHexOf(state, rm.device.owner);
  if (home && to === home) {
    rm.device.status = DEVICE.INSTALLED;
    rm.device.carrierUid = null;
    rm.claim = null;
    advanceStage(state, rm.device.owner, STAGE.INSTALL);
    emit(state, "rainmaker_delivered", { player: rm.device.owner, hex: to });
  }
  return true;
}

// The carrier is no longer standing on the device. Whatever moved it — a
// retreat off a lost contest, a redeploy, an effect nobody has written yet —
// the device does not go with it: it is not cargo, and a beaten escort leaving
// the field leaves the thing it was escorting behind (notes §4).
//
// A hook rather than a scan on every read, because the wrong answer here is
// silent: a device whose hex is stale reads as being somewhere it is not, and
// the next legitimate step teleports it across the gap.
export function reconcileCarrier(state, unitsByUid) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.CARRIED || !rm.device.carrierUid) return false;
  const carrier = unitsByUid[rm.device.carrierUid];
  if (carrier && carrier.node === rm.device.hex) return false;
  return looseDevice(state, {
    hex: rm.device.hex,
    reason: carrier ? "escort withdrew" : "escort destroyed",
  });
}

// --- the installation (stage 6) --------------------------------------

// The vulture toll. A lab in the DESTINATION CAPITAL, at full cost and full
// duration, whatever route you took to be standing here — built at Stage 1, or
// built now because you skipped Stage 1 and took the device off somebody who
// did not. It does not forbid the vulture strategy; it prices it, and prices it
// at the worst possible moment, when the holder is publicly known and standing
// still (design §6).
export function installBlocker(state, fid) {
  const rm = rainmakerState(state);
  const p = rm?.progress?.[fid];
  if (!p) return "not in the line";
  if (rm.device.owner !== fid || rm.device.status !== DEVICE.INSTALLED) return "the device is not home";
  const home = capitalHexOf(state, fid);
  if (!home || rm.device.hex !== home) return "the device is not in the capital";
  if (!labHexOf(state, fid, { capitalOnly: true })) return "no lab in the capital";
  return null;
}

// How long the fitting takes for this holder. A device pulled out in a hurry
// costs the difference here, which is where Stage 4's second path is paid for.
export function installTurnsNeeded(state) {
  const rm = rainmakerState(state);
  const cfg = R().stages;
  return cfg.installTurns + (rm?.device?.damaged ? cfg.damagedInstallPenalty : 0);
}

export function tickInstall(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase === PHASE.ENDED) return;
  const fid = rm.device.owner;
  if (!fid) return;
  const p = rm.progress[fid];
  if (!p || p.stage !== STAGE.INSTALL) return;
  if (installBlocker(state, fid)) return; // the lab is not there yet — nothing happens
  p.installTurns = (p.installTurns || 0) + 1;
  emit(state, "rainmaker_installing", { player: fid, turns: p.installTurns, needed: installTurnsNeeded(state) });
  if (p.installTurns >= installTurnsNeeded(state)) advanceStage(state, fid, STAGE.SPECIALIST);
}

// Storming the capital is the other way to take the device, and it takes it the
// same way the convoy does: the object and nothing else. The captor is holding
// it in somebody else's city, so they are at Stage 5 with their own haul ahead
// of them (notes §1).
export function onSettlementCaptured(state, hexId, victor) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.hex !== hexId) return false;
  if (rm.device.status === DEVICE.DESTROYED || rm.device.owner === victor) return false;
  let best = null;
  for (const u of Object.values(state.units || {})) {
    if (u.owner !== victor || u.node !== hexId) continue;
    if (!best || u.strength > best.strength) best = u;
  }
  return grantDevice(state, victor, {
    hex: hexId, carrierUid: best?.uid || null, reason: "stormed the capital",
  });
}

// --- the specialist (stage 7) ----------------------------------------

// Lazily created, so the record cannot be read off a fresh game and mined for
// what is coming. The backup in particular is not merely hidden from the UI —
// it does not exist as an object until the primary is permanently gone
// (notes §9).
function specialistState(state) {
  const rm = rainmakerState(state);
  if (!rm) return null;
  rm.specialist = rm.specialist || {
    heldBy: null,
    cost: R().specialist.hireCost,
    dead: false,
    onBackup: false,
    availableFrom: null,
  };
  return rm.specialist;
}

// Everything a faction is allowed to know about the specialist. Deliberately
// says nothing at all about a backup — not a reserved slot, not a count, not a
// flag — until one is actually in play.
export function specialistStanding(state) {
  const sp = rainmakerState(state)?.specialist;
  if (!sp) return { heldBy: null, cost: R().specialist.hireCost, engaged: false };
  const out = { heldBy: sp.heldBy, cost: sp.cost, engaged: true };
  // The PRESENCE of these keys is the reveal. Reporting `onBackup: false`
  // before one exists would be exactly the hint notes §9 forbids — not merely
  // absent from the UI, absent from anything a player can observe or infer —
  // and a caller reading a defined-but-false flag has already learned that a
  // second name is a thing this game has.
  if (sp.onBackup) {
    out.onBackup = true;
    if (sp.availableFrom != null) out.availableFrom = sp.availableFrom;
  }
  return out;
}

// The primary is gone for good. This is the ONLY thing that surfaces a second
// name, and "gone for good" is a narrow set: dead. Being held by a rival is not
// it — that is someone you cannot reach today and may outbid tomorrow.
function revealBackup(state, reason) {
  const sp = specialistState(state);
  if (sp.onBackup) return false;
  sp.onBackup = true;
  sp.dead = false;
  sp.heldBy = null;
  sp.cost = Math.round(R().specialist.hireCost * R().specialist.backupCostMultiplier);
  sp.availableFrom = state.round + R().specialist.backupDelayTurns;
  emit(state, "rainmaker_specialist_lost", { reason });
  return true;
}

function specialistReachable(state) {
  const sp = specialistState(state);
  if (sp.dead) return false;
  if (sp.availableFrom != null && state.round < sp.availableFrom) return false;
  return true;
}

// Path one: pay. Outbidding takes them off whoever has them, which is what
// makes this a lever for a faction with money and no army.
export function hireSpecialist(state, fid) {
  const sp = specialistState(state);
  if (!specialistReachable(state)) return false;
  if (sp.heldBy === fid) return true;
  const player = state.players?.[fid];
  // Scrap lives on `resource` — the fixtures for this were setting a `scrap`
  // field nobody reads, which is exactly the kind of green test that hides a
  // free hire.
  if (!player || (player.resource || 0) < sp.cost) return false;
  player.resource -= sp.cost;
  emit(state, "resource_spent", {
    player: fid, resource: "Resource", amount: sp.cost, source: "rainmaker-specialist",
  });
  const from = sp.heldBy;
  sp.heldBy = fid;
  sp.cost += R().specialist.outbidStep;
  emit(state, "rainmaker_specialist_secured", { player: fid, from: from || null, how: "hired" });
  return true;
}

// Path two: take. The faction's military weight against a fixed bar — and a
// botched attempt can kill them, which is the one door to the backup.
export function seizeSpecialist(state, fid, strength) {
  const sp = specialistState(state);
  if (!specialistReachable(state)) return false;
  if (sp.heldBy === fid) return true;
  const cfg = R().specialist;
  if (strength >= cfg.seizeDifficulty) {
    const from = sp.heldBy;
    sp.heldBy = fid;
    sp.cost += cfg.outbidStep;
    emit(state, "rainmaker_specialist_secured", { player: fid, from: from || null, how: "taken" });
    return true;
  }
  if (state.rng.next() < cfg.seizeKillChance) revealBackup(state, "killed in a botched seizure");
  return false;
}

// Stage 7 clears when the faction holding the device also holds the specialist.
export function tickSpecialist(state) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase === PHASE.ENDED) return;
  const fid = rm.device.owner;
  const p = fid && rm.progress[fid];
  if (!p || p.stage !== STAGE.SPECIALIST) return;
  const sp = rm.specialist;
  if (!sp || sp.heldBy !== fid) return;
  p.specialist = sp.onBackup ? "backup" : "primary";
  advanceStage(state, fid, STAGE.ACTIVATION);
}

// --- the claim lock (notes §3) ---------------------------------------

// Three things this is NOT, each of which is the natural way to write it and
// each of which is wrong:
//
//   * it is not vulnerability. The convoy is attackable from the moment it
//     leaves the site until it is inside a capital, claim or no claim. Writing
//     the lock as "attackable only while claimed" inverts the whole mechanism.
//   * it is not a settlement rule. Any number of factions may converge on a
//     settlement at once, which is the entire point of the Stage 8 siege.
//   * it is not indefinite. A claimant who sits on the claim without attacking
//     is griefing, so the window expires on its own.
//
// What it IS: a 2-round window in which only the claiming faction may engage,
// so a stalled convoy produces sequential duels rather than a six-way scrum.

// Why `fid` may not engage the convoy right now, or null if they may. A hex
// that is not the convoy is never locked, and neither is a settlement.
export function convoyLockedFor(state, fid) {
  const rm = rainmakerState(state);
  if (!rm) return null;
  const hex = convoyHex(state);
  if (!hex) return null;
  if (state.locations?.[hex]) return null; // settlements are exempt entirely
  const claim = rm.claim;
  // The convoy's own owner is never locked out. The lock is about who may
  // ENGAGE the convoy, and a holder fighting off whoever just walked onto its
  // hex is not engaging it — it is the thing being engaged.
  if (rm.device.owner === fid) return null;
  if (!claim || claim.by === fid) return null;
  if (state.round - claim.since >= R().transport.claimWindowRounds) return null;
  return claim.by;
}

// The first faction to engage takes the field alone. Claiming is a side effect
// of attacking rather than a separate move: the design's cost of claiming early
// is that you have committed, and a claim you could take without attacking
// would have no cost at all.
export function claimConvoy(state, fid) {
  const rm = rainmakerState(state);
  if (!rm || !convoyHex(state)) return false;
  if (convoyLockedFor(state, fid)) return false;
  if (rm.claim?.by === fid) return true;
  rm.claim = { by: fid, since: state.round };
  emit(state, "rainmaker_claimed", { player: fid, hex: convoyHex(state) });
  return true;
}

// Both ways a claim ends: the claimant engaged and was repulsed, or the window
// ran out with nothing to show. Either way the next claimant may step up —
// which is the release the notes ask to be defined explicitly, because a
// claimant able to hold the lock by declining to attack turns a fairness
// mechanism into a griefing tool.
export function releaseClaim(state, reason) {
  const rm = rainmakerState(state);
  if (!rm?.claim) return false;
  const { by } = rm.claim;
  rm.claim = null;
  emit(state, "rainmaker_claim_released", { player: by, reason });
  return true;
}

// Round-end: expire a claim whose window has run out.
export function tickClaim(state) {
  const rm = rainmakerState(state);
  if (!rm?.claim) return;
  if (!convoyHex(state)) { releaseClaim(state, "no convoy"); return; }
  if (state.round - rm.claim.since >= R().transport.claimWindowRounds) {
    releaseClaim(state, "window expired");
  }
}

// --- activation, the siege, and the hold (stage 8) --------------------

// Everything the switch does, and it does all of it at once. If these can come
// apart — production a round before the clock, or the siege arriving late — the
// balance breaks in the holder's favour, because the whole anti-runaway design
// rests on the device paying NOTHING until the moment it is contested
// (notes §8).
export function activate(state, fid) {
  const rm = rainmakerState(state);
  const p = rm?.progress?.[fid];
  if (!p || p.stage !== STAGE.ACTIVATION || rm.activatedBy) return false;
  if (rm.device.owner !== fid || rm.device.status !== DEVICE.INSTALLED) return false;
  const home = capitalHexOf(state, fid);
  if (!home || rm.device.hex !== home) return false;

  rm.activatedBy = fid;
  rm.activatedRound = state.round;
  // Everyone hears it, and everyone hears it now — the final siege has to be
  // foreseeable rather than a gotcha, because the player can lose to this.
  emit(state, "rainmaker_activated", {
    player: fid, hex: home, round: state.round, holdRounds: R().holdRounds,
  });
  raiseSiege(state, fid);
  return true;
}

// The device pays nothing before the switch. Not reduced output, not partial
// irrigation, nothing — the single most important balance rule in the design
// and the most tempting to soften when Stages 4-7 feel unrewarding. They are
// supposed to feel unrewarding.
export function rainmakerOutput(state, fid) {
  const rm = rainmakerState(state);
  if (!rm || rm.activatedBy !== fid) return 0;
  if (rm.device.status !== DEVICE.INSTALLED) return 0;
  return R().output.scrapPerTurn;
}

// Who is coming, and roughly how heavy. Symmetrical on purpose (design §7): the
// holder sees what is coming, and the attackers see that they are not alone,
// which turns converging on a defended capital into a decision rather than a
// reflex.
export function siegeIntent(state) {
  const rm = rainmakerState(state);
  if (!rm?.activatedBy) return null;
  const holder = rm.activatedBy;
  const committed = [];
  for (const fid of Object.keys(state.players || {})) {
    if (fid === holder || state.players[fid]?.eliminated) continue;
    if (!state.rainmakerSiege?.includes(fid)) continue;
    let weight = 0;
    for (const u of Object.values(state.units || {})) if (u.owner === fid) weight += u.strength || 0;
    committed.push({ fid, weight });
  }
  committed.sort((a, b) => b.weight - a.weight || a.fid.localeCompare(b.fid));
  return { holder, hex: rm.device.hex, committed, round: rm.activatedRound };
}

// The siege is made of RIVALS. The spawn is a floor and nothing more — it
// exists so a runaway leader with no surviving neighbours still gets tested
// rather than winning uncontested.
function raiseSiege(state, holder) {
  // Somebody sworn to the holder is not going to besiege them. Read through the
  // diplomacy layer rather than reimplemented here — "allied" has to mean the
  // same thing to the siege as it does to the dominion condition, or a leader
  // could be simultaneously unopposed and not unopposed.
  const rivals = Object.keys(state.players || {}).filter((f) =>
    f !== holder && !state.players[f]?.eliminated && !alliedToHolder(state, f, holder));
  state.rainmakerSiege = rivals;
  emit(state, "rainmaker_siege", { holder, besiegers: rivals });
  if (!rivals.length) {
    const splinter = raiseSplinter(state, holder);
    if (splinter) state.rainmakerSiege = [splinter];
  }
}

// Sworn to the holder, by pact or by vassalage. Injected rather than imported:
// this module is reached from movement.js and contest.js, both of which
// diplomacy.js sits above, and the codebase already resolves that shape by
// handing the reader down (see victory.js `registerAllyReader`).
let allyReader = () => false;
export function registerRainmakerAllyReader(fn) {
  if (typeof fn === "function") allyReader = fn;
}

// Making a unit is setup.js's job, and setup.js seeds this module — so the
// factory is handed down rather than imported, for the same reason the ally
// reader is.
let unitFactory = null;
export function registerUnitFactory(fn) {
  if (typeof fn === "function") unitFactory = fn;
}
function alliedToHolder(state, fid, holder) {
  try { return !!allyReader(state, fid, holder); } catch { return false; }
}

// Nobody left to test the holder, so somebody splits off to do it. A splinter of
// a real faction rather than a nameless mob — and never a splinter of the
// player's own house, which would read as the game inventing a grievance for
// them: the player's Versari gets a Free Plainer baron instead.
//
// It cannot be dealt with diplomatically. That is the point of a floor: a
// runaway leader who can buy off everything has already proved they can, so the
// last test is one that money does not answer.
export function raiseSplinter(state, holder) {
  const rm = rainmakerState(state);
  if (!rm || rm.splinterId) return null;
  const human = state.humanFactionId;
  const parentId = human === "versari" ? "plainers" : "versari";
  const parent = factionDef(parentId);
  const id = `${parentId}-splinter`;
  registerRuntimeFaction({
    id,
    name: parentId === "versari" ? "The Korad Schism" : "The Free Baronies",
    color: parent?.color || "#9a9a9a",
    tier: "splinter",
    scope: "global",
    playable: false,
    // Every diplomatic entry point asks this before offering anything.
    undiplomatic: true,
    temperament: "warlord",
    aggression: 1,
    trust: 0,
    grudge: 1,
    sociability: 0,
    victoryLean: "conquest",
    expansion: 0.5,
    unitNames: parentId === "versari"
      ? ["Schism Column", "Broken Adjuncts", "Korad Dissenters", "The Recusants"]
      : ["Baron's Levy", "Free Riders", "Dust Barons", "Flatwind Irregulars"],
  });
  rm.splinterId = id;
  seatSplinter(state, id, holder);
  // Sized against the holder's own army: the floor exists to TEST a runaway
  // leader, and a fixed force is either no test at all or an execution,
  // depending on how far they ran.
  let power = 0;
  for (const u of Object.values(state.units || {})) if (u.owner === holder) power += u.strength || 0;
  const per = Math.max(1, CONFIG.unit.baseStrength);
  const cfg = R().siege;
  const count = Math.max(cfg.minUnits,
    Math.min(cfg.maxUnits, Math.round((power * cfg.strengthShare) / per)));
  spawnSplinterForce(state, id, holder, count);
  emit(state, "splinter_rose", { faction: id, against: holder, from: parentId, units: count });
  return id;
}

// Give the splinter a seat, a standing row and an army. It is a real faction
// from here on — it takes turns, it is seen, it is fought — which is why it is
// built out of the same pieces every other faction is rather than as a special
// case the rest of the engine has to know about.
function seatSplinter(state, id, holder) {
  const seed = state.players[holder];
  state.players[id] = {
    id, factionId: id, isAI: true, isMinor: false, splinter: true,
    menace: 0, honor: 0, resource: 0, vp: 0, bankedVp: 0,
    tech: seed?.tech ?? 1,
    actions: { remaining: 0, max: 0 },
    research: 0, permanentResearch: 0, techLevel: seed?.techLevel ?? 1, techWheel: [],
    unitCap: 99, hand: [],
    tracks: { trust: 0, reputation: 0, alignment: 0 },
    flags: {}, activeQuests: {}, completedQuests: {}, encounterCooldowns: {},
  };
  // Seated immediately AFTER the holder, so the holder gets the full turn of
  // warning the design insists on before anything arrives (design §7).
  const at = state.turnOrder.indexOf(holder);
  state.turnOrder.splice(at + 1, 0, id);
  if (state.activeIndex > at) state.activeIndex += 1;

  state.factionStanding[id] = {};
  for (const f of state.turnOrder) {
    state.factionStanding[id][f] = f === holder ? -100 : 0;
    if (state.factionStanding[f]) state.factionStanding[f][id] = 0;
  }
}

// The units the splinter brings, placed on open ground within reach of the
// capital but never on it — an army that materialises inside the walls is not a
// siege, it is a coup, and the holder is owed a turn to redeploy.
export function spawnSplinterForce(state, id, holder, count) {
  const home = capitalHexOf(state, holder);
  if (!home || !unitFactory) return [];
  const d = bfsDistances(state.board.adjacency, home);
  const ring = Object.keys(state.board.hexes)
    .filter((h) => d[h] === R().siege.spawnDistance && !state.locations[h])
    .sort();
  if (!ring.length) return [];
  const made = [];
  for (let i = 0; i < count; i++) {
    const hex = ring[i % ring.length];
    const uid = `${id}-u${i}`;
    const u = unitFactory(state, uid, id, hex);
    if (!u) continue;
    state.units[uid] = u;
    made.push(uid);
  }
  emit(state, "rainmaker_siege_force", { faction: id, units: made.length, hex: ring[0] });
  return made;
}

// How many rounds are left on the Rainmaker's clock, or null if it is not
// running. Same shape as the dominion countdown, because they race each other.
export function rainmakerCountdown(state) {
  const rm = rainmakerState(state);
  if (!rm?.activatedBy || rm.activatedRound == null) return null;
  return Math.max(0, R().holdRounds - (state.round - rm.activatedRound));
}

// The clock. Broken by anything that takes the settlement or the device — both
// of which already clear `activatedBy` where they happen, so this only has to
// ask whether the holder is still standing where it switched the thing on.
export function checkRainmakerVictory(state) {
  const rm = rainmakerState(state);
  if (!rm || state.winnerId || !rm.activatedBy) return;
  const fid = rm.activatedBy;
  const home = capitalHexOf(state, fid);
  const stillHolding = !state.players[fid]?.eliminated
    && rm.device.status === DEVICE.INSTALLED
    && rm.device.owner === fid
    && home && rm.device.hex === home;
  if (!stillHolding) {
    rm.activatedBy = null;
    rm.activatedRound = null;
    state.rainmakerSiege = [];
    emit(state, "rainmaker_hold_broken", { player: fid });
    return;
  }
  if (state.round - rm.activatedRound < R().holdRounds) return;
  state.winnerId = fid;
  rm.phase = PHASE.ENDED;
  emit(state, "rainmaker_won", { player: fid, round: state.round });
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
