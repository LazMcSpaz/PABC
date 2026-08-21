// A minimal feed that translates the engine's event log into
// human-readable lines. It's the demo's window into the AI's turn —
// without it, AI moves and contests happen invisibly.
import { useEffect, useMemo, useRef, useState } from "react";
import { FACTIONS as UI_FACTIONS, resourceLabel, theme } from "./data.js";
import { describeHex } from "./engineAdapter.js";
import { CHIPS as ENGINE_CHIPS, REACTIVES as ENGINE_REACTIVES } from "../game/content.js";
import { TECH_NODES, TECH_PATHS } from "../game/tech.js";
import { displayName as encounterName } from "./EncounterModal.jsx";
import { useIsPhone } from "./useViewport.js";

const MAX_ROWS = 14;

function factionName(pid) {
  return UI_FACTIONS[pid]?.short || pid || "—";
}
function factionColor(pid) {
  return UI_FACTIONS[pid]?.color || theme.textDim;
}
// Half the faction short names end in s (Grand Lakers, Free Plainers), and
// `${who(x)}'s` rendered those as "Plainers's".
function possessive(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function formatEvent(ev, engineState) {
  const p = ev.payload || {};
  const who = (id) => factionName(id);
  // The seat this feed is written for. Several §18 events are emitted for
  // every faction pair on the board, and only the ones the player is a party
  // to are news to them — the rest is the Diplomacy drawer's job.
  const you = engineState.humanFactionId;
  const youIn = (a, b) => you && (a === you || b === you);
  const other = (a, b) => (a === you ? b : a);
  const place = (hexId) => describeHex(engineState, hexId);
  const chipName = (chipId) => ENGINE_CHIPS[chipId]?.name || "a chip";
  // Units carry an authored formation name now. A destroyed one is already
  // gone from state by the time the feed formats its death, so fall back
  // rather than assume it is still there.
  const unitName = (uid) => engineState.units?.[uid]?.name || "a unit";
  // Tech nodes are stored as ids (mil-a1); the authored names live on the
  // path, keyed by the id's last two characters — same lookup TechWheel does.
  const techName = (id) => {
    const node = TECH_NODES[id];
    if (!node) return id;
    const path = TECH_PATHS[node.path];
    if (node.layer === 1) return path?.entryName || id;
    return path?.nodes?.[id.slice(-2)]?.name || id;
  };
  switch (ev.name) {
    case "turn_started":
      return { color: factionColor(p.player), text: `${who(p.player)} — turn start` };
    case "unit_moved":
      // `p.from`/`p.to` are board-generation keys (h2-0). Same leak the
      // Economy ledger had: name the place, or describe the ground.
      return { color: factionColor(p.player), text: `${who(p.player)} moved to ${place(p.to)}` };
    case "unit_recruited":
      return { color: factionColor(p.player), text: `${who(p.player)} mustered ${unitName(p.unit)}` };
    case "unit_retreated": {
      const u = engineState.units[p.unit];
      return { color: factionColor(u?.owner), text: `${who(u?.owner)} retreated` };
    }
    case "contest_declared":
      return { color: factionColor(p.player), text: `${who(p.player)} declares contest` };
    case "contest_won":
      return {
        color: factionColor(p.player),
        text: `${who(p.player)} won contest ${p.initiatorTotal} vs ${p.defenderTotal}`,
      };
    case "contest_lost":
      return {
        color: theme.accent2,
        text: `${who(p.player)} lost contest ${p.initiatorTotal} vs ${p.defenderTotal}`,
      };
    case "section_flipped":
      return { color: factionColor(p.to), text: `Section flipped at ${place(p.hex)}${p.to ? ` to ${who(p.to)}` : ""}` };
    case "location_captured":
      // Was re-deriving a display name by camel-splitting the UI id, which
      // printed "dambar" for Dambar. `place()` reads the same authored name
      // the Location window and the map label use.
      return {
        color: factionColor(p.controller),
        text: `${who(p.controller)} captured ${place(p.hex)}`,
      };
    // §3.2 — a city changing hands by treaty. Its own line, because
    // "Omara falls" and "Omara is signed over" read nothing alike, and the
    // second one is the more interesting thing to have happened.
    case "location_ceded":
      return {
        color: factionColor(p.to),
        text: `${who(p.from)} ceded ${place(p.hex)} to ${who(p.to)}`,
      };
    case "location_decayed":
      return { color: theme.accent2, text: `${place(p.hex)} fell to neutral` };
    // §18.2 — the loyalty-failing alert path. Fires before any Control peel
    // so the player has an Upkeep to garrison and halt the bleed.
    case "loyalty_failing": {
      const locName = place(p.hex);
      return {
        color: "#d2453f",
        text: p.peeling
          ? `Loyalty collapsed at ${locName} — Control is peeling to neutral`
          : `Loyalty failing at ${locName} (${p.loyalty}) — garrison it before Control peels`,
      };
    }
    case "control_peeled":
      return { color: theme.accent2, text: `Control peeled to neutral at ${place(p.hex)}` };
    case "loyalty_changed":
      return null; // routine per-Upkeep tick — too chatty for the feed
    case "unit_destroyed":
      return { color: theme.accent2, text: `${who(p.owner)} lost ${unitName(p.unit)}` };
    case "loot_dropped":
      return { color: theme.accent, text: `${(p.chips || []).length} chip(s) dropped at ${place(p.hex)}` };
    case "loot_claimed": {
      const u = engineState.units[p.killer];
      return { color: theme.good, text: `${who(u?.owner)} claimed loot (${(p.chips || []).length})` };
    }
    case "unit_salvaged":
      return { color: theme.textDim, text: `Salvaged ${(p.chips || []).length} chip(s)` };
    case "base_strength_changed":
      return null; // attrition detail lives in the contest overlay
    case "unit_reinforced": {
      const u = engineState.units[p.unit];
      return { color: theme.good, text: `${who(u?.owner)} unit healed +${p.amount}` };
    }
    case "reinforcement_requested":
      return { color: theme.textDim, text: `${who(p.player)} sent reinforcements (ETA ${p.eta})` };
    case "reinforcement_arrived":
      return { color: theme.good, text: `${who(p.player)} reinforcements arrived` };
    case "veteran_promoted": {
      const u = engineState.units[p.unit];
      return { color: theme.accent, text: `${who(u?.owner)} unit promoted to Veteran` };
    }
    case "card_played":
      return {
        color: factionColor(p.player),
        text: `${who(p.player)} played ${ENGINE_REACTIVES[p.cardId]?.name || "a reaction"}`,
      };
    // §20 Economy & City Development
    case "build_completed": {
      const ctrl = engineState.locations[p.hex]?.controller;
      return { color: factionColor(ctrl), text: `${who(ctrl)} built ${chipName(p.chipId)} at ${place(p.hex)}` };
    }
    case "chip_upgraded": {
      const ctrl = engineState.locations[p.hex]?.controller;
      return { color: theme.good, text: `${who(ctrl)} upgraded to ${chipName(p.chipId)}` };
    }
    case "chip_dormant":
      return { color: theme.accent2, text: `${chipName(p.chipId)} ${p.ejected ? "ejected (Loyalty)" : "went dormant (upkeep)"}` };
    case "chip_reactivated":
      return { color: theme.good, text: `${chipName(p.chipId)} reactivated` };
    case "build_started":
    case "slider_changed":
    case "build_priority_changed":
    case "pool_target_changed":
      return null; // directives, not noteworthy outcomes
    // Rail doc §2.2. The transfer itself is routine once set up, so only the
    // INTERRUPTION is news — production that quietly stops arriving is exactly
    // the kind of thing that reads as a bug.
    case "production_pooled":
      return null;
    case "vp_changed": {
      const d = p.to - p.from;
      // Only the direction is news; the running total is on the HUD.
      return { color: d > 0 ? theme.good : theme.accent2,
        text: `${who(p.player)} ${d > 0 ? "+" : ""}${d} VP (now ${p.to})` };
    }
    case "pool_interrupted":
      return { color: theme.accent2, text: `rail pooling cut at ${p.at} — nothing shipped this turn` };
    // Rail doc §3 — blockade lifecycle. `blockade_progressed` is deliberately
    // silent: a bar creeping up every turn is not news.
    case "blockade_started":
      return { color: factionColor(p.owner), text: `${who(p.owner)} broke ground on a blockade` };
    case "blockade_completed":
      return { color: factionColor(p.owner), text: `${who(p.owner)} blockade complete` };
    case "blockade_stalled":
      return { color: theme.accent2, text: `blockade stalled — ${p.reason}` };
    case "blockade_failed":
      return { color: theme.accent2, text: `blockade abandoned — ${p.reason}` };
    case "blockade_destroyed":
      return { color: theme.accent2, text: `${who(p.owner)} blockade destroyed` };
    case "blockade_progressed":
      return null;
    // The mover walked into something it could not see. This NEEDS saying —
    // a unit that stops early with movement still in hand reads as a bug
    // unless the feed explains what stopped it.
    case "advance_checked":
      return {
        color: theme.accent2,
        text: `${who(p.player)} advance checked — ambushed, ${p.moveRemaining} movement left to fall back`,
      };
    case "encounter_delivered":
      return {
        color: factionColor(p.recipient),
        text: `${who(p.recipient)}: ${encounterName(p.encounter)} → ${p.choiceLabel}`,
      };
    case "encounter_resolved":
      return null; // already implied by encounter_delivered
    case "resource_gained":
      if (p.resource === "VP") {
        const label = p.source === "capture"
          ? `+${p.amount} VP (capture)`
          : p.source
            ? `+${p.amount} VP (${p.source})`
            : `+${p.amount} VP`;
        return { color: theme.accent, text: `${who(p.player)} ${label}` };
      }
      if (p.amount >= 5) {
        const label = p.source ? ` (${p.source})` : "";
        return { color: theme.textDim, text: `${who(p.player)} +${p.amount} ${resourceLabel(p.resource)}${label}` };
      }
      return null;
    case "resource_spent":
      return null;
    case "tech_level_changed":
      return { color: theme.accent, text: `${who(p.player)} reached Tech Level ${p.techLevel}` };
    case "tech_node_assigned":
      return { color: theme.good, text: `${who(p.player)} unlocked ${techName(p.node)}` };
    case "tech_node_lost":
      return { color: theme.accent2, text: `${who(p.player)} lost ${techName(p.node)}` };
    case "research_changed":
      return null; // too granular for the feed; the bar shows it
    case "standing_changed": {
      // `faction` is the one whose opinion moved, `player` is who it moved
      // about (standing.js emits `{ faction: a, player: b }` for "a toward
      // b"). The old line read those the wrong way round AND printed the
      // second one as a raw id, so it named the wrong faction in lowercase.
      const holder = p.faction;
      const toward = p.player;
      // Every round driftStanding() nudges EVERY ordered faction pair one
      // step toward its baseline — with 4 majors and 4 minors that is up to
      // 56 lines of pure bookkeeping per round, and it is what buried the
      // first turn of a new game under a dump of pairwise integers between
      // factions the player has not met. It is not news: nobody did
      // anything, the number is just settling.
      if (p.cause === "drift") return null;
      // Politics is public (§18.5) so rival-to-rival shifts aren't hidden —
      // but the feed is the player's own turn narration, not a wire service.
      // Someone else's opinion of a third party belongs in the Diplomacy
      // drawer, which shows the full matrix.
      const you = engineState.humanFactionId;
      if (you && holder !== you && toward !== you) return null;
      const arrow = p.delta > 0 ? "▲" : p.delta < 0 ? "▼" : "→";
      return {
        color: p.delta > 0 ? theme.good : p.delta < 0 ? theme.accent2 : theme.textDim,
        text: holder === you
          ? `Your standing with ${who(toward)} ${arrow} ${p.value}`
          : `${who(holder)}'s standing with you ${arrow} ${p.value}`,
      };
    }
    case "track_changed":
      return {
        color: theme.textDim,
        text: `${who(p.player)} ${String(p.track || "").replace(/^./, (c) => c.toUpperCase())} → ${p.value}`,
      };
    case "quest_started":
    case "quest_advanced":
    case "quest_completed":
      return { color: theme.accent, text: ev.name.replace("_", " ") };
    case "deferred_resolved":
      return { color: theme.textDim, text: "Deferred packet fired" };
    case "round_ended":
      return { color: theme.textFaint, text: `— round ${p.round} ended —` };
    case "turn_ended":
      return null;
    // --- §18 diplomacy ------------------------------------------------
    // Everything from here down used to fall through to `default` and print
    // its raw engine id — `war_declared`, `peace_made`, `vassal_rebelled` and
    // 55 others, straight into the player's feed as snake_case. The whole
    // diplomacy layer narrated itself as debug output.
    case "war_declared":
      return {
        color: theme.accent2,
        text: youIn(p.a, p.b)
          ? `${who(other(p.a, p.b))} DECLARED WAR on you`
          : `${who(p.a)} declared war on ${who(p.b)}`,
      };
    case "peace_made":
      return { color: theme.good, text: `${who(p.a)} and ${who(p.b)} made peace` };
    case "truce_broken":
      return { color: theme.accent2, text: `${who(p.breaker)} broke the truce with ${who(p.victim)}` };
    case "surprise_attack_honor_lost":
      return { color: theme.accent2, text: `${who(p.attacker)} struck ${who(p.target)} undeclared — ${p.amount} Honor` };
    case "pact_formed":
      return { color: theme.good, text: `${who(p.a)} and ${who(p.b)} formed a pact` };
    case "pact_broken":
      return { color: theme.accent2, text: `${who(p.a)} broke the pact with ${who(p.b)}` };
    case "pact_called":
      return {
        color: p.honored ? theme.good : theme.accent2,
        text: `${who(p.caller)} called ${who(p.ally)} against ${who(p.target)} — ${p.honored ? "honored" : "refused"}`,
      };
    case "pact_call_honored":
      return { color: theme.good, text: `${who(p.ally)} answered ${possessive(who(p.caller))} call` };
    case "pact_call_declined":
      return { color: theme.accent2, text: `${who(p.ally)} refused ${possessive(who(p.caller))} call` };
    case "trading_pact_formed":
      return { color: theme.good, text: `${who(p.partyA)} and ${who(p.partyB)} opened a trading pact` };
    case "trading_pact_suspended":
      return { color: theme.textDim, text: `A trading pact is suspended — ${p.reason}` };
    case "trading_pact_resumed":
      return { color: theme.good, text: "A trading pact is running again" };
    case "trading_pact_dissolved":
      return { color: theme.accent2, text: `A trading pact collapsed — ${p.reason}` };
    case "coalition_formed":
      return {
        color: theme.accent2,
        text: p.target === you
          ? `A coalition has formed AGAINST YOU: ${(p.members || []).map(who).join(", ")}`
          : `A coalition formed against ${who(p.target)}`,
      };
    case "coalition_dissolved":
      return { color: theme.textDim, text: `The coalition against ${who(p.target)} dissolved` };
    case "denounced":
      return {
        color: p.warrant ? theme.accent : theme.accent2,
        text: !p.heard
          ? `${who(p.denouncer)} denounced ${who(p.target)} — and nobody listened`
          : p.warrant
            ? `${who(p.denouncer)} denounced ${who(p.target)} — and had grounds`
            : `${who(p.denouncer)} denounced ${who(p.target)} — with nothing to point to`,
      };
    case "attack_unwitnessed":
      if (p.attacker !== you) return null; // you only know about your own
      return {
        color: theme.textDim,
        text: `No one saw that. ${who(p.victim)} did — and will remember it.`,
      };
    case "ultimatum_issued": {
      const what = p.demand?.kind === "tribute" ? `${p.demand.amount} scrap` : "their units out";
      if (p.to === you) return { color: theme.accent2, text: `${who(p.from)} demands ${what} — or else` };
      if (p.from === you) return { color: theme.accent, text: `You have put terms to ${who(p.to)}` };
      return { color: theme.textDim, text: `${who(p.from)} puts terms to ${who(p.to)}` };
    }
    case "ultimatum_complied":
      return {
        color: p.to === you ? theme.textDim : theme.good,
        text: p.to === you ? `You gave in to ${who(p.from)}` : `${who(p.to)} gave in to ${who(p.from)}`,
      };
    case "ultimatum_defied":
      return {
        color: theme.accent2,
        text: p.to === you
          ? `You let ${possessive(who(p.from))} demand stand — their war on you is now righteous`
          : `${who(p.to)} defied ${who(p.from)}`,
      };
    case "ultimatum_bluffed":
      return {
        color: p.from === you ? theme.accent2 : theme.textDim,
        text: p.from === you
          ? `You did not make good on your demand to ${who(p.to)} — the board noticed`
          : `${who(p.from)} backed down from ${who(p.to)}`,
      };
    case "grievance_recorded":
      // Only your own books. Everyone's ledger moving would bury the feed.
      if (p.victim !== you) return null;
      return { color: theme.accent2, text: `You will remember this of ${who(p.offender)}` };
    case "grievances_settled":
      if (p.victim !== you && p.offender !== you) return null;
      return {
        color: theme.good,
        text: `Settled with ${who(p.victim === you ? p.offender : p.victim)} — the books are clear`,
      };
    case "mediated":
      return { color: theme.good, text: `${who(p.mediator)} brokered peace between ${who(p.a)} and ${who(p.b)}` };
    case "vassal_established":
      return { color: theme.accent, text: `${who(p.vassal)} bent the knee to ${who(p.lord)}` };
    case "vassal_rebelled":
      return { color: theme.accent2, text: `${who(p.vassal)} rebelled against ${who(p.lord)}` };
    case "vassal_freed":
      return { color: theme.textDim, text: `${who(p.vassal)} is free of ${who(p.lord)}` };
    case "tribute_demanded":
      return { color: theme.accent2, text: `${who(p.demander)} demanded tribute from ${who(p.target)}` };
    case "tribute_refused":
      return { color: theme.accent2, text: `${who(p.target)} refused ${who(p.demander)}` };
    case "tribute_caved":
      return { color: theme.textDim, text: `${who(p.target)} caved to ${who(p.demander)}` };
    case "tribute_paid":
      return { color: theme.textDim, text: `${who(p.vassal)} paid ${p.amount} scrap to ${who(p.lord)}` };
    case "open_borders_toggled":
      return { color: theme.textDim, text: `Open borders ${p.on ? "granted" : "revoked"}` };
    case "rail_access_toggled":
      return { color: theme.textDim, text: `${who(p.grantor)} ${p.on ? "granted" : "revoked"} ${who(p.rider)} running rights` };
    case "allied_vision_toggled":
      return { color: theme.textDim, text: `Shared vision ${p.on ? "on" : "off"}` };
    case "territory_trespassed":
      // The warning-only variant is the free first step, and it fires on
      // routine border-brushing; only the version that actually costs
      // something is worth a line.
      if (p.warning) return null;
      return { color: theme.accent2, text: `${who(p.mover)} trespassed into ${possessive(who(p.owner))} territory` };
    case "honor_changed":
      if (p.player !== you) return null; // rivals' books are for the Diplomacy drawer
      return { color: p.delta > 0 ? theme.good : theme.accent2, text: `Your Honor ${p.delta > 0 ? "▲" : "▼"} ${p.value}` };
    case "menace_changed":
      if (p.player !== you) return null;
      return { color: p.delta > 0 ? theme.accent2 : theme.good, text: `Your Menace ${p.delta > 0 ? "▲" : "▼"} ${p.value}` };
    // The win condition. These are the three most consequential lines in the
    // feed — someone is about to win, or just has — and every one of them
    // printed its own raw event name until now, because the formatters this
    // replaces were for a Recognition score and a summit dividend that no
    // longer exist.
    case "dominion_reached":
      return {
        color: theme.accent2,
        text: `${who(p.player)} has every faction allied, sworn or gone — the clock is running`,
      };
    case "dominion_lost":
      return {
        color: theme.good,
        text: `${who(p.player)} lost their hold — ${p.outstanding?.length || 0} still standing free`,
      };
    case "dominion_won": {
      const how = {
        conquest: "by conquest — nobody left standing",
        diplomacy: "by treaty — every rival an ally",
        submission: "by submission — every rival sworn",
        mixed: "by war and treaty together",
      }[p.by] || "";
      return { color: theme.accent, text: `${who(p.player)} has taken the continent ${how}` };
    }
    case "faction_eliminated":
      return { color: theme.accent2, text: `${who(p.player)} has been eliminated` };

    // --- structures, supply, chips -------------------------------------
    case "post_built":
      return { color: factionColor(p.owner), text: `${who(p.owner)} built a listening post` };
    case "post_destroyed":
      return { color: theme.accent2, text: `A listening post was destroyed${p.by ? ` by ${who(p.by)}` : ""}` };
    case "post_revealed":
      return { color: theme.accent, text: `${who(p.faction)} uncovered ${possessive(who(p.owner))} listening post` };
    case "post_dormant":
      return { color: theme.accent2, text: `${possessive(who(p.owner))} listening post went dark — upkeep unpaid` };
    case "blockade_dormant":
      return { color: theme.accent2, text: `${possessive(who(p.owner))} blockade went dormant — upkeep unpaid` };
    case "unit_unsupplied":
      return { color: theme.accent2, text: `${who(p.owner)} has a unit out of supply` };
    case "chip_activated":
      return { color: factionColor(p.player), text: `${who(p.player)} activated ${chipName(p.chipId)}` };
    case "chip_granted":
      if (p.player !== you) return null;
      return { color: theme.good, text: `You gained ${chipName(p.chipId)}` };
    case "chip_removed":
      return {
        color: p.stripped ? theme.accent2 : theme.textDim,
        text: `${chipName(p.chipId)} ${p.stripped ? "was stripped" : "was removed"}`,
      };

    // --- combat / map --------------------------------------------------
    case "ambush_triggered":
      return { color: theme.accent2, text: `Ambush — the ${p.side} was concealed` };
    case "garrison_erosion":
      return { color: theme.textDim, text: `${who(p.player)} ground down a garrison by ${p.amount}` };
    case "influence_pressure":
      return { color: theme.accent2, text: `${who(p.owner)} is losing Loyalty to a rival's influence` };
    case "unit_spotted":
      if (p.faction !== you) return null; // you don't get told what rivals can see
      return { color: theme.accent, text: `Spotted ${possessive(who(p.owner))} unit at ${place(p.hex)}` };
    case "unit_lost_sight":
      if (p.faction !== you) return null;
      return { color: theme.textFaint, text: "Lost sight of an enemy unit" };

    case "stat_modified":
    case "action_spent":
    case "reward_granted":
    case "card_entered_zone":
    case "card_left_zone":
    case "card_revealed":
    case "obstacle_claimed":
    case "trigger_fired":
    case "location_spawned":
      return null; // too noisy for the demo feed
    // Bookkeeping the engine has to emit but nobody chose and nobody can
    // act on. Each of these fires per-hex or per-pair every single round —
    // `zone_changed` and `hex_explored` alone can run to dozens of lines a
    // turn — so they belong in the exported playtest log (which keeps every
    // one of them) rather than in a 14-row live ticker.
    case "zone_changed":
    case "hex_explored":
    case "gift_counter_decayed":
    case "standing_baseline_changed":
    case "blockade_paid":
    case "post_paid":
    case "unit_supplied":
    case "encounter_delivery_skipped":
      return null;
    // Deliberately silent: the player already sees these as their own UI.
    // A diplomatic warning arrives as the Envoy audience modal, a pending
    // pact call sits in the Diplomacy drawer's inbox, and an AI's proposal
    // is only news once it is struck.
    case "diplomatic_warning":
    case "pact_call_requested":
    case "deal_proposed":
      return null;
    case "deal_struck":
      return { color: theme.good, text: `${who(p.proposer)} and ${who(p.recipient)} struck a deal` };

    // --- §6.10 the round trip ------------------------------------------
    case "offer_tabled":
      if (p.to !== you) return null; // rival-to-rival tables aren't your post
      return {
        color: theme.accent,
        text: p.isCounter
          ? `${who(p.from)} counter-offers — see Diplomacy`
          : `${who(p.from)} has an offer for you — see Diplomacy`,
      };
    case "offer_accepted":
      return { color: theme.good, text: `Terms agreed with ${who(p.from === you ? p.to : p.from)}` };
    case "offer_declined":
      return { color: theme.textDim, text: `${who(p.to === you ? p.from : p.to)}'s offer declined` };
    case "offer_lapsed":
      if (p.to !== you) return null;
      return { color: theme.textFaint, text: `${who(p.from)}'s offer lapsed` };
    case "offer_pestered":
      if (p.asker !== you) return null;
      return { color: theme.accent2, text: `${who(p.target)} is tired of being asked` };
    case "agreement_expired":
      return {
        color: theme.textDim,
        text: `An agreement with ${who(p.proposer === you ? p.recipient : p.proposer)} ran its term`,
      };
    default:
      return { color: theme.textFaint, text: ev.name };
  }
}

export default function EventFeed({ engineState, tick, topOffset = 14 }) {
  const isPhone = useIsPhone();
  // Pull every event from the engine log; format the visible ones; keep
  // only the tail. The component re-runs on every tick bump so AI turns
  // surface immediately.
  const rows = useMemo(() => {
    const out = [];
    const log = engineState.log || [];
    for (let i = Math.max(0, log.length - 80); i < log.length; i++) {
      const f = formatEvent(log[i], engineState);
      if (f) out.push({ ...f, idx: i });
    }
    return out.slice(-MAX_ROWS);
    // tick is the actual dep — engineState is mutable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const scrollRef = useRef(null);
  // Pin to bottom — newest events at the foot of the feed.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  return (
    <div
      style={{
        position: "absolute",
        top: topOffset,
        right: isPhone ? 8 : 14,
        width: isPhone ? 170 : 270,
        maxHeight: isPhone ? 130 : 260,
        background: "rgba(20, 17, 13, 0.92)",
        border: `1px solid ${theme.border}`,
        borderRadius: 7,
        boxShadow: theme.shadow,
        display: "flex",
        flexDirection: "column",
        zIndex: 6,
      }}
    >
      <div
        style={{
          padding: "6px 11px",
          fontFamily: theme.fontDisplay,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: theme.textFaint,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        Event log
      </div>
      <div
        ref={scrollRef}
        className="pc-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 11px 8px",
          fontSize: 10.5,
          lineHeight: 1.45,
        }}
      >
        {rows.length === 0 && (
          <div style={{ color: theme.textFaint, fontStyle: "italic" }}>(no events yet)</div>
        )}
        {rows.map((r) => (
          <div key={r.idx} style={{ color: r.color }}>
            {r.text}
          </div>
        ))}
      </div>
    </div>
  );
}
