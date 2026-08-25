// Does every pane in the diplomacy drawer use the shared pane shape?
//
//   node scripts/check-drawer-panes.mjs
//   node scripts/check-drawer-panes.mjs --list
//
// WHY. The drawer has three kinds of view — the landing list, a faction's
// detail, and a "pane" (gift, deal, ultimatum, mediate, call). The landing and
// detail views each wrap their body in a padded scroll container. The pane
// branch does NOT: it renders the pane component straight into a bare flex
// column, on the understanding that every pane supplies its own
// `PaneHeader` + padded `pc-scroll` body.
//
// GiftPane didn't. It returned a bare `gap: 10` column, so it rendered flush
// against both drawer edges. On a desktop that is a 420px sidebar and the
// missing 16px reads as slightly cramped. On a phone the drawer IS the
// viewport, so the first and last characters of every line sat on the screen
// edge and the pane looked cut off — which is how it was found, on a real
// phone, months after it shipped.
//
// The shape is a convention with nothing enforcing it, and a convention that
// only breaks on one screen size is a convention that will break again. This
// asserts it. It is a source scan, not a render: the failure is structural —
// a pane that never calls PaneHeader cannot be padded no matter what the
// browser does — and a scan catches it without booting a game.
import { readFileSync } from "node:fs";

const SRC = "src/prototype/DiplomacyDrawer.jsx";
const text = readFileSync(SRC, "utf8");

let fail = 0;
const check = (n, ok, d) => {
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + (d ?? "")}`);
};

// --- which components does the pane branch actually mount? ----------------
// Read them off the `view === "pane"` block rather than from a hand-kept list,
// so a pane added tomorrow is covered the day it is added.
const paneBlockStart = text.indexOf('{view === "pane"');
if (paneBlockStart < 0) throw new Error("could not find the pane branch — has the drawer been restructured?");
// The branch ends at the next top-level view or the closing AnimatePresence.
const paneBlockEnd = text.indexOf("</AnimatePresence>", paneBlockStart);
const paneBlock = text.slice(paneBlockStart, paneBlockEnd);

const mounted = [...new Set(
  [...paneBlock.matchAll(/<([A-Z][A-Za-z]*Pane)\b/g)].map((m) => m[1]),
)].sort();

console.log(`\n  the pane branch mounts ${mounted.length}: ${mounted.join(", ")}\n`);
check("0. the pane branch mounts at least one pane", mounted.length > 0);

// --- read each component's source ----------------------------------------
function bodyOf(name) {
  const at = text.indexOf(`function ${name}(`);
  if (at < 0) return null;
  // Components are top-level, so the next line that is exactly "}" closes it.
  const end = text.indexOf("\n}\n", at);
  return text.slice(at, end < 0 ? text.length : end);
}

const missingHeader = [];
const missingPaddedBody = [];
const notFound = [];
const rows = [];

for (const name of mounted) {
  const body = bodyOf(name);
  if (!body) { notFound.push(name); continue; }
  const hasHeader = /<PaneHeader\b/.test(body);
  // A padded scroll body: the `pc-scroll` container the other panes use, with
  // a padding declaration inside the same style object. Matching the padding
  // and not just the class is the point — `pc-scroll` alone was never the bug.
  const scroll = body.match(/className="pc-scroll"\s+style=\{\{([\s\S]{0,220}?)\}\}/);
  const hasPaddedBody = Boolean(scroll && /padding:/.test(scroll[1]));
  if (!hasHeader) missingHeader.push(name);
  if (!hasPaddedBody) missingPaddedBody.push(name);
  rows.push({ name, hasHeader, hasPaddedBody });
}

check("1. every mounted pane component exists in this file", notFound.length === 0, notFound.join(", "));
check("2. every pane renders a PaneHeader — its title, its way back",
  missingHeader.length === 0,
  `${missingHeader.join(", ")} render no PaneHeader, so they have no back control of their own`);
check("3. every pane wraps its body in a padded pc-scroll container",
  missingPaddedBody.length === 0,
  `${missingPaddedBody.join(", ")} render flush to the drawer edge — on a phone the drawer is the viewport, ` +
  `so that is text on the screen edge`);

if (process.argv.includes("--list")) {
  console.log("\n=== pane by pane ===\n");
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(16)} header ${r.hasHeader ? "yes" : "NO "}   padded body ${r.hasPaddedBody ? "yes" : "NO "}`);
  }
}

console.log(`\n${fail ? `${fail} FAILED` : "every pane uses the shared shape"}`);
process.exit(fail ? 1 : 0);
