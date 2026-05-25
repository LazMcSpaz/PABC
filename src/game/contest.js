// The contest resolver (mechanical-spec §9) — the unified primitive
// behind capturing Locations and raiding units. One unit's effective
// Strength plus 1d6 is set against a defender value plus 1d6; the
// defender wins ties. This chunk (Layer 3.2) covers Location capture and
// unit raids; Obstacle contests wire in with the encounter/obstacle
// content batch (no Obstacle state exists yet).
import { emit } from "./events.js";
import { openReactionWindow } from "./reactions.js";
import { CONFIG } from "./config.js";
import { CHIPS, LOCATIONS, FACTIONS } from "./content.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { recomputeInfluence } from "./influence.js";
import { onLocationCaptured, onRaidWon } from "./standing.js";
import { makeUnit } from "./setup.js";
import { TECH_NODES, hasTechNode } from "./tech.js";

const fail = (reason) => ({ ok: false, reason });

// Garrison Strength contributed by a Location's installed chips. No v0.1
// chip carries a structured `garrison` bonus yet, so this is 0 today —
// the hook is here for the content batch (e.g. Defense Turrets).
function chipGarrison(state, loc) {
  let g = 0;
  for (const c of loc.chips) {
    if (state.chips[c]?.disabled) continue; // §20.9 dormant — no garrison bonus
    g += CHIPS[state.chips[c]?.chipId]?.garrison || 0;
  }
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

// Combined effective Strength of every unit `owner` has stacked on `hex`.
// Stacked units fight as one: their strengths sum (the Concentration
// bonus is added on top of this, separately).
function stackStrength(state, owner, hex) {
  let s = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner === owner && u.node === hex) s += u.strength;
  }
  return s;
}

// §16.6 Concentration — +1 (capped at +3) per *additional* friendly unit
// stacked on `hex`, excluding `excludeUid` (the contesting / defending
// unit itself).
function concentration(state, owner, hex, excludeUid) {
  let n = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner === owner && u.node === hex && u.uid !== excludeUid) n++;
  }
  return Math.min(n, CONFIG.combat.concentrationCap) * CONFIG.combat.concentrationPerUnit;
}

