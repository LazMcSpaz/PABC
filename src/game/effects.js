// The effect library (mechanical-spec §12) — exactly one handler per
// effect `type`. Handlers mutate the GameState and emit events.
import { CONFIG } from "./config.js";
import { emit } from "./events.js";
import { resolveTargets, resolveHex } from "./targeting.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { CHIPS } from "./content.js";
import { unitHasStatType } from "./economy.js";
import { destroyUnit } from "./contest.js";
import { bfsDistances } from "./board.js";
import { revealRegion, plantFalseGhost, ensureVisibility } from "./visibility.js";
import * as diplo from "./diplomacy.js";
import { evalCond, evalStrength } from "./dsl.js";

// Headless default for interactive effects — pick the first option.
export function autoInteract(request) {
  return request?.options ? request.options[0] : null;
}

const POOL_KEY = { Resource: "resource", VP: "vp" };

// The force a player brings to a narrative CONTEST: the unit the encounter
// is happening to if there is one (field encounters pass ctx.sourceUnit),
// otherwise the strongest unit they have. Falls back to 0 rather than
// throwing — a player with no units loses, which is the right answer.
function contestingStrength(state, pid, ctx) {
  const source = state.units[ctx.sourceUnit];
  if (source && source.owner === pid) return source.strength ?? 0;
  const owned = Object.values(state.units).filter((u) => u.owner === pid && !u.seconded);
  if (!owned.length) return 0;
  return owned.reduce((best, u) => Math.max(best, u.strength ?? 0), 0);
}

function findEntity(state, id) {
  return (
    state.units[id] || state.locations[id] || state.chips[id] || state.players[id] || null
  );
}

// Resolve a zone path (e.g. "hand:versari", "discard:reactive") to its array.
// §20.2 — the marketRow / marketDeck zones are gone with the retired Market.
function getZone(state, spec) {
  if (!spec) return null;
  const [kind, arg] = String(spec).split(":");
  switch (kind) {
    case "encounterDeck": return state.encounterDeck;
    case "reactiveDeck": return state.reactiveDeck;
    case "removed": return state.removed;
    case "hand": return state.players[arg]?.hand;
    case "discard": return state.discards[arg];
    case "unitBay": return state.units[arg]?.chips;
    case "locationSlots": return state.locations[arg]?.chips;
    default: return null;
  }
}

