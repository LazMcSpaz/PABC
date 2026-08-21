// Shared HUD visual language (radial / holographic "beat-up tech").
// Pure presentational components — every value and handler arrives via
// props so the same chrome drives both the live game (Prototype.jsx) and
// the static look-pass (HudShowcase.jsx).
import { useEffect, useState } from "react";
import { CONFIG } from "../game/config.js";
import { motion, useDragControls } from "framer-motion";
import ControlMeter from "./ControlMeter.jsx";
import { useIsPhone, useViewportSize } from "./useViewport.js";
import { ownerColor } from "./data.js";

// Close the active modal on Escape.
export function useEscClose(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

// --- palette -----------------------------------------------------------
export const C = {
  steelHi: "#525a62",
  steel: "#3a4047",
  steelLo: "#262b30",
  copper: "#c07c38",
  copperHi: "#eaa758",
  copperLo: "#774421",
  holo: "#56d3c6",
  holoHi: "#8ff6ea",
  gold: "#e8b53f",
  red: "#d2453f",
  text: "#ece3d2",
  textDim: "#9aa1a8",
  textFaint: "#6b727a",
  font: "'Oswald','Arial Narrow',system-ui,sans-serif",
};

const A = import.meta.env.BASE_URL;
export const ICON = {
  scrap: `${A}assets/ui/icons/resources/scrap_icon.png`,
  research: `${A}assets/ui/icons/resources/research_icon.png`,
  units: `${A}assets/ui/icons/resources/unit_icon.png`,
  vp: `${A}assets/ui/icons/resources/player_victory_points_icon.png`,
  shield: `${A}assets/ui/icons/stats/garrison_icon.png`,
  diplomacy: `${A}assets/ui/icons/actions/diplomacy_icon.png`,
};

// --- geometry (angles from 12 o'clock, clockwise) ----------------------
function pt(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
// `gapPx` insets each radial edge by a constant *linear* distance, so the gap
// between adjacent segments is the same width at every radius instead of
// tapering toward the center. A linear inset maps to a different angle at each
// radius: halfAngle(r) = (gapPx / 2) / r (radians).
function donut(cx, cy, ri, ro, a0, a1, gapPx = 0) {
  const degO = gapPx ? ((gapPx / 2 / ro) * 180) / Math.PI : 0;
  const degI = gapPx ? ((gapPx / 2 / ri) * 180) / Math.PI : 0;
  const oa0 = a0 + degO, oa1 = a1 - degO;
  const ia0 = a0 + degI, ia1 = a1 - degI;
  const [ox0, oy0] = pt(cx, cy, ro, oa0);
  const [ox1, oy1] = pt(cx, cy, ro, oa1);
  const [ix1, iy1] = pt(cx, cy, ri, ia1);
  const [ix0, iy0] = pt(cx, cy, ri, ia0);
  const large = (oa1 - oa0 + 360) % 360 > 180 ? 1 : 0;
  return (
    `M ${ox0.toFixed(2)} ${oy0.toFixed(2)} ` +
    `A ${ro} ${ro} 0 ${large} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)} ` +
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)} ` +
    `A ${ri} ${ri} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`
  );
}
function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// =======================================================================
// HoloSegments — translucent holographic donut slices sharing a center.
// =======================================================================
function HoloSegments({ svgW, svgH, cx, cy, ri, ro, accent = C.holo, segments, prominent = false, hub, offset = { left: 0, top: 0 }, gapPx = 8 }) {
  const [hover, setHover] = useState(-1);
  const edge = prominent ? 2 : 1.4;
  const glow = prominent ? 9 : 4;
  const gid = `holo-${accent.slice(1)}-${cx}-${cy}-${ro}`;
  return (
    <div style={{ position: "absolute", ...offset, width: svgW, height: svgH }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id={gid} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={ro} fx={cx} fy={cy}>
            <stop offset="0%" stopColor={accent} stopOpacity="0.04" />
            <stop offset="62%" stopColor={accent} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.05" />
          </radialGradient>
          <radialGradient id={`${gid}-hi`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={ro} fx={cx} fy={cy}>
            <stop offset="0%" stopColor={accent} stopOpacity="0.12" />
            <stop offset="62%" stopColor={accent} stopOpacity="0.40" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.16" />
          </radialGradient>
        </defs>
        {segments.map((s, i) => {
          const on = hover === i;
          return (
            <path
              key={i}
              d={donut(cx, cy, ri, ro, s.a0, s.a1, gapPx)}
              fill={`url(#${on ? `${gid}-hi` : gid})`}
              stroke={on ? C.holoHi : accent}
              strokeWidth={on ? edge + 1 : edge}
              opacity={on ? 1 : 0.85}
              style={{ cursor: s.onClick ? "pointer" : "default", filter: prominent ? `drop-shadow(0 0 ${on ? glow + 9 : glow}px ${accent}) drop-shadow(0 0 ${on ? 30 : 16}px ${accent}99)` : `drop-shadow(0 0 ${on ? glow + 6 : glow}px ${accent}${on ? "" : "88"})`, transition: "opacity .12s ease, filter .12s ease, stroke-width .12s ease" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
              onClick={s.onClick}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={ro} fill="none" stroke={accent} strokeWidth="0.6" opacity="0.35" />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      </svg>
      {segments.map((s, i) => {
        const on = hover === i;
        const mid = (s.a0 + s.a1) / 2;
        const [x, y] = pt(cx, cy, (ri + ro) / 2, mid);
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
            onClick={s.onClick}
            style={{ position: "absolute", left: x, top: y, transform: on ? "translate(-50%,-50%) scale(1.12)" : "translate(-50%,-50%)", transition: "transform .14s cubic-bezier(.2,.9,.3,1.4)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, pointerEvents: s.onClick ? "auto" : "none", cursor: s.onClick ? "pointer" : "default", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}
          >
            {s.icon && (
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: Math.round((s.iconSize || 30) * 1.42), height: Math.round((s.iconSize || 30) * 1.42), borderRadius: "50%", background: "radial-gradient(circle at 50% 40%, rgba(19,42,44,0.96), rgba(4,10,11,0.97))", border: `1px solid ${on ? C.holoHi : accent}`, boxShadow: on ? `0 0 16px ${accent}, inset 0 0 10px ${accent}30` : `0 0 9px ${accent}55, inset 0 0 8px rgba(0,0,0,0.5)`, transition: "box-shadow .14s ease, border-color .14s ease" }}>
                <img src={s.icon} alt="" style={{ width: s.iconSize || 30, height: s.iconSize || 30, objectFit: "contain", filter: on ? "brightness(1.25)" : "brightness(1.05)", transition: "filter .14s ease" }} />
              </span>
            )}
            {s.value != null && s.value !== "" && <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: s.valueSize || 18, color: C.text, lineHeight: 1 }}>{s.value}</span>}
            {s.label && <span style={{ fontSize: 8.5, letterSpacing: 1.5, textTransform: "uppercase", color: on ? C.holoHi : accent, fontWeight: 600, textShadow: on ? `0 0 8px ${accent}` : undefined }}>{s.label}</span>}
          </div>
        );
      })}
      {hub && <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)" }}>{hub}</div>}
    </div>
  );
}

// Per-resource colour identity (used for the slat edge, icon node + value glow).
const RES = {
  scrap: { color: "#e8b53f", icon: ICON.scrap },
  units: { color: "#e8734a", icon: ICON.units },
  tech: { color: C.holo, icon: ICON.research },
};

// A compact resource readout: glowing colour-coded icon node + value + label.
function ResourceCell({ icon, value, label, color, labelColor, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }} title={title}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "radial-gradient(circle at 50% 40%, rgba(19,42,44,0.95), rgba(4,10,11,0.96))", border: `1px solid ${color}`, boxShadow: `0 0 8px ${color}77, inset 0 0 6px rgba(0,0,0,0.5)`, flexShrink: 0 }}>
        <img src={icon} alt="" style={{ width: 18, height: 18, objectFit: "contain", filter: "brightness(1.12)" }} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: 16, color: "#f4efe2", textShadow: `0 0 8px ${color}` }}>{value}</span>
        <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: labelColor || color, fontWeight: 600, marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
}

