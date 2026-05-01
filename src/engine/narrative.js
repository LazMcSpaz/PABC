// Narrative chain progression.
//
// Narrative beat cards live in the Exploration deck (Beat 1 only at game
// start; later beats spawn procedurally when prior beats resolve). When
// a Narrative beat enters explorationInPlay and the player chooses to
// resolve it, resolveNarrativeBeat runs the beat's ability:
//   - draw_next_beat → spawn the named later beat into play for the player
//   - chain_complete → distribute rewards and mark the chain complete
//   - narrative_beat_branching → prompt the player to pick an option
//
// Rewards flow through applyReward, which handles a handful of common
// effect types: gain_scrap, gain_vp, draw_intrigue, gain_actions_now,
// gain_leader_card, unlock_unique_building, gain_unique_intrigue,
// gain_permanent_bonus, gain_scrap_per_turn, set_global_flag.
//
// Unique buildings land in state.unlockableDeck with scope: playerId so
// only the unlocker can purchase them (via the UpgradesView's unique-
// building section).

import { NARRATIVE_CHAINS } from "./cards.js";
import { NARRATIVE_LEADERS, REWARD_CARD_MAP } from "./cards_age1_rewards.js";
import { pausePeekReorder } from "./deckPeek.js";
import { NotifKind, impact, notify } from "./notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "./prompts.js";
import { logEntry, updatePlayer } from "./stateHelpers.js";

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

function setBeatForPlayer(state, playerId, chainId, beatNumber) {
  const existing = state.narrativeState?.[playerId] ?? {};
  return {
    ...state,
    narrativeState: {
      ...(state.narrativeState ?? {}),
      [playerId]: { ...existing, [chainId]: beatNumber },
    },
  };
}

function clearBeatForPlayer(state, playerId, chainId) {
  const existing = { ...(state.narrativeState?.[playerId] ?? {}) };
  delete existing[chainId];
  return {
    ...state,
    narrativeState: {
      ...(state.narrativeState ?? {}),
      [playerId]: existing,
    },
  };
}

// Synthesize the flattened beat shape used in explorationInPlay. Matches
// the structure that ALL_EXPLORATION_CARDS produces for Beat 1 cards.
function synthesizeBeatCard(chain, beat, uniqueSuffix) {
  return {
    id: `${chain.id}_beat_${beat.beat}`,
    uid: `${chain.id}_beat_${beat.beat}_${uniqueSuffix}`,
    name: beat.name,
    type: "Challenge (Narrative)",
    chainId: chain.id,
    chainName: chain.name,
    beat: beat.beat,
    age: 1,
    surprise: !!beat.surprise,
    branches: !!beat.branches,
    scrapCost: beat.scrapCost ?? 0,
    reqAtk: beat.reqAtk ?? 0,
    reqDef: beat.reqDef ?? 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: beat.vp ?? 0,
    ability: beat.ability,
    flavor: beat.flavor,
  };
}

export function spawnBeat(state, playerId, chainId, beatNumber) {
  const chain = getChain(chainId);
  if (!chain) return state;
  const beat = chain.beats.find((b) => b.beat === beatNumber);
  if (!beat) return state;
  const card = synthesizeBeatCard(chain, beat, `${playerId}_r${state.round}_${state.notificationCounter ?? 0}`);
  let next = {
    ...state,
    explorationInPlay: [...state.explorationInPlay, { card, drawnBy: playerId }],
  };
  next = setBeatForPlayer(next, playerId, chainId, beatNumber);
  next = notify(next, {
    kind: NotifKind.INFO,
    title: `${chain.name}: Beat ${beat.beat} drawn`,
    message: `${beat.name} is now in play — resolve to continue the chain.`,
    sourcePlayerId: playerId,
  });
  return next;
}