// §16.6 Veterancy — after a contest, every surviving participant banks a
// "survived"; the winner's unit banks a "win". A unit promotes to Veteran
// (permanent +1 to its rolls) at 3 wins or 5 survivals, whichever first.
function tickVeterancy(state, participants, winnerUid) {
  for (const p of participants) {
    const u = p && state.units[p.uid]; // only units still alive
    if (!u) continue;
    u.contestsSurvived = (u.contestsSurvived || 0) + 1;
    if (u.uid === winnerUid) u.contestsWon = (u.contestsWon || 0) + 1;
    if (
      !u.veteran &&
      (u.contestsWon >= CONFIG.veteran.winsToPromote ||
        u.contestsSurvived >= CONFIG.veteran.survivedToPromote)
    ) {
      u.veteran = true;
      emit(state, "veteran_promoted", { unit: u.uid, owner: u.owner });
    }
  }
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

// The defender's value before its die roll (§9). Stacked defending units
// fight together — their Strengths sum (§ combined-stack rule).
function defenderValue(state, t) {
  if (t.kind === "raid") return stackStrength(state, t.unit.owner, t.unit.node);
  const loc = t.loc;
  let v = loc.garrison + chipGarrison(state, loc);
  if (!loc.sections.includes("neutral") && loc.controller) {
    v += stackStrength(state, loc.controller, loc.hexId);
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
// over, and Loyalty initialises low for the new controller (§18.2).
function captureLocation(state, loc, victor) {
  const from = loc.controller;
  if (loc.chips.length)
    destroyLocationChip(state, loc, loc.chips[loc.chips.length - 1]);
  for (const c of [...loc.chips])
    if (state.chips[c]?.chipId === "capital") destroyLocationChip(state, loc, c);

  loc.controller = victor;
  loc.loyaltyOwner = victor;
  loc.loyalty = CONFIG.loyalty.start; // §18.2 — Loyalty initialises low on capture
  // §20.8 — in-progress construction is forfeited on capture (the workshop
  // changed hands mid-build); the slider resets to bank everything until the
  // new controller chooses what to build at this freshly-taken, low-Loyalty city.
  loc.activeBuild = null;
  loc.buildProgress = 0;
  loc.buildSlider = CONFIG.economy.defaultSlider;
  emit(state, "location_captured", { hex: loc.hexId, controller: victor, from });

  // §16.5 severed supply — any in-transit reinforcement whose origin was
  // this Location is stranded: it becomes a fresh, chip-less unit (cap 4)
  // at the reinforced unit's position (allowed past unit cap).
  strandReinforcementsFrom(state, loc.hexId);

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

  // Control changed; a Lab on this location may have changed hands or
  // been destroyed — resync Research for everyone (§17.3: tech denial is
  // emergent — the captor's Research rises, the former owner's falls).
  recomputeResearch(state);
  // §18.3 — control changed hands; recompute the Influence field + ZoC.
  recomputeInfluence(state);
  // §15.3 — the affiliated faction (if any) loses standing toward
  // the new controller.
  onLocationCaptured(state, loc.hexId, victor, from);
}

// §16.5 — strand in-transit reinforcements whose origin Location was just
// captured, converting each to a new chip-less unit at the reinforced
// unit's node (cap 4).
function strandReinforcementsFrom(state, capturedHex) {
  if (!state.reinforcements?.length) return;
  state.reinforcements = state.reinforcements.filter((r) => {
    if (r.originHex !== capturedHex) return true;
    const target = state.units[r.targetUnit];
    const node = target ? target.node : capturedHex;
    const u = state.nextId("unit");
    state.units[u] = makeUnit(u, r.owner, node, FACTIONS[r.owner].name);
    state.units[u].baseStrength = Math.min(CONFIG.unit.baseStrengthCap, r.amount);
    recomputeStats(state);
    emit(state, "reinforcement_arrived", { player: r.owner, unit: u, stranded: true });
    return false;
  });
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

// Drop chips onto a hex as a persistent loot pile (no surviving claimant).
// The next unit to end its move there decides what to do with them.
function dropLoot(state, hex, chips) {
  if (!chips.length) return;
  state.hexLoot = state.hexLoot || {};
  (state.hexLoot[hex] = state.hexLoot[hex] || []).push(...chips);
  emit(state, "loot_dropped", { hex, chips: [...chips] });
}

// §16.4 — remove a unit from play. A surviving `killer` unit salvages the
// dead unit's chips (auto, or interactive via the queue); with no living
// claimant the chips fall to the hex as a loot pile. Any pending-salvage
// decision that named this unit as the claimant is also spilled to loot.
export function destroyUnit(state, unitUid, killerUid, ctx = {}) {
  const dead = state.units[unitUid];
  if (!dead) return;
  const deadHex = dead.node;
  const chips = dead.chips.filter((c) => state.chips[c]?.chipId !== "capital");
  delete state.units[unitUid];
  emit(state, "unit_destroyed", { unit: unitUid, owner: dead.owner, killer: killerUid || null });

  // This unit may itself have been a pending salvage claimant (e.g. it won
  // a contest then died to its own pyrrhic loss). Its unclaimed loot spills
  // onto the hex rather than vanishing.
  if (state.pendingSalvage?.length) {
    state.pendingSalvage = state.pendingSalvage.filter((e) => {
      if (e.killerUid !== unitUid || e.kind === "loot") return true;
      dropLoot(state, deadHex, e.chips.filter((c) => state.chips[c]));
      return false;
    });
  }

  const killer = killerUid ? state.units[killerUid] : null;
  if (!chips.length) return;
  if (!killer) {
    dropLoot(state, deadHex, chips); // no claimant — chips become hex loot
    return;
  }

  // Interactive UI path: defer the decision. Stash the recovered chips on
  // the queue (held off any unit) and let the UI distribute them via
  // resolveSalvage. Headless / AI paths fall through to the auto default.
  if (ctx.deferSalvage) {
    state.pendingSalvage = state.pendingSalvage || [];
    state.pendingSalvage.push({
      killerUid, deadUid: unitUid, deadOwner: dead.owner, chips: [...chips],
    });
    recomputeStats(state);
    return;
  }

  const bayFree = CONFIG.unit.baySlots - slotsUsedOf(state, killer.chips);
  let taken = autoSalvage(state, chips, bayFree);
  if (ctx.interact) {
    const picked = ctx.interact({ kind: "salvage", chips: [...chips], bayFree, killer: killerUid });
    if (Array.isArray(picked)) {
      taken = autoSalvage(state, picked.filter((c) => chips.includes(c)), bayFree);
    }
  }
  for (const c of chips) {
    if (taken.includes(c)) killer.chips.push(c);
    else state.removed.push(c);
  }
  if (taken.length) emit(state, "unit_salvaged", { killer: killerUid, from: unitUid, chips: taken });
  recomputeStats(state);
}

// Resolve the head of the interactive salvage queue. `assignments` sorts
// every chip in play (the killer's current bay + the recovered chips) into
// three terminal buckets; anything omitted is treated as scrapped (the
// "Salvaged" staging tray is lossy by design).
//   { unitSlots: [uid], resell: [uid], destroy: [uid] }
// - unitSlots becomes the killer's exact bay (must fit baySlots).
// - resell pays the killer's owner ceil(cost/2) and lands the chip on the
//   4-slot resale row (FIFO; the oldest falls off when full).
// - destroy / omitted chips are removed from the game.
export function resolveSalvage(state, assignments = {}) {
  const entry = state.pendingSalvage?.[0];
  if (!entry) return { ok: false, reason: "no pending salvage" };
  const killer = state.units[entry.killerUid];
  const unitSlots = (assignments.unitSlots || []).filter((c) => state.chips[c]);
  const resell = (assignments.resell || []).filter((c) => state.chips[c]);

  // The full universe of chips this decision governs.
  const universe = new Set([...(killer ? killer.chips : []), ...entry.chips]);

  if (killer) {
    if (slotsUsedOf(state, unitSlots) > CONFIG.unit.baySlots)
      return { ok: false, reason: "too many chips for the unit's bay" };
    killer.chips = unitSlots.filter((c) => universe.has(c));
  }

  for (const c of resell) {
    if (!universe.has(c)) continue;
    const def = CHIPS[state.chips[c]?.chipId];
    const value = Math.ceil((def?.cost || 0) / 2);
    if (killer && value > 0) {
      state.players[killer.owner].resource += value;
      emit(state, "resource_gained", {
        player: killer.owner, resource: "Resource", amount: value, source: "resale",
      });
    }
    state.resaleRow.push(c);
    while (state.resaleRow.length > 4) state.removed.push(state.resaleRow.shift());
  }

  // Sort the remainder. `destroy` is always scrapped. Leftovers (chips in
  // no bucket) are scrapped for a death-salvage but, for a loot pickup,
  // stay on the hex as a persistent pile — the claimant simply left them.
  const kept = new Set([...(killer ? killer.chips : []), ...resell]);
  const destroy = new Set((assignments.destroy || []).filter((c) => universe.has(c)));
  const leftOnHex = [];
  for (const c of universe) {
    if (kept.has(c)) continue;
    if (entry.kind === "loot" && !destroy.has(c)) leftOnHex.push(c);
    else state.removed.push(c);
  }
  if (entry.kind === "loot") {
    if (leftOnHex.length) state.hexLoot[entry.hex] = leftOnHex;
    else delete state.hexLoot[entry.hex];
  }

  const fromDead = (killer ? killer.chips : []).filter((c) => entry.chips.includes(c));
  emit(state, entry.kind === "loot" ? "loot_claimed" : "unit_salvaged", {
    killer: entry.killerUid, from: entry.deadUid, hex: entry.hex, chips: fromDead, resold: resell,
  });

  state.pendingSalvage.shift();
  recomputeStats(state);
  return { ok: true, remaining: state.pendingSalvage.length };
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

  // §16.4 / §16.6 — identify the defending *unit* (a held Location with no
  // neutral sections and a unit on it; raids always pit two units).
  const attackerUnit = unit;
  const locDefUnit =
    t.kind === "location" && !t.loc.sections.includes("neutral")
      ? defendingUnit(state, t.loc)
      : null;
  const defenderUnit = t.kind === "raid" ? t.unit : locDefUnit;
  const defHex = t.kind === "raid" ? t.unit.node : t.loc.hexId;

  // Combined stack Strength: every friendly unit on the contesting hex
  // fights together, so their Strengths sum (Concentration is added on top).
  const atkStrength = stackStrength(state, pid, unit.node);
  const atkAllies = atkStrength - unit.strength; // contribution from stacked allies
  const defAllies = defenderUnit
    ? stackStrength(state, defenderUnit.owner, defHex) - defenderUnit.strength
    : 0;

  // §16.6 combat levers — additive modifiers computed before the roll.
  const atkConcentration = concentration(state, pid, unit.node, unit.uid);
  const atkVeteran = unit.veteran ? CONFIG.combat.veteranBonus : 0;
  const defMountain =
    state.board.hexes[defHex]?.terrain === "mountain" ? CONFIG.combat.mountainDefenseBonus : 0;
  let defConcentration = 0, defFortify = 0, defVeteran = 0;
  if (defenderUnit) {
    defConcentration = concentration(state, defenderUnit.owner, defHex, defenderUnit.uid);
    if (defenderUnit.fortified) defFortify = CONFIG.combat.fortifyBonus;
    if (defenderUnit.veteran) defVeteran = CONFIG.combat.veteranBonus;
  }

  // §17.5 Military entry (Doctrine): +1 to that player's contest roll,
  // whether they are attacking or defending. The defending player is the
  // raided unit's owner / the Location's controller (even garrison-only).
  const milAmt = TECH_NODES["mil-entry"].effect.amount;
  const defOwner = t.kind === "raid" ? t.unit.owner : t.loc.controller;
  const atkMilitary = hasTechNode(state, pid, "mil-entry") ? milAmt : 0;
  const defMilitary = defOwner && hasTechNode(state, defOwner, "mil-entry") ? milAmt : 0;

  // House rule (departs from spec §9): a Location defended purely by its
  // garrison — no defending unit — does NOT roll a d6.
  const defenderRollsDie = t.kind === "raid" || (t.kind === "location" && !!defenderUnit);
  const initiatorRoll = state.rng.roll(CONFIG.contestDieSides);
  const defenderRoll = defenderRollsDie ? state.rng.roll(CONFIG.contestDieSides) : 0;
  const initiatorTotal = atkStrength + atkConcentration + atkVeteran + atkMilitary + initiatorRoll;
  const defenderTotal =
    defValue + defConcentration + defMountain + defFortify + defVeteran + defMilitary + defenderRoll;
  const won = initiatorTotal > defenderTotal;

  const detail = {
    kind: t.kind, defenderValue: defValue,
    initiatorRoll, defenderRoll, initiatorTotal, defenderTotal,
    defenderRolled: defenderRollsDie,
    // §16.6 / §17.5 breakdown for the UI
    attackerConcentration: atkConcentration, attackerVeteran: atkVeteran,
    attackerAllies: atkAllies, attackerMilitary: atkMilitary,
    defenderConcentration: defConcentration, defenderMountain: defMountain,
    defenderFortify: defFortify, defenderVeteran: defVeteran,
    defenderAllies: defAllies, defenderMilitary: defMilitary,
  };
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

  // §16.6 veterancy — credit survivors and the winning unit, then promote.
  tickVeterancy(state, [attackerUnit, defenderUnit], winnerUnit?.uid ?? null);

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
