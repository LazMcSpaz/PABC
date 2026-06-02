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
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const perp = { x: -uy, y: ux }; // 90° to the right of the arrow
  const promptW = 268;
  const promptOffset = 90;
  let px = midX + perp.x * promptOffset - promptW / 2;
  let py = midY + perp.y * promptOffset - 60;
  // Flip to the other side if it would clip the viewport.
  const vw = (typeof window !== "undefined" ? window.innerWidth : 1440);
  const vh = (typeof window !== "undefined" ? window.innerHeight : 900);
  if (px < 20 || px + promptW > vw - 20 || py < 20 || py + 120 > vh - 20) {
    px = midX - perp.x * promptOffset - promptW / 2;
    py = midY - perp.y * promptOffset - 60;
  }
  px = Math.max(12, Math.min(px, vw - promptW - 12));
  py = Math.max(12, Math.min(py, vh - 140));

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

      {/* Confirm prompt — small floating holo panel */}
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 24 }}
        style={{
          position: "fixed",
          left: px, top: py,
          width: promptW,
          padding: "14px 16px 12px",
          background: "linear-gradient(158deg, rgba(18,31,32,0.97), rgba(8,15,16,0.98))",
          border: `1px solid ${C.holo}`,
          borderRadius: 8,
          boxShadow: `0 0 24px rgba(86,211,198,0.32), 0 12px 26px rgba(0,0,0,0.55)`,
          color: "#cfd6dc",
        }}
      >
        <div style={{
          fontFamily: C.font, fontSize: 10.5, fontWeight: 600,
          letterSpacing: 2.4, textTransform: "uppercase",
          color: C.holoHi, marginBottom: 10,
          textShadow: `0 0 8px ${C.holo}66`,
        }}>Confirm Move</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={onCancel} className="hud-int" style={{
            flex: 1,
            fontFamily: C.font, fontSize: 11.5, fontWeight: 700,
            letterSpacing: 1.5, textTransform: "uppercase",
            padding: "8px 12px", borderRadius: 6,
            border: `1px solid ${C.holo}66`,
            background: "rgba(86,211,198,0.06)",
            color: C.holoHi, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={confirm} className="hud-int" style={{
            flex: 1,
            fontFamily: C.font, fontSize: 11.5, fontWeight: 700,
            letterSpacing: 1.5, textTransform: "uppercase",
            color: "#08100f", padding: "8px 12px", borderRadius: 6,
            border: `1px solid ${C.holo}`,
            background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
            boxShadow: `0 0 14px ${C.holo}66`,
            cursor: "pointer",
          }}>Confirm</button>
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 7,
          fontFamily: C.font, fontSize: 10.5, letterSpacing: 0.6,
          color: "rgba(143,246,234,0.7)", cursor: "pointer", userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
            style={{ accentColor: C.holo }}
          />
          Don't ask again
        </label>
      </motion.div>
    </motion.div>
  );
}
