// A minimal feed that translates the engine's event log into
// human-readable lines. It's the demo's window into the AI's turn —
// without it, AI moves and contests happen invisibly.
import { useEffect, useMemo, useRef, useState } from "react";
import { FACTIONS as UI_FACTIONS, theme } from "./data.js";
import { engineLocationIdToUi } from "./engineAdapter.js";

const MAX_ROWS = 14;

function factionName(pid) {
  return UI_FACTIONS[pid]?.short || pid || "—";
}
function factionColor(pid) {
  return UI_FACTIONS[pid]?.color || theme.textDim;
}

function formatEvent(ev, engineState) {
  const p = ev.payload || {};
  const who = (id) => factionName(id);
  switch (ev.name) {
    case "turn_started":
      return { color: factionColor(p.player), text: `${who(p.player)} — turn start` };
    case "unit_moved": {
      const u = engineState.units[p.unit];
      return { color: factionColor(u?.owner), text: `${who(u?.owner)} moved ${p.from} → ${p.to}` };
    }
    case "unit_recruited":
      return { color: factionColor(p.player), text: `${who(p.player)} recruited a unit` };
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
      return { color: factionColor(p.to), text: `Section flipped at ${p.hex}${p.to ? ` to ${who(p.to)}` : ""}` };
    case "location_captured": {
      const hex = engineState.locations[p.hex];
      const locName = hex
        ? engineLocationIdToUi(hex.locationId).replace(/[A-Z]/g, (c) => " " + c)
        : p.hex;
      return {
        color: factionColor(p.controller),
        text: `${who(p.controller)} captured ${locName.trim()}`,
      };
    }
    case "location_decayed":
      return { color: theme.accent2, text: `Location fell to neutral at ${p.hex}` };
    // §18.2 — the loyalty-failing alert path. Fires before any Control peel
    // so the player has an Upkeep to garrison and halt the bleed.
    case "loyalty_failing": {
      const hex = engineState.locations[p.hex];
      const locName = (hex
        ? engineLocationIdToUi(hex.locationId).replace(/[A-Z]/g, (c) => " " + c)
        : p.hex
      ).trim();
      return {
        color: "#d2453f",
        text: p.peeling
          ? `Loyalty collapsed at ${locName} — Control is peeling to neutral`
          : `Loyalty failing at ${locName} (${p.loyalty}) — garrison it before Control peels`,
      };
    }
    case "control_peeled": {
      const hex = engineState.locations[p.hex];
      const locName = (hex
        ? engineLocationIdToUi(hex.locationId).replace(/[A-Z]/g, (c) => " " + c)
        : p.hex
      ).trim();
      return { color: theme.accent2, text: `Control peeled to neutral at ${locName}` };
    }
    case "loyalty_changed":
      return null; // routine per-Upkeep tick — too chatty for the feed
    case "unit_destroyed":
      return { color: theme.accent2, text: `${who(p.owner)} lost a unit` };
    case "loot_dropped":
      return { color: theme.accent, text: `${(p.chips || []).length} chip(s) dropped at ${p.hex}` };
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
        text: `${who(p.player)} played ${p.cardId}`,
      };
    // §20 Economy & City Development
    case "build_completed": {
      const ctrl = engineState.locations[p.hex]?.controller;
      return { color: factionColor(ctrl), text: `${who(ctrl)} built ${p.chipId}` };
    }
    case "chip_upgraded": {
      const ctrl = engineState.locations[p.hex]?.controller;
      return { color: theme.good, text: `${who(ctrl)} upgraded → ${p.chipId}` };
    }
    case "chip_dormant":
      return { color: theme.accent2, text: `${p.chipId} ${p.ejected ? "ejected (Loyalty)" : "went dormant (upkeep)"}` };
    case "chip_reactivated":
      return { color: theme.good, text: `${p.chipId} reactivated` };
    case "build_started":
    case "slider_changed":
      return null; // directives, not noteworthy outcomes
    case "encounter_delivered":
      return {
        color: factionColor(p.recipient),
        text: `${who(p.recipient)} encounter: ${p.encounter} → ${p.choiceLabel}`,
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
        return { color: theme.textDim, text: `${who(p.player)} +${p.amount} ${p.resource.toLowerCase()}${label}` };
      }
      return null;
    case "resource_spent":
      return null;
    case "tech_level_changed":
      return { color: theme.accent, text: `${who(p.player)} reached Tech Level ${p.techLevel}` };
    case "tech_node_assigned":
      return { color: theme.good, text: `${who(p.player)} unlocked ${p.node}` };
    case "tech_node_lost":
      return { color: theme.accent2, text: `${who(p.player)} lost tech node ${p.node}` };
    case "research_changed":
      return null; // too granular for the feed; the bar shows it
    case "standing_changed":
      return {
        color: theme.textDim,
        text: `${who(p.player)} standing w/ ${p.faction} → ${p.value}`,
      };
    case "track_changed":
      return {
        color: theme.textDim,
        text: `${who(p.player)} ${p.track} → ${p.value}`,
      };
    case "quest_started":
    case "quest_advanced":
    case "quest_completed":
      return { color: theme.accent, text: ev.name.replace("_", " ") };
    case "deferred_resolved":
      return { color: theme.textDim, text: "Deferred packet fired" };
    case "deferred_cancelled":
      return {
        color: theme.textDim,
        text: p?.reason === "unit_left_hex"
          ? "Encounter cancelled — unit left the hex"
          : "Deferred packet cancelled (anchor lost)",
      };
    case "round_ended":
      return { color: theme.textFaint, text: `— round ${p.round} ended —` };
    case "turn_ended":
      return null;
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
    default:
      return { color: theme.textFaint, text: ev.name };
  }
}

export default function EventFeed({ engineState, tick }) {
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
        top: 14,
        right: 14,
        width: 270,
        maxHeight: 260,
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
