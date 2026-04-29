// Event card effects apply to all players simultaneously when the card is
// drawn. Each effect is (state, drawerId) => ({ state, persist }):
//   - state: new state after the effect
//   - persist: true if the Event stays in explorationInPlay awaiting
//     resolution (e.g. Minefield blocks exploration until resolved)
//
// Every effect calls notify() with a per-player impacts array so the UI
// can show the player exactly what happened and why.
//
// Not automated in this pass (require bespoke UI flows):
//   drifter_intelligence (peek top 2 + reorder)
//   marauder_territory_war (free draw per player)
//   drifter_market (optional intrigue purchase per player)
//   corporate_relic (turn-order auction)
// These pass through the default "persist and leave for manual" path.

import { calcAttack, calcDefense } from "./calculations.js";
import { pausePeekReorder } from "./deckPeek.js";
import { fireEventImmunity } from "./intrigue.js";
import { NotifKind, impact, notify } from "./notifications.js";

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function hasBuilding(player, buildingId) {
  return player.settlement.some((b) => b.id === buildingId);
}

function hasLeader(player, leaderId) {
  return player.leader?.id === leaderId;
}

function logEntry(state, entry) {
  return { ...state, log: [...(state.log ?? []), { round: state.round, ...entry }] };
}

// Apply a per-player transformation across all players, collecting an impacts
// array describing what happened to each. Players whose id is in `immune` are
// skipped and credited with a neutral "immune (Borrowed Time)" impact. Pure.
function applyPerPlayer(state, fn, immune) {
  const impacts = [];
  const newPlayers = state.players.map((p) => {
    if (immune?.has(p.id)) {
      impacts.push(impact(p.id, "immune (Borrowed Time)"));
      return p;
    }
    const res = fn(p);
    if (res.impact) impacts.push(res.impact);
    return res.player ?? p;
  });
  return { state: { ...state, players: newPlayers }, impacts };
}

