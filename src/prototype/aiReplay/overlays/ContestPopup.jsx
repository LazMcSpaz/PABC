// A contest annotation anchored over the contest hex during an AI replay:
// "Contest: {attacker} vs {defender}", a fast DiceTicker, and the outcome
// line from the attacker's POV. Fades up on mount, down on unmount (handled
// by the host's AnimatePresence). `terse` renders a one-line variant (e.g.
// "Unit lost") for destruction beats.
import { theme } from "../../data.js";
import DiceTicker from "./DiceTicker.jsx";
import PopupAnchor, { popupBox } from "./PopupAnchor.jsx";

export default function ContestPopup({ center, attackerName, defenderName, attackerColor, defenderColor, atkRoll, defRoll, defenderRolled, won, diceMs, terse }) {
  const outcomeColor = won ? theme.good : theme.accent2;
  return (
    <PopupAnchor center={center}>
      <div style={{ ...popupBox, border: `1px solid ${theme.borderLit}` }}>
        {terse ? (
          <div style={{ fontFamily: theme.fontDisplay, fontSize: 13, fontWeight: 800, color: theme.accent2, letterSpacing: 0.5 }}>
            {terse}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: theme.textFaint, marginBottom: 4 }}>
              Contest
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
              <span style={{ color: attackerColor }}>{attackerName}</span>
              <span style={{ color: theme.textFaint }}> vs </span>
              <span style={{ color: defenderColor }}>{defenderName}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <DiceTicker
                atkRoll={atkRoll}
                defRoll={defRoll}
                defenderRolled={defenderRolled}
                durationMs={diceMs}
                atkColor={attackerColor}
                defColor={defenderColor}
              />
            </div>
            <div style={{ fontFamily: theme.fontDisplay, fontSize: 13, fontWeight: 800, color: outcomeColor, letterSpacing: 0.6 }}>
              {won ? "ATTACKER WINS" : "DEFENDER HOLDS"}
            </div>
          </>
        )}
      </div>
    </PopupAnchor>
  );
}
