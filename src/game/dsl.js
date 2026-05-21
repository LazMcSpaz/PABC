// Lightweight condition / strength DSL evaluator. Grammar locked in
// docs/content-schema-v0.1.md §5; the editor authors against it and
// the engine interprets it here. Used by trigger conditions, trigger
// strength scoring, choice conditions, quest beat unlock predicates,
// and CANCEL.condition.
//
// Boolean expressions return bool; the named helpers (controls_count,
// control_duration) return ints — both usable as Vals in `op` predicates.

import { resolveTargets } from "./targeting.js";

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