// A dial paired with a small caption below — the right-side VP / Actions cells.
// §4 of vp-and-actions-design — the per-entity action roster.
//
// The dial's number was always right and always insufficient: "3 actions"
// while the player still had to click every unit and every city to find out
// which three. These are the three. Filled = still has its action; hollow =
// already spent it. Units on the top row, cities beneath, a wildcard row only
// when the player actually holds one.
//
// It marks what is READY rather than what is spent, so the strip empties as
// the turn does — at Upkeep it is full, and by End Turn a glance says whether
// anything was left standing about.
const PIP = 7;

function Pip({ ready, title, color }) {
  return (
    <span
      title={title}
      style={{
        width: PIP, height: PIP, borderRadius: "50%", flexShrink: 0,
        border: `1px solid ${ready ? color : "rgba(207,214,220,0.32)"}`,
        background: ready ? color : "transparent",
        boxShadow: ready ? `0 0 4px ${color}bb` : undefined,
        transition: "background .18s ease, box-shadow .18s ease, border-color .18s ease",
      }}
    />
  );
}

function PipRow({ icon, glyph, pips }) {
  if (!pips.length) return null;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 3, maxWidth: 96, flexWrap: "wrap", height: 10 }}>
      {icon
        ? <img src={icon} alt="" style={{ width: 9, height: 9, objectFit: "contain", opacity: 0.65, marginRight: 1 }} />
        : <span style={{ fontFamily: C.font, fontSize: 9, fontWeight: 700, color: C.textFaint, marginRight: 1, lineHeight: 1 }}>{glyph}</span>}
      {pips}
    </span>
  );
}

function ActionPips({ roster }) {
  if (!roster) return null;
  const unitPips = roster.units.map((u) => (
    <Pip
      key={u.uid}
      ready={u.ready && !u.unsupplied}
      color={C.holo}
      title={u.unsupplied ? `${u.name} — unsupplied, cannot act` : `${u.name} — ${u.ready ? "has an action" : "already acted"}`}
    />
  ));
  // A Logistics Hub city holds two, so a city contributes a pip per action
  // rather than one pip that can only be on or off.
  const locPips = [];
  for (const l of roster.locations) {
    const held = Math.max(1, l.capacity || 1);
    for (let i = 0; i < held; i += 1) {
      locPips.push(
        <Pip
          key={`${l.hexId}-${i}`}
          ready={i < l.ready}
          color={C.holo}
          title={`${l.name} — ${l.ready ? `${l.ready} action${l.ready === 1 ? "" : "s"}` : "already acted"}`}
        />,
      );
    }
  }
  const wildPips = Array.from({ length: roster.wildcards }, (_, i) => (
    <Pip key={`w${i}`} ready color={C.gold} title="A spare action — any unit or city may burn it after its own is gone" />
  ));
  if (!unitPips.length && !locPips.length && !wildPips.length) return null;
  // Its own cell beside the dials rather than a caption beneath one: the top
  // bar is a fixed 60px and a 46px dial already fills it, so anything stacked
  // under the dial spilled out over the Event Log below.
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <PipRow icon={ICON.units} pips={unitPips} />
      <PipRow icon={ICON.shield} pips={locPips} />
      {wildPips.length ? <PipRow glyph="+" pips={wildPips} /> : null}
      <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint, fontWeight: 600 }}>Ready</span>
    </div>
  );
}

function DialCell({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      {children}
      <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// Phone-width HUD is a fixed, deterministic height (no flowing text that
// could change it) so BoardViewport's zoom cluster and EventFeed can
// offset below it without measuring the DOM.
export const COMPACT_HUD_H = 116;

function CompactStat({ icon, value, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <img src={icon} alt="" style={{ width: 15, height: 15, objectFit: "contain", flexShrink: 0 }} />
      <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: 12, color: "#f4efe2", textShadow: `0 0 6px ${color}`, whiteSpace: "nowrap" }}>{value}</span>
    </span>
  );
}

// Compact phone HUD — the ornate flared desktop bar assumes ~700px+ of
// width for its three independently-positioned clusters (resources,
// name, VP/Actions dials); at phone width those clusters collide. This
// swaps to a plain three-row rectangular bar: faction/settings, a row of
// icon+value stats, then a full-width End Turn button underneath.
function CompactTopBar({ scrap, upkeep, units, tech, name, color = C.red, vp, vpGoal, dominion, actions, round, onEndTurn, endDisabled, onSettings }) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: COMPACT_HUD_H, zIndex: 30,
      background: "linear-gradient(180deg, rgba(16,28,29,0.97) 0%, rgba(8,15,16,0.98) 100%)",
      borderBottom: `1px solid ${C.holo}`,
      boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 1px 0 ${C.holo}55`,
      padding: "8px 12px 10px", display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginBottom: 6 }}>
        <button className="hud-int" title="Settings" onClick={onSettings}
          style={{ width: 26, height: 26, borderRadius: "50%", border: `1px solid ${C.holo}`, background: "radial-gradient(circle at 40% 34%, rgba(86,211,198,0.16), rgba(8,16,16,0.9) 78%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: C.holoHi, cursor: "pointer", flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" strokeLinecap="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        </div>
        <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint, flexShrink: 0 }}>Rnd {round}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, height: 26, marginBottom: 8 }}>
        <CompactStat
          icon={ICON.scrap}
          value={upkeep ? `${scrap} (${upkeep.net >= 0 ? "+" : ""}${upkeep.net})` : scrap}
          color={upkeep && upkeep.net < 0 ? C.red : RES.scrap.color}
        />
        <CompactStat icon={ICON.units} value={`${units.n}/${units.cap}`} color={RES.units.color} />
        <CompactStat icon={ICON.research} value={`L${tech.level}`} color={RES.tech.color} />
        <CompactStat icon={ICON.vp} value={dominion ? `${dominion.score}/${dominion.threshold}` : `${vp}`} color={C.gold} />
        <CompactStat icon={ICON.shield} value={`${actions.remaining}/${actions.max}`} color={C.red} />
      </div>
      <button className="hud-int" onClick={endDisabled ? undefined : onEndTurn} disabled={endDisabled}
        style={{ height: 32, fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "#08100f", borderRadius: 7, border: `1px solid ${C.holo}`, background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`, boxShadow: `0 0 12px ${C.holo}55`, cursor: endDisabled ? "not-allowed" : "pointer", opacity: endDisabled ? 0.4 : 1 }}>
        End Turn
      </button>
    </div>
  );
}

// Unified top bar — one flared strip across the top: tall, colour-coded
// resources at the left flare; small faction name + round in the pinched
// centre; VP + Actions dials at the right flare, with End Turn beneath.
// Responsive width via clip-path (% x / px y); a matching SVG strokes the
// glowing edge (non-scaling-stroke keeps the line crisp at any width).
// Below PHONE_MAX_WIDTH the flared multi-cluster layout has nowhere near
// enough room for all three clusters at once (verified: they collide) —
// swap to CompactTopBar instead, same props, same call sites.
export function TopBar(props) {
  const isPhone = useIsPhone();
  if (isPhone) return <CompactTopBar {...props} />;
  return <DesktopTopBar {...props} />;
}

