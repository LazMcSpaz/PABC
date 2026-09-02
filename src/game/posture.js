// Posture — where a faction stands, said out loud before it is acted on.
// Diplomacy brief §5.
//
// THE DIAGNOSIS. PABC's diplomacy is not shallow, it is MUTE. Grievances with
// severity and place, witnessed reputation, per-observer tolerance, ultimatums
// with teeth, cedeable cities, counter-offers, an offer inbox with expiry,
// receipts on every reputation change — it has all of it. What it does not
// have is a faction that will tell you where it stands before it acts on it.
// Every complaint in the 2026-08-23 playtest (offers arrive unearned, wars
// come out of nowhere, the AI moves too fast, nothing has a motive) is a
// symptom of that one absence, and the genre research says so almost
// unanimously: Civ IV is still called the series' best diplomacy fifteen years
// on for the visible attitude breakdown, and Three Kingdoms flipped its
// sentiment from "the AI is arbitrary" to "the AI is strategic" by EXPOSING
// the same valuation model Rome II already used rather than changing it.
//
// WHAT ALREADY EXISTED, so this extends rather than invents. `queueHumanWarnings`
// + `warningReason` already telegraph a coming war to the human with a
// concrete, checkable cause, and `EnvoyModal`'s GRIEVANCE table already renders
// each cause in temperament voice. Posture is that machinery generalised: to
// every pair rather than faction->human, to every stance rather than the
// pre-war one, and decoupled from the Standing band that currently gates it.
//
// THE THREE PROPERTIES THAT MAKE IT WORK
//
// 1. It is SAID BEFORE IT IS ACTED ON. That is a turn-order fact, not a
//    display one: `takeAITurn` runs its action loop first and `manageDiplomacy`
//    last, and posture transitions computed in `runDiplomacyRound` land at
//    round END. As the code stood, a faction attacked you and only afterwards
//    got to say anything. `speakPosture` is hoisted to the top of the AI turn
//    (see ai.js) and `statedBeforeActedRounds` gates the acting on it. Without
//    the ordering change the entire telegraph argument is cosmetic.
//
// 2. Only SOME conditions pay. A condition the other party satisfies by doing
//    nothing must not mint Standing, or the courtship ladder becomes a faucet.
//    That is what `interests.js`'s `costly` column is for.
//
// 3. It is CITED. Every act carries the condition that produced it into the
//    feed and the audience box: "Grand Lakers declares war on Versari Korad —
//    they were told to leave Omara at round 7."
import { CONFIG } from "./config.js";
import { factionDef, LOCATIONS } from "./content.js";
import { emit } from "./events.js";
import { interestsOf, interestToward } from "./interests.js";

const D = () => CONFIG.diplomacy;
const P = () => CONFIG.diplomacy.posture;

export const POSTURES = ["Indifferent", "Watching", "Courting", "Warning", "Committed"];

// Injected, for the same leaf reason interests.js is injected.
let R = null;
export function registerPostureReaders(readers) { R = readers; }

export function postureBook(state) {
  const dip = state.diplomacy;
  return (dip.posture = dip.posture || {});
}

/** `observer`'s posture toward `subject`. Never null — an unset pair is Watching. */
export function postureOf(state, observer, subject) {
  const row = postureBook(state)[observer];
  return row?.[subject] || { kind: "Watching", condition: null, since: state.round, statedRound: null };
}

export function setPosture(state, observer, subject, kind, condition, { speak = false } = {}) {
  const book = postureBook(state);
  const row = (book[observer] ||= {});
  const prev = row[subject];
  const changed = !prev || prev.kind !== kind;
  row[subject] = {
    kind,
    condition: condition || null,
    since: changed ? state.round : (prev?.since ?? state.round),
    // `statedRound` is the round the posture was SPOKEN, not the round it was
    // computed. A posture nobody has heard cannot be acted on (§5, and audit
    // block 11), so a silent transition leaves this null until `speakPosture`
    // says it.
    statedRound: speak ? state.round : (changed ? null : (prev?.statedRound ?? null)),
  };
  if (changed) {
    emit(state, "posture_changed", {
      observer, subject, from: prev?.kind || null, to: kind,
      condition: condition ? conditionText(state, observer, subject, condition) : null,
    });
  }
  return row[subject];
}

// Has this posture been on the record long enough to act on? Audit block 11.
export function postureStated(state, observer, subject) {
  const p = postureOf(state, observer, subject);
  if (p.statedRound == null) return false;
  return state.round - p.statedRound >= (P().statedBeforeActedRounds ?? 0);
}