// Reward effect handlers — registry keyed by effect id. Each:
// (state, playerId, effect, ctx) => newState.
const REWARD_HANDLERS = {
  gain_scrap: (state, playerId, eff) =>
    updatePlayer(state, playerId, (p) => ({ ...p, scrap: p.scrap + (eff.amount ?? 0) })),

  gain_vp: (state, playerId, eff) =>
    updatePlayer(state, playerId, (p) => ({
      ...p,
      earnedVP: (p.earnedVP ?? 0) + (eff.amount ?? 0),
    })),

  gain_actions_now: (state, playerId, eff) =>
    updatePlayer(state, playerId, (p) => ({
      ...p,
      actionsRemaining: p.actionsRemaining + (eff.amount ?? 0),
    })),

  draw_intrigue: (state, playerId, eff) => {
    const count = eff.intrigueDraw ?? eff.amount ?? 1;
    const deck = [...state.intrigueDeck];
    const drawn = [];
    for (let i = 0; i < count && deck.length > 0; i++) drawn.push(deck.shift());
    if (drawn.length === 0) return state;
    return updatePlayer({ ...state, intrigueDeck: deck }, playerId, (p) => ({
      ...p,
      intrigueHand: [...p.intrigueHand, ...drawn].slice(-3),
    }));
  },

  // Adds the leader card to the player's availableLeaders pool. They can
  // swap it into the active leader slot any time (no action cost per
  // README). Leader swap lives in actions.js.
  gain_leader_card: (state, playerId, eff) => {
    const leader = NARRATIVE_LEADERS.find((l) => l.id === eff.leaderId);
    if (!leader) return state;
    return updatePlayer(state, playerId, (p) => {
      if (p.availableLeaders?.some((l) => l.id === leader.id)) return p;
      return {
        ...p,
        availableLeaders: [
          ...(p.availableLeaders ?? []),
          { ...leader, uid: `${leader.id}_p${playerId}` },
        ],
      };
    });
  },

  // Adds a unique building to the shared unlockableDeck scoped to this
  // player so only they can purchase it. Uses REWARD_CARD_MAP as the
  // source of truth for the card shape.
  unlock_unique_building: (state, playerId, eff) => {
    const card = REWARD_CARD_MAP[eff.buildingId];
    if (!card) return state;
    const copy = {
      ...card,
      scope: playerId,
      uid: `${card.id}_p${playerId}`,
    };
    if ((state.unlockableDeck ?? []).some((u) => u.uid === copy.uid)) return state;
    return { ...state, unlockableDeck: [...(state.unlockableDeck ?? []), copy] };
  },

  // Synthesize the unique intrigue card and drop it into the player's hand.
  gain_unique_intrigue: (state, playerId, eff) => {
    const uniqueCard = {
      id: eff.cardId,
      uid: `${eff.cardId}_p${playerId}`,
      name: eff.name ?? eff.cardId,
      type: "Intrigue (Unique)",
      age: 1,
      immediate: !!eff.immediate,
      trigger: eff.trigger,
      vp: eff.vp ?? 2,
      ability: {
        type: eff.immediate ? "reactive" : "self",
        description: eff.description ?? "",
      },
    };
    return updatePlayer(state, playerId, (p) => ({
      ...p,
      intrigueHand: [...p.intrigueHand, uniqueCard].slice(-3),
    }));
  },

  // Record a permanent bonus on the player. The mechanic is kept in the
  // entry but not all mechanics are live yet — future passes will hook
  // specific bonusIds into the calc / trigger flow.
  gain_permanent_bonus: (state, playerId, eff) =>
    updatePlayer(state, playerId, (p) => ({
      ...p,
      permanentBonuses: [
        ...(p.permanentBonuses ?? []),
        {
          bonusId: eff.bonusId ?? "unnamed",
          description: eff.description ?? "",
          mechanic: eff.mechanic ?? null,
        },
      ],
    })),

  gain_scrap_per_turn: (state, playerId, eff) =>
    updatePlayer(state, playerId, (p) => ({
      ...p,
      permanentBonuses: [
        ...(p.permanentBonuses ?? []),
        {
          bonusId: eff.bonusId ?? "scrap_per_turn",
          description: `+${eff.amount} Scrap per turn`,
          mechanic: { trigger: "collect_resources", effect: "bonus_scrap", amount: eff.amount },
        },
      ],
    })),

  set_global_flag: (state, _playerId, eff) => ({
    ...state,
    globalFlags: { ...(state.globalFlags ?? {}), [eff.flag]: eff.value ?? true },
  }),
};