function DesktopTopBar({ scrap, upkeep, units, tech, name, color = C.red, vp, vpGoal, dominion, actions, round, onEndTurn, endDisabled, onSettings }) {
  const H = 60;
  const clip = "polygon(0 0, 100% 0, 100% 60px, 78% 60px, 72% 28px, 28% 28px, 22% 60px, 0 60px)";
  const outline = "M0 0 L100 0 L100 60 L78 60 L72 28 L28 28 L22 60 L0 60 Z";
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: H, zIndex: 30, pointerEvents: "none" }}>
      {/* translucent flared plate */}
      <div style={{ position: "absolute", inset: 0, clipPath: clip, WebkitClipPath: clip, background: "linear-gradient(180deg, rgba(16,28,29,0.95) 0%, rgba(8,15,16,0.96) 100%)", filter: `drop-shadow(0 4px 14px rgba(0,0,0,0.5))` }} />
      {/* glowing edge */}
      <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path d={outline} fill="none" stroke={C.holo} strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${C.holo})` }} />
      </svg>

      {/* left flare — resources */}
      <div style={{ position: "absolute", left: 16, top: 0, height: H, display: "flex", alignItems: "center", gap: 14, pointerEvents: "auto" }}>
        <button className="hud-int" title="Settings" onClick={onSettings}
          style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.holo}`, background: "radial-gradient(circle at 40% 34%, rgba(86,211,198,0.16), rgba(8,16,16,0.9) 78%)", boxShadow: `0 0 8px ${C.holo}55`, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: C.holoHi, cursor: "pointer", flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" strokeLinecap="round" /></svg>
        </button>
        {/* The label carries the NET per turn. Units, blockades, posts and
            some chips all bill every Upkeep, and without a running total a
            player only discovers they overspent when the army starves. */}
        <ResourceCell
          {...RES.scrap}
          value={`${scrap}`}
          label={upkeep ? `Scrap ${upkeep.net >= 0 ? "+" : ""}${upkeep.net}/turn` : "Scrap"}
          labelColor={upkeep && upkeep.net < 0 ? C.red : undefined}
          title={upkeep ? `+${upkeep.income} output · −${upkeep.army} army · −${upkeep.structures} structures · −${upkeep.chips} chips` : undefined}
        />
        <ResourceCell {...RES.units} value={`${units.n}/${units.cap}`} label="Units" />
        <ResourceCell {...RES.tech} value={`L${tech.level}`} label={tech.label} />
      </div>

      {/* centre pinch — faction name + round */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "none" }}>
        <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color, textShadow: `0 0 10px ${color}77, 0 1px 2px rgba(0,0,0,0.7)`, lineHeight: 1, whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ width: 70, height: 1.5, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        {/* Sits directly under the faction name, which throws a wide
            `0 0 10px <color>77` glow. At textFaint over that halo the round
            counter was unreadable at every viewport width — lifted to
            textDim with its own dark shadow to punch back through the glow. */}
        <span style={{ fontFamily: C.font, fontSize: 9.5, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: C.textDim, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>Round {round}</span>
      </div>

      {/* right flare — VP + Actions dials, End Turn beneath */}
      <div style={{ position: "absolute", right: 16, top: 0, height: H, display: "flex", alignItems: "center", gap: 14, pointerEvents: "auto" }}>
        {/* The dial races the WIN CONDITION — how many rivals are dealt with —
            not the score. It used to fill toward a VP threshold that turned
            out not to be a conquest condition at all; VP is the end-of-game
            standing now and nothing fills toward it. */}
        <DialCell label={dominion?.roundsLeft != null ? `${dominion.roundsLeft} to win` : "Dominion"}>
          <Dial
            size={46}
            accent={dominion?.roundsLeft != null ? C.holo : C.gold}
            progress={dominion?.threshold ? dominion.score / dominion.threshold : 0}
            glow={dominion?.met}
          >
            <DialFace
              value={dominion ? `${dominion.score}/${dominion.threshold}` : vp}
              valueColor={dominion?.met ? C.holoHi : C.text}
              valueSize={15}
            />
          </Dial>
        </DialCell>
        <ActionPips roster={actions.roster} />
        <DialCell label="Actions">
          <Dial size={46} accent={C.red} progress={actions.max ? actions.remaining / actions.max : 0} glow>
            <DialFace value={`${actions.remaining}/${actions.max}`} valueColor={C.text} valueSize={15} />
          </Dial>
        </DialCell>
      </div>
      <button className="hud-int" onClick={endDisabled ? undefined : onEndTurn} disabled={endDisabled}
        style={{ position: "absolute", top: H + 4, right: 18, zIndex: 31, pointerEvents: "auto", fontFamily: C.font, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", color: "#08100f", padding: "7px 20px", borderRadius: 7, border: `1px solid ${C.holo}`, whiteSpace: "nowrap", background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`, boxShadow: `0 0 14px ${C.holo}66, 0 4px 10px rgba(0,0,0,0.5)`, cursor: endDisabled ? "not-allowed" : "pointer", opacity: endDisabled ? 0.4 : 1 }}>
        End Turn
      </button>
    </div>
  );
}

// --- dials (top-right) -------------------------------------------------
function Dial({ size = 72, accent = C.holo, progress = null, glow = false, children }) {
  const c = size / 2, rRim = c - 2.5, rGauge = c - 7.5, rFace = c - 11, start = -125, sweep = 250, end = start + sweep;
  const gid = `${accent.slice(1)}-${size}`;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`f${gid}`} cx="42%" cy="36%" r="80%">
            <stop offset="0%" stopColor="#173033" /><stop offset="62%" stopColor="#0e1d1f" /><stop offset="100%" stopColor="#081012" />
          </radialGradient>
          <linearGradient id={`r${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.holoHi} /><stop offset="50%" stopColor={C.holo} /><stop offset="100%" stopColor="#1c4a45" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={rRim} fill="none" stroke={`url(#r${gid})`} strokeWidth="3.4" style={{ filter: `drop-shadow(0 0 5px ${C.holo}88)` }} />
        <circle cx={c} cy={c} r={rRim - 2} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
        <circle cx={c} cy={c} r={rFace} fill={`url(#f${gid})`} stroke="rgba(0,0,0,0.6)" strokeWidth="1" />
        {progress != null && (
          <>
            <path d={arc(c, c, rGauge, start, end)} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="3.2" strokeLinecap="round" />
            <path d={arc(c, c, rGauge, start, start + sweep * Math.max(0.001, Math.min(1, progress)))} fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" className={glow ? "hud-breathe" : undefined} style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
          </>
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>{children}</div>
    </div>
  );
}
function DialFace({ icon, value, sub, valueColor = C.text, iconSize = 26, valueSize = 18 }) {
  return (
    <>
      {icon && <img src={icon} alt="" style={{ width: iconSize, height: iconSize, objectFit: "contain", marginBottom: -1, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))" }} />}
      <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: valueSize, lineHeight: 1, color: valueColor }}>{value}</span>
      {sub && <span style={{ fontSize: 7.5, letterSpacing: 1.3, textTransform: "uppercase", color: C.textFaint, marginTop: 1 }}>{sub}</span>}
    </>
  );
}
// --- bottom-right menu orb + radial menu -------------------------------
// Bottom-right menu button — a clean circular holographic node (the radial
// menu itself opens centred on screen).
export function MenuOrb({ onOpen }) {
  return (
    <button className="hud-int" onClick={onOpen} title="Menu"
      style={{ position: "absolute", right: 22, bottom: 22, zIndex: 28, width: 72, height: 72, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, border: `1.5px solid ${C.holo}`, background: "radial-gradient(circle at 50% 38%, rgba(86,211,198,0.20), rgba(6,14,15,0.92) 72%)", boxShadow: `0 0 16px ${C.holo}66, inset 0 0 12px rgba(86,211,198,0.22)`, color: C.holoHi, cursor: "pointer", padding: 0 }}>
      <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: C.holoHi, boxShadow: `0 0 6px ${C.holo}` }} />)}
      </span>
      <span style={{ fontFamily: C.font, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>MENU</span>
    </button>
  );
}

// A slowly-rotating ticked instrument ring with a brighter sweeping arc —
// idle motion that makes a radial surface feel "live" (refs: the tick rings
// around the HUD dials). Decorative only; never intercepts clicks.
function ScannerRing({ size, accent = C.holo, hi = C.holoHi }) {
  const c = size / 2, r = c - 10, ticks = 72;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={accent} strokeWidth="1" opacity="0.22" />
      <motion.g style={{ transformOrigin: `${c}px ${c}px` }}
        animate={{ rotate: 360 }} transition={{ duration: 30, ease: "linear", repeat: Infinity }}>
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * Math.PI * 2, long = i % 6 === 0;
          const r1 = r - (long ? 8 : 3.5);
          return (
            <line key={i}
              x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)}
              x2={c + r * Math.cos(a)} y2={c + r * Math.sin(a)}
              stroke={accent} strokeWidth={long ? 1.4 : 0.8} opacity={long ? 0.6 : 0.3} />
          );
        })}
      </motion.g>
      <motion.g style={{ transformOrigin: `${c}px ${c}px` }}
        animate={{ rotate: -360 }} transition={{ duration: 14, ease: "linear", repeat: Infinity }}>
        <path d={arc(c, c, r, -26, 26)} fill="none" stroke={hi} strokeWidth="2.4" strokeLinecap="round"
          opacity="0.9" style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />
        <path d={arc(c, c, r, 150, 168)} fill="none" stroke={hi} strokeWidth="2.4" strokeLinecap="round"
          opacity="0.7" style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />
      </motion.g>
    </svg>
  );
}

