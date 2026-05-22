// HUD look-pass showcase — a static, non-interactive mock of the in-game
// HUD built around our signature *radial* language (cf. ControlMeter,
// TechWheel, contest dice). Resources, tech and the action/VP readouts
// are circular instrument dials hugging the corners; navigation chrome
// (left tab rail, bottom dock) is worn-metal with round icon bosses so
// the whole frame shares one visual identity.
//
// Reachable at /#hud (see App.jsx). Populated with the mockup's example
// state (Versari Korad · Actions 2/2 · Scrap 18 · Tech L2/4) so it reads
// like the rough draft, only nicer. No engine wiring — pure look pass.
import { useId } from "react";

// --- palette: cool worn steel, copper edge-light, teal energy ----------
const C = {
  steelHi: "#525a62",
  steel: "#3a4047",
  steelLo: "#262b30",
  steelDeep: "#14181b",
  copper: "#c07c38",
  copperHi: "#eaa758",
  copperLo: "#774421",
  teal: "#56d3c6",
  tealLo: "#2c8d86",
  gold: "#e8b53f",
  red: "#d2453f",
  text: "#ece3d2",
  textDim: "#9aa1a8",
  textFaint: "#6b727a",
  ink: "#0b0e10",
  font: "'Oswald','Arial Narrow',system-ui,sans-serif",
};

const A = import.meta.env.BASE_URL; // honour Vite's base (e.g. /PABC/)
const ICON = {
  scrap: `${A}assets/ui/icons/resources/player_scrap_resource_icon.png`,
  research: `${A}assets/ui/icons/resources/player_tech_research_icon.png`,
  units: `${A}assets/ui/icons/resources/player_units_icon.png`,
  vp: `${A}assets/ui/icons/resources/player_victory_points_icon.png`,
  shield: `${A}assets/ui/icons/stats/garrison_strength_icon.png`,
};

// --- polar / arc geometry (angles from 12-o'clock, clockwise) ----------
function polar(c, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}
function arc(c, r, a0, a1) {
  const [x0, y0] = polar(c, r, a0);
  const [x1, y1] = polar(c, r, a1);
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// =======================================================================
// Dial — the core radial instrument. A copper-bevelled rim around a
// recessed steel face, with an optional sweeping progress arc and/or a
// ring of pips. Center content is supplied by the caller.
// =======================================================================
function Dial({
  size = 76,
  accent = C.teal,
  progress = null, // 0..1 sweeping arc
  pips = null, // { filled, total }
  sweep = 270,
  start = -135, // arc start angle (deg from top)
  glow = false,
  children,
}) {
  const uid = useId().replace(/[:]/g, "");
  const c = size / 2;
  const rRim = c - 2.5;
  const rGauge = c - 7.5;
  const rFace = c - 11;
  const end = start + sweep;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`face-${uid}`} cx="42%" cy="36%" r="80%">
            <stop offset="0%" stopColor="#323a3e" />
            <stop offset="62%" stopColor="#1d2326" />
            <stop offset="100%" stopColor="#11161a" />
          </radialGradient>
          <linearGradient id={`rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.copperHi} />
            <stop offset="48%" stopColor={C.copper} />
            <stop offset="100%" stopColor={C.copperLo} />
          </linearGradient>
        </defs>

        {/* copper bevel rim */}
        <circle cx={c} cy={c} r={rRim} fill="none" stroke={`url(#rim-${uid})`} strokeWidth="3.4" />
        <circle cx={c} cy={c} r={rRim - 2} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1" />

        {/* recessed face */}
        <circle cx={c} cy={c} r={rFace} fill={`url(#face-${uid})`} stroke="rgba(0,0,0,0.6)" strokeWidth="1" />

        {/* sweeping progress gauge */}
        {progress != null && (
          <>
            <path d={arc(c, rGauge, start, end)} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="3.2" strokeLinecap="round" />
            <path
              d={arc(c, rGauge, start, start + sweep * Math.max(0.001, Math.min(1, progress)))}
              fill="none"
              stroke={accent}
              strokeWidth="3.2"
              strokeLinecap="round"
              className={glow ? "hud-breathe" : undefined}
              style={{ filter: `drop-shadow(0 0 4px ${accent})` }}
            />
          </>
        )}

        {/* discrete pips around the gauge ring */}
        {pips &&
          Array.from({ length: pips.total }).map((_, i) => {
            const t = pips.total === 1 ? 0.5 : i / (pips.total - 1);
            const [px, py] = polar(c, rGauge, start + sweep * t);
            const on = i < pips.filled;
            return (
              <circle
                key={i}
                cx={px}
                cy={py}
                r={size > 80 ? 4 : 3.2}
                fill={on ? accent : "#1b2024"}
                stroke={on ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.07)"}
                strokeWidth="1"
                style={on ? { filter: `drop-shadow(0 0 4px ${accent})` } : undefined}
              />
            );
          })}
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Center stack for a resource dial: artwork icon over a big value.
function DialFace({ icon, value, sub, valueColor = C.text, iconSize = 30 }) {
  return (
    <>
      {icon && (
        <img
          src={icon}
          alt=""
          style={{
            width: iconSize,
            height: iconSize,
            objectFit: "contain",
            marginBottom: -3,
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))",
          }}
        />
      )}
      <span style={{ fontFamily: C.font, fontWeight: 700, fontSize: 18, lineHeight: 1, color: valueColor }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint, marginTop: 1 }}>
          {sub}
        </span>
      )}
    </>
  );
}

