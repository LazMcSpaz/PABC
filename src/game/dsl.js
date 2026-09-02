// Lightweight condition / strength DSL evaluator. Grammar locked in
// docs/content-schema-v0.1.md §5; the editor authors against it and
// the engine interprets it here. Used by trigger conditions, trigger
// strength scoring, choice conditions, quest beat unlock predicates,
// and CANCEL.condition.
//
// Boolean expressions return bool; the named helpers (controls_count,
// control_duration) return ints — both usable as Vals in `op` predicates.

import { resolveTargets, resolveHex } from "./targeting.js";
import { TECH_NODES } from "./tech.js";
import {
  menaceOf,
  honorOf,
  tolerance as dipTolerance,
  trustFloor as dipTrustFloor,
  dominionStanding,
} from "./diplomacy.js";

// Resolve a dot-path string against the engine state. Unknown paths
// return null. `null` in any numeric comparison renders the predicate
// false (§5).
//
// The state object IS the root, so a leading `state.` segment is stripped:
// the schema doc (§5) documents `state.round`, and without this that path
// walks `state.state` and resolves to null. Both forms now work.
//
// Recipient tokens are substituted per-segment, so `players.active.vp`
// resolves against whoever `active` currently names instead of looking for
// a player literally called "active".
export function resolvePath(state, path, ctx = {}) {
  if (typeof path !== "string") return null;
  let parts = path.split(".");
  if (parts[0] === "state") parts = parts.slice(1);
  let cur = state;
  for (const raw of parts) {
    if (cur == null || typeof cur !== "object") return null;
    const p = TOKEN_SEGMENTS.has(raw) ? (resolvePlayer(state, raw, ctx) ?? raw) : raw;
    cur = cur[p];
  }
  return cur ?? null;
}

// Segments that name a player by token rather than by id. Kept narrow on
// purpose: only tokens that resolve to exactly one player belong here, so
// a path can never silently pick one of several.
const TOKEN_SEGMENTS = new Set([
  "active", "active_player", "self", "controller", "claimant",
  "triggering-player", "triggering_player",
]);

function resolvePlayer(state, tok, ctx) {
  if (state.players[tok]) return tok;
  // `ctx.asPlayer` evaluates a condition on behalf of somebody who is not
  // the active seat. Quest beat gates are the reason: they are checked from
  // the round-end pipeline, which runs AFTER endTurn has already wrapped
  // activeIndex back to seat 0 — so an authored gate reading
  // `{op:"ne", left:"active", right:"versari"}` was tested against seat 0
  // every single time, whoever the quest actually belonged to. Two quests
  // gated exactly that way could never open.
  if (ctx?.asPlayer && (tok === "active" || tok === "active_player" || tok == null)) {
    return ctx.asPlayer;
  }
  if (state.players[tok]) return tok;
  return resolveTargets(state, tok, ctx)[0] ?? null;
}

// Evaluate a Val:
//   number | boolean            → itself
//   { path: "..." }             → explicit path (unambiguous; preferred form)
//   object                      → recursive Cond returning an int
//   string containing "."       → path expression
//   string naming a player token→ that player's id
//   string naming a top-level
//     numeric/boolean state key → that value  (this is what makes `round` work)
//   any other string            → literal
//
// The bare-string cases exist because the dot heuristic alone cannot express
// a top-level scalar: `"round"` has no dot so it read as the literal string
// "round", and `"state.round"` walked a `state.state` that does not exist —
// so a round comparison was unwriteable in either form. Authored content
// used both. `{ path: "round" }` is the explicit escape for new content.
function evalVal(state, val, ctx) {
  if (val == null) return null;
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (typeof val === "object") {
    if (typeof val.path === "string") return resolvePath(state, val.path, ctx);
    return evalCond(state, val, ctx);
  }
  if (typeof val === "string") {
    if (val.includes(".")) return resolvePath(state, val, ctx);
    if (TOKEN_SEGMENTS.has(val)) return resolvePlayer(state, val, ctx) ?? val;
    // A bare word naming a top-level scalar on the state. Restricted to
    // numbers and booleans so a literal string can never be shadowed by an
    // unrelated state key (`phase`, `winnerId`, … stay literals).
    const top = state?.[val];
    if (typeof top === "number" || typeof top === "boolean") return top;
    return val;
  }
  return null;
}

