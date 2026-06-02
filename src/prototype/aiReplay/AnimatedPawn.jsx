// A unit token that slides between two content-space points during an AI
// replay hop. Lives in the board's transformed content layer, so it pans /
// zooms with the board. FOV-edge hops pass fadeIn / fadeOut so the pawn
// emerges from / dissolves into the dark at the visibility boundary.
import { motion } from "framer-motion";
import { theme } from "../data.js";

export default function AnimatedPawn({ fromCenter, toCenter, fadeIn, fadeOut, durationMs, color, label }) {
  const c = color || "#888";
  return (
    <motion.div
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 6 }}
      initial={{ x: fromCenter.x, y: fromCenter.y, opacity: fadeIn ? 0 : 1 }}
      animate={{ x: toCenter.x, y: toCenter.y, opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: Math.max(0, durationMs) / 1000, ease: "easeInOut" }}
    >
      <div
        style={{
          position: "absolute",
          left: -16,
          top: -16,
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: `radial-gradient(circle at 36% 30%, ${c}, #14110c 145%)`,
          border: "2px solid #100d09",
          boxShadow: `0 3px 8px rgba(0,0,0,0.65), 0 0 14px ${c}aa, inset 0 1px 2px rgba(255,255,255,0.3)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontFamily: theme.fontDisplay, fontSize: 13, fontWeight: 700, color: "#fff" }}>
          {label}
        </span>
      </div>
    </motion.div>
  );
}