// A round icon "boss" — copper ring + steel face + centered art. Ties the
// flat chrome (tabs, dock buttons) into the radial language.
function Boss({ icon, size = 34, accent = C.copper }) {
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: `linear-gradient(180deg, ${C.copperHi}, ${accent} 45%, ${C.copperLo})`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 2,
          borderRadius: "50%",
          background: "radial-gradient(circle at 40% 34%, #313a3e, #161b1e 75%)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.7)",
        }}
      />
      <img
        src={icon}
        alt=""
        style={{
          position: "relative",
          width: size * 0.6,
          height: size * 0.6,
          objectFit: "contain",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
        }}
      />
    </span>
  );
}

// Worn-metal capsule used for the faction nameplate and dock pieces.
function plateStyle(radius = 12) {
  return {
    background: `linear-gradient(168deg, ${C.steelHi} 0%, ${C.steel} 42%, ${C.steelLo} 100%)`,
    border: "1px solid rgba(0,0,0,0.55)",
    borderTop: "1px solid rgba(255,255,255,0.10)",
    borderRadius: radius,
    boxShadow:
      "0 8px 22px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(192,124,56,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
  };
}

function Rivet({ style }) {
  return (
    <span
      style={{
        position: "absolute",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "radial-gradient(circle at 35% 30%, #8b9197, #2a2f33 80%)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5), 0 1px 1px rgba(0,0,0,0.5)",
        ...style,
      }}
    />
  );
}