export function RadialMenu({ items, onPick, onClose }) {
  useEscClose(onClose);
  const { width: vw, height: vh } = useViewportSize();
  const S = Math.min(460, vw * 0.92, vh * 0.72);
  const k = S / 460;
  const c = S / 2, ri = 84 * k, ro = 208 * k;
  const span = 360 / items.length;
  const seg = (i) => ({ a0: -span / 2 + i * span, a1: -span / 2 + (i + 1) * span });
  return (
    <motion.div onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.26, ease: "easeIn" } }} transition={{ duration: 0.18, ease: "easeOut" }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,8,8,0.62)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.84, rotate: -7, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.8, rotate: 8, opacity: 0, transition: { duration: 0.26, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 240, damping: 20, mass: 0.7 }}
        style={{ position: "relative", width: S, height: S }}>
        <div className="hud-glitch" style={{ position: "absolute", inset: 0 }}>
          <ScannerRing size={S} />
          <HoloSegments svgW={S} svgH={S} cx={c} cy={c} ri={ri} ro={ro} accent={C.holo} prominent gapPx={10 * k}
            segments={items.map((it, i) => ({ ...seg(i), icon: it.icon, iconSize: 46 * k, label: it.label, onClick: () => onPick(it.key) }))}
            hub={<span style={{ display: "flex", flexDirection: "column", alignItems: "center", color: C.holoHi }}><span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 3 }}>SELECT</span><span style={{ fontSize: 9, letterSpacing: 1.5, color: C.textFaint }}>tap a sector</span></span>}
          />
          <div className="hud-scanlines" style={{ position: "absolute", left: c - ro, top: c - ro, width: ro * 2, height: ro * 2, borderRadius: "50%" }} />
        </div>
        <CloseX onClose={onClose} style={{ position: "absolute", top: -6, right: -6 }} />
      </motion.div>
    </motion.div>
  );
}

export function CloseX({ onClose, style }) {
  return (
    <button className="hud-int" onClick={onClose} title="Close"
      style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${C.holo}`, cursor: "pointer", background: "radial-gradient(circle at 40% 34%, rgba(86,211,198,0.2), rgba(8,16,16,0.9) 78%)", color: C.holoHi, fontFamily: C.font, fontSize: 18, lineHeight: 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 10px ${C.holo}66`, ...style }}>
      ×
    </button>
  );
}

// --- framed window -----------------------------------------------------
// Angular HUD corner brackets drawn just inside a panel's corners.
export function CornerBrackets({ color = C.holo, len = 16, inset = 7, w = 2 }) {
  const b = { position: "absolute", width: len, height: len, pointerEvents: "none", opacity: 0.85 };
  return (
    <>
      <span style={{ ...b, top: inset, left: inset, borderTop: `${w}px solid ${color}`, borderLeft: `${w}px solid ${color}` }} />
      <span style={{ ...b, top: inset, right: inset, borderTop: `${w}px solid ${color}`, borderRight: `${w}px solid ${color}` }} />
      <span style={{ ...b, bottom: inset, left: inset, borderBottom: `${w}px solid ${color}`, borderLeft: `${w}px solid ${color}` }} />
      <span style={{ ...b, bottom: inset, right: inset, borderBottom: `${w}px solid ${color}`, borderRight: `${w}px solid ${color}` }} />
    </>
  );
}

