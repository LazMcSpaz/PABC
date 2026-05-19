// The action layer — the things a player spends an Action on during the
// Main phase. `performAction` is the single entry point: it checks the
// action is legal, charges the Action, and runs the handler. This chunk
// covers the framework plus Move and Recruit.
import { emit } from "./events.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { CONFIG } from "./config.js";
import { FACTIONS } from "./content.js";

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
  if (dist > unit.movement) return fail(`out of range (${dist} > Movement ${unit.movement})`);
  return { ok: true };
}

function runMove(state, { params }) {
  const unit = state.units[params.unit];
  const from = unit.node;
  unit.node = params.to;
  emit(state, "unit_moved", { unit: unit.uid, from, to: params.to });

  if (state.board.hexes[params.to].type === "encounter" && state.encounterDeck.length) {
    const card = state.encounterDeck.shift();
    state.discards.encounter.push(card);
    emit(state, "encounter_resolved", { unit: unit.uid, hex: params.to, card });
  }
  return {};
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
  if (ownedUnitCount(state, pid) >= 1 + tg) return fail("unit cap reached");
  return { ok: true };
}

function runRecruit(state, { pid, player, params }) {
  player.resource -= CONFIG.unitRecruitCost;
  emit(state, "resource_spent", {
    player: pid, resource: "Resource", amount: -CONFIG.unitRecruitCost,
  });

  const loc = state.locations[params.at];
  const u = state.nextId("unit");
  state.units[u] = {
    uid: u,
    owner: pid,
    name: `${FACTIONS[pid].name} unit`,
    node: loc.hexId,
    baseStrength: CONFIG.unit.baseStrength,
    baseMovement: CONFIG.unit.baseMovement,
    strength: CONFIG.unit.baseStrength,
    movement: CONFIG.unit.baseMovement,
    chips: [],
    immobilizedUntil: null,
  };
  emit(state, "unit_recruited", { unit: u, player: pid, hex: loc.hexId });
  return { unit: u };
}

// --- dispatch --------------------------------------------------------
const ACTIONS = {
  move: { cost: 1, validate: validateMove, run: runMove },
  recruit: { cost: 1, validate: validateRecruit, run: runRecruit },
};

export function performAction(state, type, params = {}) {
  if (state.winnerId) return fail("the game is already won");
  if (state.phase !== "Main") return fail("actions are only legal in the Main phase");
  const def = ACTIONS[type];
  if (!def) return fail(`unknown action "${type}"`);

  const pid = activePlayerId(state);
  const player = state.players[pid];
  const arg = { pid, player, params };

  const check = def.validate(state, arg);
  if (!check.ok) return check;
  if (player.actions.remaining < def.cost) return fail("not enough Actions");

  player.actions.remaining -= def.cost;
  emit(state, "action_spent", { player: pid, action: type, cost: def.cost });

  const result = def.run(state, arg) || {};
  return { ok: true, action: type, ...result };
}

export { ACTIONS };
