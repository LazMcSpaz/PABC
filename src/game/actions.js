// The action layer — the things a player spends an Action on during the
// Main phase. `performAction` is the single entry point: it checks the
// action is legal, charges the Action, and runs the handler. This chunk
// covers the framework plus Move and Recruit.
import { emit } from "./events.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances, reinforcementRoute } from "./board.js";
import { CONFIG } from "./config.js";
import { FACTIONS, CHIPS, ABILITIES, chipDefOf, factionDef } from "./content.js";
import { validateContest, runContest } from "./contest.js";
import { recomputeStats, strengthCap, bayCapacity } from "./stats.js";
import { recomputeVisibility } from "./visibility.js";
import { applyEffects } from "./effects.js";
import { drawFieldEncounter, resolveMarkerOnHex } from "./encounters.js";
import { makeUnit } from "./setup.js";
import {
  meetsTech, meetsLoyalty, slotCapacity, slotsUsed, stationedUnitWithBay,
  techLevelReqFor, upgradeOption, completeBuildIfDone,
} from "./economy.js";

const fail = (reason) => ({ ok: false, reason });

// A strictly-increasing turn counter, used to time effects that last
// until the affected unit's owner next plays — e.g. the immobilize a
// unit suffers on losing a contest. A unit cannot Move while
// `turnOrdinal(state) <= unit.immobilizedUntil`.
export function turnOrdinal(state) {
  return state.round * state.turnOrder.length + state.activeIndex;
}

// --- Move ------------------------------------------------------------
// Walk a unit up to its Movement stat in hexes. Ending the move on an
// encounter hex draws the top encounter card (the card's resolution
// arrives with the encounter content batch).
function validateMove(state, { pid, params }) {
  const unit = state.units[params.unit];
  if (!unit) return fail("no such unit");
  if (unit.owner !== pid) return fail("not your unit");
  if (unit.immobilizedUntil != null && turnOrdinal(state) <= unit.immobilizedUntil)
    return fail("unit is immobilized");
  if (!state.board.hexes[params.to]) return fail("no such hex");
  if (params.to === unit.node) return fail("unit is already on that hex");
  const dist = bfsDistances(state.board.adjacency, unit.node)[params.to];
  if (dist === undefined) return fail("hex is unreachable");
  // v0.2 §16.2 — Move spends the per-turn move budget, not Actions.
  if (dist > unit.moveRemaining)
    return fail(`out of range (${dist} > moves left ${unit.moveRemaining})`);
  return { ok: true };
}

function runMove(state, { params, ctx }) {
  const unit = state.units[params.unit];
  const from = unit.node;
  const dist = bfsDistances(state.board.adjacency, from)[params.to];
  unit.node = params.to;
  unit.moveRemaining = Math.max(0, unit.moveRemaining - dist);
  unit.movedSinceUpkeep = true; // §16.6 fortify — moving voids "dug in"
  emit(state, "unit_moved", { unit: unit.uid, from, to: params.to });

  // §19.11 — INCREMENTAL recompute (the scale guard): a move only changes
  // the MOVER's own sight footprint, so we refresh that one faction's
  // visibility, not the whole board. Whether other factions can now see
  // this unit is a render/query-time concealment check, not a stored-set
  // change — so no all-faction recompute is needed here.
  recomputeVisibility(state, unit.owner);

  // §15.5 placement markers take precedence — they're authored to land
  // on a specific hex and one-shot when discovered.
  const markerResult = resolveMarkerOnHex(state, params.to, unit, ctx);
  // §15.8 field-encounter hexes draw from the deck unless the hex is
  // still in its refresh cooldown.
  if (!markerResult && state.board.hexes[params.to].type === "encounter") {
    const cooldownUntil = state.world?.encounterHexCooldowns?.[params.to] || 0;
    if (state.round >= cooldownUntil) {
      drawFieldEncounter(state, unit, ctx);
    }
  }

  tryPickupLoot(state, unit, params.to, ctx);
  return {};
}

