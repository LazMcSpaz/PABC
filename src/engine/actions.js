// Pure state transitions. Each function takes state + args and returns a new
// state. Never mutate inputs. Real rule enforcement fills in over time; for
// now these do the minimum to keep state transitions visible and legal.

import {
  calcActions,
  calcAttack,
  calcDefense,
  calcDefenseForRaid,
  calcPassiveScrap,
  calcVP,
} from "./calculations.js";
import { applyEvent, clearRoundEndFlags, resolvePersistentEvent } from "./events.js";
import {
  fireChallengeResolveReactive,
  fireExploreDrawReactive,
  fireRaidReactive,
  peekChallengeReactiveHolder,
} from "./intrigue.js";
import { resolveNarrativeBeat } from "./narrative.js";
import { NotifKind, impact, notify } from "./notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "./prompts.js";
import { CARD_RESOLVERS } from "./resolution.js";
import { logEntry, updatePlayer } from "./stateHelpers.js";
import { unlockUnlockable } from "./upgrades.js";

const WIN_VP = 30;

// Raids are unavailable until this round to avoid first-turn unfairness
// — players need at least one round to set up a defensive baseline before
// being raidable. Surfaced in RaidView and the AI prompt.
export const RAID_UNLOCK_ROUND = 3;

// Snapshot for the per-turn log entry. Captures derived scores and
// id-only references — id strings are stable across runs and play well
// with diff/spreadsheet tooling for balance analysis.
function snapshotPlayers(state) {
  return state.players.map((p) => ({
    id: p.id,
    name: p.name,
    scrap: p.scrap,
    vp: calcVP(p),
    atk: calcAttack(p),
    def: calcDefense(p),
    actions: p.actionsRemaining,
    settlement: p.settlement.map((b) => b.id),
    leader: p.leader?.id ?? null,
    leaderDisabled: !!p.leader?.disabled,
    disabledBuildings: [...(p.disabledBuildingUids ?? [])],
    intrigueHand: p.intrigueHand.map((c) => c.id),
    bonusAtk: p.bonusAtk ?? 0,
    bonusDef: p.bonusDef ?? 0,
    boosts: { ...p.boosts },
    earnedVP: p.earnedVP ?? 0,
  }));
}

function refreshBuildingRow(state, removedIndex) {
  const nextRow = [...state.buildingRow];
  if (removedIndex != null) nextRow.splice(removedIndex, 1);
  const deck = [...state.buildingDeck];
  while (nextRow.length < 5 && deck.length) nextRow.push(deck.shift());
  return { ...state, buildingRow: nextRow, buildingDeck: deck };
}

