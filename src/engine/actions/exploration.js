// src/engine/actions/exploration.js
// Exploration deck actions: drawing (explore) and resolving the drawn card
// (resolveCard). resolveCard delegates to specialized handlers per card.type
// for Events and Narrative beats and applies the generic challenge resolution
// otherwise. The light_artillery / repeatable / challenge_reactive resumers
// live here because they call back into resolveCard().

import { calcAttack, calcDefense } from "../calculations.js";
import { applyEvent, clearRoundEndFlags, resolvePersistentEvent } from "../events.js";
import {
  fireChallengeResolveReactive,
  fireExploreDrawReactive,
  peekChallengeReactiveHolder,
} from "../intrigue.js";
import { resolveNarrativeBeat } from "../narrative.js";
import { NotifKind, impact, notify } from "../notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "../prompts.js";
import { CARD_RESOLVERS } from "../resolution.js";
import { logEntry, updatePlayer } from "../stateHelpers.js";
import { unlockUnlockable } from "../upgrades.js";
import { hasActiveBuilding } from "./_shared.js";

export function explore(state, playerId) {
  if (state.pendingPrompt) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.actionsRemaining < 1) return state;
  if (player.skipExploreThisTurn) return state;
  if (state.globalFlags?.explorationBlocked) return state;

  const deck = [...state.explorationDeck];
  const drawn = deck.shift();
  if (!drawn) return state;

  let next = {
    ...state,
    explorationDeck: deck,
  };
  next = updatePlayer(next, playerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
  }));
  next = logEntry(next, { type: "explore", playerId, cardId: drawn.id });

  // Reactive: opponents may hold Trapped Road to force-discard the drawn card
  // (Events are immune — they always resolve).
  const reactive = fireExploreDrawReactive(next, playerId, drawn);
  next = reactive.state;
  if (reactive.cancelDraw) return next;

  next = {
    ...next,
    explorationInPlay: [...next.explorationInPlay, { card: drawn, drawnBy: playerId }],
  };

  // Events self-apply on draw (README: "Not optional. The drawing player
  // resolves them immediately."). applyEvent returns whether the card
  // should persist in play (e.g. Minefield blocks exploration).
  if (drawn.type === "Event") {
    const { state: afterEvent, persist } = applyEvent(next, drawn, playerId);
    next = afterEvent;
    if (!persist) {
      next = {
        ...next,
        explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== drawn.uid),
      };
    }
  }

  return next;
}