// A unit that ends its move on a hex carrying a loot pile (chips dropped
// when a unit died with no claimant) may take it. Interactive players get
// the salvage modal (and can close it to leave the loot); headless / AI
// grab what fits into the free bay and leave the rest on the hex.
function tryPickupLoot(state, unit, hex, ctx) {
  const loot = state.hexLoot?.[hex];
  if (!loot || !loot.length) return;
  if (ctx.interactiveLoot) {
    state.pendingSalvage = state.pendingSalvage || [];
    state.pendingSalvage.push({ kind: "loot", killerUid: unit.uid, hex, chips: [...loot] });
    return;
  }
  const used = (uids) => uids.reduce((n, c) => n + (chipDefOf(state, c)?.slots ?? 1), 0);
  let free = bayCapacity(unit) - used(unit.chips);
  const taken = [];
  const rest = [];
  for (const c of loot) {
    const sl = chipDefOf(state, c)?.slots ?? 1;
    if (sl <= free) { unit.chips.push(c); taken.push(c); free -= sl; }
    else rest.push(c);
  }
  if (rest.length) state.hexLoot[hex] = rest;
  else delete state.hexLoot[hex];
  if (taken.length) {
    recomputeStats(state);
    emit(state, "loot_claimed", { killer: unit.uid, hex, chips: taken });
  }
}

// --- Recruit ---------------------------------------------------------
// Spawn a unit at a controlled location. A Training Grounds chip there
// is the prerequisite, and each one also raises the unit cap by one
// (cap = the one starting unit + one per Training Grounds).
function trainingGroundsCount(state, pid) {
  let n = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) if (state.chips[c]?.chipId === "training-grounds") n++;
  }
  return n;
}

function ownedUnitCount(state, pid) {
  return Object.values(state.units).filter((u) => u.owner === pid).length;
}

