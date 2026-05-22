// Unit stat recomputation. Effective Strength / Movement = base +
// installed-chip bonuses + active modifiers (from MODIFY_STAT).
import { CHIPS } from "./content.js";
import { CONFIG } from "./config.js";
import { emit } from "./events.js";
import { TECH_NODES, hasTechNode, prereqMet } from "./tech.js";

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

    // §17.5 Logistics entry (Supply Lines): +1 Movement to the owner's units.
    if (hasTechNode(state, unit.owner, "log-entry")) {
      movement += TECH_NODES["log-entry"].effect.amount;
    }

    unit.strength = Math.max(0, strength);
    unit.movement = Math.max(0, movement);
  }
}

// §17.2 — derive Tech Level (1–5) from a Research total by fixed thresholds.
function bandLevel(research) {
  let level = 1;
  for (const t of CONFIG.tech.researchThresholds) if (research >= t) level += 1;
  return Math.min(level, CONFIG.tech.maxLevel);
}

// §17.2/§17.3 — recompute each player's Research (permanent floor + Research
// from Labs they fully control), re-band the Tech Level, and enforce the
// Ability-Point budget: a level drop peels the most-recently assigned wheel
// node (LIFO; leaves first, so a deeper node is never orphaned). Called
// after any change that can move research — Acquire, captureLocation,
// foothold decay, or an encounter's permanent grant.
export function recomputeResearch(state) {
  for (const p of Object.values(state.players)) {
    let labResearch = 0;
    for (const loc of Object.values(state.locations)) {
      if (loc.controller !== p.id) continue;
      for (const c of loc.chips) labResearch += CHIPS[state.chips[c]?.chipId]?.research || 0;
    }
    const research = (p.permanentResearch || 0) + labResearch;
    if (research !== p.research) {
      p.research = research;
      emit(state, "research_changed", { player: p.id, research });
    }
    const newLevel = bandLevel(research);
    if (newLevel !== p.techLevel) {
      p.techLevel = newLevel;
      emit(state, "tech_level_changed", { player: p.id, techLevel: newLevel });
    }
    const maxPoints = p.techLevel - 1; // one Ability Point per level past 1
    let peeled = false;
    while ((p.techWheel?.length || 0) > maxPoints) {
      const lost = p.techWheel.pop();
      emit(state, "tech_node_lost", { player: p.id, node: lost });
      peeled = true;
    }
    if (peeled) recomputeStats(state); // a peeled Logistics node changes movement
  }
}

// §17 — assign a wheel node for a player. Free of the Action budget (you
// spend Ability Points, earned by leveling). Validates a free point, no
// duplicate, and a satisfied prerequisite.
export function assignTechNode(state, pid, nodeId) {
  const p = state.players[pid];
  if (!p) return { ok: false, reason: "no such player" };
  if (!TECH_NODES[nodeId]) return { ok: false, reason: "no such tech node" };
  if (p.techWheel.includes(nodeId)) return { ok: false, reason: "already assigned" };
  if (p.techWheel.length >= p.techLevel - 1) return { ok: false, reason: "no Ability Points available" };
  if (!prereqMet(state, pid, nodeId)) return { ok: false, reason: "prerequisite not met" };
  p.techWheel.push(nodeId);
  emit(state, "tech_node_assigned", { player: pid, node: nodeId });
  recomputeStats(state); // a Logistics node changes unit movement at once
  return { ok: true, node: nodeId };
}
