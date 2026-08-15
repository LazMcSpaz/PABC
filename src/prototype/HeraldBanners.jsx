// Herald callouts — big transient banners that telegraph the political
// moves happening around the player (AI wars, pacts, betrayals, coalitions,
// how the powers' regard for you shifts). The EventFeed ticker keeps the
// full record; the herald carries only the moves worth interrupting for.
import React from "react";
import { factionDef } from "../game/content.js";
import { standingTier } from "../game/standing.js";
import { C } from "./HudChrome.jsx";
// A banner whose "speaker" is a major carries their portrait; minors (no
// art yet) fall back to the plain banner.
import { DIPLO_PORTRAITS } from "./factionPortraits.js";

const name = (f) => factionDef(f)?.name || f;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Map fresh log entries to banner messages. Moves the HUMAN initiated are
// skipped (they clicked the button — no telegraph needed), as are the
// event echoes of composite moves (the wars/pacts a coalition mints emit
// alongside coalition_formed; one banner covers them).
export function heraldFromLog(entries, youId) {
  const out = [];
  let n = 0;
  const push = (icon, text, tone, speaker) =>
    out.push({ id: `h${Date.now()}-${n++}`, icon, text, tone, portrait: DIPLO_PORTRAITS[speaker] || null });
  for (const e of entries) {
    const p = e.payload || {};
    switch (e.name) {
      case "war_declared":
        if (p.a === youId || p.cause === "coalition") break;
        push("⚔", p.b === youId ? `${name(p.a)} declares war on YOU` : `${name(p.a)} declares war on ${name(p.b)}`, "war", p.a);
        break;
      case "peace_made":
        if (p.a === youId || ["pact-peace", "vassal-peace", "coalition-dissolved"].includes(p.cause)) break;
        push("🕊", `${name(p.a)} and ${name(p.b)} make peace`, "good", p.a);
        break;
      case "pact_formed":
        if (p.a === youId || p.cause === "coalition-bloc") break;
        push("🤝", p.b === youId ? `${name(p.a)} swears a pact with you` : `${name(p.a)} and ${name(p.b)} swear a pact`, p.b === youId ? "good" : "info", p.a);
        break;
      case "pact_broken":
        if (p.a === youId) break;
        push("🗡", p.b === youId ? `${name(p.a)} breaks their pact with YOU` : `${name(p.a)} breaks their pact with ${name(p.b)}`, "war", p.a);
        break;
      case "coalition_formed":
        push("🛡", p.target === youId
          ? `A coalition rises against YOU: ${(p.members || []).map(name).join(", ")}`
          : `A coalition rises against ${name(p.target)}`, p.target === youId ? "war" : "warn", p.target === youId ? null : p.target);
        break;
      case "coalition_dissolved":
        push("🛡", `The coalition against ${p.target === youId ? "you" : name(p.target)} dissolves`, "info");
        break;
      case "vassal_established":
        if (p.lord === youId) break;
        push("⛓", `${name(p.vassal)} bends the knee to ${name(p.lord)}`, "warn", p.lord);
        break;
      case "vassal_rebelled":
        push("🔥", `${name(p.vassal)} rises against ${p.lord === youId ? "YOU" : name(p.lord)}`, p.lord === youId ? "war" : "info");
        break;
      case "vassal_freed":
        if (p.lord === youId) break;
        push("🕊", `${name(p.lord)} frees ${name(p.vassal)}`, "info", p.lord);
        break;
      case "denounced":
        if (p.denouncer === youId) break;
        push("📣", p.target === youId
          ? `${name(p.denouncer)} denounces YOU before the powers`
          : `${name(p.denouncer)} denounces ${name(p.target)}`, p.target === youId ? "warn" : "info", p.denouncer);
        break;
      case "recognition_summit":
        push("★", p.player === youId
          ? `${name(p.backer)} backs your claim — +${p.vp} VP`
          : `${name(p.backer)} backs ${name(p.player)}'s claim — +${p.vp} VP`, p.player === youId ? "good" : "warn", p.backer);
        break;
      case "pact_call_requested":
        if (p.ally === youId) push("📯", `${name(p.caller)} calls you to war against ${name(p.target)}`, "warn", p.caller);
        break;
      case "tribute_demanded":
        if (p.target === youId) push("💰", `${name(p.demander)} demands tribute from you`, "warn", p.demander);
        break;
      case "territory_trespassed": {
        // Only the human's own incursions banner (the map ring is the cue
        // for everyone else's). Warning first, citations as they escalate.
        if (p.mover !== youId) break;
        if (p.warning) {
          push("⚠", `${name(p.owner)} warns you: withdraw from their territory`, "warn", p.owner);
        } else if (p.repHit > 0) {
          push("🚫", `${name(p.owner)} treats your incursion as a hostile probe`, "war", p.owner);
        } else {
          push("🚫", `${name(p.owner)} cites your trespass — standing suffers`, "warn", p.owner);
        }
        break;
      }
      // NOTE: `diplomatic_warning` deliberately has no banner — it opens
      // the envoy audience (EnvoyModal), which the player answers. A
      // banner too would double-notify the same event.
      case "truce_broken":
        if (p.breaker === youId) break;
        push("🩸", p.victim === youId
          ? `${name(p.breaker)} breaks the truce with YOU`
          : `${name(p.breaker)} breaks their truce with ${name(p.victim)}`, "war", p.breaker);
        break;
      case "standing_changed": {
        // Tier crossings TOWARD the human only — "how they see you" shifts.
        if (p.player !== youId || p.faction === youId || p.delta == null) break;
        const prev = standingTier(p.value - p.delta);
        const now = standingTier(p.value);
        if (prev === now) break;
        const warmer = p.delta > 0;
        push(warmer ? "▲" : "▼", `${name(p.faction)} now regards you as ${cap(now)}`, warmer ? "good" : "warn", p.faction);
        break;
      }
      default: break;
    }
  }
  return out;
}

