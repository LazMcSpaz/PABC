// Authored effects and gates, in English.
//
// Two audiences, one renderer. The player-facing one is Content Edit Mode's
// "what does this choice actually do" line under each option; the authoring
// one is the editor panel, which has to show what it is about to change
// before and after. Both want the same thing — `{"type":"ADJUST_STANDING",
// "amount":5,"faction":"goldgrass"}` read back as "Goldgrass Coalition +5".
//
// This is deliberately NOT encounterOutcome.js. That one reads the event log
// after the fact and says what DID happen, with real numbers; this reads the
// authored data before the fact and says what WOULD. A CONTEST is one line
// here ("fight, their strength 5") and a dice replay there.
//
// Coverage: the authored corpus uses 23 of the engine's 49 effect types, and
// the ten commonest account for all but ~40 of ~1,330 uses. Every one of the
// 23 is named below; anything else — an engine type no content has reached
// for yet — falls back to a readable dump of its own parameters rather than
// being hidden, because a rule you cannot see is worse than an ugly one.
import { FACTIONS as UI_FACTIONS, resourceLabel } from "./data.js";
import { CHIPS as ENGINE_CHIPS } from "../game/content.js";
import { TECH_PATHS } from "../game/tech.js";

const faction = (id) => UI_FACTIONS[id]?.short || id || "someone";
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());
const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;

// The target token an effect acts on. Almost everything in the corpus is
// "active" (the player holding the card), which needs no saying — naming it
// on every row would bury the two dozen places the target is interesting.
function on(target) {
  if (!target || target === "active" || target === "active_player") return "";
  if (target === "triggering-unit") return " (the unit here)";
  if (target === "each_opponent") return " (each rival)";
  if (target === "all_players") return " (everyone)";
  return ` (${target})`;
}

// good / bad / flat. Used for colour, and for nothing else — an effect whose
// sign the author has not decided (a flag, a quest advance) is flat rather
// than guessed at.
function toneOf(amount) {
  if (typeof amount !== "number" || amount === 0) return "flat";
  return amount > 0 ? "good" : "bad";
}

/**
 * One authored effect → `{ text, tone, children }`.
 *
 * `children` carries nested branches (ROLL's success/failure, CONTEST's
 * win/lose, QUEUE_DEFERRED's payload) as `{ label, rows }`, so a caller can
 * indent them instead of flattening a decision tree into one sentence.
 *
 * Accepts both effect shapes: the authoring `{type, params:{…}}` and the
 * engine's flattened `{type, …params}`. content-loader.js flattens on the way
 * in, so a live game hands over the second, and a file on disk the first.
 */
