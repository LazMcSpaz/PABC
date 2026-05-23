// The Tech Wheel (mechanical-spec §17), restyled to the holographic HUD
// language. Four paths radiate from a hub — Military, Economy (Industry),
// Intelligence, Logistics — each entry → A1 → A2 and entry → B1 → B2.
// Entry (root) nodes show the branch's uploaded logo; click an assignable
// node (a free Ability Point + met prerequisite) to spend a point.
import { useState } from "react";
import { TECH_NODES, TECH_PATHS } from "../game/tech.js";

const A = import.meta.env.BASE_URL;
const PATH_ANGLE = { military: -90, economy: 0, intelligence: 90, logistics: 180 };
const PATH_COLOR = {
  military: "#e0685a",
  economy: "#e8b53f",
  intelligence: "#5fb0e0",
  logistics: "#5fd0a0",
};
const PATH_LOGO = {
  military: `${A}assets/ui/logos/game/military_tech_branch_icon.webp`,
  economy: `${A}assets/ui/logos/game/industry_tech_branch_icon.webp`,
  intelligence: `${A}assets/ui/logos/game/Intelligence_tech_branch_icon.webp`,
  logistics: `${A}assets/ui/logos/game/logistics_tech_branch_icon.webp`,
};
const HOLO = "#56d3c6", HOLO_HI = "#8ff6ea", DIM = "#3c5a59";
const RADIUS = { 1: 78, 2: 128, 3: 176 };
const BRANCH_OFFSET = 24; // degrees off the path axis for the A / B branches
const SIZE = 400;
const CC = SIZE / 2;
const FONT = "'Oswald','Arial Narrow',system-ui,sans-serif";

function nodePos(node) {
  let deg = PATH_ANGLE[node.path];
  if (node.layer > 1) deg += node.id.includes("-a") ? -BRANCH_OFFSET : BRANCH_OFFSET;
  const r = RADIUS[node.layer];
  const rad = (deg * Math.PI) / 180;
  return { x: CC + r * Math.cos(rad), y: CC + r * Math.sin(rad) };
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
        <defs>
          <radialGradient id="tw-hub" cx="42%" cy="36%" r="75%">
            <stop offset="0%" stopColor="rgba(86,211,198,0.35)" />
            <stop offset="100%" stopColor="rgba(8,22,22,0.95)" />
          </radialGradient>
          <radialGradient id="tw-node" cx="42%" cy="36%" r="80%">
            <stop offset="0%" stopColor="rgba(40,70,70,0.55)" />
            <stop offset="100%" stopColor="rgba(6,18,18,0.9)" />
          </radialGradient>
        </defs>

        {/* faint guide rings reinforce the radial language */}
        {[RADIUS[1], RADIUS[2], RADIUS[3]].map((r) => (
          <circle key={r} cx={CC} cy={CC} r={r} fill="none" stroke={HOLO} strokeWidth="0.6" opacity="0.16" />
        ))}

        {/* spokes / prereq links */}
        {nodes.map((n) => {
          const from = n.prereq ? pos[n.prereq] : { x: CC, y: CC };
          const lit = assigned.has(n.id) && (n.prereq == null || assigned.has(n.prereq));
          const col = lit ? PATH_COLOR[n.path] : HOLO;
          return (
            <line
              key={`e-${n.id}`}
              x1={from.x} y1={from.y} x2={pos[n.id].x} y2={pos[n.id].y}
              stroke={col}
              strokeWidth={lit ? 3 : 1.4}
              opacity={lit ? 0.95 : 0.32}
              style={lit ? { filter: `drop-shadow(0 0 5px ${col})` } : undefined}
            />
          );
        })}

        {/* hub */}
        <circle cx={CC} cy={CC} r={23} fill="url(#tw-hub)" stroke={HOLO} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 8px ${HOLO}66)` }} />
        <text x={CC} y={CC + 3} textAnchor="middle" fontSize="10" fill={HOLO_HI} fontFamily={FONT} style={{ letterSpacing: 2, fontWeight: 700 }}>TECH</text>

        {/* nodes */}
        {nodes.map((n) => {
          const p = pos[n.id];
          const isAssigned = assigned.has(n.id);
          const assignable = isAssignable(n);
          const col = PATH_COLOR[n.path];
          const interactive = assignable;

          if (n.layer === 1) {
            // root node — branch logo in a holographic ring
            const ringStroke = isAssigned ? col : assignable ? HOLO_HI : HOLO;
            return (
              <g key={n.id}
                onClick={() => assignable && onAssign?.(n.id)}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                style={{ cursor: interactive ? "pointer" : "default" }}
              >
                <circle cx={p.x} cy={p.y} r={29} fill="url(#tw-node)" stroke={ringStroke}
                  strokeWidth={isAssigned || assignable ? 2.4 : 1.4}
                  opacity={isAssigned || assignable ? 1 : 0.7}
                  style={assignable ? { filter: `drop-shadow(0 0 7px ${HOLO})` } : isAssigned ? { filter: `drop-shadow(0 0 6px ${col})` } : undefined}
                />
                <image href={PATH_LOGO[n.path]} x={p.x - 23} y={p.y - 23} width={46} height={46}
                  opacity={isAssigned || assignable ? 1 : 0.82}
                  style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))" }} />
              </g>
            );
          }

          // branch nodes (A1/A2/B1/B2)
          const stroke = isAssigned ? col : assignable ? HOLO_HI : DIM;
          return (
            <g key={n.id}
              onClick={() => assignable && onAssign?.(n.id)}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
              style={{ cursor: interactive ? "pointer" : "default" }}
            >
              <circle cx={p.x} cy={p.y} r={17}
                fill={isAssigned ? col : "url(#tw-node)"}
                stroke={stroke}
                strokeWidth={assignable || isAssigned ? 2.4 : 1.4}
                opacity={isAssigned || assignable ? 1 : 0.55}
                style={assignable ? { filter: `drop-shadow(0 0 6px ${HOLO})` } : undefined}
              />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="7.5"
                fill={isAssigned ? "#0a1414" : HOLO_HI}
                fontFamily={FONT} fontWeight="700"
                style={{ pointerEvents: "none", letterSpacing: 0.3, opacity: isAssigned || assignable ? 1 : 0.7 }}>
                {n.id.slice(-2).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ minHeight: 34, fontSize: 11, color: "#9aa1a8", textAlign: "center", maxWidth: 330, lineHeight: 1.4 }}>
        {hover ? (
          <span>
            <span style={{ color: PATH_COLOR[TECH_NODES[hover].path], fontWeight: 700 }}>
              {nodeLabel(TECH_NODES[hover])}
            </span>{" — "}{nodeTip(TECH_NODES[hover])}
          </span>
        ) : (
          <span style={{ color: "#6b727a" }}>
            {points > 0
              ? `${points} Ability Point${points === 1 ? "" : "s"} to spend — click a glowing node.`
              : "No Ability Points. Reach the next Tech Level to earn one."}
          </span>
        )}
      </div>
    </div>
  );
}
