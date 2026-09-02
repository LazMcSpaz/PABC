// What just happened, read back to the player.
//
// Every encounter and every quest beat used to end the moment a choice was
// clicked: the modal closed, effects ran silently, and the only trace was a
// line or two in the feed — which scrolls, and which does not say WHY. A
// playtest of q_massacre made the shape of the hole obvious: the player
// challenged the compound, lost the narrative contest, and watched a unit
// disappear with no roll shown and no closing text. The engine had resolved
// everything correctly. None of it was legible.
//
// So a resolution now has an aftermath, and this module builds it. The
// engine's own event log is the source: capture `state.log.length` before
// applying a choice, slice afterwards, and hand the slice here. Nothing new
// is invented — this reads what the effects already emitted, which means an
// encounter that grows a new effect narrates itself without touching the UI.
import { FACTIONS as UI_FACTIONS, resourceLabel, theme } from "./data.js";
import { describeHex } from "./engineAdapter.js";
import { CHIPS as ENGINE_CHIPS } from "../game/content.js";

const factionName = (pid) => UI_FACTIONS[pid]?.short || pid || "someone";

/**
 * Fold the events emitted while a choice resolved into something showable.
 *
 * @param events  the slice of `state.log` produced by the resolution
 * @param state   the live engine state (for names — read only)
 * @param youId   the player whose card this was
 * @returns { contest, roll, lines[] }
 */
