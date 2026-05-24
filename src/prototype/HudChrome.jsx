// Shared HUD visual language (radial / holographic "beat-up tech").
// Pure presentational components — every value and handler arrives via
// props so the same chrome drives both the live game (Prototype.jsx) and
// the static look-pass (HudShowcase.jsx).
import { useEffect, useState } from "react";
import ControlMeter from "./ControlMeter.jsx";
import { ALL_UPGRADES } from "./data.js";

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
              opacity={on ? 0.95 : 0.8}
              style={{ cursor: s.onClick ? "pointer" : "default", filter: `blur(0.7px) drop-shadow(0 0 ${on ? (prominent ? 16 : 13) : (prominent ? 11 : 9)}px ${accent}) drop-shadow(0 0 ${on ? (prominent ? 30 : 26) : (prominent ? 24 : 20)}px ${accent}88)`, transition: "opacity .12s ease, filter .12s ease" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
              onClick={s.onClick}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={ro} fill="none" stroke={accent} strokeWidth="0.8" opacity="0.28" style={{ filter: `blur(0.9px) drop-shadow(0 0 6px ${accent})` }} />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke={accent} strokeWidth="1" opacity="0.4" style={{ filter: `blur(0.9px) drop-shadow(0 0 6px ${accent})` }} />
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
  // Centre the glyph on the band's mid-radius along the 45° diagonal: a
  // corner-anchored square of side (mid·√2) flex-centres content there.
  const box = ((ri + ro) / 2) * Math.SQRT2;
  return (
    <button className="hud-int" onClick={onOpen} title="Menu"
      style={{ position: "absolute", right: 0, bottom: 0, width: S * 0.62, height: S * 0.62, zIndex: 28, border: "none", background: "transparent", padding: 0, cursor: "pointer", overflow: "visible" }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ position: "absolute", right: 0, bottom: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id="orb" cx="100%" cy="100%" r="80%">
            <stop offset="40%" stopColor={C.holo} stopOpacity="0.28" /><stop offset="78%" stopColor={C.holo} stopOpacity="0.12" /><stop offset="100%" stopColor={C.holo} stopOpacity="0.02" />
          </radialGradient>
        </defs>
        <path d={donut(cx, cy, ri, ro, 270, 360)} fill="url(#orb)" stroke={C.holoHi} strokeWidth="2.4" style={{ filter: `blur(1px) drop-shadow(0 0 16px ${C.holo}) drop-shadow(0 0 34px ${C.holo}aa)` }} />
        <circle cx={cx} cy={cy} r={ro} fill="none" stroke={C.holoHi} strokeWidth="1" opacity="0.3" style={{ filter: `blur(1px) drop-shadow(0 0 7px ${C.holo})` }} />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke={C.holoHi} strokeWidth="1.2" opacity="0.48" style={{ filter: `blur(1px) drop-shadow(0 0 7px ${C.holo})` }} />
      </svg>
      <span style={{ position: "absolute", right: 0, bottom: 0, width: box, height: box, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.holoHi, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 2, background: C.holoHi, boxShadow: `0 0 6px ${C.holo}` }} />)}
          </span>
          <span style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>MENU</span>
        </span>
      </span>
    </button>
  );
}

export function RadialMenu({ items, onPick, onClose }) {
  useEscClose(onClose);
  const S = 460, c = S / 2, ri = 84, ro = 208, gap = 4;
  const span = 360 / items.length;
  const seg = (i) => ({ a0: -span / 2 + i * span + gap / 2, a1: -span / 2 + (i + 1) * span - gap / 2 });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,8,8,0.62)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: S, height: S }}>
        <HoloSegments svgW={S} svgH={S} cx={c} cy={c} ri={ri} ro={ro} accent={C.holo} prominent
          segments={items.map((it, i) => ({ ...seg(i), icon: it.icon, iconSize: 40, label: it.label, onClick: () => onPick(it.key) }))}
          hub={<span style={{ display: "flex", flexDirection: "column", alignItems: "center", color: C.holoHi }}><span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 3 }}>SELECT</span><span style={{ fontSize: 9, letterSpacing: 1.5, color: C.textFaint }}>tap a sector</span></span>}
        />
        <CloseX onClose={onClose} style={{ position: "absolute", top: -6, right: -6 }} />
      </div>
    </div>
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
        <div style={{ position: "absolute", left: "16%", top: "12%", width: "56%", height: "42%", background: "radial-gradient(ellipse at 42% 36%, rgba(86,211,198,0.15), transparent 70%)", filter: "blur(6px)", pointerEvents: "none" }} />
        {/* content sits well inside the display, clear of the metal edges */}
        <div className="pc-scroll" style={{ position: "absolute", left: "16%", right: "14%", top: "11%", bottom: "13%", overflowY: "auto" }}>{children}</div>
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
export function LocationWindow({ view, onClose, onActivate, onContest, onRecruit }) {
  const v = view;
  return (
    <FrameWindow
      onClose={onClose}
      footer={
        <>
          <div style={{ position: "absolute", right: "9%", bottom: "9.5%", width: "23%", textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontFamily: C.font, fontWeight: 800, fontSize: 26, color: C.gold, textShadow: "0 1px 3px #000", lineHeight: 1 }}>{v.foothold}/{v.footholdCap}</div>
            <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: C.holoHi }}>Foothold</div>
          </div>
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
            <ControlMeter sections={v.sections} foothold={v.foothold} footholdCap={v.footholdCap} size={54} />
            <SectionLabel color={C.textDim}>Control</SectionLabel>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, padding: "8px 0", borderTop: "1px solid rgba(192,124,56,0.3)", borderBottom: "1px solid rgba(192,124,56,0.3)" }}>
          <Stat icon={ICON.shield} value={v.garrison} label="Garrison" />
          <Stat icon={ICON.scrap} value={`+${v.production}`} label="Production" />
          <Stat icon={ICON.units} value={v.chipSlots} label="Chip Slots" />
        </div>

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

