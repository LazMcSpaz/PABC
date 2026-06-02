// The Tech Wheel (§17). A floating concentric pie tree matching the radial
// menu's holographic language. Four concentric rings: a central "Tech Tree"
// hub, then 4 base-entry slices (one per path), then 8 layer-2 slices (A1
// and B1 of each path), then 8 layer-3 slices (A2 and B2). Hover, glow and
// stagger entrance mirror the menu wheel.
import { useState } from "react";
import { motion } from "framer-motion";
import { TECH_NODES, TECH_PATHS } from "../game/tech.js";
import { CloseX, useEscClose } from "./HudChrome.jsx";

const HOLO = "#56d3c6";
const HOLO_HI = "#8ff6ea";
const ASSET = import.meta.env.BASE_URL;

const PATH_COLOR = {
  military: "#e0654a",
  logistics: "#7bb255",
  economy: "#e8b53f",
  intelligence: HOLO,
};

// White line-art PNG icons — tinted to each path's colour via CSS mask.
const PATH_ICON_URL = {
  military: `${ASSET}assets/ui/icons/actions/military_icon.png`,
  logistics: `${ASSET}assets/ui/icons/actions/logistics_icon.png`,
  economy: `${ASSET}assets/ui/icons/actions/industry_icon.png`,
  intelligence: `${ASSET}assets/ui/icons/actions/intelligence_icon.png`,
};

// Tech.js id prefixes (mil/log/eco/int).
const PATH_PREFIX = { military: "mil", logistics: "log", economy: "eco", intelligence: "int" };

// Order clockwise from 12 o'clock (HoloSegments angle convention).
const PATHS_CW = ["military", "economy", "intelligence", "logistics"];

const SIZE = 480;
const CTR = SIZE / 2;
const RINGS = {
  hub: { ri: 0, ro: 56 },
  entry: { ri: 56, ro: 116 },
  layer2: { ri: 116, ro: 176 },
  layer3: { ri: 176, ro: 234 },
};
const GAP_PX = 5;