export function build(state, playerId, buildingUid, decisions = {}) {
  if (state.pendingPrompt) return state;
  const rowIndex = state.buildingRow.findIndex((c) => c.uid === buildingUid);
  if (rowIndex < 0) return state;
  const card = state.buildingRow[rowIndex];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const surcharge = player.flags?.nextBuildingScrapSurcharge ?? 0;
  // ServoCo Assembly: −1 Scrap on every building purchase (floors at 0,
  // applied before the Data Spike surcharge).
  const servotechDiscount = hasActiveBuilding(player, "servotech_assembly") ? 1 : 0;
  const discountedCost = Math.max(0, (card.scrapCost ?? 0) - servotechDiscount);
  const totalCost = discountedCost + surcharge;
  if (player.scrap < totalCost) return state;
  if (player.actionsRemaining < 1) return state;

  // Settlement full — instead of silently rejecting, ask the player which
  // existing building to demolish to make room. Resumer ("demolish_for_build_choice")
  // performs the demolish then re-invokes build() with decisions.demolishUid set.
  let next = state;
  if (player.settlement.length >= 5) {
    if (!decisions.demolishUid) {
      return pauseWithPrompt(state, {
        kind: "demolish_for_build_choice",
        playerId,
        message: `Settlement is full (5/5). Pick a building to demolish to make room for ${card.name}.`,
        options: player.settlement.map((b) => ({
          value: b.uid,
          label: `${b.name}${b.vp ? ` (★${b.vp})` : ""}`,
        })),
        context: { playerId, buildingUid },
      });
    }
    // Apply the demolish before paying for the new building.
    next = demolish(next, playerId, decisions.demolishUid);
  }

  next = updatePlayer(next, playerId, (p) => {
    const flags = { ...(p.flags ?? {}) };
    delete flags.nextBuildingScrapSurcharge;
    return {
      ...p,
      scrap: p.scrap - totalCost,
      actionsRemaining: p.actionsRemaining - 1,
      settlement: [...p.settlement, card],
      // Summoning sickness: activated abilities on a freshly-built building
      // are gated until the owner's next turn. Cleared in endTurn() when this
      // player's turn comes back around.
      builtThisTurnUids: [...(p.builtThisTurnUids ?? []), card.uid],
      flags,
    };
  });
  next = refreshBuildingRow(next, rowIndex);
  next = logEntry(next, { type: "build", playerId, cardId: card.id });
  if (servotechDiscount > 0 && (card.scrapCost ?? 0) > 0) {
    next = notify(next, {
      kind: NotifKind.BUILD,
      title: "ServoCo Assembly discount",
      message: `${player.name} paid ${discountedCost}🔩 for ${card.name} (−${servotechDiscount} ServoCo).`,
      impacts: [impact(playerId, `−${servotechDiscount} Scrap saved`, { scrap: servotechDiscount })],
      sourcePlayerId: playerId,
    });
  }
  if (surcharge > 0) {
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: `Data Spike surcharge applied`,
      message: `${player.name} paid +${surcharge} Scrap on this build.`,
      impacts: [impact(playerId, `paid +${surcharge} surcharge`, { scrap: -surcharge })],
      sourcePlayerId: playerId,
      severity: "warning",
    });
  }
  return next;
}

export function demolish(state, playerId, buildingUid) {
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    settlement: p.settlement.filter((b) => b.uid !== buildingUid),
  }));
}

// Repair a disabled building on the active player's turn. Standard cost
// per the rules summary: 1 Action + 2 Scrap. Only clears entries from
// disabledBuildingUids — does NOT touch buildingsDisabledUntilOwnerTurnEnd
// (those auto-recover on the owner's turn end already, no manual repair
// needed).
export function repair(state, playerId, buildingUid) {
  if (state.pendingPrompt) return state;
  if (state.activePlayerId !== playerId) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (!(player.disabledBuildingUids ?? []).includes(buildingUid)) return state;
  if (player.actionsRemaining < 1 || player.scrap < 2) return state;
  const building = (player.settlement ?? []).find((b) => b.uid === buildingUid);
  if (!building) return state;

  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
    scrap: p.scrap - 2,
    disabledBuildingUids: (p.disabledBuildingUids ?? []).filter((x) => x !== buildingUid),
  }));
  next = logEntry(next, { type: "repair", playerId, cardId: building.id });
  return notify(next, {
    kind: NotifKind.BUILD,
    title: `${player.name} repaired ${building.name}`,
    message: `Spent 1⚡ + 2🔩 to bring ${building.name} back online.`,
    impacts: [impact(playerId, "−1⚡ · −2🔩 · building active again", { scrap: -2, actions: -1 })],
    sourceCardId: building.id,
    sourcePlayerId: playerId,
  });
}