// =======================================================================
// MarketBand — the Market as a continuation of the radial language: a
// holographic semicircle emanating from the bottom of the screen. Chips
// ride concentric arcs (one per market tier); the band "gains a layer on
// top" as higher tiers unlock. Chips render on the uploaded chip-plate
// artwork (orange = unit upgrade, teal = location upgrade).
// =======================================================================
// A terse one-line effect summary for a market chip ("+1 Decay Limit").
// Prefers an authored `short`, else derives from unit str/mov deltas.
function chipSummary(def) {
  if (def.short) return def.short;
  const p = [];
  if (def.str) p.push(`${def.str > 0 ? "+" : ""}${def.str} Strength`);
  if (def.mov) p.push(`${def.mov > 0 ? "+" : ""}${def.mov} Movement`);
  return p.join(" · ") || def.effect || "";
}

function MarketChip({ item, def, affordable, size, onAcquire, onHover }) {
  const kind = def.kind === "location" ? "location" : "unit";
  const accent = kind === "location" ? "#5fd0c8" : "#e69a4a";
  const CW = size, CH = Math.round(size / 1.6);
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => { setHov(true); onHover?.(true); }}
      onMouseLeave={() => { setHov(false); onHover?.(false); }}
      onClick={affordable ? () => onAcquire?.(item) : undefined}
      style={{
        position: "relative", width: CW, height: CH,
        backgroundImage: `url(${CHIPBG[kind]})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
        cursor: affordable ? "pointer" : "default",
        filter: affordable ? (hov ? `drop-shadow(0 0 13px ${accent})` : "drop-shadow(0 4px 8px rgba(0,0,0,0.6))") : "grayscale(0.6) brightness(0.66)",
        opacity: affordable ? 1 : 0.72,
        transform: hov && affordable ? "scale(1.06)" : "scale(1)",
        transition: "transform .12s ease, filter .12s ease",
      }}
    >
      {/* name + summary — top-left with breathing room from the frame */}
      <div style={{ position: "absolute", left: "11%", top: "23%", width: "58%" }}>
        <div style={{ fontFamily: C.font, fontSize: 12, fontWeight: 800, lineHeight: 1.08, letterSpacing: 0.3, textTransform: "uppercase", color: C.text, textShadow: "0 1px 3px #000" }}>
          {def.name}
        </div>
        <div style={{ marginTop: 4, fontFamily: C.font, fontSize: 10, fontWeight: 600, lineHeight: 1.18, color: accent, textShadow: "0 1px 2px #000" }}>
          {chipSummary(def)}
        </div>
      </div>
      {/* price — bottom-right, off the dial, in a high-contrast pill */}
      <span style={{ position: "absolute", right: "9%", bottom: "15%", display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(2,7,8,0.78)", border: `1px solid ${accent}66`, borderRadius: 10, padding: "2px 9px 2px 5px", boxShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
        <img src={ICON.scrap} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />
        <span style={{ fontFamily: C.font, fontWeight: 800, fontSize: 15, color: "#fff" }}>{def.cost > 0 ? def.cost : "—"}</span>
      </span>
      {item.isResale && (
        <span style={{ position: "absolute", left: "11%", bottom: "16%", fontSize: 7, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 3, padding: "0 4px", background: "rgba(0,0,0,0.6)" }}>Resale</span>
      )}
      {affordable && hov && (
        <span style={{ position: "absolute", left: "50%", bottom: "-15px", transform: "translateX(-50%)", fontFamily: C.font, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: accent, whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>Acquire</span>
      )}
    </div>
  );
}

function MarketTip({ tip }) {
  const W = 210;
  const left = Math.min(Math.max(tip.x - W / 2, 8), window.innerWidth - W - 8);
  return (
    <div style={{ position: "fixed", left, top: tip.y - 62, transform: "translateY(-100%)", width: W, zIndex: 80, pointerEvents: "none", background: "rgba(8,16,16,0.96)", border: `1px solid ${C.holo}`, borderRadius: 8, padding: 10, boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 12px ${C.holo}44` }}>
      <div style={{ fontFamily: C.font, fontSize: 13, fontWeight: 800, color: C.holoHi }}>{tip.def.name}</div>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.textFaint, marginTop: 1, marginBottom: 6 }}>
        {tip.def.kind === "capital" ? "Faction chip" : `${tip.def.kind} upgrade`}{tip.def.rare ? " · Rare" : ""}
      </div>
      <div style={{ fontSize: 11, color: C.text, lineHeight: 1.45 }}>{tip.def.effect}</div>
      <div style={{ marginTop: 8, fontSize: 10.5, color: C.gold, fontWeight: 700 }}>Cost {tip.def.cost} scrap</div>
    </div>
  );
}

