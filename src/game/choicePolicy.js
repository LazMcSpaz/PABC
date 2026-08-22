// What an AI faction would do, faced with a card.
//
// Until now every AI seat answered every encounter and every quest beat with
// `choice 0` — the first eligible option, whatever it was. That is 134
// multi-choice cards in the corpus answered without looking. It also broke the
// balance loop Content Edit Mode exists to serve: retune a reward and only the
// human would respond to it.
//
// Two layers, in this order:
//
//   1. An authored override, when a specific faction should always do a
//      specific thing on a specific card (CHOICE_OVERRIDES below). The story's
//      thumb on the scale.
//   2. Otherwise, score every eligible choice against the faction's
//      temperament and take the best.
//
// The scorer is primary rather than the overrides, deliberately. Authored
// picks are exact but brittle: they say nothing about content written
// tomorrow, and — the reason that matters here — they do not move when a
// reward is edited, so the designer's tuning would stop reaching AI seats. The
// scorer reads whatever the effects currently say, including live edits.
//
// Weights hang off the authored `temperament` field rather than a table of
// faction ids, so the minors inherit a character for free: Clan Tempest is a
// warlord and fights like the Lakers, The Croppers are pacifists and trade
// like the Goldgrass. The numeric dials each faction already carries
// (aggression, sociability, trust) then modulate the profile, so two warlords
// are not identical.
import { factionDef } from "./content.js";
import { QUESTS, FIELD_ENCOUNTERS, WORLD_ENCOUNTERS } from "./content/index.js";
import { patchVersion } from "./contentPatch.js";

/**
 * Authored exceptions: `{ "<card id>": { "<faction id>": "<choice id>" } }`.
 *
 * Card ids are the ones everything else uses — `fe_the_silo` for an
 * encounter, `quest:q_massacre:beat:qb_mas_compound` for a beat. An entry here
 * wins outright, so use it where character beats arithmetic ("the Lakers
 * always take the wall, whatever it costs") and leave the rest to the scorer.
 *
 * An override naming a choice that is not eligible for that faction on that
 * card is ignored rather than forced — eligibility is the content's own
 * gating and must not be overridden by a preference.
 */
export const CHOICE_OVERRIDES = {};

/** Author one at runtime — for content packs and for the check scripts. */
export function setChoiceOverride(cardId, factionId, choiceId) {
  CHOICE_OVERRIDES[cardId] = { ...(CHOICE_OVERRIDES[cardId] || {}), [factionId]: choiceId };
}

// --- temperament profiles ----------------------------------------------
//
// One row per authored temperament. Every number is a weight on a currency
// the extractor below produces; `patience` is separate — it discounts
// anything that pays off later rather than now.
//
//   warlord      ground and Strength are the point; a fight is an opportunity,
//                not a cost. Standing is nearly worthless to him.
//   pacifist     scrap, research and goodwill. Menace is genuinely feared, and
//                a fight has to be worth it twice over before it is worth it.
//   schemer      information and leverage. Values a flag that opens later
//                doors far above the scrap in front of him, and is the most
//                patient of the five.
//   opportunist  takes what is on the table now. The low `patience` IS the
//                short-term thinking — a payoff three rounds out is worth
//                barely a third of the same payoff today.
//   honorable    keeps its word and cares what the board saw. Honor is its
//                own currency here.
const PROFILES = {
  warlord:     { scrap: 1.0, research: 0.4, vp: 3.0, standing: 0.25, honor: 0.2, menace: -0.1,
                 strength: 2.0, unitLoss: -6, intel: 0.4, doors: 0.6, risk:  0.7, story: 0.4, patience: 0.60 },
  pacifist:    { scrap: 1.4, research: 1.2, vp: 3.0, standing: 1.7,  honor: 1.2, menace: -1.6,
                 strength: 0.6, unitLoss: -11, intel: 0.5, doors: 0.8, risk: -1.1, story: 0.8, patience: 0.85 },
  schemer:     { scrap: 0.9, research: 1.4, vp: 3.0, standing: 1.1,  honor: 0.3, menace: -0.6,
                 strength: 0.8, unitLoss: -7, intel: 2.4, doors: 2.0, risk: -0.2, story: 1.2, patience: 0.95 },
  opportunist: { scrap: 1.7, research: 0.6, vp: 3.0, standing: 0.5,  honor: -0.1, menace: -0.3,
                 strength: 1.1, unitLoss: -6, intel: 0.6, doors: 0.3, risk:  0.3, story: 0.2, patience: 0.35 },
  honorable:   { scrap: 1.0, research: 0.8, vp: 3.0, standing: 1.2,  honor: 2.2, menace: -1.0,
                 strength: 1.0, unitLoss: -8, intel: 0.5, doors: 0.8, risk: -0.3, story: 0.8, patience: 0.80 },
};
const DEFAULT_PROFILE = PROFILES.opportunist;

