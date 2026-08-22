// The turn loop (mechanical-spec §7) — round / phase progression, the
// Upkeep work (action reset, modifier expiry, Loyalty tick, scrap
// production) and Cleanup.
import { emit } from "./events.js";
import { recomputeStats, recomputeResearch, effectiveVeteran } from "./stats.js";
import { recomputeInfluence } from "./influence.js";
import { recomputeVisibility } from "./visibility.js";
import { reinforcementRoute } from "./board.js";
import { CONFIG } from "./config.js";
import { activePlayerId } from "./targeting.js";
import { sweepDeferred } from "./deferred.js";
import { evaluateTriggers } from "./triggers.js";
import { evaluateConditionalBeats, offerQuests } from "./quests.js";
import {
  applyOutputAndBuilds, chargeChipUpkeep, chargeUnitUpkeep, enforceLoyaltySlotCap,
} from "./economy.js";
import {
  runDiplomacyRound, vassalsOf, arePacted, adjustMenace, sweepTrespass,
  checkDominion, dominionStanding,
} from "./diplomacy.js";
import { holdsLocation } from "./control.js";
import { adjustStanding } from "./standing.js";
import { pressureSource } from "./influence.js";
import { hasTechNode } from "./tech.js";
import { chargePostUpkeep } from "./posts.js";
import { chargeBlockadeUpkeep } from "./blockades.js";
import { bankVp, recomputeVp, registerAllyReader } from "./victory.js";
import { CHIPS, LOCATIONS, ABILITIES, factionDef } from "./content.js";

// Sum a numeric chip field across a Location's installed, non-dormant
// chips — the shared reader for the per-Location behavior chips
// (loyaltyRise, healBonus, actionBonus, …).
// How many actions a Location refreshes to at Upkeep — one, plus whatever a
// Logistics Hub adds. Exported because the HUD has to draw the same number:
// the action readout used to assume one per city, so a hub city could put the
// dial at "8/7" and its pip row a pip short of what it actually holds.
export function locationActionCapacity(state, loc) {
  return 1 + locChipSum(state, loc, "actionBonus");
}

function locChipSum(state, loc, field) {
  let n = 0;
  for (const c of loc.chips) {
    if (state.chips[c]?.disabled) continue;
    n += CHIPS[state.chips[c]?.chipId]?.[field] || 0;
  }
  return n;
}

function expireModifiers(state, pid) {
  const own = new Set(
    Object.values(state.units).filter((u) => u.owner === pid).map((u) => u.uid),
  );
  state.modifiers = state.modifiers.filter(
    (m) => !(m.duration === "until_your_next_turn" && own.has(m.target)),
  );
}

