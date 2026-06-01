// Shared HUD visual language (radial / holographic "beat-up tech").
// Pure presentational components — every value and handler arrives via
// props so the same chrome drives both the live game (Prototype.jsx) and
// the static look-pass (HudShowcase.jsx).
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ControlMeter from "./ControlMeter.jsx";

// Close the active modal on Escape.
function useEscClose(onClose) {
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
function ResourceCell({ icon, value, label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "radial-gradient(circle at 50% 40%, rgba(19,42,44,0.95), rgba(4,10,11,0.96))", border: `1px solid ${color}`, boxShadow: `0 0 8px ${color}77, inset 0 0 6px rgba(0,0,0,0.5)`, flexShrink: 0 }}>
        <img src={icon} alt="" style={{ width: 18, height: 18, objectFit: "contain", filter: "brightness(1.12)" }} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: 16, color: "#f4efe2", textShadow: `0 0 8px ${color}` }}>{value}</span>
        <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color, fontWeight: 600, marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
}

// A dial paired with a small caption below — the right-side VP / Actions cells.
function DialCell({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      {children}
      <span style={{ fontFamily: C.font, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// Unified top bar — one flared strip across the top: tall, colour-coded
// resources at the left flare; small faction name + round in the pinched
// centre; VP + Actions dials at the right flare, with End Turn beneath.
// Responsive width via clip-path (% x / px y); a matching SVG strokes the
// glowing edge (non-scaling-stroke keeps the line crisp at any width).
export function TopBar({ scrap, units, tech, name, color = C.red, vp, vpGoal, actions, round, onEndTurn, endDisabled, onSettings }) {
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
        <ResourceCell {...RES.scrap} value={`${scrap}`} label="Scrap" />
        <ResourceCell {...RES.units} value={`${units.n}/${units.cap}`} label="Units" />
        <ResourceCell {...RES.tech} value={`L${tech.level}`} label={tech.label} />
      </div>

      {/* centre pinch — faction name + round */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "none" }}>
        <span style={{ fontFamily: C.font, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color, textShadow: `0 0 10px ${color}77, 0 1px 2px rgba(0,0,0,0.7)`, lineHeight: 1, whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ width: 70, height: 1.5, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        <span style={{ fontFamily: C.font, fontSize: 8.5, letterSpacing: 2.2, textTransform: "uppercase", color: C.textFaint }}>Round {round}</span>
      </div>

      {/* right flare — VP + Actions dials, End Turn beneath */}
      <div style={{ position: "absolute", right: 16, top: 0, height: H, display: "flex", alignItems: "center", gap: 14, pointerEvents: "auto" }}>
        <DialCell label="Victory">
          <Dial size={46} accent={C.gold} progress={vpGoal ? vp / vpGoal : 0}>
            <DialFace icon={ICON.vp} value={vp} valueColor={C.gold} iconSize={15} valueSize={15} />
          </Dial>
        </DialCell>
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
  const S = 460, c = S / 2, ri = 84, ro = 208;
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
          <HoloSegments svgW={S} svgH={S} cx={c} cy={c} ri={ri} ro={ro} accent={C.holo} prominent gapPx={10}
            segments={items.map((it, i) => ({ ...seg(i), icon: it.icon, iconSize: 46, label: it.label, onClick: () => onPick(it.key) }))}
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
function CornerBrackets({ color = C.holo, len = 16, inset = 7, w = 2 }) {
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
export function FrameWindow({ children, onClose, footer, width = 470, title, icon }) {
  useEscClose(onClose);
  return (
    <motion.div onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.16 }}
      style={{ position: "fixed", inset: 0, zIndex: 58, background: "radial-gradient(ellipse at center, rgba(8,14,14,0.82), rgba(2,5,5,0.93))", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div onClick={(e) => e.stopPropagation()} className="hud-scratch"
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.18, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        style={{ position: "relative", width, maxHeight: "88vh", display: "flex", flexDirection: "column",
          background: "linear-gradient(158deg, rgba(18,31,32,0.97) 0%, rgba(9,17,18,0.98) 58%, rgba(6,11,12,0.99) 100%)",
          border: `1px solid ${C.holo}`, borderRadius: 8,
          boxShadow: `inset 0 0 34px rgba(86,211,198,0.07), 0 0 0 1px rgba(86,211,198,0.12), 0 0 36px rgba(86,211,198,0.22), 0 26px 70px rgba(0,0,0,0.72)` }}>
        <div style={{ position: "absolute", top: 0, left: 20, right: 20, height: 2, background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`, opacity: 0.7, pointerEvents: "none" }} />
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
export function LocationWindow({ view, onClose, onActivate, onContest, onRecruit, onBuild, onUpgrade, onRush, onSetSlider }) {
  const v = view;
  const hair = "1px solid rgba(86,211,198,0.22)";
  const holoBtn = { fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "#08100f", padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.holo}`, background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`, boxShadow: `0 0 14px ${C.holo}55` };
  return (
    <FrameWindow
      onClose={onClose}
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
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: C.textDim, marginTop: 7 }}>{v.statusLabel}</div>
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

        {v.economy && (
          <EconomyPanel hexId={v.hexId} eco={v.economy} onBuild={onBuild} onUpgrade={onUpgrade} onRush={onRush} onSetSlider={onSetSlider} />
        )}

        {v.ability && (
          <div>
            <SectionLabel>{v.ability.name}</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.text, flex: 1 }}>{v.ability.text}</p>
              {v.ability.canActivate != null && (
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
function EconomyPanel({ hexId, eco, onBuild, onUpgrade, onRush, onSetSlider }) {
  const [open, setOpen] = useState(null); // null | "build" | { upgrade: chipUid }
  const can = eco.canManage;
  const slot = (label, active, val) => (
    <button
      key={label}
      className="hud-int"
      disabled={!can}
      onClick={can ? () => onSetSlider?.(hexId, val) : undefined}
      style={{
        flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700, letterSpacing: 1,
        textTransform: "uppercase", padding: "5px 4px", borderRadius: 5, cursor: can ? "pointer" : "default",
        border: `1px solid ${active ? C.holo : "rgba(86,211,198,0.3)"}`,
        background: active ? "rgba(86,211,198,0.18)" : "rgba(0,0,0,0.25)",
        color: active ? C.holoHi : C.textDim,
      }}
    >
      {label}
    </button>
  );
  const f = eco.slider ?? 0;
  const emptySlots = Math.max(0, eco.slotCapacity - eco.slotsUsed);

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
          <button className="hud-int" disabled={!can || eco.scrap < 1} onClick={can && eco.scrap >= 1 ? () => onRush?.(hexId) : undefined}
            style={{ flexShrink: 0, fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1206", padding: "7px 12px", borderRadius: 6, border: "1px solid #8a6a16", background: `linear-gradient(180deg, #f0c44e, ${C.gold})`, boxShadow: `0 0 12px ${C.gold}55`, cursor: can && eco.scrap >= 1 ? "pointer" : "not-allowed", opacity: can && eco.scrap >= 1 ? 1 : 0.5 }}>
            Rush
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.textFaint }}>No active build — click an empty slot below.</div>
      )}

      {/* slot grid: installed chips (click → upgrade) + empty slots (click → build) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {eco.chips.map((c) => (
          <button key={c.uid} className="hud-int" disabled={!can || !c.upgrade}
            onClick={can && c.upgrade ? () => setOpen((o) => (o && o.upgrade === c.uid ? null : { upgrade: c.uid })) : undefined}
            title={c.upgrade ? `Upgrade → ${c.upgrade.name}` : "No upgrade"}
            style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "6px 9px", borderRadius: 6, border: `1px solid ${c.disabled ? C.red : "rgba(86,211,198,0.4)"}`, background: "rgba(0,0,0,0.3)", color: c.disabled ? C.red : C.text, cursor: can && c.upgrade ? "pointer" : "default" }}>
            {c.name}{c.disabled ? " (dormant)" : ""}{c.upgrade ? " ▲" : ""}
          </button>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <button key={`empty-${i}`} className="hud-int" disabled={!can}
            onClick={can ? () => setOpen((o) => (o === "build" ? null : "build")) : undefined}
            style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, border: "1px dashed rgba(86,211,198,0.5)", background: "rgba(86,211,198,0.06)", color: C.holoHi, cursor: can ? "pointer" : "default" }}>
            + Build
          </button>
        ))}
      </div>

      {/* build menu — §20.6: only Tech-allowed chips; Loyalty-locked greyed */}
      {open === "build" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(86,211,198,0.3)", borderRadius: 7, padding: 8 }}>
          <SectionLabel>Build menu</SectionLabel>
          {eco.buildMenu.length === 0 && <div style={{ fontSize: 11, color: C.textFaint }}>Nothing your Tech Level can build yet.</div>}
          {eco.buildMenu.map((b) => {
            const enabled = can && b.buildable;
            return (
              <button key={b.chipId} className="hud-int" disabled={!enabled}
                onClick={enabled ? () => { onBuild?.(hexId, b.chipId); setOpen(null); } : undefined}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textAlign: "left", padding: "6px 9px", borderRadius: 5, border: "1px solid rgba(86,211,198,0.25)", background: enabled ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.35)", color: enabled ? C.text : C.textFaint, cursor: enabled ? "pointer" : "not-allowed", opacity: b.locked ? 0.55 : 1 }}>
                <span>
                  <b style={{ color: enabled ? C.text : C.textFaint }}>{b.name}</b>
                  <span style={{ fontSize: 10, color: C.textFaint }}> · {b.desc}</span>
                  {b.reason && <span style={{ fontSize: 9.5, color: C.red }}> · {b.reason}</span>}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <img src={ICON.scrap} alt="" style={{ width: 13, height: 13 }} />
                  <span style={{ fontFamily: C.font, fontWeight: 700 }}>{b.cost}</span>
                </span>
              </button>
            );
          })}
        </div>
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