function applyReward(state, playerId, eff) {
  const handler = REWARD_HANDLERS[eff.effect];
  if (!handler) return state;
  return handler(state, playerId, eff);
}

function removeBeatFromPlay(state, beatUid) {
  return {
    ...state,
    explorationInPlay: state.explorationInPlay.filter((e) => e.card.uid !== beatUid),
  };
}

function completeChain(state, playerId, chain, rewards, branchLabel) {
  let next = state;
  for (const reward of rewards ?? []) next = applyReward(next, playerId, reward);
  next = clearBeatForPlayer(next, playerId, chain.id);
  next = updatePlayer(next, playerId, (p) => ({
    ...p,
    completedChains: [...new Set([...(p.completedChains ?? []), chain.id])],
  }));
  const player = next.players.find((p) => p.id === playerId);
  const rewardLabels = (rewards ?? []).map((r) => {
    switch (r.effect) {
      case "gain_scrap":
        return `+${r.amount} Scrap`;
      case "gain_vp":
        return `+${r.amount} VP`;
      case "gain_actions_now":
        return `+${r.amount} Actions`;
      case "draw_intrigue":
        return `+${r.intrigueDraw ?? 1} Intrigue`;
      case "gain_leader_card":
        return `${r.leaderId} leader`;
      case "unlock_unique_building":
        return `unlocked ${r.buildingId}`;
      case "gain_unique_intrigue":
        return `unique Intrigue: ${r.name ?? r.cardId}`;
      case "gain_permanent_bonus":
      case "gain_scrap_per_turn":
        return r.description ?? r.bonusId ?? "permanent bonus";
      case "set_global_flag":
        return `flag ${r.flag}`;
      default:
        return r.effect ?? "reward";
    }
  });
  next = notify(next, {
    kind: NotifKind.INFO,
    title: `${chain.name} complete`,
    message: `${player?.name} completed ${chain.name}${branchLabel ? ` — branch ${branchLabel}` : ""}. ${chain.finalReward ?? ""}`,
    impacts: [impact(playerId, rewardLabels.join(" · ") || "chain rewards")],
    sourcePlayerId: playerId,
    severity: "alert",
  });
  return next;
}