// Pure-holographic floating window — translucent teal-lit plate, glowing edge,
// corner brackets, scanlines and a spring entrance. Optional title/icon header
// and footer slot. Replaces the old painted-frame image.
// `floating` turns the window from a modal into a movable panel: no scrim, no
// blur, and the board underneath stays live — you can pan, zoom and click hexes
// with a city open. Desktop only, and by choice: on a phone the window is most
// of the screen anyway, so a scrim is the honest thing and there is nowhere to
// drag it to.
export function FrameWindow({ children, onClose, footer, width = 470, title, icon, floating = false }) {
  useEscClose(onClose);
  const dragControls = useDragControls();
  return (
    <motion.div onClick={floating ? undefined : onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.16 }}
      style={{ position: "fixed", inset: 0, zIndex: 58, display: "flex", alignItems: "center",
        // Floating: hug the right edge and let every event fall through to the
        // board. Modal: centred over a scrim that eats them.
        justifyContent: floating ? "flex-end" : "center",
        padding: floating ? "0 22px" : 0,
        pointerEvents: floating ? "none" : "auto",
        background: floating ? "none" : "radial-gradient(ellipse at center, rgba(8,14,14,0.82), rgba(2,5,5,0.93))",
        backdropFilter: floating ? undefined : "blur(3px)" }}>
      <motion.div onClick={(e) => e.stopPropagation()} className="hud-scratch"
        drag={floating} dragControls={dragControls} dragListener={false} dragMomentum={false}
        // Keep it reachable: it may be dragged well off-centre but never
        // entirely off the window.
        dragConstraints={{ left: -window.innerWidth + 120, right: 60, top: -window.innerHeight + 140, bottom: window.innerHeight - 140 }}
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.18, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        style={{ position: "relative", width, maxWidth: "94vw", maxHeight: "88vh", display: "flex", flexDirection: "column",
          pointerEvents: "auto",
          background: "linear-gradient(158deg, rgba(18,31,32,0.97) 0%, rgba(9,17,18,0.98) 58%, rgba(6,11,12,0.99) 100%)",
          border: `1px solid ${C.holo}`, borderRadius: 8,
          boxShadow: `inset 0 0 34px rgba(86,211,198,0.07), 0 0 0 1px rgba(86,211,198,0.12), 0 0 36px rgba(86,211,198,0.22), 0 26px 70px rgba(0,0,0,0.72)` }}>
        <div style={{ position: "absolute", top: 0, left: 20, right: 20, height: 2, background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`, opacity: 0.7, pointerEvents: "none" }} />
        {/* Grab strip. A dedicated handle rather than dragging the whole panel:
            the body holds buttons, a slider and a scroll area, all of which a
            panel-wide drag would fight. */}
        {floating && (
          <div
            onPointerDown={(e) => dragControls.start(e)}
            title="Drag to move"
            style={{ position: "relative", height: 18, flexShrink: 0, cursor: "grab", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 3, touchAction: "none" }}
          >
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 16, height: 2, borderRadius: 1, background: C.holo, opacity: 0.4 }} />
            ))}
          </div>
        )}
        <CornerBrackets />
        <div className="hud-scanlines" style={{ position: "absolute", inset: 0, borderRadius: 8 }} />
        {title != null && (
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "16px 22px 12px", borderBottom: "1px solid rgba(86,211,198,0.22)" }}>
            {icon && <img src={icon} alt="" style={{ width: 32, height: 32, objectFit: "contain", filter: `drop-shadow(0 0 5px ${C.holo}aa)` }} />}
            <div style={{ fontFamily: C.font, fontSize: 23, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: C.text, textShadow: `0 0 10px ${C.holo}55` }}>{title}</div>
          </div>
        )}
        <div className="pc-scroll" style={{ position: "relative", padding: 20, overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{ position: "relative", padding: "12px 20px", borderTop: "1px solid rgba(86,211,198,0.22)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>{footer}</div>
        )}
        <CloseX onClose={onClose} style={{ position: "absolute", top: -14, right: -14 }} />
      </motion.div>
    </motion.div>
  );
}

export function SectionLabel({ children, color = C.holo }) {
  return <div style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color, fontWeight: 600 }}>{children}</div>;
}
function Stat({ icon, value, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img src={icon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontFamily: C.font, fontSize: 19, fontWeight: 700, color: C.text }}>{value}</span>
        <span style={{ fontSize: 8.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint }}>{label}</span>
      </div>
    </div>
  );
}

// Single-window Location view. `view` is a plain object built by the host.
// Rail doc §3 — a blockade's own window, opened by selecting it on the map the
// way a settlement is.
//
// A blockade outlives the unit that raised it, so reaching it through whichever
// unit happens to be parked on it made a structure feel like a unit ability and
// meant you had to keep a soldier standing there to manage one. It is a place.
export function BlockadeWindow({ view, canAct, onClose, onFit }) {
  const v = view;
  const [open, setOpen] = useState(false);
  const floating = !useIsPhone();
  const hair = "1px solid rgba(86,211,198,0.22)";
  const owner = ownerColor(v.owner);
  const note = { fontSize: 10.5, color: C.textFaint, lineHeight: 1.5 };

  const status = !v.done
    ? "Under construction"
    : v.paid ? "Manned" : "Dormant — upkeep unpaid";

  return (
    <FrameWindow
      onClose={onClose}
      floating={floating}
      footer={
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: C.font, fontWeight: 800, fontSize: 22, color: v.done && !v.paid ? C.red : C.gold, lineHeight: 1 }}>
            {v.done ? `${v.upkeep}` : `${Math.floor(v.progress)}/${v.cost}`}
          </span>
          <span style={{ fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: C.holoHi }}>
            {v.done ? "Scrap / turn" : "Built"}
          </span>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontFamily: C.font, fontSize: 28, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.text, lineHeight: 1, textShadow: `0 0 12px ${C.holo}44` }}>
            Blockade
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontFamily: C.font, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#08100f", background: owner, padding: "2px 8px", borderRadius: 3 }}>
              {v.mine ? "Yours" : "Foreign"}
            </span>
            <span style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: v.done && !v.paid ? C.red : C.textDim }}>
              {status}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, padding: "10px 0", borderTop: hair, borderBottom: hair }}>
          <Stat icon={ICON.shield} value={v.defense} label="Defense" />
          <Stat icon={ICON.scrap} value={`−${v.upkeep}`} label="Upkeep / turn" />
          {v.mine && <Stat icon={ICON.units} value={`${v.slotsUsed}/${v.slotCap}`} label="Slots" />}
        </div>

        {!v.done && (
          <div style={note}>
            {v.mine
              ? `Building — ${Math.floor(v.progress)}/${v.cost}. Its builder is pinned here until it lands, and it halts nobody until then.`
              : "Someone else is building here."}
          </div>
        )}

        {v.done && !v.paid && (
          <div style={{ ...note, color: C.red }}>
            Nobody is manning it. It halts no one, sees nothing, collects no toll
            and adds no defense until the arrears are paid.
          </div>
        )}

        {v.mine && v.done && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionLabel>Upgrades</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {v.installed.map((c) => (
                <span key={c.uid} title={c.desc}
                  style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "5px 9px", borderRadius: 5, border: `1px solid ${c.disabled ? C.red : "rgba(86,211,198,0.4)"}`, color: c.disabled ? C.red : C.text }}>
                  {c.name}{c.disabled ? " (dormant)" : ""}
                  {c.upkeep > 0 && <span style={{ color: C.textFaint, fontWeight: 600 }}> · −{c.upkeep}/turn</span>}
                </span>
              ))}
              {v.slotsUsed < v.slotCap && !v.building && (
                <button className="hud-int" disabled={!canAct}
                  onClick={canAct ? () => setOpen((o) => !o) : undefined}
                  style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 5, border: "1px dashed rgba(86,211,198,0.5)", background: "rgba(86,211,198,0.06)", color: C.holoHi, cursor: canAct ? "pointer" : "default" }}>
                  + Fit
                </button>
              )}
            </div>
            {v.building && (
              <div style={note}>
                Fitting {v.building.name} — {Math.floor(v.building.progress)}/{v.building.cost},
                paid out of the settlement down the road.
              </div>
            )}
            {v.supply && !v.supply.ok && (
              <div style={{ ...note, color: C.red }}>
                {v.supply.path ? "Its supply road is cut — nothing reaches it." : "No road back to a settlement you hold."}
              </div>
            )}
            {open && (
              <BuildList
                items={v.chips}
                can={canAct}
                empty="Nothing your Tech Level can fit yet."
                onPick={(chipId) => { onFit?.(chipId); setOpen(false); }}
              />
            )}
          </div>
        )}
      </div>
    </FrameWindow>
  );
}

// The Economy ledger — what everything you hold earns, what everything you
// keep costs, and the net.
//
// This replaces the old Locations list, which named your cities but said
// nothing about them. Since units, blockades, posts and some chips all bill
// every Upkeep, a bare roster answered the wrong question: the one a player
// actually has is "where is my scrap going, and can I afford the next thing".
// Rows still open the thing they name, so it is a list AND a ledger.
export function EconomyLedger({ report, onOpenHex, onOpenUnit }) {
  const r = report;
  const hair = "1px solid rgba(86,211,198,0.22)";
  const row = {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(86,211,198,0.22)",
    background: "rgba(0,0,0,0.25)", color: C.text, textAlign: "left",
  };
  const num = (n, good) => ({
    fontFamily: C.font, fontWeight: 700, fontSize: 14, flexShrink: 0,
    color: n === 0 ? C.textFaint : good ? C.holoHi : C.gold,
  });
  const sub = { fontSize: 9.5, letterSpacing: 0.8, color: C.textFaint };

  const Section = ({ label, total, children }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionLabel>{label}</SectionLabel>
        <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: 12, color: C.textDim }}>{total}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* The bottom line first — it is the thing you opened this for. */}
      <div style={{ display: "flex", gap: 18, padding: "10px 0", borderTop: hair, borderBottom: hair }}>
        <Stat icon={ICON.scrap} value={`+${r.income}`} label="Income / turn" />
        <Stat icon={ICON.units} value={`−${r.upkeep}`} label="Upkeep / turn" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1, alignItems: "flex-end" }}>
            <span style={{ fontFamily: C.font, fontSize: 22, fontWeight: 800, color: r.net < 0 ? C.red : C.holoHi }}>
              {r.net >= 0 ? "+" : ""}{r.net}
            </span>
            <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: r.net < 0 ? C.red : C.holoHi, fontWeight: 600, marginTop: 2 }}>
              Net / turn
            </span>
          </div>
        </div>
      </div>

      <Section label="Settlements" total={`+${r.income - r.tolls}`}>
        {r.locations.length === 0 && (
          <span style={{ color: C.textDim, fontSize: 12 }}>
            You hold no sections yet. Move a unit onto a location and contest it.
          </span>
        )}
        {r.locations.map((l) => (
          <button key={l.hexId} className="hud-int" style={{ ...row, cursor: "pointer" }}
            onClick={() => onOpenHex?.(l.hexId)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 700 }}>{l.name}</span>
              <span style={{ ...sub, display: "block", marginTop: 2 }}>
                {/* Output vs banked: a settlement mid-build keeps only its
                    butter half, and a player reading a low number should see
                    it is a choice, not a loss. */}
                {l.diverting
                  ? `output ${l.output} · ${l.diverting === "building" ? "building" : "pooling"} the rest`
                  : `output ${l.output}`}
                {l.besieged ? " · besieged" : ""}
                {l.chipUpkeep > 0 ? ` · chips −${l.chipUpkeep}` : ""}
              </span>
            </span>
            <span style={num(l.banked, true)}>+{l.banked}</span>
            {l.chipUpkeep > 0 && <span style={num(-l.chipUpkeep, false)}>−{l.chipUpkeep}</span>}
          </button>
        ))}
        {r.tolls > 0 && (
          <div style={{ ...row, cursor: "default" }}>
            <span style={{ flex: 1 }}>
              <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 700 }}>Tolls</span>
              <span style={{ ...sub, display: "block", marginTop: 2 }}>Toll Booths on your blockades</span>
            </span>
            <span style={num(r.tolls, true)}>+{r.tolls}</span>
          </div>
        )}
      </Section>

      <Section label="Standing army" total={`−${r.army}`}>
        {r.units.length === 0 && <span style={{ color: C.textDim, fontSize: 12 }}>No units in the field.</span>}
        {r.units.map((u) => (
          <button key={u.uid} className="hud-int" style={{ ...row, cursor: "pointer" }}
            onClick={() => onOpenUnit?.(u.uid)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 700, color: u.unsupplied ? C.red : C.text }}>
                {u.name}
              </span>
              <span style={{ ...sub, display: "block", marginTop: 2, color: u.unsupplied ? C.red : C.textFaint }}>
                {u.at}{u.unsupplied ? " · UNSUPPLIED — cannot move or act" : ""}
              </span>
            </span>
            <span style={num(-u.upkeep, false)}>−{u.upkeep}</span>
          </button>
        ))}
      </Section>

      {r.structureList.length > 0 && (
        <Section label="Structures" total={`−${r.structures}`}>
          {r.structureList.map((st) => (
            <button key={`${st.kind}-${st.hexId}`} className="hud-int" style={{ ...row, cursor: "pointer" }}
              onClick={() => onOpenHex?.(st.hexId)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 700, color: st.dormant ? C.red : C.text }}>
                  {st.name}
                </span>
                <span style={{ ...sub, display: "block", marginTop: 2, color: st.dormant ? C.red : C.textFaint }}>
                  {st.at || st.hexId}{st.dormant ? " · DORMANT — unpaid, so it does nothing" : ""}
                </span>
              </span>
              <span style={num(-st.upkeep, false)}>−{st.upkeep}</span>
            </button>
          ))}
        </Section>
      )}
    </div>
  );
}

export function LocationWindow({ view, onClose, onActivate, onContest, onRecruit, onBuild, onUpgrade, onRush, onSetSlider, onSetPoolTarget, onSetBuildPriority }) {
  const v = view;
  // On desktop a city is a panel you consult while still working the map, not a
  // modal that takes the screen hostage. On a phone it fills the screen either
  // way, so it stays a modal there.
  const floating = !useIsPhone();
  const hair = "1px solid rgba(86,211,198,0.22)";
  const holoBtn = { fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "#08100f", padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.holo}`, background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`, boxShadow: `0 0 14px ${C.holo}55` };
  return (
    <FrameWindow
      onClose={onClose}
      floating={floating}
      footer={
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {v.loyalty != null && (
              <>
                <span style={{ fontFamily: C.font, fontWeight: 800, fontSize: 24, color: v.loyaltyDanger ? C.red : C.gold, textShadow: "0 0 8px rgba(0,0,0,0.6)", lineHeight: 1 }}>{v.loyalty}/{v.loyaltyMax}</span>
                <span style={{ fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", color: C.holoHi }}>Loyalty</span>
              </>
            )}
          </div>
          {v.contest && (
            <button className="hud-int" onClick={v.contest.canContest ? () => onContest?.({ unit: v.contest.unitId }) : undefined} disabled={!v.contest.canContest}
              style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "#fff", padding: "9px 22px", borderRadius: 7, border: `1px solid ${C.red}`, background: "linear-gradient(180deg, #e2554c, #a3322c)", boxShadow: `0 2px 0 #6e201b, 0 0 14px ${C.red}66`, cursor: v.contest.canContest ? "pointer" : "not-allowed", opacity: v.contest.canContest ? 1 : 0.5 }}>
              Contest
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: C.font, fontSize: 30, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.text, lineHeight: 1, textShadow: `0 0 12px ${C.holo}44` }}>{v.name}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontFamily: C.font, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#08100f", background: v.valueColor || C.copperHi, padding: "2px 8px", borderRadius: 3 }}>{v.valueLabel}</span>
              <span style={{ display: "flex", gap: 2 }}>{Array.from({ length: v.vp }).map((_, i) => <img key={i} src={ICON.vp} alt="" style={{ width: 15, height: 15 }} />)}</span>
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: C.textDim, marginTop: 7 }}>
              {v.statusLabel}
              {/* Still has its action — the same holo dot the board and the
                  HUD's READY strip use. The window is where a city's action
                  is actually spent, so it is the one place that has to say
                  whether there is one left. */}
              {v.actionsReady > 0 && (
                <span style={{ marginLeft: 8, whiteSpace: "nowrap", color: C.holoHi }}>
                  {Array.from({ length: v.actionsReady }, (_, i) => (
                    <span key={i} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.holo, boxShadow: `0 0 5px ${C.holo}`, marginRight: 5, verticalAlign: "middle" }} />
                  ))}
                  {v.actionsReady > 1 ? `${v.actionsReady} actions` : "1 action"}
                </span>
              )}
            </div>
            {v.basis && (
              <div style={{ fontSize: 9.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.textFaint, marginTop: 4 }}>{v.basis}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ filter: `drop-shadow(0 0 8px ${C.holo}55)` }}>
              <ControlMeter sections={v.sections} loyalty={v.loyalty} danger={v.loyaltyDanger} size={56} />
            </div>
            <SectionLabel color={C.textDim}>Control</SectionLabel>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, padding: "10px 0", borderTop: hair, borderBottom: hair }}>
          <Stat icon={ICON.shield} value={v.garrison} label="Garrison" />
          <Stat icon={ICON.scrap} value={`+${v.economy ? v.economy.output : v.production}`} label="Output" />
          <Stat icon={ICON.units} value={v.economy ? `${v.economy.slotsUsed}/${v.economy.slotCapacity}` : v.chipSlots} label="Chip Slots" />
        </div>

        {/* What the place IS, before what it scores. The prose is authored in
            content/locations.csv and reached nothing until now; the nine
            Locations added after that sheet have no line yet and simply
            render without one. */}
        {v.flavour && (
          <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: C.textDim, fontStyle: "italic" }}>
            {v.flavour}
          </p>
        )}

        {v.economy && (
          <EconomyPanel hexId={v.hexId} eco={v.economy} onBuild={onBuild} onUpgrade={onUpgrade} onRush={onRush} onSetSlider={onSetSlider} onSetPoolTarget={onSetPoolTarget} onSetBuildPriority={onSetBuildPriority} />
        )}

        {v.ability && (
          <div>
            <SectionLabel>{v.ability.name}</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.text, flex: 1 }}>{v.ability.text}</p>
              {v.ability.canActivate != null && !v.ability.passiveOnly && (
                <button className="hud-int" onClick={v.ability.canActivate ? () => onActivate?.(v.hexId) : undefined} disabled={!v.ability.canActivate}
                  style={{ flexShrink: 0, ...holoBtn, cursor: v.ability.canActivate ? "pointer" : "not-allowed", opacity: v.ability.canActivate ? 1 : 0.5 }}>
                  {v.ability.usedThisTurn ? "Used" : "Activate"}
                </button>
              )}
            </div>
          </div>
        )}

        {v.recruit && (
          <div>
            <SectionLabel>Recruit</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.textDim, flex: 1 }}>Train a new unit here. Costs {v.recruit.cost} scrap + 1 Action.</p>
              <button className="hud-int" onClick={v.recruit.canAfford ? () => onRecruit?.(v.hexId) : undefined} disabled={!v.recruit.canAfford}
                style={{ flexShrink: 0, ...holoBtn, cursor: v.recruit.canAfford ? "pointer" : "not-allowed", opacity: v.recruit.canAfford ? 1 : 0.5 }}>
                Recruit
              </button>
            </div>
          </div>
        )}

        {v.contest && (
          <div className="pc-prose" style={{ fontSize: 11, lineHeight: 1.5, color: C.textDim, background: "rgba(86,211,198,0.05)", border: hair, borderRadius: 7, padding: "8px 10px" }}>
            <b style={{ color: C.text }}>{v.contest.attackerName}</b> {v.contest.attackerTotal} + 1d6
            <span style={{ color: C.textFaint }}> vs </span>
            <b style={{ color: C.text }}>{v.contest.defenderLabel}</b> {v.contest.defenderValue}{v.contest.defenderRollsDie ? " + 1d6" : " (no roll)"}.
            {v.contest.hasNeutral ? " Neutral sections force the fight onto the garrison." : " Beat the holder to flip a section."}
          </div>
        )}
      </div>
    </FrameWindow>
  );
}

