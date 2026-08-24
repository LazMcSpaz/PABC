// The glossary gate.
//
//   node scripts/check-glossary.mjs
//   node scripts/check-glossary.mjs --list      (what each screen links, and where)
//
// WHY THIS EXISTS. A glossary is a promise made in two places at once — a
// word underlined on a screen, and an entry somewhere else that explains it —
// and nothing in JavaScript connects them. `<Term id="r-menace">` compiles
// whether or not `r-menace` exists; a renamed entry leaves an underlined word
// that does nothing, which is worse than never underlining it. So the link is
// checked here instead.
//
// It also enforces the two authoring rules from rules-glossary.js, because
// both are exactly the kind of rule that decays quietly:
//
//   · NUMBERS COME FROM CONFIG. Every figure in an entry must be a value the
//     engine actually holds. A hand-typed "costs 6 Sway" survives the config
//     changing; an interpolated one cannot. This is the same discipline as
//     docs/whats-in-the-game.md, applied to prose a player reads mid-game.
//
//   · EVERY ENTRY ANSWERS BOTH QUESTIONS. The brief was that an entry says
//     what the term affects AND what moves its value. An entry that defines a
//     word and stops is the failure mode this glossary exists to avoid, so
//     the two headings are structural and checked for.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONFIG } from "../src/game/config.js";
import { RULES_GLOSSARY } from "../src/game/content/rules-glossary.js";
import { REPO_WIKI_ENTRIES, WIKI_ENTRIES } from "../src/game/content/wiki-repo.js";
import { WIKI_ENTRIES as EXPORTED_WIKI_ENTRIES } from "../src/game/content/wiki.js";

