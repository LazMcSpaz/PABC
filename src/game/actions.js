// The action layer — the things a player spends an Action on during the
// Main phase. `performAction` is the single entry point: it checks the
// action is legal, charges the Action, and runs the handler. This chunk
// covers the framework plus Move and Recruit.
import { emit } from "./events.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances, reinforcementRoute } from "./board.js";
import { unitReach, supplyCutter, unseenBlockers } from "./movement.js";
import { CONFIG } from "./config.js";
import { FACTIONS, CHIPS, ABILITIES, chipDefOf, factionDef } from "./content.js";
import { validateContest, runContest } from "./contest.js";
import { recomputeStats, recomputeResearch, effectiveVeteran } from "./stats.js";
import { recomputeInfluence } from "./influence.js";
import { recomputeVisibility } from "./visibility.js";
import { applyEffects } from "./effects.js";
import { drawFieldEncounter, resolveMarkerOnHex } from "./encounters.js";
import { makeUnit } from "./setup.js";
import { hasTechNode } from "./tech.js";
import { postAt, buildPost, revealPost } from "./posts.js";
import {
  blockadeAt, startBlockade, supplyStatus, blockadeSlotsUsed,
} from "./blockades.js";
import {
  meetsTech, meetsLoyalty, slotCapacity, slotsUsed, stationedUnitWithBay,
  techLevelReqFor, upgradeOption, completeBuildIfDone, effectiveBuildCost,
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
  // v0.2 §16.2 — Move spends the per-turn move budget (not Actions), consumed
  // by terrain entry costs and roads, and stopped by blockades (a non-passing
  // foreign unit / enemy Location halts you on that hex).
  const field = unitReach(state, unit);
  if (!(params.to in field))
    return fail(`out of range (moves left ${unit.moveRemaining})`);
  return { ok: true };
}

function runMove(state, { params, ctx }) {
  const unit = state.units[params.unit];
  const from = unit.node;
  const field = unitReach(state, unit);
  // Did the mover just walk into something it could not see? Read BEFORE the
  // move, while the destination is still unexplored/unlit for this faction.
  const ambushed = unseenBlockers(state, unit.owner).has(params.to);
  unit.node = params.to;
  // The field already accounts for forest/road cost, the mountain halt and any
  // blockade stop, so the remaining budget at the destination is exact. An
  // unseen halt leaves the remainder intact rather than zeroing it.
  unit.moveRemaining = Math.max(0, field[params.to] ?? 0);
  if (ambushed) {
    // Checked: it keeps its movement but may only fall back or sidestep for the
    // rest of the turn (unitReach). Being surprised costs you the advance, not
    // the whole turn.
    unit.checked = true;
    unit.turnStartNode = unit.turnStartNode || from;
    emit(state, "advance_checked", {
      unit: unit.uid, player: unit.owner, hex: params.to, moveRemaining: unit.moveRemaining,
    });
  }
  unit.movedSinceUpkeep = true; // §16.6 fortify — moving voids "dug in"
  // movement/moveRemaining are snapshotted here (not left for a log
  // consumer to read off the live unit later) because both are mutable —
  // by the time anyone exports state.log, a unit that moved many times
  // (or died) would only show its FINAL values against every historical
  // move, not what was true at each one.
  emit(state, "unit_moved", {
    unit: unit.uid, player: unit.owner, from, to: params.to,
    movement: unit.movement, moveRemaining: unit.moveRemaining,
  });

  // §19.11 — INCREMENTAL recompute (the scale guard): a move only changes
  // the MOVER's own sight footprint, so we refresh that one faction's
  // visibility, not the whole board. Whether other factions can now see
  // this unit is a render/query-time concealment check, not a stored-set
  // change — so no all-faction recompute is needed here.
  recomputeVisibility(state, unit.owner);

  // §17.7 Contact reveal — entering a hex carrying an enemy listening post
  // reveals it (permanently) to the mover's faction.
  const here = postAt(state, params.to);
  if (here && here.owner !== unit.owner) revealPost(state, here, unit.owner, "contact");

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
    emit(state, "loot_claimed", { killer: unit.uid, player: unit.owner, hex, chips: taken });
  }
}

// --- Recruit ---------------------------------------------------------
// Spawn a unit at a controlled location. Any chip carrying `unitCapBonus`
// (Training Grounds today; content may add alternatives later) is the
// prerequisite, and each one also raises the unit cap by its bonus
// (cap = baseUnitCap + the sum of unitCapBonus across owned chips).
export function recruitCapBonus(state, pid) {
  let n = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) n += CHIPS[state.chips[c]?.chipId]?.unitCapBonus || 0;
  }
  return n;
}