export function boost(state, playerId, stat, amount = 1) {
  if (state.pendingPrompt) return state;
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

function hasActiveBuilding(player, buildingId) {
  const disabled = new Set(player.disabledBuildingUids ?? []);
  return (player.settlement ?? []).some((b) => b.id === buildingId && !disabled.has(b.uid));
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

registerResumer("demolish_for_build_choice", (state, choice, ctx) => {
  return build(state, ctx.playerId, ctx.buildingUid, { demolishUid: choice });
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

// AI heuristic: demolish the lowest-VP non-leader building (cheapest
// loss). Ties broken arbitrarily by the first-found order.
registerAIHeuristic("demolish_for_build_choice", (state, prompt) => {
  const player = state.players.find((p) => p.id === prompt.playerId);
  if (!player) return prompt.options?.[0]?.value;
  const choices = (player.settlement ?? []).slice().sort(
    (a, b) => (a.vp ?? 0) - (b.vp ?? 0),
  );
  return choices[0]?.uid ?? prompt.options?.[0]?.value;
});

export const RAID_TYPES = Object.freeze({
  // The building outcome was renamed from "Destroy" to "Disable" — a
  // successful raid now disables the target building (the owner can
  // pay 1⚡ + 2🔩 on their turn to repair it). The constant key
  // remains DESTROY for backward compatibility with older callers and
  // logged entries.
  DESTROY: "Disable Building",
  STEAL: "Steal Intrigue",
  DISABLE: "Disable Leader",
});

// Execute the attacker's declared outcome on the chosen defender.
// Returns { state, impacts, summary } — impacts and summary feed the notification.
function executeRaidOutcome(state, attackerId, defenderId, raidType, extras) {
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);

  if (raidType === RAID_TYPES.DESTROY) {
    const uid = extras?.buildingUid;
    const building = defender.settlement.find((b) => b.uid === uid);
    if (!building) {
      return {
        state,
        impacts: [],
        summary: "no building targeted — outcome skipped",
      };
    }
    // Vanguard Outpost is immune to the Disable Building raid outcome
    // (carries forward from when this was a Destroy raid).
    if (building.id === "vanguard_outpost") {
      return {
        state,
        impacts: [impact(defenderId, `${building.name} is immune — raid outcome blocked`)],
        summary: `${building.name} is immune to Disable`,
      };
    }
    // Cards with discardIfDisabled (Vanguard Armory) are removed
    // entirely instead of getting a recoverable disable.
    if (building.ability?.discardIfDisabled) {
      const next = {
        ...state,
        players: state.players.map((p) =>
          p.id === defenderId
            ? {
                ...p,
                settlement: p.settlement.filter((b) => b.uid !== uid),
                disabledBuildingUids: (p.disabledBuildingUids ?? []).filter((x) => x !== uid),
                buildingsDisabledUntilOwnerTurnEnd: (
                  p.buildingsDisabledUntilOwnerTurnEnd ?? []
                ).filter((x) => x !== uid),
              }
            : p,
        ),
      };
      return {
        state: next,
        impacts: [
          impact(defenderId, `lost ${building.name} (no recovery)`),
          impact(attackerId, `discarded ${building.name}`),
        ],
        summary: `discarded ${building.name}`,
      };
    }
    // Default: disable the building. Note we do NOT add to
    // buildingsDisabledUntilOwnerTurnEnd — raid disables persist until
    // the owner pays the Repair cost (1⚡ + 2🔩) on their turn.
    const next = {
      ...state,
      players: state.players.map((p) =>
        p.id === defenderId
          ? {
              ...p,
              disabledBuildingUids: [
                ...new Set([...(p.disabledBuildingUids ?? []), uid]),
              ],
            }
          : p,
      ),
    };
    return {
      state: next,
      impacts: [
        impact(defenderId, `${building.name} disabled (Repair: 1⚡ + 2🔩)`),
        impact(attackerId, `disabled ${building.name}`),
      ],
      summary: `disabled ${building.name}`,
    };
  }

  if (raidType === RAID_TYPES.STEAL) {
    if ((defender.intrigueHand ?? []).length === 0) {
      return {
        state,
        impacts: [impact(defenderId, "no Intrigue to steal")],
        summary: "defender had no Intrigue",
      };
    }
    const idx = Math.floor(Math.random() * defender.intrigueHand.length);
    const stolenCard = defender.intrigueHand[idx];
    const next = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === defenderId) {
          return {
            ...p,
            intrigueHand: p.intrigueHand.filter((c) => c.uid !== stolenCard.uid),
          };
        }
        if (p.id === attackerId) {
          return { ...p, intrigueHand: [...p.intrigueHand, stolenCard].slice(-3) };
        }
        return p;
      }),
    };
    return {
      state: next,
      impacts: [
        impact(attackerId, "stole an Intrigue card"),
        impact(defenderId, "lost a random Intrigue card"),
      ],
      summary: `stole an Intrigue card`,
    };
  }

  if (raidType === RAID_TYPES.DISABLE) {
    if (!defender.leader) {
      return {
        state,
        impacts: [impact(defenderId, "no leader to disable")],
        summary: "defender had no leader",
      };
    }
    const next = {
      ...state,
      players: state.players.map((p) =>
        p.id === defenderId
          ? {
              ...p,
              leader: { ...p.leader, disabled: true },
              leaderDisabledUntilOwnerTurnEnd: true,
            }
          : p,
      ),
    };
    return {
      state: next,
      impacts: [impact(defenderId, `${defender.leader.name} disabled until next turn`)],
      summary: `disabled ${defender.leader.name}`,
    };
  }

  return { state, impacts: [], summary: "unknown raid type — no outcome" };
}