// HoloSegments angle convention: 0=top, +90=right, +180=bottom, +270=left.
function pt(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
function donut(cx, cy, ri, ro, a0, a1, gapPx = 0) {
  const degO = gapPx ? ((gapPx / 2 / ro) * 180) / Math.PI : 0;
  const degI = gapPx && ri > 0 ? ((gapPx / 2 / ri) * 180) / Math.PI : 0;
  const oa0 = a0 + degO, oa1 = a1 - degO;
  const ia0 = a0 + degI, ia1 = a1 - degI;
  const [ox0, oy0] = pt(cx, cy, ro, oa0);
  const [ox1, oy1] = pt(cx, cy, ro, oa1);
  const [ix1, iy1] = pt(cx, cy, ri, ia1);
  const [ix0, iy0] = pt(cx, cy, ri, ia0);
  const large = (oa1 - oa0 + 360) % 360 > 180 ? 1 : 0;
  return (
    `M ${ox0.toFixed(2)} ${oy0.toFixed(2)} ` +
    `A ${ro} ${ro} 0 ${large} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)} ` +
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)} ` +
    `A ${ri} ${ri} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`
  );
}

function PathGlyph({ path, color, size = 24 }) {
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

function PathIcon({ path, color, size = 30, dim = false }) {
  const url = PATH_ICON_URL[path];
  if (url) {
    // White line-art icons tinted to the path colour via CSS mask.
    return <div style={{
      width: size, height: size,
      backgroundColor: color,
      WebkitMaskImage: `url(${url})`,
      WebkitMaskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskImage: `url(${url})`,
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "center",
      opacity: dim ? 0.55 : 1,
      filter: dim ? undefined : `drop-shadow(0 0 6px ${color}88)`,
    }} />;
  }
  return <PathGlyph path={path} color={color} size={size} />;
}

// node id → branch key ("a1" / "a2" / "b1" / "b2") for layer 2+ nodes.
function branchKey(node) {
  return node.id.slice(-2);
}
function nodeName(node) {
  if (!node) return "";
  if (node.layer === 1) return TECH_PATHS[node.path].entryName;
  const meta = TECH_PATHS[node.path].nodes?.[branchKey(node)];
  return meta?.name || branchKey(node).toUpperCase();
}
function nodeText(node) {
  if (!node) return "";
  if (node.layer === 1) return TECH_PATHS[node.path].entryText;
  const meta = TECH_PATHS[node.path].nodes?.[branchKey(node)];
  return meta?.text || "Branch ability — to be designed.";
}
// "Military · Aggression" for branch nodes; empty for entries.
function nodeSubtitle(node) {
  if (!node || node.layer === 1) return "";
  const branch = branchKey(node).startsWith("a") ? "a" : "b";
  const path = TECH_PATHS[node.path];
  const branchName = path?.branches?.[branch]?.name;
  return branchName ? `${path.name} · ${branchName}` : path?.name || "";
}

function buildSegments(assigned, points) {
  const segs = [];
  PATHS_CW.forEach((path, i) => {
    const pre = PATH_PREFIX[path];
    const baseA = -45 + i * 90;   // counterclockwise edge of path quadrant
    const baseM = i * 90;          // path axis (midline)
    const baseB = 45 + i * 90;    // clockwise edge of path quadrant
    const mk = (id, ring, a0, a1) => {
      const node = TECH_NODES[id];
      const isAssigned = assigned.has(id);
      const canAssign = !isAssigned && points > 0 && (node.prereq == null || assigned.has(node.prereq));
      return { id, path, ring, a0, a1, node, isAssigned, canAssign };
    };
    segs.push(mk(`${pre}-entry`, "entry", baseA, baseB));
    segs.push(mk(`${pre}-a1`, "layer2", baseA, baseM));
    segs.push(mk(`${pre}-b1`, "layer2", baseM, baseB));
    segs.push(mk(`${pre}-a2`, "layer3", baseA, baseM));
    segs.push(mk(`${pre}-b2`, "layer3", baseM, baseB));
  });
  return segs;
}

function Segment({ seg, hovered, onHover, onClick }) {
  const isHover = hovered === seg.id;
  const col = PATH_COLOR[seg.path];
  const { ri, ro } = RINGS[seg.ring];
  const d = donut(CTR, CTR, ri, ro, seg.a0, seg.a1, GAP_PX);
  const { isAssigned, canAssign } = seg;
  const isDim = !isAssigned && !canAssign;
  const fillOpacity = isAssigned ? 0.34 : isHover ? 0.24 : canAssign ? 0.13 : 0.04;
  const strokeWidth = isAssigned ? 2 : isHover ? 1.9 : canAssign ? 1.4 : 1;
  const strokeOpacity = isDim ? 0.4 : 1;
  const glow = isAssigned ? 11 : isHover ? 14 : canAssign ? 7 : 0;
  return (
    <path
      d={d}
      fill={col}
      fillOpacity={fillOpacity}
      stroke={col}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeLinejoin="round"
      style={{
        cursor: canAssign ? "pointer" : "default",
        filter: glow ? `drop-shadow(0 0 ${glow}px ${col})` : undefined,
        transition: "fill-opacity .14s ease, stroke-width .14s ease, filter .14s ease, stroke-opacity .14s ease",
      }}
      onMouseEnter={() => onHover(seg.id)}
      onMouseLeave={() => onHover((h) => (h === seg.id ? null : h))}
      onClick={() => canAssign && onClick(seg.id)}
      className={canAssign ? "tech-pulse" : undefined}
    />
  );
}

function SegmentContent({ seg, hovered }) {
  const midR = (RINGS[seg.ring].ri + RINGS[seg.ring].ro) / 2;
  const midA = (seg.a0 + seg.a1) / 2;
  const [cx, cy] = pt(CTR, CTR, midR, midA);
  const col = PATH_COLOR[seg.path];
  const { isAssigned, canAssign } = seg;
  const isHover = hovered === seg.id;
  const isDim = !isAssigned && !canAssign && !isHover;
  return (
    <div style={{
      position: "absolute", left: cx, top: cy, transform: "translate(-50%, -50%)",
      pointerEvents: "none", opacity: isDim ? 0.55 : 1, transition: "opacity .14s ease",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    }}>
      {seg.ring === "entry" ? (
        <PathIcon path={seg.path} color={isAssigned ? "#fff" : col} size={34} dim={isDim} />
      ) : (
        <span style={{
          fontFamily: "'Oswald',sans-serif", fontWeight: 700,
          fontSize: seg.ring === "layer2" ? 12.5 : 13,
          letterSpacing: 1.4, textTransform: "uppercase",
          color: isAssigned ? "#fff" : (canAssign || isHover) ? col : "rgba(143,246,234,0.45)",
          textShadow: isAssigned ? `0 0 6px ${col}cc` : isHover ? `0 0 6px ${col}aa` : undefined,
          transition: "color .14s ease",
        }}>
          {seg.id.slice(-2)}
        </span>
      )}
    </div>
  );
}

export default function TechWheel({ player, onAssign, onClose, levelInfo }) {
  useEscClose(onClose);
  const [hover, setHover] = useState(null);
  const assigned = new Set(player?.techWheel || []);
  const points = player?.abilityPointsAvailable || 0;
  const segs = buildSegments(assigned, points);
  const hovered = hover ? TECH_NODES[hover] : null;
  const byRing = { entry: [], layer2: [], layer3: [] };
  segs.forEach((s) => byRing[s.ring].push(s));

  return (
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, ease: "easeIn" } }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(4,8,8,0.72)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.86, rotate: -4, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ type: "spring", stiffness: 240, damping: 22, mass: 0.8 }}
        style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
      >
        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, pointerEvents: "none" }}>
          <span style={{
            fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700,
            letterSpacing: 4, textTransform: "uppercase", color: HOLO_HI,
            textShadow: `0 0 12px ${HOLO}88`,
          }}>Research</span>
          <span style={{ width: 64, height: 1.5, background: `linear-gradient(90deg, transparent, ${HOLO}, transparent)`, opacity: 0.9 }} />
        </div>

        {/* The wheel */}
        <div style={{ position: "relative", width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: "visible" }}>
            {/* outer guide rings (decorative) */}
            <circle cx={CTR} cy={CTR} r={RINGS.layer3.ro + 4} fill="none" stroke={HOLO} strokeWidth="0.6" opacity="0.22" />
            <circle cx={CTR} cy={CTR} r={RINGS.layer3.ro + 12} fill="none" stroke={HOLO} strokeWidth="0.35" opacity="0.13" />

            {/* Hub */}
            <motion.g
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              style={{ transformOrigin: `${CTR}px ${CTR}px` }}
            >
              <circle cx={CTR} cy={CTR} r={RINGS.hub.ro} fill="rgba(5,12,13,0.94)" stroke={HOLO} strokeWidth="1.6"
                style={{ filter: `drop-shadow(0 0 9px ${HOLO}aa)` }} />
              <circle cx={CTR} cy={CTR} r={RINGS.hub.ro + 5} fill="none" stroke={HOLO} strokeWidth="0.6" opacity="0.4" />
            </motion.g>

            {/* Rings — stagger entrance per ring */}
            {["entry", "layer2", "layer3"].map((ring, ri) => (
              <motion.g
                key={ring}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.32, delay: 0.12 + ri * 0.13, ease: "easeOut" }}
              >
                {byRing[ring].map((seg) => (
                  <Segment key={seg.id} seg={seg} hovered={hover} onHover={setHover} onClick={onAssign} />
                ))}
              </motion.g>
            ))}
          </svg>

          {/* Hub label (HTML overlay for crisp typography) */}
          <div style={{
            position: "absolute", left: CTR, top: CTR, transform: "translate(-50%, -50%)",
            textAlign: "center", pointerEvents: "none",
          }}>
            <div style={{
              fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700,
              letterSpacing: 2.4, textTransform: "uppercase", color: HOLO_HI,
              lineHeight: 1.18, textShadow: `0 0 6px ${HOLO}88`,
            }}>Tech</div>
            <div style={{
              fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700,
              letterSpacing: 2.4, textTransform: "uppercase", color: HOLO_HI,
              lineHeight: 1.18, textShadow: `0 0 6px ${HOLO}88`,
            }}>Tree</div>
          </div>

          {/* Segment content overlays — staggered fade matching ring entrance */}
          {["entry", "layer2", "layer3"].map((ring, ri) => (
            <motion.div
              key={`co-${ring}`}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.32, delay: 0.22 + ri * 0.13, ease: "easeOut" }}
            >
              {byRing[ring].map((seg) => (
                <SegmentContent key={`c-${seg.id}`} seg={seg} hovered={hover} />
              ))}
            </motion.div>
          ))}
        </div>

        {/* Info strip */}
        <div style={{ minHeight: 54, maxWidth: 520, textAlign: "center", padding: "4px 16px", pointerEvents: "none" }}>
          {hovered ? (
            <>
              <div style={{
                fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 14,
                letterSpacing: 1.5, textTransform: "uppercase",
                color: PATH_COLOR[hovered.path],
                textShadow: `0 0 10px ${PATH_COLOR[hovered.path]}88`,
              }}>{nodeName(hovered)}</div>
              {nodeSubtitle(hovered) && (
                <div style={{
                  fontFamily: "'Oswald',sans-serif", fontSize: 9.5, letterSpacing: 1.8,
                  textTransform: "uppercase", color: "rgba(143,246,234,0.55)", marginTop: 2,
                }}>{nodeSubtitle(hovered)}</div>
              )}
              <div className="pc-prose" style={{ fontSize: 12.5, color: "#cfd6dc", marginTop: 4, lineHeight: 1.5 }}>
                {nodeText(hovered)}
              </div>
            </>
          ) : (
            <>
              {levelInfo && (
                <div style={{
                  fontFamily: "'Oswald',sans-serif", fontSize: 10.5, letterSpacing: 2,
                  textTransform: "uppercase", color: "rgba(143,246,234,0.55)",
                }}>
                  Level {levelInfo.level}{levelInfo.maxLevel ? ` / ${levelInfo.maxLevel}` : ""}
                  {levelInfo.research != null ? ` · Research ${levelInfo.research}` : ""}
                </div>
              )}
              <div style={{
                fontFamily: "'Oswald',sans-serif", fontSize: 11.5, letterSpacing: 1.6,
                textTransform: "uppercase", color: points > 0 ? HOLO_HI : "rgba(143,246,234,0.45)",
                marginTop: 6, textShadow: points > 0 ? `0 0 8px ${HOLO}66` : undefined,
              }}>
                {points > 0
                  ? `${points} Ability Point${points === 1 ? "" : "s"} to spend — click a glowing slice`
                  : "No Ability Points — reach the next Tech Level to earn one"}
              </div>
            </>
          )}
        </div>

        <CloseX onClose={onClose} style={{ position: "absolute", top: -10, right: -10 }} />
      </motion.div>
    </motion.div>
  );
}