// --- the condition ----------------------------------------------------
//
// The load-bearing half. A posture is a SENTENCE WITH A SUBJECT, stored
// structurally and rendered as copy the way EnvoyModal's temperament tables
// already do. Derived from the top interest that involves this pair, so there
// is no authored copy per faction and the sentence cannot drift away from what
// the faction is actually doing.
export function conditionFor(state, observer, subject) {
  const want = interestToward(state, observer, subject);
  if (!want) return null;
  return {
    kind: want.kind,
    subject: want.subject,
    holder: want.holder || null,
    costly: want.costly,
    since: state.round,
  };
}

const PLACE = (state, hex) =>
  LOCATIONS[state.locations?.[hex]?.locationId]?.name || "that ground";
const NAME = (fid) => factionDef(fid)?.name || fid;

// One template per interest kind. Voice comes from the faction's temperament
// where it is cheap to do so; the SUBSTANCE is the same sentence either way,
// because a condition the player cannot check is not a condition.
export function conditionText(state, observer, subject, cond) {
  if (!cond) return null;
  const temper = factionDef(observer)?.temperament;
  switch (cond.kind) {
    case "reclaim": {
      const place = PLACE(state, cond.subject);
      return temper === "warlord"
        ? `Get off ${place}.`
        : `${place} is ours. Give it back.`;
    }
    case "redress":
      return temper === "honorable"
        ? `Make amends for what was done, and we can begin again.`
        : `You owe us for ${cond.grievance ? cond.grievance.replace(/-/g, " ") : "what was done"}.`;
    case "warHelp":
      return `Stand with us against ${NAME(cond.subject)}.`;
    case "routes":
      return `Open the road between us.`;
    case "quiet":
      return temper === "pacifist"
        ? `Your columns are in our fields. Take them home.`
        : `Get your soldiers off our ground.`;
    case "isolate":
      return `Stand clear of ${NAME(cond.subject)}.`;
    default:
      return null;
  }
}

// Is the condition currently HELD by the other party? Checked against the
// board, never against an intention — the same discipline the ultimatum design
// used ("the world is the check").
//
// Returns null when the condition cannot be evaluated (the subject is gone),
// which the caller treats as neither held nor broken.
export function conditionHeld(state, observer, subject, cond) {
  if (!cond || !R) return null;
  switch (cond.kind) {
    case "reclaim":
      // Held when the place is no longer in the other party's hands. It does
      // not have to come back to US — a third party taking it is not the
      // subject keeping faith, so this checks the subject specifically.
      return state.locations?.[cond.subject]?.controller !== subject;
    case "redress":
      return R.grievanceWeight(state, observer, subject) === 0;
    case "warHelp":
      return R.atWar(state, subject, cond.subject);
    case "routes":
      return !!R.tradingPactBetween(state, observer, subject);
    case "quiet":
      return R.unitsInTerritory(state, subject, observer).length === 0;
    case "isolate":
      return !R.arePacted(state, subject, cond.subject);
    default:
      return null;
  }
}

// --- the ladder -------------------------------------------------------
//
// Watching -> Courting        standing >= tiers.neutral, rep gates pass,
//                             sociability roll   (trigger unchanged)
//   on entry                  an OVERTURE, not an offer: states the condition,
//                             may carry a gift. No pact on the table.
//   each round                costly condition held  -> +courtStandingGain
//                             passive condition held -> no gain, no loss
//                             condition broken       -> back to Watching, and
//                                                       the faction says why
// Courting -> offers a pact   standing >= pactStandingReq AND Courting for
//                             >= courtRounds
//
// `driftStanding` fights this and the first draft of the brief missed it:
// every unpacted, non-warring pair drifts toward baseline at max(1, ...), so
// `courtStandingGain: 2` would net +1/round and 0 -> 6 would take six rounds
// rather than three. `courtDriftExempt` is the fix — a relationship somebody
// is actively working is not unreinforced, which is the whole meaning of the
// drift rule.
export function isCourting(state, observer, subject) {
  return postureOf(state, observer, subject).kind === "Courting";
}

// Either side's Courting unlocks the pact (economy §6.4 rule 2). Without this
// the human can be gated on a budget they do not control: if courtship costs
// Sway and only the AI's Courting counts, an AI that cannot afford to court
// means no pact is possible by any route and the diplomacy face goes from
// 1-in-15 to zero.
export function eitherCourting(state, a, b) {
  return isCourting(state, a, b) || isCourting(state, b, a);
}

// How long `observer` has been Courting `subject`, in rounds.
export function courtRounds(state, observer, subject) {
  const p = postureOf(state, observer, subject);
  if (p.kind !== "Courting") return 0;
  return state.round - p.since;
}