// Main entry from actions.resolveCard. Accepts a decisions bag for
// branching beats (resumer re-enters with decisions.branch set).
export function resolveNarrativeBeat(state, playerId, card, decisions = {}) {
  const chain = getChain(card.chainId);
  if (!chain) return removeBeatFromPlay(state, card.uid);
  const beat = chain.beats.find((b) => b.beat === card.beat);
  if (!beat) return removeBeatFromPlay(state, card.uid);

  // Branching beat: pause for the player to pick an option the first time.
  if (beat.branches && decisions.branch === undefined) {
    const options = (beat.ability?.options ?? []).map((o, i) => {
      const reqBits = [];
      if (o.requirements?.scrap) reqBits.push(`${o.requirements.scrap}🔩`);
      if (o.requirements?.reqAtk) reqBits.push(`req ⚔${o.requirements.reqAtk}`);
      if (o.requirements?.reqDef) reqBits.push(`req 🛡${o.requirements.reqDef}`);
      return {
        value: i,
        label: `${o.label}${reqBits.length ? ` (${reqBits.join(" · ")})` : ""}`,
        description: o.description ?? "",
      };
    });
    return pauseWithPrompt(state, {
      kind: "narrative_branch_choice",
      playerId,
      message: `${chain.name} — ${beat.name}: choose your path.`,
      options,
      context: { playerId, cardUid: card.uid },
    });
  }

  // Resolve a branching beat with a chosen branch.
  if (beat.branches) {
    const chosen = beat.ability?.options?.[decisions.branch];
    if (!chosen) return removeBeatFromPlay(state, card.uid);
    const player = state.players.find((p) => p.id === playerId);
    const req = chosen.requirements ?? {};
    if (req.scrap && player.scrap < req.scrap) return state;
    if (req.reqAtk && (state.players.find((p) => p.id === playerId)?.boosts ?? 0, 0)) {
      // Simple attack-requirement check deferred to calcAttack.
    }
    // Deduct scrap cost from the branch (not the beat).
    let next = state;
    if (req.scrap) {
      next = updatePlayer(next, playerId, (p) => ({ ...p, scrap: p.scrap - req.scrap }));
    }
    next = removeBeatFromPlay(next, card.uid);
    next = completeChain(next, playerId, chain, chosen.rewards, chosen.label);
    return logEntry(next, { type: "narrative_resolve", playerId, chainId: chain.id, beat: beat.beat, branch: chosen.label });
  }

  // Linear beat: pay the beat's scrapCost, run the ability.
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.scrap < (beat.scrapCost ?? 0)) return state;

  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    scrap: p.scrap - (beat.scrapCost ?? 0),
  }));
  next = removeBeatFromPlay(next, card.uid);

  const ability = beat.ability ?? {};

  if (ability.effect === "draw_next_beat") {
    next = spawnBeat(next, playerId, chain.id, ability.nextBeat);
  } else if (ability.effect === "chain_complete") {
    next = completeChain(next, playerId, chain, ability.rewards);
  } else if (Array.isArray(ability.effects)) {
    // Compound: run all effects (supports draw_next_beat + side effects).
    for (const eff of ability.effects) {
      if (eff.effect === "draw_next_beat") {
        next = spawnBeat(next, playerId, chain.id, eff.nextBeat);
      } else if (eff.effect === "peek_and_reorder") {
        // Pauses execution — assumed to be the terminal effect. If we
        // ever need effects after a peek, pass them through followUp.
        next = pausePeekReorder(next, {
          playerId,
          deckType: eff.deckType ?? "exploration",
          peekCount: eff.peekCount ?? 3,
          mayDiscard: !!eff.mayDiscard,
          message: `${chain.name} — ${beat.name}: peek and reorder the top ${eff.peekCount ?? 3} ${eff.deckType ?? "exploration"} cards.`,
        });
      } else {
        next = applyReward(next, playerId, eff);
      }
    }
  }

  next = notify(next, {
    kind: NotifKind.CHALLENGE,
    title: `${chain.name}: ${beat.name} resolved`,
    message: ability.description ?? "",
    impacts: [impact(playerId, `−${beat.scrapCost ?? 0} Scrap`, { scrap: -(beat.scrapCost ?? 0) })],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
  return logEntry(next, { type: "narrative_resolve", playerId, chainId: chain.id, beat: beat.beat });
}

// Resumer for branching beats. The chosen index is the branch option.
registerResumer("narrative_branch_choice", (state, choice, ctx) => {
  const entry = state.explorationInPlay.find((e) => e.card.uid === ctx.cardUid);
  if (!entry) return state;
  return resolveNarrativeBeat(state, ctx.playerId, entry.card, { branch: choice });
});

// AI heuristic: pick the highest-VP branch whose requirements the AI meets.
// Falls back to the first option.
registerAIHeuristic("narrative_branch_choice", (state, prompt) => {
  const entry = state.explorationInPlay.find((e) => e.card.uid === prompt.context.cardUid);
  if (!entry) return 0;
  const player = state.players.find((p) => p.id === prompt.context.playerId);
  const options = entry.card.ability?.options ?? [];
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const req = opt.requirements ?? {};
    if (req.scrap && player.scrap < req.scrap) continue;
    const score = (opt.rewards ?? []).reduce(
      (s, r) => s + (r.amount ?? 0) + (r.intrigueDraw ?? 0) * 2,
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
});

// Swap an available leader into the active slot (no action cost).
export function swapLeader(state, playerId, leaderId) {
  if (state.pendingPrompt) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const newLeader = (player.availableLeaders ?? []).find((l) => l.id === leaderId);
  if (!newLeader) return state;
  const currentLeader = player.leader;
  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    leader: { ...newLeader, disabled: false },
    availableLeaders: [
      ...p.availableLeaders.filter((l) => l.id !== leaderId),
      ...(currentLeader ? [{ ...currentLeader, disabled: false }] : []),
    ],
    leaderDisabledUntilOwnerTurnEnd: false,
  }));
  return notify(next, {
    kind: NotifKind.INFO,
    title: `${player.name} swapped leader`,
    message: `${currentLeader?.name ?? "(none)"} → ${newLeader.name}.`,
    sourcePlayerId: playerId,
  });
}
