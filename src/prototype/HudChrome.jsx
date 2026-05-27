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
  scrap: `${A}assets/ui/icons/resources/player_scrap_resource_icon.png`,
  research: `${A}assets/ui/icons/resources/player_tech_research_icon.png`,
  units: `${A}assets/ui/icons/resources/player_units_icon.png`,
  vp: `${A}assets/ui/icons/resources/player_victory_points_icon.png`,
  shield: `${A}assets/ui/icons/stats/garrison_strength_icon.png`,
};
const FRAME = `${A}assets/ui/panels/frames/location_display_frame.webp`;
const CHIPBG = {
  unit: `${A}assets/ui/chips/unit/unit_chip_background.webp`,
  location: `${A}assets/ui/chips/location/location_chip_background.webp`,
};

// --- geometry (angles from 12 o'clock, clockwise) ----------------------
function pt(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
function donut(cx, cy, ri, ro, a0, a1) {
  const [ox0, oy0] = pt(cx, cy, ro, a0);
  const [ox1, oy1] = pt(cx, cy, ro, a1);
  const [ix1, iy1] = pt(cx, cy, ri, a1);
  const [ix0, iy0] = pt(cx, cy, ri, a0);
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0;
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
function HoloSegments({ svgW, svgH, cx, cy, ri, ro, accent = C.holo, segments, prominent = false, hub, offset = { left: 0, top: 0 } }) {
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
        </defs>
        {segments.map((s, i) => {
          const on = hover === i;
          return (
            <path
              key={i}
              d={donut(cx, cy, ri, ro, s.a0, s.a1)}
              fill={`url(#${gid})`}
              stroke={accent}
              strokeWidth={edge}
              opacity={on ? 1 : 0.85}
              style={{ cursor: s.onClick ? "pointer" : "default", filter: `drop-shadow(0 0 ${on ? glow + 5 : glow}px ${accent}${prominent ? "" : "88"})`, transition: "opacity .12s ease, filter .12s ease" }}
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
        const mid = (s.a0 + s.a1) / 2;
        const [x, y] = pt(cx, cy, (ri + ro) / 2, mid);
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
            onClick={s.onClick}
            style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, pointerEvents: s.onClick ? "auto" : "none", cursor: s.onClick ? "pointer" : "default", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}
          >
            {s.icon && <img src={s.icon} alt="" style={{ width: s.iconSize || 30, height: s.iconSize || 30, objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }} />}
            {s.value != null && s.value !== "" && <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: s.valueSize || 18, color: C.text, lineHeight: 1 }}>{s.value}</span>}
            {s.label && <span style={{ fontSize: 8.5, letterSpacing: 1.5, textTransform: "uppercase", color: accent, fontWeight: 600 }}>{s.label}</span>}
          </div>
        );
      })}
      {hub && <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)" }}>{hub}</div>}
    </div>
  );
}