// --- the per-round recompute -----------------------------------------
//
// Runs once per round from `runDiplomacyRound`, BEFORE the acts. Computes
// transitions and condition outcomes; it does not speak — that is
// `speakPosture`, hoisted to the top of the AI's turn so a faction says where
// it stands before it acts rather than after its violence.
export function recomputePostures(state) {
  if (!R) return;
  const ids = R.factionIds(state);
  for (const observer of ids) {
    if (state.players[observer]?.eliminated) continue;
    for (const subject of ids) {
      if (observer === subject || state.players[subject]?.eliminated) continue;
      stepPair(state, observer, subject);
    }
  }
}

function stepPair(state, observer, subject) {
  const cur = postureOf(state, observer, subject);

  // Committed is not chosen — it is what being at war, in a coalition, or
  // bound by pact or vassalage MEANS. It overrides whatever was there.
  const bound = R.atWar(state, observer, subject)
    || R.arePacted(state, observer, subject)
    || R.vassalLord(state, observer) === subject
    || R.vassalLord(state, subject) === observer
    || (R.coalitionAgainst(state, subject)?.members || []).includes(observer);
  if (bound) {
    if (cur.kind !== "Committed") setPosture(state, observer, subject, "Committed", cur.condition);
    return;
  }
  if (cur.kind === "Committed") {
    // The commitment ended. Fall back to Watching rather than to whatever
    // preceded it — a war that just finished does not restore the courtship
    // that preceded it.
    setPosture(state, observer, subject, "Watching", null);
    return;
  }

  // Indifferent — nothing at stake. No contact, no claim, no interest that
  // involves them. It is the state that keeps the cadence quiet, and the one
  // §15 warns entrenches the silence around distant minors, which is why
  // `mayCourt` rather than `mayEngage` decides whether they are even a subject.
  const want = interestToward(state, observer, subject);
  const reachable = R.mayCourt(state, observer, subject);
  if (!want && !reachable) {
    if (cur.kind !== "Indifferent") setPosture(state, observer, subject, "Indifferent", null);
    return;
  }

  // A live condition is checked every round.
  if (cur.condition) {
    const held = conditionHeld(state, observer, subject, cur.condition);
    if (held === false) {
      const grace = P().conditionGraceRounds ?? 0;
      const broken = (cur.condition.brokenSince ?? state.round);
      cur.condition.brokenSince = broken;
      if (state.round - broken >= grace) {
        emit(state, "posture_condition_broken", {
          observer, subject, kind: cur.condition.kind,
          text: conditionText(state, observer, subject, cur.condition),
        });
        // A broken condition drops a courtship and hardens a warning.
        setPosture(state, observer, subject,
          cur.kind === "Courting" ? "Watching" : "Warning",
          cur.kind === "Courting" ? null : cur.condition);
        return;
      }
    } else if (held === true) {
      cur.condition.brokenSince = null;
      // §7.3 — only a COSTLY condition pays. A condition satisfied by doing
      // nothing ("stay off my lawn") would otherwise mint Standing every round
      // for changing nothing, and the ladder becomes a faucet.
      if (cur.kind === "Courting" && cur.condition.costly) {
        R.adjustStanding(state, observer, subject, P().courtStandingGain, "courtship");
      }
    }
  }

  // Transitions.
  const s = R.getStanding(state, observer, subject);
  const grievous = R.grievanceWeight(state, observer, subject) > 0
    || (want && (want.kind === "reclaim" || want.kind === "redress" || want.kind === "quiet"));

  if (cur.kind === "Courting") {
    // A courtship survives while the trigger that opened it still holds.
    if (s < D().tiers.neutral || !R.passesRepGates(state, observer, subject) || !reachable) {
      setPosture(state, observer, subject, "Watching", null);
    }
    return;
  }

  if (cur.kind === "Warning") {
    // A warning ends when the thing it was about does.
    if (!grievous) setPosture(state, observer, subject, "Watching", null);
    return;
  }

  // Watching / Indifferent -> Warning. Note what is NOT here: entering
  // Courting. A warning is a REACTION — somebody did something to you, and
  // holding your tongue about it is not a decision a faction gets to defer.
  // A courtship is an ACT: it is chosen, it is one of a bounded number of
  // initiatives a faction takes per round, and (economy §6.3) it is paid for
  // every round it runs. Entering it here as a per-round roll would make it a
  // mood that settles over the whole board — measured, roughly every eligible
  // pair inside four rounds — and a posture everyone holds toward everyone is
  // not a position.
  //
  // `beginCourtship` is the act. `manageDiplomacy` selects one.
  if (grievous && s < D().tiers.friendly) {
    setPosture(state, observer, subject, "Warning", conditionFor(state, observer, subject));
    return;
  }
  if (cur.kind !== "Watching") setPosture(state, observer, subject, "Watching", null);
}

