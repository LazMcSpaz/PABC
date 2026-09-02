/**
 * audioContext.js — the single AudioContext the whole game shares.
 *
 * Music and one-shot effects both route through here so that (a) one user
 * gesture unlocks both, and (b) we don't burn a second hardware audio graph
 * on a page that only ever needs one. Browsers cap how many contexts a
 * document may create; a game that opens one per subsystem eventually goes
 * silent on a long session.
 */

let ctx = null;
let unavailable = false;

/** @returns {AudioContext|null} null only where Web Audio does not exist. */
export function getAudioContext() {
  if (ctx || unavailable || typeof window === "undefined") return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    unavailable = true;
    return null;
  }
  try {
    ctx = new Ctx();
  } catch {
    unavailable = true;
  }
  return ctx;
}

/** Safe to call on any gesture; a no-op if the context is already running. */
export function resumeAudioContext() {
  const c = getAudioContext();
  if (c && c.state === "suspended") c.resume?.().catch(() => {});
  return c;
}
