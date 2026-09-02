// The aftermath half of an encounter card.
//
// Picking a choice used to be the end of the card: the modal closed and the
// consequences happened off-screen. Two things were lost with it — the
// authored `outcomeText` (every one of the 314 quest choices carries one, and
// none of them had ever been on screen) and any sight of a narrative CONTEST
// or ROLL. Losing a unit to an unseen die is the worst version of that: the
// player is told the result by absence.
//
// So the card stays open and turns over. Same frame, same title; the choices
// are replaced by what came of them.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { C } from "./HudChrome.jsx";
import { RichText } from "./RichText.jsx";
import { TONE_COLOR } from "./encounterOutcome.js";
import { theme } from "./data.js";

// Contest dice are the board's own idiom (ContestOverlay replays a location
// contest exactly this way), so a narrative contest reads the same: tumble,
// lock, total, verdict. Deliberately quicker than the board version — this
// one fires several times a round, not once.
const TUMBLE_MS = 620;
const LOCK_GAP_MS = 260;

function Die({ face, locked, color, sides }) {
  const [rolling, setRolling] = useState(1);
  useEffect(() => {
    if (locked) return undefined;
    const t = setInterval(() => setRolling(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(t);
  }, [locked, sides]);
  return (
    <div style={{
      width: 46, height: 46, borderRadius: 8,
      background: locked
        ? `linear-gradient(158deg, ${color}2e, rgba(8,16,17,0.95))`
        : "linear-gradient(158deg, rgba(30,40,42,0.9), rgba(8,14,15,0.95))",
      border: `1.5px solid ${locked ? color : "rgba(86,211,198,0.28)"}`,
      boxShadow: locked ? `0 0 14px ${color}77, inset 0 1px 0 rgba(255,255,255,0.08)` : "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "border-color .16s ease, box-shadow .16s ease",
    }}>
      <span
        key={locked ? `l${face}` : "r"}
        className={locked ? "pc-emph" : undefined}
        style={{
          fontFamily: C.font, fontSize: 24, fontWeight: 700,
          color: locked ? C.text : C.textFaint,
        }}
      >{locked ? face : rolling}</span>
    </div>
  );
}

// One side of the contest: who, the arithmetic that built the total, the die,
// the total. The breakdown matters more here than on the board — a narrative
// contest's opposition is an authored number the player has never seen, so
// "5 + die" is the only place it is ever stated.
function Side({ label, parts, die, sides, locked, showTotal, total, color, align }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align, gap: 6, minWidth: 96 }}>
      <div style={{
        fontFamily: C.font, fontSize: 9, fontWeight: 700, letterSpacing: 1.8,
        textTransform: "uppercase", color: C.textDim,
      }}>{label}</div>
      <Die face={die} locked={locked} color={color} sides={sides} />
      <div style={{ fontSize: 10, color: C.textFaint, fontFamily: C.font, letterSpacing: 0.6 }}>
        {parts}
      </div>
      <div style={{ height: 30 }}>
        {showTotal && (
          <span className="pc-emph" style={{
            fontFamily: C.font, fontSize: 22, fontWeight: 800, color,
          }}>{total}</span>
        )}
      </div>
    </div>
  );
}

function ContestReplay({ contest, stage }) {
  // Only the player's own side is coloured by the result. Tinting the
  // opposition too made both sides the same alarm-orange on a loss, which
  // reads as one number rather than two, and colouring THEM green when they
  // win says the wrong thing entirely. The verdict line carries the mood.
  const mineColor = contest.won ? theme.good : theme.accent2;
  const theirColor = C.holo;
  const myParts = contest.ally
    ? `${contest.own} you + ${contest.ally} allies + die`
    : `${contest.own} strength + die`;
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 18,
      }}>
        <Side
          label="You" parts={myParts} die={contest.die} sides={contest.sides}
          locked={stage >= 1} showTotal={stage >= 1} total={contest.total}
          color={mineColor} align="center"
        />
        <div style={{
          fontFamily: C.font, fontSize: 11, letterSpacing: 2, color: C.textFaint,
          marginTop: 26, textTransform: "uppercase",
        }}>vs</div>
        <Side
          label="Them" parts={`${contest.opponent} strength + die`} die={contest.opponentDie}
          sides={contest.sides}
          locked={stage >= 2} showTotal={stage >= 2} total={contest.against}
          color={theirColor} align="center"
        />
      </div>
      <div style={{ height: 26, marginTop: 4, textAlign: "center" }}>
        {stage >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              fontFamily: C.font, fontSize: 15, fontWeight: 800, letterSpacing: 2.4,
              textTransform: "uppercase",
              color: contest.won ? theme.good : theme.accent2,
              textShadow: `0 0 12px ${contest.won ? theme.good : theme.accent2}66`,
            }}
          >{contest.won ? "You prevail" : "You are beaten"}</motion.div>
        )}
      </div>
    </div>
  );
}