function validateRecruit(state, { pid, player, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not control that location");
  const tg = trainingGroundsCount(state, pid);
  if (tg < 1) return fail("requires a Training Grounds");
  if (player.resource < CONFIG.unitRecruitCost) return fail("not enough scrap");
  if (ownedUnitCount(state, pid) >= CONFIG.baseUnitCap + tg) return fail("unit cap reached");
  return { ok: true };
}

function runRecruit(state, { pid, player, params }) {
  player.resource -= CONFIG.unitRecruitCost;
  emit(state, "resource_spent", {
    player: pid, resource: "Resource", amount: -CONFIG.unitRecruitCost,
  });

  const loc = state.locations[params.at];
  const u = state.nextId("unit");
  state.units[u] = makeUnit(u, pid, loc.hexId, factionDef(pid)?.name || pid);
  emit(state, "unit_recruited", { unit: u, player: pid, hex: loc.hexId });
  recomputeVisibility(state, pid); // §19 — a new unit is a new Vision source
  return { unit: u };
}

// --- Reinforce -------------------------------------------------------
// v0.2 §16.5 — mend a unit's eroded base Strength for 2 scrap each.
// `mode:"instant"` restores a unit on a friendly Location to cap now;
// `mode:"field"` dispatches a convoy that arrives in N round-ends, where
// N is the supply distance through friendly/neutral hexes (re-targets a
// moving unit, §16.5). Both cost 1 Action.
function validateReinforce(state, { pid, player, params }) {
  const unit = state.units[params.unit];
  if (!unit) return fail("no such unit");
  if (unit.owner !== pid) return fail("not your unit");
  const cap = strengthCap(unit);
  const deficit = cap - unit.baseStrength;
  if (deficit <= 0) return fail("unit is already at full Strength");
  const cost = CONFIG.heal.scrapPerStrength * deficit;
  if (player.resource < cost) return fail("not enough scrap");

  const mode = params.mode || "instant";
  if (mode === "instant") {
    const loc = state.locations[unit.node];
    if (!loc || loc.controller !== pid)
      return fail("instant top-up needs the unit on a Location you fully control");
    return { ok: true };
  }
  if (mode === "field") {
    const route = reinforcementRoute(state, pid, unit.node);
    if (!route) return fail("no supply route — the unit is walled off by enemy territory");
    return { ok: true };
  }
  return fail(`unknown reinforce mode "${mode}"`);
}

function runReinforce(state, { pid, player, params }) {
  const unit = state.units[params.unit];
  const cap = strengthCap(unit);
  const deficit = cap - unit.baseStrength;
  const cost = CONFIG.heal.scrapPerStrength * deficit;
  player.resource -= cost;
  emit(state, "resource_spent", { player: pid, resource: "Resource", amount: -cost });

  const mode = params.mode || "instant";
  if (mode === "instant") {
    unit.baseStrength = cap;
    recomputeStats(state);
    emit(state, "unit_reinforced", { unit: unit.uid, amount: deficit });
    return { mode, amount: deficit };
  }

  // field — scrap charged up front; the convoy arrives via the round-end
  // sweep (turn.js sweepReinforcements).
  const route = reinforcementRoute(state, pid, unit.node);
  state.reinforcements.push({
    owner: pid,
    targetUnit: unit.uid,
    amount: deficit,
    traveled: 0,
    originHex: route.originHex,
    requestedRound: state.round,
  });
  emit(state, "reinforcement_requested", {
    player: pid, unit: unit.uid, eta: route.dist, originHex: route.originHex,
  });
  return { mode, eta: route.dist, originHex: route.originHex };
}

// --- Build / Upgrade / Rush / Slider (§20.4–20.7, replaces Acquire) ---
// Chips are no longer bought from a shared Market — they are BUILT at a
// Location you control, off its Output via the guns/butter slider. These
// four directives cost no Actions (the economic decision is the slider, not
// the action economy); construction itself advances at Upkeep (economy.js).

// §20.4 — queue a fresh chip into a Location. Two gates, both required
// (§20.6): the player's Tech Level must allow the chip at all, and the city's
// Loyalty must clear its rung. Unit chips need a friendly unit stationed here
// (the city arms the army); the chip installs on completion (turn.js Upkeep).
function validateBuild(state, { pid, player, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not fully control that location");
  const def = CHIPS[params.chipId];
  if (!def) return fail("unknown chip");
  if (!meetsTech(player, def)) return fail(`needs Tech Level ${techLevelReqFor(def.techLevel || 1)}`);
  if (!meetsLoyalty(loc, def)) return fail(`needs Loyalty ${def.loyaltyReq}`);
  if (def.kind === "unit") {
    if (!stationedUnitWithBay(state, loc, def.slots || 1))
      return fail("needs a friendly unit stationed here with bay space");
  } else if (slotsUsed(state, loc.chips) + (def.slots || 1) > slotCapacity(loc)) {
    return fail("not enough chip slots");
  }
  return { ok: true };
}

function runBuild(state, { params }) {
  const loc = state.locations[params.at];
  const def = CHIPS[params.chipId];
  const targetUnit = def.kind === "unit"
    ? (params.into?.unit && state.units[params.into.unit]?.node === loc.hexId
        ? params.into.unit
        : stationedUnitWithBay(state, loc, def.slots || 1)?.uid)
    : null;
  loc.activeBuild = {
    kind: "build", chipId: def.id, cost: def.buildCost ?? def.cost ?? 0,
    targetSlot: loc.chips.length, targetUnit,
  };
  emit(state, "build_started", { hex: loc.hexId, chipId: def.id, kind: "build", cost: loc.activeBuild.cost });
  completeBuildIfDone(state, loc); // carried-over progress may finish it at once
  return { hex: loc.hexId, chipId: def.id };
}

// §20.5 — upgrade an installed chip in place to its next tier. Always offered
// if a tier exists (the upgrade view shows it greyed when gated); building it
// replaces the chip in its own slot, so scarcity is preserved.
function validateUpgrade(state, { pid, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not fully control that location");
  // The chip may sit in the Location's slots or in a friendly unit's bay here.
  const holder = findChipHolder(state, loc, params.chip, pid);
  if (!holder) return fail("that chip is not installed at this location");
  const opt = upgradeOption(state, loc, params.chip);
  if (!opt) return fail("this chip has no upgrade");
  if (opt.locked) return fail(opt.reason || "upgrade is gated");
  return { ok: true };
}

function runUpgrade(state, { pid, params }) {
  const loc = state.locations[params.at];
  const opt = upgradeOption(state, loc, params.chip);
  const holder = findChipHolder(state, loc, params.chip, pid);
  loc.activeBuild = {
    kind: "upgrade", chipId: opt.chipId, cost: opt.def.buildCost ?? opt.def.cost ?? 0,
    targetChipUid: params.chip,
    targetUnit: holder.kind === "unit" ? holder.uid : null,
  };
  emit(state, "build_started", { hex: loc.hexId, chipId: opt.chipId, kind: "upgrade", cost: loc.activeBuild.cost });
  completeBuildIfDone(state, loc);
  return { hex: loc.hexId, chipId: opt.chipId };
}

// Locate an installed chip either in the Location's own slots or in a friendly
// unit's bay on this hex. Returns { kind:"location" } or { kind:"unit", uid }.
function findChipHolder(state, loc, chipUid, pid) {
  if (loc.chips.includes(chipUid)) return { kind: "location" };
  for (const u of Object.values(state.units)) {
    if (u.owner === pid && u.node === loc.hexId && u.chips.includes(chipUid)) {
      return { kind: "unit", uid: u.uid };
    }
  }
  return null;
}

// §20.7 — spend banked scrap to add build-points to a Location's active build
// immediately (the bridge that makes the slider two-way: hoarded scrap is
// stored construction potential). `params.amount` build-points, default:
// enough to finish; clamped by affordable scrap.
function validateRush(state, { player, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== player.id) return fail("you do not fully control that location");
  if (!loc.activeBuild) return fail("nothing is being built here");
  if (player.resource < CONFIG.economy.rushScrapPerPoint) return fail("not enough scrap to rush");
  return { ok: true };
}

function runRush(state, { pid, player, params }) {
  const loc = state.locations[params.at];
  const rate = CONFIG.economy.rushScrapPerPoint;
  const need = Math.max(0, loc.activeBuild.cost - (loc.buildProgress || 0));
  const want = params.amount != null ? params.amount : need;
  const affordablePoints = Math.floor(player.resource / rate);
  const points = Math.max(0, Math.min(want, affordablePoints));
  if (points <= 0) return fail("not enough scrap to rush");
  const spend = points * rate;
  player.resource -= spend;
  emit(state, "resource_spent", { player: pid, resource: "Resource", amount: -spend, source: "rush" });
  loc.buildProgress = (loc.buildProgress || 0) + points;
  completeBuildIfDone(state, loc);
  return { hex: loc.hexId, points, spent: spend };
}

// §20.3 — set this city's guns/butter slider f∈[0,1]. Persists until changed.
function validateSetSlider(state, { pid, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not fully control that location");
  if (typeof params.value !== "number") return fail("slider value must be a number 0..1");
  return { ok: true };
}

function runSetSlider(state, { params }) {
  const loc = state.locations[params.at];
  loc.buildSlider = Math.max(0, Math.min(1, params.value));
  emit(state, "slider_changed", { hex: loc.hexId, value: loc.buildSlider });
  return { hex: loc.hexId, value: loc.buildSlider };
}

// --- Activate --------------------------------------------------------
// Invoke a location ability (§13.2). The dispatcher charges the
// ability's own `cost.action`; the ability also pays any `cost.resource`
// in its runner.
function getActivatable(state, params) {
  const loc = state.locations[params.location];
  if (!loc || !loc.abilityId) return null;
  const ability = ABILITIES[loc.abilityId];
  if (!ability) return null;
  return { loc, ability, opt: ability.activated?.[params.abilityIndex || 0] };
}

function activateActionCost(state, { params }) {
  return getActivatable(state, params)?.opt?.cost?.action ?? 0;
}

function validateActivate(state, { pid, player, params }) {
  const got = getActivatable(state, params);
  if (!got) return fail("no activatable ability at that location");
  if (got.loc.controller !== pid) return fail("you do not fully control that location");
  if (!got.opt) return fail("no such activated option");
  // Activated abilities are once per turn (spec §12.7). Without this an
  // ability whose net effect is positive at zero Action cost — e.g.
  // Staging Ground (+1 Action) or Rail Corridor (+3 scrap) — could be
  // spammed for unlimited resources / actions.
  if (got.loc.abilityActivatedTurn === turnOrdinal(state))
    return fail("this ability was already activated this turn");
  const cost = got.opt.cost || {};
  if (cost.resource && player.resource < cost.resource) return fail("not enough scrap");
  return { ok: true };
}

function runActivate(state, { pid, player, params, ctx }) {
  const { loc, ability, opt } = getActivatable(state, params);
  const cost = opt.cost || {};
  if (cost.resource) {
    player.resource -= cost.resource;
    emit(state, "resource_spent", {
      player: pid, resource: "Resource", amount: -cost.resource,
    });
  }
  loc.abilityActivatedTurn = turnOrdinal(state); // once-per-turn lock
  applyEffects(state, opt.effects || [], { ...ctx, sourcePlayer: pid, source: loc });
  return { location: loc.hexId, ability: ability.id };
}

// --- Combine (§16.7) ------------------------------------------------
// Merge two co-located friendly units into one: the survivor gets the SUM
// of their base Strengths (capped at 8), a third bay slot, a -1 Movement
// penalty, and carries veterancy + contest counts from whichever parent
// had them. Excess chips (over the combined unit's 3-slot bay) salvage
// back to the player via the standard pendingSalvage flow.
function slotsOf(state, chipUid) {
  return chipDefOf(state, chipUid)?.slots ?? 1;
}

function validateCombine(state, { pid, params }) {
  const a = state.units[params.unitA];
  const b = state.units[params.unitB];
  if (!a || !b) return fail("no such unit");
  if (a.uid === b.uid) return fail("cannot combine a unit with itself");
  if (a.owner !== pid || b.owner !== pid) return fail("not your unit");
  if (a.node !== b.node) return fail("units must share a hex");
  // A combined unit cannot recombine — the cap is already at the ceiling
  // and the bay is already maxed, so it would only be a no-op + a free chip
  // ejection. Disallow to keep the action's effect honest.
  if (a.combined || b.combined) return fail("a combined unit cannot recombine");
  // Combining a unit that has already moved this turn is fine — Move and
  // Combine are independent; the survivor inherits a's moveRemaining
  // (cleared to 0 to prevent same-turn double-action via reset).
  return { ok: true };
}

function runCombine(state, { pid, params, ctx }) {
  const a = state.units[params.unitA];
  const b = state.units[params.unitB];
  const cap = CONFIG.unit.combinedStrengthCap;
  // Sum then cap — explicit per §16.7. NOT auto-set to cap regardless of input.
  a.baseStrength = Math.min(cap, a.baseStrength + b.baseStrength);
  a.combined = true;
  a.baseMovement = Math.max(1, a.baseMovement - CONFIG.unit.combineMovementPenalty);
  a.moveRemaining = 0; // spent its action; no same-turn re-cycling
  a.veteran = a.veteran || b.veteran; // veterancy survives if either had it
  a.contestsWon = Math.max(a.contestsWon, b.contestsWon);
  a.contestsSurvived = Math.max(a.contestsSurvived, b.contestsSurvived);

  // Merge chip bays. Combined bay holds 3 slots; any excess salvages back.
  const merged = [...a.chips, ...b.chips];
  const bayCap = CONFIG.unit.combinedBaySlots;
  const fit = [];
  const salvaged = [];
  let used = 0;
  for (const c of merged) {
    const sl = slotsOf(state, c);
    if (used + sl <= bayCap) { fit.push(c); used += sl; }
    else salvaged.push(c);
  }
  a.chips = fit;

  // Remove the absorbed unit.
  const absorbedUid = b.uid;
  const hex = a.node;
  delete state.units[absorbedUid];

  recomputeStats(state);
  emit(state, "units_combined", {
    player: pid, survivor: a.uid, absorbed: absorbedUid, hex,
    baseStrength: a.baseStrength, salvaged: [...salvaged],
  });

  // Hand the displaced chips back via the standard salvage flow. The owner
  // can re-equip them on the survivor (no room without ejecting more) or
  // any other unit / Location in their territory via the usual salvage UI.
  if (salvaged.length) {
    state.pendingSalvage = state.pendingSalvage || [];
    state.pendingSalvage.push({
      kind: "combine", killerUid: a.uid, hex, chips: salvaged,
    });
  }

  return { survivor: a.uid, absorbed: absorbedUid, salvaged };
}

// --- dispatch --------------------------------------------------------
const ACTIONS = {
  move: { cost: 0, validate: validateMove, run: runMove }, // §16.2 — free of Actions
  recruit: { cost: 1, validate: validateRecruit, run: runRecruit },
  reinforce: { cost: 1, validate: validateReinforce, run: runReinforce },
  contest: { cost: 1, validate: validateContest, run: runContest },
  combine: { cost: 1, validate: validateCombine, run: runCombine }, // §16.7
  // §20.4–20.7 — economic directives, free of the Action budget (the
  // strategic cost is the slider split + scrap, not an Action).
  build: { cost: 0, validate: validateBuild, run: runBuild },
  upgrade: { cost: 0, validate: validateUpgrade, run: runUpgrade },
  rush: { cost: 0, validate: validateRush, run: runRush },
  "set-slider": { cost: 0, validate: validateSetSlider, run: runSetSlider },
  activate: { cost: activateActionCost, validate: validateActivate, run: runActivate },
};

export function performAction(state, type, params = {}, ctx = {}) {
  if (state.winnerId) return fail("the game is already won");
  if (state.phase !== "Main") return fail("actions are only legal in the Main phase");
  const def = ACTIONS[type];
  if (!def) return fail(`unknown action "${type}"`);

  const pid = activePlayerId(state);
  const player = state.players[pid];
  const arg = { pid, player, params, ctx };

  const check = def.validate(state, arg);
  if (!check.ok) return check;
  const cost = typeof def.cost === "function" ? def.cost(state, arg) : def.cost;
  if (player.actions.remaining < cost) return fail("not enough Actions");

  player.actions.remaining -= cost;
  emit(state, "action_spent", { player: pid, action: type, cost });

  const result = def.run(state, arg) || {};
  return { ok: true, action: type, ...result };
}

export { ACTIONS };
