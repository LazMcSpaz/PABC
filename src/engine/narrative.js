// Narrative chain progression. Tracks which beat each chain is on per player.
import { NARRATIVE_CHAINS } from "./cards.js";

export function getChain(chainId) {
  return NARRATIVE_CHAINS.filter((beat) => beat.chainId === chainId).sort(
    (a, b) => a.beat - b.beat,
  );
}

export function getActiveBeats(state, playerId) {
  const progress = state.narrativeState?.[playerId] ?? {};
  const chainIds = new Set(NARRATIVE_CHAINS.map((b) => b.chainId));
  const out = [];
  for (const chainId of chainIds) {
    const chain = getChain(chainId);
    const currentBeat = progress[chainId] ?? 1;
    const beat = chain.find((b) => b.beat === currentBeat);
    if (beat) out.push(beat);
  }
  return out;
}

export function advanceBeat(state, playerId, chainId) {
  const playerProgress = state.narrativeState?.[playerId] ?? {};
  const nextBeat = (playerProgress[chainId] ?? 1) + 1;
  return {
    ...state,
    narrativeState: {
      ...state.narrativeState,
      [playerId]: { ...playerProgress, [chainId]: nextBeat },
    },
  };
}
