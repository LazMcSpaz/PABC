// Helpers for the recipient token vocabulary (schema §3).

import {
  SIMPLE_RECIPIENT_TOKENS,
  PARAMETERISED_RECIPIENT_TEMPLATES,
  FACTION_IDS,
} from "./schema.js";

export function parseRecipient(value) {
  if (value == null || value === "") return { kind: "empty" };
  if (SIMPLE_RECIPIENT_TOKENS.includes(value)) return { kind: "simple", token: value };
  if (FACTION_IDS.includes(value)) return { kind: "faction", fid: value };
  const idx = value.indexOf(":");
  if (idx > 0) {
    const head = value.slice(0, idx);
    const arg = value.slice(idx + 1);
    if (PARAMETERISED_RECIPIENT_TEMPLATES.includes(head)) {
      return { kind: "parameterised", template: head, arg };
    }
  }
  return { kind: "raw", value };
}

export function buildRecipient(parsed) {
  switch (parsed.kind) {
    case "empty":
      return "";
    case "simple":
      return parsed.token;
    case "faction":
      return parsed.fid;
    case "parameterised":
      return `${parsed.template}:${parsed.arg ?? ""}`;
    case "raw":
      return parsed.value ?? "";
    default:
      return "";
  }
}

export function isValidRecipient(value, { allowEmpty = false } = {}) {
  if (value == null || value === "") return allowEmpty;
  const p = parseRecipient(value);
  if (p.kind === "simple" || p.kind === "faction") return true;
  if (p.kind === "parameterised") return Boolean(p.arg);
  return false;
}