// Loyalty tick (§18.2 — supersedes the old foothold/decay step). Loyalty
// is the 0–8 centre pie, ceiling fixed at 8. It climbs to the ceiling
// while the owner garrisons a fully-held Location and bleeds to 0 when the
// Location is neglected. The crucial rule: Control is NOT lost to ticking.
// Only once Loyalty sits at 0 *and* the Location stays neglected does one
// Control section peel to neutral per Upkeep, until the Location is fully
// neutral. A `loyalty_failing` warning always fires before any peel.
// Bringing a unit back halts the peel and lets Loyalty climb again.
// Capital Locations are inert — their Loyalty is locked at full.
// Exported so the headless harness can drive Upkeep ticks directly.
export function tickLoyalty(state, pid) {
  const cfg = CONFIG.loyalty;
  let lostControl = false;
  for (const loc of Object.values(state.locations)) {
    if (loc.loyaltyOwner !== pid) continue;
    const hasCapital = loc.chips.some((u) => state.chips[u]?.chipId === "capital");
    if (hasCapital) continue; // §18.2 — inert, locked at full

    const garrisoned = Object.values(state.units).some(
      (u) => u.owner === pid && u.node === loc.hexId,
    );

    // Influence pressure (§18.3 / docs/vp-and-actions-design.md §1): a
    // rival whose ZoC DOMINATES this Location's own hex hollows it out —
    // Loyalty bleeds each Upkeep, garrison or not. The pressure is felt as
    // soft hostility: the presser loses Standing with the owner and gains
    // Menace every Upkeep it squeezes. Allies (pact or vassalage either
    // way) never pressure each other.
    const pcfg = CONFIG.influence.pressure;
    // Read the Influence FIELD, not the ZoC map: a held Location anchors
    // its own hex in that map, but a rival out-projecting it there is
    // still squeezing — the soft-power siege must survive the anchor.
    const presser = pressureSource(state, loc, pid);
    const pressured = !!(pcfg && presser && presser !== pid &&
      state.players[presser] && !arePacted(state, pid, presser) &&
      !vassalsOf(state, pid).includes(presser) && !vassalsOf(state, presser).includes(pid));
    const bleed = pressured ? pcfg.bleed : 0;
    if (pressured) {
      adjustStanding(state, pid, presser, -pcfg.standingHit, "influence-pressure");
      adjustMenace(state, presser, pcfg.menaceHit, "influence-pressure");
      emit(state, "influence_pressure", { hex: loc.hexId, owner: pid, presser, bleed });
    }

    if (garrisoned) {
      // Integrating — Loyalty rises to the fixed ceiling (a returning unit
      // also halts any in-progress peel simply by not reaching the peel
      // path); Civic Hall accelerates the climb; enemy influence pressure
      // drags against both — a plain garrison under pressure stalls flat.
      const delta = cfg.risePerUpkeep + locChipSum(state, loc, "loyaltyRise") - bleed;
      if (delta !== 0 && (delta < 0 || (loc.loyalty ?? 0) < cfg.ceiling)) {
        loc.loyalty = Math.max(0, Math.min((loc.loyalty ?? 0) + delta, cfg.ceiling));
        emit(state, "loyalty_changed", { hex: loc.hexId, owner: pid, loyalty: loc.loyalty });
      }
      continue;
    }

    // A Civic Hall chip holds Loyalty where it stands while neglected — no
    // passive bleed — but FOREIGN pressure still tells: the chip cancels
    // neglect, not a rival's dominance.
    if (loc.chips.some((c) => !state.chips[c]?.disabled && CHIPS[state.chips[c]?.chipId]?.noLoyaltyDecay)) {
      if (bleed > 0 && (loc.loyalty ?? 0) > 0) {
        loc.loyalty = Math.max((loc.loyalty ?? 0) - bleed, 0);
        emit(state, "loyalty_changed", { hex: loc.hexId, owner: pid, loyalty: loc.loyalty });
      }
      continue;
    }

    // Neglected and still loyal — bleed toward 0 (plus any pressure),
    // never peeling Control yet.
    if ((loc.loyalty ?? 0) > 0) {
      loc.loyalty = Math.max((loc.loyalty ?? 0) - cfg.decayPerUpkeep - bleed, 0);
      emit(state, "loyalty_changed", { hex: loc.hexId, owner: pid, loyalty: loc.loyalty });
      // Surface danger BEFORE any Control peels (§18.2 UI warning) — the
      // alert lands at least one Upkeep before the first section is lost.
      if (loc.loyalty <= cfg.dangerThreshold) {
        emit(state, "loyalty_failing", {
          hex: loc.hexId, owner: pid, loyalty: loc.loyalty, imminent: loc.loyalty === 0,
        });
      }
      continue;
    }

    // Loyalty already sits at 0 and the Location is still neglected — peel
    // Control toward neutral (§18.2). Warn first, then peel.
    emit(state, "loyalty_failing", { hex: loc.hexId, owner: pid, loyalty: 0, imminent: true, peeling: true });
    for (let n = 0; n < cfg.peelPerUpkeep; n++) {
      const idx = loc.sections.indexOf(pid);
      if (idx < 0) break;
      loc.sections[idx] = "neutral";
      emit(state, "control_peeled", { hex: loc.hexId, from: pid });
      emit(state, "section_flipped", { hex: loc.hexId, cause: "loyalty" });
      if (loc.controller === pid && !loc.sections.every((s) => s === pid)) {
        loc.controller = null; // dropped below full Control
        lostControl = true;
      }
      if (!loc.sections.includes(pid)) {
        // Fully neutral — Loyalty deactivates for this Location.
        loc.loyaltyOwner = null;
        loc.loyalty = null;
        emit(state, "location_decayed", { hex: loc.hexId });
        break;
      }
    }
  }
  // A peel-driven control loss may have stripped a Lab from `pid` — sync.
  if (lostControl) recomputeResearch(state);
  // §18.3 — Loyalty rises/decays and any peel shift this faction's
  // Influence; recompute the field + ZoC once after the tick.
  recomputeInfluence(state);
  // §19 — Location sight scales with Loyalty and a peel can drop a source,
  // so refresh this faction's fog after the tick (and the ZoC it draws on).
  recomputeVisibility(state, pid, { emitEvents: false });
}