// =======================================================================
// EconomyPanel (§20) — the per-city build interface. The guns/butter slider
// splits Output; an empty slot opens the build menu (§20.6 display contract:
// only Tech-allowed chips, Loyalty-locked ones greyed with a reason); an
// installed chip opens its upgrade view (always shows the next tier, greyed
// if Tech or Loyalty is short). Construction advances at Upkeep; Rush spends
// banked scrap to finish now.
// One installed chip, in a city slot or a unit bay. Clicking a chip that has
// a next tier opens its upgrade view; one with none is inert but still shown,
// because "what is fitted here" is worth reading on its own.
function ChipButton({ chip, can, onClick }) {
  const live = can && !!chip.upgrade;
  return (
    <button
      className="hud-int"
      disabled={!live}
      onClick={live ? onClick : undefined}
      title={chip.upgrade ? `Upgrade → ${chip.upgrade.name}` : "No upgrade"}
      style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "6px 9px", borderRadius: 6, border: `1px solid ${chip.disabled ? C.red : "rgba(86,211,198,0.4)"}`, background: "rgba(0,0,0,0.3)", color: chip.disabled ? C.red : C.text, cursor: live ? "pointer" : "default" }}
    >
      {chip.name}{chip.disabled ? " (dormant)" : ""}
      {chip.upkeep > 0 && (
        <span style={{ color: chip.disabled ? C.red : C.textFaint, fontWeight: 600 }}> −{chip.upkeep}/t</span>
      )}
      {chip.upgrade ? " ▲" : ""}
    </button>
  );
}

