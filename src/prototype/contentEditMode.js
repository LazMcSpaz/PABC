// Content Edit Mode — the on/off switch and where the edits live between
// sessions.
//
// The engine's patch store (src/game/contentPatch.js) is deliberately pure
// in-memory state so the harness can drive it. This is the browser half:
// the toggle, localStorage, and the bridge that pushes a restored patch set
// back into the engine on load.
import { allPatches, loadPatches } from "../game/contentPatch.js";

const MODE_KEY = "pabc.contentEdit.on";
const PATCH_KEY = "pabc.contentEdit.patches";

export function readEditMode() {
  try { return localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
}
export function writeEditMode(on) {
  try { localStorage.setItem(MODE_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/**
 * Restore saved edits into the engine. Called once at startup, before the
 * first quest is offered, so a session resumes with the content as it was
 * left rather than reverting to the shipped corpus mid-playtest.
 */
export function restorePatches() {
  try {
    const raw = localStorage.getItem(PATCH_KEY);
    if (raw) loadPatches(JSON.parse(raw));
  } catch { /* nothing saved, or unreadable — the shipped corpus is the fallback */ }
}

/** Persist after every edit. Cheap: the store is small and rarely written. */
export function savePatches() {
  try { localStorage.setItem(PATCH_KEY, JSON.stringify(allPatches())); } catch { /* private mode */ }
}

export function forgetPatches() {
  try { localStorage.removeItem(PATCH_KEY); } catch { /* private mode */ }
}
