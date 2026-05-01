// src/engine/intrigue.js
// Intrigue card public surface. Two shapes:
//   INTRIGUE_EFFECTS[id] = { apply: (state, playerId, card, opts) => newState,
//                            requires: ["target" | "twoTargets" | "buildingTarget" | null],
//                          }
// or for Immediate (reactive) cards:
//   INTRIGUE_EFFECTS[id] = { immediate: true, trigger: "..." }
//
// playIntrigue() applies an active (non-immediate) card: it validates the
// requirement and target, deducts an Action, removes the card from the
// player's hand, calls the effect, and emits a notification. Immediate
// cards are wired through the trigger bus — they currently also land in
// INTRIGUE_EFFECTS so resolvePersistentEvent and raid() can detect them,
// but they aren't playable via playIntrigue().
//
// Implementation lives under ./intrigue/:
//   handlers.js — 15 active / targeted effect handlers
//   reactive.js — fireRaidReactive / fireChallengeResolveReactive /
//                 fireExploreDrawReactive / fireEventImmunity /
//                 peekChallengeReactiveHolder

import {
  advancedSoftware,
  blackout,
  dataSpike,
  deadDrop,
  divertedResources,
  falseFlag,
  forcedMarch,
  infectedHardware,
  misinformation,
  requisition,
  sabotage,
  scrapFence,
  stolenMaps,
  trainingRegimen,
  whisperNetwork,
} from "./intrigue/handlers.js";
import { updatePlayer } from "./stateHelpers.js";

export {
  fireChallengeResolveReactive,
  fireEventImmunity,
  fireExploreDrawReactive,
  fireRaidReactive,
  peekChallengeReactiveHolder,
} from "./intrigue/reactive.js";

function removeFromHand(player, cardUid) {
  return { ...player, intrigueHand: player.intrigueHand.filter((c) => c.uid !== cardUid) };
}

export const INTRIGUE_EFFECTS = {
  advanced_software: { requires: null, apply: advancedSoftware },
  training_regimen: { requires: null, apply: trainingRegimen },
  scrap_fence: { requires: null, apply: scrapFence },
  forced_march: { requires: null, apply: forcedMarch },
  dead_drop: { requires: null, apply: deadDrop },
  stolen_maps: { requires: "target", apply: stolenMaps },
  infected_hardware: { requires: "target", apply: infectedHardware },
  blackout: { requires: "target", apply: blackout },
  data_spike: { requires: "target", apply: dataSpike },
  diverted_resources: { requires: "target", apply: divertedResources },
  misinformation: { requires: "target", apply: misinformation },
  requisition: { requires: "target", apply: requisition },
  sabotage: { requires: "buildingTarget", apply: sabotage },
  false_flag: { requires: "twoTargets", apply: falseFlag },
  whisper_network: { requires: null, apply: whisperNetwork },
};

// Plays an active (non-immediate) intrigue card from the player's hand.
// Deducts 1 Action, removes the card from hand, calls the effect, emits a
// notification. Returns state unchanged if invalid.
export function playIntrigue(state, playerId, cardUid, opts = {}) {
  if (state.winnerId != null) return state;
  if (state.pendingPrompt) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.actionsRemaining < 1) return state;
  const card = player.intrigueHand.find((c) => c.uid === cardUid);
  if (!card) return state;
  if (card.immediate) return state; // immediates are handled via the trigger bus
  const entry = INTRIGUE_EFFECTS[card.id];
  if (!entry || typeof entry.apply !== "function") return state;

  // Validate target requirements.
  switch (entry.requires) {
    case "target":
      if (opts.targetId == null) return state;
      if (!state.players.some((p) => p.id === opts.targetId && p.id !== playerId)) return state;
      break;
    case "twoTargets": {
      const ids = opts.targetIds ?? [];
      if (ids.length !== 2) return state;
      if (ids.some((id) => !state.players.some((p) => p.id === id && p.id !== playerId))) return state;
      if (ids[0] === ids[1]) return state;
      break;
    }
    case "buildingTarget": {
      const { targetId, buildingUid } = opts;
      if (targetId == null || !buildingUid) return state;
      const target = state.players.find((p) => p.id === targetId && p.id !== playerId);
      if (!target) return state;
      if (!target.settlement.some((b) => b.uid === buildingUid)) return state;
      break;
    }
    default:
      break;
  }

  // Deduct action + remove card from hand, then apply effect.
  let next = updatePlayer(state, playerId, (p) => ({
    ...removeFromHand(p, cardUid),
    actionsRemaining: p.actionsRemaining - 1,
  }));
  next = entry.apply(next, playerId, card, opts);
  return next;
}
