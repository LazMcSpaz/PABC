// The action layer — the things a player spends an Action on during the
// Main phase. `performAction` is the single entry point: it checks the
// action is legal, charges the Action, and runs the handler. This chunk
// covers the framework plus Move and Recruit.
import { emit } from "./events.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances, reinforcementRoute } from "./board.js";
import { CONFIG } from "./config.js";
import { FACTIONS, CHIPS, ABILITIES, chipDefOf } from "./content.js";
import { validateContest, runContest } from "./contest.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { applyEffects } from "./effects.js";
import { drawFieldEncounter, resolveMarkerOnHex } from "./encounters.js";
import { makeUnit } from "./setup.js";

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
  let free = CONFIG.unit.baySlots - used(unit.chips);
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
  state.units[u] = makeUnit(u, pid, loc.hexId, FACTIONS[pid].name);
  emit(state, "unit_recruited", { unit: u, player: pid, hex: loc.hexId });
  return { unit: u };
}

// --- Reinforce -------------------------------------------------------
// v0.2 §16.5 — mend a unit's eroded base Strength for 2 scrap each.
// `mode:"instant"` restores a unit on a friendly Location to cap now;
// `mode:"field"` dispatches a convoy that arrives in N round-ends, where
// N is the supply distance through friendly/neutral hexes (re-targets a
// moving unit, §16.5). Both cost 1 Action.
function unitStrengthCap(unit) {
  return unit.veteran ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
}

function validateReinforce(state, { pid, player, params }) {
  const unit = state.units[params.unit];
  if (!unit) return fail("no such unit");
  if (unit.owner !== pid) return fail("not your unit");
  const cap = unitStrengthCap(unit);
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
  const cap = unitStrengthCap(unit);
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

// --- Acquire ---------------------------------------------------------
// Buy a face-up Market chip and install it on one of your units (kind
// `unit`) or a location you fully control (kind `location`). The chip's
// `techLevel` must be at or below the player's unlocked Market tier
// (§4.1). The vacated row refills from the tier deck.
// §17.2 — Market tier unlock keys off Tech *Level* now (tier 2 @ L3,
// tier 3 @ L5), not a raw research score.
function unlockedTier(player) {
  const lvl = player.techLevel || 1;
  const m = CONFIG.tech.marketTierByLevel;
  if (lvl >= m[3]) return 3;
  if (lvl >= m[2]) return 2;
  return 1;
}

function findInMarket(state, chipUid) {
  for (const [tierKey, t] of Object.entries(state.market.tiers)) {
    if (t.row.includes(chipUid)) return { tier: Number(tierKey), row: t.row, deck: t.deck };
  }
  return null;
}

function slotsUsed(state, chipUids) {
  let n = 0;
  for (const c of chipUids) n += chipDefOf(state, c)?.slots ?? 1;
  return n;
}

function validateAcquire(state, { pid, player, params }) {
  if (!params.chip) return fail("specify which chip to acquire (params.chip)");
  const inResale = state.resaleRow?.includes(params.chip);
  const found = inResale ? null : findInMarket(state, params.chip);
  if (!inResale && !found) return fail("that chip is not in any market row");
  // Resale chips ignore tech tier — they're used goods.
  if (found && found.tier > unlockedTier(player))
    return fail(`tier ${found.tier} requires a higher Tech Level`);

  const def = CHIPS[state.chips[params.chip]?.chipId];
  if (!def) return fail("unknown chip");
  if (player.resource < (def.cost || 0)) return fail("not enough scrap");

  const into = params.into || {};
  if (def.kind === "unit") {
    const unit = state.units[into.unit];
    if (!unit) return fail("specify a unit to install into (params.into.unit)");
    if (unit.owner !== pid) return fail("not your unit");
    if (slotsUsed(state, unit.chips) + def.slots > CONFIG.unit.baySlots)
      return fail("not enough Bay slots");
  } else {
    const loc = state.locations[into.location];
    if (!loc) return fail("specify a location to install into (params.into.location)");
    if (loc.controller !== pid) return fail("you do not fully control that location");
    if (slotsUsed(state, loc.chips) + def.slots > loc.chipSlots)
      return fail("not enough Location slots");
  }
  return { ok: true };
}

function runAcquire(state, { pid, player, params }) {
  const inResale = state.resaleRow?.includes(params.chip);
  let chipUid, tier;
  if (inResale) {
    chipUid = state.resaleRow.splice(state.resaleRow.indexOf(params.chip), 1)[0];
    tier = CHIPS[state.chips[chipUid]?.chipId]?.techLevel ?? null;
  } else {
    const found = findInMarket(state, params.chip);
    chipUid = found.row.splice(found.row.indexOf(params.chip), 1)[0];
    if (found.deck.length) found.row.push(found.deck.shift());
    tier = found.tier;
  }

  const def = CHIPS[state.chips[chipUid].chipId];
  player.resource -= def.cost || 0;
  emit(state, "resource_spent", {
    player: pid, resource: "Resource", amount: -(def.cost || 0),
  });

  if (def.kind === "unit") {
    state.units[params.into.unit].chips.push(chipUid);
    recomputeStats(state);
  } else {
    state.locations[params.into.location].chips.push(chipUid);
  }

  emit(state, "card_acquired", {
    player: pid, chip: chipUid, chipId: def.id, tier,
  });
  recomputeResearch(state); // a fresh Lab may have moved the player's Research
  return { chip: chipUid, chipId: def.id, tier };
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

// --- dispatch --------------------------------------------------------
const ACTIONS = {
  move: { cost: 0, validate: validateMove, run: runMove }, // §16.2 — free of Actions
  recruit: { cost: 1, validate: validateRecruit, run: runRecruit },
  reinforce: { cost: 1, validate: validateReinforce, run: runReinforce },
  contest: { cost: 1, validate: validateContest, run: runContest },
  acquire: { cost: 1, validate: validateAcquire, run: runAcquire },
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
