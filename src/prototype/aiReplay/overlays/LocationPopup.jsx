// A one-line annotation anchored over a Location hex during an AI replay —
// "Construction finished (Drilled Troops)", "Unit reinforced", "Sabotaged —
// Loyalty falls", etc. Fades up / down (host AnimatePresence).
import { motion } from "framer-motion";
import { theme } from "../../data.js";

export default function LocationPopup({ center, text }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: "translate(-50%, -120%)",
        x: center.x,
        y: center.y,
        pointerEvents: "none",
        zIndex: 8,
        padding: "5px 11px",
        borderRadius: 7,
        background: "rgba(14,17,22,0.92)",
        border: `1px solid ${theme.borderLit}`,
        boxShadow: "0 5px 18px rgba(0,0,0,0.55)",
        whiteSpace: "nowrap",
        fontFamily: theme.fontDisplay,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.4,
        color: theme.text,
      }}
      initial={{ opacity: 0, y: center.y + 8 }}
      animate={{ opacity: 1, y: center.y }}
      exit={{ opacity: 0, y: center.y - 8 }}
      transition={{ duration: 0.16 }}
    >
      {text}
    </motion.div>
  );
}
