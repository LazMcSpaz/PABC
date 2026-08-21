// How an AI plays the Rainmaker (docs/rainmaker-questline-design.md §8).
//
// Scripted, not modelled. Each faction carries a DISPOSITION toward the line
// and acts on it; there is no utility model and no scoring pass, because four
// legible behaviours a player can read off the board are worth more here than a
// good one they cannot:
//
//   pursue   goes for it, and defends its own attempt
//   block    goes for whoever leads, and never for the device
//   ignore   stays out of it, but will take a device left lying around
//   sell     stays out of it and warms to whoever is winning
//
// The one hard requirement, from notes §10: because an AI can WIN this way, the
// pursue disposition has to be able to complete every stage — including the lab
// prerequisite and the specialist, neither of which can be abstracted into a
// percentage the way the search can. An AI that abstracts past the lab is not
// playing the same game as the player.
//
// Kept out of ai.js because that file is already the largest decision surface in
// the engine and this is a self-contained policy — but it is called from
// takeAITurn like everything else, and it spends the same actions.
import { CONFIG } from "./config.js";
import { factionDef } from "./content.js";
import { bfsDistances } from "./board.js";
import { emit } from "./events.js";
import {
  STAGE, PHASE, DEVICE, rainmakerState, progressFor, joinRainmaker,
  capitalHexOf, labHexOf, convoyHex, looseDeviceAt, mythIsOpen,
  extractEarly, hireSpecialist, seizeSpecialist, specialistStanding,
  activate, installBlocker, deviceCarrier, siegeIntent, destroyBlocker,
} from "./rainmaker.js";

export const DISPOSITION = { PURSUE: "pursue", BLOCK: "block", IGNORE: "ignore", SELL: "sell" };

// Temperament decides the leaning. A warlord blocks the leader, a schemer goes
// for it, an opportunist sells its position, a pacifist stays out — which is
// the same personality each faction already plays everything else with, so a
// player who has learned to read them does not have to learn a second table.
function leaning(fid) {
  const def = factionDef(fid);
  switch (def?.temperament) {
    case "warlord": return DISPOSITION.BLOCK;
    case "schemer": return DISPOSITION.PURSUE;
    case "opportunist": return DISPOSITION.SELL;
    case "pacifist": return DISPOSITION.IGNORE;
    case "honorable": return DISPOSITION.PURSUE;
    default: return DISPOSITION.IGNORE;
  }
}

// Re-rolled at progress thresholds rather than every turn, so a faction's
// posture is something a player can observe and rely on for a while. The
// thresholds are the two moments the situation genuinely changes: the site is
// found, and somebody switches the thing on.
function thresholdOf(state) {
  const rm = rainmakerState(state);
  if (!rm) return 0;
  if (rm.activatedBy) return 2;
  if (rm.foundBy) return 1;
  return 0;
}

export function dispositionOf(state, fid) {
  const rm = rainmakerState(state);
  if (!rm) return DISPOSITION.IGNORE;
  rm.dispositions = rm.dispositions || {};
  const at = thresholdOf(state);
  const held = rm.dispositions[fid];
  if (held && held.at === at) return held.kind;
  let kind = leaning(fid);
  // Once somebody is one beat from winning, nobody is neutral about it except
  // the faction that makes its living selling neutrality.
  if (at === 2 && kind === DISPOSITION.IGNORE) kind = DISPOSITION.BLOCK;
  rm.dispositions[fid] = { kind, at };
  if (!held || held.kind !== kind) emit(state, "rainmaker_disposition", { player: fid, kind, at });
  return kind;
}

// --- the pursue path, stage by stage ---------------------------------