export function describeEffect(raw) {
  if (!raw || typeof raw !== "object") return { text: String(raw), tone: "flat" };
  const e = raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
    ? { type: raw.type, ...raw.params } : raw;
  const kids = (label, list) => ({ label, rows: (list || []).map(describeEffect) });

  switch (e.type) {
    case "ADJUST_RESOURCE": {
      const n = e.amount ?? 0;
      return { text: `${signed(n)} ${resourceLabel(e.resource)}${on(e.target)}`, tone: toneOf(n) };
    }
    case "ADJUST_STANDING": {
      const n = e.amount ?? 0;
      return { text: `${faction(e.faction)} standing ${signed(n)}`, tone: toneOf(n) };
    }
    case "ADJUST_HONOR":
      return { text: `Honor ${signed(e.amount ?? 0)}${on(e.target)}`, tone: toneOf(e.amount) };
    case "ADJUST_MENACE":
      // Menace is the one track where up is bad.
      return { text: `Menace ${signed(e.amount ?? 0)}${on(e.target)}`, tone: toneOf(-(e.amount ?? 0)) };
    case "ADJUST_TRACK":
      return { text: `${cap(e.track)} ${signed(e.amount ?? 0)}${on(e.target)}`, tone: toneOf(e.amount) };
    case "ADJUST_BASE_STRENGTH": {
      const n = e.amount ?? 0;
      // −99 is the corpus's idiom for "this kills it" rather than a number
      // anybody intends to read.
      if (n <= -99) return { text: `destroys the unit${on(e.target)}`, tone: "bad" };
      return { text: `unit Strength ${signed(n)}${on(e.target)}`, tone: toneOf(n) };
    }
    case "MODIFY_STAT":
      return {
        text: `${signed(e.amount ?? 0)} ${e.stat}${e.duration ? ` for ${e.duration}` : ""}${on(e.target)}`,
        tone: toneOf(e.amount),
      };
    case "SET_PLAYER_FLAG":
      return {
        text: e.value === false ? `clears “${e.flag}”` : `remembers “${e.flag}”`,
        tone: "flat",
      };
    case "SET_FLAG":
      return { text: `sets ${e.flag}`, tone: "flat" };
    case "ADVANCE_QUEST":
      return { text: `the story goes on (${e.beatId})`, tone: "flat" };
    case "COMPLETE_QUEST":
      return { text: "the story ends here", tone: "flat" };
    case "START_QUEST":
      return { text: `begins ${e.questId}`, tone: "flat" };
    case "QUEUE_DEFERRED": {
      const when = e.delayRounds === 1 ? "next round" : `in ${plural(e.delayRounds ?? 0, "round")}`;
      const out = {
        text: e.satisfiedIfFlag
          ? `${when}, unless “${e.satisfiedIfFlag}” by then`
          : `${when}`,
        tone: "flat",
        children: [kids("then", e.effects)],
      };
      if (e.onMissed?.length) out.children.push(kids("if the deadline passes", e.onMissed));
      return out;
    }
    case "ROLL": {
      const odds = e.chance != null ? `${e.chance}%` : "a roll";
      return {
        text: `${odds} chance`,
        tone: "flat",
        children: [kids("if it holds", e.onSuccess), kids("if it fails", e.onFail)],
      };
    }
    case "CONTEST": {
      const allies = e.allyStrength ? `, allies +${e.allyStrength}` : "";
      return {
        text: `a fight — their strength ${e.opponentStrength ?? 0}${allies}`,
        tone: "flat",
        children: [kids("if you win", e.onWin), kids("if you lose", e.onLose)],
      };
    }
    case "PEEK":
      return { text: `look at ${plural(e.count ?? 1, "card")} of the ${e.deck || "deck"}`, tone: "good" };
    case "FORCE_CHOICE":
      return {
        text: "a further choice",
        tone: "flat",
        children: (e.options || []).map((o) => kids(o.label || o.id, o.effects)),
      };
    case "SURCHARGE":
      return {
        text: `${cap(e.action)} costs ${signed(e.extraCost ?? 0)} more${e.window ? ` (${e.window})` : ""}`,
        tone: "bad",
      };
    case "GRANT_SAFE_PASSAGE":
      return { text: `safe passage through ${(e.factions || [e.faction]).map(faction).join(", ")}`, tone: "good" };
    case "TAKE_UNIT":
      return { text: `a unit is away for ${plural(e.rounds ?? 1, "round")}`, tone: "bad" };
    case "PERSISTENT_VISION":
      return { text: `lasting sight of ${e.hex}`, tone: "good" };
    case "GRANT_VISION":
    case "REVEAL_REGION":
      return { text: "ground is revealed", tone: "good" };
    case "GRANT_CHIP":
      return { text: `gain ${ENGINE_CHIPS[e.chipId]?.name || e.chipId}`, tone: "good" };
    case "STRIP_CHIP":
    case "DISABLE_CHIP":
      return { text: "equipment is lost", tone: "bad" };
    case "SET_MOVEMENT":
      return {
        text: `movement set to ${e.value}${e.when === "next_turn" ? " next turn" : ""}`,
        tone: "bad",
      };
    case "ESTABLISH_DUAL_HOLDING":
      return { text: `${e.hex} is held jointly`, tone: "flat" };
    case "DELIVER_ENCOUNTER":
      return { text: `brings on ${e.encounterId}`, tone: "flat" };
    case "PLACE_ENCOUNTER":
      return { text: `puts ${e.encounterId} on the map`, tone: "flat" };
    case "MOVE_CARD":
      return { text: `moves ${plural(e.count ?? 1, "card")} ${e.from} → ${e.to}`, tone: "flat" };
    case "TRANSFER":
      return { text: `${plural(e.amount ?? 0, resourceLabel(e.resource))} changes hands`, tone: "flat" };
    case "SPAWN":
      return { text: "something arrives on the board", tone: "flat" };
    default: {
      // An engine effect no authored content has used yet. Named, with its
      // parameters, rather than swallowed.
      const params = Object.entries(e)
        .filter(([k]) => k !== "type" && k !== "id" && k !== "ordinal")
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
      return { text: `${e.type}${params ? ` (${params})` : ""}`, tone: "flat" };
    }
  }
}

/** Every effect on a choice, flattened to rows a card can list. */
export function describeEffects(effects) {
  return (effects || []).map(describeEffect);
}

// --- gates -------------------------------------------------------------
//
// The DSL the corpus actually uses is small: 190 `has_flag`, 39 `not`,
// 25 `all`, 23 comparisons, 11 `any`, 3 `has_tech`, 1 `has_chip`. Those get
// real sentences; anything else falls back to its own JSON, which is at least
// the truth.

const OP_WORDS = {
  eq: "is", ne: "is not", gt: "is over", gte: "is at least",
  lt: "is under", lte: "is at most",
};

/** A condition → one English line. `null` means "nothing gates this". */
export function describeCondition(c) {
  if (c == null) return "always available";
  if (typeof c !== "object") return String(c);

  if (c.all) return c.all.map(describeCondition).join(" AND ");
  if (c.any) return c.any.map(describeCondition).join(" OR ");
  if (c.not) return `NOT (${describeCondition(c.not)})`;

  if (c.has_flag) {
    const who = c.has_flag.player === "active" ? "you" : faction(c.has_flag.player);
    return `${who} remember “${c.has_flag.flag}”`;
  }
  if (c.has_tech) {
    const path = TECH_PATHS[c.has_tech.path];
    return `you hold ${path?.name || c.has_tech.path}${c.has_tech.branch ? ` · ${c.has_tech.branch}` : ""} tech`;
  }
  if (c.has_chip) {
    const ids = [].concat(c.has_chip.chipId || []);
    const names = ids.map((i) => ENGINE_CHIPS[i]?.name || i).join(" or ");
    return `${c.has_chip.holder || "somewhere"} has ${names}`;
  }
  if (c.quest_active) return `${c.quest_active.questId ?? c.quest_active} is under way`;
  if (c.quest_completed) return `${c.quest_completed.questId ?? c.quest_completed} is finished`;
  if (c.op !== undefined || c.left !== undefined) {
    const side = (v) => (v === "active" ? "your faction" : String(v));
    return `${side(c.left)} ${OP_WORDS[c.op] || c.op} ${side(c.right)}`;
  }
  return JSON.stringify(c);
}