export function summarizeResolution(events, state, youId) {
  let contest = null;
  let roll = null;
  const lines = [];
  // A unit reduced to nothing and then destroyed emits both events. The kill
  // is the thing that happened; the strength line is its arithmetic.
  const destroyed = new Set(
    events.filter((e) => e.name === "unit_destroyed").map((e) => e.payload?.unit),
  );

  const push = (tone, text) => {
    if (text && !lines.some((l) => l.text === text)) lines.push({ tone, text });
  };
  const place = (hex) => {
    try { return describeHex(state, hex); } catch { return hex; }
  };

  for (const ev of events) {
    const p = ev.payload || {};
    // Every event the switch does not name is bookkeeping as far as this card
    // is concerned — the quest's own advance, ZoC churn, the move that got
    // the unit here, a dozen kinds of recompute. The list below is the whole
    // vocabulary of the aftermath, deliberately: an event earns a line by
    // being added here, not by existing.
    switch (ev.name) {
      // --- the two authored resolution primitives ---------------------
      case "narrative_contest_resolved":
        contest = {
          own: p.own || 0, ally: p.ally || 0, opponent: p.opponent || 0,
          die: p.die, opponentDie: p.opponentDie, sides: p.sides || 6,
          total: p.total, against: p.against, won: !!p.won,
        };
        break;
      case "roll_resolved":
        roll = {
          roll: p.roll, sides: p.sides || 100, chance: p.chance || 0,
          success: !!p.success, modifiedBy: p.modifiedBy || null,
        };
        break;

      // --- consequences -----------------------------------------------
      case "resource_gained":
        if (p.player !== youId) break;
        push("good", `+${p.amount} ${resourceLabel(p.resource)}`);
        break;
      case "resource_spent":
        if (p.player !== youId) break;
        push("bad", `−${Math.abs(p.amount)} ${resourceLabel(p.resource)}`);
        break;
      case "standing_changed": {
        // `faction` holds the opinion, `player` is who it is about. Only the
        // pairs the player is party to belong on their own card.
        if (p.cause === "drift") break;
        if (p.faction !== youId && p.player !== youId) break;
        const other = p.faction === youId ? p.player : p.faction;
        const dir = p.delta > 0 ? "▲" : p.delta < 0 ? "▼" : "→";
        push(p.delta > 0 ? "good" : p.delta < 0 ? "bad" : "flat",
          `Standing with ${factionName(other)} ${dir} ${p.value}`);
        break;
      }
      case "track_changed": {
        if (p.player !== youId) break;
        const name = String(p.track || "").replace(/^./, (c) => c.toUpperCase());
        push(p.delta > 0 ? "good" : p.delta < 0 ? "bad" : "flat",
          `${name} → ${p.value}`);
        break;
      }
      case "menace_changed":
        if (p.player !== youId) break;
        push(p.delta > 0 ? "bad" : "good", `Menace → ${p.value}`);
        break;
      case "honor_changed":
        if (p.player !== youId) break;
        push(p.delta > 0 ? "good" : "bad", `Honor → ${p.value}`);
        break;
      case "base_strength_changed": {
        if (destroyed.has(p.unit)) break; // the kill line says it better
        const u = state.units?.[p.unit];
        if (u && u.owner !== youId) break;
        const name = u?.name || "Your unit";
        push(p.amount < 0 ? "bad" : "good",
          `${name} ${p.amount < 0 ? "−" : "+"}${Math.abs(p.amount)} Strength`);
        break;
      }
      case "unit_destroyed":
        push("bad", p.owner === youId ? "Your unit was destroyed" : `${factionName(p.owner)} lost a unit`);
        break;
      case "unit_seconded":
        if (p.player !== youId) break;
        push("bad", `A unit is away for ${p.rounds} round${p.rounds === 1 ? "" : "s"}`);
        break;
      case "unit_returned":
        if (p.player !== youId) break;
        push("good", "A seconded unit returned");
        break;
      case "unit_recruited":
        if (p.player !== youId) break;
        push("good", "A unit joined you");
        break;
      case "loot_dropped":
        push("flat", `Kit left behind at ${place(p.hex)}`);
        break;
      case "chip_granted": {
        if (p.player !== youId) break;
        const name = ENGINE_CHIPS[p.chipId]?.name || "equipment";
        push("good", p.installed ? `Fitted ${name}` : `${name} to collect`);
        break;
      }
      case "chip_removed":
        push("bad", "Equipment lost");
        break;
      case "movement_overridden":
        if (p.player !== youId) break;
        push("bad", `Movement capped at ${p.value} ${p.when === "next_turn" ? "next turn" : "this turn"}`);
        break;
      case "safe_passage_granted":
        if (p.player !== youId) break;
        push("good", `Safe passage through ${(p.factions || []).map(factionName).join(", ")}`);
        break;
      case "tech_level_changed":
        if (p.player !== youId) break;
        push("good", `Tech Level ${p.techLevel}`);
        break;
      case "tech_node_assigned":
        if (p.player !== youId) break;
        push("good", "A tech node opened");
        break;
      case "deck_peeked":
        if (p.player !== youId) break;
        push("flat", "You know what is coming");
        break;
      // A "discovered" beat is placed on the map rather than delivered, so
      // without this the trail simply goes quiet: the quest continues, and
      // nothing on screen says where.
      //
      // "Where" is the whole point, and this line used not to say it — which
      // was fair enough while the board drew no marker, and useless once it
      // did. Now it names the hex when the player has a reason to know, and
      // says nothing at all when they do not: a site nobody has mentioned to
      // you is not news, and announcing it would give away by implication
      // exactly what the marker rule is there to withhold.
      case "location_spawned": {
        if (p.kind !== "encounter-marker") break;
        if (!(p.knownTo || []).includes(youId)) break;
        push("flat", `The trail leads on — ${place(p.hex)} is marked on your map`);
        break;
      }
      // Somebody drew you a map, named a place, or read you the road.
      case "site_revealed":
        if (p.player !== youId) break;
        push("good", `You know where to find ${place(p.hex)} now`);
        break;
      case "deferred_resolved":
        push("flat", "Something set in motion earlier came due");
        break;
      case "quest_completed":
        push("flat", "This is where it ends");
        break;
      case "section_flipped":
      case "location_captured":
        push(p.to === youId || p.controller === youId ? "good" : "flat",
          `Ground changed hands at ${place(p.hex)}`);
        break;
      case "war_declared": {
        // diplomacy.js emits the pair as `a` (aggressor) and `b`.
        if (p.a !== youId && p.b !== youId) break;
        push("bad", p.a === youId
          ? `You are at war with ${factionName(p.b)}`
          : `${factionName(p.a)} declared war on you`);
        break;
      }
      case "peace_made":
        push("good", "Peace was made");
        break;
      default:
        break;
    }
  }
  return { contest, roll, lines };
}

export const TONE_COLOR = {
  good: theme.good,
  bad: theme.accent2,
  flat: theme.textDim,
};
