// Pure state transitions. Each function takes state + args and returns a new
// state. Never mutate inputs. Real rule enforcement fills in over time; for
// now these do the minimum to keep state transitions visible and legal.

import { calcActions, calcAttack, calcDefense, calcPassiveScrap, calcVP } from "./calculations.js";
import { CARD_RESOLVERS } from "./resolution.js";

const WIN_VP = 30;

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function log(state, entry) {
  return { ...state, log: [...state.log, { round: state.round, ...entry }] };
}

function refreshBuildingRow(state, removedIndex) {
  const nextRow = [...state.buildingRow];
  if (removedIndex != null) nextRow.splice(removedIndex, 1);
  const deck = [...state.buildingDeck];
  while (nextRow.length < 5 && deck.length) nextRow.push(deck.shift());
  return { ...state, buildingRow: nextRow, buildingDeck: deck };
}

export function build(state, playerId, buildingUid) {
  const rowIndex = state.buildingRow.findIndex((c) => c.uid === buildingUid);
  if (rowIndex < 0) return state;
  const card = state.buildingRow[rowIndex];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.scrap < (card.scrapCost ?? 0)) return state;
  if (player.actionsRemaining < 1) return state;
  if (player.settlement.length >= 5) return state;

  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    scrap: p.scrap - (card.scrapCost ?? 0),
    actionsRemaining: p.actionsRemaining - 1,
    settlement: [...p.settlement, card],
  }));
  next = refreshBuildingRow(next, rowIndex);
  return log(next, { type: "build", playerId, cardId: card.id });
}

export function demolish(state, playerId, buildingUid) {
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    settlement: p.settlement.filter((b) => b.uid !== buildingUid),
  }));
}

export function boost(state, playerId, stat, amount = 1) {
  if (stat !== "atk" && stat !== "def") return state;
  const cost = 2 * amount;
  return updatePlayer(state, playerId, (p) => {
    if (p.scrap < cost) return p;
    return {
      ...p,
      scrap: p.scrap - cost,
      boosts: { ...p.boosts, [stat]: (p.boosts?.[stat] ?? 0) + amount },
    };
  });
}

export function explore(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.actionsRemaining < 1) return state;
  const deck = [...state.explorationDeck];
  const drawn = deck.shift();
  if (!drawn) return state;
  const next = {
    ...state,
    explorationDeck: deck,
    explorationInPlay: [...state.explorationInPlay, { card: drawn, drawnBy: playerId }],
  };
  const afterAction = updatePlayer(next, playerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
  }));
  return log(afterAction, { type: "explore", playerId, cardId: drawn.id });
}

export function resolveCard(state, playerId, cardUid) {
  const entry = state.explorationInPlay.find((e) => e.card.uid === cardUid);
  if (!entry) return state;
  const card = entry.card;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;

  const custom = CARD_RESOLVERS[card.id];
  if (typeof custom === "function") {
    const after = custom(state, playerId, card);
    return {
      ...after,
      explorationInPlay: after.explorationInPlay.filter((e) => e.card.uid !== cardUid),
    };
  }

  // Generic Challenge resolver: pay scrap, check requirements, grant rewards.
  if (card.type === "Challenge" || card.type === "Challenge (Progression)") {
    if (player.scrap < (card.scrapCost ?? 0)) return state;
    if (calcAttack(player) < (card.reqAtk ?? 0)) return state;
    if (calcDefense(player) < (card.reqDef ?? 0)) return state;

    let next = updatePlayer(state, playerId, (p) => ({
      ...p,
      scrap: p.scrap - (card.scrapCost ?? 0) + (card.scrapReward ?? 0),
      bonusAtk: (p.bonusAtk ?? 0) + (card.atkReward ?? 0),
      bonusDef: (p.bonusDef ?? 0) + (card.defReward ?? 0),
      actionsRemaining: p.actionsRemaining + (card.actionReward ?? 0),
      earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
    }));

    if (card.type === "Challenge (Progression)" && card.progressionTrack) {
      next = {
        ...next,
        progressionResolved: [
          ...new Set([...(next.progressionResolved ?? []), card.progressionTrack]),
        ],
      };
    }

    next = {
      ...next,
      explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== cardUid),
    };
    return log(next, { type: "resolve", playerId, cardId: card.id });
  }

  // Non-Challenge types (Event, Challenge (Narrative)) — remove from play
  // and leave per-card automation to a later pass.
  return {
    ...state,
    explorationInPlay: state.explorationInPlay.filter((e) => e.card.uid !== cardUid),
  };
}

export function raid(state, attackerId, targetId /* raidType */) {
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === targetId);
  if (!attacker || !defender || attacker.actionsRemaining < 1) return state;
  if (attacker.raidedThisRound?.includes(targetId)) return state;

  const attack = calcAttack(attacker);
  const defense = calcDefense(defender);
  const success = attack > defense; // defender wins ties per README

  let next = updatePlayer(state, attackerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
    raidedThisRound: [...(p.raidedThisRound ?? []), targetId],
  }));

  if (success) {
    const stolen = Math.floor(defender.scrap / 2);
    next = updatePlayer(next, attackerId, (p) => ({ ...p, scrap: p.scrap + stolen }));
    next = updatePlayer(next, targetId, (p) => ({ ...p, scrap: p.scrap - stolen }));
    // Declared outcome (destroy/steal/disable) — deferred to raid outcome executor.
  }
  return log(next, { type: "raid", attackerId, targetId, success });
}

export function endTurn(state) {
  const idx = state.players.findIndex((p) => p.id === state.activePlayerId);
  const nextIdx = (idx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];

  // Collect passive scrap, recalc actions, clear stale boosts for the incoming player.
  let next = updatePlayer(state, nextPlayer.id, (p) => ({
    ...p,
    boosts: { atk: 0, def: 0 },
    scrap: p.scrap + calcPassiveScrap(p),
    actionsRemaining: calcActions(p),
  }));

  // New round starts when we wrap to player 0: clear raidedThisRound, refresh row.
  if (nextIdx === 0) {
    next = {
      ...next,
      round: next.round + 1,
      players: next.players.map((p) => ({ ...p, raidedThisRound: [] })),
    };
    next = refreshBuildingRow(next, 0);
  }

  next = { ...next, activePlayerId: nextPlayer.id };

  const winner = next.players.find((p) => calcVP(p) >= WIN_VP);
  if (winner) next = { ...next, winnerId: winner.id };

  return next;
}