// Where this faction wants its units, or null if the line is not asking
// anything of them this turn. Read by ai.js when it picks a move target, so a
// faction chasing the Rainmaker walks toward it instead of toward the nearest
// enemy town.
export function rainmakerGoal(state, pid) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase === PHASE.ENDED) return null;
  const kind = dispositionOf(state, pid);

  // A device lying unowned is worth a detour to anybody at all — that is what
  // "will opportunistically vulture" means, and it is the one thing even the
  // ignore disposition gets out of its chair for.
  if (rm.device.status === DEVICE.LOOSE) return rm.device.hex;

  // Under siege orders, everyone named goes for the capital.
  if (rm.activatedBy && rm.activatedBy !== pid && kind !== DISPOSITION.SELL) {
    const home = capitalHexOf(state, rm.activatedBy);
    if (home) return home;
  }

  // Carrying it: go home, one hex at a time.
  if (rm.device.owner === pid && rm.device.status === DEVICE.CARRIED) {
    return capitalHexOf(state, pid);
  }

  if (kind === DISPOSITION.PURSUE) {
    // The site, once it is public — before that there is nowhere to walk to,
    // because the AI's search is a counter rather than a patrol.
    if (rm.foundBy && rm.device.status === DEVICE.BURIED) return rm.siteHex;
  }

  if (kind === DISPOSITION.BLOCK) {
    // Whoever leads. The convoy in the open first, because that is the moment
    // it is worth hitting; failing that, wherever the device is sitting.
    const convoy = convoyHex(state);
    if (convoy && rm.device.owner !== pid) return convoy;
    if (rm.device.owner && rm.device.owner !== pid) return rm.device.hex;
  }
  return null;
}

// The stages an AI has to actually DO rather than walk to. Called once a turn.
export function manageRainmaker(state, pid, api) {
  const rm = rainmakerState(state);
  if (!rm || rm.phase === PHASE.ENDED) return false;
  if (state.players[pid]?.splinter) return false; // the splinter wants one thing

  const kind = dispositionOf(state, pid);

  // Join. A blocker joins too — it needs a record to be counted, and the design
  // is explicit that declining is never permanent anyway.
  if (mythIsOpen(state) && !progressFor(state, pid) && kind !== DISPOSITION.SELL) {
    joinRainmaker(state, pid);
  }
  const p = progressFor(state, pid);
  if (!p) return false;

  let did = false;

  // Stage 1 and Stage 6 are the same instruction from two directions: get a lab
  // built. This is the part that cannot be abstracted — an AI that skips it is
  // not playing the same game as the player.
  if (kind === DISPOSITION.PURSUE || rm.device.owner === pid) {
    if (wantsLab(state, pid, p)) did = api.buildLab(state, pid) || did;
  }

  // Stage 4: pull the device out early rather than sit on a hex a whole board
  // is walking toward, if the crew is under pressure.
  if (p.stage === STAGE.SITE && (p.siteTurns || 0) >= 1 && underPressure(state, pid, rm.siteHex)) {
    did = extractEarly(state, pid) || did;
  }

  // Stage 7: the specialist. Pay if it can, take if it cannot — which is the
  // two-path rule holding on the AI side as well as the player's.
  if (p.stage === STAGE.SPECIALIST || (kind === DISPOSITION.BLOCK && rm.specialist?.heldBy
    && rm.specialist.heldBy !== pid)) {
    did = secureSpecialist(state, pid) || did;
  }

  // Stage 8: switch it on. An AI that reaches here and does not throw the
  // switch is not a difficulty setting, it is a bug.
  if (p.stage === STAGE.ACTIVATION) did = activate(state, pid) || did;

  return did;
}

// Does this faction need a lab it does not have? Stage 1 wants one anywhere;
// Stage 6 wants one in the capital specifically and will not start without it.
// Would taking it be hopeless? Measured as the haul: from where the device is
// lying, how much further is this faction's capital than the nearest rival's.
// Carrying a one-hex-per-turn convoy past somebody who is closer to home than
// you are is not a plan, and a faction in that position would rather nobody had
// the thing at all.
//
// Position rather than money, and that took two measurements to get right.
// Denial was free at first and blockers ended the line in 10 of 30 games — it
// was simply the cheapest thing to do with a hex they were standing on. Pricing
// it at 25, 60, even 120 scrap changed nothing, because AI factions sit on a
// median 734 scrap by the late game and any "very high" price is noise to them.
// Gating on affording a lab instead swung it to 0 of 30 for the same reason:
// they can always afford one. The price is still right — it is a real cost to a
// PLAYER, who spends constantly — but what makes an AI think twice has to be
// whether it could plausibly win the race instead.
function hopelessHaul(state, pid) {
  const rm = rainmakerState(state);
  const home = capitalHexOf(state, pid);
  if (!home) return true; // nowhere to take it
  const d = bfsDistances(state.board.adjacency, rm.device.hex);
  const mine = d[home] ?? Infinity;
  let nearest = Infinity;
  for (const fid of Object.keys(state.players || {})) {
    if (fid === pid || state.players[fid]?.eliminated) continue;
    const theirs = capitalHexOf(state, fid);
    const dist = theirs ? (d[theirs] ?? Infinity) : Infinity;
    if (dist < nearest) nearest = dist;
  }
  if (!Number.isFinite(mine)) return true;
  if (!Number.isFinite(nearest)) return false;
  return mine > nearest + CONFIG.rainmaker.denialHaulMargin;
}

