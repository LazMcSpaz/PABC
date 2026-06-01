// The Tech Wheel (§17). A floating holographic radial tree — four paths
// radiate from the hub (Military, Logistics, Economy, Intelligence), each
// with 5 nodes (entry → a1 → a2 and entry → b1 → b2). Renders as its own
// overlay (no panel chrome) so the tree reads as the focus, matching the
// radial menu's free-floating language.
import { useState } from "react";
import { motion } from "framer-motion";
import { TECH_NODES, TECH_PATHS } from "../game/tech.js";
import { CloseX, useEscClose } from "./HudChrome.jsx";

const HOLO = "#56d3c6";
const HOLO_HI = "#8ff6ea";

const PATH_COLOR = {
  military: "#e0654a",
  logistics: "#7bb255",
  economy: "#e8b53f",
  intelligence: HOLO,
};
const PATH_ANGLE = { military: -90, economy: 0, intelligence: 90, logistics: 180 };
const RADIUS = { 1: 92, 2: 154, 3: 210 };
const BRANCH_OFFSET = 24;
const SIZE = 460;
const CTR = SIZE / 2;

function nodeAngle(n) {
  let deg = PATH_ANGLE[n.path];
  if (n.layer > 1) deg += n.id.includes("-a") ? -BRANCH_OFFSET : BRANCH_OFFSET;
  return deg;
}
function nodePos(n) {
  const a = (nodeAngle(n) * Math.PI) / 180;
  return { x: CTR + RADIUS[n.layer] * Math.cos(a), y: CTR + RADIUS[n.layer] * Math.sin(a) };
}
function nodeName(n) {
  if (n.layer === 1) return TECH_PATHS[n.path].entryName;
  return `${TECH_PATHS[n.path].name} · ${n.id.slice(-2).toUpperCase()}`;
}
function nodeText(n) {
  if (n.layer === 1) return TECH_PATHS[n.path].entryText;
  return "Branch ability — to be designed.";
}

