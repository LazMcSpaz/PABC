// The Tech Wheel (mechanical-spec §17). Four paths radiate from a hub —
// Military, Economy, Intelligence, Logistics — each entry → A1 → A2 and
// entry → B1 → B2. Click an assignable node (you have a free Ability
// Point and its prerequisite is met) to spend a point on it. Only the
// four entry nodes have real effects today; branch nodes show "TBD".
import { useState } from "react";
import { TECH_NODES, TECH_PATHS } from "../game/tech.js";
import { theme } from "./data.js";

const PATH_ANGLE = { military: -90, economy: 0, intelligence: 90, logistics: 180 };
const PATH_COLOR = {
  military: "#c8503f",
  economy: theme.accent,
  intelligence: "#5a8fc0",
  logistics: "#4f9d63",
};
const RADIUS = { 1: 66, 2: 116, 3: 164 };
const BRANCH_OFFSET = 24; // degrees off the path axis for the A / B branches
const SIZE = 380;
const C = SIZE / 2;

function nodePos(node) {
  let deg = PATH_ANGLE[node.path];
  if (node.layer > 1) deg += node.id.includes("-a") ? -BRANCH_OFFSET : BRANCH_OFFSET;
  const r = RADIUS[node.layer];
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function nodeLabel(node) {
  if (node.layer === 1) return TECH_PATHS[node.path].entryName;
  return "TBD";
}

function nodeTip(node) {
  if (node.layer === 1) return `${TECH_PATHS[node.path].entryName} — ${TECH_PATHS[node.path].entryText}`;
  return "Branch ability — to be designed.";
}

export default function TechWheel({ player, onAssign }) {
  const [hover, setHover] = useState(null);
  const wheel = player?.techWheel || [];
  const points = player?.abilityPointsAvailable || 0;
  const assigned = new Set(wheel);

  const isAssignable = (node) => {
    if (assigned.has(node.id)) return false;
    if (points <= 0) return false;
    return node.prereq == null || assigned.has(node.prereq);
  };

  const nodes = Object.values(TECH_NODES);
  const pos = {};
  for (const n of nodes) pos[n.id] = nodePos(n);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ maxWidth: "100%" }}>
        {/* spokes / prereq links */}
        {nodes.map((n) => {
          const from = n.prereq ? pos[n.prereq] : { x: C, y: C };
          const lit = assigned.has(n.id) && (n.prereq == null || assigned.has(n.prereq));
          return (
            <line
              key={`e-${n.id}`}
              x1={from.x} y1={from.y} x2={pos[n.id].x} y2={pos[n.id].y}
              stroke={lit ? PATH_COLOR[n.path] : theme.border}
              strokeWidth={lit ? 3 : 1.5}
              opacity={lit ? 0.9 : 0.5}
            />
          );
        })}

        {/* hub */}
        <circle cx={C} cy={C} r={20} fill="#1a1610" stroke={theme.borderLit} strokeWidth={2} />
        <text x={C} y={C + 3} textAnchor="middle" fontSize="9" fill={theme.textFaint}
          fontFamily={theme.fontDisplay} style={{ letterSpacing: 1 }}>TECH</text>

        {/* nodes */}
        {nodes.map((n) => {
          const p = pos[n.id];
          const isAssigned = assigned.has(n.id);
          const assignable = isAssignable(n);
          const col = PATH_COLOR[n.path];
          const fill = isAssigned ? col : "#221d16";
          const stroke = isAssigned ? "#fff" : assignable ? col : theme.border;
          return (
            <g
              key={n.id}
              onClick={() => assignable && onAssign?.(n.id)}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
              style={{ cursor: assignable ? "pointer" : "default" }}
            >
              <circle
                cx={p.x} cy={p.y} r={17}
                fill={fill}
                stroke={stroke}
                strokeWidth={assignable || isAssigned ? 2.5 : 1.5}
                opacity={isAssigned || assignable ? 1 : 0.55}
                style={assignable ? { filter: `drop-shadow(0 0 6px ${col})` } : undefined}
              />
              <text
                x={p.x} y={p.y + 3} textAnchor="middle" fontSize="7.5"
                fill={isAssigned ? "#fff" : theme.textDim}
                fontFamily={theme.fontDisplay} fontWeight="700"
                style={{ pointerEvents: "none", letterSpacing: 0.3 }}
              >
                {n.layer === 1 ? TECH_PATHS[n.path].name.slice(0, 3).toUpperCase() : n.id.slice(-2).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{
        minHeight: 34, fontSize: 11, color: theme.textDim, textAlign: "center",
        maxWidth: 320, lineHeight: 1.4,
      }}>
        {hover ? (
          <span>
            <span style={{ color: PATH_COLOR[TECH_NODES[hover].path], fontWeight: 700 }}>
              {nodeLabel(TECH_NODES[hover])}
            </span>{" — "}{nodeTip(TECH_NODES[hover])}
          </span>
        ) : (
          <span style={{ color: theme.textFaint }}>
            {points > 0
              ? `${points} Ability Point${points === 1 ? "" : "s"} to spend — click a glowing node.`
              : "No Ability Points. Reach the next Tech Level to earn one."}
          </span>
        )}
      </div>
    </div>
  );
}
