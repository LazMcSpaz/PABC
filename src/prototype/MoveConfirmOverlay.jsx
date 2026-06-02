// Pre-move confirm. Shows where the unit would leave (ghost ring) and an
// animated holographic arrow into the destination, plus a tiny prompt
// asking the player to commit. The "Don't ask again" checkbox persists
// the preference so future moves skip this step.
//
// Hex positions are read straight from the DOM (every <Hex/> renders a
// `data-hex="<id>"` attribute) so we don't need the board's internal
// layout state. We re-measure on resize / scroll so the arrow tracks the
// board if the viewport pans.
import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { C, useEscClose } from "./HudChrome.jsx";

function getHexCenter(hexId) {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[data-hex="${CSS.escape(hexId)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

export default function MoveConfirmOverlay({ originHexId, destHexId, ownerColor, onConfirm, onCancel, onSkipFuture }) {
  useEscClose(onCancel);
  const [skip, setSkip] = useState(false);
  const [pos, setPos] = useState({ origin: null, dest: null });

  useLayoutEffect(() => {
    setPos({ origin: getHexCenter(originHexId), dest: getHexCenter(destHexId) });
  }, [originHexId, destHexId]);

  useEffect(() => {
    function update() {
      setPos({ origin: getHexCenter(originHexId), dest: getHexCenter(destHexId) });
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [originHexId, destHexId]);

  if (!pos.origin || !pos.dest) return null;

  const { origin, dest } = pos;
  const dx = dest.x - origin.x;
  const dy = dest.y - origin.y;
  const ang = Math.atan2(dy, dx);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  // Pull endpoints inside the tokens so the arrow doesn't cover them.
  const inset = 20;
  const startX = origin.x + ux * inset;
  const startY = origin.y + uy * inset;
  const endX = dest.x - ux * inset;
  const endY = dest.y - uy * inset;

  // Place the prompt off to the side of the arrow midpoint, on the
  // shorter clearance edge of the viewport.
  // Anchor the prompt next to the *origin* hex, set off perpendicular to
  // the move direction so it doesn't sit on top of the arrow or the ghost.
  const perp = { x: -uy, y: ux };
  const promptW = 188;
  const promptH = 96;
  const offsetPx = 58;
  const vw = (typeof window !== "undefined" ? window.innerWidth : 1440);
  const vh = (typeof window !== "undefined" ? window.innerHeight : 900);
  let px = origin.x + perp.x * offsetPx - promptW / 2;
  let py = origin.y + perp.y * offsetPx - promptH / 2;
  if (px < 12 || px + promptW > vw - 12 || py < 12 || py + promptH > vh - 12) {
    px = origin.x - perp.x * offsetPx - promptW / 2;
    py = origin.y - perp.y * offsetPx - promptH / 2;
  }
  px = Math.max(8, Math.min(px, vw - promptW - 8));
  py = Math.max(8, Math.min(py, vh - promptH - 8));

  function confirm() {
    if (skip) onSkipFuture?.();
    onConfirm();
  }

  const ghostColor = ownerColor || C.holoHi;
  const arrowColor = C.holo;
  const arrowHi = C.holoHi;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(4,8,8,0.36)", backdropFilter: "blur(1.5px)",
      }}
      onClick={onCancel}
    >
      {/* Ghost ring at the origin — pulses to mark where the unit left */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0.85, 0.5, 0.85], scale: [1, 1.08, 1] }}
        transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "fixed",
          left: origin.x - 19,
          top: origin.y - 19,
          width: 38, height: 38,
          borderRadius: "50%",
          border: `2px dashed ${ghostColor}`,
          background: `radial-gradient(circle at 50% 40%, ${ghostColor}26, transparent 70%)`,
          boxShadow: `0 0 16px ${ghostColor}aa, inset 0 0 10px ${ghostColor}55`,
          pointerEvents: "none",
        }}
      />

      {/* Arrow — dashed teal line with marching ants + drop-shadow glow */}
      <svg
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
      >
        <defs>
          <marker id="mc-head" markerWidth="14" markerHeight="14" refX="9" refY="7" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0 0 L14 7 L0 14 L4 7 Z" fill={arrowHi} style={{ filter: `drop-shadow(0 0 4px ${arrowColor})` }} />
          </marker>
        </defs>
        {/* fainter glow underlay */}
        <line x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={arrowColor} strokeWidth="6" opacity="0.18"
          style={{ filter: `blur(2px)` }} />
        {/* primary marching-ants line */}
        <motion.line
          x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={arrowColor} strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="9 6"
          markerEnd="url(#mc-head)"
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -30 }}
          transition={{ duration: 1, ease: "linear", repeat: Infinity }}
          style={{ filter: `drop-shadow(0 0 5px ${arrowColor})` }}
        />
      </svg>

      {/* Confirm prompt — small low-opacity holo chip anchored next to the
          origin. Decorative outcroppings on the top edge break up the
          rectangle so it reads as device chrome rather than a dialog. */}
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 3 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.08, type: "spring", stiffness: 300, damping: 24 }}
        style={{
          position: "fixed",
          left: px, top: py,
          width: promptW,
          padding: "9px 11px 8px",
          background: "linear-gradient(158deg, rgba(16,28,29,0.78), rgba(6,12,13,0.82))",
          border: `1px solid ${C.holo}99`,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 5,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 5,
          boxShadow: `0 0 10px rgba(86,211,198,0.18), 0 4px 12px rgba(0,0,0,0.4)`,
          color: "#cfd6dc",
        }}
      >
        {/* Top-left outcropping — small angled tab */}
        <div style={{
          position: "absolute", top: -1, left: -1,
          width: 34, height: 6,
          background: C.holo,
          clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)",
          boxShadow: `0 0 5px ${C.holo}77`,
        }} />
        {/* Mid-right accent notch */}
        <div style={{
          position: "absolute", top: -1, right: 18,
          width: 14, height: 4,
          background: C.holo,
          clipPath: "polygon(15% 0, 85% 0, 100% 100%, 0 100%)",
          opacity: 0.7,
        }} />
        {/* Bottom-right chevron */}
        <div style={{
          position: "absolute", bottom: -1, right: 10,
          width: 18, height: 4,
          background: C.holo,
          clipPath: "polygon(0 0, 100% 0, 86% 100%, 14% 100%)",
          opacity: 0.55,
        }} />

        <div style={{
          fontFamily: C.font, fontSize: 9, fontWeight: 600,
          letterSpacing: 2, textTransform: "uppercase",
          color: C.holoHi, marginBottom: 7, marginLeft: 2,
          opacity: 0.85,
        }}>Confirm Move</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
          <button onClick={onCancel} className="hud-int" style={{
            flex: 1,
            fontFamily: C.font, fontSize: 10, fontWeight: 700,
            letterSpacing: 1.2, textTransform: "uppercase",
            padding: "6px 8px", borderRadius: 4,
            border: `1px solid ${C.holo}55`,
            background: "rgba(86,211,198,0.05)",
            color: C.holoHi, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={confirm} className="hud-int" style={{
            flex: 1,
            fontFamily: C.font, fontSize: 10, fontWeight: 700,
            letterSpacing: 1.2, textTransform: "uppercase",
            color: "#08100f", padding: "6px 8px", borderRadius: 4,
            border: `1px solid ${C.holo}`,
            background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
            boxShadow: `0 0 10px ${C.holo}55`,
            cursor: "pointer",
          }}>Confirm</button>
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: C.font, fontSize: 9, letterSpacing: 0.4,
          color: "rgba(143,246,234,0.62)", cursor: "pointer", userSelect: "none",
          marginLeft: 2,
        }}>
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
            style={{ accentColor: C.holo, width: 11, height: 11 }}
          />
          Don't ask again
        </label>
      </motion.div>
    </motion.div>
  );
}
