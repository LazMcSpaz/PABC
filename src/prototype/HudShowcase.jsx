// HUD look-pass showcase (v2) — built around the project's signature
// radial language and a holographic "gadget-wheel" motif.
//
//   • top-left   : a translucent, holographic half-wheel of 3 segments
//                  (Units / Tech / Scrap) around a settings hub.
//   • top-right  : faction nameplate flanked by VP + Action dials, with
//                  an oversized End Turn button hanging off the bottom.
//   • bottom-right: a partly-visible, neon-glowing menu orb; clicking it
//                  opens a radial menu (Research/Units/Locations/Market).
//                  Picking one opens a framed info window (X to close).
//   • Locations  : a single window — ability + Activate together, the
//                  control meter, and contest progress on the frame's
//                  built-in corner dial with a Contest button beside it.
//
// Reachable at /#hud (see App.jsx). Static mock data; no engine wiring.
import { useState } from "react";
import ControlMeter from "./ControlMeter.jsx";

// --- palette -----------------------------------------------------------
const C = {
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

const A = import.meta.env.BASE_URL; // honour Vite base (e.g. /PABC/)
const ICON = {
  scrap: `${A}assets/ui/icons/resources/player_scrap_resource_icon.png`,
  research: `${A}assets/ui/icons/resources/player_tech_research_icon.png`,
  units: `${A}assets/ui/icons/resources/player_units_icon.png`,
  vp: `${A}assets/ui/icons/resources/player_victory_points_icon.png`,
  shield: `${A}assets/ui/icons/stats/garrison_strength_icon.png`,
};
const FRAME = `${A}assets/ui/panels/frames/location_display_frame.webp`;

// --- geometry: angles measured from 12 o'clock, clockwise ---------------
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
// HoloSegments — a set of translucent, holographic pie/donut slices that
// share a center. Slice fills are low-opacity (hologram); the icon + text
// laid on top are fully opaque. `prominent` brightens the neon edge glow.
// =======================================================================
function HoloSegments({
  svgW,
  svgH,
  cx,
  cy,
  ri,
  ro,
  accent = C.holo,
  segments, // [{ a0, a1, icon, value, label, onClick }]
  prominent = false,
  hub, // node rendered at the center
  offset = { left: 0, top: 0 },
}) {
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
              style={{
                cursor: s.onClick ? "pointer" : "default",
                filter: `drop-shadow(0 0 ${on ? glow + 5 : glow}px ${accent}${prominent ? "" : "88"})`,
                transition: "opacity .12s ease, filter .12s ease",
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
              onClick={s.onClick}
            />
          );
        })}
        {/* inner + outer guide rings reinforce the holographic readout */}
        <circle cx={cx} cy={cy} r={ro} fill="none" stroke={accent} strokeWidth="0.6" opacity="0.35" />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      </svg>

      {/* opaque icon + value on each slice */}
      {segments.map((s, i) => {
        const mid = (s.a0 + s.a1) / 2;
        const [x, y] = pt(cx, cy, (ri + ro) / 2, mid);
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
            onClick={s.onClick}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: "translate(-50%,-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              pointerEvents: s.onClick ? "auto" : "none",
              cursor: s.onClick ? "pointer" : "default",
              textShadow: "0 1px 3px rgba(0,0,0,0.85)",
            }}
          >
            {s.icon && (
              <img
                src={s.icon}
                alt=""
                style={{ width: s.iconSize || 30, height: s.iconSize || 30, objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}
              />
            )}
            {s.value != null && (
              <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: s.valueSize || 18, color: C.text, lineHeight: 1 }}>
                {s.value}
              </span>
            )}
            {s.label && (
              <span style={{ fontSize: 8.5, letterSpacing: 1.5, textTransform: "uppercase", color: accent, fontWeight: 600 }}>
                {s.label}
              </span>
            )}
          </div>
        );
      })}

      {hub && (
        <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)" }}>{hub}</div>
      )}
    </div>
  );
}

