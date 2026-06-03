// The effect library (mechanical-spec §12) — exactly one handler per
// effect `type`. Handlers mutate the GameState and emit events.
import { CONFIG } from "./config.js";
import { emit } from "./events.js";
import { resolveTargets } from "./targeting.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { destroyUnit } from "./contest.js";
import { bfsDistances } from "./board.js";
import { revealRegion, plantFalseGhost, ensureVisibility } from "./visibility.js";
import * as diplo from "./diplomacy.js";

// Headless default for interactive effects — pick the first option.
export function autoInteract(request) {
  return request?.options ? request.options[0] : null;
}

const POOL_KEY = { Resource: "resource", VP: "vp" };

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
      const key = POOL_KEY[e.resource] || "resource";
      p[key] = Math.max(0, p[key] + e.amount);
      emit(state, e.amount >= 0 ? "resource_gained" : "resource_spent", {
        player: pid, resource: e.resource, amount: e.amount,
      });
      if (e.resource === "VP" && p.vp >= CONFIG.vpThreshold && !state.winnerId) {
        state.winnerId = pid;
      }
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

  GRANT_ACTIONS(state, e, ctx) {
    for (const pid of resolveTargets(state, e.target, ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      if (e.when === "next_turn") {
        state.pendingActionGrants.push({ player: pid, amount: e.amount });
      } else {
        p.actions.remaining = Math.max(0, p.actions.remaining + e.amount);
      }
    }
  },

  MOVE_CARD(state, e, ctx) {
    const from = getZone(state, e.from);
    const to = getZone(state, e.to);
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

  PEEK(state, e, ctx) {
    // Information-only — surfaced to the UI in a later layer.
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
    // `player` is a token / pid; `faction` is a faction id.
    const pid = resolveTargets(state, e.player, ctx)[0];
    const fid = e.faction;
    if (!pid || !fid) return;
    state.factionStanding[fid] = state.factionStanding[fid] || {};
    state.factionStanding[fid][pid] = (state.factionStanding[fid][pid] || 0) + (e.amount || 0);
    emit(state, "standing_changed", {
      faction: fid, player: pid, value: state.factionStanding[fid][pid], delta: e.amount,
    });
  },

  SET_PLAYER_FLAG(state, e, ctx) {
    // Player-scoped flag store, parallel to §12.5 SET_FLAG which stays
    // entity-scoped (unit / location / chip).
    for (const pid of resolveTargets(state, e.target, ctx)) {
      const p = state.players[pid];
      if (!p) continue;
      p.flags = p.flags || {};
      p.flags[e.flag] = {
        value: e.value !== undefined ? e.value : true,
        duration: e.duration || "permanent",
        setAt: state.round,
      };
    }
  },

  QUEUE_DEFERRED(state, e, ctx) {
    // Snapshot the active player at queue time so an `active` /
    // `active_player` token inside the deferred effects lands on the
    // original queuer rather than whoever happens to be active when
    // the packet resolves N rounds later. Other tokens
    // (`controller`, `claimant`, …) keep their resolution-time semantics.
    const active = state.turnOrder[state.activeIndex];
    const effects = (e.effects || []).map((eff) => snapshotActiveToken(eff, active));
    state.deferred = state.deferred || [];
    state.deferred.push({
      dueRound: state.round + (e.delayRounds || 0),
      effects,
      source: ctx.source || null,
      originalActive: active,
      queuedAt: state.round,
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
    diplo.checkRecognitionVictory(state);
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
    diplo.checkRecognitionVictory(state);
  },
  RELEASE_VASSAL(state, e, ctx) {
    diplo.releaseVassal(state, e.faction, e.cause);
  },
  // A resolved deal (accept). `e.deal` is the {proposer,recipient,give,get}.
  RESOLVE_DEAL(state, e, ctx) {
    if (e.accept === false || !e.deal) return;
    diplo.applyDeal(state, e.deal, e.cause || "deal");
    diplo.checkRecognitionVictory(state);
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
      diplo.checkRecognitionVictory(state);
    }
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
