// The turn loop (mechanical-spec §7) — round / phase progression, the
// Upkeep work (action reset, modifier expiry, foothold tick, scrap
// production) and Cleanup.
import { emit } from "./events.js";
import { recomputeStats } from "./stats.js";
import { activePlayerId } from "./targeting.js";

function expireModifiers(state, pid) {
  const own = new Set(
    Object.values(state.units).filter((u) => u.owner === pid).map((u) => u.uid),
  );
  state.modifiers = state.modifiers.filter(
    (m) => !(m.duration === "until_your_next_turn" && own.has(m.target)),
  );
}

// Foothold tick (§6.3.2): a controlled location's grip rises while the
// owner's unit garrisons it and falls when absent; at -1 a section
// decays to neutral. Capital locations are decay-immune.
function tickFootholds(state, pid) {
  for (const loc of Object.values(state.locations)) {
    if (loc.footholdOwner !== pid) continue;
    const hasCapital = loc.chips.some((u) => state.chips[u]?.chipId === "capital");
    if (hasCapital) continue;

    const unitHere = Object.values(state.units).some(
      (u) => u.owner === pid && u.node === loc.hexId,
    );
    if (unitHere) {
      loc.foothold = Math.min((loc.foothold ?? 0) + 1, loc.footholdCap);
    } else {
      loc.foothold = (loc.foothold ?? 0) - 1;
      if (loc.foothold < 0) {
        const idx = loc.sections.indexOf(pid);
        if (idx >= 0) loc.sections[idx] = "neutral";
        loc.foothold = 0;
        emit(state, "section_flipped", { hex: loc.hexId, cause: "decay" });
        if (!loc.sections.every((s) => s === pid)) loc.controller = null;
        if (!loc.sections.includes(pid)) {
          loc.footholdOwner = null;
          loc.foothold = null;
          emit(state, "location_decayed", { hex: loc.hexId });
        }
      }
    }
  }
}

// Fully-held locations yield their scrap production to the controller.
function collectProduction(state, pid) {
  let gained = 0;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller === pid) gained += loc.production;
  }
  if (gained > 0) {
    state.players[pid].resource += gained;
    emit(state, "resource_gained", {
      player: pid, resource: "Resource", amount: gained, source: "production",
    });
  }
  // NOTE: §6.3.1 says a held location also yields VP, but no per-location
  // VP value is defined yet — wired in once that number is set.
}

// Run a player's Upkeep and open their turn at the Main phase.
export function startTurn(state) {
  if (state.winnerId) return state;
  const pid = activePlayerId(state);
  state.phase = "Upkeep";
  emit(state, "turn_started", { player: pid });

  const p = state.players[pid];
  p.actions.remaining = p.actions.max;
  state.pendingActionGrants = state.pendingActionGrants.filter((g) => {
    if (g.player === pid) {
      p.actions.remaining += g.amount;
      return false;
    }
    return true;
  });

  expireModifiers(state, pid);
  recomputeStats(state);
  tickFootholds(state, pid);
  collectProduction(state, pid);

  // Preparation (the optional stat-buy step) is folded in once Layer 3
  // gives it something to do; for now the turn opens straight into Main.
  state.phase = "Main";
  return state;
}

// End the active player's turn, run Cleanup, advance to the next.
export function endTurn(state) {
  if (state.winnerId) return state;
  const pid = activePlayerId(state);
  state.phase = "Cleanup";
  state.modifiers = state.modifiers.filter((m) => m.duration !== "this_turn");
  emit(state, "turn_ended", { player: pid });

  state.activeIndex += 1;
  if (state.activeIndex >= state.turnOrder.length) {
    state.activeIndex = 0;
    state.round += 1;
    emit(state, "round_ended", { round: state.round - 1 });
  }
  return startTurn(state);
}
