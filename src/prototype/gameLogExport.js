// Exportable playtest log. state.log already carries a rich, chronological
// event stream (every emit() in src/game/*.js) — EventFeed.jsx renders a
// curated, truncated LIVE view of it (last 14 lines, ~20 event types
// deliberately suppressed as "too noisy for the HUD"). This module renders
// the FULL, uncurated log as a detailed, human-readable transcript for
// exporting after a playtest session — nothing is dropped, and numeric
// detail (contest math, tech effects, movement budgets) is spelled out
// rather than summarized, so a read-through can actually catch a
// mismatch between what should have happened and what did.
//
// IMPORTANT for anyone extending this: formatters run once, at export
// time, against the FINAL game state — never against "state as it was
// when the event fired." Contest events are safe because their payload
// already bakes in every number at resolution time (defenderValue, every
// modifier, etc. — see contest.js). unit_moved is safe for the same
// reason: its payload snapshots `movement`/`moveRemaining`/`player`
// directly (see actions.js runMove) rather than this file re-deriving
// them from `state.units[p.unit]`, which would silently show a unit's
// FINAL stats against every historical move it ever made, or fail
// entirely once the unit dies. Any NEW formatter that needs a mutable,
// point-in-time fact (a stat, an owner, a position) should get it from
// the emit() payload at the source, not by reading live `state` here —
// follow unit_moved's pattern if you add one. Static lookups (location
// names, chip names, tech descriptions) are fine to resolve here since
// they never change mid-game.
import { FACTIONS as UI_FACTIONS, resourceLabel } from "./data.js";
import { FACTIONS as ENGINE_FACTIONS, CHIPS as ENGINE_CHIPS, LOCATIONS as ENGINE_LOCATIONS } from "../game/content.js";
import { TECH_NODES, TECH_PATHS } from "../game/tech.js";
import { CONFIG } from "../game/config.js";

function factionName(pid) {
  return UI_FACTIONS[pid]?.name || pid || "—";
}

function locName(hexId, state) {
  const loc = state.locations?.[hexId];
  if (!loc) return hexId;
  const def = ENGINE_LOCATIONS[loc.locationId];
  return def ? `${def.name} (${hexId})` : hexId;
}

function chipName(chipUid, state) {
  const chipId = state.chips?.[chipUid]?.chipId;
  return ENGINE_CHIPS[chipId]?.name || chipId || chipUid;
}

// node id -> "Path · Branch — Name: effect text" (mirrors TechWheel.jsx's
// nodeName/nodeText/nodeSubtitle, duplicated here rather than imported
// since those are file-local to the component, not exported).
function techNodeDesc(nodeId) {
  const node = TECH_NODES[nodeId];
  if (!node) return nodeId;
  const path = TECH_PATHS[node.path];
  if (node.layer === 1) return `${path.name} · ${path.entryName} — ${path.entryText}`;
  const branchKey = nodeId.slice(-2);
  const branch = branchKey.startsWith("a") ? "a" : "b";
  const meta = path.nodes?.[branchKey];
  const branchName = path.branches?.[branch]?.name;
  return `${path.name} · ${branchName || branch} · ${meta?.name || branchKey.toUpperCase()} — ${meta?.text || "no effect text"}`;
}

// Generic fallback for any event type not given a dedicated formatter
// below — every field printed, so a newly-added event is never silently
// dropped just because this file hasn't been updated for it yet.
function dumpPayload(p) {
  return Object.entries(p || {})
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(", ");
}