export function raid(state, attackerId, targetId, raidType = RAID_TYPES.DESTROY, extras = {}) {
  if (state.pendingPrompt) return state;
  if (state.globalFlags?.raidsBlocked) return state;
  if (state.round < RAID_UNLOCK_ROUND) return state;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === targetId);
  if (!attacker || !defender || attacker.actionsRemaining < 1) return state;
  if (attacker.raidedThisRound?.includes(targetId)) return state;

  // Action + raid-cap are consumed up-front so Immediate reactive cards can't
  // be replayed for free if they cancel the raid.
  let next = updatePlayer(state, attackerId, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - 1,
    raidedThisRound: [...(p.raidedThisRound ?? []), targetId],
  }));

  // Immediate reactive cards: decoy_caravan can redirect the raid;
  // emergency_protocols can force the attacker to pay 3 Scrap or abandon.
  const reactive = fireRaidReactive(next, attackerId, targetId);
  next = reactive.state;
  if (reactive.cancel) {
    return logEntry(next, { type: "raid", attackerId, targetId, cancelled: true });
  }
  const effectiveDefenderId = reactive.redirectTo ?? targetId;

  return continueRaid(next, {
    attackerId,
    defenderId: effectiveDefenderId,
    raidType,
    extras,
    decisions: {},
  });
}

