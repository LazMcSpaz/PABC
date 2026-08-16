// What colour a hex reads as: the tint its hologram burns, and the ring drawn
// round its top face. Both are pure functions of a hex, and both are needed by
// each of the two board level-of-detail paths (the full three-layer tile art
// and the flat polygon it collapses to when zoomed out), so they live here
// rather than inside either renderer.
//
// The board carries two different ownership signals and they mean different
// things, so they are resolved in order rather than merged:
//
//   1. A Location you fully hold is HARD ownership — it stays your colour even
//      if an enemy army is parked next door.
//   2. Everything else takes the Zone of Control owner (src/game/influence.js),
//      which is soft influence and shifts as armies move.
//   3. Anything else is unheld, and glows the neutral cyan the art ships with.
//
// A Location whose three sections are split between factions is CONTESTED: it
// gets no faction colour at all, because picking one of the two claimants
// would state something the game rules do not. It pulses instead.
import { fullController, holoColor, HOLO_NEUTRAL, ownerColor, theme } from "./data.js";

export function holoTint(hex) {
  if (hex.type === "location" && hex.control?.sections) {
    const ctrl = fullController(hex.control.sections);
    if (ctrl) return { color: holoColor(ctrl), owner: ctrl, contested: false };
    const claimants = new Set(hex.control.sections.filter((s) => s && s !== "neutral"));
    if (claimants.size > 1) return { color: HOLO_NEUTRAL, owner: null, contested: true };
    // Exactly one faction holds part of it and nobody contests: read the
    // partial hold as theirs, dimmed by the caller's own strength ramp.
    const [only] = claimants;
    if (only) return { color: holoColor(only), owner: only, contested: false };
  }
  if (hex.zocOwner) return { color: holoColor(hex.zocOwner), owner: hex.zocOwner, contested: false };
  return { color: HOLO_NEUTRAL, owner: null, contested: false };
}

// How hard the tint reads. Unheld ground stays deliberately cooler and dimmer
// than claimed ground — if neutral hexes glow as brightly as owned ones, the
// territory read that makes the whole board legible washes out.
export function tintStrength(hex, tint) {
  if (hex.fog === "unexplored") return 0;
  if (hex.fog === "explored") return 0.34;
  if (tint.contested) return 0.72;
  return tint.owner ? 1 : 0.62;
}

// The outline round a hex's top face, or null for no ring. Selection and
// reachability are transient answers to "what did I just click / where can this
// unit go", so they outrank the standing Zone-of-Control read; only one ring is
// ever drawn. Dashed means influence, solid means ownership, and a trespass
// (one of YOUR units standing on someone else's ground) burns hotter.
export function hexRing(hex, { selected, reachable } = {}) {
  if (selected) return { color: theme.accent, width: 2.6, dash: null, opacity: 1 };
  if (reachable) return { color: theme.good, width: 2.2, dash: null, opacity: 1 };
  if (hex.zocOwner && hex.fog !== "unexplored") {
    return {
      color: ownerColor(hex.zocOwner),
      width: hex.zocTrespassing ? 2.6 : 1.6,
      dash: hex.zocTrespassing ? "6 4" : "8 6",
      opacity: hex.zocTrespassing ? 1 : 0.7,
    };
  }
  return null;
}
