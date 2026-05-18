// Unit stat recomputation. Effective Strength / Movement = base +
// installed-chip bonuses + active modifiers (from MODIFY_STAT).
import { CHIPS } from "./content.js";

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
