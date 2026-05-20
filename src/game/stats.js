// Unit stat recomputation. Effective Strength / Movement = base +
// installed-chip bonuses + active modifiers (from MODIFY_STAT).
import { CHIPS } from "./content.js";
import { CONFIG } from "./config.js";
import { emit } from "./events.js";

export function recomputeStats(state) {
  for (const unit of Object.values(state.units)) {
    let strength = unit.baseStrength;
    let movement = unit.baseMovement;

    for (const chipUid of unit.chips) {
      const inst = state.chips[chipUid];
      const def = inst && CHIPS[inst.chipId];
      if (def) {
        strength += def.strength || 0;
        movement += def.movement || 0;
      }
    }

    for (const m of state.modifiers) {
      if (m.target !== unit.uid) continue;
      if (m.stat === "Strength") strength += m.amount;
      if (m.stat === "Movement") movement += m.amount;
    }

    unit.strength = Math.max(0, strength);
    unit.movement = Math.max(0, movement);
  }
}

// Tech (§3) is the base start plus one per Labs chip in a player's
// fully-controlled locations. Called after any change that can shift
// either side — Acquire, captureLocation, foothold decay — and emits
// tech_changed for each player whose total moved.
export function recomputeTech(state) {
  for (const p of Object.values(state.players)) {
    let labs = 0;
    for (const loc of Object.values(state.locations)) {
      if (loc.controller !== p.id) continue;
      for (const c of loc.chips) if (state.chips[c]?.chipId === "labs") labs++;
    }
    const next = CONFIG.tech.start + labs;
    if (next !== p.tech) {
      p.tech = next;
      emit(state, "tech_changed", { player: p.id, tech: p.tech });
    }
  }
}
