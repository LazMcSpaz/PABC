// The contest resolver (mechanical-spec §9) — the unified primitive
// behind capturing Locations and raiding units. One unit's effective
// Strength plus 1d6 is set against a defender value plus 1d6; the
// defender wins ties. This chunk (Layer 3.2) covers Location capture and
// unit raids; Obstacle contests wire in with the encounter/obstacle
// content batch (no Obstacle state exists yet).
import { emit } from "./events.js";
import { openReactionWindow } from "./reactions.js";
import { CONFIG } from "./config.js";
import { CHIPS, LOCATIONS } from "./content.js";
import { recomputeStats, recomputeTech } from "./stats.js";
import { onLocationCaptured, onRaidWon } from "./standing.js";

const fail = (reason) => ({ ok: false, reason });

// Garrison Strength contributed by a Location's installed chips. No v0.1
// chip carries a structured `garrison` bonus yet, so this is 0 today —
// the hook is here for the content batch (e.g. Defense Turrets).
function chipGarrison(state, loc) {
  let g = 0;
  for (const c of loc.chips) g += CHIPS[state.chips[c]?.chipId]?.garrison || 0;
  return g;
}

// The strongest unit the controller has standing on a held Location's
// node, or null — a held Location's defence adds this unit's Strength.
function defendingUnit(state, loc) {
  let best = null;
  for (const u of Object.values(state.units)) {
    if (u.owner !== loc.controller || u.node !== loc.hexId) continue;
    if (!best || u.strength > best.strength) best = u;
  }
  return best;
}

// Classify what the unit is contesting on its node (§9): an enemy unit
// (raid) or the Location. Enforces the §9 restriction that a Location
// with neutral sections forces the contest onto its garrison.
function resolveTarget(state, pid, unit, params) {
  const node = unit.node;
  const loc = state.locations[node] || null;

  if (params.target && state.units[params.target]) {
    const tu = state.units[params.target];
    if (tu.node !== node) return fail("that unit is not on your unit's hex");
    if (tu.owner === pid) return fail("cannot raid your own unit");
    if (loc && loc.sections.includes("neutral"))
      return fail("reduce the garrison before raiding here");
    return { ok: true, kind: "raid", unit: tu, loc };
  }

  if (loc) {
    if (loc.sections.every((s) => s === pid))
      return fail("you already fully control this location");
    return { ok: true, kind: "location", loc };
  }

  const enemiesHere = Object.values(state.units).some(
    (u) => u.node === node && u.owner !== pid,
  );
  if (enemiesHere) return fail("specify which unit to raid (params.target)");
  return fail("nothing to contest on this hex");
}

// The defender's value before its die roll (§9).
function defenderValue(state, t) {
  if (t.kind === "raid") return t.unit.strength; // already includes chips
  const loc = t.loc;
  let v = loc.garrison + chipGarrison(state, loc);
  if (!loc.sections.includes("neutral")) {
    const du = defendingUnit(state, loc);
    if (du) v += du.strength;
  }
  return v;
}

// --- section meter (§6.3.1) -----------------------------------------
// A contest win flips exactly one section to the victor: a neutral
// section while any remain, otherwise one taken from the rival holding
// the most (ties → the victor's choice, via params.flipFrom).
function flipSection(state, loc, victor, params) {
  let idx = loc.sections.indexOf("neutral");
  if (idx < 0) {
    const counts = {};
    for (const s of loc.sections) if (s !== victor) counts[s] = (counts[s] || 0) + 1;
    let rival = params.flipFrom && counts[params.flipFrom] ? params.flipFrom : null;
    if (!rival) {
      let max = 0;
      for (const [p, c] of Object.entries(counts)) if (c > max) { max = c; rival = p; }
    }
    idx = loc.sections.indexOf(rival);
  }
  loc.sections[idx] = victor;
  emit(state, "section_flipped", { hex: loc.hexId, to: victor, cause: "contest" });
}

// Remove a chip from a Location, out of the game. A removed Capital also
// reverses the garrison / production bonus it granted at setup (§6.3.4).
function destroyLocationChip(state, loc, chipUid) {
  const i = loc.chips.indexOf(chipUid);
  if (i >= 0) loc.chips.splice(i, 1);
  state.removed.push(chipUid);
  if (state.chips[chipUid]?.chipId === "capital") {
    loc.garrison -= CONFIG.capital.garrisonBonus;
    loc.production = Math.max(0, loc.production - CONFIG.capital.productionBonus);
  }
}

