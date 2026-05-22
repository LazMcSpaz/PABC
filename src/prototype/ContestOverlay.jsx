// Contest resolution overlay — a scripted replay of a contest the
// player just initiated. The engine has already resolved it (the board
// behind reflects the outcome); this dramatises the dice.
//
// Timeline (per the design):
//   0–2s  both dice flash random faces
//   2s    left (attacker) die locks + emphasis pop
//   3s    attacker total appears + pop
//   5s    right (defender) die locks + pop
//   6s    defender total appears + pop
//   6.3s  winner banner + Exit button
import { useEffect, useRef, useState } from "react";
import { theme } from "./data.js";
import { Btn } from "./kit.jsx";

function ValueBlock({ label, base, calculated, align }) {
  const showArrow = calculated != null && calculated !== base;
  return (
    <div style={{ textAlign: align }}>
      <div
        style={{
          fontSize: 8.5,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: theme.textFaint,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 15,
          fontWeight: 700,
          color: theme.textDim,
        }}
      >
        {base}
        {showArrow && (
          <>
            <span style={{ color: theme.textFaint }}> → </span>
            <span style={{ color: theme.text }}>{calculated}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DieSquare({ value, locked, color }) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 10,
        background: locked
          ? `linear-gradient(160deg, ${color}33, #1a1610)`
          : "linear-gradient(160deg, #2a2419, #16120c)",
        border: `2px solid ${locked ? color : theme.border}`,
        boxShadow: locked
          ? `0 0 16px ${color}88, inset 0 1px 2px rgba(255,255,255,0.1)`
          : "inset 0 1px 2px rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        key={locked ? `lock-${value}` : "rolling"}
        className={locked ? "pc-emph" : undefined}
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 34,
          fontWeight: 700,
          color: locked ? theme.text : theme.textDim,
          opacity: locked ? 1 : 0.7,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Total({ show, value, color }) {
  return (
    <div style={{ height: 30, marginTop: 8 }}>
      {show && (
        <span
          key={`total-${value}`}
          className="pc-emph"
          style={{
            display: "inline-block",
            fontFamily: theme.fontDisplay,
            fontSize: 26,
            fontWeight: 800,
            color,
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

// v0.2 §16.4 — the attrition aftermath: who bled, who died, what was
// salvaged. Rendered under the winner banner.
function AttritionLine({ viz }) {
  if (viz.cancelled) return null;
  const parts = [];
  if (viz.attackerStrLost > 0) parts.push(`${viz.attacker.name} −${viz.attackerStrLost} Str`);
  if (viz.defenderStrLost > 0) parts.push(`${viz.defender.name} −${viz.defenderStrLost} Str`);
  const killCount = (viz.killed || []).length;
  if (killCount > 0) parts.push(`${killCount} unit${killCount === 1 ? "" : "s"} destroyed`);
  const salvageCount = (viz.salvage || []).length;
  if (salvageCount > 0) parts.push(`salvaged ${salvageCount} chip${salvageCount === 1 ? "" : "s"}`);
  if (!parts.length) return null;
  return (
    <div
      style={{
        marginTop: 6,
        fontSize: 11,
        letterSpacing: 0.4,
        color: theme.textDim,
        fontWeight: 600,
      }}
    >
      {parts.join(" · ")}
    </div>
  );
}

export default function ContestOverlay({ viz, onClose }) {
  // phase: 0 rolling · 1 leftDie · 2 leftTotal · 3 rightDie · 4 rightTotal · 5 done
  const [phase, setPhase] = useState(viz.cancelled ? 5 : 0);
  const [flashL, setFlashL] = useState(1);
  const [flashR, setFlashR] = useState(1);
  const intervalRef = useRef(null);

  // Flash the dice that haven't locked yet.
  useEffect(() => {
    if (viz.cancelled) return undefined;
    intervalRef.current = setInterval(() => {
      if (phase < 1) setFlashL(1 + Math.floor(Math.random() * 6));
      if (phase < 3) setFlashR(1 + Math.floor(Math.random() * 6));
    }, 75);
    return () => clearInterval(intervalRef.current);
  }, [phase, viz.cancelled]);

  // Drive the scripted timeline.
  useEffect(() => {
    if (viz.cancelled) return undefined;
    const t = [
      setTimeout(() => setPhase(1), 2000),
      setTimeout(() => setPhase(2), 3000),
      setTimeout(() => setPhase(3), 5000),
      setTimeout(() => setPhase(4), 6000),
      setTimeout(() => setPhase(5), 6300),
    ];
    return () => t.forEach(clearTimeout);
  }, [viz.cancelled]);

  const leftLocked = phase >= 1;
  const rightLocked = phase >= 3;
  const a = viz.attacker;
  const d = viz.defender;
  const winnerText = viz.cancelled
    ? "Contest cancelled"
    : viz.won
      ? `${a.name} wins`
      : `${d.name} holds`;
  const winnerColor = viz.cancelled
    ? theme.textDim
    : viz.won
      ? a.color || theme.good
      : d.color || theme.accent;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 78,
        background: "rgba(0,0,0,0.74)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="pc-pop"
        style={{
          width: 560,
          maxWidth: "94vw",
          background: theme.plate,
          border: `1px solid ${theme.borderLit}`,
          borderRadius: 12,
          boxShadow: theme.shadowDeep,
          padding: "20px 26px 24px",
          // pc-pop's keyframe centres with a translate; this window is
          // already flex-centred, so neutralise that.
          animation: "none",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily: theme.fontDisplay,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: theme.textFaint,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Contest
        </div>

        {/* names + base/calc, pushed to the outer edges */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 16,
                fontWeight: 700,
                color: a.color || theme.text,
              }}
            >
              {a.name}
            </div>
            <div style={{ marginTop: 4 }}>
              <ValueBlock label={a.label} base={a.base} calculated={a.calculated} align="left" />
            </div>
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 16,
                fontWeight: 700,
                color: d.color || theme.text,
              }}
            >
              {d.name}
            </div>
            <div style={{ marginTop: 4 }}>
              <ValueBlock label={d.label} base={d.base} calculated={d.calculated} align="right" />
            </div>
          </div>
        </div>

        {/* dice in the centre, totals beneath */}
        {!viz.cancelled && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 30,
              marginTop: 22,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <DieSquare value={leftLocked ? a.roll : flashL} locked={leftLocked} color={a.color || theme.good} />
              <Total show={phase >= 2} value={a.total} color={a.color || theme.text} />
            </div>
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 16,
                fontWeight: 700,
                color: theme.textFaint,
                paddingTop: 20,
              }}
            >
              VS
            </div>
            <div style={{ textAlign: "center" }}>
              <DieSquare
                value={d.rollsDie ? (rightLocked ? d.roll : flashR) : "—"}
                locked={rightLocked}
                color={d.color || theme.accent}
              />
              <Total show={phase >= 4} value={d.total} color={d.color || theme.text} />
            </div>
          </div>
        )}

        {/* outcome + exit */}
        <div style={{ height: 64, marginTop: 14, textAlign: "center" }}>
          {phase >= 5 && (
            <>
              <div
                className="pc-emph"
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  color: winnerColor,
                }}
              >
                {winnerText}
              </div>
              {(viz.mods || []).length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, color: theme.textFaint, letterSpacing: 0.3 }}>
                  {viz.mods.join(" · ")}
                </div>
              )}
              <AttritionLine viz={viz} />
              <div style={{ marginTop: 12 }}>
                <Btn variant="primary" onClick={onClose}>
                  Exit
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
