// Lightweight condition / strength DSL evaluator. Grammar locked in
// docs/content-schema-v0.1.md §5; the editor authors against it and
// the engine interprets it here. Used by trigger conditions, trigger
// strength scoring, choice conditions, quest beat unlock predicates,
// and CANCEL.condition.
//
// Boolean expressions return bool; the named helpers (controls_count,
// control_duration) return ints — both usable as Vals in `op` predicates.

import { resolveTargets } from "./targeting.js";
import {
  menaceOf,
  honorOf,
  tolerance as dipTolerance,
  trustFloor as dipTrustFloor,
  recognitionScore,
} from "./diplomacy.js";

// Resolve a dot-path string against the engine state. Unknown paths
// return null. `null` in any numeric comparison renders the predicate
// false (§5).
export function resolvePath(state, path) {
  if (typeof path !== "string") return null;
  const parts = path.split(".");
  let cur = state;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return cur ?? null;
}

function resolvePlayer(state, tok, ctx) {
  if (state.players[tok]) return tok;
  return resolveTargets(state, tok, ctx)[0] ?? null;
}

// Evaluate a Val: literal | path expression | recursive Cond returning int.
function evalVal(state, val, ctx) {
  if (val == null) return null;
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (typeof val === "string") {
    // Dotted forms are paths; bare strings are literals.
    if (val.includes(".")) return resolvePath(state, val);
    return val;
  }
  if (typeof val === "object") return evalCond(state, val, ctx);
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
    return !!state.activeQuests?.[id];
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
    const chipId = h.chipId;
    if (!chipId) return false;
    const hex = h.hex != null && typeof h.hex === "string" && h.hex.includes(".")
      ? resolvePath(state, h.hex) : h.hex;
    const pid = h.player ? resolvePlayer(state, h.player, ctx) : ctx.sourcePlayer ?? null;
    const chipMatches = (uid) => state.chips?.[uid]?.chipId === chipId;
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
      case "any-location-on-hex": {
        if (!hex) return false;
        const loc = Object.values(state.locations).find((l) => l.hexId === hex);
        if (!loc) return false;
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

  // `score` — returns a diplomacy / reputation scalar.
  //   kind: "menace" | "honor" | "recognition"
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
      case "recognition": {
        const fid = resolvePlayer(state, s.player ?? s.faction ?? "active", ctx);
        return fid ? recognitionScore(state, fid).total : 0;
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
      case "trust_floor": {
        const observer = resolvePlayer(state, s.observer ?? s.player ?? s.faction ?? "active", ctx);
        return observer ? dipTrustFloor(state, observer) : 0;
      }
      default:
        return 0;
    }
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