// Full control has transferred (§6.3.3 / §6.3.4): the newest chip is
// destroyed, any Capital is removed (never inherited), the rest carry
// over, and the foothold activates at 0 for the new controller.
function captureLocation(state, loc, victor) {
  const from = loc.controller;
  if (loc.chips.length)
    destroyLocationChip(state, loc, loc.chips[loc.chips.length - 1]);
  for (const c of [...loc.chips])
    if (state.chips[c]?.chipId === "capital") destroyLocationChip(state, loc, c);

  loc.controller = victor;
  loc.footholdOwner = victor;
  loc.foothold = 0; // §6.3.2 — F activates at full control, starting at 0
  emit(state, "location_captured", { hex: loc.hexId, controller: victor, from });

  // VP is banked once per Location, on the FIRST capture only —
  // subsequent recaptures don't re-pay (loc.vpAwarded gates it). The
  // value comes from LOCATIONS[id].vpReward (1/2/3 by strategic
  // value). Sets winnerId if this push crosses the threshold.
  if (!loc.vpAwarded) {
    const reward = LOCATIONS[loc.locationId]?.vpReward || 0;
    if (reward > 0) {
      const p = state.players[victor];
      p.vp += reward;
      loc.vpAwarded = true;
      emit(state, "resource_gained", {
        player: victor, resource: "VP", amount: reward, source: "capture",
      });
      if (p.vp >= CONFIG.vpThreshold && !state.winnerId) {
        state.winnerId = victor;
      }
    }
  }

  // Control changed; a Labs chip on this location may have changed
  // hands or been destroyed — sync Tech for everyone (§3).
  recomputeTech(state);
  // §15.3 — the affiliated faction (if any) loses standing toward
  // the new controller.
  onLocationCaptured(state, loc.hexId, victor, from);
}

function resolveLocationWin(state, pid, loc, params) {
  flipSection(state, loc, pid, params);
  if (loc.sections.every((s) => s === pid)) captureLocation(state, loc, pid);
}

// Slots a chip list occupies (Capital counts as 1).
function slotsUsedOf(state, chipUids) {
  let n = 0;
  for (const c of chipUids) {
    const id = state.chips[c]?.chipId;
    n += id === "capital" ? 1 : CHIPS[id]?.slots ?? 1;
  }
  return n;
}

// Greedy salvage default (§16.4): take the dead unit's chips in order,
// as many as fit in `bayFree` slots. Capital is never salvageable.
function autoSalvage(state, chips, bayFree) {
  const taken = [];
  let free = bayFree;
  for (const c of chips) {
    if (state.chips[c]?.chipId === "capital") continue;
    const sl = CHIPS[state.chips[c]?.chipId]?.slots ?? 1;
    if (sl <= free) { taken.push(c); free -= sl; }
  }
  return taken;
}

// §16.4 — remove a unit from play. If a `killer` unit exists and the dead
// unit carried chips, the killer salvages up to its free Bay space (the
// rest are scrapped); a garrison / null killer scraps everything.
export function destroyUnit(state, unitUid, killerUid, ctx = {}) {
  const dead = state.units[unitUid];
  if (!dead) return;
  const chips = dead.chips.filter((c) => state.chips[c]?.chipId !== "capital");
  delete state.units[unitUid];
  emit(state, "unit_destroyed", { unit: unitUid, owner: dead.owner, killer: killerUid || null });

  const killer = killerUid ? state.units[killerUid] : null;
  if (killer && chips.length) {
    const bayFree = CONFIG.unit.baySlots - slotsUsedOf(state, killer.chips);
    let taken = autoSalvage(state, chips, bayFree);
    if (ctx.interact) {
      const picked = ctx.interact({ kind: "salvage", chips: [...chips], bayFree, killer: killerUid });
      if (Array.isArray(picked)) {
        // Honour the choice but never exceed bay space.
        taken = autoSalvage(state, picked.filter((c) => chips.includes(c)), bayFree);
      }
    }
    for (const c of chips) {
      if (taken.includes(c)) killer.chips.push(c);
      else state.removed.push(c);
    }
    if (taken.length) emit(state, "unit_salvaged", { killer: killerUid, from: unitUid, chips: taken });
    recomputeStats(state);
  } else {
    for (const c of chips) state.removed.push(c);
  }
}