function PathGlyph({ path, color, size = 22 }) {
  const s = { fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (path) {
    case "military":
      return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.5" {...s} /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" {...s} /></svg>;
    case "logistics":
      return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M5 6 L13 12 L5 18 M11 6 L19 12 L11 18" {...s} /></svg>;
    case "economy":
      return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M4.5 18 L8 18 L8 12 L4.5 12 Z M10.5 18 L14 18 L14 7 L10.5 7 Z M16.5 18 L20 18 L20 14 L16.5 14 Z" {...s} /></svg>;
    case "intelligence":
      return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M2.5 12 C 6 5, 18 5, 21.5 12 C 18 19, 6 19, 2.5 12 Z" {...s} /><circle cx="12" cy="12" r="2.6" {...s} /></svg>;
    default:
      return null;
  }
}

export default function TechWheel({ player, onAssign, onClose, levelInfo }) {
  useEscClose(onClose);
  const [hover, setHover] = useState(null);
  const assigned = new Set(player?.techWheel || []);
  const points = player?.abilityPointsAvailable || 0;
  const isAssignable = (n) =>
    !assigned.has(n.id) && points > 0 && (n.prereq == null || assigned.has(n.prereq));

  const nodes = Object.values(TECH_NODES);
  const connectors = nodes.map((n) => {
    const to = nodePos(n);
    const from = n.prereq ? nodePos(TECH_NODES[n.prereq]) : { x: CTR, y: CTR };
    const lit = assigned.has(n.id) && (n.prereq == null || assigned.has(n.prereq));
    return { id: n.id, from, to, lit, color: PATH_COLOR[n.path] };
  });

  const hovered = hover ? TECH_NODES[hover] : null;

  return (
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, ease: "easeIn" } }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(4,8,8,0.72)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 240, damping: 22, mass: 0.8 }}
        style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
      >
        {/* Floating title */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, pointerEvents: "none" }}>
          <span style={{
            fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700,
            letterSpacing: 4, textTransform: "uppercase", color: HOLO_HI,
            textShadow: `0 0 12px ${HOLO}88`,
          }}>Research</span>
          <span style={{ width: 64, height: 1.5, background: `linear-gradient(90deg, transparent, ${HOLO}, transparent)`, opacity: 0.9 }} />
        </div>

        {/* The wheel (SVG + node buttons) */}
        <div style={{ position: "relative", width: SIZE, height: SIZE }}>
          <motion.svg
            width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ overflow: "visible" }}
          >
            {/* outer guide rings */}
            <circle cx={CTR} cy={CTR} r={SIZE / 2 - 8} fill="none" stroke={HOLO} strokeWidth="0.7" opacity="0.22" />
            <circle cx={CTR} cy={CTR} r={SIZE / 2 - 18} fill="none" stroke={HOLO} strokeWidth="0.4" opacity="0.15" />

            {/* connectors */}
            {connectors.map((c, i) => (
              <motion.line
                key={`c-${c.id}`}
                x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y}
                stroke={c.lit ? c.color : "rgba(86,211,198,0.22)"}
                strokeWidth={c.lit ? 2.2 : 1.1}
                opacity={c.lit ? 0.95 : 0.55}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: c.lit ? 0.95 : 0.55 }}
                transition={{ duration: 0.45, delay: 0.12 + i * 0.025, ease: "easeOut" }}
                style={c.lit ? { filter: `drop-shadow(0 0 5px ${c.color})` } : undefined}
              />
            ))}

            {/* hub */}
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05, duration: 0.25 }}>
              <circle cx={CTR} cy={CTR} r={32} fill="none" stroke={HOLO} strokeWidth="0.6" opacity="0.45" />
              <circle cx={CTR} cy={CTR} r={26}
                fill="rgba(5,12,13,0.92)" stroke={HOLO} strokeWidth="1.6"
                style={{ filter: `drop-shadow(0 0 9px ${HOLO}aa)` }} />
              <text x={CTR} y={CTR - 2} textAnchor="middle" dominantBaseline="central"
                fontFamily="'Oswald',sans-serif" fontWeight="700" fontSize="11" letterSpacing="2.2" fill={HOLO_HI}>
                TECH
              </text>
              <text x={CTR} y={CTR + 10} textAnchor="middle" dominantBaseline="central"
                fontFamily="'Oswald',sans-serif" fontWeight="600" fontSize="8" letterSpacing="1.4" fill="rgba(143,246,234,0.55)">
                {`${assigned.size} / ${nodes.length}`}
              </text>
            </motion.g>
          </motion.svg>

          {/* nodes — HTML overlay */}
          {nodes.map((n) => {
            const pos = nodePos(n);
            const isAssigned = assigned.has(n.id);
            const canAssign = isAssignable(n);
            const col = PATH_COLOR[n.path];
            const sz = n.layer === 1 ? 44 : n.layer === 2 ? 32 : 28;
            const delay = 0.32 + (n.layer - 1) * 0.07 + (n.id.includes("-b") ? 0.03 : 0);
            const ringCol = isAssigned || canAssign ? col : "rgba(86,211,198,0.3)";
            const innerBg = isAssigned
              ? `radial-gradient(circle at 50% 38%, ${col}55, rgba(5,12,13,0.94) 78%)`
              : "radial-gradient(circle at 50% 40%, rgba(19,42,44,0.95), rgba(4,10,11,0.96))";
            const shadow = isAssigned
              ? `0 0 16px ${col}, inset 0 0 10px ${col}55`
              : canAssign
              ? `0 0 12px ${col}aa, inset 0 0 8px rgba(0,0,0,0.5)`
              : "0 0 6px rgba(0,0,0,0.4), inset 0 0 6px rgba(0,0,0,0.5)";
            return (
              <motion.button
                key={n.id}
                onClick={() => canAssign && onAssign?.(n.id)}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                disabled={!canAssign}
                initial={{ x: CTR - pos.x, y: CTR - pos.y, opacity: 0, scale: 0.35 }}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 22, mass: 0.8, delay }}
                whileHover={canAssign ? { scale: 1.14 } : undefined}
                whileTap={canAssign ? { scale: 0.94 } : undefined}
                className={canAssign ? "tech-pulse" : undefined}
                style={{
                  position: "absolute",
                  left: pos.x - sz / 2,
                  top: pos.y - sz / 2,
                  width: sz,
                  height: sz,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: innerBg,
                  border: `${isAssigned ? 2 : 1.3}px solid ${ringCol}`,
                  boxShadow: shadow,
                  color: isAssigned ? HOLO_HI : canAssign ? col : "rgba(143,246,234,0.45)",
                  cursor: canAssign ? "pointer" : "default",
                  opacity: isAssigned || canAssign ? 1 : 0.72,
                  padding: 0,
                  fontFamily: "'Oswald',sans-serif",
                }}
                title={nodeName(n)}
              >
                {n.layer === 1 ? (
                  <PathGlyph path={n.path} color={isAssigned ? "#fff" : col} size={22} />
                ) : (
                  <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
                    {n.id.slice(-2)}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Info strip */}
        <div style={{ minHeight: 54, maxWidth: 520, textAlign: "center", padding: "4px 16px", pointerEvents: "none" }}>
          {hovered ? (
            <>
              <div style={{
                fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 14,
                letterSpacing: 1.5, textTransform: "uppercase",
                color: PATH_COLOR[hovered.path], textShadow: `0 0 10px ${PATH_COLOR[hovered.path]}88`,
              }}>{nodeName(hovered)}</div>
              <div className="pc-prose" style={{ fontSize: 12.5, color: "#cfd6dc", marginTop: 4, lineHeight: 1.5 }}>
                {nodeText(hovered)}
              </div>
            </>
          ) : (
            <>
              {levelInfo && (
                <div style={{
                  fontFamily: "'Oswald',sans-serif", fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase",
                  color: "rgba(143,246,234,0.55)",
                }}>
                  Level {levelInfo.level}{levelInfo.maxLevel ? ` / ${levelInfo.maxLevel}` : ""}
                  {levelInfo.research != null ? ` · Research ${levelInfo.research}` : ""}
                </div>
              )}
              <div style={{
                fontFamily: "'Oswald',sans-serif", fontSize: 11.5, letterSpacing: 1.6, textTransform: "uppercase",
                color: points > 0 ? HOLO_HI : "rgba(143,246,234,0.45)", marginTop: 6,
                textShadow: points > 0 ? `0 0 8px ${HOLO}66` : undefined,
              }}>
                {points > 0
                  ? `${points} Ability Point${points === 1 ? "" : "s"} to spend — click a glowing node`
                  : "No Ability Points — reach the next Tech Level to earn one"}
              </div>
            </>
          )}
        </div>

        <CloseX onClose={onClose} style={{ position: "absolute", top: 32, right: -10 }} />
      </motion.div>
    </motion.div>
  );
}
