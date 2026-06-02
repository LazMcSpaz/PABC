// A pair of dice digits that cycle to their final values over `durationMs`,
// then lock. On AI turns the host passes AI_DICE_MS (0.3× the human dice
// duration) so the roll always reads fast. A non-rolling defender (garrison
// with no unit) shows an em-dash.
import { useEffect, useRef, useState } from "react";
import { theme } from "../../data.js";

function Die({ value, color }) {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 5,
        background: "rgba(0,0,0,0.45)",
        border: `1.5px solid ${color || theme.borderLit}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.fontDisplay,
        fontWeight: 700,
        fontSize: 14,
        color: theme.text,
        boxShadow: `0 0 8px ${color || theme.accent}66`,
      }}
    >
      {value}
    </div>
  );
}

export default function DiceTicker({ atkRoll, defRoll, defenderRolled = true, durationMs = 600, atkColor, defColor }) {
  const [locked, setLocked] = useState(false);
  const [flashA, setFlashA] = useState(1);
  const [flashB, setFlashB] = useState(1);
  const intRef = useRef(null);

  useEffect(() => {
    if (durationMs <= 0) { setLocked(true); return undefined; }
    intRef.current = setInterval(() => {
      setFlashA(1 + Math.floor(Math.random() * 6));
      setFlashB(1 + Math.floor(Math.random() * 6));
    }, 70);
    const t = setTimeout(() => { clearInterval(intRef.current); setLocked(true); }, durationMs);
    return () => { clearInterval(intRef.current); clearTimeout(t); };
  }, [durationMs]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Die value={locked ? (atkRoll ?? "—") : flashA} color={atkColor} />
      <span style={{ color: theme.textFaint, fontSize: 11, fontWeight: 700 }}>vs</span>
      <Die value={defenderRolled ? (locked ? (defRoll ?? "—") : flashB) : "—"} color={defColor} />
    </div>
  );
}
