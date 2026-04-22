// Narrative chain progression. Tracks which beat each chain is on per player.
// Chain objects come from NARRATIVE_CHAINS — each has id, name, finalReward,
// and a beats[] array. Beats nest under the chain, not the other way around.
import { NARRATIVE_CHAINS } from "./cards.js";

export function getChain(chainId) {
  return NARRATIVE_CHAINS.find((c) => c.id === chainId) ?? null;
}

export function getBeat(chainId, beatNumber) {
  const chain = getChain(chainId);
  if (!chain) return null;
  return chain.beats.find((b) => b.beat === beatNumber) ?? null;
}

export function getActiveBeats(state, playerId) {
  const progress = state.narrativeState?.[playerId] ?? {};
  const out = [];
  for (const chain of NARRATIVE_CHAINS) {
    const currentBeat = progress[chain.id];
    if (currentBeat == null) continue;
    const beat = chain.beats.find((b) => b.beat === currentBeat);
    if (beat) out.push({ chain, beat });
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