export const EVENT_EFFECTS = {
  harvest: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => ({
      player: { ...p, scrap: p.scrap + 6 },
      impact: impact(p.id, `+6 Scrap`, { scrap: 6 }),
    }), ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "harvest" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Harvest",
      message: "All players gain +6 Scrap.",
      impacts: r.impacts,
      sourceCardId: "harvest",
      severity: "info",
    });
    return { state: next, persist: false };
  },

  scrap_rush: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      const bonus = hasBuilding(p, "scavengers_hut") ? 2 : 0;
      const total = 4 + bonus;
      return {
        player: { ...p, scrap: p.scrap + total },
        impact: impact(
          p.id,
          bonus > 0 ? `+${total} Scrap (Scavenger's Hut bonus)` : `+${total} Scrap`,
          { scrap: total },
        ),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "scrap_rush" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Scrap Rush",
      message: "All players gain +4 Scrap; Scavenger's Hut owners gain +6.",
      impacts: r.impacts,
      sourceCardId: "scrap_rush",
    });
    return { state: next, persist: false };
  },

  marauder_ambush: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      if (calcAttack(p) >= 3) {
        return { player: p, impact: impact(p.id, "ATK ≥ 3 — unaffected") };
      }
      const loss = Math.min(p.scrap, 5);
      return {
        player: { ...p, scrap: p.scrap - loss },
        impact: impact(p.id, `−${loss} Scrap (failed ATK check)`, { scrap: -loss }),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "marauder_ambush" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Marauder Ambush",
      message: "Players below 3 ⚔ lose 5 Scrap (min 0). Surprise — no boosting.",
      impacts: r.impacts,
      sourceCardId: "marauder_ambush",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  mountain_cult_extortion: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      if (p.scrap >= 3) {
        return {
          player: { ...p, scrap: p.scrap - 3 },
          impact: impact(p.id, "paid 3 Scrap", { scrap: -3 }),
        };
      }
      return {
        player: { ...p, bonusAtk: (p.bonusAtk ?? 0) - 5 },
        impact: impact(p.id, "could not pay — lost 5 permanent ⚔", { atk: -5 }),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "mountain_cult_extortion" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Mountain Cult Extortion",
      message: "Each player pays 3 Scrap or loses 5 permanent Attack.",
      impacts: r.impacts,
      sourceCardId: "mountain_cult_extortion",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  disease_scare: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      if (hasLeader(p, "doc_brawlins") || hasBuilding(p, "medic_tent")) {
        return { player: p, impact: impact(p.id, "immune (Doc Brawlins / Medic Tent)") };
      }
      return {
        player: {
          ...p,
          temporaryDebuffs: [
            ...(p.temporaryDebuffs ?? []),
            { stat: "atk", amount: -2, expiresOn: "owner_turn_end" },
          ],
        },
        impact: impact(p.id, "−2 ⚔ until next turn", { atk: -2 }),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "disease_scare" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Disease Scare",
      message: "−2 Attack until your next turn. Doc Brawlins / Medic Tent owners exempt.",
      impacts: r.impacts,
      sourceCardId: "disease_scare",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  ash_storm: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      if (hasBuilding(p, "greenhouse")) {
        return { player: p, impact: impact(p.id, "immune (Greenhouse)") };
      }
      return {
        player: { ...p, skipExploreNextTurn: true },
        impact: impact(p.id, "skipping exploration next turn"),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "ash_storm" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Ash Storm",
      message: "All players skip their Exploration Action next turn. Greenhouse owners exempt.",
      impacts: r.impacts,
      sourceCardId: "ash_storm",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  mountain_cult_sermon: (state, _drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      if (p.flags?.completedMountainCult) {
        return { player: p, impact: impact(p.id, "immune (Mountain Cult completion)") };
      }
      return {
        player: { ...p, loseActionsNextTurn: (p.loseActionsNextTurn ?? 0) + 1 },
        impact: impact(p.id, "−1 Action next turn", { actions: -1 }),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "mountain_cult_sermon" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Mountain Cult Sermon",
      message: "−1 Action on your next turn.",
      impacts: r.impacts,
      sourceCardId: "mountain_cult_sermon",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  nova9_broadcast: (state, drawerId, ctx = {}) => {
    const r = applyPerPlayer(state, (p) => {
      const amount = p.id === drawerId ? 2 : 1;
      return {
        player: { ...p, bonusActionsNextTurn: (p.bonusActionsNextTurn ?? 0) + amount },
        impact: impact(p.id, `+${amount} Action${amount > 1 ? "s" : ""} next turn`, { actions: amount }),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "nova9_broadcast", drawerId });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Nova9 Broadcast",
      message: "All players +1 Action next turn; drawing player +2.",
      impacts: r.impacts,
      sourceCardId: "nova9_broadcast",
      sourcePlayerId: drawerId,
    });
    return { state: next, persist: false };
  },

  solar_flare: (state, _drawerId, ctx = {}) => {
    const targetIds = new Set(["antenna_array", "drone_lab", "signal_jammers"]);
    const r = applyPerPlayer(state, (p) => {
      const toDisable = p.settlement.filter((b) => targetIds.has(b.id)).map((b) => b.uid);
      if (toDisable.length === 0) {
        return { player: p, impact: impact(p.id, "no affected buildings") };
      }
      return {
        player: {
          ...p,
          disabledBuildingUids: [
            ...new Set([...(p.disabledBuildingUids ?? []), ...toDisable]),
          ],
          buildingsDisabledUntilOwnerTurnEnd: [
            ...new Set([...(p.buildingsDisabledUntilOwnerTurnEnd ?? []), ...toDisable]),
          ],
        },
        impact: impact(p.id, `disabled ${toDisable.length} building(s) until next turn`),
      };
    }, ctx.immuneIds);
    let next = logEntry(r.state, { type: "event", cardId: "solar_flare" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Solar Flare",
      message: "Antenna Array, Drone Lab, and Signal Jammers disabled until each owner's next turn.",
      impacts: r.impacts,
      sourceCardId: "solar_flare",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  vanguard_remnant_patrol: (state, _drawerId, ctx = {}) => {
    let next = {
      ...state,
      globalFlags: { ...state.globalFlags, raidsBlocked: true },
    };
    const r = applyPerPlayer(next, (p) => {
      if (hasLeader(p, "lt_tusk")) {
        return {
          player: { ...p, scrap: p.scrap + 2 },
          impact: impact(p.id, "+2 Scrap (Lt. Tusk)", { scrap: 2 }),
        };
      }
      return { player: p, impact: impact(p.id, "no raids this round") };
    }, ctx.immuneIds);
    next = logEntry(r.state, { type: "event", cardId: "vanguard_remnant_patrol" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Vanguard Remnant Patrol",
      message: "Raids are blocked for the rest of this round. Lt. Tusk owners +2 Scrap.",
      impacts: r.impacts,
      sourceCardId: "vanguard_remnant_patrol",
      severity: "warning",
    });
    return { state: next, persist: false };
  },

  drifter_intelligence: (state, drawerId) => {
    let next = logEntry(state, { type: "event", cardId: "drifter_intelligence" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Drifter Intelligence",
      message: "Top 2 Exploration cards revealed — return them in any order.",
      sourceCardId: "drifter_intelligence",
      sourcePlayerId: drawerId,
    });
    const after = pausePeekReorder(next, {
      playerId: drawerId,
      deckType: "exploration",
      peekCount: 2,
      mayDiscard: false,
      message: "Drifter Intelligence: reorder the top 2 Exploration cards.",
    });
    return { state: after, persist: false };
  },

  minefield: (state) => {
    let next = { ...state, globalFlags: { ...state.globalFlags, explorationBlocked: true } };
    next = logEntry(next, { type: "event", cardId: "minefield", note: "exploration blocked" });
    next = notify(next, {
      kind: NotifKind.EVENT,
      title: "Minefield",
      message:
        "Exploration is blocked until any player resolves this card (needs 4 ⚔). Surprise — no boosting.",
      sourceCardId: "minefield",
      severity: "alert",
    });
    return { state: next, persist: true };
  },
};

export function applyEvent(state, card, drawerId) {
  // Immediate reactive: any player holding Borrowed Time can consume it to
  // grant themselves immunity to this Event. Fire that first so per-player
  // effects can skip the immune set.
  const { state: afterImmunity, immuneIds } = fireEventImmunity(state, card);

  const fn = EVENT_EFFECTS[card.id];
  if (!fn) {
    // No automation — leave the card in play for manual resolution.
    return {
      state: notify(afterImmunity, {
        kind: NotifKind.EVENT,
        title: card.name,
        message: `${card.name} drawn — manual resolution required (not yet automated).`,
        sourceCardId: card.id,
        severity: "info",
      }),
      persist: true,
    };
  }
  return fn(afterImmunity, drawerId, { immuneIds });
}

export function clearRoundEndFlags(state) {
  if (!state.globalFlags?.raidsBlocked) return state;
  const next = notify(state, {
    kind: NotifKind.FLAG,
    title: "Raids unblocked",
    message: "Vanguard Remnant Patrol has expired — raids allowed again.",
  });
  return { ...next, globalFlags: { ...next.globalFlags, raidsBlocked: false } };
}

export function resolvePersistentEvent(state, playerId, card) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.actionsRemaining < 1) return state;
  if (calcAttack(player) < (card.reqAtk ?? 0)) return state;
  if (calcDefense(player) < (card.reqDef ?? 0)) return state;
  if (player.scrap < (card.scrapCost ?? 0)) return state;

  let next = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            actionsRemaining: p.actionsRemaining - 1,
            scrap: p.scrap - (card.scrapCost ?? 0),
            earnedVP: (p.earnedVP ?? 0) + (card.vp ?? 0),
          }
        : p,
    ),
  };

  if (card.id === "minefield") {
    next = { ...next, globalFlags: { ...next.globalFlags, explorationBlocked: false } };
  }
  next = {
    ...next,
    explorationInPlay: next.explorationInPlay.filter((e) => e.card.uid !== card.uid),
  };
  next = logEntry(next, { type: "resolve_event", playerId, cardId: card.id });
  next = notify(next, {
    kind: NotifKind.EVENT,
    title: `${card.name} resolved`,
    message:
      card.id === "minefield"
        ? "Exploration unblocked."
        : `${card.name} cleared.`,
    impacts: [
      impact(
        playerId,
        `+${card.vp ?? 0} VP${card.scrapCost ? ` · −${card.scrapCost} Scrap` : ""}`,
        { vp: card.vp, scrap: -(card.scrapCost ?? 0) },
      ),
    ],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
  return next;
}