/**
 * The profile for one faction: its temperament's row, bent by its own dials.
 *
 * Two warlords should not play identically. Aggression moves how a fight is
 * priced and how much a lost unit stings; sociability moves what goodwill is
 * worth; trust moves how much a promise of a later payoff is believed, which
 * is the same axis as patience.
 */
export function profileFor(pid) {
  const def = factionDef(pid);
  const base = PROFILES[def?.temperament] || DEFAULT_PROFILE;
  const aggression = def?.aggression ?? 0.5;
  const sociability = def?.sociability ?? 0.5;
  const trust = def?.trust ?? 0.5;
  return {
    ...base,
    // ±40% around the profile's own appetite for a fight.
    risk: base.risk + (aggression - 0.5) * 0.8,
    strength: base.strength * (0.7 + aggression * 0.6),
    unitLoss: base.unitLoss * (1.3 - aggression * 0.6),
    standing: base.standing * (0.5 + sociability),
    patience: Math.max(0.2, Math.min(0.98, base.patience * (0.7 + trust * 0.6))),
  };
}

// --- how much a flag is worth ------------------------------------------
//
// A flag has no intrinsic value; it is worth whatever later content gates on
// it. So rather than guessing, count: how many delivery gates and choice
// conditions across the whole corpus mention this flag? A flag nothing reads
// is bookkeeping. A flag six beats test is a key.
//
// Recomputed when the patch version moves, so a gate rewritten in Content Edit
// Mode changes what the AI thinks that flag is worth — the same balance loop
// the scorer exists to keep open.
let leverageCache = null;
let leverageAt = -1;

function flagLeverage() {
  const v = patchVersion();
  if (leverageCache && v === leverageAt) return leverageCache;
  const counts = new Map();
  const walk = (c) => {
    if (!c || typeof c !== "object") return;
    if (c.has_flag?.flag) counts.set(c.has_flag.flag, (counts.get(c.has_flag.flag) || 0) + 1);
    for (const k of ["all", "any"]) if (Array.isArray(c[k])) c[k].forEach(walk);
    if (c.not) walk(c.not);
  };
  for (const q of Object.values(QUESTS)) {
    for (const b of q.beats || []) {
      walk(b.deliverCondition || b.condition);
      for (const ch of b.choices || []) walk(ch.condition);
    }
  }
  for (const src of [FIELD_ENCOUNTERS, WORLD_ENCOUNTERS]) {
    for (const e of Object.values(src)) {
      walk(e.condition);
      for (const ch of e.choices || []) walk(ch.condition);
    }
  }
  leverageCache = counts;
  leverageAt = v;
  return counts;
}

// --- reading a choice into currencies ----------------------------------

const ZERO = () => ({
  scrap: 0, research: 0, vp: 0, standing: 0, honor: 0, menace: 0,
  strength: 0, unitLoss: 0, intel: 0, doors: 0, risk: 0, story: 0,
});
const add = (a, b, k = 1) => {
  for (const key of Object.keys(a)) a[key] += (b[key] || 0) * k;
  return a;
};