// One formatter per event name, returning the line's BODY (no prefix —
// the caller adds the [round/turn/faction] header). Every branch is a
// real, specific line; anything not listed falls through to dumpPayload
// via the default case, so nothing is ever silently suppressed.
function formatLine(ev, state) {
  const p = ev.payload || {};
  switch (ev.name) {
    case "turn_started": return `Turn started — ${factionName(p.player)}`;
    case "turn_ended": return `Turn ended — ${factionName(p.player)}`;
    case "round_ended": return `— Round ${p.round} ended —`;

    case "unit_moved":
      return `${factionName(p.player)} moved unit ${p.unit}: ${p.from} → ${p.to}  (movement cap ${p.movement}, ${p.moveRemaining}/${p.movement} remaining after this move)`;
    case "unit_recruited": return `${factionName(p.player)} recruited unit ${p.unit} at ${locName(p.hex, state)}`;
    case "unit_retreated": return `${factionName(p.player)} unit ${p.unit} retreated to ${p.to}`;
    case "unit_destroyed": return `${factionName(p.owner)} lost unit ${p.unit}${p.killer ? ` (killed by ${p.killer})` : ""}`;
    case "unit_lost_sight": return `${factionName(p.faction)} lost sight of unit ${p.unit}`;
    case "unit_spotted": return `${factionName(p.faction)} spotted ${factionName(p.owner)}'s unit ${p.unit} at ${p.hex}`;
    case "veteran_promoted": return `Unit ${p.unit} (${factionName(p.owner)}) promoted to Veteran`;
    case "unit_reinforced": return `Unit ${p.unit} reinforced +${p.amount} Strength`;
    case "reinforcement_requested": return `${factionName(p.player)} sent reinforcements — ETA ${p.eta} round(s)`;
    case "reinforcement_arrived": return `${factionName(p.player)} reinforcement convoy arrived`;
    case "base_strength_changed": return `Unit ${p.unit} base Strength ${p.amount >= 0 ? "+" : ""}${p.amount} → now ${p.baseStrength}`;

    case "contest_declared":
      return `${factionName(p.player)} declares a ${p.kind} contest — initiator unit ${p.initiator}, hex ${p.hex}${p.target ? `, target ${p.target}` : ""}`;
    case "contest_won":
    case "contest_lost": {
      // Attrition (Strength loss, kills, salvage) isn't in THIS payload —
      // it's applied right after and shows up as its own base_strength_
      // changed / unit_destroyed / loot_* lines immediately following in
      // the transcript, which is more granular than folding a summary in
      // here, not less.
      const margin = Math.abs(p.initiatorTotal - p.defenderTotal);
      const detail = [
        `initiator roll ${p.initiatorRoll} (total ${p.initiatorTotal}) vs defender ${p.defenderRolled ? `roll ${p.defenderRoll} ` : "(no die — garrison only) "}(total ${p.defenderTotal})`,
        `margin ${margin}`,
        `defender base value ${p.defenderValue}`,
        p.attackerConcentration ? `atkConcentration +${p.attackerConcentration}` : null,
        p.attackerVeteran ? `atkVeteran +${p.attackerVeteran}` : null,
        p.attackerAllies ? `atkAllies +${p.attackerAllies}` : null,
        p.attackerMilitary ? `atkMilitary(Doctrine) +${p.attackerMilitary}` : null,
        p.attackerVanguard ? `atkVanguard +${p.attackerVanguard}` : null,
        p.attackerAmbush ? `attacker ambushed (+${p.attackerAmbushBonus})` : null,
        p.defenderConcentration ? `defConcentration +${p.defenderConcentration}` : null,
        p.defenderMountain ? `defMountain +${p.defenderMountain}` : null,
        p.defenderFortify ? `defFortify +${p.defenderFortify}` : null,
        p.defenderVeteran ? `defVeteran +${p.defenderVeteran}` : null,
        p.defenderAllies ? `defAllies +${p.defenderAllies}` : null,
        p.defenderMilitary ? `defMilitary(Doctrine) +${p.defenderMilitary}` : null,
        p.defenderTurrets ? "defender Turrets active" : null,
        p.defenderAmbush ? `defender ambushed (+${p.defenderAmbushBonus})` : null,
      ].filter(Boolean).join(", ");
      return `${factionName(p.player)} ${ev.name === "contest_won" ? "WON" : "LOST"} a ${p.kind} contest — unit ${p.initiator} (${detail})`;
    }
    case "ambush_triggered": return `Ambush at ${p.hex} — the ${p.side} was concealed (attackerAmbush=${p.attackerAmbush}, defenderAmbush=${p.defenderAmbush}${p.reactionSuppressed ? ", defender's reaction window suppressed" : ""})`;

    case "section_flipped": return `Section flipped at ${locName(p.hex, state)} → ${p.to ? factionName(p.to) : "neutral"} (cause: ${p.cause})`;
    case "location_captured": return `${factionName(p.controller)} captured ${locName(p.hex, state)}${p.from ? ` (from ${factionName(p.from)})` : " (unclaimed)"}`;
    case "location_decayed": return `${locName(p.hex, state)} fully decayed to neutral`;
    case "control_peeled": return `Control peeled toward neutral at ${locName(p.hex, state)} (from ${factionName(p.from)})`;
    case "loyalty_changed": return `Loyalty at ${locName(p.hex, state)} (${factionName(p.owner)}) → ${p.loyalty}`;
    case "loyalty_failing": return `Loyalty ${p.peeling ? "COLLAPSED — peeling" : "failing"} at ${locName(p.hex, state)} (${factionName(p.owner)}, loyalty ${p.loyalty})`;
    case "location_spawned": return `Location revealed: ${locName(p.hex, state)}`;
    case "zone_changed": return `Zone of Control border shifted at ${p.hex}: ${p.from ? factionName(p.from) : "unclaimed"} → ${p.to ? factionName(p.to) : "unclaimed"}`;

    case "loot_dropped": return `Loot dropped at ${p.hex}: ${(p.chips || []).map((c) => chipName(c, state)).join(", ") || "(none)"}`;
    case "loot_claimed": return `${factionName(p.player)} claimed loot at ${p.hex}: ${(p.chips || []).map((c) => chipName(c, state)).join(", ")}`;
    case "unit_salvaged": return `Salvage resolved: kept ${(p.chips || []).map((c) => chipName(c, state)).join(", ") || "(none)"}`;

    case "build_started": return `${factionName(state.locations[p.hex]?.controller)} started ${p.kind === "upgrade" ? "upgrading to" : "building"} ${ENGINE_CHIPS[p.chipId]?.name || p.chipId} at ${locName(p.hex, state)} (cost ${p.cost})`;
    case "build_completed": return `Build completed at ${locName(p.hex, state)}: ${ENGINE_CHIPS[p.chipId]?.name || p.chipId}`;
    case "chip_upgraded": return `Chip upgraded at ${locName(p.hex, state)} → ${ENGINE_CHIPS[p.chipId]?.name || p.chipId}`;
    case "chip_dormant": return `Chip ${p.chipId} went dormant${p.ejected ? " (ejected — Loyalty too low)" : " (unpaid upkeep)"}`;
    case "chip_reactivated": return `Chip ${p.chipId} reactivated`;
    case "slider_changed": return `${factionName(state.locations[p.hex]?.controller)} set the build slider at ${locName(p.hex, state)} to ${p.value}`;

    case "research_changed": return `${factionName(p.player)} Research → ${p.research}`;
    case "tech_level_changed": return `${factionName(p.player)} reached Tech Level ${p.techLevel}`;
    case "tech_node_assigned": return `${factionName(p.player)} assigned tech node "${p.node}" — ${techNodeDesc(p.node)}`;
    case "tech_node_lost": return `${factionName(p.player)} LOST tech node "${p.node}" (Tech Level dropped) — was: ${techNodeDesc(p.node)}`;

    case "resource_gained": return `${factionName(p.player)} +${p.amount} ${resourceLabel(p.resource)}${p.source ? ` (${p.source})` : ""}`;
    case "resource_spent": return `${factionName(p.player)} −${Math.abs(p.amount)} ${resourceLabel(p.resource)}${p.source ? ` (${p.source})` : ""}`;
    case "action_spent": return `${factionName(p.player)} spent an Action on ${p.action} (cost ${p.cost ?? 0})`;
    case "stat_modified": return `Stat modifier: ${p.target} ${p.stat} ${p.amount >= 0 ? "+" : ""}${p.amount}`;

    case "standing_changed": return `${factionName(p.faction)} standing toward ${factionName(p.player)} → ${p.value} (Δ${p.delta ?? "set"}, cause: ${p.cause || "?"})`;
    case "track_changed": return `${factionName(p.player)} ${p.track} → ${p.value}`;
    case "menace_changed": return `${factionName(p.player)} Menace → ${p.value} (Δ${p.delta}, cause: ${p.cause || "?"})`;
    case "honor_changed": return `${factionName(p.player)} Honor → ${p.value} (Δ${p.delta}, cause: ${p.cause || "?"})`;
    case "dominion_reached": return `${factionName(p.player)} has every faction allied, sworn or gone — the clock is running`;
    case "dominion_lost": return `${factionName(p.player)} lost their hold — ${p.outstanding?.length || 0} still standing free`;
    case "dominion_won": return `${factionName(p.player)} has taken the continent (${p.by})`;
    case "surprise_attack_honor_lost": return `${factionName(p.attacker)} lost ${p.amount} Honor for a surprise attack on ${factionName(p.target)} (no declared war)`;
    case "territory_trespassed": return `${factionName(p.mover)} trespassed into ${factionName(p.owner)}'s territory at ${p.hex} (Standing −${p.standingHit}, Menace +${p.repHit})`;

    case "war_declared": return `${factionName(p.a)} declared WAR on ${factionName(p.b)}`;
    case "peace_made": return `${factionName(p.a)} and ${factionName(p.b)} made peace`;
    case "pact_formed": return `${factionName(p.a)} and ${factionName(p.b)} formed a pact`;
    case "pact_broken": return `${factionName(p.a)} broke the pact with ${factionName(p.b)}`;
    case "pact_called": return `${factionName(p.caller)} called ${factionName(p.ally)} into their war against ${factionName(p.target)} (honored: ${p.honored})`;
    case "pact_call_honored": return `${factionName(p.ally)} honored ${factionName(p.caller)}'s pact call`;
    case "pact_call_declined": return `${factionName(p.ally)} declined ${factionName(p.caller)}'s pact call`;
    case "pact_call_requested": return `${factionName(p.caller)}'s pact call to ${factionName(p.ally)} is pending`;
    case "mediated": return `${factionName(p.mediator)} mediated between ${factionName(p.a)} and ${factionName(p.b)}`;
    case "denounced": return `${factionName(p.denouncer)} denounced ${factionName(p.target)}`;
    case "deal_proposed": return `${factionName(p.proposer)} proposed a deal to ${factionName(p.recipient)}`;
    case "deal_struck": return `Deal struck: ${factionName(p.proposer)} → ${factionName(p.recipient)}${p.cause ? ` (${p.cause})` : ""}`;
    case "trading_pact_formed": return `${factionName(p.partyA)} and ${factionName(p.partyB)} formed a trading pact`;
    // These three only carry an internal agreement id, not the two factions'
    // ids directly — showing the id rather than guessing names out of it.
    case "trading_pact_suspended": return `Trading pact ${p.agreement} suspended (${p.reason})`;
    case "trading_pact_resumed": return `Trading pact ${p.agreement} resumed`;
    case "trading_pact_dissolved": return `Trading pact ${p.agreement} dissolved (${p.reason})`;
    case "tribute_demanded": return `${factionName(p.demander)} demanded tribute from ${factionName(p.target)}`;
    case "tribute_paid": return `${factionName(p.vassal)} paid ${p.amount} tribute to ${factionName(p.lord)}`;
    case "tribute_refused": return `${factionName(p.target)} refused tribute to ${factionName(p.demander)} (escalation: ${p.escalation})`;
    case "tribute_caved": return `${factionName(p.target)} caved and paid tribute to ${factionName(p.demander)}`;
    case "vassal_established": return `${factionName(p.vassal)} became a vassal of ${factionName(p.lord)}`;
    case "vassal_freed": return `${factionName(p.vassal)} was freed from vassalage`;
    case "vassal_rebelled": return `${factionName(p.vassal)} rebelled against ${factionName(p.lord)}`;
    case "coalition_formed": return `A coalition formed against ${factionName(p.target)}: ${(p.members || []).map(factionName).join(", ")}`;
    case "coalition_dissolved": return `The coalition against ${factionName(p.target)} dissolved`;
    // These two only carry an internal agreement id + the new state, not
    // the two factions' ids directly.
    case "open_borders_toggled": return `Open borders (${p.agreement}) set to ${p.on}`;
    case "allied_vision_toggled": return `Shared vision (${p.agreement}) set to ${p.on}`;
    case "gift_counter_decayed": return `Gift counter decayed: ${factionName(p.fromPid)} → ${factionName(p.toPid)}`;

    case "encounter_delivered": return `${factionName(p.recipient)} encounter "${p.encounter}" → chose "${p.choiceLabel || p.choiceId}"`;
    case "encounter_resolved": return `Encounter "${p.encounter}" resolved for ${factionName(p.recipient)} (choice: ${p.choiceId})`;
    case "encounter_delivery_skipped": return `Encounter delivery skipped (${p.reason}): ${p.encounterId}`;
    case "quest_started": return `Quest started: ${p.questId} (mode: ${p.mode}, claimant: ${factionName(p.claimant)})`;
    case "quest_advanced": return `Quest advanced: ${p.questId} → beat ${p.beatId}`;
    case "quest_completed": return `Quest completed: ${p.questId} (claimant: ${factionName(p.claimant)})`;
    case "deferred_resolved": return `Deferred effect packet resolved: ${p.effectCount} effect(s) (queued round ${p.queuedAt}, due round ${p.dueRound})`;
    case "trigger_fired": return `Trigger fired: ${p.trigger} (strength ${p.strength}, weight ${p.weight}, score ${p.score})`;
    case "hex_explored": return `${factionName(p.faction)} explored ${p.hex}`;

    case "post_built": return `${factionName(p.owner)} built a Listening Post at ${p.hex}`;
    case "post_destroyed": return `Listening Post destroyed at ${p.hex}${p.by ? ` (by ${factionName(p.by)})` : ""}`;
    case "post_dormant": return `${factionName(p.owner)}'s Listening Post at ${p.hex} went dormant (unpaid upkeep)`;
    case "post_paid": return `${factionName(p.owner)}'s Listening Post upkeep paid at ${p.hex}`;
    case "post_revealed": return `Listening Post at ${p.hex} revealed to ${factionName(p.faction)} (owner: ${factionName(p.owner)}, cause: ${p.cause || "?"})`;

    case "card_played": return `${factionName(p.player)} played ${p.cardId}`;
    case "card_entered_zone": return `Card ${p.card} entered zone ${p.zone}`;
    case "card_left_zone": return `Card ${p.card} left zone ${p.zone}`;
    case "card_revealed": return `Card revealed: ${p.card || p.uid}`;
    case "obstacle_claimed": return `Obstacle claimed: ${dumpPayload(p)}`;
    case "reward_granted": return `Reward granted: ${dumpPayload(p)}`;

    default:
      // Deliberately not throwing/logging-to-console here: an unknown
      // event type should still show up in the export (that's the whole
      // point — nothing silently dropped), just without bespoke phrasing.
      return `${ev.name}: ${dumpPayload(p)}`;
  }
}

