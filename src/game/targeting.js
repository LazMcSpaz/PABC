// Targeting resolver (mechanical-spec §11) — maps a target token to a
// list of entity ids. v0.1 covers the player-scope tokens; unit/card
// tokens are passed through as explicit uids or resolved via `interact`.
//
// Engine tokens use snake_case (`active_player`); the content schema
// (docs/content-schema-v0.1.md §3) uses hyphenated forms (`active`,
// `triggering-player`). The alias table lets the same resolver accept
// both, so engine code and editor-authored content can share targeting
// without a translation step.
const TOKEN_ALIASES = {
  active: "active_player",
  "triggering-player": "triggering_player",
  "triggering-unit": "triggering_unit",
  "units-on-hex": "units_on_hex",
  each: "all_players",
  "chosen-by-active": "chosen_opponent",
};

export function activePlayerId(state) {
  return state.turnOrder[state.activeIndex];
}

export function resolveTargets(state, token, ctx = {}) {
  if (typeof token === "string" && TOKEN_ALIASES[token]) token = TOKEN_ALIASES[token];
  const active = activePlayerId(state);
  const owner = ctx.sourcePlayer || ctx.source?.owner || ctx.source?.controller || active;

  switch (token) {
    case undefined:
    case null:
    case "self":
      return [owner];
    case "active_player":
      // `ctx.asPlayer` names who this is being resolved ON BEHALF OF, and
      // takes precedence over whose turn it happens to be.
      //
      // Encounters are routinely delivered outside the recipient's turn —
      // the whole round-end pipeline runs with activeIndex already wrapped
      // to seat 0, and a queued encounter is answered whenever the player
      // gets to it. Without this, an authored `target: "active"` resolved
      // to the active SEAT rather than the recipient, so a card shown to
      // one faction wrote its flags, paid its rewards and levied its costs
      // against another. `SET_PLAYER_FLAG` is the single most-used effect in
      // authored content and `target: "active"` is its common value, so this
      // silently mis-delivered a large share of every consequence in the
      // game — including the gate flags later beats depend on, which is how
      // it was found.
      return [ctx.asPlayer ?? active];
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
    case "stationed_unit": {
      // A friendly unit standing on the source Location's hex (ability
      // effects that arm/boost the garrison's units — e.g. Rail Corridor).
      const hex = ctx.source?.hexId;
      if (!hex) return [];
      const mine = Object.values(state.units).filter((u) => u.owner === owner && u.node === hex);
      if (!mine.length) return [];
      if (ctx.interact) {
        const pick = ctx.interact({ kind: "chooseUnit", options: mine.map((u) => u.uid) });
        if (mine.some((u) => u.uid === pick)) return [pick];
      }
      return [mine[0].uid];
    }
    case "entity":
      return ctx.contest?.targetEntity ? [ctx.contest.targetEntity] : [];
    case "claimant":
      return ctx.claimant ? [ctx.claimant] : [];
    case "units_on_hex": {
      // Every unit the recipient has in this fight, not just the one that
      // walked in. `triggering-unit` costs one column; this costs the force
      // they committed — a failed storming should not spare the two units
      // standing beside the one that led it.
      //
      // Deliberately a SEPARATE token rather than a change to
      // `triggering-unit`: every authored unit-scoped effect today means one
      // unit and must keep meaning one unit. This is opted into.
      //
      // The place is the same one `encounter-hex` resolves (§ hex tokens):
      // the hex the beat fired on, else where the triggering unit stands.
      const recipient = ctx.asPlayer ?? ctx.sourcePlayer ?? active;
      const hex = ctx.sourceHex
        ?? state.units?.[ctx.sourceUnit]?.node
        ?? ctx.source?.hexId
        ?? null;
      if (hex) {
        const here = Object.values(state.units || {})
          .filter((u) => u.owner === recipient && u.node === hex && !u.seconded)
          .map((u) => u.uid);
        if (here.length) return here;
      }
      // No hex — a `conditional` or `auto` beat firing from the round-end
      // pulse, with nobody standing anywhere. Falls back to exactly what
      // `triggering-unit` falls back to, ONE unit, and records it the same
      // way. Resolving "all of them" with no place to anchor it would turn a
      // wounding effect into an army-wide one on a technicality, which is the
      // opposite of failing safe.
      return resolveTargets(state, "triggering_unit", ctx);
    }
    case "triggering_unit": {
      // The unit that caused this delivery — the one that stepped onto the
      // marked hex. Unit-scoped effects (ADJUST_BASE_STRENGTH, TAKE_UNIT,
      // SET_MOVEMENT, GRANT_CHIP) mean *this* unit, not "the player", and
      // there was previously no way to say so: all eleven authored
      // ADJUST_BASE_STRENGTH effects wrote `target: "active"`, which resolves
      // to a player id, and the handler's `state.units[pid]` lookup then
      // missed and skipped. Four of them were -99 (destroy the unit) and none
      // of them destroyed anything.
      //
      // `resolveMarkerOnHex` already puts the unit on the delivery context
      // (encounters.js:369) and the pending record carries it through
      // (:199), so nothing needed plumbing — only a name.
      const recipient = ctx.asPlayer ?? ctx.sourcePlayer ?? active;
      const src = state.units?.[ctx.sourceUnit];
      if (src && src.owner === recipient) return [src.uid];
      // A `conditional` or `auto` beat fires from the round-end pulse with
      // nobody standing anywhere, so there is genuinely no triggering unit.
      // Falling back to the recipient's strongest available unit matches what
      // `contestingStrength` (effects.js) already does for narrative
      // contests, so the two agree about who "your unit" is. Recorded on the
      // state either way — a mis-scoped token must be visible, not silent.
      const owned = Object.values(state.units || {})
        .filter((u) => u.owner === recipient && !u.seconded)
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
      state.__triggeringUnitFallbacks = state.__triggeringUnitFallbacks || [];
      state.__triggeringUnitFallbacks.push({
        round: state.round, player: recipient,
        substituted: owned[0]?.uid ?? null,
      });
      if (!state.__warnedTriggeringUnit) {
        state.__warnedTriggeringUnit = true;
        console.warn("[targeting] `triggering-unit` resolved with no unit on the "
          + "delivery context; falling back to the recipient's strongest unit. "
          + "See state.__triggeringUnitFallbacks.");
      }
      return owned.length ? [owned[0].uid] : [];
    }
    default:
      // an explicit player id / unit uid / hex id passed straight through
      return [token];
  }
}

