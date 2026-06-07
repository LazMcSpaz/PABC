/**
 * TitleScreen.jsx — Main menu / title screen for Ashland Conquest.
 *
 * This is the first thing the player sees before the SetupScreen. It renders
 * the game title, a placeholder splash-art region, and a vertical navigation
 * menu with up to five items: New Game, Continue, Load Game, Lore, Settings.
 *
 * GREYING CONTRACT
 * ----------------
 * Each menu item is enabled IFF its corresponding handler prop is a function.
 *   New Game  → onNewGame
 *   Continue  → onContinue
 *   Load Game → onLoadGame
 *   Lore      → onLore
 *   Settings  → onSettings
 *
 * If a prop is null/undefined the item is rendered with reduced opacity
 * (0.32), a "not-allowed" cursor, no hover glow, and the leading glyph is
 * kept invisible. The supervisor controls availability by passing or omitting
 * these handlers — nothing is hardcoded as always-disabled here.
 *
 * SPLASH IMAGE SLOT
 * -----------------
 * There is a clearly-bordered placeholder box in the title block. When art is
 * ready, replace the inner <div> labelled "FUTURE <img> GOES HERE" with a
 * standard <img> element.
 *
 * Props
 * -----
 * onNewGame  {function|null}
 * onContinue {function|null}
 * onLoadGame {function|null}
 * onLore     {function|null}
 * onSettings {function|null}
 * version    {string}  — optional, e.g. "v0.2 demo"
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { C, CornerBrackets } from "./HudChrome.jsx";
import "./prototype.css";

// ---------------------------------------------------------------------------
// Menu item definitions (ordered as specified)
// ---------------------------------------------------------------------------
const MENU_ITEMS = [
  { label: "New Game",  prop: "onNewGame"  },
  { label: "Continue",  prop: "onContinue" },
  { label: "Load Game", prop: "onLoadGame" },
  { label: "Lore",      prop: "onLore"     },
  { label: "Settings",  prop: "onSettings" },
];

// ---------------------------------------------------------------------------
// MenuItem — a single interactive row in the vertical menu
// ---------------------------------------------------------------------------
function MenuItem({ label, handler, index }) {
  const [hovered, setHovered] = useState(false);
  const enabled = typeof handler === "function";
  const active = enabled && hovered;

  return (
    <motion.button
      // stagger entrance driven by parent container, index used for delay
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: enabled ? 1 : 0.32, x: 0 }}
      transition={{ duration: 0.38, ease: "easeOut", delay: 0.55 + index * 0.08 }}
      className={enabled ? "hud-int" : undefined}
      disabled={!enabled}
      onClick={enabled ? handler : undefined}
      onMouseEnter={() => enabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            14,
        width:          "100%",
        padding:        "13px 18px 13px 16px",
        background:     active
          ? `linear-gradient(90deg, rgba(86,211,198,0.10), rgba(86,211,198,0.04) 70%, transparent)`
          : "transparent",
        border:         "none",
        borderLeft:     active
          ? `2px solid ${C.holoHi}`
          : `2px solid ${enabled ? "rgba(86,211,198,0.22)" : "rgba(86,211,198,0.08)"}`,
        borderRadius:   0,
        cursor:         enabled ? "pointer" : "not-allowed",
        textAlign:      "left",
        transition:     "background .16s ease, border-color .16s ease",
        position:       "relative",
        // subtle right-to-left scan line on hover
        overflow:       "hidden",
      }}
    >
      {/* leading glyph — only glows when active */}
      <span
        style={{
          fontFamily:  C.font,
          fontSize:    13,
          color:       active ? C.holoHi : (enabled ? `${C.holo}66` : "transparent"),
          textShadow:  active ? `0 0 8px ${C.holo}` : "none",
          transition:  "color .16s ease, text-shadow .16s ease",
          userSelect:  "none",
          flexShrink:  0,
          width:       14,
          display:     "inline-block",
          lineHeight:  1,
        }}
        aria-hidden="true"
      >
        ▸
      </span>

      {/* label */}
      <span
        style={{
          fontFamily:    C.font,
          fontWeight:    700,
          fontSize:      26,
          letterSpacing: 3.2,
          textTransform: "uppercase",
          color:         active ? C.holoHi : (enabled ? C.text : C.textFaint),
          textShadow:    active
            ? `0 0 14px ${C.holo}88, 0 0 28px ${C.holo}44`
            : "none",
          transition:    "color .16s ease, text-shadow .16s ease",
          lineHeight:    1,
        }}
      >
        {label}
      </span>

      {/* right accent line on hover */}
      {active && (
        <span
          style={{
            position:   "absolute",
            right:      18,
            top:        "50%",
            transform:  "translateY(-50%)",
            width:      24,
            height:     1.5,
            background: `linear-gradient(90deg, transparent, ${C.holoHi})`,
            opacity:    0.7,
          }}
        />
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// TitleScreen — the exported default component
// ---------------------------------------------------------------------------
export default function TitleScreen({
  onNewGame,
  onContinue,
  onLoadGame,
  onLore,
  onSettings,
  version = "v0.2 demo",
}) {
  const handlers = { onNewGame, onContinue, onLoadGame, onLore, onSettings };

  return (
    <div
      style={{
        position:   "relative",
        height:     "100vh",
        width:      "100vw",
        background: "radial-gradient(ellipse at 50% 28%, #163132 0%, #0a1718 38%, #050a0b 78%, #03080a 100%)",
        color:      C.text,
        overflow:   "hidden",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* ── full-screen CRT overlay ── */}
      <div className="hud-screen-scan" style={{ zIndex: 0, opacity: 0.5 }} />

      {/* ── decorative radial halo behind content ── */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse 60% 48% at 50% 46%, rgba(86,211,198,0.055) 0%, transparent 72%)",
          pointerEvents: "none",
          zIndex:     0,
        }}
      />

      {/* ── main layout: left = title + splash, right = menu ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          position:       "relative",
          zIndex:         1,
          display:        "flex",
          flexDirection:  "row",
          alignItems:     "center",
          gap:            56,
          maxWidth:       "96vw",
          width:          1100,
        }}
      >
        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN: game title text + splash image placeholder
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "flex-start",
            gap:            28,
            flex:           "0 0 auto",
          }}
        >
          {/* — eyebrow label — */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            style={{
              fontFamily:    C.font,
              fontSize:      10,
              letterSpacing: 4.4,
              textTransform: "uppercase",
              color:         C.holoHi,
              opacity:       0.58,
              fontWeight:    600,
            }}
          >
            ◇ Encounter Network · Title Standby ◇
          </motion.div>

          {/* — game title — */}
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.18 }}
            style={{
              fontFamily:    C.font,
              fontWeight:    800,
              fontSize:      62,
              letterSpacing: 5.5,
              textTransform: "uppercase",
              lineHeight:    0.95,
              color:         "#f4efe2",
              textShadow:    `0 0 18px ${C.holo}55, 0 0 38px ${C.holo}30`,
            }}
          >
            Ashland{" "}
            <span
              style={{
                color:      C.holo,
                textShadow: `0 0 18px ${C.holoHi}88, 0 0 36px ${C.holo}66`,
              }}
            >
              Conquest
            </span>
          </motion.div>

          {/* — tagline — */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.35 }}
            style={{
              fontFamily:    C.font,
              fontSize:      11.5,
              letterSpacing: 2.4,
              textTransform: "uppercase",
              color:         `rgba(143,246,234,0.50)`,
            }}
          >
            Lead one faction · twelve VP claim the wasteland
          </motion.div>

          {/* ──────────────────────────────────────────────────────────────
              SPLASH IMAGE PLACEHOLDER
              When art is ready:
                1. Remove the inner placeholder <div> below.
                2. Add: <img src={yourSplashUrl} alt="Ashland Conquest splash"
                              style={{ width: "100%", height: "100%",
                                       objectFit: "cover", borderRadius: 6 }} />
                3. Optionally keep the CornerBrackets overlay.
          ────────────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.3 }}
            style={{
              position:     "relative",
              width:        380,
              height:       220,
              borderRadius: 7,
              border:       `1px dashed rgba(86,211,198,0.40)`,
              background:   "linear-gradient(158deg, rgba(16,28,29,0.75), rgba(8,15,16,0.88))",
              boxShadow:    `inset 0 0 22px rgba(86,211,198,0.06), 0 0 18px rgba(86,211,198,0.12)`,
              overflow:     "hidden",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
            }}
          >
            {/* scanline texture on the placeholder box */}
            <div className="hud-scanlines" style={{ position: "absolute", inset: 0, borderRadius: 7 }} />

            {/* FUTURE <img> GOES HERE — drop your splash art <img> in place of this div */}
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           8,
                pointerEvents: "none",
                userSelect:    "none",
              }}
            >
              <span
                style={{
                  fontFamily:    C.font,
                  fontSize:      10.5,
                  letterSpacing: 3.2,
                  textTransform: "uppercase",
                  color:         `rgba(86,211,198,0.28)`,
                  fontWeight:    600,
                  textAlign:     "center",
                }}
              >
                ◇ TITLE SPLASH — ART PENDING ◇
              </span>
              <span
                style={{
                  fontSize:      9,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color:         `rgba(86,211,198,0.16)`,
                  fontFamily:    C.font,
                }}
              >
                380 × 220
              </span>
            </div>

            {/* corner brackets accent for the splash slot */}
            <CornerBrackets color={`rgba(86,211,198,0.35)`} len={18} inset={8} w={1.5} />

            {/* top glint */}
            <div
              style={{
                position:   "absolute",
                top:        0,
                left:       20,
                right:      20,
                height:     1.5,
                background: `linear-gradient(90deg, transparent, rgba(143,246,234,0.35), transparent)`,
                pointerEvents: "none",
              }}
            />
          </motion.div>
          {/* END SPLASH IMAGE PLACEHOLDER */}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN: navigation menu panel
        ══════════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, x: 22, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 24, delay: 0.22 }}
          style={{
            position:     "relative",
            flex:         1,
            minWidth:     320,
            maxWidth:     400,
            background:   "linear-gradient(158deg, rgba(16,28,29,0.88), rgba(8,15,16,0.92) 60%, rgba(6,11,12,0.95))",
            border:       `1px solid ${C.holo}`,
            borderRadius: 10,
            boxShadow:    `inset 0 0 30px rgba(86,211,198,0.06), 0 0 26px rgba(86,211,198,0.20), 0 14px 34px rgba(0,0,0,0.60)`,
            overflow:     "hidden",
          }}
        >
          {/* top holo accent bar */}
          <div
            style={{
              position:   "absolute",
              top:        0,
              left:       20,
              right:      20,
              height:     2,
              background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`,
              opacity:    0.75,
              pointerEvents: "none",
              zIndex:     2,
            }}
          />

          {/* scanlines overlay */}
          <div className="hud-scanlines" style={{ position: "absolute", inset: 0, borderRadius: 10 }} />

          {/* corner brackets */}
          <CornerBrackets color={C.holo} len={14} inset={7} w={1.6} />

          {/* section eyebrow */}
          <div
            style={{
              position:      "relative",
              padding:       "20px 22px 10px",
              fontFamily:    C.font,
              fontSize:      9.5,
              letterSpacing: 3.2,
              textTransform: "uppercase",
              color:         C.holoHi,
              fontWeight:    600,
              opacity:       0.7,
            }}
          >
            ▸ Main Menu
          </div>

          {/* horizontal divider */}
          <div
            style={{
              height:     1,
              margin:     "0 18px 6px",
              background: `linear-gradient(90deg, transparent, rgba(86,211,198,0.30), transparent)`,
            }}
          />

          {/* menu items */}
          <nav
            style={{
              position: "relative",
              padding:  "6px 0 12px",
            }}
          >
            {MENU_ITEMS.map((item, i) => (
              <MenuItem
                key={item.prop}
                label={item.label}
                handler={handlers[item.prop]}
                index={i}
              />
            ))}
          </nav>
        </motion.div>
      </motion.div>

      {/* ── footer ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.9 }}
        style={{
          position:      "absolute",
          bottom:        18,
          left:          0,
          right:         0,
          textAlign:     "center",
          fontFamily:    C.font,
          fontSize:      9,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          color:         "rgba(143,246,234,0.28)",
          zIndex:        1,
          pointerEvents: "none",
        }}
      >
        ▸ Ashland Conquest · {version} · Holographic Build
      </motion.div>
    </div>
  );
}