// The repeatable VP faucet, awarded at the player's Upkeep.
//
// DOMINION IS GONE. VP is held, not ticked (victory.js): a city you hold is
// already worth its value every moment you hold it, so paying again each
// Upkeep counted the same ground twice and made an early land-grab impossible
// to catch up with. What remains is the one faucet that was never about
// territory.
function awardVp(state, pid, amount, source) {
  if (amount <= 0) return;
  bankVp(state, pid, amount, source);
}

// The alliance trickle used to live here: +1 VP per allied major every round,
// forever, once you were pacted with a majority of them. It was 77% of all
// banked VP across 20 games and enough on its own to win while holding no
// ground at all. Alliances and vassals are worth a HELD score now (victory.js
// `diplomacyVp`), which every recompute picks up.
function tickVictoryFaucets() {}

// Elimination (docs/vp-and-actions-design.md §1): a faction with no
// Locations and no units is out — flagged and skipped by the turn loop.
//
// Being last standing is no longer its own win condition: it is the pure-
// conquest face of the one condition (checkDominion), which every surviving
// faction being dead satisfies vacuously.
function sweepEliminations(state) {
  for (const pid of state.turnOrder) {
    const p = state.players[pid];
    if (!p || p.eliminated) continue;
    const holdsAnything =
      Object.values(state.locations).some((l) => l.controller === pid) ||
      Object.values(state.units).some((u) => u.owner === pid);
    if (!holdsAnything) {
      p.eliminated = true;
      emit(state, "faction_eliminated", { player: pid });
    }
  }
  checkDominion(state);
}

// v0.2 §16.2 — refresh each owned unit's move budget from its effective
// Movement, and roll the §16.6 fortify flag (a unit that didn't move on
// its previous turn is "dug in"). Must run after recomputeStats so
// `unit.movement` reflects chips / modifiers.
function refreshMoveBudget(state, pid) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    u.moveRemaining = u.movement;
    // SET_MOVEMENT is an absolute override, not a modifier: the unit's
    // movement BECOMES the authored value for the turn it applies to.
    const ov = (state.movementOverrides || []).find(
      (o) => o.player === pid && !o.consumed && o.appliesOnRound <= state.round);
    if (ov) u.moveRemaining = Math.max(0, ov.value);
    // No road start-bonus any more: the network pays out per hex travelled
    // (CONFIG.movement.pavedCost), not as a lump for happening to be parked on
    // it at Upkeep. See config.js.

    u.fortified = !u.movedSinceUpkeep;
    u.movedSinceUpkeep = false;
    // Where this unit's turn began, and whether an unseen blocker has since
    // checked its advance. Both drive the retreat/lateral rule in unitReach.
    u.turnStartNode = u.node;
    u.checked = false;
  }
}

// v0.2 §16.5 — at Upkeep, each unit on a Location its owner fully holds
// mends +1 base Strength, up to its cap. The supply-line "fall back to
// re-secure and heal" half of the loop.
function passiveHeal(state, pid) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    const loc = state.locations[u.node];
    const onHeldLoc = !!loc && loc.controller === pid;
    // Field Medics (chip `healAnywhere`): the unit mends in the field, held
    // Location or not — at the chip's own rate (no tech/infirmary stacking).
    let fieldMedics = 0;
    for (const c of u.chips) {
      if (state.chips[c]?.disabled) continue;
      fieldMedics += CHIPS[state.chips[c]?.chipId]?.healAnywhere || 0;
    }
    // The Springs (ability passive HEAL_HERE): the oasis mends WHOEVER
    // stands on it — any owner, held or not.
    let springs = 0;
    if (loc?.abilityId) {
      for (const pv of ABILITIES[loc.abilityId]?.passives || []) {
        if (pv.type === "HEAL_HERE") springs += pv.amount || 0;
      }
    }
    if (!onHeldLoc && fieldMedics <= 0 && springs <= 0) continue;
    const cap = effectiveVeteran(state, u) ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
    if (u.baseStrength >= cap) continue;
    const before = u.baseStrength;
    // §17.5 Logistics B1 (Field Hospital): +1 more heal/Upkeep — ADDS to the
    // §16.5 base, so a holder mends 2/Upkeep on held Locations. An Infirmary
    // chip on this Location (healBonus) adds on top of both.
    const healAmt = (onHeldLoc
      ? CONFIG.heal.passivePerTurn + (hasTechNode(state, pid, "log-b1") ? 1 : 0) +
        locChipSum(state, loc, "healBonus") + fieldMedics
      : fieldMedics) + springs;
    u.baseStrength = Math.min(cap, u.baseStrength + healAmt);
    recomputeStats(state);
    emit(state, "unit_reinforced", { unit: u.uid, amount: u.baseStrength - before });
  }
}

