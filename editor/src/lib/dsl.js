// DSL helpers for the structured condition builder.
// Mirrors §5 of docs/content-schema-v0.1.md.

import { DSL_OPS } from "./schema.js";

// ----- Empty-shape factories used by the builder UI -----

export function emptyCond(form = "op") {
  switch (form) {
    case "all":
      return { all: [] };
    case "any":
      return { any: [] };
    case "not":
      return { not: emptyCond("op") };
    case "op":
      return { op: "eq", left: 0, right: 0 };
    case "has_flag":
      return { has_flag: { player: "active", flag: "" } };
    case "quest_active":
      return { quest_active: "" };
    case "quest_completed":
      return { quest_completed: { player: "active", questId: "" } };
    case "controls_count":
      return { controls_count: { player: "active" } };
    case "control_duration":
      return { control_duration: { player: "active", hex: "" } };
    case "literal":
      return true;
    default:
      return { op: "eq", left: 0, right: 0 };
  }
}

export function condForm(c) {
  if (c === true || c === false) return "literal";
  if (c && typeof c === "object") {
    if ("all" in c) return "all";
    if ("any" in c) return "any";
    if ("not" in c) return "not";
    if ("op" in c) return "op";
    if ("has_flag" in c) return "has_flag";
    if ("quest_active" in c) return "quest_active";
    if ("quest_completed" in c) return "quest_completed";
    if ("controls_count" in c) return "controls_count";
    if ("control_duration" in c) return "control_duration";
  }
  return "unknown";
}

// ----- Validation -----

export function validateCond(c, errors = [], path = "") {
  const form = condForm(c);
  switch (form) {
    case "literal":
      return errors;
    case "all":
    case "any":
      if (!Array.isArray(c[form])) {
        errors.push(`${path}: ${form} must be an array`);
      } else {
        c[form].forEach((sub, i) => validateCond(sub, errors, `${path}.${form}[${i}]`));
      }
      return errors;
    case "not":
      validateCond(c.not, errors, `${path}.not`);
      return errors;
    case "op":
      if (!DSL_OPS.includes(c.op)) errors.push(`${path}: unknown op '${c.op}'`);
      validateVal(c.left, errors, `${path}.left`);
      validateVal(c.right, errors, `${path}.right`);
      return errors;
    case "has_flag":
      if (!c.has_flag?.flag) errors.push(`${path}.has_flag.flag required`);
      if (!c.has_flag?.player) errors.push(`${path}.has_flag.player required`);
      return errors;
    case "quest_active":
      if (!c.quest_active) errors.push(`${path}.quest_active: questId required`);
      return errors;
    case "quest_completed":
      if (!c.quest_completed?.questId) errors.push(`${path}.quest_completed.questId required`);
      return errors;
    case "controls_count":
      if (!c.controls_count?.player) errors.push(`${path}.controls_count.player required`);
      return errors;
    case "control_duration":
      if (!c.control_duration?.player) errors.push(`${path}.control_duration.player required`);
      if (!c.control_duration?.hex) errors.push(`${path}.control_duration.hex required`);
      return errors;
    default:
      errors.push(`${path}: unknown DSL form ${JSON.stringify(c)}`);
      return errors;
  }
}

function validateVal(v, errors, path) {
  const t = typeof v;
  if (t === "number" || t === "string" || t === "boolean") return;
  if (v && typeof v === "object") {
    // Cond returning an int — recurse
    validateCond(v, errors, path);
    return;
  }
  errors.push(`${path}: invalid value ${JSON.stringify(v)}`);
}

// ----- Strength expressions -----

export function isStrength(s) {
  if (typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= 5) return true;
  if (s && typeof s === "object" && Array.isArray(s.if)) return true;
  return false;
}

export function emptyStrength() {
  return 1;
}

export function emptyStrengthCascade() {
  return { if: [{ op: "eq", left: 0, right: 0 }, 1, 1] };
}

export function validateStrength(s, errors = [], path = "strength") {
  if (typeof s === "number") {
    if (!Number.isInteger(s) || s < 1 || s > 5) {
      errors.push(`${path}: must be integer 1..5`);
    }
    return errors;
  }
  if (s && typeof s === "object" && Array.isArray(s.if)) {
    const arr = s.if;
    if (arr.length < 1 || arr.length % 2 !== 1) {
      errors.push(`${path}: cascade must have odd length (pairs + fallback)`);
    }
    for (let i = 0; i < arr.length; i++) {
      if (i === arr.length - 1 || i % 2 === 1) {
        // value slot
        validateStrength(arr[i], errors, `${path}.if[${i}]`);
      } else {
        // cond slot
        validateCond(arr[i], errors, `${path}.if[${i}]`);
      }
    }
    return errors;
  }
  errors.push(`${path}: not a valid strength expression`);
  return errors;
}

// ----- Serialization -----

export function safeParseJson(text) {
  if (text == null || text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // sentinel: caller should treat as malformed
  }
}

export function stringifyOrNull(value) {
  if (value == null) return null;
  return JSON.stringify(value);
}