export function resolveCard(state, playerId, cardUid, decisions = {}) {
  if (state.pendingPrompt) return state;
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

  // Generic Challenge resolver: pay scrap, check requirements, then apply
  // rewards — which may be fully stolen by Vulture or half-skimmed by
  // Salvage Rights if an opponent holds one.
  if (card.type === "Challenge" || card.type === "Challenge (Progression)") {
    const usingArtillery = decisions.lightArtillery === "spend";
    const extraScrapCost = usingArtillery ? 1 : 0;
    const effectiveReqAtk = Math.max(0, (card.reqAtk ?? 0) - (usingArtillery ? 2 : 0));

    // Light Artillery opportunity: if the player owns an active Light
    // Artillery, has 1+ Scrap, and the 2-point requirement reduction
    // would flip the check from fail to pass, pause and ask.
    if (
      decisions.lightArtillery === undefined &&
      (card.reqAtk ?? 0) > 0 &&
      hasActiveBuilding(player, "light_artillery") &&
      player.scrap >= 1 + (card.scrapCost ?? 0) &&
      calcAttack(player) < (card.reqAtk ?? 0) &&
      calcAttack(player) >= Math.max(0, (card.reqAtk ?? 0) - 2)
    ) {
      return pauseWithPrompt(state, {
        kind: "light_artillery_choice",
        playerId,
        message: `${card.name} needs ⚔${card.reqAtk} (you have ⚔${calcAttack(player)}). Spend 1 Scrap to reduce the requirement by 2?`,
        options: [
          { value: "spend", label: "Spend 1 Scrap (−2 ⚔ requirement)" },
          { value: "skip", label: "Skip" },
        ],
        context: { playerId, cardUid, decisions },
      });
    }

    if (player.scrap < (card.scrapCost ?? 0) + extraScrapCost) return state;
    if (calcAttack(player) < effectiveReqAtk) return state;
    if (calcDefense(player) < (card.reqDef ?? 0)) return state;

    // Reactive Intrigue holder approval. If a human opponent is holding
    // Vulture or Salvage Rights, ask them whether to fire it BEFORE the
    // resolver pays cost — the reactive used to auto-fire and the
    // playtester reasonably wanted control over their own card. AI
    // holders auto-fire (heuristic registered below).
    if (decisions.reactiveChoice === undefined) {
      const peek = peekChallengeReactiveHolder(state, playerId);
      if (peek) {
        const holder = state.players.find((p) => p.id === peek.holderId);
        if (holder?.kind === "human") {
          return pauseWithPrompt(state, {
            kind: "challenge_reactive_choice",
            playerId: peek.holderId,
            message: `${player.name} is resolving ${card.name}. Fire your ${peek.cardName}?`,
            options: [
              { value: "fire", label: `Fire ${peek.cardName}` },
              { value: "skip", label: "Save it" },
            ],
            context: { playerId, cardUid, decisions },
          });
        }
      }
    }

    // Repeatable challenges: the player may pay the cost N times in a
    // single resolution (capped by ability.maxRepeat and affordability)
    // for proportionally bigger rewards. Pause once for the count if
    // we haven't been told yet and the card actually allows it.
    if (
      card.ability?.type === "repeatable" &&
      decisions.repeats === undefined
    ) {
      const maxRepeat = card.ability.maxRepeat ?? 1;
      const perScrap = (card.scrapCost ?? 0) + extraScrapCost;
      const maxAffordable =
        perScrap === 0 ? maxRepeat : Math.floor(player.scrap / perScrap);
      const limit = Math.max(1, Math.min(maxRepeat, maxAffordable));
      if (limit > 1) {
        return pauseWithPrompt(state, {
          kind: "repeatable_choice",
          playerId,
          message: `${card.name} — pay cost up to ${limit}× for proportional rewards. How many times?`,
          options: Array.from({ length: limit }, (_, i) => ({
            value: i + 1,
            label: `${i + 1}× (cost ${perScrap * (i + 1)}🔩)`,
          })),
          context: { playerId, cardUid, decisions },
        });
      }
    }
    const repeats = Math.max(1, decisions.repeats ?? 1);

    // Resolver always pays the cost up-front (plus the Light Artillery
    // surcharge, if committed). Multiply by `repeats` for repeatable
    // challenges that the player chose to multi-resolve.
    let next = updatePlayer(state, playerId, (p) => ({
      ...p,
      scrap: p.scrap - ((card.scrapCost ?? 0) + extraScrapCost) * repeats,
    }));
    if (usingArtillery) {
      next = notify(next, {
        kind: NotifKind.BUILD,
        title: `${player.name} fired Light Artillery`,
        message: `Spent 1 Scrap to reduce ${card.name}'s ⚔ requirement by 2.`,
        impacts: [impact(playerId, "−1 Scrap", { scrap: -1 })],
        sourceCardId: "light_artillery",
        sourcePlayerId: playerId,
      });
    }

    // Reactive: Vulture / Salvage Rights. Pass `repeats` so Salvage
    // Rights claims half of the actual (multiplied) Scrap reward.
    // Honor a "skip" decision from the human-holder approval prompt.
    const reactive =
      decisions.reactiveChoice === "skip"
        ? { state: next }
        : fireChallengeResolveReactive(next, playerId, card, repeats);
    next = reactive.state;

    const beneficiaryId = reactive.stolenByHolderId ?? playerId;
    const scrapReward = (card.scrapReward ?? 0) * repeats;
    const atkReward = (card.atkReward ?? 0) * repeats;
    const defReward = (card.defReward ?? 0) * repeats;
    const actionReward = (card.actionReward ?? 0) * repeats;
    const vpReward = (card.vp ?? 0) * repeats;
    const scrapHalvedAmount = reactive.halvedAmount ?? 0;

    if (reactive.stolenByHolderId != null) {
      // Full steal — holder gets everything.
      next = updatePlayer(next, beneficiaryId, (p) => ({
        ...p,
        scrap: p.scrap + scrapReward,
        bonusAtk: (p.bonusAtk ?? 0) + atkReward,
        bonusDef: (p.bonusDef ?? 0) + defReward,
        actionsRemaining: p.actionsRemaining + actionReward,
        earnedVP: (p.earnedVP ?? 0) + vpReward,
      }));
    } else if (reactive.halvedToHolderId != null) {
      // Half scrap skimmed; resolver keeps the other half and all non-scrap rewards.
      next = updatePlayer(next, reactive.halvedToHolderId, (p) => ({
        ...p,
        scrap: p.scrap + scrapHalvedAmount,
      }));
      next = updatePlayer(next, playerId, (p) => ({
        ...p,
        scrap: p.scrap + (scrapReward - scrapHalvedAmount),
        bonusAtk: (p.bonusAtk ?? 0) + atkReward,
        bonusDef: (p.bonusDef ?? 0) + defReward,
        actionsRemaining: p.actionsRemaining + actionReward,
        earnedVP: (p.earnedVP ?? 0) + vpReward,
      }));
    } else {
      // Uncontested — resolver gets everything.
      next = updatePlayer(next, playerId, (p) => ({
        ...p,
        scrap: p.scrap + scrapReward,
        bonusAtk: (p.bonusAtk ?? 0) + atkReward,
        bonusDef: (p.bonusDef ?? 0) + defReward,
        actionsRemaining: p.actionsRemaining + actionReward,
        earnedVP: (p.earnedVP ?? 0) + vpReward,
      }));
    }

    if (card.type === "Challenge (Progression)" && card.progressionTrack) {
      next = {
        ...next,
        progressionResolved: [
          ...new Set([...(next.progressionResolved ?? []), card.progressionTrack]),
        ],
      };
    }

    // Run the challenge's on-resolve ability effects. These are the
    // unlock_unlockable / draw_intrigue / add_to_hand_as_token effects
    // that progression challenges (and some regular challenges) carry on
    // top of their standard rewards.
    const abilityEffects = card.ability?.effects ?? [];
    for (const eff of abilityEffects) {
      if (eff.effect === "unlock_unlockable" && eff.unlockableId) {
        next = unlockUnlockable(next, eff.unlockableId, playerId);
      } else if (eff.effect === "draw_intrigue") {
        const count = eff.intrigueDraw ?? 1;
        const deck = [...next.intrigueDeck];
        const drawn = [];
        for (let i = 0; i < count && deck.length > 0; i++) drawn.push(deck.shift());
        if (drawn.length > 0) {
          next = { ...next, intrigueDeck: deck };
          next = updatePlayer(next, playerId, (p) => ({
            ...p,
            intrigueHand: [...p.intrigueHand, ...drawn].slice(-3),
          }));
          next = notify(next, {
            kind: NotifKind.CHALLENGE,
            title: `${card.name} granted Intrigue`,
            message: `Drew ${drawn.length} Intrigue card${drawn.length > 1 ? "s" : ""}.`,
            impacts: [impact(playerId, `+${drawn.length} Intrigue card${drawn.length > 1 ? "s" : ""}`)],
            sourceCardId: card.id,
            sourcePlayerId: playerId,
          });
        }
      }
      // add_to_hand_as_token is tracked implicitly via progressionResolved
      // — no per-card token artifact yet.
    }

    // Top-level on_resolve add_to_settlement (Rebuild Vanguard Armory):
    // copy the resolved card into the resolver's settlement. Cards with
    // noSlotRequired bypass the 5-slot cap; cards with discardIfDisabled
    // are removed from settlement entirely on a future disable instead
    // of toggling disabled state (handled in intrigue.js).
    if (
      card.ability?.type === "on_resolve" &&
      card.ability?.effect === "add_to_settlement"
    ) {
      const noSlot = !!card.ability.noSlotRequired;
      next = updatePlayer(next, playerId, (p) => {
        if (!noSlot && p.settlement.length >= 5) return p;
        const settlementEntry = {
          ...card,
          uid: `${card.id}_resolved_p${playerId}_${Date.now()}`,
        };
        return { ...p, settlement: [...p.settlement, settlementEntry] };
      });
    }

    next = {
      ...next,
      explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== cardUid),
    };
    next = logEntry(next, { type: "resolve", playerId, cardId: card.id, repeats });

    const rewardBits = [];
    const eff = (n) => n * repeats;
    if (card.scrapReward) rewardBits.push(`+${eff(card.scrapReward)}🔩`);
    if (card.atkReward) rewardBits.push(`+${eff(card.atkReward)}⚔`);
    if (card.defReward) rewardBits.push(`+${eff(card.defReward)}🛡`);
    if (card.actionReward) rewardBits.push(`+${eff(card.actionReward)}⚡`);
    if (card.vp) rewardBits.push(`+${eff(card.vp)}★`);
    if (card.scrapCost) rewardBits.unshift(`−${eff(card.scrapCost)}🔩`);
    if (repeats > 1) rewardBits.unshift(`${repeats}×`);

    // Build the impacts list. The resolver always shows their cost; if
    // Vulture stole the rewards, the holder gets a separate impact line
    // showing what they received. Salvage Rights' half-skim shows the
    // holder's half on a third line so the Scrap movement is visible.
    const resolveImpacts = [];
    if (reactive.stolenByHolderId != null) {
      // Resolver only paid the cost.
      if (card.scrapCost) {
        resolveImpacts.push(
          impact(playerId, `−${eff(card.scrapCost)}🔩 (rewards stolen)`, {
            scrap: -eff(card.scrapCost),
          }),
        );
      }
      const holderName =
        next.players.find((p) => p.id === reactive.stolenByHolderId)?.name ?? "Vulture holder";
      resolveImpacts.push(
        impact(reactive.stolenByHolderId, `${holderName} stole: ${rewardBits.filter((s) => !s.startsWith("−")).join(" · ") || "—"}`, {
          scrap: eff(card.scrapReward ?? 0),
          atk: eff(card.atkReward ?? 0),
          def: eff(card.defReward ?? 0),
          actions: eff(card.actionReward ?? 0),
          vp: eff(card.vp ?? 0),
        }),
      );
    } else if (reactive.halvedToHolderId != null) {
      const half = reactive.halvedAmount ?? 0;
      const holderName =
        next.players.find((p) => p.id === reactive.halvedToHolderId)?.name ?? "Salvage Rights holder";
      resolveImpacts.push(
        impact(playerId, rewardBits.join(" · "), {
          scrap: eff(card.scrapReward ?? 0) - eff(card.scrapCost ?? 0) - half,
          atk: eff(card.atkReward ?? 0),
          def: eff(card.defReward ?? 0),
          actions: eff(card.actionReward ?? 0),
          vp: eff(card.vp ?? 0),
        }),
      );
      resolveImpacts.push(
        impact(reactive.halvedToHolderId, `${holderName} skimmed +${half}🔩`, { scrap: half }),
      );
    } else {
      resolveImpacts.push(
        impact(playerId, rewardBits.join(" · "), {
          scrap: eff(card.scrapReward ?? 0) - eff(card.scrapCost ?? 0),
          atk: eff(card.atkReward ?? 0),
          def: eff(card.defReward ?? 0),
          actions: eff(card.actionReward ?? 0),
          vp: eff(card.vp ?? 0),
        }),
      );
    }
    next = notify(next, {
      kind: NotifKind.CHALLENGE,
      title: `${card.name} resolved`,
      message:
        (card.ability?.description ?? "") +
        (reactive.stolenByHolderId != null ? " (rewards stolen by Vulture)" : "") +
        (reactive.halvedToHolderId != null ? " (half scrap claimed by Salvage Rights)" : ""),
      impacts: resolveImpacts,
      sourceCardId: card.id,
      sourcePlayerId: playerId,
    });
    return next;
  }

  // Persistent Events (Minefield) — pay the action / meet the requirement
  // and clear the associated global flag.
  if (card.type === "Event") {
    return resolvePersistentEvent(state, playerId, card);
  }

  // Narrative beats — chain progression, branching, rewards.
  if (card.type === "Challenge (Narrative)") {
    return resolveNarrativeBeat(state, playerId, card);
  }

  // Anything unrecognized — remove from play.
  return {
    ...state,
    explorationInPlay: state.explorationInPlay.filter((e) => e.card.uid !== cardUid),
  };
}