// §16.4 — drop `n` from a unit's base Strength (its HP), recompute derived
// stats, and destroy it at 0 (the `killer` may then salvage). `note`
// tallies the loss for the contest's UI detail.
export function loseBaseStrength(state, unitUid, n, killerUid, ctx, note) {
  const unit = state.units[unitUid];
  if (!unit) return;
  const applied = Math.min(n, unit.baseStrength);
  unit.baseStrength -= applied;
  recomputeStats(state);
  emit(state, "base_strength_changed", { unit: unitUid, amount: -applied, baseStrength: unit.baseStrength });
  if (note) note(unit, applied);
  if (unit.baseStrength <= 0) destroyUnit(state, unitUid, killerUid, ctx);
}

// Adjacent hexes a raid loser may retreat to (§16.4): not controlled by a
// hostile player, not a still-garrisoned neutral Location.
function validRetreatHexes(state, unit) {
  return (state.board.adjacency[unit.node] || []).filter((hex) => {
    const loc = state.locations[hex];
    if (!loc) return true; // terrain / encounter
    if (loc.controller && loc.controller !== unit.owner) return false;
    if (loc.sections.includes("neutral")) return false;
    return true;
  }).sort();
}

// §16.4 — a surviving raid loser MAY retreat one hex (the loser chooses
// whether and where). Headless default: first valid hex; `params.retreatTo`
// overrides; ctx.interact lets the UI prompt (and "stay" cancels).
function offerRetreat(state, unit, ctx, preferred) {
  const opts = validRetreatHexes(state, unit);
  if (!opts.length) return;
  let dest = opts[0];
  if (preferred && opts.includes(preferred)) dest = preferred;
  else if (ctx.interact) {
    const pick = ctx.interact({ kind: "retreat", unit: unit.uid, options: [...opts, "stay"] });
    if (pick === "stay" || !opts.includes(pick)) return;
    dest = pick;
  }
  const from = unit.node;
  unit.node = dest;
  emit(state, "unit_retreated", { unit: unit.uid, from, to: dest });
}

// A player wins immediately at the VP threshold (§3 / §14.1). Checked
// after every contest so an Obstacle outcome or capture reward that
// crosses 12 ends the game at once.
function checkVictory(state) {
  if (state.winnerId) return;
  for (const p of Object.values(state.players)) {
    if (p.vp >= CONFIG.vpThreshold) {
      state.winnerId = p.id;
      break;
    }
  }
}

// --- action handlers (plugged into performAction's dispatcher) -------
export function validateContest(state, { pid, params }) {
  const unit = state.units[params.unit];
  if (!unit) return fail("no such unit");
  if (unit.owner !== pid) return fail("not your unit");
  const t = resolveTarget(state, pid, unit, params);
  if (!t.ok) return t;
  return { ok: true };
}

