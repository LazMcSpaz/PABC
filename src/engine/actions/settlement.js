// src/engine/actions/settlement.js
// Player actions that modify their own settlement: build, demolish, repair,
// boost. The demolish-for-build resumer + AI heuristic are co-located here
// because they call back into build().

import { calcAttack, calcDefense } from "../calculations.js";
import { NotifKind, notify } from "../notifications.js";
import { pauseWithPrompt, registerAIHeuristic, registerResumer } from "../prompts.js";
import { logEntry, updatePlayer } from "../stateHelpers.js";
import { hasActiveBuilding, refreshBuildingRow } from "./_shared.js";

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

registerResumer("demolish_for_build_choice", (state, choice, ctx) => {
  return build(state, ctx.playerId, ctx.buildingUid, { demolishUid: choice });
});

registerAIHeuristic("demolish_for_build_choice", (state, prompt) => {
  const player = state.players.find((p) => p.id === prompt.playerId);
  if (!player) return prompt.options?.[0]?.value;
  const choices = (player.settlement ?? []).slice().sort(
    (a, b) => (a.vp ?? 0) - (b.vp ?? 0),
  );
  return choices[0]?.uid ?? prompt.options?.[0]?.value;
});