// May `observer` open a courtship with `subject` right now? The trigger is
// unchanged from the brief's ladder: Standing at or above Neutral, rep gates
// pass, and they are reachable at all.
export function mayBeginCourtship(state, observer, subject) {
  if (!R || observer === subject) return false;
  if (state.players[subject]?.eliminated) return false;
  const cur = postureOf(state, observer, subject);
  if (cur.kind === "Courting" || cur.kind === "Committed") return false;
  if (!R.mayCourt(state, observer, subject)) return false;
  if (R.getStanding(state, observer, subject) < D().tiers.neutral) return false;
  return R.passesRepGates(state, observer, subject);
}

// Open one. An OVERTURE, not an offer: it states the condition and may carry a
// gift, but puts no pact on the table. That distinction is the middle the
// layer was missing — an alliance that costs 6 Standing and arrives on turn
// one out of a clear sky is unearned; the same 6 Standing after three rounds
// of a faction publicly courting you, naming a condition, and watching you
// keep it, is earned.
export function beginCourtship(state, observer, subject) {
  if (!mayBeginCourtship(state, observer, subject)) return false;
  setPosture(state, observer, subject, "Courting", conditionFor(state, observer, subject));
  return true;
}

// How attractive a courtship would be to `observer`, for the selection pass.
// Warm pairs first, sociable factions keener, and a faction that would
// actually complete the win condition with this partner keenest of all —
// courting somebody you are already going to have to fight is not a plan.
//
// THAT LAST CLAUSE WAS A COMMENT AND NOTHING ELSE until §2. The body read
// `sociability * warmth` and no more, which is close to the exact inverse of
// what Dominion asks for: the AI courted whoever it already liked most rather
// than whoever it still had to deal with, and a partner it was already allied
// to scored HIGHER than an outstanding rival, because being allied is what
// makes a pair warm. Sixty-one courtships opened per game against 1.6 minors
// allied or sworn at the end is what that looks like from the outside.
//
// `dominionValue` is the missing half: 0 for a faction already allied, sworn
// or dead, and cheapness-scaled in (0,1] for one still outstanding. The blend
// is written so `dominionWeight` 0 restores the old expression EXACTLY rather
// than approximately, and 1 hands the whole selection to the win condition
// with warmth left as the tie-break inside it.
export function courtshipScore(state, observer, subject) {
  if (!mayBeginCourtship(state, observer, subject)) return 0;
  const def = factionDef(observer) || {};
  const s = R.getStanding(state, observer, subject);
  const span = Math.max(1, D().pactStandingReq - D().tiers.neutral);
  // Closeness to the bar, in [0,1].
  const warmth = Math.max(0, Math.min(1, (s - D().tiers.neutral) / span));
  const appetite = (0.4 + (def.sociability ?? 0.5)) * (0.35 + warmth);
  const w = CONFIG.ai?.dominionWeight ?? 0;
  if (!w || !R.dominionValue) return appetite;
  return appetite * ((1 - w) + w * R.dominionValue(state, observer, subject));
}

// --- speaking ---------------------------------------------------------
//
// Hoisted to the TOP of the AI's turn (see `takeAITurn`), before `tryOneAction`.
// Obligations and transition announcements first; initiatives after the action
// loop. This is the ordering fix without which the whole telegraph argument is
// cosmetic — as the code stood, a faction attacked you and only afterwards got
// to say anything about it.
//
// Speaking is cheap and quiet: it stamps `statedRound` and emits. The feed and
// the drawer read it; nothing else changes. What it BUYS is that
// `postureStated` becomes true a round later, and the acts that matter are
// gated on it.
export function speakPosture(state, pid) {
  if (!R) return 0;
  let spoke = 0;
  const row = postureBook(state)[pid] || {};
  for (const subject of Object.keys(row)) {
    const p = row[subject];
    if (p.statedRound != null) continue;              // already on the record
    if (p.kind === "Watching" || p.kind === "Indifferent") continue; // nothing to announce
    if (state.players[subject]?.eliminated) continue;
    p.statedRound = state.round;
    emit(state, "posture_stated", {
      observer: pid, subject, kind: p.kind,
      condition: conditionText(state, pid, subject, p.condition),
    });
    spoke += 1;
  }
  return spoke;
}

// The sentence an act cites. "Grand Lakers declares war on Versari Korad —
// they were told to leave Omara at round 7." Returns null when there is
// nothing on the record, which is itself the answer: an act with no posture
// behind it is the thing this layer exists to stop.
export function postureCitation(state, observer, subject) {
  const p = postureOf(state, observer, subject);
  if (!p.condition || p.statedRound == null) return null;
  const text = conditionText(state, observer, subject, p.condition);
  if (!text) return null;
  return { text, statedRound: p.statedRound, kind: p.kind };
}

export { interestsOf };
