// What colour a hex's hologram burns, and why.
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
import { fullController, holoColor, HOLO_NEUTRAL } from "./data.js";

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