// §20.6 display contract, shared by the city build menu and the per-unit
// outfit menu: only Tech-allowed chips appear at all, and anything otherwise
// gated is greyed with the reason rather than hidden — you should be able to
// see what you are working toward.
function BuildList({ items, can, empty, onPick }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(86,211,198,0.3)", borderRadius: 7, padding: 8 }}>
      {items.length === 0 && <div style={{ fontSize: 11, color: C.textFaint }}>{empty}</div>}
      {items.map((b) => {
        const enabled = can && b.buildable;
        return (
          <button key={b.chipId} className="hud-int" disabled={!enabled}
            onClick={enabled ? () => onPick(b.chipId) : undefined}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textAlign: "left", padding: "6px 9px", borderRadius: 5, border: "1px solid rgba(86,211,198,0.25)", background: enabled ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.35)", color: enabled ? C.text : C.textFaint, cursor: enabled ? "pointer" : "not-allowed", opacity: b.locked ? 0.55 : 1 }}>
            <span>
              <b style={{ color: enabled ? C.text : C.textFaint }}>{b.name}</b>
              <span style={{ fontSize: 10, color: C.textFaint }}> · {b.desc}</span>
              {b.reason && <span style={{ fontSize: 9.5, color: C.red }}> · {b.reason}</span>}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <img src={ICON.scrap} alt="" style={{ width: 13, height: 13 }} />
              <span style={{ fontFamily: C.font, fontWeight: 700 }}>{b.cost}</span>
              {/* A chip's price is one payment; its upkeep is every turn after,
                  which is the number that actually decides whether you can
                  afford it. */}
              {b.upkeep > 0 && (
                <span style={{ fontSize: 9, color: C.gold, fontWeight: 700 }}>−{b.upkeep}/t</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EconomyPanel({ hexId, eco, onBuild, onUpgrade, onRush, onSetSlider, onSetPoolTarget, onSetBuildPriority }) {
  const [open, setOpen] = useState(null); // null | "build" | { upgrade: chipUid }
  const can = eco.canManage;
  // One pill button, shared by the guns/butter slider, the pooling picker and
  // the funding-priority toggle so all three read as the same control.
  const slotButton = (label, active, enabled, onClick) => (
    <button
      key={label}
      className="hud-int"
      disabled={!enabled}
      onClick={enabled ? onClick : undefined}
      style={{
        flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700, letterSpacing: 1,
        textTransform: "uppercase", padding: "5px 4px", borderRadius: 5, cursor: enabled ? "pointer" : "default",
        border: `1px solid ${active ? C.holo : "rgba(86,211,198,0.3)"}`,
        background: active ? "rgba(86,211,198,0.18)" : "rgba(0,0,0,0.25)",
        color: active ? C.holoHi : C.textDim,
      }}
    >
      {label}
    </button>
  );
  const slot = (label, active, val) =>
    slotButton(label, active, can, () => onSetSlider?.(hexId, val));
  const f = eco.slider ?? 0;
  const emptySlots = Math.max(0, eco.slotCapacity - eco.slotsUsed);
  // The two economies are split at the menu as well as the grid: a city slot
  // can never hold a unit chip and a unit bay can never hold a city chip, so
  // offering both in one list only ever produced a greyed-out half.
  const cityMenu = (eco.buildMenu || []).filter((b) => b.kind !== "unit");
  const unitMenu = (eco.buildMenu || []).filter((b) => b.kind === "unit");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SectionLabel>Economy · Output {eco.output}/turn</SectionLabel>

      {/* guns/butter slider — discrete Bank / Balance / Build */}
      <div style={{ display: "flex", gap: 6 }}>
        {slot("Bank", f <= 0.01, 0)}
        {slot("Balance", f > 0.01 && f < 0.99, 0.5)}
        {slot("Build", f >= 0.99, 1)}
      </div>

      {/* active build + rush */}
      {eco.activeBuild ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(86,211,198,0.3)", borderRadius: 7, padding: "7px 10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, color: C.text }}>
              {eco.activeBuild.kind === "upgrade" ? "Upgrading → " : "Building "}{eco.activeBuild.name}
            </div>
            <div style={{ height: 6, background: "rgba(0,0,0,0.5)", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, Math.round(100 * eco.activeBuild.progress / Math.max(1, eco.activeBuild.cost)))}%`, height: "100%", background: C.holo }} />
            </div>
            <div style={{ fontSize: 9.5, color: C.textFaint, marginTop: 3 }}>
              {Math.floor(eco.activeBuild.progress)}/{eco.activeBuild.cost} · {eco.activeBuild.remaining} to go
            </div>
          </div>
          <button className="hud-int" disabled={!can || eco.scrap < CONFIG.economy.rushScrapPerPoint} onClick={can && eco.scrap >= CONFIG.economy.rushScrapPerPoint ? () => onRush?.(hexId) : undefined}
            style={{ flexShrink: 0, fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1206", padding: "7px 12px", borderRadius: 6, border: "1px solid #8a6a16", background: `linear-gradient(180deg, #f0c44e, ${C.gold})`, boxShadow: `0 0 12px ${C.gold}55`, cursor: can && eco.scrap >= CONFIG.economy.rushScrapPerPoint ? "pointer" : "not-allowed", opacity: can && eco.scrap >= CONFIG.economy.rushScrapPerPoint ? 1 : 0.5 }}>
            <span style={{ display: "block" }}>Rush</span>
            <span style={{ display: "block", fontSize: 8.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "none", opacity: 0.8 }}>
              {CONFIG.economy.rushScrapPerPoint} scrap / point
            </span>
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.textFaint }}>No active build — click an empty slot below.</div>
      )}

      {/* City slot grid: installed Location chips (click → upgrade) + empty
          slots (click → build). Location chips only — the garrison's bays are
          a separate economy and live in their own section below. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {eco.chips.map((c) => (
          <ChipButton key={c.uid} chip={c} can={can}
            onClick={() => setOpen((o) => (o && o.upgrade === c.uid ? null : { upgrade: c.uid }))} />
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <button key={`empty-${i}`} className="hud-int" disabled={!can}
            onClick={can ? () => setOpen((o) => (o === "build" ? null : "build")) : undefined}
            style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, border: "1px dashed rgba(86,211,198,0.5)", background: "rgba(86,211,198,0.06)", color: C.holoHi, cursor: can ? "pointer" : "default" }}>
            + Build
          </button>
        ))}
        {emptySlots === 0 && (
          <div style={{ fontSize: 10, color: C.textFaint, alignSelf: "center" }}>
            All city slots full.
          </div>
        )}
      </div>

      {/* Garrison bays — a SEPARATE economy from the city's slots.
          Unit chips never consumed a Location slot in the engine, but the
          build menu used to be reachable only by clicking an empty Location
          slot, so a full city could no longer outfit its own troops, and a
          unit chip's upgrade had nowhere to render at all. */}
      {(eco.garrison?.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionLabel>Garrison · unit bays</SectionLabel>
          {eco.garrison.map((u) => {
            const free = u.baySlots - u.bayUsed;
            return (
              <div key={u.uid} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: C.font, fontSize: 11.5, fontWeight: 700, color: C.text }}>
                    {u.name}
                  </span>
                  <span style={{ fontSize: 9.5, color: C.textFaint }}>
                    bay {u.bayUsed}/{u.baySlots}
                  </span>
                  <span style={{ fontSize: 9.5, color: u.unsupplied ? C.red : C.gold, fontWeight: 700 }}>
                    −{u.upkeep}/turn{u.unsupplied ? " · UNSUPPLIED" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {u.chips.map((c) => (
                    <ChipButton key={c.uid} chip={c} can={can}
                      onClick={() => setOpen((o) => (o && o.upgrade === c.uid ? null : { upgrade: c.uid }))} />
                  ))}
                  {free > 0 ? (
                    <button className="hud-int" disabled={!can}
                      onClick={can ? () => setOpen((o) => (o && o.outfit === u.uid ? null : { outfit: u.uid })) : undefined}
                      style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, border: "1px dashed rgba(86,211,198,0.5)", background: "rgba(86,211,198,0.06)", color: C.holoHi, cursor: can ? "pointer" : "default" }}>
                      + Outfit
                    </button>
                  ) : (
                    <span style={{ fontSize: 10, color: C.textFaint, alignSelf: "center" }}>Bay full.</span>
                  )}
                </div>
                {open?.outfit === u.uid && (
                  <BuildList
                    items={unitMenu.map((b) => {
                      // Per-unit eligibility. The adapter's `buildable` asks
                      // whether ANY stationed unit could take the chip; here the
                      // player has named one, so the answer has to be about it.
                      const fits = (b.slots || 1) <= free;
                      const clash = b.statType && u.statTypes.includes(b.statType);
                      return {
                        ...b,
                        buildable: !b.locked && fits && !clash,
                        reason: b.locked ? b.reason
                          : !fits ? "no bay space on this unit"
                          : clash ? `already carries a ${b.statType} chip`
                          : null,
                      };
                    })}
                    can={can}
                    empty="Nothing your Tech Level can fit yet."
                    onPick={(chipId) => { onBuild?.(hexId, chipId, { unit: u.uid }); setOpen(null); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rail doc §2.2 — pool this settlement's build output down a rail link.
          Only rendered when a legal recipient exists, so a settlement with no
          rail never shows a control it could not use. */}
      {eco.poolTargets?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <SectionLabel>Rail · pool build output</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {slotButton("Keep", !eco.poolTarget, can, () => onSetPoolTarget?.(hexId, null))}
            {eco.poolTargets.map((t) => slotButton(
              `→ ${t.name}`, eco.poolTarget === t.hexId, can,
              () => onSetPoolTarget?.(hexId, eco.poolTarget === t.hexId ? null : t.hexId),
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: C.textFaint, lineHeight: 1.45 }}>
            {eco.poolBlocked
              ? `Pooling paused — ${eco.poolBlocked}.`
              : eco.poolTarget
                ? `Shipping this settlement's build output to ${eco.poolTargetName} each Upkeep. Anyone parked on the line cuts the shipment.`
                : "Ship your idle build output down the rail to a settlement you also hold."}
          </div>
        </div>
      )}

      {/* Rail doc §3.4 — who gets the output first when a blockade is being
          funded. Hidden entirely when there is no site to argue over. */}
      {eco.fundsBlockade && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <SectionLabel>Funding priority</SectionLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {slotButton("Blockade first", eco.buildPriority !== "chips", can,
              () => onSetBuildPriority?.(hexId, "blockade"))}
            {slotButton("Chips first", eco.buildPriority === "chips", can,
              () => onSetBuildPriority?.(hexId, "chips"))}
          </div>
          <div style={{ fontSize: 9.5, color: C.textFaint, lineHeight: 1.45 }}>
            {eco.buildPriority === "chips"
              ? "This settlement finishes its own chip before it pays for the blockade."
              : "The blockade takes its share first; the rest goes to this settlement's own build."}
          </div>
        </div>
      )}

      {/* City build menu — Location chips only. */}
      {open === "build" && (
        <BuildList
          items={cityMenu}
          can={can}
          empty="Nothing your Tech Level can build yet."
          onPick={(chipId) => { onBuild?.(hexId, chipId); setOpen(null); }}
        />
      )}

      {/* upgrade view — §20.6: always shows the next tier, greyed if gated */}
      {open && open.upgrade && (() => {
        const c = eco.chips.find((x) => x.uid === open.upgrade);
        const up = c?.upgrade;
        if (!up) return null;
        const enabled = can && !up.locked;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(86,211,198,0.3)", borderRadius: 7, padding: 8 }}>
            <SectionLabel>Upgrade {c.name}</SectionLabel>
            <button className="hud-int" disabled={!enabled}
              onClick={enabled ? () => { onUpgrade?.(hexId, c.uid); setOpen(null); } : undefined}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textAlign: "left", padding: "6px 9px", borderRadius: 5, border: "1px solid rgba(86,211,198,0.25)", background: enabled ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.35)", color: enabled ? C.text : C.textFaint, cursor: enabled ? "pointer" : "not-allowed", opacity: up.locked ? 0.55 : 1 }}>
              <span>
                <b style={{ color: enabled ? C.text : C.textFaint }}>→ {up.name}</b>
                <span style={{ fontSize: 10, color: C.textFaint }}> · {up.desc}</span>
                {up.reason && <span style={{ fontSize: 9.5, color: C.red }}> · {up.reason}</span>}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <img src={ICON.scrap} alt="" style={{ width: 13, height: 13 }} />
                <span style={{ fontFamily: C.font, fontWeight: 700 }}>{up.cost}</span>
              </span>
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// Generic titled framed window (Units / Locations / Diplomacy / etc.).
export function TitledWindow({ title, icon, onClose, children, width }) {
  return (
    <FrameWindow onClose={onClose} width={width} title={title} icon={icon}>
      {children}
    </FrameWindow>
  );
}