// Ties go to the attacker (effects.js CONTEST resolves `mine >= theirs`).
function contestWinChance(own, opponent, sides = 6) {
  let wins = 0;
  for (let a = 1; a <= sides; a++) for (let d = 1; d <= sides; d++) if (own + a >= opponent + d) wins++;
  return wins / (sides * sides);
}

// The Strength this player would bring to a narrative CONTEST — the same rule
// effects.js uses, so the AI prices the fight it will actually get.
function ownContestStrength(state, pid, ctx) {
  const source = state.units?.[ctx?.sourceUnit];
  if (source && source.owner === pid) return source.strength ?? 0;
  let best = 0;
  for (const u of Object.values(state.units || {})) {
    if (u.owner === pid && !u.seconded) best = Math.max(best, u.strength ?? 0);
  }
  return best;
}

// Only what lands on US. An effect aimed at rivals is read as its mirror:
// taking scrap off every opponent is worth something to a warlord and a
// schemer, and nothing to a pacifist, which the `menace`/`standing` weights
// already express — so it is folded in at a discount rather than given a
// currency of its own.
function mine(target) {
  if (!target || target === "active" || target === "active_player" || target === "claimant") return 1;
  if (target === "triggering-unit") return 1;
  if (target === "all_players") return 0.25;
  if (target === "each_opponent" || target === "random_opponent") return -0.35;
  return 0.5;
}

function accrue(state, pid, effects, ctx, patience, depth = 0) {
  const out = ZERO();
  if (depth > 4) return out; // authored trees are shallow; this is a backstop
  const lev = flagLeverage();

  for (const e of effects || []) {
    if (!e || typeof e !== "object") continue;
    const share = mine(e.target ?? e.player);
    switch (e.type) {
      case "ADJUST_RESOURCE": {
        const n = (e.amount || 0) * share;
        if (e.resource === "VP") out.vp += n;
        else if (e.resource === "Research" || e.resource === "Tech") out.research += n;
        else out.scrap += n;
        break;
      }
      case "ADJUST_STANDING": out.standing += (e.amount || 0) * share; break;
      case "ADJUST_HONOR":    out.honor    += (e.amount || 0) * share; break;
      case "ADJUST_MENACE":   out.menace   += (e.amount || 0) * share; break;
      case "ADJUST_TRACK":
        if (e.track === "honor") out.honor += (e.amount || 0) * share;
        else if (e.track === "menace") out.menace += (e.amount || 0) * share;
        else out.research += (e.amount || 0) * share * 0.5;
        break;
      case "ADJUST_BASE_STRENGTH": {
        const n = e.amount || 0;
        if (n <= -99) out.unitLoss += 1 * share;
        else out.strength += n * share;
        break;
      }
      case "MODIFY_STAT": out.strength += (e.amount || 0) * share * 0.5; break;
      case "TAKE_UNIT":   out.unitLoss += 0.5 * share; break;
      case "SET_PLAYER_FLAG":
        // Worth what the rest of the corpus reads off it.
        if (e.value !== false) out.doors += Math.min(lev.get(e.flag) || 0, 8) * share;
        break;
      case "PEEK":
      case "GRANT_VISION":
      case "REVEAL_REGION":
      case "PERSISTENT_VISION":
      case "PLANT_FALSE_INTEL":
        out.intel += 1 * share;
        break;
      case "GRANT_CHIP":  out.strength += 1 * share; break;
      case "STRIP_CHIP":
      case "DISABLE_CHIP": out.strength -= 1 * share; break;
      case "GRANT_SAFE_PASSAGE": out.standing += 1 * share; break;
      case "SET_MOVEMENT": out.strength -= 0.5 * share; break;
      case "ADVANCE_QUEST":
        // Keeping a story open is worth something to the patient and nothing
        // much to the opportunist — `story` carries that, not this number.
        out.story += 1;
        break;
      case "COMPLETE_QUEST": out.story -= 0.5; break;

      // --- branches: expected value, not the best case -------------------
      case "CONTEST": {
        const own = ownContestStrength(state, pid, ctx) + (e.allyStrength || 0);
        const p = contestWinChance(own, e.opponentStrength || 0);
        const win = accrue(state, pid, e.onWin, ctx, patience, depth + 1);
        const lose = accrue(state, pid, e.onLose, ctx, patience, depth + 1);
        add(out, win, p);
        add(out, lose, 1 - p);
        // A coin-flip is a coin-flip whichever way it lands; `risk` prices the
        // variance itself so a warlord can want the fight and a pacifist can
        // refuse the identical arithmetic.
        out.risk += 1 - Math.abs(p - 0.5) * 2;
        break;
      }
      case "ROLL": {
        const p = Math.max(0, Math.min(1, (e.chance ?? 0) / (e.sides ?? 100)));
        add(out, accrue(state, pid, e.onSuccess, ctx, patience, depth + 1), p);
        add(out, accrue(state, pid, e.onFail, ctx, patience, depth + 1), 1 - p);
        out.risk += 1 - Math.abs(p - 0.5) * 2;
        break;
      }
      case "QUEUE_DEFERRED": {
        // The whole point of `patience`. An opportunist discounts a payoff
        // three rounds out to roughly a third of its face value.
        const delay = Math.max(1, e.delayRounds ?? 1);
        add(out, accrue(state, pid, e.effects, ctx, patience, depth + 1), patience ** delay);
        add(out, accrue(state, pid, e.onMissed, ctx, patience, depth + 1), (patience ** delay) * 0.5);
        break;
      }
      case "FORCE_CHOICE": {
        // It will get to choose again, so price the best branch it could then
        // take rather than an average of options it would refuse.
        let best = null;
        for (const o of e.options || []) {
          const v = accrue(state, pid, o.effects, ctx, patience, depth + 1);
          if (!best || score(pid, v) > score(pid, best)) best = v;
        }
        if (best) add(out, best, 1);
        break;
      }
      default: break; // an effect nobody has priced yet is worth nothing, not a crash
    }
  }
  return out;
}