function applyOp(op, left, right) {
  if (left == null || right == null) return false;
  switch (op) {
    case "eq":  return left === right;
    case "ne":  return left !== right;
    case "gt":  return left > right;
    case "gte": return left >= right;
    case "lt":  return left < right;
    case "lte": return left <= right;
    default:    return false;
  }
}

export function evalCond(state, cond, ctx = {}) {
  if (cond == null) return true;
  if (typeof cond === "boolean") return cond;
  // String-form conditions are the legacy keyword shortcuts handled by
  // events.js (`defender-owns-source`, etc.); the DSL works on objects.
  if (typeof cond !== "object") return false;

  if (cond.all) return cond.all.every((c) => evalCond(state, c, ctx));
  if (cond.any) return cond.any.some((c) => evalCond(state, c, ctx));
  if (cond.not !== undefined) return !evalCond(state, cond.not, ctx);

  if (cond.op) {
    const left = evalVal(state, cond.left, ctx);
    const right = evalVal(state, cond.right, ctx);
    return applyOp(cond.op, left, right);
  }

  if (cond.has_flag) {
    const pid = resolvePlayer(state, cond.has_flag.player, ctx);
    return !!state.players[pid]?.flags?.[cond.has_flag.flag]?.value;
  }

  if (cond.quest_active != null) {
    const id =
      typeof cond.quest_active === "string"
        ? cond.quest_active
        : cond.quest_active.questId;
    // Per player: "is this quest running FOR ME". A quest is no longer a
    // single global object, so asking whether it exists at all would answer a
    // different (and useless) question — whether anyone anywhere is on it.
    const qpid = resolvePlayer(state,
      (typeof cond.quest_active === "object" ? cond.quest_active.player : null), ctx);
    return Object.values(state.activeQuests || {})
      .some((r) => r.questId === id && r.claimant === qpid);
  }

  if (cond.quest_completed) {
    const pid = resolvePlayer(state, cond.quest_completed.player, ctx);
    return !!state.players[pid]?.completedQuests?.[cond.quest_completed.questId];
  }

  // Integer-returning helpers — usable wherever a Val is.
  if (cond.controls_count) {
    const pid = resolvePlayer(state, cond.controls_count.player, ctx);
    const sv = cond.controls_count.strategicValue;
    let n = 0;
    for (const loc of Object.values(state.locations)) {
      if (loc.controller !== pid) continue;
      if (sv && loc.strategicValue !== sv) continue;
      n++;
    }
    return n;
  }

  // §18.3 — "recipient's ZoC contains this hex". Defaults the faction to
  // the encounter recipient (ctx.sourcePlayer) and the hex to where the
  // encounter was drawn (ctx.sourceHex); both can be overridden. The
  // encounter-reveal "home advantage" hook (a ZoC-gated extra choice).
  if (cond.zoc_contains) {
    const z = cond.zoc_contains;
    const pid =
      z.faction || z.player
        ? resolvePlayer(state, z.faction || z.player, ctx)
        : ctx.sourcePlayer ?? null;
    let hex = z.hex ?? ctx.sourceHex ?? null;
    if (typeof hex === "string" && hex.includes(".")) hex = resolvePath(state, hex);
    if (!pid || !hex) return false;
    return (state.world?.zoc?.[hex] ?? null) === pid;
  }

  if (cond.control_duration) {
    const pid = resolvePlayer(state, cond.control_duration.player, ctx);
    const hex = cond.control_duration.hex;
    for (const h of state.world?.controlHistory || []) {
      if (h.hex === hex && h.controller === pid && h.toRound == null) {
        return state.round - h.fromRound;
      }
    }
    return 0;
  }

  // `has_chip` — true if a chip with `chipId` is installed in the scope
  // requested by `holder`. Holders:
  //   - "active-player-units"     : any unit owned by the resolved player
  //   - "active-player-locations" : any location owned by the resolved player
  //   - "any-unit-on-hex"         : any unit on `hex`
  //   - "any-location-on-hex"     : the location on `hex` (if any)
  if (cond.has_chip) {
    const h = cond.has_chip;
    // `chipId` accepts a single id OR a list of ids (matches any of them).
    // "Do you have a lab?" is a list question: `labs` and `advanced-lab` are
    // both labs, and content should not have to know which tier you built.
    const wanted = h.chipId == null ? null
      : new Set(Array.isArray(h.chipId) ? h.chipId : [h.chipId]);
    if (!wanted || wanted.size === 0) return false;
    const chipId = h.chipId;
    // `hex` accepts a symbolic token ("encounter-hex"), a dot-path, or a
    // literal id. Defaults to the hex this encounter fired on, which is the
    // overwhelmingly common intent for an on-hex scope.
    const hex = resolveHex(state, h.hex ?? "encounter-hex", ctx);
    const pid = h.player ? resolvePlayer(state, h.player, ctx) : ctx.sourcePlayer ?? null;
    const chipMatches = (uid) => wanted.has(state.chips?.[uid]?.chipId);
    switch (h.holder) {
      case "active-player-units": {
        if (!pid) return false;
        for (const u of Object.values(state.units)) {
          if (u.owner !== pid) continue;
          if ((u.chips || []).some(chipMatches)) return true;
        }
        return false;
      }
      case "active-player-locations": {
        if (!pid) return false;
        for (const loc of Object.values(state.locations)) {
          if (loc.controller !== pid) continue;
          if ((loc.chips || []).some(chipMatches)) return true;
        }
        return false;
      }
      case "any-unit-on-hex": {
        if (!hex) return false;
        for (const u of Object.values(state.units)) {
          if (u.node !== hex) continue;
          if ((u.chips || []).some(chipMatches)) return true;
        }
        return false;
      }
      // "Is there one of these HERE?" — the chip must be installed at the
      // named hex, not merely somewhere in the player's territory. That
      // distinction is the whole point for place-bound content: a lab
      // anywhere in your land cannot study THIS ruin; a lab built at it can.
      //
      // `player` is optional and adds an ownership requirement on top.
      case "location-on-hex":
      case "any-location-on-hex": {
        if (!hex) return false;
        const loc = state.locations?.[hex]
          || Object.values(state.locations).find((l) => l.hexId === hex);
        if (!loc) return false;
        if (h.player && loc.controller !== pid) return false;
        return (loc.chips || []).some(chipMatches);
      }
      default:
        return false;
    }
  }

  // `unit_count` — returns the count of units owned by `player`, optionally
  // filtered by `unitType` (the `type` field on the unit record).
  if (cond.unit_count) {
    const pid = resolvePlayer(state, cond.unit_count.player, ctx);
    if (!pid) return 0;
    const t = cond.unit_count.unitType || null;
    let n = 0;
    for (const u of Object.values(state.units)) {
      if (u.owner !== pid) continue;
      if (t && u.type !== t) continue;
      n++;
    }
    return n;
  }

  // --- capability predicates -------------------------------------------
  //
  // "Does this player have X?" across the three things a player can invest
  // in: technology, buildings, and installed chips. Content gates choices on
  // these ("you have a lab, so your technicians can open it carefully"), so
  // they must express the general question, not one hard-coded case.

  // `count_tech` — how many wheel nodes the player holds, optionally narrowed
  // to a path and/or a branch within it. Returns an int, usable as a Val.
  //
  //   { path: "intelligence" }              every node on the Intelligence path
  //   { path: "intelligence", branch: "b" } the Espionage branch only
  //   { layer: 3 }                          capstones only
  //
  // Branch is read off the node id suffix (`int-b1` → branch "b"); the entry
  // node belongs to no branch, so a branch query deliberately excludes it —
  // "invested in Espionage" means having gone down that fork, not merely
  // having opened the path.
  if (cond.count_tech) {
    const c = cond.count_tech;
    const pid = resolvePlayer(state, c.player ?? "active", ctx);
    const held = state.players?.[pid]?.techWheel || [];
    let n = 0;
    for (const id of held) {
      const node = TECH_NODES[id];
      if (!node) continue;
      if (c.path && node.path !== c.path) continue;
      if (c.layer != null && node.layer !== c.layer) continue;
      if (c.branch) {
        const m = /-([ab])\d$/.exec(id);
        if (!m || m[1] !== c.branch) continue;
      }
      n++;
    }
    return n;
  }

  // `has_tech` — the boolean form. `node` tests one specific node; otherwise
  // it counts via the same filters as `count_tech` and compares against
  // `minNodes` (default 1). `{ path: "intelligence", branch: "b" }` is
  // "has this player put anything into Espionage".
  if (cond.has_tech) {
    const c = cond.has_tech;
    const pid = resolvePlayer(state, c.player ?? "active", ctx);
    if (c.node) return !!state.players?.[pid]?.techWheel?.includes(c.node);
    const n = evalCond(state, { count_tech: c }, ctx);
    return n >= (c.minNodes ?? 1);
  }

  // `count_chips` — how many matching chip instances the player has installed,
  // across their Locations, their units, or both (`holder`, default "any").
  // `chipId` accepts an id or a list; `kind` filters by the chip def's kind
  // ("location" chips are the game's buildings). Returns an int.
  if (cond.count_chips) {
    const c = cond.count_chips;
    const pid = resolvePlayer(state, c.player ?? "active", ctx);
    if (!pid) return 0;
    const wanted = c.chipId == null ? null
      : new Set(Array.isArray(c.chipId) ? c.chipId : [c.chipId]);
    const holder = c.holder ?? "any";
    let n = 0;
    const tally = (uids) => {
      for (const uid of uids || []) {
        const inst = state.chips?.[uid];
        if (!inst) continue;
        if (c.includeDisabled !== true && inst.disabled) continue;
        if (wanted && !wanted.has(inst.chipId)) continue;
        n++;
      }
    };
    if (holder === "any" || holder === "locations") {
      for (const loc of Object.values(state.locations || {})) {
        if (loc.controller === pid) tally(loc.chips);
      }
    }
    if (holder === "any" || holder === "units") {
      for (const u of Object.values(state.units || {})) {
        if (u.owner === pid) tally(u.chips);
      }
    }
    // Place-scoped: only what is installed at one hex.
    if (holder === "location-on-hex" || holder === "at-hex") {
      const hex = resolveHex(state, c.hex ?? "encounter-hex", ctx);
      const loc = hex && (state.locations?.[hex]
        || Object.values(state.locations || {}).find((l) => l.hexId === hex));
      if (loc && (!c.player || loc.controller === pid)) tally(loc.chips);
    }
    return n;
  }

  // `count_flags` — how many of a player's flags whose name starts with
  // `prefix` are currently set. The content's moral ledger: every ruling the
  // player hands down writes one `rule_*` / `rule_hard_*` flag, and the gates
  // ask "have you ruled harshly at least twice?". Returns an int, so it is
  // usable anywhere a Val is.
  //
  // Only truthy flags count, and flag expiry (turn.js sweepPlayerFlags) has
  // already removed anything time-limited that lapsed, so this reads a live
  // tally rather than a historical one.
  if (cond.count_flags) {
    const c = cond.count_flags;
    const pid = resolvePlayer(state, c.player ?? "active", ctx);
    const flags = state.players?.[pid]?.flags;
    if (!flags) return 0;
    const prefix = c.prefix ?? "";
    let n = 0;
    for (const [name, rec] of Object.entries(flags)) {
      if (!name.startsWith(prefix)) continue;
      if (rec && rec.value) n++;
    }
    return n;
  }

  // `score` — returns a diplomacy / reputation scalar.
  //   kind: "menace" | "honor" | "dominion"
  //         (subject-keyed; resolved via `player`/`faction` token)
  //   kind: "standing"
  //         (matrix-keyed; `fromFaction` × `toFaction`)
  //   kind: "tolerance"
  //         (observer's Tolerance toward subject — needs both fids)
  //   kind: "trust_floor"
  //         (observer's Trust-floor — just the observer fid)
  if (cond.score) {
    const s = cond.score;
    switch (s.kind) {
      case "menace": {
        const fid = resolvePlayer(state, s.player ?? s.faction ?? "active", ctx);
        return fid ? menaceOf(state, fid) : 0;
      }
      case "honor": {
        const fid = resolvePlayer(state, s.player ?? s.faction ?? "active", ctx);
        return fid ? honorOf(state, fid) : 0;
      }
      // Renamed from "recognition" 2026-08-23 with the vestige. Recognition
      // was a weighted score against a threshold of 6 that never once decided
      // a game; Dominion is the one condition, and its score is simply how
      // many surviving rivals are your ally or your vassal. Zero content cost
      // — the only score.kind gates in the corpus are menace x2 and honor x1.
      case "dominion": {
        const fid = resolvePlayer(state, s.player ?? s.faction ?? "active", ctx);
        if (!fid) return 0;
        const st = dominionStanding(state, fid);
        return st.allied.length + st.vassals.length;
      }
      case "standing": {
        const from = resolvePlayer(state, s.fromFaction ?? "active", ctx);
        const to = resolvePlayer(state, s.toFaction, ctx);
        return state.factionStanding?.[from]?.[to] ?? 0;
      }
      case "tolerance": {
        const observer = resolvePlayer(state, s.observer ?? "active", ctx);
        const toward = resolvePlayer(state, s.toward ?? s.player ?? s.faction ?? "active", ctx);
        return observer && toward ? dipTolerance(state, observer, toward) : 0;
      }
      // What a faction can actually pay.
      //
      // The score vocabulary could read every reputation a faction had and
      // not the one number every player checks first. That was fine while
      // content only ever GRANTED resources; it stopped being fine the moment
      // a choice charged for something, because `ADJUST_RESOURCE` floors at
      // zero — so "costs 4 scrap" charges a player with 1 scrap exactly 1 and
      // hands them the same reward. A price nobody can fail to meet is not a
      // price. This is the gate that makes one real.
      //
      // `resource` names the pool ("Resource" for scrap, "Research", "VP"),
      // defaulting to scrap because that is what a cost almost always means.
      case "resource": {
        const fid = resolvePlayer(state, s.player ?? s.faction ?? "active", ctx);
        if (!fid) return 0;
        const p = state.players[fid];
        if (!p) return 0;
        const key = { Resource: "resource", Research: "research", VP: "vp" }[s.resource || "Resource"]
          || "resource";
        return p[key] ?? 0;
      }
      case "trust_floor": {
        const observer = resolvePlayer(state, s.observer ?? s.player ?? s.faction ?? "active", ctx);
        return observer ? dipTrustFloor(state, observer) : 0;
      }
      default:
        return 0;
    }
  }

  return unknownForm(state, cond);
}

