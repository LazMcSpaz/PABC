// Faction & seed picker. First thing the player sees on a fresh
// browser — calls onStart({seed, humanFactionId}) to hand control to
// the game screen. Holographic look-pass: scanlines, corner brackets,
// teal accents, and faction leader portraits for the four choices.
import { useState } from "react";
import { motion } from "framer-motion";
import { FACTIONS as UI_FACTIONS } from "./data.js";
import { C, CornerBrackets } from "./HudChrome.jsx";
import "./prototype.css";

const FACTIONS = ["versari", "lakers", "goldgrass", "plainers"];

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
      {/* portrait frame */}
      <div style={{
        position: "relative",
        height: 210,
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
      {/* details */}
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{
          fontFamily: C.font, fontSize: 14, fontWeight: 700,
          letterSpacing: 1.4, textTransform: "uppercase",
          color: f.color,
          textShadow: on ? `0 0 8px ${f.color}aa` : undefined,
          lineHeight: 1,
        }}>{f.name}</div>
        <div style={{
          fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.2,
          textTransform: "uppercase",
          color: on ? "rgba(244,239,226,0.78)" : "rgba(143,246,234,0.45)",
          marginTop: 6, lineHeight: 1.35,
        }}>{TAGLINE[fid]}</div>
      </div>
      {on && (
        <div style={{
          position: "absolute", bottom: 9, right: 12,
          fontFamily: C.font, fontSize: 8.5,
          letterSpacing: 2, textTransform: "uppercase",
          color: f.color, fontWeight: 700,
          textShadow: `0 0 6px ${f.color}aa`,
        }}>◆ Selected</div>
      )}
    </button>
  );
}

export default function SetupScreen({ onStart }) {
  const [picked, setPicked] = useState("versari");
  const [seedText, setSeedText] = useState("");

  function start() {
    const seed = Number(seedText) || Math.floor(Math.random() * 1e9);
    onStart({ seed, humanFactionId: picked, key: `${seed}:${picked}:${Date.now()}` });
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        width: "100vw",
        background: "radial-gradient(ellipse at 50% 28%, #163132 0%, #0a1718 38%, #050a0b 78%, #03080a 100%)",
        color: C.text,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {/* whole-screen subtle CRT scan */}
      <div className="hud-screen-scan" style={{ zIndex: 0, opacity: 0.55 }} />

      {/* title block */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        style={{ textAlign: "center", marginBottom: 26, zIndex: 1 }}
      >
        <div style={{
          fontFamily: C.font, fontSize: 10.5, letterSpacing: 4.4,
          textTransform: "uppercase", color: C.holoHi, opacity: 0.62,
          fontWeight: 600,
        }}>
          ◇ Encounter Network · Bridge Standby ◇
        </div>
        <div style={{
          fontFamily: C.font, fontSize: 48, fontWeight: 800,
          letterSpacing: 5.5, textTransform: "uppercase", marginTop: 6,
          color: "#f4efe2",
          textShadow: `0 0 16px ${C.holo}66, 0 0 30px ${C.holo}40`,
        }}>
          Ashland <span style={{ color: C.holo }}>Conquest</span>
        </div>
        <div style={{
          fontFamily: C.font, fontSize: 11.5, letterSpacing: 2.4,
          textTransform: "uppercase", color: "rgba(143,246,234,0.55)",
          marginTop: 8,
        }}>
          Lead one faction · twelve VP claim the wasteland
        </div>
      </motion.div>

      {/* main panel */}
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 24 }}
        style={{
          position: "relative",
          width: 900,
          maxWidth: "94vw",
          padding: 28,
          background: "linear-gradient(158deg, rgba(16,28,29,0.85), rgba(8,15,16,0.88) 60%, rgba(6,11,12,0.92))",
          border: `1px solid ${C.holo}`,
          borderRadius: 10,
          boxShadow: `inset 0 0 30px rgba(86,211,198,0.06), 0 0 26px rgba(86,211,198,0.20), 0 14px 30px rgba(0,0,0,0.55)`,
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

        {/* section label */}
        <div style={{
          fontFamily: C.font, fontSize: 10, letterSpacing: 3,
          textTransform: "uppercase", color: C.holoHi, fontWeight: 600,
          marginBottom: 14, opacity: 0.82,
          position: "relative",
        }}>
          ▸ Select Faction
        </div>

        {/* 4-up faction grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          position: "relative",
        }}>
          {FACTIONS.map((fid) => (
            <FactionCard key={fid} fid={fid} picked={picked} onPick={setPicked} />
          ))}
        </div>

        {/* seed + begin row */}
        <div style={{
          marginTop: 24, display: "flex", gap: 16, alignItems: "flex-end",
          position: "relative",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: C.font, fontSize: 10, letterSpacing: 3,
              textTransform: "uppercase", color: C.holoHi, fontWeight: 600,
              marginBottom: 6, opacity: 0.82,
            }}>▸ Seed (optional)</div>
            <input
              value={seedText}
              onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="random"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(6,12,13,0.85)",
                border: `1px solid ${C.holo}66`,
                borderRadius: 5,
                color: "#f4efe2",
                fontFamily: C.font, fontSize: 14, letterSpacing: 2.4,
                outline: "none",
                boxSizing: "border-box",
                boxShadow: `inset 0 0 8px rgba(86,211,198,0.08)`,
                textTransform: "uppercase",
                transition: "border-color .15s ease",
              }}
              onFocus={(e) => { e.target.style.borderColor = C.holoHi; }}
              onBlur={(e) => { e.target.style.borderColor = `${C.holo}66`; }}
            />
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
              padding: "12px 34px", borderRadius: 6,
              border: `1px solid ${C.holo}`,
              background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
              boxShadow: `0 0 18px ${C.holo}88, 0 4px 12px rgba(0,0,0,0.6)`,
              cursor: "pointer",
            }}
          >Begin ▸</motion.button>
        </div>
      </motion.div>

      {/* footer */}
      <div style={{
        marginTop: 22, fontFamily: C.font, fontSize: 9, letterSpacing: 2.4,
        textTransform: "uppercase", color: "rgba(143,246,234,0.32)",
        zIndex: 1,
      }}>
        ▸ Ashland Conquest · v0.2 demo · Holographic build
      </div>
    </div>
  );
}