/** Dot the currencies with the faction's weights. */
export function score(pid, currencies) {
  const w = profileFor(pid);
  let s = 0;
  s += currencies.scrap * w.scrap;
  s += currencies.research * w.research;
  s += currencies.vp * w.vp;
  s += currencies.standing * w.standing;
  s += currencies.honor * w.honor;
  s += currencies.menace * w.menace;
  s += currencies.strength * w.strength;
  s += currencies.unitLoss * w.unitLoss;
  s += currencies.intel * w.intel;
  s += currencies.doors * w.doors;
  s += currencies.risk * w.risk;
  s += currencies.story * w.story;
  return s;
}

/** What one choice is worth to `pid`, in that faction's own terms. */
export function valueChoice(state, pid, choice, ctx = {}) {
  const w = profileFor(pid);
  return score(pid, accrue(state, pid, choice.effects, ctx, w.patience));
}

/**
 * The index into `eligible` that `pid` would take.
 *
 * Deterministic: equal scores fall to the earlier choice, so a replay of the
 * same seed makes the same decisions. Never throws and never returns an index
 * outside the list — a scorer that fails on odd content must degrade to the
 * old "first eligible" behaviour rather than take the turn down.
 */
export function pickChoice(state, pid, cardId, eligible, ctx = {}) {
  if (!eligible?.length) return 0;
  const authored = CHOICE_OVERRIDES[cardId]?.[pid];
  if (authored) {
    const i = eligible.findIndex((c) => c.id === authored);
    if (i >= 0) return i; // ignored when the named choice is not on offer
  }
  try {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < eligible.length; i++) {
      const v = valueChoice(state, pid, eligible[i], ctx);
      if (v > bestScore) { bestScore = v; bestIdx = i; }
    }
    return bestIdx;
  } catch {
    return 0;
  }
}