function SettingsHub({ onClick }) {
  return (
    <button className="hud-int" title="Settings" onClick={onClick}
      style={{ width: 52, height: 52, borderRadius: "50%", border: `1.5px solid ${C.holo}`, background: "radial-gradient(circle at 40% 34%, rgba(86,211,198,0.18), rgba(8,16,16,0.85) 78%)", boxShadow: `0 0 10px ${C.holo}66, inset 0 0 8px rgba(86,211,198,0.25)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: C.holoHi, cursor: "pointer" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// Top-left holographic half-wheel: Units / Tech / Scrap around settings.
export function ResourceWheel({ scrap, units, tech, onSettings }) {
  const off = { left: -34, top: -34 };
  const cx = 110, cy = 110, ri = 54, ro = 150, gap = 4;
  const seg = (i) => ({ a0: 45 + i * 60 + gap / 2, a1: 45 + (i + 1) * 60 - gap / 2 });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, zIndex: 30 }}>
      <HoloSegments
        svgW={300} svgH={300} cx={cx} cy={cy} ri={ri} ro={ro} offset={off} accent={C.holo}
        hub={<SettingsHub onClick={onSettings} />}
        segments={[
          { ...seg(0), icon: ICON.units, value: `${units.n}/${units.cap}`, label: "Units" },
          { ...seg(1), icon: ICON.research, value: `L${tech.level}`, label: tech.label },
          { ...seg(2), icon: ICON.scrap, value: `${scrap}`, label: "Scrap" },
        ]}
      />
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
            <stop offset="0%" stopColor="#323a3e" /><stop offset="62%" stopColor="#1d2326" /><stop offset="100%" stopColor="#11161a" />
          </radialGradient>
          <linearGradient id={`r${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.copperHi} /><stop offset="48%" stopColor={C.copper} /><stop offset="100%" stopColor={C.copperLo} />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={rRim} fill="none" stroke={`url(#r${gid})`} strokeWidth="3.4" />
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
function DialFace({ icon, value, sub, valueColor = C.text, iconSize = 26 }) {
  return (
    <>
      {icon && <img src={icon} alt="" style={{ width: iconSize, height: iconSize, objectFit: "contain", marginBottom: -2, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))" }} />}
      <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: 18, lineHeight: 1, color: valueColor }}>{value}</span>
      {sub && <span style={{ fontSize: 7.5, letterSpacing: 1.3, textTransform: "uppercase", color: C.textFaint, marginTop: 1 }}>{sub}</span>}
    </>
  );
}
function Rivet({ style }) {
  return <span style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #8b9197, #2a2f33 80%)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5)", ...style }} />;
}

export function FactionReadout({ name, color = C.red, vp, vpGoal, actions, round, onEndTurn, endDisabled }) {
  return (
    <div className="hud-scratch" style={{ position: "absolute", top: 16, right: 16, zIndex: 30, display: "flex", alignItems: "center", gap: 4, padding: "8px 14px 12px", background: `linear-gradient(168deg, ${C.steelHi} 0%, ${C.steel} 42%, ${C.steelLo} 100%)`, border: "1px solid rgba(0,0,0,0.55)", borderTop: `2px solid ${color}`, borderRadius: 14, boxShadow: "0 8px 22px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(192,124,56,0.28), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
      <Rivet style={{ top: 7, left: 7 }} />
      <Rivet style={{ top: 7, right: 7 }} />
      <Dial size={72} accent={C.gold} progress={vpGoal ? vp / vpGoal : 0}>
        <DialFace icon={ICON.vp} value={vp} sub={`VP · ${vp}/${vpGoal}`} valueColor={C.gold} />
      </Dial>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", minWidth: 150 }}>
        <span style={{ fontFamily: C.font, fontSize: 21, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color, textShadow: "0 1px 2px rgba(0,0,0,0.7)", lineHeight: 1.05, whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ fontSize: 10, letterSpacing: 2.4, textTransform: "uppercase", color: C.textFaint, marginTop: 3 }}>Round {round}</span>
      </div>
      <Dial size={72} accent={C.red} progress={actions.max ? actions.remaining / actions.max : 0} glow>
        <DialFace value={`${actions.remaining}/${actions.max}`} sub="Actions" valueColor={C.text} />
      </Dial>
      <button className="hud-int" onClick={endDisabled ? undefined : onEndTurn} disabled={endDisabled}
        style={{ position: "absolute", bottom: -19, left: "50%", transform: "translateX(-50%)", fontFamily: C.font, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#1a1206", padding: "9px 30px", borderRadius: 8, border: "1px solid #8a5e16", whiteSpace: "nowrap", background: `linear-gradient(180deg, ${C.copperHi}, ${C.copper})`, boxShadow: "0 3px 0 #6e4a12, 0 6px 12px rgba(0,0,0,0.5)", cursor: endDisabled ? "not-allowed" : "pointer", opacity: endDisabled ? 0.45 : 1 }}>
        End Turn
      </button>
    </div>
  );
}

// --- bottom-right menu orb + radial menu -------------------------------
export function MenuOrb({ onOpen }) {
  const S = 240, cx = S, cy = S, ri = 96, ro = 150;
  return (
    <button className="hud-int" onClick={onOpen} title="Menu"
      style={{ position: "absolute", right: 0, bottom: 0, width: S * 0.62, height: S * 0.62, zIndex: 28, border: "none", background: "transparent", padding: 0, cursor: "pointer", overflow: "visible" }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ position: "absolute", right: 0, bottom: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id="orb" cx="100%" cy="100%" r="80%">
            <stop offset="40%" stopColor={C.holo} stopOpacity="0.28" /><stop offset="78%" stopColor={C.holo} stopOpacity="0.12" /><stop offset="100%" stopColor={C.holo} stopOpacity="0.02" />
          </radialGradient>
        </defs>
        <path d={donut(cx, cy, ri, ro, 270, 360)} fill="url(#orb)" stroke={C.holoHi} strokeWidth="2.4" style={{ filter: `drop-shadow(0 0 14px ${C.holo})` }} />
        <circle cx={cx} cy={cy} r={ro} fill="none" stroke={C.holoHi} strokeWidth="0.8" opacity="0.4" />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke={C.holoHi} strokeWidth="1" opacity="0.6" />
      </svg>
      <span style={{ position: "absolute", right: 30, bottom: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: C.holoHi, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
        <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 2, background: C.holoHi, boxShadow: `0 0 6px ${C.holo}` }} />)}
        </span>
        <span style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>MENU</span>
      </span>
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
  const S = 460, c = S / 2, ri = 84, ro = 208, gap = 4;
  const span = 360 / items.length;
  const seg = (i) => ({ a0: -span / 2 + i * span + gap / 2, a1: -span / 2 + (i + 1) * span - gap / 2 });
  return (
    <motion.div onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: "easeOut" }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,8,8,0.62)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.84, rotate: -7, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 20, mass: 0.7 }}
        style={{ position: "relative", width: S, height: S }}>
        <ScannerRing size={S} />
        <HoloSegments svgW={S} svgH={S} cx={c} cy={c} ri={ri} ro={ro} accent={C.holo} prominent
          segments={items.map((it, i) => ({ ...seg(i), icon: it.icon, iconSize: 40, label: it.label, onClick: () => onPick(it.key) }))}
          hub={<span style={{ display: "flex", flexDirection: "column", alignItems: "center", color: C.holoHi }}><span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 3 }}>SELECT</span><span style={{ fontSize: 9, letterSpacing: 1.5, color: C.textFaint }}>tap a sector</span></span>}
        />
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
export function FrameWindow({ children, onClose, footer, width = 470 }) {
  const W = width, H = Math.round(W / 0.809);
  useEscClose(onClose);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 58, background: "radial-gradient(ellipse at center, rgba(8,14,14,0.86), rgba(2,5,5,0.94))", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: W, height: H, backgroundImage: `url(${FRAME})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>
        <div style={{ position: "absolute", left: "12%", top: "9%", width: "64%", height: "48%", background: "radial-gradient(ellipse at 42% 36%, rgba(86,211,198,0.15), transparent 70%)", filter: "blur(6px)", pointerEvents: "none" }} />
        <div className="pc-scroll" style={{ position: "absolute", left: "11%", right: "12%", top: "8%", bottom: "9%", overflowY: "auto" }}>{children}</div>
        {footer}
        <CloseX onClose={onClose} style={{ position: "absolute", top: "4.5%", right: "6.5%" }} />
      </div>
    </div>
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
  return (
    <FrameWindow
      onClose={onClose}
      footer={
        <>
          {v.loyalty != null && (
            <div style={{ position: "absolute", right: "9%", bottom: "9.5%", width: "23%", textAlign: "center", pointerEvents: "none" }}>
              <div style={{ fontFamily: C.font, fontWeight: 800, fontSize: 26, color: v.loyaltyDanger ? C.red : C.gold, textShadow: "0 1px 3px #000", lineHeight: 1 }}>{v.loyalty}/{v.loyaltyMax}</div>
              <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: C.holoHi }}>Loyalty</div>
            </div>
          )}
          {v.contest && (
            <button className="hud-int" onClick={v.contest.canContest ? () => onContest?.({ unit: v.contest.unitId }) : undefined} disabled={!v.contest.canContest}
              style={{ position: "absolute", right: "34%", bottom: "11%", fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "#fff", padding: "8px 18px", borderRadius: 7, border: `1px solid ${C.red}`, background: "linear-gradient(180deg, #e2554c, #a3322c)", boxShadow: `0 2px 0 #6e201b, 0 0 12px ${C.red}66`, cursor: v.contest.canContest ? "pointer" : "not-allowed", opacity: v.contest.canContest ? 1 : 0.5 }}>
              Contest
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: C.font, fontSize: 30, fontWeight: 700, letterSpacing: 1, color: C.text, lineHeight: 1, textShadow: "0 1px 3px #000" }}>{v.name}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontFamily: C.font, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1206", background: v.valueColor || C.copperHi, padding: "2px 8px", borderRadius: 3 }}>{v.valueLabel}</span>
              <span style={{ display: "flex", gap: 2 }}>{Array.from({ length: v.vp }).map((_, i) => <img key={i} src={ICON.vp} alt="" style={{ width: 15, height: 15 }} />)}</span>
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint, marginTop: 6 }}>{v.statusLabel}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 6, marginRight: 30 }}>
            <ControlMeter sections={v.sections} loyalty={v.loyalty} danger={v.loyaltyDanger} size={54} />
            <SectionLabel color={C.textDim}>Control</SectionLabel>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, padding: "8px 0", borderTop: "1px solid rgba(192,124,56,0.3)", borderBottom: "1px solid rgba(192,124,56,0.3)" }}>
          <Stat icon={ICON.shield} value={v.garrison} label="Garrison" />
          <Stat icon={ICON.scrap} value={`+${v.economy ? v.economy.output : v.production}`} label="Output" />
          <Stat icon={ICON.units} value={v.economy ? `${v.economy.slotsUsed}/${v.economy.slotCapacity}` : v.chipSlots} label="Chip Slots" />
        </div>

        {v.economy && (
          <EconomyPanel
            hexId={v.hexId}
            eco={v.economy}
            onBuild={onBuild}
            onUpgrade={onUpgrade}
            onRush={onRush}
            onSetSlider={onSetSlider}
          />
        )}

        {v.ability && (
          <div>
            <SectionLabel>{v.ability.name}</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.text, flex: 1 }}>{v.ability.text}</p>
              {v.ability.canActivate != null && (
                <button className="hud-int" onClick={v.ability.canActivate ? () => onActivate?.(v.hexId) : undefined} disabled={!v.ability.canActivate}
                  style={{ flexShrink: 0, fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "#08100f", padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.holo}`, background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`, boxShadow: `0 2px 0 ${C.copperLo}, 0 0 12px ${C.holo}66`, cursor: v.ability.canActivate ? "pointer" : "not-allowed", opacity: v.ability.canActivate ? 1 : 0.5 }}>
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
                style={{ flexShrink: 0, fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "#1a1206", padding: "9px 16px", borderRadius: 7, border: "1px solid #8a5e16", background: `linear-gradient(180deg, ${C.copperHi}, ${C.copper})`, boxShadow: "0 2px 0 #6e4a12", cursor: v.recruit.canAfford ? "pointer" : "not-allowed", opacity: v.recruit.canAfford ? 1 : 0.5 }}>
                Recruit
              </button>
            </div>
          </div>
        )}

        {v.contest && (
          <div className="pc-prose" style={{ fontSize: 11, lineHeight: 1.5, color: C.textDim, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(192,124,56,0.25)", borderRadius: 7, padding: "8px 10px" }}>
            <b style={{ color: C.text }}>{v.contest.attackerName}</b> {v.contest.attackerTotal} + 1d6
            <span style={{ color: C.textFaint }}> vs </span>
            <b style={{ color: C.text }}>{v.contest.defenderLabel}</b> {v.contest.defenderValue}{v.contest.defenderRollsDie ? " + 1d6" : " (no roll)"}.
            {v.contest.hasNeutral ? " Neutral sections force the fight onto the garrison." : " Beat the holder to flip a section."}
          </div>
        )}

        <div style={{ flex: 1 }} />
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
        border: `1px solid ${active ? C.holo : "rgba(192,124,56,0.3)"}`,
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
            style={{ flexShrink: 0, fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1206", padding: "7px 12px", borderRadius: 6, border: "1px solid #8a5e16", background: `linear-gradient(180deg, ${C.copperHi}, ${C.copper})`, cursor: can && eco.scrap >= 1 ? "pointer" : "not-allowed", opacity: can && eco.scrap >= 1 ? 1 : 0.5 }}>
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
            style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, padding: "6px 9px", borderRadius: 6, border: `1px solid ${c.disabled ? C.red : "rgba(192,124,56,0.4)"}`, background: "rgba(0,0,0,0.3)", color: c.disabled ? C.red : C.text, cursor: can && c.upgrade ? "pointer" : "default" }}>
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
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textAlign: "left", padding: "6px 9px", borderRadius: 5, border: "1px solid rgba(192,124,56,0.25)", background: enabled ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.35)", color: enabled ? C.text : C.textFaint, cursor: enabled ? "pointer" : "not-allowed", opacity: b.locked ? 0.55 : 1 }}>
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
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textAlign: "left", padding: "6px 9px", borderRadius: 5, border: "1px solid rgba(192,124,56,0.25)", background: enabled ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.35)", color: enabled ? C.text : C.textFaint, cursor: enabled ? "pointer" : "not-allowed", opacity: up.locked ? 0.55 : 1 }}>
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

// Generic titled framed window (Units / Market / etc.).
export function TitledWindow({ title, icon, onClose, children, width }) {
  return (
    <FrameWindow onClose={onClose} width={width}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {icon && <img src={icon} alt="" style={{ width: 38, height: 38, objectFit: "contain" }} />}
          <div style={{ fontFamily: C.font, fontSize: 26, fontWeight: 700, letterSpacing: 1, color: C.text, textShadow: "0 1px 3px #000" }}>{title}</div>
        </div>
        <div style={{ height: 1, background: "rgba(192,124,56,0.3)" }} />
        {children}
      </div>
    </FrameWindow>
  );
}
