// Anchors a replay annotation over a content-space point, centred horizontally
// and lifted clear of the hex.
//
// This exists because the obvious way to write it is broken. Putting
// `transform: "translate(-50%, -120%)"` in the same style object as framer's
// `x`/`y` silently loses the translate: framer writes the element's `transform`
// itself from those motion values, so the hand-written one is overwritten and
// the popup ends up with its TOP-LEFT corner on the hex centre instead of
// sitting centred above it. All three overlays had that bug.
//
// The fix is the shape AnimatedPawn already uses: framer moves an outer anchor
// that has no size and no transform of its own, and a plain inner div carries
// the offset. Nothing competes for `transform`.
import { motion } from "framer-motion";

export default function PopupAnchor({ center, children, rise = 10, zIndex = 8 }) {
  return (
    <motion.div
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex }}
      initial={{ x: center.x, y: center.y + rise, opacity: 0 }}
      animate={{ x: center.x, y: center.y, opacity: 1 }}
      exit={{ x: center.x, y: center.y - 8, opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, transform: "translate(-50%, -120%)" }}>
        {children}
      </div>
    </motion.div>
  );
}

// The shared box the annotations sit in. No positioning — PopupAnchor owns it.
export const popupBox = {
  minWidth: 150,
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(14,17,22,0.94)",
  boxShadow: "0 6px 22px rgba(0,0,0,0.6)",
  textAlign: "center",
  // Annotations name factions and outcomes; without this a long faction name
  // wraps mid-word and the box grows taller than the hex it is annotating.
  whiteSpace: "nowrap",
};