// --- unknown-form handling -------------------------------------------
//
// This used to be a bare `return false`, and that one line is the shape of
// almost every silent failure this content import turned up: a condition the
// engine does not understand gates a choice, the gate reads false, the choice
// is filtered out of `eligible`, and the player simply never sees it. Nothing
// logs. `count_flags` sat undiscovered behind exactly this until the corpus
// was swept by hand.
//
// Failing closed is still the right RUNTIME behaviour — a typo in one gate
// should not take down the turn that evaluates it — but it must not be
// silent. So: warn once per distinct form, record it on the state for the
// harness and the content build to inspect, and offer a strict mode that
// throws for the places where loud-and-early is what you want (content
// validation, tests, CI).
let STRICT = false;

/** Throw on unrecognised condition forms instead of warning. */
export function setConditionStrictness(on) {
  STRICT = !!on;
}

/** Every unrecognised form seen so far, for assertions and build checks. */
export function unknownConditionForms(state) {
  return [...(state?.__unknownCondForms || [])];
}

const WARNED = new Set();

function unknownForm(state, cond) {
  const key = Object.keys(cond || {}).sort().join("+") || "(empty)";
  if (state) {
    state.__unknownCondForms = state.__unknownCondForms || new Set();
    state.__unknownCondForms.add(key);
  }
  const msg = `dsl: unrecognised condition form "${key}" — evaluated as false. `
    + `Add a handler in dsl.js or fix the authored condition.`;
  if (STRICT) throw new Error(msg);
  if (!WARNED.has(key)) {
    WARNED.add(key);
    // eslint-disable-next-line no-console
    console.warn(msg, JSON.stringify(cond)?.slice(0, 200));
  }
  return false;
}

// `triggerStrength` accepts the Cond grammar plus a top-level
// `if`-cascade that returns ints 1..5.
export function evalStrength(state, expr, ctx = {}) {
  if (typeof expr === "number") return expr;
  if (expr?.if && Array.isArray(expr.if)) {
    const arr = expr.if;
    let i = 0;
    while (i + 1 < arr.length) {
      if (evalCond(state, arr[i], ctx)) return evalStrength(state, arr[i + 1], ctx);
      i += 2;
    }
    // Odd-length: trailing element is the fallback.
    if (i < arr.length) return evalStrength(state, arr[i], ctx);
  }
  return 0;
}