// Run a player's Upkeep and open their turn at the Main phase.
export function startTurn(state) {
  if (state.winnerId) return state;
  const pid = activePlayerId(state);
  sweepEliminations(state);
  if (state.winnerId) return state;
  // An eliminated faction's turn is skipped entirely (endTurn advances and
  // re-enters startTurn for the next seat; recursion is bounded by the
  // seat count and the last-standing check above).
  if (state.players[pid]?.eliminated) return endTurn(state);
  state.phase = "Upkeep";
  emit(state, "turn_started", { player: pid });

  // Trespass presence sweep — units still parked in foreign ZoC keep the
  // citation streak alive (warning → −1 → −2), even without moving.
  sweepTrespass(state, pid);

  // Offer any quest whose opening beat is available to THIS player. Runs
  // here, inside their own turn, so an opener gate reading `active` means
  // the player being offered it (see quests.js offerQuests).
  offerQuests(state);

  const p = state.players[pid];
  p.actions.remaining = p.actions.max; // wildcard pool (base 0)
  // Per-entity actions: every owned unit and held Location refreshes to 1.
  // Logistics Hub (chip `actionBonus`) makes its own Location act twice.
  for (const u of Object.values(state.units)) {
    if (u.owner === pid) u.actionsRemaining = 1;
  }
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    loc.actionsRemaining = locationActionCapacity(state, loc);
  }
  state.pendingActionGrants = state.pendingActionGrants.filter((g) => {
    if (g.player === pid) {
      p.actions.remaining += g.amount;
      return false;
    }
    return true;
  });

  // Blacksite suppression expires once the suppressor's window has passed
  // (suppressedUntil is a turn ordinal; see DISABLE_CHIP).
  {
    const ordinal = state.round * state.turnOrder.length + state.activeIndex;
    let lifted = false;
    for (const inst of Object.values(state.chips)) {
      if (inst.suppressedUntil != null && ordinal > inst.suppressedUntil) {
        delete inst.suppressedUntil;
        if (inst.disabled) {
          inst.disabled = false;
          lifted = true;
          emit(state, "chip_reactivated", { chip: inst.uid, chipId: inst.chipId });
        }
      }
    }
    if (lifted) { recomputeStats(state); recomputeResearch(state); recomputeInfluence(state); }
  }

  expireModifiers(state, pid);
  // Waystation (chip `turnStartMovement`): a friendly unit opening its turn
  // on the chip's Location gets +1 Movement for this turn only — expressed
  // as an until_your_next_turn modifier so the existing stat/expiry
  // machinery does all the bookkeeping (expireModifiers above just cleared
  // last turn's grants).
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    const loc = state.locations[u.node];
    if (!loc || loc.controller !== pid) continue;
    const bonus = locChipSum(state, loc, "turnStartMovement");
    if (bonus > 0) {
      state.modifiers.push({
        target: u.uid, stat: "Movement", amount: bonus, duration: "until_your_next_turn",
      });
    }
  }
  recomputeStats(state);
  refreshMoveBudget(state, pid);
  tickLoyalty(state, pid);
  // Repeatable VP faucets — after the Loyalty tick so integration counts
  // the turn it lands (docs/vp-and-actions-design.md §1).
  tickVictoryFaucets(state, pid);
  // §20.8 — a Loyalty drop below the bonus-slot rung ejects the chip in that
  // extra slot (newest-first). Runs right after the Loyalty tick, before the
  // economy step reads slot capacity.
  enforceLoyaltySlotCap(state, pid);
  passiveHeal(state, pid);
  // §20.3 — Output + guns/butter slider REPLACES the old flat collectProduction:
  // each held Location banks its butter half as scrap and advances its build.
  applyOutputAndBuilds(state, pid);
  // §20.9 — charge per-chip upkeep from banked scrap; the unpaid go dormant.
  chargeChipUpkeep(state, pid);
  // §17.7 — charge per-listening-post upkeep alongside chip upkeep; an unpaid
  // post goes dormant (no Vision) until repaid. Refresh fog so a post that
  // just went dormant stops contributing sight this turn.
  chargePostUpkeep(state, pid);
  // Rail doc §3.1 — a finished blockade is manned, so it costs scrap; unpaid
  // it goes dormant and the road opens back up through it.
  chargeBlockadeUpkeep(state, pid);
  // Standing armies eat. Charged LAST of the four, so structures a player has
  // already sunk scrap into keep running and it is the army that goes hungry
  // first. Must follow the action reset and refreshMoveBudget above — an
  // unsupplied unit is stranded by having those zeroed back out.
  chargeUnitUpkeep(state, pid);
  // Refresh fog last: a post that just went dormant stops contributing sight
  // this turn, and a blockade that completed during the economy step (rail doc
  // §3.4 funds construction out of Output) starts.
  recomputeVisibility(state, pid, { emitEvents: false });
  // VP is held, not banked — Loyalty ticked and Control may have peeled, and a
  // city sliding under half its Loyalty is worth half as much from now on.
  recomputeVp(state);

  // Preparation (the optional stat-buy step) is folded in once Layer 3
  // gives it something to do; for now the turn opens straight into Main.
  state.phase = "Main";
  return state;
}

