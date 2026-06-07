// SetupScreen — "New Game / Configure Match" screen.
// Reached from TitleScreen via onBack/onStart navigation.
// Calls onBack() to return to the title, or onStart(config) to begin.
//
// Config contract (exact field names the engine expects):
// {
//   key:           string   — `${seed}:${humanFactionId}:${Date.now()}`
//   seed:          number   — parsed seed or random
//   humanFactionId: string  — "versari"|"lakers"|"goldgrass"|"plainers"
//   mapSize:       string   — "small"|"medium"|"large"|"huge"
//   factionCount:  number   — integer 2..4
//   victory: {
//     conquest:     boolean  — reach 12 VP (§14.1; always-available path)
//     recognition:  boolean  — diplomacy/Recognition victory (§18.10)
//     elimination:  boolean  — last faction standing
//   }
//   encounters: {
//     field: number  — 0..1 frequency
//     world: number  — 0..1 frequency
//   }
//   minorFactions:  boolean
//   fogOfWar:       boolean
// }

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FACTIONS as UI_FACTIONS } from "./data.js";
import { C, CornerBrackets } from "./HudChrome.jsx";
import "./prototype.css";

// ─── constants ──────────────────────────────────────────────────────────────

const PLAYABLE = ["versari", "lakers", "goldgrass", "plainers"];

const A = import.meta.env.BASE_URL;
const PORTRAITS = {
  versari:   `${A}assets/portraits/factions/versari/versari_leader_1.webp`,
  lakers:    `${A}assets/portraits/factions/lakers/laker_leader_1.webp`,
  goldgrass: `${A}assets/portraits/factions/goldgrass/goldgrass_leader_1.webp`,
  plainers:  `${A}assets/portraits/factions/plainers/plainer_leader_1.webp`,
};

const TAGLINE = {
  versari:   "Disciplined infantry · garrison-oriented",
  lakers:    "Lakeshore mobility · fast skirmishers",
  goldgrass: "Resource coalition · deep economy",
  plainers:  "Wasteland raiders · opportunistic",
};

// Placeholder hex counts — ascending, placeholder values for UI display only.
const MAP_SIZES = [
  { id: "small",  label: "Small",  hexes: 30  },
  { id: "medium", label: "Medium", hexes: 54  },
  { id: "large",  label: "Large",  hexes: 85  },
  { id: "huge",   label: "Huge",   hexes: 128 },
];

const VICTORY_CONDITIONS = [
  {
    id: "conquest",
    label: "Conquest",
    desc: "Reach 12 Victory Points — the always-available path (§14.1).",
  },
  {
    id: "recognition",
    label: "Recognition",
    desc: "Diplomacy victory: earn Recognition from enough factions (§18.10).",
  },
  {
    id: "elimination",
    label: "Elimination",
    desc: "Last faction standing — all rivals eliminated.",
  },
];

const FREQ_LABELS = ["None", "Low", "Normal", "High"];
function freqLabel(v) {
  if (v <= 0.05) return "None";
  if (v <= 0.35) return "Low";
  if (v <= 0.69) return "Normal";
  return "High";
}

// ─── shared style helpers ───────────────────────────────────────────────────

const sectionLabelStyle = {
  fontFamily: C.font,
  fontSize: 10,
  letterSpacing: 3,
  textTransform: "uppercase",
  color: C.holoHi,
  fontWeight: 600,
  opacity: 0.82,
};

// ─── sub-components (file-local) ────────────────────────────────────────────

