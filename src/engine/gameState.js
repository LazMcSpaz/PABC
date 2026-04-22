import { BUILDINGS, EXPLORATION, INTRIGUE, LEADERS } from "./cards.js";

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
    actionsRemaining: 0,
    disabledBuildingUids: [],
    raidedThisRound: [],
  };
}

function expandByQty(cards) {
  const out = [];
  for (const card of cards) {
    const qty = card.qty ?? 1;
    for (let i = 0; i < qty; i++) out.push({ ...card, uid: `${card.id}_${i}` });
  }
  return out;
}

export function shuffle(arr, rng = Math.random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildDecks() {
  return {
    buildingDeck: shuffle(expandByQty(BUILDINGS)),
    explorationDeck: shuffle(expandByQty(EXPLORATION)),
    intrigueDeck: shuffle(expandByQty(INTRIGUE)),
    leaderPool: expandByQty(LEADERS),
  };
}

export function makeInitialState({ players }) {
  const decks = buildDecks();
  return {
    round: 1,
    age: 1,
    activePlayerId: players[0]?.id ?? 0,
    players,
    ...decks,
    buildingRow: decks.buildingDeck.splice(0, 5),
    explorationInPlay: [],
    progressionResolved: [],
    narrativeState: {},
    log: [],
    winnerId: null,
  };
}
