// Event card effects apply to all players simultaneously when the card is
// drawn. Each effect is (state, drawerId) => ({ state, persist }):
//   - state: new state after the effect
//   - persist: true if the Event stays in explorationInPlay awaiting
//     resolution (e.g. Minefield blocks exploration until resolved)
//
// See README "Event Card Automation" for the pattern. Resolvers for
// persistent Events live in engine/actions.js resolveCard().
//
// Not automated in this pass (require bespoke UI flows):
//   drifter_intelligence (peek top 2 + reorder)
//   marauder_territory_war (free draw per player)
//   drifter_market (optional intrigue purchase per player)
//   corporate_relic (turn-order auction)
// These will pass through the default "just remove" path below.

import { calcAttack, calcDefense } from "./calculations.js";

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function updateAllPlayers(state, updater) {
  return { ...state, players: state.players.map(updater) };
}

function hasBuilding(player, buildingId) {
  return player.settlement.some((b) => b.id === buildingId);
}

function hasLeader(player, leaderId) {
  return player.leader?.id === leaderId;
}

function logEntry(state, entry) {
  return { ...state, log: [...(state.log ?? []), { round: state.round, ...entry }] };
}

export const EVENT_EFFECTS = {
  harvest: (state) => {
    const next = updateAllPlayers(state, (p) => ({ ...p, scrap: p.scrap + 6 }));
    return { state: logEntry(next, { type: "event", cardId: "harvest", note: "+6 Scrap all" }), persist: false };
  },

  scrap_rush: (state) => {
    const next = updateAllPlayers(state, (p) => {
      const bonus = hasBuilding(p, "scavengers_hut") ? 2 : 0;
      return { ...p, scrap: p.scrap + 4 + bonus };
    });
    return { state: logEntry(next, { type: "event", cardId: "scrap_rush" }), persist: false };
  },

  marauder_ambush: (state) => {
    const next = updateAllPlayers(state, (p) => {
      if (calcAttack(p) >= 3) return p;
      return { ...p, scrap: Math.max(0, p.scrap - 5) };
    });
    return { state: logEntry(next, { type: "event", cardId: "marauder_ambush" }), persist: false };
  },

  mountain_cult_extortion: (state) => {
    const next = updateAllPlayers(state, (p) => {
      if (p.scrap >= 3) return { ...p, scrap: p.scrap - 3 };
      return { ...p, bonusAtk: (p.bonusAtk ?? 0) - 5 };
    });
    return { state: logEntry(next, { type: "event", cardId: "mountain_cult_extortion" }), persist: false };
  },

  disease_scare: (state) => {
    const next = updateAllPlayers(state, (p) => {
      if (hasLeader(p, "doc_brawlins") || hasBuilding(p, "medic_tent")) return p;
      return {
        ...p,
        temporaryDebuffs: [
          ...(p.temporaryDebuffs ?? []),
          { stat: "atk", amount: -2, expiresOn: "owner_turn_start" },
        ],
      };
    });
    return { state: logEntry(next, { type: "event", cardId: "disease_scare" }), persist: false };
  },

  ash_storm: (state) => {
    const next = updateAllPlayers(state, (p) => {
      if (hasBuilding(p, "greenhouse")) return p;
      return { ...p, skipExploreNextTurn: true };
    });
    return { state: logEntry(next, { type: "event", cardId: "ash_storm" }), persist: false };
  },

  mountain_cult_sermon: (state) => {
    const next = updateAllPlayers(state, (p) => {
      if (p.flags?.completedMountainCult) return p;
      return { ...p, loseActionsNextTurn: (p.loseActionsNextTurn ?? 0) + 1 };
    });
    return { state: logEntry(next, { type: "event", cardId: "mountain_cult_sermon" }), persist: false };
  },

  nova9_broadcast: (state, drawerId) => {
    const next = updateAllPlayers(state, (p) => ({
      ...p,
      bonusActionsNextTurn: (p.bonusActionsNextTurn ?? 0) + (p.id === drawerId ? 2 : 1),
    }));
    return { state: logEntry(next, { type: "event", cardId: "nova9_broadcast", drawerId }), persist: false };
  },

  solar_flare: (state) => {
    const targetIds = new Set(["antenna_array", "drone_lab", "signal_jammers"]);
    const next = updateAllPlayers(state, (p) => {
      const toDisable = p.settlement.filter((b) => targetIds.has(b.id)).map((b) => b.uid);
      if (toDisable.length === 0) return p;
      return {
        ...p,
        disabledBuildingUids: [
          ...new Set([...(p.disabledBuildingUids ?? []), ...toDisable]),
        ],
        buildingsDisabledUntilOwnerTurnStart: [
          ...new Set([...(p.buildingsDisabledUntilOwnerTurnStart ?? []), ...toDisable]),
        ],
      };
    });
    return { state: logEntry(next, { type: "event", cardId: "solar_flare" }), persist: false };
  },

  vanguard_remnant_patrol: (state) => {
    let next = {
      ...state,
      globalFlags: { ...state.globalFlags, raidsBlocked: true },
    };
    next = updateAllPlayers(next, (p) => {
      if (hasLeader(p, "lt_tusk")) return { ...p, scrap: p.scrap + 2 };
      return p;
    });
    return { state: logEntry(next, { type: "event", cardId: "vanguard_remnant_patrol" }), persist: false };
  },

  minefield: (state) => {
    const next = {
      ...state,
      globalFlags: { ...state.globalFlags, explorationBlocked: true },
    };
    return { state: logEntry(next, { type: "event", cardId: "minefield", note: "exploration blocked" }), persist: true };
  },
};

export function applyEvent(state, card, drawerId) {
  const fn = EVENT_EFFECTS[card.id];
  if (!fn) {
    // No automation for this Event — leave it in play so a human can apply
    // it manually through the feedback panel / physical-rules override.
    return { state, persist: true };
  }
  return fn(state, drawerId);
}

// Clears globalFlags.raidsBlocked when a round ends. Called from endTurn.
export function clearRoundEndFlags(state) {
  if (!state.globalFlags?.raidsBlocked) return state;
  return { ...state, globalFlags: { ...state.globalFlags, raidsBlocked: false } };
}

// Resolves a persistent Event in play (e.g. Minefield) when a player meets
// its requirement by spending an action. Returns new state with the event
// removed and any globalFlags cleared, or the state unchanged on failure.
export function resolvePersistentEvent(state, playerId, card) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.actionsRemaining < 1) return state;
  if (calcAttack(player) < (card.reqAtk ?? 0)) return state;
  if (calcDefense(player) < (card.reqDef ?? 0)) return state;
  if (player.scrap < (card.scrapCost ?? 0)) return state;

  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
    scrap: p.scrap - (card.scrapCost ?? 0),
    earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
  }));

  if (card.id === "minefield") {
    next = { ...next, globalFlags: { ...next.globalFlags, explorationBlocked: false } };
  }
  next = {
    ...next,
    explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== card.uid),
  };
  return logEntry(next, { type: "resolve_event", playerId, cardId: card.id });
}