function playerSummaryBlock(state) {
  const lines = [];
  for (const pid of state.turnOrder) {
    const p = state.players[pid];
    const dial = ENGINE_FACTIONS[pid] || {};
    const wheel = (p.techWheel || []).join(", ") || "(none)";
    lines.push(
      `${factionName(pid)} (${pid})${p.isAI ? " [AI]" : " [Human]"}` +
      (dial.victoryLean ? ` — victoryLean=${dial.victoryLean}, aggression=${dial.aggression}` : "") +
      `\n    VP: ${p.vp}  Scrap: ${p.resource}  Tech Level: ${p.techLevel || 1}  Research: ${p.research || 0}` +
      `\n    Tech wheel: ${wheel}` +
      `\n    Units: ${Object.values(state.units).filter((u) => u.owner === pid).length}`,
    );
  }
  return lines.join("\n");
}

function locationSummaryBlock(state) {
  return Object.values(state.locations)
    .map((loc) => {
      const def = ENGINE_LOCATIONS[loc.locationId];
      const sections = loc.sections.map((s) => (s === "neutral" ? "neu" : factionName(s).slice(0, 3))).join(",");
      return `  ${def?.name || loc.locationId} (${loc.hexId}): controller=${loc.controller ? factionName(loc.controller) : "none"}, sections=[${sections}], loyalty=${loc.loyalty ?? "—"}`;
    })
    .join("\n");
}

