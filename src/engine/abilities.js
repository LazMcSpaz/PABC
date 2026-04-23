// Activated Building abilities. Each handler is keyed by building id and
// takes (state, playerId, building, opts) → new state. The shared
// activateAbility() dispatcher validates the common invariants (player
// owns the building, it isn't disabled, once-per-turn isn't already
// spent, action / scrap costs are met) and then calls the handler.
//
// Once-per-turn tracking lives on player.abilityUsedThisTurn keyed by
// building uid; endTurn clears it for the incoming player.
//
// Not yet wired:
//   light_artillery (intercepts challenge resolve — requires mid-flow UI)
//   drone_lab peek (requires a two-step peek+discard UI)
//   visionscope (upgrade — hand-peek UI)
//   improved_meds (upgrade — medic tent recovery semantics unclear)
//   perimeter_traps / signal_jammers (opt-in raid reactives — prompt UI)

import { NotifKind, impact, notify } from "./notifications.js";

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function logEntry(state, entry) {
  return { ...state, log: [...(state.log ?? []), { round: state.round, ...entry }] };
}

function markUsed(player, buildingUid) {
  return {
    ...player,
    abilityUsedThisTurn: { ...(player.abilityUsedThisTurn ?? {}), [buildingUid]: true },
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function antennaArray(state, playerId, building) {
  const deck = [...state.intrigueDeck];
  const drawn = deck.shift();
  if (!drawn) return state;
  const player = state.players.find((p) => p.id === playerId);
  let next = { ...state, intrigueDeck: deck };
  next = updatePlayer(next, playerId, (p) =>
    markUsed(
      {
        ...p,
        scrap: p.scrap - 2,
        intrigueHand: [...p.intrigueHand, drawn].slice(-3),
      },
      building.uid,
    ),
  );
  next = logEntry(next, { type: "ability", buildingId: building.id, playerId });
  return notify(next, {
    kind: NotifKind.BUILD,
    title: `${player.name} used Antenna Array`,
    message: "Spent 2 Scrap to draw an Intrigue card.",
    impacts: [impact(playerId, `−2 Scrap · +1 Intrigue (${drawn.name})`, { scrap: -2 })],
    sourceCardId: "antenna_array",
    sourcePlayerId: playerId,
  });
}

function vehicleGarage(state, playerId, building) {
  const player = state.players.find((p) => p.id === playerId);
  let next = updatePlayer(state, playerId, (p) =>
    markUsed(
      { ...p, scrap: p.scrap - 2, actionsRemaining: p.actionsRemaining + 1 },
      building.uid,
    ),
  );
  next = logEntry(next, { type: "ability", buildingId: building.id, playerId });
  return notify(next, {
    kind: NotifKind.BUILD,
    title: `${player.name} used Vehicle Garage`,
    message: "Spent 2 Scrap → +1 Action.",
    impacts: [impact(playerId, "−2 Scrap · +1 Action", { scrap: -2, actions: 1 })],
    sourceCardId: "vehicle_garage",
    sourcePlayerId: playerId,
  });
}

function tradingPost(state, playerId, building, opts) {
  const partnerId = opts?.partnerId;
  if (partnerId == null || partnerId === playerId) return state;
  if (!state.players.some((p) => p.id === partnerId)) return state;
  const player = state.players.find((p) => p.id === playerId);
  const partner = state.players.find((p) => p.id === partnerId);

  // Trader leader enhances: +2 extra for self, +1 extra for partner.
  const hasTrader = player.leader?.id === "the_trader";
  const selfGain = 3 + (hasTrader ? 2 : 0);
  const partnerGain = 1 + (hasTrader ? 1 : 0);

  let next = updatePlayer(state, playerId, (p) =>
    markUsed(
      {
        ...p,
        actionsRemaining: p.actionsRemaining - 1,
        scrap: p.scrap + selfGain,
      },
      building.uid,
    ),
  );
  next = updatePlayer(next, partnerId, (p) => ({ ...p, scrap: p.scrap + partnerGain }));
  next = logEntry(next, { type: "ability", buildingId: building.id, playerId, partnerId });
  return notify(next, {
    kind: NotifKind.BUILD,
    title: `${player.name} used Trading Post → ${partner.name}`,
    message: hasTrader
      ? `Trader-enhanced: spent 1 Action → +${selfGain} Scrap to self, +${partnerGain} Scrap to ${partner.name}.`
      : `Spent 1 Action → +${selfGain} Scrap to self, +${partnerGain} Scrap to ${partner.name}.`,
    impacts: [
      impact(playerId, `+${selfGain} Scrap`, { scrap: selfGain }),
      impact(partnerId, `+${partnerGain} Scrap`, { scrap: partnerGain }),
    ],
    sourceCardId: "trading_post",
    sourcePlayerId: playerId,
  });
}

// ─── Registry ────────────────────────────────────────────────────────────────

// Each entry declares:
//   actionCost: actions spent to activate (0 if none)
//   scrapCost: scrap spent to activate (0 if none)
//   oncePerTurn: true if the building locks after one use per turn
//   requires: optional "partner" for target selection
const HANDLERS = {
  antenna_array: {
    actionCost: 0,
    scrapCost: 2,
    oncePerTurn: true,
    requires: null,
    apply: antennaArray,
  },
  vehicle_garage: {
    actionCost: 0,
    scrapCost: 2,
    oncePerTurn: true,
    requires: null,
    apply: vehicleGarage,
  },
  trading_post: {
    actionCost: 1,
    scrapCost: 0,
    oncePerTurn: true,
    requires: "partner",
    apply: tradingPost,
  },
};

export const ACTIVATABLE_BUILDING_IDS = Object.keys(HANDLERS);

export function abilityMeta(buildingId) {
  return HANDLERS[buildingId] ?? null;
}

export function canActivate(state, playerId, building) {
  const handler = HANDLERS[building?.id];
  if (!handler) return { ok: false, reason: "no-handler" };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "no-player" };
  if (state.activePlayerId !== playerId) return { ok: false, reason: "not-your-turn" };
  if ((player.disabledBuildingUids ?? []).includes(building.uid))
    return { ok: false, reason: "disabled" };
  if (!player.settlement.some((b) => b.uid === building.uid))
    return { ok: false, reason: "not-owned" };
  if (handler.oncePerTurn && player.abilityUsedThisTurn?.[building.uid])
    return { ok: false, reason: "used-this-turn" };
  if (player.actionsRemaining < handler.actionCost) return { ok: false, reason: "actions" };
  if (player.scrap < handler.scrapCost) return { ok: false, reason: "scrap" };
  return { ok: true, handler };
}

export function activateAbility(state, playerId, buildingUid, opts = {}) {
  if (state.winnerId != null) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const building = player.settlement.find((b) => b.uid === buildingUid);
  if (!building) return state;
  const { ok, handler } = canActivate(state, playerId, building);
  if (!ok) return state;
  if (handler.requires === "partner" && opts.partnerId == null) return state;
  return handler.apply(state, playerId, building, opts);
}
