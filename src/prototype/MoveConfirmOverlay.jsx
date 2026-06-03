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

export default function MoveConfirmOverlay({ unit, originHexId, destHexId, pathHexIds, ownerColor, onConfirm, onCancel, onSkipFuture }) {
  useEscClose(onCancel);
  const [skip, setSkip] = useState(false);
  const [pts, setPts] = useState(null); // screen-space centres along the route
  const pathKey = (pathHexIds && pathHexIds.length >= 2 ? pathHexIds : [originHexId, destHexId]).join(",");

  // Measure each hex centre along the unit's actual route (origin uses the
  // unit token's centre). Re-measured on resize / scroll so it tracks panning.
  useLayoutEffect(() => {
    const hexes = pathHexIds && pathHexIds.length >= 2 ? pathHexIds : [originHexId, destHexId];
    function measure() {
      const arr = hexes.map((h, i) =>
        (i === 0 && unit?.uid) ? (getUnitCenter(unit.uid) || getHexCenter(h)) : getHexCenter(h));
      return arr.every(Boolean) ? arr : null;
    }
    setPts(measure());
    const update = () => setPts(measure());
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [unit, originHexId, destHexId, pathKey]);

  if (!pts || pts.length < 2) return null;

  const origin = pts[0];
  const dest = pts[pts.length - 1];
  // Pull the endpoints inside each token (origin inside the ghost, dest inside
  // the preview pawn) along the first/last segment so the channel terminates
  // cleanly; interior waypoints follow the route verbatim.
  const inset = 17;
  const unitDir = (a, b) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x: Math.cos(ang), y: Math.sin(ang) };
  };
  const d0 = unitDir(pts[0], pts[1]);
  const dN = unitDir(pts[pts.length - 2], pts[pts.length - 1]);
  const start = { x: origin.x + d0.x * inset, y: origin.y + d0.y * inset };
  const end = { x: dest.x - dN.x * inset, y: dest.y - dN.y * inset };
  // The drawn channel: inset start, the interior waypoints, inset end.
  const poly = [start, ...pts.slice(1, -1), end];
  const polyStr = poly.map((p) => `${p.x},${p.y}`).join(" ");
  const startX = start.x, startY = start.y, endX = end.x, endY = end.y;
  // Pulse keyframes: travel through every waypoint, timed by cumulative length.
  const offX = poly.map((p) => p.x - start.x);
  const offY = poly.map((p) => p.y - start.y);
  let total = 0;
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    total += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    cum.push(total);
  }
  const times = total > 0 ? cum.map((c) => c / total) : poly.map((_, i) => i / (poly.length - 1));
  // Fade in over the first leg, then stay lit for the whole route (each repeat
  // loops back to the dark start). Keeps the pulse visible on single-leg moves.
  const pulseOpacity = poly.map((_, i) => (i === 0 ? 0 : 1));

  // Prompt: small, anchored to the right of the ghost (origin), flips
  // left only if it would clip the viewport right edge.
  const promptW = 138;
  const promptH = 56;
  const gap = 30;
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
          travelling pulses + a chevron arrowhead. The origin end fades
          out (no rounded cap) via a linear gradient on each stroke. */}
      <svg
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", opacity: 0.6 }}
      >
        <defs>
          <marker id="mc-head" markerWidth="20" markerHeight="20" refX="13" refY="10" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0 1 L18 10 L0 19 L6 10 Z" fill={C.holo}
              style={{ filter: `drop-shadow(0 0 5px ${C.holo})` }} />
            <path d="M3 4 L14 10 L3 16 L7 10 Z" fill="rgba(8,16,28,0.6)" />
          </marker>
          {/* Fade-from-origin gradients — opacity rises from 0 at the
              start to full by ~28% along the channel. */}
          <linearGradient id="mc-outer" gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
            <stop offset="0%" stopColor={C.holo} stopOpacity="0" />
            <stop offset="28%" stopColor={C.holo} stopOpacity="0.88" />
            <stop offset="100%" stopColor={C.holo} stopOpacity="0.88" />
          </linearGradient>
          <linearGradient id="mc-inner" gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
            <stop offset="0%" stopColor="#08101c" stopOpacity="0" />
            <stop offset="28%" stopColor="#08101c" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#08101c" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="mc-glow" gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
            <stop offset="0%" stopColor={C.holo} stopOpacity="0" />
            <stop offset="28%" stopColor={C.holo} stopOpacity="0.16" />
            <stop offset="100%" stopColor={C.holo} stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="mc-hi" gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
            <stop offset="0%" stopColor={C.holoHi} stopOpacity="0" />
            <stop offset="35%" stopColor={C.holoHi} stopOpacity="0.55" />
            <stop offset="100%" stopColor={C.holoHi} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Wide soft glow underlay (fading) — follows the route */}
        <polyline points={polyStr} fill="none"
          stroke="url(#mc-glow)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: "blur(3px)" }} />

        {/* Outer body — teal channel edges, with the arrowhead at the end */}
        <polyline points={polyStr} fill="none"
          stroke="url(#mc-outer)" strokeWidth="11" strokeLinecap="butt" strokeLinejoin="round"
          markerEnd="url(#mc-head)"
          style={{ filter: `drop-shadow(0 0 4px ${C.holo})` }} />

        {/* Inner core — dark/low-opacity centre that exposes the edges */}
        <polyline points={polyStr} fill="none"
          stroke="url(#mc-inner)" strokeWidth="6.5" strokeLinecap="butt" strokeLinejoin="round" />

        {/* Faint centerline highlight */}
        <polyline points={polyStr} fill="none"
          stroke="url(#mc-hi)" strokeWidth="0.7" strokeLinecap="butt" strokeLinejoin="round" />

        {/* Travelling pulses — staggered, flowing along every leg of the route */}
        {Array.from({ length: PULSES }).map((_, i) => {
          const delay = (i / PULSES) * 1.4;
          return (
            <motion.circle
              key={i}
              cx={startX} cy={startY} r="3.4"
              fill={C.holoHi}
              style={{ filter: `drop-shadow(0 0 7px ${C.holoHi}) drop-shadow(0 0 4px ${C.holo})` }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x: offX, y: offY, opacity: pulseOpacity }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "linear", delay, times }}
            />
          );
        })}
      </svg>

      {/* Preview pawn — the unit, rendered at the destination. The real
          unit token at the origin is dimmed (ghost) via the dimmedUnitUid
          prop threaded through HexBoard / Hex / UnitToken. */}
      <PreviewToken unit={unit} color={tokenColor} x={dest.x} y={dest.y} />

      {/* Compact confirm prompt — anchored beside the ghost. Only the
          Move button + a teal "Don't ask again" check live inside; the
          cancel control is a small × floating outside the top-right
          corner so the box itself stays minimal. */}
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, x: 4 }}
        animate={{ opacity: 0.7, scale: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.06, type: "spring", stiffness: 320, damping: 24 }}
        style={{
          position: "fixed",
          left: px, top: py,
          width: promptW,
          padding: "6px 8px 6px",
          background: "linear-gradient(158deg, rgba(16,28,29,0.78), rgba(6,12,13,0.82))",
          border: `1px solid ${C.holo}99`,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 4,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          boxShadow: `0 0 8px rgba(86,211,198,0.16), 0 3px 10px rgba(0,0,0,0.35)`,
          color: "#cfd6dc",
          zIndex: 52,
        }}
      >
        {/* Top-left tab outcropping */}
        <div style={{
          position: "absolute", top: -1, left: -1,
          width: 26, height: 5,
          background: C.holo,
          clipPath: "polygon(0 0, 100% 0, 86% 100%, 0 100%)",
          boxShadow: `0 0 4px ${C.holo}77`,
        }} />
        {/* Bottom-right chevron */}
        <div style={{
          position: "absolute", bottom: -1, right: 7,
          width: 12, height: 3,
          background: C.holo,
          clipPath: "polygon(0 0, 100% 0, 85% 100%, 15% 100%)",
          opacity: 0.55,
        }} />

        {/* Floating × outside top-right corner */}
        <button
          onClick={onCancel}
          title="Cancel move"
          style={{
            position: "absolute",
            top: -10, right: -10,
            width: 20, height: 20,
            borderRadius: "50%",
            background: "rgba(6,14,15,0.92)",
            border: `1px solid ${C.holo}aa`,
            color: C.holoHi,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: C.font, fontSize: 13, lineHeight: 1, fontWeight: 700,
            boxShadow: `0 0 6px rgba(86,211,198,0.28)`,
            padding: 0,
          }}
          className="hud-int"
        >×</button>

        {/* Confirm button — shorter (auto-width, centred) */}
        <button onClick={confirm} className="hud-int" style={{
          display: "block",
          margin: "0 auto 6px",
          fontFamily: C.font, fontSize: 10, fontWeight: 700,
          letterSpacing: 1.4, textTransform: "uppercase",
          color: "#08100f", padding: "4px 16px", borderRadius: 3,
          border: `1px solid ${C.holo}`,
          background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
          boxShadow: `0 0 8px ${C.holo}55`,
          cursor: "pointer",
        }}>Move</button>

        {/* Don't ask again — custom teal checkbox (not OS-white) */}
        <label
          onClick={() => setSkip((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.4,
            color: "rgba(143,246,234,0.62)", cursor: "pointer", userSelect: "none",
            marginLeft: 1,
          }}
        >
          <span style={{
            width: 10, height: 10,
            border: `1px solid ${C.holo}99`,
            borderRadius: 2,
            background: skip ? C.holo : "rgba(86,211,198,0.08)",
            boxShadow: skip ? `0 0 5px ${C.holo}88` : undefined,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: "background .12s ease, box-shadow .12s ease",
          }}>
            {skip && <span style={{ fontFamily: C.font, fontSize: 8, color: "#08100f", fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </span>
          Don't ask again
        </label>
      </motion.div>
    </div>
  );
}
