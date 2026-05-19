// Targeting resolver (mechanical-spec §11) — maps a target token to a
// list of entity ids. v0.1 covers the player-scope tokens; unit/card
// tokens are passed through as explicit uids or resolved via `interact`.

export function activePlayerId(state) {
  return state.turnOrder[state.activeIndex];
}

export function resolveTargets(state, token, ctx = {}) {
  const active = activePlayerId(state);
  const owner = ctx.sourcePlayer || ctx.source?.owner || ctx.source?.controller || active;

  switch (token) {
    case undefined:
    case null:
    case "self":
      return [owner];
    case "active_player":
      return [active];
    case "triggering_player":
      return [ctx.event?.payload?.player ?? active];
    case "controller":
      return [owner];
    case "all_players":
      return [...state.turnOrder];
    case "each_opponent":
      return state.turnOrder.filter((p) => p !== owner);
    case "random_opponent": {
      const opps = state.turnOrder.filter((p) => p !== owner);
      if (!opps.length) return [];
      return [ctx.rng ? ctx.rng.pick(opps) : opps[0]];
    }
    case "chosen_opponent": {
      const opps = state.turnOrder.filter((p) => p !== owner);
      if (!opps.length) return [];
      return [ctx.interact ? ctx.interact({ kind: "chooseOpponent", options: opps }) : opps[0]];
    }
    case "defending_unit":
      return ctx.contest?.defendingUnit ? [ctx.contest.defendingUnit] : [];
    case "entity":
      return ctx.contest?.targetEntity ? [ctx.contest.targetEntity] : [];
    default:
      // an explicit player id / unit uid / hex id passed straight through
      return [token];
  }
}
