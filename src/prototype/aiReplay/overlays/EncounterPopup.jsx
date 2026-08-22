// "{Faction} resolved an event" anchored over an encounter hex during an AI
// replay. Fades up / down (host AnimatePresence).
import { theme } from "../../data.js";
import PopupAnchor from "./PopupAnchor.jsx";

export default function EncounterPopup({ center, text }) {
  return (
    <PopupAnchor center={center} rise={8}>
      <div
        style={{
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
      >
        {text}
      </div>
    </PopupAnchor>
  );
}