const TONE = {
  war: { border: "#d2453f", glow: "rgba(210,69,63,0.35)", text: "#ffb4ae" },
  good: { border: "#5fc27a", glow: "rgba(95,194,122,0.3)", text: "#c9f0d4" },
  warn: { border: "#c9b24e", glow: "rgba(201,178,78,0.3)", text: "#efe3ae" },
  info: { border: "#56d3c6", glow: "rgba(86,211,198,0.25)", text: "#c8f4ee" },
};

export function HeraldLayer({ banners, onDismiss, topOffset = 74 }) {
  if (!banners.length) return null;
  return (
    <div style={{
      position: "fixed", top: topOffset, left: "50%", transform: "translateX(-50%)",
      zIndex: 120, display: "flex", flexDirection: "column", gap: 6,
      alignItems: "center", pointerEvents: "none", width: "min(92vw, 520px)",
    }}>
      <style>{`@keyframes herald-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }`}</style>
      {banners.map((b) => {
        const t = TONE[b.tone] || TONE.info;
        return (
          <div
            key={b.id}
            onClick={() => onDismiss?.(b.id)}
            title="Dismiss"
            style={{
              pointerEvents: "auto", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10,
              padding: b.portrait ? "6px 16px 6px 6px" : "8px 16px", borderRadius: 7,
              border: `1px solid ${t.border}`,
              background: "linear-gradient(180deg, rgba(12,22,23,0.94), rgba(6,13,14,0.94))",
              boxShadow: `0 4px 18px rgba(0,0,0,0.55), 0 0 18px ${t.glow}`,
              fontFamily: C.font, color: t.text, fontSize: 12.5, fontWeight: 700,
              letterSpacing: 0.8, textTransform: "uppercase", textAlign: "center",
              animation: "herald-in 240ms ease-out",
            }}
          >
            {b.portrait && (
              <img
                src={b.portrait.src}
                alt=""
                style={{
                  width: 44, height: 44, borderRadius: 6, flexShrink: 0,
                  objectFit: "cover", objectPosition: b.portrait.pos,
                  border: `1px solid ${t.border}88`,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
                }}
              />
            )}
            <span style={{ fontSize: 15 }}>{b.icon}</span>
            <span>{b.text}</span>
          </div>
        );
      })}
    </div>
  );
}