export function runContest(state, { pid, params, ctx = {} }) {
  const unit = state.units[params.unit];
  const t = resolveTarget(state, pid, unit, params);

  // §16.2 — declaring a contest ends this unit's movement for the turn
  // (no move-attack-move), whatever the outcome.
  unit.moveRemaining = 0;

  // §9 step 1 — declare. Open the reaction window so replace-mode
  // Reactives may cancel the contest; on-mode subscribers fire when
  // emit lands and can modify stats before the roll (e.g. a defender
  // boost via MODIFY_STAT this_contest).
  const defUnit = t.kind === "raid" ? t.unit : (t.loc ? defendingUnit(state, t.loc) : null);
  const opened = openReactionWindow(state, "contest_declared", {
    initiator: unit.uid, player: pid, kind: t.kind, hex: unit.node,
    target: t.kind === "raid" ? t.unit.uid : unit.node,
  }, { ...ctx, contest: { defendingUnit: defUnit?.uid ?? null } });

  if (!opened) {
    // Cancelled by a replace-mode reaction. The Action was already
    // charged by the dispatcher; that doesn't reverse.
    expireContestModifiers(state);
    return { won: false, cancelled: true, kind: t.kind };
  }

  // §9 step 2 — roll. defValue and unit.strength are read AFTER the
  // window so any MODIFY_STAT from on-mode subscribers is reflected.
  //
  // House rule (departs from spec §9): a Location defended purely by
  // its garrison — no defending unit on the hex — does NOT roll a
  // d6. Its total is the static garrison value (incl. chip bonuses).
  // Raids and unit-backed Location defences still roll on both sides.
  const defValue = defenderValue(state, t);
  const defenderRollsDie =
    t.kind === "raid" ||
    (t.kind === "location" && !!defendingUnit(state, t.loc));
  const initiatorRoll = state.rng.roll(CONFIG.contestDieSides);
  const defenderRoll = defenderRollsDie ? state.rng.roll(CONFIG.contestDieSides) : 0;
  const initiatorTotal = unit.strength + initiatorRoll;
  const defenderTotal = defValue + defenderRoll;
  const won = initiatorTotal > defenderTotal;

  const detail = {
    kind: t.kind, defenderValue: defValue,
    initiatorRoll, defenderRoll, initiatorTotal, defenderTotal,
    defenderRolled: defenderRollsDie,
  };

  // §16.4 attrition cast. The defending *unit* only exists when a held
  // Location has no neutral sections and a unit stands on it (a bare
  // garrison has no Strength to lose); raids always pit two units.
  const attackerUnit = unit;
  const locDefUnit =
    t.kind === "location" && !t.loc.sections.includes("neutral")
      ? defendingUnit(state, t.loc)
      : null;
  const defenderUnit = t.kind === "raid" ? t.unit : locDefUnit;
  const winnerUnit = won ? attackerUnit : defenderUnit;
  const loserUnit = won ? defenderUnit : attackerUnit;
  const margin = won ? initiatorTotal - defenderTotal : defenderTotal - initiatorTotal;

  const lost = { attacker: 0, defender: 0 };
  const note = (u, n) => { if (u.owner === pid) lost.attacker += n; else lost.defender += n; };

  // Snapshot the loser's hex / owner before any death or retreat moves it.
  const loserUid = loserUnit?.uid ?? null;
  const loserHex = loserUnit ? loserUnit.node : t.kind === "location" ? t.loc.hexId : null;
  const loserOwner = loserUnit ? loserUnit.owner : t.kind === "location" ? t.loc.controller : null;

  // Emit the result and apply the section / standing outcome first (§16.4
  // — "after the section/raid result is applied"), then attrition.
  if (won) {
    emit(state, "contest_won", { initiator: unit.uid, player: pid, ...detail });
    if (t.kind === "location") resolveLocationWin(state, pid, t.loc, params);
    else onRaidWon(state, pid, t.unit); // standing hook; retreat after attrition
  } else {
    emit(state, "contest_lost", { initiator: unit.uid, player: pid, ...detail });
  }

  const logStart = state.log.length;

  // 1. Loser −1 (garrison loser has no unit to wound).
  if (loserUid && state.units[loserUid]) {
    loseBaseStrength(state, loserUid, 1, winnerUnit?.uid ?? null, ctx, note);
  }
  // 2. Rout: an overwhelming margin spills a casualty to a 2nd friendly
  //    unit stacked on the loser's hex.
  if (margin >= CONFIG.attrition.routMargin && loserOwner) {
    const second = Object.values(state.units).find(
      (u) => u.node === loserHex && u.owner === loserOwner && u.uid !== loserUid,
    );
    if (second) loseBaseStrength(state, second.uid, 1, winnerUnit?.uid ?? null, ctx, note);
  }
  // 3. Pyrrhic: a winner that barely won (margin 0 — defender ties — or 1)
  //    also loses 1, but only if the winner is a unit.
  if (margin <= 1 && winnerUnit && state.units[winnerUnit.uid]) {
    loseBaseStrength(state, winnerUnit.uid, 1, null, ctx, note);
  }

  // §16.4 raid retreat — a surviving raid loser may fall back one hex
  // (replaces the old immobilize / destroy-chip outcomes).
  if (won && t.kind === "raid" && loserUid && state.units[loserUid]) {
    offerRetreat(state, state.units[loserUid], ctx, params.retreatTo);
  }

  const killed = state.log.slice(logStart).filter((e) => e.name === "unit_destroyed").map((e) => e.payload.unit);
  const salvageEv = state.log.slice(logStart).find((e) => e.name === "unit_salvaged");

  checkVictory(state);
  expireContestModifiers(state);
  return {
    won,
    winner: won ? state.winnerId || null : null,
    ...detail,
    margin,
    attackerStrLost: lost.attacker,
    defenderStrLost: lost.defender,
    killed,
    salvage: salvageEv ? salvageEv.payload.chips : null,
  };
}

// MODIFY_STAT effects with `duration: "this_contest"` (e.g. defender
// boosts from on-mode reactions) live only for the contest in which
// they were raised. Cleared at the end of every contest, whichever way
// it resolves.
function expireContestModifiers(state) {
  const before = state.modifiers.length;
  state.modifiers = state.modifiers.filter((m) => m.duration !== "this_contest");
  if (state.modifiers.length !== before) recomputeStats(state);
}