// Phased continuation of a raid: handles opt-in Signal Jammers (attacker)
// and Perimeter Traps (defender) by pausing with prompts, then finalizes
// the resolution once both decisions are in hand.
function continueRaid(state, ctx) {
  const { attackerId, defenderId } = ctx;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);

  // Phase: Signal Jammers (attacker opt-in).
  if (ctx.decisions.jammer === undefined) {
    if (hasActiveBuilding(attacker, "signal_jammers") && attacker.scrap >= 2) {
      return pauseWithPrompt(state, {
        kind: "signal_jammers_choice",
        playerId: attackerId,
        message: `Spend 2 Scrap on Signal Jammers to reduce ${defender.name}'s 🛡 by 2 for this raid?`,
        options: [
          { value: "spend", label: "Spend 2 Scrap (−2 🛡 target)" },
          { value: "skip", label: "Skip" },
        ],
        context: ctx,
      });
    }
    ctx = { ...ctx, decisions: { ...ctx.decisions, jammer: "skip" } };
  }
  if (ctx.decisions.jammer === "spend") {
    state = updatePlayer(state, attackerId, (p) => ({ ...p, scrap: p.scrap - 2 }));
    state = notify(state, {
      kind: NotifKind.INTRIGUE,
      title: `${attacker.name} fired Signal Jammers`,
      message: `Spent 2 Scrap — ${defender.name}'s Defense is reduced by 2 this raid.`,
      impacts: [impact(attackerId, "−2 Scrap", { scrap: -2 })],
      sourceCardId: "signal_jammers",
      sourcePlayerId: attackerId,
      severity: "warning",
    });
  }

  // Phase: Perimeter Traps (defender opt-in).
  if (ctx.decisions.traps === undefined) {
    const defNow = state.players.find((p) => p.id === defenderId);
    if (hasActiveBuilding(defNow, "perimeter_traps") && defNow.scrap >= 2) {
      const atkCurrent = calcAttack(attacker);
      return pauseWithPrompt(state, {
        kind: "perimeter_traps_choice",
        playerId: defenderId,
        message: `${attacker.name} is raiding you (⚔${atkCurrent}). Spend 2 Scrap on Perimeter Traps for +2 🛡?`,
        options: [
          { value: "spend", label: "Spend 2 Scrap (+2 🛡)" },
          { value: "skip", label: "Skip" },
        ],
        context: ctx,
      });
    }
    ctx = { ...ctx, decisions: { ...ctx.decisions, traps: "skip" } };
  }
  if (ctx.decisions.traps === "spend") {
    state = updatePlayer(state, defenderId, (p) => ({ ...p, scrap: p.scrap - 2 }));
    state = notify(state, {
      kind: NotifKind.INTRIGUE,
      title: `${defender.name} fired Perimeter Traps`,
      message: `Spent 2 Scrap — +2 🛡 against ${attacker.name}'s raid.`,
      impacts: [impact(defenderId, "−2 Scrap", { scrap: -2 })],
      sourceCardId: "perimeter_traps",
      sourcePlayerId: defenderId,
      severity: "warning",
    });
  }

  return finalizeRaid(state, ctx);
}

function finalizeRaid(state, ctx) {
  const { attackerId, defenderId, raidType, extras, decisions } = ctx;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);

  const attack = calcAttack(attacker);
  const baseDef = calcDefense(defender);
  const defenseForRaid = calcDefenseForRaid(defender);
  const jammerPenalty = decisions.jammer === "spend" ? 2 : 0;
  const trapsBonus = decisions.traps === "spend" ? 2 : 0;
  const defense = Math.max(0, defenseForRaid - jammerPenalty + trapsBonus);
  const lookoutFired = defenseForRaid > baseDef;
  const success = attack > defense;

  let next = state;
  const stolen = success ? Math.floor(defender.scrap / 2) : 0;
  if (success && stolen > 0) {
    next = updatePlayer(next, attackerId, (p) => ({ ...p, scrap: p.scrap + stolen }));
    next = updatePlayer(next, defenderId, (p) => ({ ...p, scrap: p.scrap - stolen }));
  }

  let outcomeImpacts = [];
  let outcomeSummary = "";
  if (success) {
    const result = executeRaidOutcome(next, attackerId, defenderId, raidType, extras);
    next = result.state;
    outcomeImpacts = result.impacts;
    outcomeSummary = result.summary;
  }

  next = logEntry(next, {
    type: "raid",
    attackerId,
    targetId: defenderId,
    raidType,
    success,
  });

  const defAdjustBits = [];
  if (lookoutFired) defAdjustBits.push("+2 Lookout");
  if (jammerPenalty) defAdjustBits.push("−2 Jammers");
  if (trapsBonus) defAdjustBits.push("+2 Traps");

  next = notify(next, {
    kind: NotifKind.RAID,
    title: success
      ? `Raid succeeded: ${attacker.name} → ${defender.name} (${raidType})`
      : `Raid failed: ${attacker.name} → ${defender.name}`,
    message: (success
      ? `⚔${attack} vs 🛡${defense}. Defender wins ties.${stolen > 0 ? ` Attacker stole ${stolen} Scrap.` : ""}${outcomeSummary ? ` Outcome: ${outcomeSummary}.` : ""}`
      : `⚔${attack} vs 🛡${defense}. No reward (defender wins ties).`) +
      (defAdjustBits.length ? ` Defense: ${defAdjustBits.join(", ")}.` : ""),
    impacts: success
      ? [
          ...(stolen > 0
            ? [
                impact(attackerId, `+${stolen}🔩`, { scrap: stolen }),
                impact(defenderId, `−${stolen}🔩`, { scrap: -stolen }),
              ]
            : []),
          ...outcomeImpacts,
        ]
      : [impact(attackerId, "attack repelled")],
    sourcePlayerId: attackerId,
    severity: success ? "alert" : "info",
  });
  return next;
}