// End the active player's turn, run Cleanup, advance to the next. On
// round rollover, runs the §15.12 end-of-round pipeline before the
// next player's Upkeep starts.
export function endTurn(state) {
  if (state.winnerId) return state;
  const pid = activePlayerId(state);
  state.phase = "Cleanup";
  state.modifiers = state.modifiers.filter((m) => m.duration !== "this_turn");
  // A movement override covers exactly the turn it landed on.
  for (const o of state.movementOverrides || []) {
    if (o.player === pid && !o.consumed && o.appliesOnRound <= state.round) o.consumed = true;
  }
  if (state.movementOverrides?.length) {
    state.movementOverrides = state.movementOverrides.filter((o) => !o.consumed);
  }
  emit(state, "turn_ended", { player: pid });

  state.activeIndex += 1;
  if (state.activeIndex >= state.turnOrder.length) {
    state.activeIndex = 0;
    state.round += 1;
    emit(state, "round_ended", { round: state.round - 1 });
    runRoundEnd(state);
  }
  return startTurn(state);
}

// The §15.12 round-end pipeline. Deferred resolution comes first so a
// queued consequence can update the state that triggers then read.
function runRoundEnd(state) {
  sweepDeferred(state);
  sweepPlayerFlags(state);
  sweepSecondments(state);
  sweepReinforcements(state);
  evaluateTriggers(state);
  evaluateConditionalBeats(state);
  expirePlacementMarkers(state);
  decayWorldCounters(state);
  // §18.8/§18.12 — the diplomacy round cadence: Menace decay, Standing
  // drift, flows, AI-to-AI politics, vassal tick, coalitions, then the
  // Recognition win check (sets winnerId if a peaceful victory has landed).
  runDiplomacyRound(state);
}

// Player flags with a finite lifetime lapse here. SET_PLAYER_FLAG stored a
// `duration` from the beginning but nothing ever expired it, so every
// "for a while" arrangement in authored content was silently permanent —
// one escort job granting safe passage for the rest of the game. Flags
// without an expiry round are untouched: the moral ledger is meant to be
// permanent, and count_flags reads it.
function sweepPlayerFlags(state) {
  for (const p of Object.values(state.players || {})) {
    if (!p.flags) continue;
    for (const [name, rec] of Object.entries(p.flags)) {
      if (!rec || rec.expiresAtRound == null) continue;
      if (state.round < rec.expiresAtRound) continue;
      delete p.flags[name];
      emit(state, "player_flag_expired", { player: p.id, flag: name });
      // Safe passage written against this flag lapses with it.
      for (const [fid, grant] of Object.entries(p.safePassage || {})) {
        if (grant?.whileFlag === name) {
          delete p.safePassage[fid];
          emit(state, "safe_passage_expired", { player: p.id, faction: fid, reason: "flag_expired" });
        }
      }
    }
  }
  // Round-bounded passage grants expire on their own clock too.
  for (const p of Object.values(state.players || {})) {
    for (const [fid, grant] of Object.entries(p.safePassage || {})) {
      if (grant?.until != null && state.round >= grant.until) {
        delete p.safePassage[fid];
        emit(state, "safe_passage_expired", { player: p.id, faction: fid, reason: "elapsed" });
      }
    }
  }
}