// A d100 against an authored chance. Shown as the band you had to land in
// and where the roll actually fell, because "you rolled 13" means nothing
// without "you needed 50 or under".
function RollReplay({ roll, stage }) {
  const pct = Math.max(0, Math.min(100, (roll.chance / (roll.sides || 100)) * 100));
  const at = Math.max(0, Math.min(100, (roll.roll / (roll.sides || 100)) * 100));
  const color = roll.success ? theme.good : theme.accent2;
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.6,
        textTransform: "uppercase", color: C.textDim, marginBottom: 6,
      }}>
        <span>Needed {roll.chance} or under</span>
        <span>d{roll.sides}</span>
      </div>
      <div style={{
        position: "relative", height: 12, borderRadius: 6,
        background: "rgba(86,211,198,0.07)",
        border: "1px solid rgba(86,211,198,0.25)", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, width: `${pct}%`,
          background: "rgba(134,173,82,0.28)",
        }} />
        {stage >= 1 && (
          <motion.div
            initial={{ left: "0%" }}
            animate={{ left: `${at}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              position: "absolute", top: -2, bottom: -2, width: 2,
              background: color, boxShadow: `0 0 8px ${color}`,
            }}
          />
        )}
      </div>
      <div style={{ height: 24, marginTop: 6, textAlign: "center" }}>
        {stage >= 2 && (
          <span className="pc-emph" style={{
            fontFamily: C.font, fontSize: 13, fontWeight: 800, letterSpacing: 1.8,
            textTransform: "uppercase", color,
          }}>
            Rolled {roll.roll} — {roll.success ? "it holds" : "it fails"}
            {roll.modifiedBy ? " (your earlier work counted)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * @param outcome  { choiceLabel, outcomeText, contest, roll, lines[] }
 * @param onClose  dismiss the card and let the next one through
 */
export default function EncounterOutcome({ outcome, onClose }) {
  const hasReplay = !!(outcome.contest || outcome.roll);
  // `stage` walks the reveal: dice lock, then totals, then the verdict and
  // the prose. With nothing to replay there is nothing to wait for, so the
  // whole card is up immediately.
  const [stage, setStage] = useState(hasReplay ? 0 : 3);
  useEffect(() => {
    if (!hasReplay) return undefined;
    const t = [
      setTimeout(() => setStage((s) => Math.max(s, 1)), TUMBLE_MS),
      setTimeout(() => setStage((s) => Math.max(s, 2)), TUMBLE_MS + LOCK_GAP_MS),
      setTimeout(() => setStage((s) => Math.max(s, 3)), TUMBLE_MS + LOCK_GAP_MS * 2),
    ];
    return () => t.forEach(clearTimeout);
  }, [hasReplay]);
  const skip = () => setStage(3);

  return (
    <div
      onClick={stage < 3 ? skip : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 14, cursor: stage < 3 ? "pointer" : "default" }}
    >
      {outcome.choiceLabel && (
        <div style={{
          fontFamily: C.font, fontSize: 10, fontWeight: 600, letterSpacing: 1.8,
          textTransform: "uppercase", color: C.textDim,
        }}>
          You chose — <span style={{ color: C.holoHi }}><RichText>{outcome.choiceLabel}</RichText></span>
        </div>
      )}

      {outcome.contest && (
        <div style={{
          padding: "12px 10px 4px", borderRadius: 6,
          background: "rgba(86,211,198,0.045)",
          border: "1px solid rgba(86,211,198,0.2)",
        }}>
          <ContestReplay contest={outcome.contest} stage={stage} />
        </div>
      )}

      {outcome.roll && (
        <div style={{
          padding: "12px 14px 4px", borderRadius: 6,
          background: "rgba(86,211,198,0.045)",
          border: "1px solid rgba(86,211,198,0.2)",
        }}>
          <RollReplay roll={outcome.roll} stage={stage} />
        </div>
      )}

      {stage >= 3 && outcome.outcomeText && (
        <motion.div
          className="pc-prose"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          style={{
            fontSize: 13, color: "#d0d7dd", lineHeight: 1.6, whiteSpace: "pre-wrap",
            borderLeft: `2px solid ${C.holo}55`, paddingLeft: 14,
            boxShadow: `-6px 0 14px -8px ${C.holo}66`,
          }}
        >
          <RichText>{outcome.outcomeText}</RichText>
        </motion.div>
      )}

      {stage >= 3 && outcome.lines?.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.24 }}
          style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
        >
          {outcome.lines.map((l, i) => (
            <span key={`${l.text}-${i}`} style={{
              fontFamily: C.font, fontSize: 10.5, fontWeight: 700,
              letterSpacing: 1.1, textTransform: "uppercase",
              color: TONE_COLOR[l.tone] || C.textDim,
              border: `1px solid ${TONE_COLOR[l.tone] || C.textDim}55`,
              background: `${TONE_COLOR[l.tone] || C.textDim}14`,
              borderRadius: 4, padding: "4px 9px",
            }}>{l.text}</span>
          ))}
        </motion.div>
      )}

      <button
        className="hud-int"
        onClick={(e) => { e.stopPropagation(); if (stage < 3) skip(); else onClose(); }}
        style={{
          alignSelf: "flex-start",
          fontFamily: C.font, fontSize: 12, fontWeight: 700,
          letterSpacing: 1.8, textTransform: "uppercase",
          padding: "9px 22px", borderRadius: 6,
          border: `1px solid ${C.holo}`,
          background: "rgba(86,211,198,0.12)",
          color: C.holoHi, cursor: "pointer",
          boxShadow: `0 0 12px rgba(86,211,198,0.24)`,
        }}
      >{stage < 3 ? "Skip" : "Continue"}</button>
    </div>
  );
}