// =======================================================================
// Top-left — the signature radial RESOURCE CLUSTER. Three instrument
// dials fanned across the corner quadrant around a round menu hub.
// =======================================================================
function ResourceCluster() {
  // Dials sit on a quarter arc of radius R from the corner origin.
  // deg here is measured below the horizontal (0° = →, 90° = ↓).
  const origin = { x: 34, y: 34 };
  const R = 152;
  const D = 78; // dial size
  const at = (deg, d = D) => {
    const a = (deg * Math.PI) / 180;
    return {
      left: origin.x + R * Math.cos(a) - d / 2,
      top: origin.y + R * Math.sin(a) - d / 2,
    };
  };
  const units = at(18);
  const tech = at(45, D + 8);
  const scrap = at(72);

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: 268, height: 268, zIndex: 30 }}>
      {/* faint backing arc tying the cluster together (top-clockwise angles:
          horizontal-right = 90°, straight-down = 180°). */}
      <svg width={268} height={268} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
        <path
          d={arc(0, R + 4, 102, 168)}
          transform={`translate(${origin.x},${origin.y})`}
          fill="none"
          stroke="rgba(192,124,56,0.22)"
          strokeWidth="1.5"
        />
        <path
          d={arc(0, 56, 98, 172)}
          transform={`translate(${origin.x},${origin.y})`}
          fill="none"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="16"
        />
      </svg>

      {/* round menu hub at the corner */}
      <button
        className="hud-int"
        title="Menu"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          width: 46,
          height: 46,
          borderRadius: "50%",
          border: "none",
          background: `linear-gradient(180deg, ${C.copperHi}, ${C.copper} 50%, ${C.copperLo})`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 32%, #333c40, #14191c 78%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 16, height: 2, borderRadius: 2, background: C.copperHi }} />
          ))}
        </span>
      </button>

      <div style={{ position: "absolute", ...units }}>
        <Dial size={D} accent={C.teal} pips={{ filled: 2, total: 2 }} sweep={150} start={-75}>
          <DialFace icon={ICON.units} value="2/2" sub="Units" />
        </Dial>
      </div>

      <div style={{ position: "absolute", ...tech }}>
        {/* Research + Tech level in one dial: sweeping arc = research to
            next level; pips around the ring = tech level (2 of 4). */}
        <Dial size={D + 8} accent={C.teal} progress={0.55} glow sweep={210} start={-150}>
          <DialFace icon={ICON.research} value="L2" sub="Tech · 55%" valueColor={C.teal} iconSize={28} />
        </Dial>
        <div style={{ position: "absolute", top: -3, right: -3 }}>
          <TechPips level={2} max={4} />
        </div>
      </div>

      <div style={{ position: "absolute", ...scrap }}>
        <Dial size={D} accent={C.copperHi} progress={0.62} sweep={150} start={-75}>
          <DialFace icon={ICON.scrap} value="18" sub="Scrap" />
        </Dial>
      </div>
    </div>
  );
}

// Tiny 4-pip tech-level badge that rides on the research dial.
function TechPips({ level, max }) {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 3,
        padding: "3px 6px",
        borderRadius: 10,
        background: "rgba(11,14,16,0.85)",
        border: `1px solid ${C.copperLo}`,
        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
      }}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: i < level ? C.gold : "#23282c",
            boxShadow: i < level ? `0 0 4px ${C.gold}` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </span>
  );
}

// =======================================================================
// Top-right — faction nameplate flanked by two dials: VP (gold star) and
// Actions (red). Symmetric radial readout of "how am I doing".
// =======================================================================
function FactionReadout() {
  return (
    <div
      className="hud-scratch"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 12px",
        ...plateStyle(14),
        borderTop: `2px solid ${C.red}`,
      }}
    >
      <Rivet style={{ top: 7, left: 7 }} />
      <Rivet style={{ bottom: 7, left: 7 }} />
      <Rivet style={{ top: 7, right: 7 }} />
      <Rivet style={{ bottom: 7, right: 7 }} />

      {/* VP dial */}
      <Dial size={72} accent={C.gold} progress={0.4} sweep={250} start={-125}>
        <DialFace icon={ICON.vp} value="4" sub="VP · 4/10" valueColor={C.gold} iconSize={26} />
      </Dial>

      {/* name + phase */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 6px", minWidth: 150 }}>
        <span
          style={{
            fontFamily: C.font,
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: C.red,
            textShadow: "0 1px 2px rgba(0,0,0,0.7)",
            lineHeight: 1.05,
            whiteSpace: "nowrap",
          }}
        >
          Versari Korad
        </span>
        <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.textFaint, marginTop: 2 }}>
          Round 3 · Action Phase
        </span>
        <button
          className="hud-int"
          style={{
            marginTop: 7,
            fontFamily: C.font,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "#1a1206",
            padding: "5px 18px",
            borderRadius: 5,
            border: "1px solid #8a5e16",
            background: `linear-gradient(180deg, ${C.copperHi}, ${C.copper})`,
            boxShadow: "0 2px 0 #6e4a12, 0 4px 9px rgba(0,0,0,0.4)",
          }}
        >
          End Turn
        </button>
      </div>

      {/* action dial */}
      <Dial size={72} accent={C.red} pips={{ filled: 2, total: 2 }} progress={1} sweep={250} start={-125} glow>
        <DialFace value="2/2" sub="Actions" valueColor={C.text} />
      </Dial>
    </div>
  );
}