// Units lent out by TAKE_UNIT come home. They return to the hex they left
// from if it is still theirs to stand on, at the agreed strength cost, and
// set whatever flag the arrangement promised.
function sweepSecondments(state) {
  if (!state.secondedUnits?.length) return;
  const keep = [];
  for (const s of state.secondedUnits) {
    if (state.round < s.returnRound) { keep.push(s); continue; }
    const u = s.record;
    u.baseStrength = Math.max(0, (u.baseStrength ?? 0) + (s.strengthDelta ?? 0));
    if (u.baseStrength <= 0) {
      emit(state, "unit_returned", { unit: u.uid, player: s.owner, destroyed: true });
      continue; // came back in no state to serve
    }
    u.node = s.node;
    state.units[u.uid] = u;
    if (s.returnFlag && state.players[s.owner]) {
      const p = state.players[s.owner];
      p.flags = p.flags || {};
      p.flags[s.returnFlag] = { value: true, duration: "permanent", setAt: state.round, expiresAtRound: null };
    }
    emit(state, "unit_returned", {
      unit: u.uid, player: s.owner, hex: s.node, strengthDelta: s.strengthDelta ?? 0,
    });
  }
  state.secondedUnits = keep;
  recomputeStats(state);
}

// v0.2 §16.5 — advance in-transit field reinforcements. Each round the
// convoy covers one more hex; it re-targets a moving unit by recomputing
// the supply route from its owner's nearest Location to the unit's
// *current* node, and delivers when it has travelled far enough. A packet
// whose target died is dropped.
function sweepReinforcements(state) {
  if (!state.reinforcements?.length) return;
  const keep = [];
  for (const r of state.reinforcements) {
    const unit = state.units[r.targetUnit];
    if (!unit) continue; // target destroyed — convoy disbands
    // §17.5 Logistics B2 (Supply Convoys): a holder's convoy covers +1 extra
    // hex/round (2 instead of 1), arriving sooner from behind the lines.
    r.traveled = (r.traveled || 0) + (hasTechNode(state, r.owner, "log-b2") ? 2 : 1);
    const route = reinforcementRoute(state, r.owner, unit.node);
    if (route && r.traveled >= route.dist) {
      const cap = unit.veteran ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
      const before = unit.baseStrength;
      unit.baseStrength = Math.min(cap, unit.baseStrength + r.amount);
      recomputeStats(state);
      emit(state, "reinforcement_arrived", {
        player: r.owner, unit: unit.uid, amount: unit.baseStrength - before,
      });
    } else {
      keep.push(r); // still en route (or momentarily walled off)
    }
  }
  state.reinforcements = keep;
}

function expirePlacementMarkers(state) {
  const markers = state.world?.encounterMarkers;
  if (!markers) return;
  for (const [hex, entry] of Object.entries(markers)) {
    const queue = Array.isArray(entry) ? entry : [entry];
    const live = queue.filter((m) => m.expiresAt == null || m.expiresAt >= state.round);
    if (!live.length) delete markers[hex];
    else markers[hex] = live;
  }
}

// Soft decay so raid / ignore counters reflect *recent* activity
// (§15.3). Multiplicative, floored — counter at 10 takes 22 rounds to
// reach 0 with no new entries; gentle enough that a single skipped
// round doesn't erase context.
function decayWorldCounters(state) {
  const w = state.world;
  if (!w) return;
  for (const k of Object.keys(w.raidCounts || {})) {
    w.raidCounts[k] = Math.floor(w.raidCounts[k] * 0.9);
  }
  for (const k of Object.keys(w.ignoreCounts || {})) {
    w.ignoreCounts[k] = Math.floor(w.ignoreCounts[k] * 0.9);
  }
}


// victory.js scores alliances and vassals but must not import diplomacy.js —
// diplomacy already imports victory, and the cycle would bite at load. turn.js
// sits above both, so it is the natural place to hand the reader across.
registerAllyReader((state, fid) => {
  const st = dominionStanding(state, fid);
  return { allied: st.allied, vassals: st.vassals };
});