function ownedUnitCount(state, pid) {
  return Object.values(state.units).filter((u) => u.owner === pid).length;
}

// Motor Pool (and future recruiter chips): per-Location discount off the
// base recruit cost, floored at 1 scrap. Dormant chips grant nothing.
export function recruitCostAt(state, loc) {
  let cost = CONFIG.unitRecruitCost;
  for (const c of loc.chips) {
    if (state.chips[c]?.disabled) continue;
    cost -= CHIPS[state.chips[c]?.chipId]?.recruitDiscount || 0;
  }
  return Math.max(1, cost);
}

function validateRecruit(state, { pid, player, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not control that location");
  const capBonus = recruitCapBonus(state, pid);
  if (capBonus < 1) return fail("requires a chip that unlocks recruiting");
  if (player.resource < recruitCostAt(state, loc)) return fail("not enough scrap");
  if (ownedUnitCount(state, pid) >= CONFIG.baseUnitCap + capBonus) return fail("unit cap reached");
  return { ok: true };
}

function runRecruit(state, { pid, player, params }) {
  const cost = recruitCostAt(state, state.locations[params.at]);
  player.resource -= cost;
  emit(state, "resource_spent", {
    player: pid, resource: "Resource", amount: -cost,
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
function unitStrengthCap(state, unit) {
  return effectiveVeteran(state, unit) ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
}

// §17.5 Logistics B2 (Supply Convoys): a holder heals at 1 scrap per Strength
// (was 2). An Infirmary chip on the unit's own hex gives the same rate for
// instant top-ups there. Plain reinforcement uses the §16.5 base rate.
function scrapPerStrengthFor(state, pid, unit) {
  if (hasTechNode(state, pid, "log-b2")) return 1;
  const loc = unit && state.locations[unit.node];
  if (loc && loc.controller === pid &&
      loc.chips.some((c) => !state.chips[c]?.disabled && CHIPS[state.chips[c]?.chipId]?.cheapReinforce)) {
    return 1;
  }
  return CONFIG.heal.scrapPerStrength;
}

function validateReinforce(state, { pid, player, params }) {
  const unit = state.units[params.unit];
  if (!unit) return fail("no such unit");
  if (unit.owner !== pid) return fail("not your unit");
  const cap = unitStrengthCap(state, unit);
  const deficit = cap - unit.baseStrength;
  if (deficit <= 0) return fail("unit is already at full Strength");
  const cost = scrapPerStrengthFor(state, pid, unit) * deficit;
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
  const cap = unitStrengthCap(state, unit);
  const deficit = cap - unit.baseStrength;
  const cost = scrapPerStrengthFor(state, pid, unit) * deficit;
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
  if (def.faction && def.faction !== pid) return fail("that chip is another faction's signature");
  if (def.reward) return fail("that chip cannot be built — it is found, not made");
  if (!meetsTech(player, def)) return fail(`needs Tech Level ${techLevelReqFor(def.techLevel || 1)}`);
  if (!meetsLoyalty(loc, def)) return fail(`needs Loyalty ${def.loyaltyReq}`);
  if (def.kind === "unit") {
    if (!stationedUnitWithBay(state, loc, def.slots || 1, def.statType))
      return fail(def.statType
        ? `needs a stationed friendly unit with bay space and no ${def.statType} chip`
        : "needs a friendly unit stationed here with bay space");
  } else if (slotsUsed(state, loc.chips) + (def.slots || 1) > slotCapacity(loc, state)) {
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
        : stationedUnitWithBay(state, loc, def.slots || 1, def.statType)?.uid)
    : null;
  loc.activeBuild = {
    kind: "build", chipId: def.id, cost: effectiveBuildCost(state, loc.controller, def),
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
    kind: "upgrade", chipId: opt.chipId, cost: effectiveBuildCost(state, loc.controller, opt.def),
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

// Rail doc §3.4 — which claim on this city's build output wins when it is both
// building a chip and funding a blockade down the road. Persists until changed,
// like the slider. Costs no Action (it is a standing policy, not a move).
function validateSetBuildPriority(state, { pid, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not fully control that location");
  if (params.value !== "blockade" && params.value !== "chips")
    return fail('build priority must be "blockade" or "chips"');
  return { ok: true };
}

function runSetBuildPriority(state, { params }) {
  const loc = state.locations[params.at];
  loc.buildPriority = params.value;
  emit(state, "build_priority_changed", { hex: loc.hexId, value: loc.buildPriority });
  return { hex: loc.hexId, value: loc.buildPriority };
}

// Rail doc §2.2 — choose which rail-linked settlement this one pools its idle
// build output into (null clears it). Persists until changed and costs no
// Action, like the slider: it is a standing policy, not a move.
function validateSetPoolTarget(state, { pid, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not fully control that location");
  if (params.to == null) return { ok: true };            // clearing is always legal
  if (params.to === params.at) return fail("a settlement cannot pool into itself");
  const dest = state.locations[params.to];
  if (!dest) return fail("no such location");
  if (dest.controller !== pid) return fail("you do not fully control the recipient");
  // §2.2 direct pairs only, §2.3 you must hold both stations (checked above).
  const linked = (state.board.rails || []).some(
    (l) => (l.a === params.at && l.b === params.to) || (l.b === params.at && l.a === params.to),
  );
  if (!linked) return fail("those settlements are not directly rail-linked");
  return { ok: true };
}

function runSetPoolTarget(state, { params }) {
  const loc = state.locations[params.at];
  loc.poolTarget = params.to ?? null;
  emit(state, "pool_target_changed", { hex: loc.hexId, to: loc.poolTarget });
  return { hex: loc.hexId, to: loc.poolTarget };
}

// --- Activate --------------------------------------------------------
// Invoke a location ability (§13.2). The dispatcher charges the
// ability's own `cost.action`; the ability also pays any `cost.resource`
// in its runner.
// --- per-entity payers (docs/vp-and-actions-design.md §4) -------------
// Each action names WHO spends: units and/or Locations. An entity out of
// actions may burn one of the player's wildcards instead.
const payLoc = (key) => (state, { params }) => ({ locations: [params[key]] });

function reinforcePayer(state, { pid, params }) {
  const unit = state.units[params.unit];
  if (!unit) return null;
  if ((params.mode || "instant") === "instant") return { locations: [unit.node] };
  const route = reinforcementRoute(state, pid, unit.node);
  return route ? { locations: [route.originHex] } : null;
}

function contestPayer(state, { params }) {
  return { units: [params.unit, ...(params.coalition || [])] };
}

function buildPostPayer(state, { pid, params }) {
  const crew = Object.values(state.units).find((u) => u.owner === pid && u.node === params.hex);
  return crew ? { units: [crew.uid] } : null;
}

function getActivatable(state, params) {
  const loc = state.locations[params.location];
  if (!loc || !loc.abilityId) return null;
  const ability = ABILITIES[loc.abilityId];
  if (!ability) return null;
  return { loc, ability, opt: ability.activated?.[params.abilityIndex || 0] };
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
  if (got.opt.oncePerGame && got.loc.abilityUsedEver)
    return fail("this ability has already been used this game");
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
  if (opt.oncePerGame) loc.abilityUsedEver = true; // Old Armory — once EVER
  applyEffects(state, opt.effects || [], { ...ctx, sourcePlayer: pid, source: loc });
  return { location: loc.hexId, ability: ability.id };
}

// --- Build Listening Post (§17.7) ------------------------------------
// Intelligence A2 deploys a concealed, radius-1 Vision source on a field hex.
// Validates the A2 assignment, a friendly unit on the hex, a non-Location
// hex, and ≥3 scrap; costs 1 Action + 3 scrap (paid immediately).
function validateBuildPost(state, { pid, player, params }) {
  const hex = params.hex;
  if (!state.board.hexes[hex]) return fail("no such hex");
  if (state.locations[hex]) return fail("cannot build a post on a Location hex");
  if (postAt(state, hex)) return fail("a listening post already occupies that hex");
  const crew = Object.values(state.units).filter((u) => u.owner === pid && u.node === hex);
  if (!crew.length) return fail("needs a friendly unit on the target hex");
  // Relay Kit (chip `postsWithoutTech`): the artifact IS the know-how — a
  // carrier on the hex stands in for the Intelligence A2 assignment.
  const kitted = crew.some((u) =>
    u.chips.some((c) => !state.chips[c]?.disabled && CHIPS[state.chips[c]?.chipId]?.postsWithoutTech));
  if (!hasTechNode(state, pid, "int-a2") && !kitted)
    return fail("requires Intelligence A2 (Listening Post)");
  if (player.resource < CONFIG.posts.buildCost) return fail("not enough scrap");
  return { ok: true };
}

function runBuildPost(state, { pid, player, params }) {
  player.resource -= CONFIG.posts.buildCost;
  emit(state, "resource_spent", {
    player: pid, resource: "Resource", amount: -CONFIG.posts.buildCost, source: "build-post",
  });
  const post = buildPost(state, pid, params.hex);
  recomputeVisibility(state, pid, { emitEvents: false }); // §17.7 — a new Vision source
  return { hex: post.hex };
}

// --- Build Blockade (rail doc §3.1) ----------------------------------
// A road-only fortification, funded down the road it sits on. Validates a road
// hex with no Location and no existing blockade, a friendly unit to pin there,
// an uninterrupted road connection to the nearest settlement this player fully
// holds, and the scrap. Costs 1 Action + scrap up front; the structure itself
// then accrues over at least two Upkeeps (turn.js).
function buildBlockadePayer(state, { pid, params }) {
  const crew = Object.values(state.units).find((u) => u.owner === pid && u.node === params.hex);
  return crew ? { units: [crew.uid] } : null;
}

function validateBuildBlockade(state, { pid, player, params }) {
  const hex = params.hex;
  const cell = state.board.hexes[hex];
  if (!cell) return fail("no such hex");
  if (!cell.road) return fail("a blockade can only be built on a road hex");
  if (state.locations[hex]) return fail("cannot build a blockade on a Location hex");
  if (blockadeAt(state, hex)) return fail("a blockade already occupies that hex");
  if (postAt(state, hex)) return fail("a listening post already occupies that hex");
  const crew = Object.values(state.units).filter((u) => u.owner === pid && u.node === hex);
  if (!crew.length) return fail("needs a friendly unit on the target hex");
  const supply = supplyStatus(state, pid, hex, supplyCutter(state, pid));
  if (!supply.path) return fail("no road connection to a settlement you hold");
  if (!supply.ok) return fail("that road connection is cut");
  if (player.resource < CONFIG.blockades.buildCost) return fail("not enough scrap");
  return { ok: true, crew };
}

function runBuildBlockade(state, { pid, player, params }) {
  player.resource -= CONFIG.blockades.buildCost;
  emit(state, "resource_spent", {
    player: pid, resource: "Resource", amount: -CONFIG.blockades.buildCost, source: "build-blockade",
  });
  // The pinned builder is the unit that paid the Action, so the player's own
  // choice of crew is honoured rather than re-picked here.
  const crew = Object.values(state.units).find((u) => u.owner === pid && u.node === params.hex);
  const b = startBlockade(state, pid, params.hex, crew.uid);
  return { hex: b.hex, unit: crew.uid, cost: b.cost };
}

// --- Upgrade Blockade (rail doc §3.2) --------------------------------
// Queue a chip into a COMPLETED blockade. Free to queue, like a Location build:
// the cost is paid out of the funding settlement's build output over the
// following Upkeeps (§3.4), not from banked scrap up front. No unit has to be
// present — the builder was released when the structure landed.
function validateUpgradeBlockade(state, { pid, player, params }) {
  const b = blockadeAt(state, params.hex);
  if (!b) return fail("no blockade on that hex");
  if (b.owner !== pid) return fail("not your blockade");
  if (!b.done) return fail("that blockade is still under construction");
  if (b.build) return fail("that blockade is already building something");
  const def = CHIPS[params.chipId];
  if (!def || def.kind !== "blockade") return fail("not a blockade chip");
  if (!meetsTech(player, def)) return fail(`needs Tech L${techLevelReqFor(def.techLevel || 1)}`);
  if (blockadeSlotsUsed(state, b) + (def.slots || 1) > CONFIG.blockades.chipSlots)
    return fail("no free slot on that blockade");
  if (b.chips.some((c) => state.chips[c]?.chipId === params.chipId))
    return fail("that chip is already installed here");
  // The same road that pays for it has to be open, or the queue would sit at
  // zero progress with nothing saying why.
  const supply = supplyStatus(state, pid, b.hex, supplyCutter(state, pid));
  if (!supply.path) return fail("no road connection to a settlement you hold");
  if (!supply.ok) return fail("that road connection is cut");
  return { ok: true, def };
}

function runUpgradeBlockade(state, { pid, params }) {
  const b = blockadeAt(state, params.hex);
  const def = CHIPS[params.chipId];
  b.build = { chipId: def.id, cost: effectiveBuildCost(state, pid, def), progress: 0 };
  emit(state, "build_started", { hex: b.hex, chipId: def.id, cost: b.build.cost });
  return { hex: b.hex, chipId: def.id, cost: b.build.cost };
}

// --- Remove chip (design ruling: chips are removable/replaceable) ------
// Refit happens at a friendly Location. A removed UNIT chip drops as hex
// loot (old gear hits the ground — anyone may claim it); a removed
// LOCATION chip is demolished outright (buildings don't travel). The
// Capital is never removable. Costs 1 Action.
function validateRemoveChip(state, { pid, params }) {
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (loc.controller !== pid) return fail("you do not fully control that location");
  if (state.chips[params.chip]?.chipId === "capital") return fail("the Capital cannot be removed");
  if (!findChipHolder(state, loc, params.chip, pid))
    return fail("that chip is not installed at this location");
  return { ok: true };
}

function runRemoveChip(state, { pid, params }) {
  const loc = state.locations[params.at];
  const holder = findChipHolder(state, loc, params.chip, pid);
  const chipId = state.chips[params.chip]?.chipId;
  if (holder.kind === "unit") {
    const u = state.units[holder.uid];
    u.chips.splice(u.chips.indexOf(params.chip), 1);
    state.hexLoot = state.hexLoot || {};
    (state.hexLoot[loc.hexId] = state.hexLoot[loc.hexId] || []).push(params.chip);
    emit(state, "loot_dropped", { hex: loc.hexId, chips: [params.chip] });
  } else {
    loc.chips.splice(loc.chips.indexOf(params.chip), 1);
    state.removed.push(params.chip);
  }
  emit(state, "chip_removed", {
    hex: loc.hexId, chip: params.chip, chipId, player: pid, holder: holder.kind,
  });
  recomputeStats(state);
  recomputeResearch(state);
  recomputeInfluence(state);
  recomputeVisibility(state, pid, { emitEvents: false });
  return { chip: params.chip, chipId };
}

// --- Activate chip (docs/chip-set-v0.1.md — Cold Camp) ----------------
// A chip with an `activatable` block is switched on by paying its scrap
// cost; the effect lasts until the start of the owner's next turn. Free of
// the Action budget (like build) — the scrap IS the cost.
function findActivatableChip(state, unit, chipUid) {
  if (!unit || !unit.chips.includes(chipUid)) return null;
  const inst = state.chips[chipUid];
  if (!inst || inst.disabled) return null;
  const def = CHIPS[inst.chipId];
  return def?.activatable ? def : null;
}

function validateActivateChip(state, { pid, player, params }) {
  const unit = state.units[params.unit];
  if (!unit) return fail("no such unit");
  if (unit.owner !== pid) return fail("not your unit");
  const def = findActivatableChip(state, unit, params.chip);
  if (!def) return fail("that chip has no activation");
  if (def.activatable.grants === "stealth" &&
      unit.stealthUntil != null && turnOrdinal(state) <= unit.stealthUntil)
    return fail("already active until your next turn");
  if (player.resource < (def.activatable.cost || 0)) return fail("not enough scrap");
  return { ok: true };
}

function runActivateChip(state, { pid, player, params }) {
  const unit = state.units[params.unit];
  const def = findActivatableChip(state, unit, params.chip);
  const cost = def.activatable.cost || 0;
  if (cost > 0) {
    player.resource -= cost;
    emit(state, "resource_spent", { player: pid, resource: "Resource", amount: -cost, source: "activate-chip" });
  }
  if (def.activatable.grants === "stealth") {
    // Concealed through everyone else's turns; expires when the owner's
    // next turn starts (same ordinal convention as immobilizedUntil).
    unit.stealthUntil = turnOrdinal(state) + state.turnOrder.length - 1;
    recomputeVisibility(state, pid, { emitEvents: false });
  }
  emit(state, "chip_activated", { unit: unit.uid, player: pid, chip: params.chip, chipId: def.id });
  return { unit: unit.uid, chipId: def.id };
}

// --- Sabotage (§17.5 Intelligence B2 — Saboteurs) --------------------
// Once per round, lower an enemy-controlled Location's Loyalty by 1. Gated by
// the B2 assignment and a per-round usage stamp (the stamp is the current
// round number, so a new round automatically re-enables it).
function validateSabotage(state, { pid, params }) {
  if (!hasTechNode(state, pid, "int-b2"))
    return fail("requires Intelligence B2 (Saboteurs)");
  const loc = state.locations[params.at];
  if (!loc) return fail("no such location");
  if (!loc.controller || loc.controller === pid)
    return fail("target must be an enemy-controlled Location");
  if (state.players[pid].sabotageUsedRound === state.round)
    return fail("already sabotaged this round");
  return { ok: true };
}

function runSabotage(state, { pid, params }) {
  const loc = state.locations[params.at];
  loc.loyalty = Math.max(0, (loc.loyalty ?? 0) - 1);
  state.players[pid].sabotageUsedRound = state.round;
  emit(state, "loyalty_changed", {
    hex: loc.hexId, owner: loc.controller, loyalty: loc.loyalty, cause: "sabotage",
  });
  recomputeInfluence(state); // §18.3 — Loyalty feeds the Influence field / ZoC
  return { hex: loc.hexId, loyalty: loc.loyalty };
}

// --- dispatch --------------------------------------------------------
const ACTIONS = {
  move: { validate: validateMove, run: runMove }, // §16.2 — free of Actions
  recruit: { payer: payLoc("at"), validate: validateRecruit, run: runRecruit },
  reinforce: { payer: reinforcePayer, validate: validateReinforce, run: runReinforce },
  contest: { payer: contestPayer, validate: validateContest, run: runContest },
  "activate-chip": { validate: validateActivateChip, run: runActivateChip },
  "remove-chip": { payer: payLoc("at"), validate: validateRemoveChip, run: runRemoveChip },
  // §20.4–20.7 — economic directives. Queuing a build/upgrade and setting the
  // slider are free (the cost is the slider split + scrap); RUSH costs 1 Action
  // since it actively converts banked scrap into immediate construction.
  build: { validate: validateBuild, run: runBuild },
  upgrade: { validate: validateUpgrade, run: runUpgrade },
  // Rushing is an active push of banked scrap into construction — it costs 1
  // Action (and scrap). Queuing a build/upgrade and the slider stay free.
  rush: { payer: payLoc("at"), validate: validateRush, run: runRush },
  "set-slider": { validate: validateSetSlider, run: runSetSlider },
  "set-build-priority": { validate: validateSetBuildPriority, run: runSetBuildPriority },
  "set-pool-target": { validate: validateSetPoolTarget, run: runSetPoolTarget },
  activate: { payer: payLoc("location"), validate: validateActivate, run: runActivate },
  // §17.7 / §17.5 Intelligence A2 + B2 — deploy a Listening Post, run a Saboteur.
  "build-post": { payer: buildPostPayer, validate: validateBuildPost, run: runBuildPost },
  "build-blockade": { payer: buildBlockadePayer, validate: validateBuildBlockade, run: runBuildBlockade },
  // Queuing an upgrade is free, exactly as queuing a Location build is.
  "upgrade-blockade": { validate: validateUpgradeBlockade, run: runUpgradeBlockade },
  sabotage: { validate: validateSabotage, run: runSabotage }, // once/round stamp is its cost
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

  // Per-entity charging: every named unit/Location spends its action; an
  // entity that has already acted may burn a player wildcard instead.
  const payer = def.payer ? def.payer(state, arg) : null;
  if (payer) {
    const units = (payer.units || []).map((u) => state.units[u]).filter(Boolean);
    const locs = (payer.locations || []).map((h) => state.locations[h]).filter(Boolean);
    let shortfall = 0;
    for (const u of units) if ((u.actionsRemaining ?? 0) < 1) shortfall += 1;
    for (const l of locs) if ((l.actionsRemaining ?? 0) < 1) shortfall += 1;
    if (shortfall > player.actions.remaining) {
      return fail(units.length ? "that unit has already acted this turn"
        : "that location has already acted this turn");
    }
    for (const u of units) {
      if ((u.actionsRemaining ?? 0) >= 1) u.actionsRemaining -= 1;
      else player.actions.remaining -= 1;
    }
    for (const l of locs) {
      if ((l.actionsRemaining ?? 0) >= 1) l.actionsRemaining -= 1;
      else player.actions.remaining -= 1;
    }
    emit(state, "action_spent", {
      player: pid, action: type,
      units: (payer.units || []), locations: (payer.locations || []),
    });
  }

  const result = def.run(state, arg) || {};
  return { ok: true, action: type, ...result };
}

export { ACTIONS };