// Build the full transcript as one string. Pure function — no DOM/browser
// APIs — so it's independently testable and reusable (e.g. from a CLI).
export function buildGameLogText(state) {
  const header = [
    "=== ASHLAND CONQUEST — PLAYTEST LOG ===",
    `Exported: ${new Date().toISOString()}`,
    `Round reached: ${state.round}`,
    "Victory: every surviving faction allied, vassal or gone — held for "
      + `${CONFIG.victory.holdRounds} rounds. VP is the closing standing, not a target.`,
    `Winner: ${state.winnerId ? factionName(state.winnerId) : "none — session ended mid-game"}`,
    "",
    "--- Factions ---",
    playerSummaryBlock(state),
    "",
    "--- Locations (final state) ---",
    locationSummaryBlock(state),
    "",
    `--- Event-by-event log (${state.log.length} events, chronological) ---`,
  ].join("\n");

  const body = state.log
    .map((ev, i) => {
      const turnFaction = state.turnOrder[ev.turnIndex] || "?";
      let text;
      try {
        text = formatLine(ev, state);
      } catch (err) {
        // A formatter throwing (e.g. a unit already removed by the time
        // of export) must not lose the line — fall back to a raw dump
        // rather than silently dropping the event from the transcript.
        text = `${ev.name}: ${dumpPayload(ev.payload)} [format error: ${err.message}]`;
      }
      return `[#${i} R${ev.round} ${factionName(turnFaction)}] ${text}`;
    })
    .join("\n");

  return `${header}\n${body}\n`;
}

// Trigger a browser download of the transcript as a .txt file. Pure
// client-side (Blob + object URL + a throwaway <a download>) — works on
// static hosting (GitHub Pages) with no server involved, and matches how
// a file download works on iPad Safari (opens the share/save sheet).
export function downloadGameLog(state) {
  const text = buildGameLogText(state);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ashland-conquest-log-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