// Settings hub button for the top-left wheel (gear glyph).
function SettingsHub() {
  return (
    <button
      className="hud-int"
      title="Settings"
      style={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        border: `1.5px solid ${C.holo}`,
        background: "radial-gradient(circle at 40% 34%, rgba(86,211,198,0.18), rgba(8,16,16,0.85) 78%)",
        boxShadow: `0 0 10px ${C.holo}66, inset 0 0 8px rgba(86,211,198,0.25)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: C.holoHi,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// =======================================================================
// Top-left — holographic half-wheel: 3 segments around a settings hub.
// Centered just inside the corner so the wheel fans into the screen.
// =======================================================================
function ResourceWheel() {
  const off = { left: -34, top: -34 };
  const cx = 110, cy = 110; // svg coords; maps to screen (76,76)
  const ri = 54, ro = 150;
  const gap = 4;
  // 180° span facing down-right: 45°..225°, split into 3.
  const seg = (i) => ({ a0: 45 + i * 60 + gap / 2, a1: 45 + (i + 1) * 60 - gap / 2 });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, zIndex: 30 }}>
      <HoloSegments
        svgW={300}
        svgH={300}
        cx={cx}
        cy={cy}
        ri={ri}
        ro={ro}
        offset={off}
        accent={C.holo}
        hub={<SettingsHub />}
        segments={[
          { ...seg(0), icon: ICON.units, value: "2/2", label: "Units" },
          { ...seg(1), icon: ICON.research, value: "L2", label: "Tech 55%" },
          { ...seg(2), icon: ICON.scrap, value: "18", label: "Scrap" },
        ]}
      />
    </div>
  );
}

// --- top-right dials (kept from v1) ------------------------------------
function Dial({ size = 72, accent = C.holo, progress = null, pips = null, sweep = 250, start = -125, glow = false, children }) {
  const c = size / 2;
  const rRim = c - 2.5, rGauge = c - 7.5, rFace = c - 11, end = start + sweep;
  const gid = `${accent.slice(1)}-${size}`;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`f${gid}`} cx="42%" cy="36%" r="80%">
            <stop offset="0%" stopColor="#323a3e" />
            <stop offset="62%" stopColor="#1d2326" />
            <stop offset="100%" stopColor="#11161a" />
          </radialGradient>
          <linearGradient id={`r${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.copperHi} />
            <stop offset="48%" stopColor={C.copper} />
            <stop offset="100%" stopColor={C.copperLo} />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={rRim} fill="none" stroke={`url(#r${gid})`} strokeWidth="3.4" />
        <circle cx={c} cy={c} r={rRim - 2} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
        <circle cx={c} cy={c} r={rFace} fill={`url(#f${gid})`} stroke="rgba(0,0,0,0.6)" strokeWidth="1" />
        {progress != null && (
          <>
            <path d={arc(c, c, rGauge, start, end)} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="3.2" strokeLinecap="round" />
            <path d={arc(c, c, rGauge, start, start + sweep * Math.max(0.001, Math.min(1, progress)))} fill="none" stroke={accent}
              strokeWidth="3.2" strokeLinecap="round" className={glow ? "hud-breathe" : undefined} style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
          </>
        )}
        {pips && Array.from({ length: pips.total }).map((_, i) => {
          const t = pips.total === 1 ? 0.5 : i / (pips.total - 1);
          const [px, py] = pt(c, c, rGauge, (start + sweep * t) + 0); // start measured from top already via arc; approximate
          const on = i < pips.filled;
          return <circle key={i} cx={px} cy={py} r={3.4} fill={on ? accent : "#1b2024"} stroke="rgba(0,0,0,0.4)" strokeWidth="1"
            style={on ? { filter: `drop-shadow(0 0 4px ${accent})` } : undefined} />;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        {children}
      </div>
    </div>
  );
}
function DialFace({ icon, value, sub, valueColor = C.text, iconSize = 28 }) {
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

function FactionReadout() {
  return (
    <div
      className="hud-scratch"
      style={{
        position: "absolute", top: 16, right: 16, zIndex: 30, display: "flex", alignItems: "center", gap: 4, padding: "8px 14px 12px",
        background: `linear-gradient(168deg, ${C.steelHi} 0%, ${C.steel} 42%, ${C.steelLo} 100%)`,
        border: "1px solid rgba(0,0,0,0.55)", borderTop: `2px solid ${C.red}`, borderRadius: 14,
        boxShadow: "0 8px 22px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(192,124,56,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <Rivet style={{ top: 7, left: 7 }} />
      <Rivet style={{ top: 7, right: 7 }} />
      <Dial size={72} accent={C.gold} progress={0.4}>
        <DialFace icon={ICON.vp} value="4" sub="VP · 4/10" valueColor={C.gold} iconSize={26} />
      </Dial>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", minWidth: 150 }}>
        <span style={{ fontFamily: C.font, fontSize: 21, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: C.red, textShadow: "0 1px 2px rgba(0,0,0,0.7)", lineHeight: 1.05, whiteSpace: "nowrap" }}>
          Versari Korad
        </span>
        <span style={{ fontSize: 10, letterSpacing: 2.4, textTransform: "uppercase", color: C.textFaint, marginTop: 3 }}>Round 3</span>
      </div>
      <Dial size={72} accent={C.red} progress={1} glow>
        <DialFace value="2/2" sub="Actions" valueColor={C.text} />
      </Dial>

      {/* oversized End Turn, hanging off the bottom for an irregular silhouette */}
      <button
        className="hud-int"
        style={{
          position: "absolute", bottom: -19, left: "50%", transform: "translateX(-50%)",
          fontFamily: C.font, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          color: "#1a1206", padding: "9px 30px", borderRadius: 8, border: "1px solid #8a5e16", whiteSpace: "nowrap",
          background: `linear-gradient(180deg, ${C.copperHi}, ${C.copper})`, boxShadow: "0 3px 0 #6e4a12, 0 6px 12px rgba(0,0,0,0.5)",
        }}
      >
        End Turn
      </button>
    </div>
  );
}

// =======================================================================
// Bottom-right — partly-visible neon menu orb. ~1/4 on screen.
// =======================================================================
function MenuOrb({ onOpen }) {
  const S = 240; // svg box
  const cx = S, cy = S; // center sits at the very corner (off-screen bottom-right)
  const ri = 96, ro = 150;
  return (
    <button
      className="hud-int"
      onClick={onOpen}
      title="Menu"
      style={{
        position: "absolute", right: 0, bottom: 0, width: S * 0.62, height: S * 0.62, zIndex: 28,
        border: "none", background: "transparent", padding: 0, cursor: "pointer", overflow: "visible",
      }}
    >
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ position: "absolute", right: 0, bottom: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id="orb" cx="100%" cy="100%" r="80%">
            <stop offset="40%" stopColor={C.holo} stopOpacity="0.28" />
            <stop offset="78%" stopColor={C.holo} stopOpacity="0.12" />
            <stop offset="100%" stopColor={C.holo} stopOpacity="0.02" />
          </radialGradient>
        </defs>
        <path d={donut(cx, cy, ri, ro, 270, 360)} fill="url(#orb)" stroke={C.holoHi} strokeWidth="2.4"
          style={{ filter: `drop-shadow(0 0 14px ${C.holo})` }} />
        <circle cx={cx} cy={cy} r={ro} fill="none" stroke={C.holoHi} strokeWidth="0.8" opacity="0.4" />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke={C.holoHi} strokeWidth="1" opacity="0.6" />
      </svg>
      {/* apps-grid glyph + label, set on the visible quarter */}
      <span style={{ position: "absolute", right: 30, bottom: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: C.holoHi, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
        <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 2, background: C.holoHi, boxShadow: `0 0 6px ${C.holo}` }} />)}
        </span>
        <span style={{ fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>MENU</span>
      </span>
    </button>
  );
}

// Radial menu popup — full holographic wheel, Splinter-Cell-gadget style.
function RadialMenu({ onPick, onClose }) {
  const S = 460, c = S / 2, ri = 84, ro = 208, gap = 4;
  const items = [
    { key: "research", icon: ICON.research, label: "Research" },
    { key: "units", icon: ICON.units, label: "Units" },
    { key: "locations", icon: ICON.shield, label: "Locations" },
    { key: "market", icon: ICON.scrap, label: "Market" },
  ];
  const seg = (i) => ({ a0: -45 + i * 90 + gap / 2, a1: -45 + (i + 1) * 90 - gap / 2 });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,8,8,0.62)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: S, height: S }}>
        <HoloSegments
          svgW={S} svgH={S} cx={c} cy={c} ri={ri} ro={ro} accent={C.holo} prominent
          segments={items.map((it, i) => ({ ...seg(i), icon: it.icon, iconSize: 40, label: it.label, valueSize: 0, onClick: () => onPick(it.key) }))}
          hub={
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", color: C.holoHi }}>
              <span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 3 }}>SELECT</span>
              <span style={{ fontSize: 9, letterSpacing: 1.5, color: C.textFaint }}>tap a sector</span>
            </span>
          }
        />
        <CloseX onClose={onClose} style={{ position: "absolute", top: -6, right: -6 }} />
      </div>
    </div>
  );
}

function CloseX({ onClose, style }) {
  return (
    <button
      className="hud-int" onClick={onClose} title="Close"
      style={{
        width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${C.holo}`, cursor: "pointer",
        background: "radial-gradient(circle at 40% 34%, rgba(86,211,198,0.2), rgba(8,16,16,0.9) 78%)",
        color: C.holoHi, fontFamily: C.font, fontSize: 18, lineHeight: 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 10px ${C.holo}66`, ...style,
      }}
    >
      ×
    </button>
  );
}

// =======================================================================
// Framed info window — uses the ornate frame art as a border.
// =======================================================================
function FrameWindow({ children, onClose, footer }) {
  const W = 470, H = Math.round(W / 0.809);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 58, background: "radial-gradient(ellipse at center, rgba(8,14,14,0.86), rgba(2,5,5,0.94))", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: W, height: H, backgroundImage: `url(${FRAME})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>
        {/* holographic screen wash behind the readout (kept clear of the
            frame's painted bottom-right dial) */}
        <div style={{ position: "absolute", left: "12%", top: "9%", width: "64%", height: "48%", background: "radial-gradient(ellipse at 42% 36%, rgba(86,211,198,0.15), transparent 70%)", filter: "blur(6px)", pointerEvents: "none" }} />
        {/* content sits inside the frame's transparent interior */}
        <div style={{ position: "absolute", left: "11%", right: "12%", top: "8%", bottom: "9%" }}>{children}</div>
        {footer}
        <CloseX onClose={onClose} style={{ position: "absolute", top: "4.5%", right: "6.5%" }} />
      </div>
    </div>
  );
}

function SectionLabel({ children, color = C.holo }) {
  return <div style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color, fontWeight: 600 }}>{children}</div>;
}

// Single-window Location view.
function LocationPanel({ onClose }) {
  const sections = ["versari", "versari", "neutral"];
  return (
    <FrameWindow
      onClose={onClose}
      footer={
        <>
          {/* Contest progress rides the frame's built-in corner dial */}
          <div style={{ position: "absolute", right: "9%", bottom: "9.5%", width: "23%", textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontFamily: C.font, fontWeight: 800, fontSize: 26, color: C.gold, textShadow: "0 1px 3px #000", lineHeight: 1 }}>2/3</div>
            <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: C.holoHi }}>Foothold</div>
          </div>
          {/* Contest button — to the LEFT of the contest dial */}
          <button
            className="hud-int"
            style={{
              position: "absolute", right: "34%", bottom: "11%",
              fontFamily: C.font, fontSize: 13, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase",
              color: "#fff", padding: "8px 18px", borderRadius: 7, border: `1px solid ${C.red}`,
              background: `linear-gradient(180deg, #e2554c, #a3322c)`, boxShadow: `0 2px 0 #6e201b, 0 0 12px ${C.red}66`, cursor: "pointer",
            }}
          >
            Contest
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: C.font, fontSize: 30, fontWeight: 700, letterSpacing: 1, color: C.text, lineHeight: 1, textShadow: "0 1px 3px #000" }}>KORAD</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontFamily: C.font, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1206", background: C.copperHi, padding: "2px 8px", borderRadius: 3 }}>High Value</span>
              <span style={{ display: "flex", gap: 2 }}>{[0, 1, 2].map((i) => <img key={i} src={ICON.vp} alt="" style={{ width: 15, height: 15 }} />)}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 6, marginRight: 30 }}>
            <ControlMeter sections={sections} foothold={2} footholdCap={3} size={54} />
            <SectionLabel color={C.textDim}>Control</SectionLabel>
          </div>
        </div>

        {/* stat strip */}
        <div style={{ display: "flex", gap: 18, padding: "8px 0", borderTop: "1px solid rgba(192,124,56,0.3)", borderBottom: "1px solid rgba(192,124,56,0.3)" }}>
          <Stat icon={ICON.shield} value="6" label="Garrison" />
          <Stat icon={ICON.scrap} value="+3" label="Production" />
          <Stat icon={ICON.units} value="2" label="Chip Slots" />
        </div>

        {/* ability + Activate, together */}
        <div>
          <SectionLabel>Ability</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.text, flex: 1 }}>
              <b style={{ color: C.holoHi }}>Forge</b> — once per turn, spend 2 scrap to give a unit here +1 Strength until your next turn.
            </p>
            <button
              className="hud-int"
              style={{
                flexShrink: 0, fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase",
                color: "#08100f", padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.holo}`,
                background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`, boxShadow: `0 2px 0 ${C.copperLo}, 0 0 12px ${C.holo}66`, cursor: "pointer",
              }}
            >
              Activate
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }} />
      </div>
    </FrameWindow>
  );
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