let fail = 0;
const check = (n, ok, d) => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + (d ?? "")}`);
};

// The same index RichText builds at runtime — ids, terms and aliases, all
// lower-cased into one flat namespace.
function aliasIndex(entries) {
  const ix = {};
  for (const e of Object.values(entries)) {
    ix[String(e.id).toLowerCase()] = e.id;
    if (e.term) ix[String(e.term).toLowerCase()] = e.id;
    for (const a of e.aliases ?? []) ix[String(a).toLowerCase()] = e.id;
  }
  return ix;
}
const INDEX = aliasIndex(WIKI_ENTRIES);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = walk("src/prototype");

// --- 1. every underlined word on a screen has an entry behind it -----------
// Two spellings, because the screen uses both: `<Term id="…">` inline, and a
// `term="…"` prop on the four label primitives that carry most of the
// drawer's vocabulary.
const refs = [];
for (const file of SOURCES) {
  const text = readFileSync(file, "utf8");
  // Three spellings, because the screen uses three: `<Term id="…">` inline,
  // a `term="…"` prop on a label primitive, and `term: "…"` inside the object
  // literals that build the status pills. A dynamic `term={p.term}` is not
  // matched and cannot be — but the literal it was built from is, one line up,
  // which is where a rename would break it anyway.
  // The lookbehind matters: without it `entry.term : "—"` reads as a term
  // reference, because a property access and an object key are spelled the
  // same once you stop looking at what is to the left of the dot.
  for (const m of text.matchAll(/(?:<Term\s+id|(?<![.\w])term)\s*[:=]\s*\{?["']([^"']+)["']/g)) {
    refs.push({ file, id: m[1], line: text.slice(0, m.index).split("\n").length });
  }
}
const dangling = refs.filter((r) => !INDEX[r.id.toLowerCase()]);
check(`1. every glossary link on a screen resolves (${refs.length} links across ${
  new Set(refs.map((r) => r.file)).size} files)`,
  dangling.length === 0,
  dangling.map((d) => `${d.file}:${d.line} → ${d.id}`).join("\n        "));

// --- 2. no orphan entries -------------------------------------------------
// An entry nobody can reach is an entry nobody will read. Reachable means:
// linked from a screen, or cross-linked from the body of an entry that is
// itself reachable. So this walks the graph rather than checking one hop —
// `r-tolerance` is deliberately reachable only through `r-menace`, and that
// is fine.
const linkedFromScreens = new Set(refs.map((r) => INDEX[r.id.toLowerCase()]).filter(Boolean));
const bodyLinks = (body) =>
  [...String(body).matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)]
    .map((m) => INDEX[m[1].trim().toLowerCase()])
    .filter(Boolean);

const reachable = new Set();
const queue = [...linkedFromScreens];
while (queue.length) {
  const id = queue.pop();
  if (reachable.has(id)) continue;
  reachable.add(id);
  const e = WIKI_ENTRIES[id];
  if (e) for (const next of bodyLinks(e.body)) queue.push(next);
}
const orphans = Object.keys(RULES_GLOSSARY).filter((id) => !reachable.has(id));
check(`2. every rules entry is reachable from a screen (${reachable.size} reached)`,
  orphans.length === 0,
  `unreachable: ${orphans.join(", ")}`);

// --- 3. every cross-link inside a rules entry resolves ---------------------
const broken = [];
for (const e of Object.values(RULES_GLOSSARY)) {
  for (const m of String(e.body).matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)) {
    if (!INDEX[m[1].trim().toLowerCase()]) broken.push(`${e.id} → ${m[1]}`);
  }
}
check("3. every cross-link inside a rules entry resolves",
  broken.length === 0, broken.join("\n        "));

// --- 4. the rules glossary shares no name with the lore wiki --------------
// The wiki's alias index is one flat namespace, so a rules entry aliased
// "gift" would quietly shadow the lore entry on the Perceptive Gifts — or be
// shadowed by it, depending on merge order. Neither is acceptable, and the
// failure would be invisible: the word still underlines, it just opens the
// wrong article. Hence `r-` ids and this check.
const loreNames = new Set();
for (const e of [...Object.values(REPO_WIKI_ENTRIES), ...Object.values(EXPORTED_WIKI_ENTRIES)]) {
  loreNames.add(String(e.id).toLowerCase());
  if (e.term) loreNames.add(String(e.term).toLowerCase());
  for (const a of e.aliases ?? []) loreNames.add(String(a).toLowerCase());
}
const collisions = [];
for (const e of Object.values(RULES_GLOSSARY)) {
  for (const name of [e.id, e.term, ...(e.aliases ?? [])]) {
    if (loreNames.has(String(name).toLowerCase())) collisions.push(`${e.id}: "${name}"`);
  }
}
check(`4. no rules term collides with the lore wiki (${loreNames.size} lore names)`,
  collisions.length === 0, collisions.join("\n        "));

// --- 5. both questions answered -------------------------------------------
const missing = Object.values(RULES_GLOSSARY).filter(
  (e) => !e.body.includes("WHAT IT AFFECTS") || !e.body.includes("WHAT MOVES IT"),
);
check(`5. every entry says what it affects and what moves it (${Object.keys(RULES_GLOSSARY).length} entries)`,
  missing.length === 0,
  missing.map((e) => e.id).join(", "));

// --- 6. no figure is hand-typed -------------------------------------------
// Collect every number the engine holds, then read every number out of every
// body and demand it be one of them. Percentages are allowed to be a config
// fraction scaled up, since that is how an entry states odds.
//
// Small integers are exempt, and it is worth being honest about why rather
// than pretending the check is total: prose legitimately contains "three
// faces", "one round", "the second-strongest faction". Anything above the
// exemption is a real magnitude — a cost, a threshold, a penalty — and those
// are exactly the ones that go stale. The failure this catches is somebody
// writing "costs 6 Sway" instead of interpolating `S.courtUpkeep`.
const PROSE_MAX = 3;
const configNumbers = new Set();
(function collect(node) {
  if (typeof node === "number") {
    configNumbers.add(node);
    configNumbers.add(Math.round(node * 100));
    configNumbers.add(Math.round(node));
    return;
  }
  if (node && typeof node === "object") for (const v of Object.values(node)) collect(v);
})(CONFIG);
// Values an entry derives rather than quotes — the influence step, which is a
// sum of two config leaves and is stated as such in the entry itself.
for (const derived of [CONFIG.influence.factionBase + CONFIG.influence.loyaltyScale * 4]) {
  configNumbers.add(derived);
}

const strays = [];
for (const e of Object.values(RULES_GLOSSARY)) {
  for (const m of String(e.body).matchAll(/\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (n <= PROSE_MAX) continue;
    if (configNumbers.has(n)) continue;
    strays.push(`${e.id}: ${m[0]}`);
  }
}
check(`6. every figure in an entry comes from CONFIG (${configNumbers.size} engine values)`,
  strays.length === 0,
  `${strays.join("\n        ")}\n        (interpolate it from CONFIG rather than typing it)`);

// --- 7. nothing rendered as undefined -------------------------------------
// The failure mode of rule 6 done wrong: an interpolation naming a config
// path that moved renders the literal word "undefined" into an entry a player
// is reading. It has happened once already on this project.
const undef = Object.values(RULES_GLOSSARY).filter((e) => /undefined|NaN|\[object/.test(e.body));
check("7. no entry renders a broken interpolation",
  undef.length === 0, undef.map((e) => e.id).join(", "));

if (process.argv.includes("--list")) {
  console.log("\n=== what each screen links ===\n");
  const byFile = new Map();
  for (const r of refs) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  for (const [file, rs] of [...byFile].sort()) {
    console.log(`  ${file}`);
    for (const r of rs) console.log(`    :${String(r.line).padStart(4)}  ${r.id}`);
  }
  const viaBody = [...reachable].filter((id) => id.startsWith("r-") && !linkedFromScreens.has(id));
  console.log(`\n  reached only through another entry's body: ${viaBody.join(", ") || "none"}`);
}

console.log(`\n${fail ? `${fail} FAILED` : "glossary is sound"}`);
process.exit(fail ? 1 : 0);
