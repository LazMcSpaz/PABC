// src/engine/actions/turn.js
// endTurn applies turn-end bookkeeping for the OUTGOING player (clear
// flags, re-enable until-owner-turn-end disables, draw replenishment),
// then turn-start bookkeeping for the INCOMING player (action refresh,
// passive scrap accrual, persistent event resolution). It also applies
// round-rollover side effects (drift events drawn, building row top-up)
// and detects a winner.

import {
  calcActions,
  calcAttack,
  calcDefense,
  calcPassiveScrap,
  calcVP,
} from "../calculations.js";
import { applyEvent, clearRoundEndFlags } from "../events.js";
import { NotifKind, notify } from "../notifications.js";
import { logEntry, updatePlayer } from "../stateHelpers.js";
import { refreshBuildingRow } from "./_shared.js";

const WIN_VP = 30;

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
