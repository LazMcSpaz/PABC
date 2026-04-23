import {
  ALL_EXPLORATION_CARDS,
  ALL_PURCHASABLE_BUILDINGS,
  INTRIGUE_CARDS,
  STARTER_BUILDINGS,
  STARTER_LEADERS,
  UPGRADES,
  expandByQty,
} from "./cards.js";
import { calcActions, calcPassiveScrap } from "./calculations.js";

export function makePlayer({ id, name, kind = "human", personalityId = null, color = "#888" }) {
  return {
    id,
    name,
    kind,
    personalityId,
    color,
    scrap: 0,
    settlement: [],
    leader: null,
    intrigueHand: [],
    boosts: { atk: 0, def: 0 },
    bonusAtk: 0,
    bonusDef: 0,
    actionsRemaining: 0,
    disabledBuildingUids: [],
    buildingsDisabledUntilOwnerTurnStart: [],
    temporaryDebuffs: [],
    bonusActionsNextTurn: 0,
    loseActionsNextTurn: 0,
    skipExploreNextTurn: false,
    skipExploreThisTurn: false,
    flags: {},
    abilityUsedThisTurn: {},
    leaderDisabledUntilOwnerTurnStart: false,
    raidedThisRound: [],
    earnedVP: 0,
  };
}

export function shuffle(arr, rng = Math.random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function seedStarters(player, starterPool, starterLeaders) {
  const depot = starterPool.find((c) => c.id === "salvage_depot");
  const barracks = starterPool.find((c) => c.id === "makeshift_barracks");
  const admin = starterLeaders.find((l) => l.id === "administrator");
  const settlement = [];
  if (depot) settlement.push({ ...depot, uid: `${depot.id}_p${player.id}` });
  if (barracks) settlement.push({ ...barracks, uid: `${barracks.id}_p${player.id}` });
  return {
    ...player,
    settlement,
    leader: admin ? { ...admin, uid: `${admin.id}_p${player.id}` } : null,
  };
}

export function makeInitialState({ players }) {
  const buildingDeck = shuffle(expandByQty(ALL_PURCHASABLE_BUILDINGS));
  const explorationDeck = shuffle(expandByQty(ALL_EXPLORATION_CARDS));
  const intrigueDeck = shuffle(expandByQty(INTRIGUE_CARDS));

  const starterPool = expandByQty(STARTER_BUILDINGS);
  const seated = players.map((p) => seedStarters(p, starterPool, STARTER_LEADERS));

  const buildingRow = buildingDeck.splice(0, 5);

  // Unlockable Deck — upgrades are available from game start to any player
  // who owns the parent building and can pay the cost. Unique-building and
  // leader rewards from progression challenges and narrative chains are
  // added to this pool as they unlock (scope = "any" for progression,
  // scope = playerId for narrative-specific rewards).
  const unlockableDeck = expandByQty(UPGRADES).map((c) => ({ ...c, scope: "any" }));

  const state = {
    round: 1,
    age: 1,
    activePlayerId: seated[0]?.id ?? 0,
    players: seated,
    buildingDeck,
    explorationDeck,
    intrigueDeck,
    buildingRow,
    unlockableDeck,
    unlocksPending: [], // ids unlocked but whose card data isn't defined yet
    explorationInPlay: [],
    progressionResolved: [],
    narrativeState: {},
    globalFlags: { explorationBlocked: false, raidsBlocked: false },
    log: [],
    aiLog: [],
    notifications: [],
    notificationCounter: 0,
    winnerId: null,
  };

  // Start-of-turn bookkeeping for the opening player: collect passive scrap
  // and get their base action count.
  state.players = state.players.map((p) =>
    p.id === state.activePlayerId
      ? { ...p, actionsRemaining: calcActions(p), scrap: p.scrap + calcPassiveScrap(p) }
      : p,
  );
  return state;
}
