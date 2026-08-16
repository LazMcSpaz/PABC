// Unit sprite sheets — variant selection, scale, and the idle animation.
//
// The sheets are rendered at their own resolution (18.30 px/m, the figure
// docs/unit-model-pipeline.md §4 derives from the tile art) and the board draws
// at its own (HEX_W px across a 36.95 m hex). Neither is chosen here; the
// ratio between them is, so if either moves the sprites follow instead of
// needing a hand-tuned constant.
//
// Two things about the sheets drive the rest of this file:
//
//   * They are positioned by an ANCHOR inside the cell, not by the cell's
//     corner or centre. The anchor is the middle of the group's ground
//     footprint, and it is identical across every frame, row and variant, so a
//     unit that promotes or gains a chip does not shift on the tile. Drawing
//     by the cell box instead would float every unit ~13 px high at rest.
//
//   * They carry 8 orientation rows, and the game has no facing to select one
//     with — `makeUnit` has no such field, src/game/movement.js is explicit
//     that the rules do not need one, and the board camera never rotates. So
//     row 0 ("s", facing the camera) is the only row drawn. The rest are in
//     the file and unused; see FACING_ROW.
import manifest from "./unitSprites.json";
import { UNIT_UPGRADES } from "./data.js";
import { HEX_W } from "./hexProjection.js";

export const SPRITE_BASE_URL = `${import.meta.env.BASE_URL}${manifest.baseDir}`;

// A hex, vertex to vertex, in world metres (docs/unit-model-pipeline.md §2).
// The board's own px/m falls out of this and HEX_W.
const HEX_VERTEX_TO_VERTEX_M = 36.95;

// Row 0. There is no facing in the unit model, so every unit faces the camera.
// If facing is ever added, this becomes a lookup into `spec.rows`.
const FACING_ROW = 0;

export function spriteFor(faction, unit = "infantry") {
  return manifest.units?.[faction]?.[unit] || null;
}

export function hasSprite(faction, unit = "infantry") {
  return !!spriteFor(faction, unit);
}

// Which of the four arrangements a unit is currently in.
//
// `veteran` is a boolean on the unit. The strength arrangement applies when the
// unit carries a chip that adds Strength — deliberately keyed off installed
// chips rather than effective Strength, because Strength also moves via
// transient effects (Korad's Forge, MODIFY_STAT with duration "this_turn") and
// keying off the total would flip units between sheets turn to turn.
export function variantFor(unit) {
  const veteran = !!unit.veteran;
  const strong = (unit.chips || []).some((id) => (UNIT_UPGRADES[id]?.str || 0) > 0);
  if (veteran && strong) return "vet_str";
  if (veteran) return "vet";
  if (strong) return "std_str";
  return "std";
}

// Sheet px -> board px at rest. BoardViewport's zoom is a transform on an
// ancestor, so this does not change with zoom.
export function spriteScale(spec) {
  return HEX_W / HEX_VERTEX_TO_VERTEX_M / spec.pixelsPerMetre;
}

// Everything the token needs to paint one unit, in board px.
export function spriteStyle(spec, variant, { uid = "" } = {}) {
  const s = spriteScale(spec);
  const v = spec.variants[variant] || spec.variants.std;
  const [ax, ay] = spec.anchor;
  return {
    width: spec.frameWidth * s,
    height: spec.frameHeight * s,
    backgroundImage: `url(${SPRITE_BASE_URL}/${v.sheet})`,
    backgroundSize: `${spec.sheetWidth * s}px ${spec.sheetHeight * s}px`,
    // Row is fixed; the keyframe animates the column.
    backgroundPositionY: `${-FACING_ROW * spec.frameHeight * s}px`,
    backgroundRepeat: "no-repeat",
    // Put the anchor pixel on the token's origin. The cell is not centred on
    // the anchor vertically — 150/192 down — so this is not translate(-50%,-100%).
    transform: `translate(${(-ax / spec.frameWidth) * 100}%, ${(-ay / spec.frameHeight) * 100}%)`,
    animation: `${ANIM_NAME} ${spec.frames / spec.fps}s steps(${spec.frames}) infinite`,
    // Desync so twenty units do not breathe in unison (§7).
    animationDelay: `-${idleOffset(uid, spec)}s`,
    imageRendering: "auto",
  };
}

// Click target, in board px, centred on the anchor.
//
// This exists because the sprite's own box is the full 192 px cell, most of
// which is transparent headroom for polearms and the banner. Left to take
// clicks, that box is ~45% wider than the spacing between adjacent units, so
// neighbouring tokens steal each other's clicks — the same failure the tile
// layer already solves with a separate hit layer (see HexBoard3D). Sizing the
// target to the unit's actual footprint instead of its canvas keeps each unit
// clickable where it is drawn.
//
// 135 x 100 px is the placed-unit silhouette the pipeline doc's footprint
// figures describe: 7.4 m across at 18.30 px/m, and about 100 px tall once the
// camera tilt compresses a 4 m figure.
const HIT_W_SHEET = 135;
const HIT_H_SHEET = 100;

export function hitBoxStyle(spec) {
  const s = spriteScale(spec);
  return {
    width: HIT_W_SHEET * s,
    height: HIT_H_SHEET * s,
    transform: "translate(-50%, -50%)",
  };
}

// Where the figure actually sits inside its cell, relative to the anchor, in
// sheet px. Measured off the sheets rather than assumed: across all four
// arrangements the drawn pixels span x 33..159 and y 20..183 against an anchor
// at (96, 150). The cell is 192 square, so most of it is empty headroom — using
// the cell for occlusion or overlap tests overstates the unit by a wide margin.
const DRAWN_HALF_W = 63;
const DRAWN_ABOVE = 130;
const DRAWN_BELOW = 33;

// Board-space box the figure covers, given the ground point it stands on.
export function drawnBox(spec, x, y) {
  const s = spriteScale(spec);
  return {
    x0: x - DRAWN_HALF_W * s,
    x1: x + DRAWN_HALF_W * s,
    y0: y - DRAWN_ABOVE * s,
    y1: y + DRAWN_BELOW * s,
  };
}

// Deterministic per-unit phase offset, so the same unit keeps the same phase
// across re-renders instead of jumping when React reconciles.
function idleOffset(uid, spec) {
  let h = 0;
  const s = String(uid);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % spec.frames) / spec.fps).toFixed(3);
}

export const ANIM_NAME = "unit-idle-cycle";

// One keyframe covers every sheet, because build-units.mjs guarantees they all
// share cell size and frame count. Injected once, lazily, so the module stays
// importable headless (the AI replay imports board geometry without a DOM).
let injected = false;
export function ensureIdleKeyframes(spec) {
  if (injected || typeof document === "undefined") return;
  const s = spriteScale(spec);
  const style = document.createElement("style");
  style.dataset.unitSprites = "";
  style.textContent =
    `@keyframes ${ANIM_NAME}{` +
    `from{background-position-x:0}` +
    `to{background-position-x:${-spec.sheetWidth * s}px}}` +
    // Respect reduced-motion: hold frame 0 rather than cycling.
    `@media (prefers-reduced-motion: reduce){` +
    `[data-unit-sprite]{animation:none !important}}`;
  document.head.appendChild(style);
  injected = true;
}