registerResumer("signal_jammers_choice", (state, choice, ctx) => {
  return continueRaid(state, { ...ctx, decisions: { ...(ctx.decisions ?? {}), jammer: choice } });
});
registerResumer("perimeter_traps_choice", (state, choice, ctx) => {
  return continueRaid(state, { ...ctx, decisions: { ...(ctx.decisions ?? {}), traps: choice } });
});

// AI heuristics. Signal Jammers: spend if the 2-point reduction would
// flip an otherwise-failing raid into a success. Perimeter Traps: spend
// if the 2-point boost would flip an otherwise-winning raid into a fail.
registerAIHeuristic("signal_jammers_choice", (state, prompt) => {
  const { attackerId, defenderId } = prompt.context;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);
  if (!attacker || !defender) return "skip";
  const atk = calcAttack(attacker);
  const def = calcDefenseForRaid(defender);
  return atk > def - 2 && atk <= def ? "spend" : "skip";
});
registerAIHeuristic("perimeter_traps_choice", (state, prompt) => {
  const { attackerId, defenderId, decisions } = prompt.context;
  const attacker = state.players.find((p) => p.id === attackerId);
  const defender = state.players.find((p) => p.id === defenderId);
  if (!attacker || !defender) return "skip";
  const atk = calcAttack(attacker);
  const jammerPenalty = decisions?.jammer === "spend" ? 2 : 0;
  const def = Math.max(0, calcDefenseForRaid(defender) - jammerPenalty);
  return atk > def && atk <= def + 2 ? "spend" : "skip";
});

