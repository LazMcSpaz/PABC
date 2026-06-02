// Pre-move confirm. Shows the unit at its destination (a "preview pawn")
// connected back to its origin (where the real unit is rendered dimmed —
// the ghost) by a channelled holographic arrow. A pulse of light travels
// along the arrow toward the destination while the player decides. A
// compact prompt sits to the right of the ghost (flips left only if it
// would clip the viewport).
//
// Token positions are read straight from the DOM:
//   - origin = the dimmed unit token's centre (data-unit-uid)
//   - dest   = the centre of the destination hex (data-hex)
// We re-measure on resize / scroll so everything tracks if the board pans.
import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { C, useEscClose } from "./HudChrome.jsx";

function getCenter(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function getUnitCenter(uid) {
  if (typeof document === "undefined") return null;
  return getCenter(document.querySelector(`[data-unit-uid="${CSS.escape(uid)}"]`));
}
function getHexCenter(hexId) {
  if (typeof document === "undefined") return null;
  return getCenter(document.querySelector(`[data-hex="${CSS.escape(hexId)}"]`));
}

function PreviewToken({ unit, color, x, y, size = 32 }) {
  const half = size / 2;
  return (
    <div style={{
      position: "fixed",
      left: x - half, top: y - half,
      width: size, height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 36% 30%, ${color}, #14110c 145%)`,
      border: `2px solid #100d09`,
      boxShadow: `0 3px 6px rgba(0,0,0,0.6), 0 0 14px ${C.holo}aa, 0 0 8px ${color}77, inset 0 1px 2px rgba(255,255,255,0.3)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
      zIndex: 51,
    }}>
      <span style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, color: "#fff" }}>
        {(unit?.name || "U")[0]}
      </span>
    </div>
  );
}

export default function MoveConfirmOverlay({ unit, originHexId, destHexId, ownerColor, onConfirm, onCancel, onSkipFuture }) {
  useEscClose(onCancel);
  const [skip, setSkip] = useState(false);
  const [pos, setPos] = useState({ origin: null, dest: null });

  useLayoutEffect(() => {
    setPos({
      origin: unit?.uid ? getUnitCenter(unit.uid) : getHexCenter(originHexId),
      dest: getHexCenter(destHexId),
    });
  }, [unit, originHexId, destHexId]);

  useEffect(() => {
    function update() {
      setPos({
        origin: unit?.uid ? getUnitCenter(unit.uid) : getHexCenter(originHexId),
        dest: getHexCenter(destHexId),
      });
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [unit, originHexId, destHexId]);

  if (!pos.origin || !pos.dest) return null;

  const { origin, dest } = pos;
  const dx = dest.x - origin.x;
  const dy = dest.y - origin.y;
  const ang = Math.atan2(dy, dx);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  // Pull endpoints inside each token (origin sits inside the ghost, dest
  // inside the preview pawn) so the channel terminates cleanly.
  const insetStart = 17;
  const insetEnd = 17;
  const startX = origin.x + ux * insetStart;
  const startY = origin.y + uy * insetStart;
  const endX = dest.x - ux * insetEnd;
  const endY = dest.y - uy * insetEnd;

  // Prompt: small, anchored to the right of the ghost (origin), flips
  // left only if it would clip the viewport right edge.
  const promptW = 168;
  const promptH = 78;
  const gap = 36;
  const vw = (typeof window !== "undefined" ? window.innerWidth : 1440);
  const vh = (typeof window !== "undefined" ? window.innerHeight : 900);
  let px = origin.x + gap;
  let py = origin.y - promptH / 2;
  if (px + promptW > vw - 12) {
    px = origin.x - gap - promptW;
  }
  px = Math.max(8, Math.min(px, vw - promptW - 8));
  py = Math.max(8, Math.min(py, vh - promptH - 8));

  function confirm() {
    if (skip) onSkipFuture?.();
    onConfirm();
  }

  const tokenColor = ownerColor || C.holoHi;
  const PULSES = 3; // staggered pulses for a continuous flowing channel

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "transparent" }}
    >
      {/* Holographic channelled arrow — outer teal edges, dark inner core,
          travelling pulses + a chevron arrowhead. */}
      <svg
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
      >
        <defs>
          {/* Bright arrowhead with subtle inner outline */}
          <marker id="mc-head" markerWidth="20" markerHeight="20" refX="13" refY="10" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0 1 L18 10 L0 19 L6 10 Z" fill={C.holo}
              style={{ filter: `drop-shadow(0 0 5px ${C.holo})` }} />
            <path d="M3 4 L14 10 L3 16 L7 10 Z" fill="rgba(8,16,28,0.6)" />
          </marker>
        </defs>

        {/* Wide soft glow underlay */}
        <line x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={C.holo} strokeWidth="18" strokeLinecap="round"
          opacity="0.14" style={{ filter: "blur(3px)" }} />

        {/* Outer body — the teal channel edges (full width) */}
        <line x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={C.holo} strokeWidth="11" strokeLinecap="round"
          opacity="0.85" markerEnd="url(#mc-head)"
          style={{ filter: `drop-shadow(0 0 4px ${C.holo})` }} />

        {/* Inner core — dark/low-opacity centre that exposes the edges */}
        <line x1={startX} y1={startY} x2={endX} y2={endY}
          stroke="rgba(8,16,28,0.7)" strokeWidth="6.5" strokeLinecap="round" />

        {/* Faint centerline highlight */}
        <line x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={C.holoHi} strokeWidth="0.7" strokeLinecap="round" opacity="0.55" />

        {/* Travelling pulses — staggered so light flows continuously */}
        {Array.from({ length: PULSES }).map((_, i) => {
          const delay = (i / PULSES) * 1.4;
          return (
            <motion.circle
              key={i}
              cx={startX} cy={startY} r="3.4"
              fill={C.holoHi}
              style={{ filter: `drop-shadow(0 0 7px ${C.holoHi}) drop-shadow(0 0 4px ${C.holo})` }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{
                x: [0, dx, dx],
                y: [0, dy, dy],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "linear",
                delay,
                times: [0, 0.08, 0.92, 1],
              }}
            />
          );
        })}
      </svg>

      {/* Preview pawn — the unit, rendered at the destination. The real
          unit token at the origin is dimmed (ghost) via the dimmedUnitUid
          prop threaded through HexBoard / Hex / UnitToken. */}
      <PreviewToken unit={unit} color={tokenColor} x={dest.x} y={dest.y} />

      {/* Compact confirm prompt — anchored beside the ghost. */}
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, x: 4 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 0.06, type: "spring", stiffness: 320, damping: 24 }}
        style={{
          position: "fixed",
          left: px, top: py,
          width: promptW,
          padding: "7px 9px 7px",
          background: "linear-gradient(158deg, rgba(16,28,29,0.78), rgba(6,12,13,0.82))",
          border: `1px solid ${C.holo}99`,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 5,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 5,
          boxShadow: `0 0 8px rgba(86,211,198,0.16), 0 3px 10px rgba(0,0,0,0.35)`,
          color: "#cfd6dc",
          zIndex: 52,
        }}
      >
        {/* Top-left tab outcropping */}
        <div style={{
          position: "absolute", top: -1, left: -1,
          width: 28, height: 5,
          background: C.holo,
          clipPath: "polygon(0 0, 100% 0, 86% 100%, 0 100%)",
          boxShadow: `0 0 4px ${C.holo}77`,
        }} />
        {/* Bottom-right chevron */}
        <div style={{
          position: "absolute", bottom: -1, right: 8,
          width: 14, height: 3,
          background: C.holo,
          clipPath: "polygon(0 0, 100% 0, 85% 100%, 15% 100%)",
          opacity: 0.55,
        }} />

        <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
          <button onClick={onCancel} className="hud-int" style={{
            flex: 1,
            fontFamily: C.font, fontSize: 9.5, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase",
            padding: "5px 6px", borderRadius: 3,
            border: `1px solid ${C.holo}55`,
            background: "rgba(86,211,198,0.05)",
            color: C.holoHi, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={confirm} className="hud-int" style={{
            flex: 1,
            fontFamily: C.font, fontSize: 9.5, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase",
            color: "#08100f", padding: "5px 6px", borderRadius: 3,
            border: `1px solid ${C.holo}`,
            background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
            boxShadow: `0 0 8px ${C.holo}55`,
            cursor: "pointer",
          }}>Move</button>
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 5,
          fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.4,
          color: "rgba(143,246,234,0.6)", cursor: "pointer", userSelect: "none",
          marginLeft: 1,
        }}>
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
            style={{ accentColor: C.holo, width: 10, height: 10 }}
          />
          Don't ask again
        </label>
      </motion.div>
    </div>
  );
}