// --- hex tokens ------------------------------------------------------
//
// The counterpart to the player tokens above, for effects and conditions
// that name a PLACE rather than a person. Authored content should not have
// to know the literal hex id of the tile an encounter happens to land on,
// so it writes a symbolic token and the engine resolves it against the
// delivery context.
//
// Kept deliberately small and additive: an unrecognised value falls through
// unchanged, so an explicit hex id (`"h4-0"`) always still works.
const HEX_TOKENS = {
  // The hex this encounter / beat fired on. Field encounters carry it as
  // ctx.sourceHex (encounters.js drawFieldEncounter / resolveMarkerOnHex);
  // ability and contest paths carry ctx.source.hexId; event-driven paths
  // carry it on the event payload.
  "encounter-hex": (state, ctx) =>
    ctx.sourceHex ?? ctx.source?.hexId ?? ctx.event?.payload?.hex ?? null,
  // Where the unit that triggered this is standing.
  "unit-hex": (state, ctx) =>
    state.units?.[ctx.sourceUnit]?.node ?? ctx.source?.node ?? null,
  // The acting player's capital.
  "capital-hex": (state, ctx) => {
    const pid = ctx.sourcePlayer ?? state.turnOrder?.[state.activeIndex];
    const cap = Object.values(state.locations || {}).find(
      (l) => l.controller === pid && (l.chips || []).some(
        (c) => state.chips?.[c]?.chipId === "capital"),
    );
    return cap?.hexId ?? null;
  },
};

export const HEX_TOKEN_NAMES = Object.keys(HEX_TOKENS);

/**
 * Resolve a hex-valued spec to a concrete hex id.
 * Accepts a symbolic token, a dot-path into state, or a literal hex id.
 * Returns null when a token cannot be resolved in the current context —
 * callers should treat that as "no hex" rather than substituting a default,
 * so a mis-scoped token fails visibly rather than landing somewhere wrong.
 */
export function resolveHex(state, spec, ctx = {}) {
  if (spec == null) return null;
  if (typeof spec !== "string") return spec;
  const tok = HEX_TOKENS[spec] || HEX_TOKENS[spec.replace(/_/g, "-")];
  if (tok) return tok(state, ctx);
  if (spec.includes(".")) {
    // dot-path — resolved by the caller's own path resolver if it has one;
    // here we walk it directly so hex specs work without importing dsl.js
    // (which imports this module).
    let cur = state;
    for (const p of spec.split(".")) {
      if (cur == null || typeof cur !== "object") return null;
      cur = cur[p];
    }
    return cur ?? null;
  }
  return spec;
}