const EFFECTS = {
  ADJUST_RESOURCE(state, e, ctx) {
    for (const pid of resolveTargets(state, e.target, ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      // §17.2 — "Research" (and legacy "Tech") grants are PERMANENT: they
      // raise the research floor (encounter/quest research can't be raided
      // away), then the level/wheel are re-derived.
      if (e.resource === "Research" || e.resource === "Tech") {
        p.permanentResearch = Math.max(0, (p.permanentResearch || 0) + e.amount);
        recomputeResearch(state);
        emit(state, e.amount >= 0 ? "resource_gained" : "resource_spent", {
          player: pid, resource: "Research", amount: e.amount,
        });
        continue;
      }
      // VP granted by an encounter or quest is BANKED, not held (victory.js):
      // it is not tied to a place, so it survives losing one. Both `bankedVp`
      // and the `vp` total move by the same amount, which keeps the
      // vp === bankedVp + settlementVp invariant true without importing
      // victory.js — events.js already imports THIS module, so that would be a
      // cycle. The next recomputeVp lands on the identical number.
      if (e.resource === "VP") {
        p.bankedVp = Math.max(0, (p.bankedVp || 0) + e.amount);
      }
      const key = POOL_KEY[e.resource] || "resource";
      p[key] = Math.max(0, p[key] + e.amount);
      emit(state, e.amount >= 0 ? "resource_gained" : "resource_spent", {
        player: pid, resource: e.resource, amount: e.amount,
      });
      // VP no longer wins anything — it is the end-of-game standing. This was
      // the third copy of the old threshold check, and like the one in
      // contest.js it honoured neither the setup toggle nor the major/minor
      // rule the copy in victory.js applied.
    }
  },

  MODIFY_STAT(state, e, ctx) {
    for (const t of resolveTargets(state, e.target, ctx)) {
      state.modifiers.push({
        target: t, stat: e.stat, amount: e.amount,
        duration: e.duration || "permanent",
        createdRound: state.round, createdTurn: state.activeIndex,
      });
      emit(state, "stat_modified", { target: t, stat: e.stat, amount: e.amount });
    }
    recomputeStats(state);
  },

  // v0.2 §16.4 — wound or heal a unit's base Strength (its HP). Clamps to
  // [0, cap] (veteran cap if promoted); a unit driven to 0 is destroyed.
  // Lets encounters and content top up or chip away at a unit.
  ADJUST_BASE_STRENGTH(state, e, ctx) {
    for (const t of resolveTargets(state, e.target, ctx)) {
      const unit = state.units[t];
      if (!unit) continue;
      const cap = unit.veteran ? CONFIG.unit.veteranStrengthCap : CONFIG.unit.baseStrengthCap;
      unit.baseStrength = Math.max(0, Math.min(cap, unit.baseStrength + (e.amount || 0)));
      recomputeStats(state);
      emit(state, "base_strength_changed", {
        unit: t, amount: e.amount, baseStrength: unit.baseStrength,
      });
      if (unit.baseStrength <= 0) destroyUnit(state, t, null, ctx);
    }
  },

  // docs/chip-system-dependencies.md S4 — reward-chip delivery. Grants a
  // chip (usually a `reward: true` def) to a unit: e.unit, or the ctx's
  // triggering unit (encounters pass ctx.sourceUnit), or any unit of the
  // resolved target player with bay room. Installs when the bay has space
  // and the one-per-stat rule allows; otherwise the chip drops as hex loot
  // at the unit's feet — found, not lost.
  GRANT_CHIP(state, e, ctx) {
    // pool: "reward" draws a random reward-tier chip (Old Armory) instead
    // of a fixed chipId.
    let chipId = e.chipId;
    if (!chipId && e.pool === "reward") {
      const rewards = Object.values(CHIPS).filter((c) => c.reward).map((c) => c.id);
      chipId = state.rng.pick(rewards);
    }
    const def = CHIPS[chipId];
    if (!def) throw new Error(`GRANT_CHIP: unknown chip "${chipId}"`);
    let unit = state.units[e.unit] || state.units[ctx.sourceUnit] || null;
    if (!unit) {
      const pids = resolveTargets(state, e.target || "self", ctx);
      // Prefer a unit standing on the source Location (ability grants arm
      // the garrison), then any unit of the resolved player.
      const hex = ctx.source?.hexId;
      const owned = Object.values(state.units).filter((u) => pids.includes(u.owner));
      unit = (hex && owned.find((u) => u.node === hex)) || owned[0] || null;
    }
    if (!unit) return; // no possible recipient — the grant fizzles
    const uid = state.nextId("chip");
    state.chips[uid] = { uid, chipId: def.id };
    const slotsHeld = unit.chips.reduce(
      (n, c) => n + (state.chips[c]?.chipId === "capital" ? 1 : CHIPS[state.chips[c]?.chipId]?.slots ?? 1), 0);
    const fits = slotsHeld + (def.slots || 1) <= CONFIG.unit.baySlots &&
      !unitHasStatType(state, unit, def.statType);
    if (fits) {
      unit.chips.push(uid);
      recomputeStats(state);
      emit(state, "chip_granted", { unit: unit.uid, player: unit.owner, chip: uid, chipId: def.id, installed: true });
    } else {
      state.hexLoot = state.hexLoot || {};
      (state.hexLoot[unit.node] = state.hexLoot[unit.node] || []).push(uid);
      emit(state, "chip_granted", { unit: unit.uid, player: unit.owner, chip: uid, chipId: def.id, installed: false, hex: unit.node });
      emit(state, "loot_dropped", { hex: unit.node, chips: [uid] });
    }
  },

  // Blacksite: disable one enemy chip (anywhere) until the start of the
  // acting player's next turn. Sets the §20.9 dormant flag plus a
  // suppressedUntil ordinal; the startTurn sweep lifts it and the upkeep
  // charger refuses to reactivate early.
  DISABLE_CHIP(state, e, ctx) {
    const actor = ctx.sourcePlayer;
    const candidates = [];
    for (const loc of Object.values(state.locations)) {
      if (!loc.controller || loc.controller === actor) continue;
      for (const c of loc.chips) {
        const inst = state.chips[c];
        if (inst && !inst.disabled && inst.chipId !== "capital") candidates.push(c);
      }
    }
    for (const u of Object.values(state.units)) {
      if (u.owner === actor) continue;
      for (const c of u.chips) {
        const inst = state.chips[c];
        if (inst && !inst.disabled) candidates.push(c);
      }
    }
    if (!candidates.length) return;
    let uid = candidates[0];
    if (ctx.interact) {
      const pick = ctx.interact({ kind: "chooseChip", options: candidates });
      if (candidates.includes(pick)) uid = pick;
    }
    const inst = state.chips[uid];
    inst.disabled = true;
    inst.suppressedUntil = state.round * state.turnOrder.length + state.activeIndex +
      state.turnOrder.length - 1;
    recomputeStats(state);
    recomputeResearch(state);
    emit(state, "chip_dormant", { chip: uid, chipId: inst.chipId, suppressed: true, by: actor });
  },

  // Scrapyard: rip one chip off an enemy unit standing at the source
  // Location; it drops as hex loot there — anyone may claim it.
  STRIP_CHIP(state, e, ctx) {
    const actor = ctx.sourcePlayer;
    const hex = ctx.source?.hexId;
    if (!hex) return;
    const marks = Object.values(state.units).filter(
      (u) => u.owner !== actor && u.node === hex && u.chips.length,
    );
    if (!marks.length) return;
    const mark = marks[0];
    const options = [...mark.chips];
    let uid = options[0];
    if (ctx.interact) {
      const pick = ctx.interact({ kind: "chooseChip", options });
      if (options.includes(pick)) uid = pick;
    }
    mark.chips.splice(mark.chips.indexOf(uid), 1);
    state.hexLoot = state.hexLoot || {};
    (state.hexLoot[hex] = state.hexLoot[hex] || []).push(uid);
    recomputeStats(state);
    emit(state, "chip_removed", { hex, chip: uid, chipId: state.chips[uid]?.chipId, player: actor, holder: "unit", stripped: true });
    emit(state, "loot_dropped", { hex, chips: [uid] });
  },

  GRANT_ACTIONS(state, e, ctx) {
    for (const t of resolveTargets(state, e.target, ctx)) {
      // A unit target gains its own action (Staging Ground-style grants);
      // a player target feeds the wildcard pool (reactive cards, content).
      const unit = state.units[t];
      if (unit) {
        unit.actionsRemaining = (unit.actionsRemaining ?? 0) + e.amount;
        emit(state, "action_spent", { player: unit.owner, action: "grant", units: [t], amount: e.amount });
        continue;
      }
      const p = state.players[t];
      if (!p) continue;
      if (e.when === "next_turn") {
        state.pendingActionGrants.push({ player: t, amount: e.amount });
      } else {
        p.actions.remaining += e.amount;
      }
      emit(state, "action_spent", { player: t, action: "grant", amount: e.amount });
    }
  },

  MOVE_CARD(state, e, ctx) {
    // "hand:controller" resolves to the activating player (abilities pass
    // ctx.sourcePlayer) so authored content needn't know faction ids.
    const spec = (z) => typeof z === "string" && ctx.sourcePlayer
      ? z.replace(/:controller$/, `:${ctx.sourcePlayer}`) : z;
    const from = getZone(state, spec(e.from));
    const to = getZone(state, spec(e.to));
    if (!from || !to) return;
    const count = e.count || 1;
    for (let i = 0; i < count && from.length; i++) {
      let idx = 0; // "top" / default
      if (e.selector === "random") idx = ctx.rng ? ctx.rng.int(from.length) : 0;
      else if (e.selector === "by_id") idx = Math.max(0, from.indexOf(e.id));
      else if (e.selector === "chosen") {
        const choice = ctx.interact?.({ kind: "chooseCard", options: [...from] });
        idx = Math.max(0, from.indexOf(choice));
      }
      const [moved] = from.splice(idx, 1);
      to.push(moved);
      emit(state, "card_left_zone", { card: moved, zone: e.from });
      emit(state, "card_entered_zone", { card: moved, zone: e.to });
    }
  },

  SET_FLAG(state, e, ctx) {
    for (const t of resolveTargets(state, e.target, ctx)) {
      const ent = findEntity(state, t);
      if (!ent) continue;
      ent.flags = ent.flags || {};
      ent.flags[e.flag] = { value: e.value !== false, duration: e.duration || "permanent" };
    }
  },

  TRANSFER(state, e, ctx) {
    if (e.what !== "resource") return; // card transfer arrives in a later layer
    const from = resolveTargets(state, e.from, ctx)[0];
    const to = resolveTargets(state, e.to, ctx)[0];
    const fp = state.players[from];
    const tp = state.players[to];
    if (!fp || !tp) return;
    const key = POOL_KEY[e.resource] || "resource";
    let amt =
      e.amount === "all" ? fp[key]
        : e.amount === "half" ? Math.floor(fp[key] / 2)
          : e.amount;
    amt = Math.min(amt, fp[key]);
    fp[key] -= amt;
    tp[key] += amt;
    emit(state, "resource_spent", { player: from, resource: e.resource, amount: -amt });
    emit(state, "resource_gained", { player: to, resource: e.resource, amount: amt });
  },

  CONVERT(state, e, ctx) {
    const pid = resolveTargets(state, e.target, ctx)[0];
    const p = state.players[pid];
    if (!p) return;
    const fromKey = POOL_KEY[e.from];
    const toKey = POOL_KEY[e.to];
    const cost = e.rate?.cost ?? 1;
    const gain = e.rate?.gain ?? 1;
    let times = Math.floor(p[fromKey] / cost);
    if (e.max != null) times = Math.min(times, e.max);
    if (times <= 0) return;
    p[fromKey] -= times * cost;
    p[toKey] += times * gain;
  },

  SPAWN(state, e, ctx) {
    // v0.1 supports unit spawning via the Recruit action (Layer 3);
    // location / obstacle spawns arrive with the encounter content.
  },

  // Look ahead at what is coming without changing it. The only effect that
  // grants information rather than altering state — content uses it as a
  // foresight reward ("have her read the road"). The peeked ids are parked
  // on the player for the UI to render; `reorder` lets a caller rewrite the
  // order it saw, which is the difference between scrying and merely
  // looking.
  PEEK(state, e, ctx) {
    // `scope` says WHERE the foresight looks, and follows the fiction of
    // where the reading happens: a reader at a roadside sees what is coming
    // on the road; a seer sitting with your seat sees what is coming to the
    // settlement. Neither is the default — content states which it means.
    //
    //   scope: "field"      the field-encounter deck (what the road holds)
    //   scope: "settlement" the world encounters currently closest to firing
    //   deck/zone           an explicit zone, for anything else
    //
    // The settlement side is not a deck — world encounters are scored and
    // fired by triggers.js rather than drawn — so foresight there means
    // "which of these is nearest to happening", which is the same question
    // a deck peek answers for the road.
    // "both" is a real authored case — a reading that names a road, a
    // settlement and a party in the same breath. It costs one extra call,
    // so there is no reason to make content pick a side it did not mean.
    if (e.scope === "settlement" || e.scope === "both") {
      peekSettlement(state, e, ctx);
      if (e.scope === "settlement") return;
    }
    const zone = getZone(state, e.deck || e.zone
      || (e.scope === "field" || e.scope === "both" ? "encounterDeck" : null));
    if (!zone) return;
    const count = Math.max(0, Math.min(e.count ?? 1, zone.length));
    const cards = zone.slice(0, count);
    for (const pid of resolveTargets(state, e.target ?? "active", ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      const prior = e.scope === "both" && p.peeked?.round === state.round
        ? p.peeked.settlement ?? null : null;
      p.peeked = {
        deck: e.deck || e.zone || "encounterDeck", cards: [...cards],
        round: state.round, ...(prior ? { settlement: prior } : {}),
      };
      emit(state, "deck_peeked", {
        player: pid, deck: e.deck || e.zone, count, cards: [...cards],
        reorder: !!e.reorder,
      });
    }
    if (e.reorder && ctx.interact && count > 1) {
      const order = ctx.interact({ kind: "reorderPeek", options: [...cards] });
      if (Array.isArray(order) && order.length === count
          && order.every((c) => cards.includes(c))) {
        zone.splice(0, count, ...order);
      }
    }
  },

  FORCE_CHOICE(state, e, ctx) {
    const options = e.options || [];
    if (!options.length) return;
    const label = ctx.interact
      ? ctx.interact({ kind: "forceChoice", options: options.map((o) => o.label) })
      : options[0].label;
    const picked = options.find((o) => o.label === label) || options[0];
    applyEffects(state, picked.effects || [], ctx);
  },

  SURCHARGE(state, e, ctx) {
    for (const t of resolveTargets(state, e.target, ctx)) {
      state.surcharges.push({
        action: e.action,
        extraCost: e.extraCost || null,
        block: !!e.block,
        window: e.window || "until_your_next_turn",
        target: t,
      });
    }
  },

  // --- Layer 5 / spec §15.10 ---

  ADJUST_TRACK(state, e, ctx) {
    for (const pid of resolveTargets(state, e.target, ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      p.tracks = p.tracks || { trust: 0, reputation: 0, alignment: 0 };
      p.tracks[e.track] = (p.tracks[e.track] || 0) + (e.amount || 0);
      emit(state, "track_changed", {
        player: pid, track: e.track, value: p.tracks[e.track], delta: e.amount,
      });
    }
  },

  ADJUST_STANDING(state, e, ctx) {
    // `player` is a token / pid; `faction` is a faction id. Routed through
    // adjustStanding so the engine's guards apply: no self-standing (a
    // faction encounter resolving for its own player is a no-op — the
    // playtest log shows "Versari standing toward Versari"), and values
    // clamp to the configured range.
    const pid = resolveTargets(state, e.player, ctx)[0];
    const fid = e.faction;
    if (!pid || !fid || pid === fid) return;
    diplo.adjustStanding(state, fid, pid, e.amount || 0, "encounter");
  },

  SET_PLAYER_FLAG(state, e, ctx) {
    // Player-scoped flag store, parallel to §12.5 SET_FLAG which stays
    // entity-scoped (unit / location / chip).
    for (const pid of resolveTargets(state, e.target, ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      p.flags = p.flags || {};
      // `durationRounds` (or a numeric `duration`) gives the flag a real
      // lifetime, swept by turn.js. Without one it is permanent — which is
      // the right default for a ledger entry ("you hanged the prisoner")
      // and the wrong one for a temporary arrangement, so content that
      // means "for a while" must say how long.
      const rounds = e.durationRounds
        ?? (typeof e.duration === "number" ? e.duration : null);
      p.flags[e.flag] = {
        value: e.value !== undefined ? e.value : true,
        duration: rounds != null ? rounds : (e.duration || "permanent"),
        setAt: state.round,
        expiresAtRound: rounds != null ? state.round + rounds : null,
      };
    }
  },

  QUEUE_DEFERRED(state, e, ctx) {
    // Snapshot the active player at queue time so an `active` /
    // `active_player` token inside the deferred effects lands on the
    // original queuer rather than whoever happens to be active when
    // the packet resolves N rounds later. Other tokens
    // (`controller`, `claimant`, …) keep their resolution-time semantics.
    // Snapshot to the player this packet BELONGS to, not to whoever holds
    // the turn at the moment it is queued.
    //
    // A queued encounter is answered whenever the player gets to it, and the
    // round-end pipeline resolves with seat 0 nominally active — so
    // `active` at queue time is very often a bystander. The packet then
    // landed its flags, rewards and costs on that bystander N rounds later,
    // and the beat waiting on the flag never opened for the player who
    // actually made the choice. `ctx.asPlayer` is who the card was for.
    const active = ctx.asPlayer ?? state.turnOrder[state.activeIndex];
    const effects = (e.effects || []).map((eff) => snapshotActiveToken(eff, active));
    state.deferred = state.deferred || [];
    state.deferred.push({
      dueRound: state.round + (e.delayRounds || 0),
      effects,
      source: ctx.source || null,
      originalActive: active,
      queuedAt: state.round,
      // --- visible deadline (optional) ---------------------------------
      // A deadline IS a deferred packet; it just says so out loud. Keeping
      // them one mechanism means the countdown on screen and the thing that
      // actually fires can never drift apart, which a parallel timer system
      // would guarantee they eventually did.
      //
      //   label            player-facing text for the HUD
      //   visible          show a countdown for `originalActive`
      //   satisfiedIfFlag  the condition the player is racing to meet
      //   onMissed         what happens if they don't
      //
      // Omit all four and the packet behaves exactly as every existing one
      // does: fires its `effects` on the due round, unconditionally.
      label: e.label || null,
      visible: !!e.visible,
      satisfiedIfFlag: e.satisfiedIfFlag || null,
      onMissed: (e.onMissed || []).map((eff) => snapshotActiveToken(eff, active)),
    });
  },

  // --- §19 Fog of War (additive handlers) ---

  // §19.8 reveal-region pulse: explore + light up a radius of hexes for the
  // target faction(s). `center` defaults to the source hex (ctx) / the
  // target's location; `radius` in hops.
  REVEAL_REGION(state, e, ctx) {
    const center = e.center || ctx.event?.payload?.hex || ctx.source?.hexId || ctx.source?.node;
    if (!center || !state.board.hexes[center]) return;
    const dist = bfsDistances(state.board.adjacency, center);
    const region = Object.keys(dist).filter((h) => dist[h] <= (e.radius ?? 1));
    for (const fid of resolveTargets(state, e.target || "active", ctx)) {
      if (state.players[fid]) revealRegion(state, fid, region);
    }
  },

  // §18.6 / §19.9 shared (ally) vision: the recipient faction receives the
  // granter's currently-visible hexes (see through a friend's eyes). The
  // granter defaults to the active / source player.
  GRANT_VISION(state, e, ctx) {
    const fromFid = resolveTargets(state, e.from || "active", ctx)[0];
    const fromVis = state.visibility?.[fromFid];
    if (!fromVis) return;
    const region = [...fromVis.visible];
    for (const fid of resolveTargets(state, e.target, ctx)) {
      if (fid !== fromFid && state.players[fid]) revealRegion(state, fid, region);
    }
  },

  // §19.8 espionage / sabotage: write a fabricated ghost into a rival's
  // memory at an explored hex (the false-intel play).
  PLANT_FALSE_INTEL(state, e, ctx) {
    const hex = e.hex || ctx.event?.payload?.hex;
    for (const fid of resolveTargets(state, e.target, ctx)) {
      ensureVisibility(state, fid);
      plantFalseGhost(state, fid, hex, { owner: e.owner || null, strength: e.strength ?? 0, unitId: e.unitId });
    }
  },

  // --- §18 Diplomacy (additive handlers; delegate to diplomacy.js) ---

  ADJUST_MENACE(state, e, ctx) {
    for (const pid of resolveTargets(state, e.target, ctx)) diplo.adjustMenace(state, pid, e.amount || 0, e.cause);
  },
  ADJUST_HONOR(state, e, ctx) {
    for (const pid of resolveTargets(state, e.target, ctx)) diplo.adjustHonor(state, pid, e.amount || 0, e.cause);
  },
  DECLARE_WAR(state, e, ctx) {
    const a = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.declareWar(state, a, e.faction, e.cause);
  },
  MAKE_PEACE(state, e, ctx) {
    const a = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.makePeace(state, a, e.faction, e.cause);
  },
  FORM_PACT(state, e, ctx) {
    const a = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.formPact(state, a, e.faction, e.cause);
    diplo.checkDominion(state);
  },
  BREAK_PACT(state, e, ctx) {
    const a = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.breakPact(state, a, e.faction, e.cause);
  },
  CALL_PACT(state, e, ctx) {
    const caller = resolveTargets(state, e.actor || "active", ctx)[0];
    // §1.8 — when the content doesn't force an outcome, the ally evaluates the
    // call (evaluatePactCall) instead of always honoring.
    diplo.resolvePactCall(state, caller, e.ally, e.target, e.honored);
  },
  DENOUNCE(state, e, ctx) {
    const a = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.denounce(state, a, e.faction);
  },
  MEDIATE(state, e, ctx) {
    const m = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.mediate(state, m, e.a, e.b);
  },
  VASSALIZE(state, e, ctx) {
    const lord = resolveTargets(state, e.actor || "active", ctx)[0];
    diplo.vassalize(state, lord, e.faction, e.cause);
    diplo.checkDominion(state);
  },
  RELEASE_VASSAL(state, e, ctx) {
    diplo.releaseVassal(state, e.faction, e.cause);
  },
  // A resolved deal (accept). `e.deal` is the {proposer,recipient,give,get}.
  RESOLVE_DEAL(state, e, ctx) {
    if (e.accept === false || !e.deal) return;
    diplo.applyDeal(state, e.deal, e.cause || "deal");
    diplo.checkDominion(state);
  },
  // Deliver a proposal to a human recipient as a §15.5 private encounter,
  // or (AI recipient) evaluate immediately via the valuation engine.
  PROPOSE_DEAL(state, e, ctx) {
    const deal = e.deal;
    if (!deal) return;
    emit(state, "deal_proposed", { proposer: deal.proposer, recipient: deal.recipient });
    if (state.players[deal.recipient]?.isAI === false && deal.recipient === state.humanFactionId) {
      // human — deliver as a private encounter (handled by encounters.js)
      return;
    }
    if (diplo.wouldAccept(state, deal.recipient, deal)) {
      diplo.applyDeal(state, deal, "ai-accept");
      diplo.checkDominion(state);
    }
  },

  // --- authored resolution primitives ----------------------------------
  //
  // ROLL and CONTEST are how encounter content asks "did it work?". Both
  // branch into named outcome lists rather than mutating directly, so an
  // author writes the consequence next to the odds.

  // A d100 against an authored `chance` (1..chance succeeds). Content prices
  // its own risk — 15% for the careful method, 50% for the reckless one —
  // and those numbers ARE the design, so nothing here rounds or rescales.
  //
  // `chanceIfFlag` re-prices the roll when a flag is set, which is how a
  // setup two beats earlier pays off ("you armed the agent, so 33 becomes
  // 66"). Accepts one entry or a list; later matches win, so content can
  // layer several conditions and read them top-to-bottom.
  //
  // Uses state.rng (the seeded generator the contest dice draw from), never
  // Math.random, so replays and the harness stay deterministic.
  ROLL(state, e, ctx) {
    const sides = e.sides ?? 100;
    let chance = e.chance ?? 0;
    let reason = null;
    const rules = e.chanceIfFlag == null ? []
      : (Array.isArray(e.chanceIfFlag) ? e.chanceIfFlag : [e.chanceIfFlag]);
    for (const rule of rules) {
      const pid = resolveTargets(state, rule.target ?? rule.player ?? e.target ?? "active", ctx)[0];
      if (state.players[pid]?.flags?.[rule.flag]?.value) {
        chance = rule.chance ?? chance;
        reason = rule.flag;
      }
    }
    const roll = state.rng.roll(sides);
    const success = roll <= chance;
    emit(state, "roll_resolved", {
      player: resolveTargets(state, e.target ?? "active", ctx)[0],
      roll, sides, chance, success, modifiedBy: reason,
    });
    applyEffects(state, (success ? e.onSuccess : e.onFail) || [], ctx);
  },

  // A narrative strength check: the player's force against an authored
  // `opponentStrength`, each side adding the standard contest die. This is
  // deliberately NOT contest.js runContest — that is a board operation that
  // needs a unit already standing on the target's hex, zeroes its movement,
  // opens a reaction window and can trigger salvage and war. An encounter
  // asking "do you take the wall?" wants the arithmetic, not the board
  // side effects, and world encounters and quest beats carry no unit at all.
  //
  // `allyStrength` is the reinforcement an author has promised in prose —
  // "you go back with the Goldgrass at your shoulder" — and it adds to the
  // player's side. Without it that beat would fight identically to the solo
  // attempt it is supposed to contrast with.
  //
  // Both branches are authored, so a win may carry penalties: beating
  // farmers with hand tools costs alignment and standing, and the content
  // says so.
  CONTEST(state, e, ctx) {
    const pid = resolveTargets(state, e.target ?? "active", ctx)[0];
    const own = contestingStrength(state, pid, ctx);
    const ally = e.allyStrength ?? 0;
    const sides = CONFIG.contestDieSides;
    // Both dice are rolled into named locals rather than inlined into the
    // sums: the UI replays this contest die-by-die the way a board contest
    // is replayed, and a payload that carries only the totals leaves it
    // reconstructing each face by subtraction.
    const myDie = state.rng.roll(sides);
    const theirDie = state.rng.roll(sides);
    const mine = own + ally + myDie;
    const theirs = (e.opponentStrength ?? 0) + theirDie;
    const won = mine >= theirs; // ties to the player, as the attacker here
    emit(state, "narrative_contest_resolved", {
      player: pid, own, ally, opponent: e.opponentStrength ?? 0,
      die: myDie, opponentDie: theirDie, sides,
      total: mine, against: theirs, won,
    });
    applyEffects(state, (won ? e.onWin : e.onLose) || [], ctx);
  },

  // --- one-off authored effects ----------------------------------------

  // Free passage through a faction's territory for a limited time. Written
  // as flag-scoped (`whileFlag`), so the grant lives exactly as long as the
  // flag does and the flag's own duration decides when it lapses.
  GRANT_SAFE_PASSAGE(state, e, ctx) {
    const factions = e.factions || (e.faction ? [e.faction] : []);
    for (const pid of resolveTargets(state, e.target ?? "active", ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      p.safePassage = p.safePassage || {};
      for (const fid of factions) {
        p.safePassage[fid] = {
          whileFlag: e.whileFlag || null,
          until: e.durationRounds != null ? state.round + e.durationRounds : null,
          grantedAt: state.round,
        };
      }
      emit(state, "safe_passage_granted", {
        player: pid, factions, whileFlag: e.whileFlag || null,
        until: e.durationRounds != null ? state.round + e.durationRounds : null,
      });
    }
  },

  // Somebody borrows one of your units. It leaves play for `rounds`, then
  // comes back — by default weaker for the experience. A loan under duress,
  // not a transfer: the unit is yours throughout and returns to where it
  // stood. Implemented as a secondment record swept by turn.js, so the unit
  // is genuinely unavailable rather than merely flagged.
  TAKE_UNIT(state, e, ctx) {
    const pid = resolveTargets(state, e.target ?? "active", ctx)[0];
    const unit = state.units[e.unit] || state.units[ctx.sourceUnit]
      || Object.values(state.units).filter((u) => u.owner === pid)
           .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))[0];
    if (!unit) return; // nothing to lend — the arrangement fizzles
    // Lift the whole record out of play — a borrowed unit should not be
    // movable, contestable or countable while it is away. Stashing the
    // record (rather than setting a flag every consumer would have to
    // learn) means one touch point here and one on the way back.
    state.secondedUnits = state.secondedUnits || [];
    state.secondedUnits.push({
      record: unit, owner: unit.owner, node: unit.node,
      returnRound: state.round + (e.rounds ?? 1),
      strengthDelta: e.returnStrengthDelta ?? 0,
      returnFlag: e.returnFlag || null,
    });
    delete state.units[unit.uid];
    recomputeStats(state);
    emit(state, "unit_seconded", {
      unit: unit.uid, player: unit.owner, rounds: e.rounds ?? 1,
      returnRound: state.round + (e.rounds ?? 1),
    });
  },

  // Absolute movement override — the unit's Movement BECOMES `value`, it is
  // not adjusted by it. "Take the long way" means you arrive slowly whatever
  // your logistics; a delta would make a fast army barely notice the detour.
  SET_MOVEMENT(state, e, ctx) {
    for (const pid of resolveTargets(state, e.target ?? "active", ctx)) {
      if (!state.players[pid]) continue;
      state.movementOverrides = state.movementOverrides || [];
      state.movementOverrides.push({
        player: pid, value: e.value ?? 1,
        appliesOnRound: e.when === "next_turn" ? state.round + 1 : state.round,
        consumed: false,
      });
      emit(state, "movement_overridden", {
        player: pid, value: e.value ?? 1, when: e.when || "this_turn",
      });
    }
  },

  // Ongoing sight of one place. The fiction's word is "again" — this ford
  // does not go dark to you a second time — so the hex is added to a
  // permanent watch list that survives the normal visibility recompute,
  // rather than being a one-shot reveal.
  PERSISTENT_VISION(state, e, ctx) {
    const hex = resolveHex(state, e.hex ?? "encounter-hex", ctx);
    if (!hex || !state.board.hexes[hex]) return;
    for (const fid of resolveTargets(state, e.target ?? "active", ctx)) {
      if (!state.players[fid]) continue;
      const vis = ensureVisibility(state, fid);
      vis.permanent = vis.permanent || new Set();
      vis.permanent.add(hex);
      revealRegion(state, fid, [hex]);
    }
  },

  // A place nobody owns and everybody uses. Deliberately NOT a transfer of
  // control: ownership stays unresolved and the hex pays a recurring yield
  // to the player for as long as the arrangement stands. "Nothing is
  // settled. Everything works."
  ESTABLISH_DUAL_HOLDING(state, e, ctx) {
    const hex = resolveHex(state, e.hex ?? "encounter-hex", ctx);
    if (!hex) return;
    const pid = resolveTargets(state, e.target ?? "active", ctx)[0];
    state.dualHoldings = state.dualHoldings || {};
    state.dualHoldings[hex] = {
      hex, owners: e.owners || [pid], beneficiary: pid,
      playerYield: e.playerYield ?? 0, since: state.round,
    };
    emit(state, "dual_holding_established", {
      hex, owners: e.owners || [pid], player: pid, playerYield: e.playerYield ?? 0,
    });
  },

  // --- replacement mode — only meaningful inside a reaction window ---
  REDIRECT(state, e, ctx) {
    if (!ctx.pending) return;
    let value = e.value;
    // Resolve a token (e.g. "self") to a concrete pid — otherwise the
    // payload field would be set to the literal string.
    if (
      typeof value === "string" &&
      ["self", "controller", "triggering_player", "active_player"].includes(value)
    ) {
      value = resolveTargets(state, value, ctx)[0] ?? value;
    }
    const cur = ctx.pending[e.field];
    if (e.operation === "set") ctx.pending[e.field] = value;
    else if (e.operation === "scale") ctx.pending[e.field] = cur * value;
    else if (e.operation === "clamp") ctx.pending[e.field] = Math.min(cur, value);
  },

  CANCEL(state, e, ctx) {
    if (ctx.pending) ctx.pending.cancelled = true;
  },
};

// Foresight over world encounters: the ones whose trigger conditions are
// currently satisfied, ranked the way triggers.js would rank them at the
// next round end (strength x rarity weight). Read-only — it scores without
// firing anything and without touching cooldowns.
// Read the live registry lazily: encounters.js imports this module, so a
// top-level import back would close the cycle.
let _worldReg = null;
function worldEncountersRegistry() {
  return _worldReg ? _worldReg() : {};
}
export function __bindWorldRegistry(fn) { _worldReg = fn; }

function peekSettlement(state, e, ctx) {
  const count = Math.max(1, e.count ?? 1);
  const ranked = [];
  for (const [id, def] of Object.entries(worldEncountersRegistry())) {
    const cooldownUntil = state.triggerCooldowns?.[id] || 0;
    if (cooldownUntil > state.round) continue;
    if (def.triggerCondition != null && !evalCond(state, def.triggerCondition, ctx)) continue;
    const strength = def.triggerStrength == null
      ? 1 : evalStrength(state, def.triggerStrength, ctx);
    if (strength <= 0) continue;
    const weight = def.triggerWeight == null ? 1 : Number(def.triggerWeight) || 1;
    ranked.push({ id, score: strength * weight });
  }
  ranked.sort((a, b) => b.score - a.score);
  const cards = ranked.slice(0, count).map((r) => r.id);
  for (const pid of resolveTargets(state, e.target ?? "active", ctx)) {
    const p = state.players[pid];
    if (!p) continue;
    p.peeked = { deck: "settlement", cards: [...cards], settlement: [...cards], round: state.round };
    emit(state, "deck_peeked", {
      player: pid, deck: "settlement", count: cards.length, cards: [...cards], reorder: false,
    });
  }
}

// Walk an effect tree and replace any `active` / `active_player` token
// in player-bearing fields with a concrete pid. Used by QUEUE_DEFERRED
// so the deferred sweep doesn't reinterpret who "active" means.
function snapshotActiveToken(eff, pid) {
  if (!eff || typeof eff !== "object") return eff;
  const sub = (v) => (v === "active" || v === "active_player" ? pid : v);
  const out = { ...eff };
  for (const k of ["target", "player", "recipient", "chooser"]) {
    if (k in out) out[k] = sub(out[k]);
  }
  if (Array.isArray(eff.effects)) {
    out.effects = eff.effects.map((e) => snapshotActiveToken(e, pid));
  }
  if (Array.isArray(eff.options)) {
    out.options = eff.options.map((o) => ({
      ...o,
      effects: (o.effects || []).map((e) => snapshotActiveToken(e, pid)),
    }));
  }
  return out;
}

export function applyEffect(state, effect, ctx = {}) {
  const handler = EFFECTS[effect.type];
  if (!handler) throw new Error(`applyEffect: no handler for "${effect.type}"`);
  handler(state, effect, ctx);
}

export function applyEffects(state, effects, ctx = {}) {
  for (const effect of effects || []) applyEffect(state, effect, ctx);
}

export { EFFECTS };