export function MarketBand({ tiers = [], resale = [], scrap, actions = {}, isYourTurn, onAcquire, onClose }) {
  useEscClose(onClose);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [tip, setTip] = useState(null);
  useEffect(() => {
    const r = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  const cx = size.w / 2, cy = size.h - 4;
  const CW = 148, R0 = Math.max(272, Math.min(330, size.h * 0.38)), STEP = 124, halfSpan = 74, bandHalf = 52;

  // Show every unlocked tier plus the next locked one as a teaser; deeper
  // tiers stay hidden until they're next in line (keeps the band from
  // crowding the header and conveys progressive reveal).
  const firstLocked = tiers.findIndex((t) => !t.unlocked);
  const visibleTiers = firstLocked < 0 ? tiers : tiers.slice(0, firstLocked + 1);
  const tierData = visibleTiers.map((t, idx) => ({
    ...t,
    R: R0 + idx * STEP,
    items: idx === 0 ? [...t.items, ...resale] : t.items,
  }));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 58, background: "radial-gradient(ellipse at 50% 122%, rgba(8,18,18,0.8), rgba(2,5,6,0.92))", overflow: "hidden" }}>
      <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <defs>
          {tierData.map((t) => (
            <radialGradient key={t.tier} id={`mb-${t.tier}`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={t.R + bandHalf} fx={cx} fy={cy}>
              <stop offset="0%" stopColor={C.holo} stopOpacity="0.02" />
              <stop offset="100%" stopColor={C.holo} stopOpacity={t.unlocked ? 0.15 : 0.05} />
            </radialGradient>
          ))}
        </defs>
        {tierData.map((t) => {
          const col = t.unlocked ? C.holo : "#5b6b6b";
          return (
            <g key={t.tier}>
              <path d={donut(cx, cy, t.R - bandHalf, t.R + bandHalf, -halfSpan - 6, halfSpan + 6)} fill={`url(#mb-${t.tier})`} stroke={col} strokeWidth={t.unlocked ? 1.4 : 1} opacity={t.unlocked ? 0.9 : 0.5} style={{ filter: t.unlocked ? `drop-shadow(0 0 9px ${C.holo}55)` : "none" }} />
              <path d={arc(cx, cy, t.R + bandHalf, -halfSpan - 6, halfSpan + 6)} fill="none" stroke={col} strokeWidth="0.6" opacity="0.45" />
              <path d={arc(cx, cy, t.R - bandHalf, -halfSpan - 6, halfSpan + 6)} fill="none" stroke={col} strokeWidth="0.6" opacity="0.45" />
            </g>
          );
        })}
      </svg>

      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0 }}>
        {tierData.map((t) => {
          if (!t.unlocked) {
            const [lx, ly] = pt(cx, cy, t.R, 0);
            return (
              <div key={t.tier} style={{ position: "absolute", left: lx, top: ly, transform: "translate(-50%,-50%)", textAlign: "center", color: "#7c8a8a", pointerEvents: "none" }}>
                <div style={{ fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Tier {t.tier} · Locked</div>
                <div style={{ fontSize: 9.5, letterSpacing: 1, color: "#5f6d6d" }}>Reach Tech L{t.unlockLevel}</div>
              </div>
            );
          }
          const n = t.items.length;
          return t.items.map((item, i) => {
            const def = ALL_UPGRADES[item.chipId];
            if (!def) return null;
            const deg = n <= 1 ? 0 : -halfSpan + 2 * halfSpan * (i / (n - 1));
            const [x, y] = pt(cx, cy, t.R, deg);
            const affordable = isYourTurn && (scrap ?? 0) >= (def.cost || 0) && (actions.remaining ?? 0) >= 1;
            return (
              <div key={item.uid} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)" }}>
                <MarketChip item={item} def={def} affordable={affordable} size={CW} onAcquire={onAcquire} onHover={(on) => setTip(on ? { x, y, def } : null)} />
              </div>
            );
          });
        })}
      </div>

      <div style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", textAlign: "center", color: C.holoHi, pointerEvents: "none" }}>
        <div style={{ fontFamily: C.font, fontSize: 18, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>Market</div>
        <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: C.textFaint }}>Acquire — 1 Action + scrap cost</div>
      </div>
      <CloseX onClose={onClose} style={{ position: "absolute", top: 16, right: 16 }} />
      {tip && <MarketTip tip={tip} />}
    </div>
  );
}
