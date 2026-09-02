// A one-line annotation anchored over a Location hex during an AI replay —
// "Construction finished (Drilled Troops)", "Unit reinforced", "Sabotaged —
// Loyalty falls", etc. Fades up / down (host AnimatePresence).
import { theme } from "../../data.js";
import PopupAnchor from "./PopupAnchor.jsx";

export default function LocationPopup({ center, text }) {
  return (
    <PopupAnchor center={center} rise={8}>
      <div
        style={{
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
      >
        {text}
      </div>
    </PopupAnchor>
  );
}