// Lightweight stand-in windows for the other three menu entries.
function SimplePanel({ title, blurb, icon, onClose }) {
  return (
    <FrameWindow onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={icon} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ fontFamily: C.font, fontSize: 28, fontWeight: 700, letterSpacing: 1, color: C.text, textShadow: "0 1px 3px #000" }}>{title}</div>
        </div>
        <div style={{ height: 1, background: "rgba(192,124,56,0.3)" }} />
        <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textDim }}>{blurb}</p>
        <div style={{ flex: 1 }} />
        <SectionLabel color={C.textFaint}>Look pass — content placeholder</SectionLabel>
      </div>
    </FrameWindow>
  );
}

// =======================================================================
export default function HudShowcase({ onExit }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // research|units|locations|market

  const open = (key) => { setPanel(key); setMenuOpen(false); };

  return (
    <div className="hud-root">
      <div className="hud-back" />
      <div style={{ position: "absolute", inset: 22, border: "1px solid rgba(192,124,56,0.12)", borderRadius: 18, pointerEvents: "none" }} />

      {/* a sample board location token — clicking it also opens Locations */}
      <button
        className="hud-int"
        onClick={() => setPanel("locations")}
        title="KORAD (click to inspect)"
        style={{
          position: "absolute", left: "44%", top: "46%", transform: "translate(-50%,-50%)", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer",
        }}
      >
        <div style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }}>
          <ControlMeter sections={["versari", "versari", "neutral"]} foothold={2} footholdCap={3} size={64} />
        </div>
        <span style={{ fontFamily: C.font, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: C.textDim }}>Korad</span>
      </button>

      <ResourceWheel />
      <FactionReadout />
      <MenuOrb onOpen={() => setMenuOpen(true)} />

      {menuOpen && <RadialMenu onPick={open} onClose={() => setMenuOpen(false)} />}

      {panel === "locations" && <LocationPanel onClose={() => setPanel(null)} />}
      {panel === "research" && <SimplePanel title="Research" icon={ICON.research} onClose={() => setPanel(null)}
        blurb="Spend research to advance your tech level and unlock ability points on the Tech Wheel — Military, Industry, Logistics and Intelligence branches." />}
      {panel === "units" && <SimplePanel title="Units" icon={ICON.units} onClose={() => setPanel(null)}
        blurb="Your fielded units, their strength and movement, installed chips, and reinforcement options." />}
      {panel === "market" && <SimplePanel title="Market" icon={ICON.scrap} onClose={() => setPanel(null)}
        blurb="Acquire unit and location upgrade chips with scrap. The resale row offers salvaged chips at a discount." />}

      {/* showcase chrome */}
      <div style={{ position: "absolute", bottom: 18, left: 24, color: C.textFaint, zIndex: 20 }}>
        <div style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>HUD Look Pass · v2</div>
        {onExit && (
          <button className="hud-int" onClick={onExit} style={{ marginTop: 8, fontFamily: C.font, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, background: "transparent", border: `1px solid ${C.steelHi}`, borderRadius: 5, padding: "5px 14px", cursor: "pointer" }}>
            ← Back to game
          </button>
        )}
      </div>
    </div>
  );
}