function FactionCard({ fid, picked, onPick }) {
  const f = UI_FACTIONS[fid];
  const on = picked === fid;
  return (
    <button
      onClick={() => onPick(fid)}
      className="hud-int"
      style={{
        position: "relative",
        textAlign: "left",
        padding: 0,
        borderRadius: 8,
        border: on ? `1.5px solid ${f.color}` : `1px solid rgba(86,211,198,0.20)`,
        background: on
          ? `linear-gradient(180deg, rgba(8,15,16,0.55), rgba(8,15,16,0.94)), linear-gradient(180deg, ${f.color}22, transparent)`
          : "linear-gradient(180deg, rgba(8,15,16,0.82), rgba(8,15,16,0.94))",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: on
          ? `0 0 20px ${f.color}88, inset 0 0 10px ${f.color}33`
          : `inset 0 0 6px rgba(86,211,198,0.04)`,
        transition: "box-shadow .18s ease, border-color .18s ease",
      }}
    >
      {on && (
        <div style={{
          position: "absolute", top: 0, left: 8, right: 8, height: 2,
          background: `linear-gradient(90deg, transparent, ${f.color}, transparent)`,
          opacity: 0.95, zIndex: 2,
        }} />
      )}
      <div style={{
        position: "relative",
        height: 180,
        background: "radial-gradient(ellipse at 50% 30%, rgba(86,211,198,0.07), rgba(4,10,11,0.5) 78%)",
        overflow: "hidden",
        borderBottom: `1px solid ${on ? f.color : "rgba(86,211,198,0.18)"}`,
      }}>
        <img src={PORTRAITS[fid]} alt={f.name} style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          height: "100%",
          objectFit: "cover",
          filter: on
            ? `saturate(1.05) drop-shadow(0 0 12px ${f.color}55)`
            : "saturate(0.7) brightness(0.78)",
          transition: "filter .22s ease",
        }} />
        <div className="hud-scanlines" style={{ position: "absolute", inset: 0 }} />
      </div>
      <div style={{ padding: "9px 11px 11px" }}>
        <div style={{
          fontFamily: C.font, fontSize: 13, fontWeight: 700,
          letterSpacing: 1.4, textTransform: "uppercase",
          color: f.color,
          textShadow: on ? `0 0 8px ${f.color}aa` : undefined,
          lineHeight: 1,
        }}>{f.name}</div>
        <div style={{
          fontFamily: C.font, fontSize: 9, letterSpacing: 1.1,
          textTransform: "uppercase",
          color: on ? "rgba(244,239,226,0.78)" : "rgba(143,246,234,0.45)",
          marginTop: 5, lineHeight: 1.35,
        }}>{TAGLINE[fid]}</div>
      </div>
      {on && (
        <div style={{
          position: "absolute", bottom: 8, right: 10,
          fontFamily: C.font, fontSize: 8.5,
          letterSpacing: 2, textTransform: "uppercase",
          color: f.color, fontWeight: 700,
          textShadow: `0 0 6px ${f.color}aa`,
        }}>◆ Selected</div>
      )}
    </button>
  );
}