// =======================================================================
// Left — vertical tab rail. Worn-metal tabs with round icon bosses; the
// active tab is wider, teal-lit, and notched into the board.
// =======================================================================
function TabRail() {
  const tabs = [
    { id: "research", label: "Research", icon: ICON.research, active: true },
    { id: "units", label: "Units", icon: ICON.units, active: false },
    { id: "locations", label: "Locations", icon: ICON.shield, active: false },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 25,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          className="hud-int hud-scratch"
          style={{
            position: "relative",
            width: t.active ? 64 : 54,
            height: 132,
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            border: "1px solid rgba(0,0,0,0.55)",
            borderLeft: "none",
            borderRadius: "0 14px 14px 0",
            color: t.active ? C.text : C.textDim,
            background: t.active
              ? `linear-gradient(120deg, ${C.steelHi}, ${C.steel} 60%, ${C.steelLo})`
              : `linear-gradient(120deg, ${C.steel}, ${C.steelLo})`,
            boxShadow: t.active
              ? `4px 0 16px rgba(0,0,0,0.5), inset 3px 0 0 ${C.teal}, inset 0 1px 0 rgba(255,255,255,0.07)`
              : "3px 0 12px rgba(0,0,0,0.45), inset 3px 0 0 rgba(192,124,56,0.5)",
          }}
        >
          <Rivet style={{ top: 8, right: 8 }} />
          <Boss icon={t.icon} size={34} accent={t.active ? C.teal : C.copper} />
          <span
            className="hud-vtext"
            style={{
              fontFamily: C.font,
              fontSize: 14,
              fontWeight: 600,
              textTransform: "uppercase",
              color: "inherit",
            }}
          >
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// =======================================================================
// Bottom — Market (compact) + Event Log (wide) dock buttons, each with a
// round icon boss. Mirrors the mockup's proportions.
// =======================================================================
function DockButton({ icon, label, wide }) {
  return (
    <button
      className="hud-int hud-scratch"
      style={{
        position: "relative",
        height: 50,
        minWidth: wide ? 440 : 200,
        flex: wide ? 1 : "0 0 auto",
        maxWidth: wide ? 620 : 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "0 22px",
        borderRadius: 12,
        ...plateStyle(12),
        color: C.text,
        fontFamily: C.font,
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: 2.4,
        textTransform: "uppercase",
      }}
    >
      <Rivet style={{ top: 8, left: 9 }} />
      <Rivet style={{ bottom: 8, left: 9 }} />
      <Rivet style={{ top: 8, right: 9 }} />
      <Rivet style={{ bottom: 8, right: 9 }} />
      <Boss icon={icon} size={30} />
      {label}
    </button>
  );
}

function BottomDock() {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 18,
        zIndex: 25,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "0 24px",
      }}
    >
      <DockButton icon={ICON.scrap} label="Market" />
      <DockButton icon={ICON.shield} label="Event Log" wide />
    </div>
  );
}

// =======================================================================
export default function HudShowcase({ onExit }) {
  return (
    <div className="hud-root">
      <div className="hud-back" />

      {/* faint framing brackets, echoing the board frame */}
      <div style={{ position: "absolute", inset: 22, border: "1px solid rgba(192,124,56,0.12)", borderRadius: 18, pointerEvents: "none" }} />

      <ResourceCluster />
      <FactionReadout />
      <TabRail />
      <BottomDock />

      {/* showcase chrome — not part of the HUD itself */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          color: C.textFaint,
          zIndex: 20,
        }}
      >
        <div style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>
          HUD Look Pass · Radial Instrument Language
        </div>
        {onExit && (
          <button
            className="hud-int"
            onClick={onExit}
            style={{
              marginTop: 10,
              fontFamily: C.font,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: C.textDim,
              background: "transparent",
              border: `1px solid ${C.steelHi}`,
              borderRadius: 5,
              padding: "5px 14px",
            }}
          >
            ← Back to game
          </button>
        )}
      </div>
    </div>
  );
}
