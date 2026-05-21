// The contest resolver (mechanical-spec §9) — the unified primitive
// behind capturing Locations and raiding units. One unit's effective
// Strength plus 1d6 is set against a defender value plus 1d6; the
// defender wins ties. This chunk (Layer 3.2) covers Location capture and
// unit raids; Obstacle contests wire in with the encounter/obstacle
// content batch (no Obstacle state exists yet).
import { emit } from "./events.js";
import { openReactionWindow } from "./reactions.js";
import { CONFIG } from "./config.js";
import { CHIPS } from "./content.js";
import { recomputeStats, recomputeTech } from "./stats.js";
import { onLocationCaptured, onRaidWon } from "./standing.js";

const fail = (reason) => ({ ok: false, reason });

// The ordinal of a player's *next* turn. A raided unit is immobilized
// "through its next turn" (§9); turnOrdinal = round*N + activeIndex is
// strictly increasing, and validateMove blocks Move while it is <= this.
function nextTurnOrdinal(state, pid) {
  const n = state.turnOrder.length;
  const seat = state.turnOrder.indexOf(pid);
  const round = seat > state.activeIndex ? state.round : state.round + 1;
  return round * n + seat;
}

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

// An adjacent hex the loser may retreat to (§9): not controlled by a
// hostile player, not a still-garrisoned neutral Location. The winner
// chooses (params.retreatTo); the first valid hex is the headless default.
function chooseRetreat(state, unit, preferred) {
  const valid = (state.board.adjacency[unit.node] || []).filter((hex) => {
    const loc = state.locations[hex];
    if (!loc) return true; // terrain / encounter
    if (loc.controller && loc.controller !== unit.owner) return false;
    if (loc.sections.includes("neutral")) return false;
    return true;
  });
  if (preferred && valid.includes(preferred)) return preferred;
  return valid.length ? [...valid].sort()[0] : null;
}

// A raid win (§9): the defending unit retreats, then the winner takes
// ONE — immobilize it through its next turn, or destroy one of its chips.
function resolveRaidWin(state, pid, defUnit, params) {
  // §15.3 — raided faction loses standing toward the raider; recent-
  // raid counter increments (decays each round in the world pipeline).
  onRaidWon(state, pid, defUnit);

  const dest = chooseRetreat(state, defUnit, params.retreatTo);
  if (dest) {
    const from = defUnit.node;
    defUnit.node = dest;
    emit(state, "unit_retreated", { unit: defUnit.uid, from, to: dest });
  }

  if (params.raidChoice === "destroyChip" && defUnit.chips.length) {
    const chipUid =
      params.raidChipTarget && defUnit.chips.includes(params.raidChipTarget)
        ? params.raidChipTarget
        : defUnit.chips[defUnit.chips.length - 1];
    defUnit.chips.splice(defUnit.chips.indexOf(chipUid), 1);
    state.removed.push(chipUid);
    recomputeStats(state);
  } else {
    defUnit.immobilizedUntil = nextTurnOrdinal(state, defUnit.owner);
  }
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
  const defValue = defenderValue(state, t);
  const initiatorRoll = state.rng.roll(CONFIG.contestDieSides);
  const defenderRoll = state.rng.roll(CONFIG.contestDieSides);
  const initiatorTotal = unit.strength + initiatorRoll;
  const defenderTotal = defValue + defenderRoll;
  const won = initiatorTotal > defenderTotal;

  const detail = {
    kind: t.kind, defenderValue: defValue,
    initiatorRoll, defenderRoll, initiatorTotal, defenderTotal,
  };

  if (!won) {
    emit(state, "contest_lost", { initiator: unit.uid, player: pid, ...detail });
    expireContestModifiers(state);
    return { won: false, ...detail };
  }

  emit(state, "contest_won", { initiator: unit.uid, player: pid, ...detail });
  if (t.kind === "location") resolveLocationWin(state, pid, t.loc, params);
  else resolveRaidWin(state, pid, t.unit, params);

  checkVictory(state);
  expireContestModifiers(state);
  return { won: true, winner: state.winnerId || null, ...detail };
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