// 4-option segmented button row
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid rgba(86,211,198,0.28)` }}>
      {options.map((opt, i) => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="hud-int"
            style={{
              flex: 1,
              fontFamily: C.font,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              padding: "8px 4px",
              border: "none",
              borderLeft: i > 0 ? `1px solid rgba(86,211,198,0.22)` : "none",
              background: on
                ? `linear-gradient(180deg, rgba(86,211,198,0.26), rgba(86,211,198,0.14))`
                : "rgba(6,12,13,0.72)",
              color: on ? C.holoHi : "rgba(143,246,234,0.48)",
              cursor: "pointer",
              textShadow: on ? `0 0 8px ${C.holo}` : undefined,
              boxShadow: on ? `inset 0 0 8px rgba(86,211,198,0.12)` : undefined,
              transition: "background .15s, color .15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Integer stepper (prev/next buttons + value display)
function Stepper({ value, min, max, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="hud-int"
        style={{
          width: 30, height: 30,
          fontFamily: C.font, fontSize: 16, fontWeight: 700,
          border: `1px solid rgba(86,211,198,0.35)`,
          borderRadius: 5,
          background: "rgba(6,12,13,0.8)",
          color: value <= min ? "rgba(86,211,198,0.22)" : C.holoHi,
          cursor: value <= min ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
          transition: "color .12s",
        }}
      >−</button>
      <div style={{
        minWidth: 40, textAlign: "center",
        fontFamily: C.font, fontSize: 22, fontWeight: 700,
        color: C.text,
        textShadow: `0 0 10px ${C.holo}66`,
        lineHeight: 1,
      }}>{value}</div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="hud-int"
        style={{
          width: 30, height: 30,
          fontFamily: C.font, fontSize: 16, fontWeight: 700,
          border: `1px solid rgba(86,211,198,0.35)`,
          borderRadius: 5,
          background: "rgba(6,12,13,0.8)",
          color: value >= max ? "rgba(86,211,198,0.22)" : C.holoHi,
          cursor: value >= max ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
          transition: "color .12s",
        }}
      >+</button>
      {label && (
        <span style={{
          fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.4,
          textTransform: "uppercase", color: "rgba(143,246,234,0.52)",
        }}>{label}</span>
      )}
    </div>
  );
}

// Boolean toggle pill
function Toggle({ value, onChange, label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <button
        onClick={() => onChange(!value)}
        className="hud-int"
        style={{
          flexShrink: 0,
          width: 42, height: 22,
          borderRadius: 11,
          border: `1px solid ${value ? C.holo : "rgba(86,211,198,0.28)"}`,
          background: value
            ? `linear-gradient(90deg, rgba(86,211,198,0.30), rgba(86,211,198,0.18))`
            : "rgba(6,12,13,0.8)",
          cursor: "pointer",
          position: "relative",
          transition: "background .15s, border-color .15s",
          boxShadow: value ? `0 0 8px ${C.holo}55` : undefined,
          padding: 0,
          marginTop: 1,
        }}
      >
        <span style={{
          position: "absolute",
          top: 3, left: value ? 22 : 3,
          width: 14, height: 14,
          borderRadius: "50%",
          background: value ? C.holoHi : "rgba(86,211,198,0.35)",
          boxShadow: value ? `0 0 6px ${C.holo}` : undefined,
          transition: "left .15s, background .15s",
        }} />
      </button>
      <div>
        <div style={{
          fontFamily: C.font, fontSize: 11.5, fontWeight: 700,
          letterSpacing: 1.2, textTransform: "uppercase",
          color: value ? C.text : "rgba(143,246,234,0.50)",
          transition: "color .15s",
        }}>{label}</div>
        {desc && (
          <div style={{
            fontFamily: C.font, fontSize: 9.5,
            color: "rgba(143,246,234,0.42)",
            marginTop: 2, lineHeight: 1.4,
          }}>{desc}</div>
        )}
      </div>
    </div>
  );
}

// Horizontal range slider with label
function Slider({ value, onChange, label }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <div style={{ ...sectionLabelStyle, opacity: 0.70, fontSize: 9.5 }}>{label}</div>
        <div style={{
          fontFamily: C.font, fontSize: 11, fontWeight: 700,
          color: C.holoHi, letterSpacing: 1,
        }}>{freqLabel(value)} <span style={{ color: "rgba(143,246,234,0.40)", fontWeight: 400 }}>({pct}%)</span></div>
      </div>
      <div style={{ position: "relative", height: 18, display: "flex", alignItems: "center" }}>
        {/* track */}
        <div style={{
          position: "absolute", left: 0, right: 0, height: 3,
          borderRadius: 2,
          background: "rgba(86,211,198,0.14)",
          border: "1px solid rgba(86,211,198,0.22)",
        }} />
        {/* fill */}
        <div style={{
          position: "absolute", left: 0,
          width: `${pct}%`, height: 3,
          borderRadius: 2,
          background: `linear-gradient(90deg, rgba(86,211,198,0.50), ${C.holoHi})`,
          boxShadow: `0 0 6px ${C.holo}66`,
          pointerEvents: "none",
        }} />
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="hud-int"
          style={{
            position: "relative",
            width: "100%",
            appearance: "none",
            WebkitAppearance: "none",
            background: "transparent",
            outline: "none",
            cursor: "pointer",
            margin: 0,
            padding: 0,
            height: 18,
            // thumb styling via global CSS not available — keep minimal
          }}
        />
      </div>
    </div>
  );
}

// Divider line
function Divider() {
  return (
    <div style={{
      height: 1,
      background: `linear-gradient(90deg, transparent, rgba(86,211,198,0.22), transparent)`,
      margin: "4px 0",
    }} />
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function SetupScreen({ onStart, onBack }) {
  // faction picker
  const [picked, setPicked] = useState("versari");

  // map & player config
  const [mapSize, setMapSize] = useState("small");
  const [factionCount, setFactionCount] = useState(4);

  // victory conditions — all on by default; guard: ≥1 must stay enabled
  const [victory, setVictory] = useState({ conquest: true, recognition: true, elimination: true });

  // advanced settings (collapsible)
  const [advOpen, setAdvOpen] = useState(false);
  const [fieldFreq, setFieldFreq] = useState(0.5);
  const [worldFreq, setWorldFreq] = useState(0.5);
  const [minorFactions, setMinorFactions] = useState(true);
  const [fogOfWar, setFogOfWar] = useState(true);
  const [seedText, setSeedText] = useState("");

  // guard: prevent disabling the last active victory condition
  function toggleVictory(id) {
    const next = { ...victory, [id]: !victory[id] };
    const anyOn = Object.values(next).some(Boolean);
    if (!anyOn) return; // refuse — must keep at least one
    setVictory(next);
  }

  function start() {
    const seed = Number(seedText) || Math.floor(Math.random() * 1e9);
    onStart({
      key: `${seed}:${picked}:${Date.now()}`,
      seed,
      humanFactionId: picked,
      mapSize,
      factionCount,
      victory: { ...victory },
      encounters: { field: fieldFreq, world: worldFreq },
      minorFactions,
      fogOfWar,
    });
  }

  const selectedMap = MAP_SIZES.find((m) => m.id === mapSize);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100vw",
        background: "radial-gradient(ellipse at 50% 28%, #163132 0%, #0a1718 38%, #050a0b 78%, #03080a 100%)",
        color: C.text,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "28px 20px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* whole-screen subtle CRT scan */}
      <div className="hud-screen-scan" style={{ zIndex: 0, opacity: 0.55, position: "fixed" }} />

      {/* back button — top-left */}
      <motion.button
        onClick={onBack}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="hud-int"
        style={{
          position: "fixed",
          top: 20, left: 20,
          zIndex: 10,
          display: "flex", alignItems: "center", gap: 7,
          fontFamily: C.font, fontSize: 11, fontWeight: 700,
          letterSpacing: 2.2, textTransform: "uppercase",
          color: C.holoHi,
          background: "rgba(6,12,13,0.82)",
          border: `1px solid ${C.holo}55`,
          borderRadius: 6,
          padding: "8px 14px",
          cursor: "pointer",
          boxShadow: `0 0 10px rgba(86,211,198,0.12)`,
        }}
      >
        ◂ Back
      </motion.button>

      {/* header block */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.50, ease: "easeOut" }}
        style={{ textAlign: "center", marginBottom: 22, zIndex: 1, paddingTop: 4 }}
      >
        <div style={{
          fontFamily: C.font, fontSize: 10, letterSpacing: 4.2,
          textTransform: "uppercase", color: C.holoHi, opacity: 0.58,
          fontWeight: 600,
        }}>
          ◇ New Game ◇
        </div>
        <div style={{
          fontFamily: C.font, fontSize: 28, fontWeight: 800,
          letterSpacing: 3.5, textTransform: "uppercase", marginTop: 5,
          color: "#f4efe2",
          textShadow: `0 0 12px ${C.holo}55, 0 0 24px ${C.holo}30`,
        }}>
          Configure <span style={{ color: C.holo }}>Match</span>
        </div>
        <div style={{
          fontFamily: C.font, fontSize: 10.5, letterSpacing: 2,
          textTransform: "uppercase", color: "rgba(143,246,234,0.50)",
          marginTop: 6,
        }}>
          Choose your faction and set the rules of engagement
        </div>
      </motion.div>

      {/* main panel */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 230, damping: 24 }}
        style={{
          position: "relative",
          width: 980,
          maxWidth: "94vw",
          padding: "26px 26px 28px",
          background: "linear-gradient(158deg, rgba(16,28,29,0.85), rgba(8,15,16,0.88) 60%, rgba(6,11,12,0.92))",
          border: `1px solid ${C.holo}`,
          borderRadius: 10,
          boxShadow: `inset 0 0 30px rgba(86,211,198,0.06), 0 0 26px rgba(86,211,198,0.18), 0 14px 30px rgba(0,0,0,0.55)`,
          zIndex: 1,
        }}
      >
        {/* top holo accent */}
        <div style={{
          position: "absolute", top: 0, left: 20, right: 20, height: 2,
          background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`,
          opacity: 0.8, pointerEvents: "none",
        }} />
        <CornerBrackets color={C.holo} len={14} inset={6} w={1.6} />
        <div className="hud-scanlines" style={{
          position: "absolute", inset: 0, borderRadius: 10,
        }} />

        {/* two-column layout: left = faction, right = settings */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 24,
          position: "relative",
          alignItems: "start",
        }}>

          {/* ── LEFT: faction picker ─────────────────────────────── */}
          <div>
            <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>
              ▸ Select Faction
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
            }}>
              {PLAYABLE.map((fid) => (
                <FactionCard key={fid} fid={fid} picked={picked} onPick={setPicked} />
              ))}
            </div>
          </div>

          {/* ── RIGHT: settings column ───────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Map Size */}
            <div>
              <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>▸ Map Size</div>
              <Segmented
                options={MAP_SIZES}
                value={mapSize}
                onChange={setMapSize}
              />
              {selectedMap && (
                <div style={{
                  fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.2,
                  color: "rgba(143,246,234,0.42)", marginTop: 5,
                  textAlign: "center",
                }}>
                  ~{selectedMap.hexes} hexes
                </div>
              )}
            </div>

            <Divider />

            {/* Factions at Play */}
            <div>
              <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>▸ Factions at Play</div>
              <Stepper
                value={factionCount}
                min={2}
                max={4}
                onChange={setFactionCount}
                label="major factions"
              />
            </div>

            <Divider />

            {/* Victory Conditions */}
            <div>
              <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>▸ Victory Conditions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {VICTORY_CONDITIONS.map((vc) => {
                  const isOn = victory[vc.id];
                  const enabledCount = Object.values(victory).filter(Boolean).length;
                  const isLast = isOn && enabledCount === 1;
                  return (
                    <div key={vc.id} title={isLast ? "At least one victory condition must be enabled." : undefined}>
                      <Toggle
                        value={isOn}
                        onChange={() => toggleVictory(vc.id)}
                        label={vc.label}
                        desc={vc.desc}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Divider />

            {/* Additional Settings — collapsible */}
            <div>
              <button
                onClick={() => setAdvOpen((o) => !o)}
                className="hud-int"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(86,211,198,0.04)",
                  border: `1px solid rgba(86,211,198,${advOpen ? "0.38" : "0.20"})`,
                  borderRadius: advOpen ? "6px 6px 0 0" : 6,
                  padding: "9px 12px",
                  cursor: "pointer",
                  transition: "border-color .15s",
                }}
              >
                <span style={{
                  fontFamily: C.font, fontSize: 10, letterSpacing: 3,
                  textTransform: "uppercase", color: C.holoHi, fontWeight: 600,
                  opacity: 0.82,
                }}>
                  ▸ Additional Settings
                </span>
                <span style={{
                  fontFamily: C.font, fontSize: 13, color: C.holoHi,
                  opacity: 0.70,
                  transform: advOpen ? "rotate(180deg)" : "rotate(0deg)",
                  display: "inline-block",
                  transition: "transform .18s ease",
                }}>▾</span>
              </button>

              <AnimatePresence initial={false}>
                {advOpen && (
                  <motion.div
                    key="adv"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{
                      border: `1px solid rgba(86,211,198,0.20)`,
                      borderTop: "none",
                      borderRadius: "0 0 6px 6px",
                      padding: "14px 12px",
                      background: "rgba(6,12,13,0.45)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}>
                      {/* Encounter sliders */}
                      <Slider
                        label="Field Encounter Frequency"
                        value={fieldFreq}
                        onChange={setFieldFreq}
                      />
                      <Slider
                        label="World Encounter Frequency"
                        value={worldFreq}
                        onChange={setWorldFreq}
                      />

                      <Divider />

                      <Toggle
                        value={minorFactions}
                        onChange={setMinorFactions}
                        label="Minor Factions Spawn"
                        desc="Tempest, Croppers, Steel Traders and Dambarans appear on the board."
                      />
                      <Toggle
                        value={fogOfWar}
                        onChange={setFogOfWar}
                        label="Fog of War"
                        desc="Unexplored regions remain hidden until scouted."
                      />

                      <Divider />

                      {/* Seed input — moved here from the main row */}
                      <div>
                        <div style={{ ...sectionLabelStyle, fontSize: 9.5, marginBottom: 6 }}>
                          ▸ Seed <span style={{ opacity: 0.50, fontWeight: 400, letterSpacing: 1 }}>(optional — blank = random)</span>
                        </div>
                        <input
                          value={seedText}
                          onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="random"
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            background: "rgba(6,12,13,0.85)",
                            border: `1px solid ${C.holo}55`,
                            borderRadius: 5,
                            color: "#f4efe2",
                            fontFamily: C.font, fontSize: 13, letterSpacing: 2.2,
                            outline: "none",
                            boxSizing: "border-box",
                            boxShadow: `inset 0 0 8px rgba(86,211,198,0.07)`,
                            textTransform: "uppercase",
                            transition: "border-color .15s ease",
                          }}
                          onFocus={(e) => { e.target.style.borderColor = C.holoHi; }}
                          onBlur={(e) => { e.target.style.borderColor = `${C.holo}55`; }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
          {/* end RIGHT column */}
        </div>
        {/* end two-column grid */}

        {/* begin row */}
        <div style={{
          marginTop: 22,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 14,
          position: "relative",
        }}>
          <div style={{
            fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "rgba(143,246,234,0.38)",
          }}>
            {`${UI_FACTIONS[picked]?.name} · ${MAP_SIZES.find((m) => m.id === mapSize)?.label} Map · ${factionCount} Factions`}
          </div>
          <motion.button
            onClick={start}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="hud-int"
            style={{
              fontFamily: C.font, fontSize: 14, fontWeight: 700,
              letterSpacing: 3, textTransform: "uppercase",
              color: "#08100f",
              padding: "12px 36px", borderRadius: 6,
              border: `1px solid ${C.holo}`,
              background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
              boxShadow: `0 0 18px ${C.holo}88, 0 4px 12px rgba(0,0,0,0.6)`,
              cursor: "pointer",
            }}
          >
            Begin ▸
          </motion.button>
        </div>
      </motion.div>

      {/* footer */}
      <div style={{
        marginTop: 20,
        fontFamily: C.font, fontSize: 9, letterSpacing: 2.4,
        textTransform: "uppercase", color: "rgba(143,246,234,0.28)",
        zIndex: 1,
      }}>
        ▸ Ashland Conquest · v0.2 demo · Holographic build
      </div>
    </div>
  );
}
