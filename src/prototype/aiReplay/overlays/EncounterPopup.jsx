// "{Faction} resolved an event" anchored over an encounter hex during an AI
// replay. Fades up / down (host AnimatePresence).
import { motion } from "framer-motion";
import { theme } from "../../data.js";

export default function EncounterPopup({ center, text }) {
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
        background: "rgba(19,31,39,0.94)",
        border: "1px solid #3c5b65",
        boxShadow: "0 5px 18px rgba(0,0,0,0.55)",
        whiteSpace: "nowrap",
        fontFamily: theme.fontDisplay,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.4,
        color: "#9fd0dd",
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