export function endTurn(state) {
  if (state.winnerId != null) return state;
  if (state.pendingPrompt) return state;
  const idx = state.players.findIndex((p) => p.id === state.activePlayerId);
  const nextIdx = (idx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];

  // Turn-end bookkeeping for the OUTGOING player:
  //   - clear skipExploreThisTurn (their skipped turn is over)
  //   - re-enable buildings disabled "until owner turn end" — these
  //     were disabled by an opponent and are meant to cost the owner
  //     one full turn, recovering as that turn ends
  //   - same for the leader (raid Disable Leader outcome) and any
  //     temporaryDebuffs tagged "owner_turn_end"
  //   - capture leaderRecovered for the post-update notification
  let outgoingLeaderRecovered = false;
  const outgoingPlayer = state.players.find((p) => p.id === state.activePlayerId);
  let next = updatePlayer(state, state.activePlayerId, (p) => {
    const toReenable = new Set(p.buildingsDisabledUntilOwnerTurnEnd ?? []);
    const stillDisabled = (p.disabledBuildingUids ?? []).filter(
      (uid) => !toReenable.has(uid),
    );
    const freshDebuffs = (p.temporaryDebuffs ?? []).filter(
      (d) => d.expiresOn !== "owner_turn_end",
    );
    const leaderRecovered = !!p.leaderDisabledUntilOwnerTurnEnd;
    if (leaderRecovered && p.leader) outgoingLeaderRecovered = true;
    return {
      ...p,
      skipExploreThisTurn: false,
      disabledBuildingUids: stillDisabled,
      buildingsDisabledUntilOwnerTurnEnd: [],
      temporaryDebuffs: freshDebuffs,
      leader:
        leaderRecovered && p.leader ? { ...p.leader, disabled: false } : p.leader,
      leaderDisabledUntilOwnerTurnEnd: false,
    };
  });

  // Turn-start bookkeeping for the INCOMING player:
  //   - clear per-turn boosts, ability-used and built-this-turn pools
  //   - promote skipExploreNextTurn → skipExploreThisTurn
  //   - apply bonus/lose actions scheduled from previous events
  //   - collect passive scrap (no disable-recovery here — that fires on
  //     the disabled player's previous turn-end, above)
  next = updatePlayer(next, nextPlayer.id, (p) => {
    const flags = { ...(p.flags ?? {}) };
    delete flags.divertScrapNextTurnTo;
    const revived = {
      ...p,
      boosts: { atk: 0, def: 0 },
      skipExploreThisTurn: !!p.skipExploreNextTurn,
      skipExploreNextTurn: false,
      flags,
      abilityUsedThisTurn: {},
      builtThisTurnUids: [],
    };
    const baseActions = calcActions(revived);
    const actionsAfterSchedule = Math.max(
      0,
      baseActions +
        (p.bonusActionsNextTurn ?? 0) -
        (p.loseActionsNextTurn ?? 0),
    );
    const passiveScrap = calcPassiveScrap(revived);
    // Medic Tent (+1) / Improved Meds (+2) recover permanent Attack
    // losses each turn, clamped so bonusAtk never exceeds 0 (can't
    // grant more than the player's natural score).
    let atkRecovery = 0;
    const disabledSet = new Set(revived.disabledBuildingUids ?? []);
    for (const b of revived.settlement) {
      if (disabledSet.has(b.uid)) continue;
      if (b.ability?.effect === "recover_atk") {
        atkRecovery += b.ability.atkRecovery ?? 0;
      }
    }
    const currentBonusAtk = revived.bonusAtk ?? 0;
    const recoveredBonusAtk =
      atkRecovery > 0 && currentBonusAtk < 0
        ? Math.min(0, currentBonusAtk + atkRecovery)
        : currentBonusAtk;
    // If Diverted Resources is in effect, their passive scrap goes to the
    // thief; revived.scrap stays unchanged.
    const divertTo = p.flags?.divertScrapNextTurnTo;
    return {
      ...revived,
      scrap: revived.scrap + (divertTo != null ? 0 : passiveScrap),
      _divertedScrap: divertTo != null ? { to: divertTo, amount: passiveScrap } : null,
      actionsRemaining: actionsAfterSchedule,
      bonusActionsNextTurn: 0,
      loseActionsNextTurn: 0,
      bonusAtk: recoveredBonusAtk,
      _atkRecovered: recoveredBonusAtk - currentBonusAtk,
    };
  });

  // Notify the incoming player when Medic Tent / Improved Meds fired.
  const recovered = next.players.find(
    (p) => p.id === nextPlayer.id && (p._atkRecovered ?? 0) > 0,
  );
  if (recovered) {
    next = notify(next, {
      kind: NotifKind.BUILD,
      title: `Medic recovery for ${nextPlayer.name}`,
      message: `Recovered ${recovered._atkRecovered} ⚔ from Medic Tent / Improved Meds.`,
      impacts: [impact(nextPlayer.id, `+${recovered._atkRecovered} ⚔`, { atk: recovered._atkRecovered })],
      sourcePlayerId: nextPlayer.id,
    });
  }
  next = {
    ...next,
    players: next.players.map((p) => {
      if (!("_atkRecovered" in p)) return p;
      const { _atkRecovered: _, ...clean } = p;
      return clean;
    }),
  };

  // Surface leader recovery on the outgoing player — their leader was
  // disabled for the full duration of the turn that just ended and is
  // active again starting next time around.
  if (outgoingLeaderRecovered && outgoingPlayer?.leader) {
    next = notify(next, {
      kind: NotifKind.FLAG,
      title: `${outgoingPlayer.leader.name} recovered`,
      message: `${outgoingPlayer.name}'s leader is no longer disabled.`,
      impacts: [impact(outgoingPlayer.id, "leader active next turn")],
      sourcePlayerId: outgoingPlayer.id,
    });
  }

  // If Diverted Resources fired, credit the watcher player and emit a
  // notification. Also strip the _divertedScrap bookkeeping field.
  const divert = next.players.find((p) => p._divertedScrap != null)?._divertedScrap;
  if (divert && divert.amount > 0) {
    next = updatePlayer(next, divert.to, (p) => ({ ...p, scrap: p.scrap + divert.amount }));
    next = notify(next, {
      kind: NotifKind.INTRIGUE,
      title: "Diverted Resources fired",
      message: `${nextPlayer.name}'s passive Scrap was redirected this turn.`,
      impacts: [
        impact(nextPlayer.id, `lost ${divert.amount} passive Scrap`, { scrap: -divert.amount }),
        impact(divert.to, `+${divert.amount} Scrap`, { scrap: divert.amount }),
      ],
      severity: "alert",
    });
  }
  next = {
    ...next,
    players: next.players.map((p) => {
      if (p._divertedScrap == null) return p;
      const { _divertedScrap: _, ...clean } = p;
      return clean;
    }),
  };

  // New round starts when we wrap to player 0: clear raidedThisRound,
  // round-end flags (e.g. raidsBlocked), apply round_start permanent
  // bonuses (e.g. Brawlins' Circuit atk recovery), refresh the row.
  if (nextIdx === 0) {
    const roundRecoveryDeltas = new Map();
    next = {
      ...next,
      round: next.round + 1,
      players: next.players.map((p) => {
        const recover = (p.permanentBonuses ?? []).reduce((sum, b) => {
          const m = b.mechanic;
          if (m?.trigger === "round_start" && m?.effect === "recover_atk") {
            return sum + (m.amount ?? 0);
          }
          return sum;
        }, 0);
        const current = p.bonusAtk ?? 0;
        const recovered =
          recover > 0 && current < 0 ? Math.min(0, current + recover) : current;
        if (recovered !== current) roundRecoveryDeltas.set(p.id, recovered - current);
        return { ...p, raidedThisRound: [], bonusAtk: recovered };
      }),
    };
    for (const [pid, delta] of roundRecoveryDeltas) {
      const pname = next.players.find((p) => p.id === pid)?.name ?? `p${pid}`;
      next = notify(next, {
        kind: NotifKind.FLAG,
        title: `Brawlins' Circuit — ${pname}`,
        message: `Round-start recovery: +${delta} ⚔ (capped at 0).`,
        impacts: [impact(pid, `+${delta} ⚔`, { atk: delta })],
        sourcePlayerId: pid,
      });
    }
    next = clearRoundEndFlags(next);
    next = refreshBuildingRow(next, 0);
  }

  // Append a per-turn snapshot for offline balance analysis. Captures the
  // full game state at the moment the active player's turn ended (after
  // disable-recovery and the next player's resource collection have
  // applied), keyed by the OUTGOING player and round. Sized to be useful
  // without bloating the log — building/leader/intrigue refs are id-only.
  const turnEndedFor = state.activePlayerId;
  next = logEntry(next, {
    type: "turn_end",
    playerId: turnEndedFor,
    snapshot: snapshotPlayers(next),
  });

  next = { ...next, activePlayerId: nextPlayer.id };

  const winner = next.players.find((p) => calcVP(p) >= WIN_VP);
  if (winner) {
    next = { ...next, winnerId: winner.id };
    next = notify(next, {
      kind: NotifKind.INFO,
      title: `${winner.name} wins!`,
      message: `Reached ${calcVP(winner)} VP.`,
      sourcePlayerId: winner.id,
      severity: "alert",
    });
  }

  return next;
}