function wantsLab(state, pid, p) {
  if (p.stage === STAGE.INSTALL) return installBlocker(state, pid) === "no lab in the capital";
  if (p.stage <= STAGE.RESEARCH) return !labHexOf(state, pid);
  return false;
}

// Is somebody else's army within a step or two of the site? A crew that can see
// what is coming takes the damaged extraction rather than the third turn.
function underPressure(state, pid, hex) {
  const d = bfsDistances(state.board.adjacency, hex);
  for (const u of Object.values(state.units || {})) {
    if (u.owner === pid) continue;
    if ((d[u.node] ?? Infinity) <= 2) return true;
  }
  return false;
}

function secureSpecialist(state, pid) {
  const sp = specialistStanding(state);
  if (sp.heldBy === pid) return false;
  if ((state.players[pid]?.resource || 0) >= sp.cost) return hireSpecialist(state, pid);
  // No money: bring what it has instead. A botched attempt can kill them, which
  // is a real risk the AI is taking rather than a free reroll.
  let power = 0;
  for (const u of Object.values(state.units || {})) if (u.owner === pid) power += u.strength || 0;
  if (power < CONFIG.rainmaker.specialist.seizeDifficulty) return false;
  return seizeSpecialist(state, pid, power);
}

// Claiming a convoy is engaging it, so the AI does not "claim" as a move — it
// walks onto the hex and fights, and contest.js takes the claim on its behalf.
// What this answers is whether it should bother: a blocker outside somebody
// else's window should go and do something else this turn rather than stand in
// the road waiting for a turn it cannot take.
export function convoyIsWorthChasing(state, pid) {
  const hex = convoyHex(state);
  if (!hex) return false;
  const rm = rainmakerState(state);
  if (rm.device.owner === pid) return false;
  return !state.locations?.[hex];
}

// What the siege actually does with its turn, for the UI's readout and for the
// AI's own targeting. Thin wrapper so callers do not reach into rainmaker.js
// for something that is a policy question.
export function besiegers(state) {
  return siegeIntent(state)?.committed?.map((c) => c.fid) || [];
}

// The device sitting unowned within reach — the vulture's one job.
export function looseDeviceGoal(state, pid) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.LOOSE) return null;
  return looseDeviceAt(state, rm.device.hex) ? rm.device.hex : null;
}

// A unit standing on the loose device picks it up. Done as its own step rather
// than folded into movement, because arriving and claiming are two decisions —
// notes §5 gives the arriving faction a choice between taking it and destroying
// it, and an AI that could only ever take it would make the destroy path
// unreachable for everyone but the player.
export function claimLooseDevice(state, pid, api) {
  const rm = rainmakerState(state);
  if (!rm || rm.device.status !== DEVICE.LOOSE) return false;
  const here = Object.values(state.units || {})
    .filter((u) => u.owner === pid && u.node === rm.device.hex)
    .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
  if (!here) return false;
  const kind = dispositionOf(state, pid);
  // Take it, or end it.
  if (kind === DISPOSITION.BLOCK && hopelessHaul(state, pid) && !destroyBlocker(state, pid)) {
    return api.destroy(state, pid);
  }
  return api.take(state, pid, here);
}

export function carrierOf(state) {
  return deviceCarrier(state);
}