registerResumer("light_artillery_choice", (state, choice, ctx) => {
  return resolveCard(state, ctx.playerId, ctx.cardUid, {
    ...(ctx.decisions ?? {}),
    lightArtillery: choice,
  });
});

// AI heuristic: if the only option is "spend" (otherwise we wouldn't
// have been prompted), always spend. The prompt is only emitted when it
// flips the outcome, so spending is strictly better.
registerAIHeuristic("light_artillery_choice", () => "spend");

registerResumer("repeatable_choice", (state, choice, ctx) => {
  return resolveCard(state, ctx.playerId, ctx.cardUid, {
    ...(ctx.decisions ?? {}),
    repeats: Number(choice) || 1,
  });
});

// Greedy is optimal for repeatable challenges: pay cost N times for N×
// rewards and never lose anything by paying more (the resolver already
// gates on affordability).
registerAIHeuristic("repeatable_choice", (_state, prompt) => {
  const opts = prompt.options ?? [];
  if (opts.length === 0) return 1;
  return opts[opts.length - 1].value;
});

registerResumer("challenge_reactive_choice", (state, choice, ctx) => {
  return resolveCard(state, ctx.playerId, ctx.cardUid, {
    ...(ctx.decisions ?? {}),
    reactiveChoice: choice,
  });
});

// AI heuristic for reactive prompts: greedy fire is optimal — the
// holder either steals the rewards (Vulture) or skims half scrap
// (Salvage Rights), and saving the card has no opportunity cost since
// it's an Immediate trigger.
registerAIHeuristic("challenge_reactive_choice", () => "fire");
