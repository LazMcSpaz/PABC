// Unit sprite sheets — which sheet a unit uses, at what scale, and how it idles.
//
// The sheets are rendered at their own resolution (18.30 px/m, the figure
// docs/unit-model-pipeline.md §4 derives from the tile art) and the board draws
// at its own (HEX_W px across a 36.95 m hex). Neither is chosen here; the ratio
// between them is, so if either moves the sprites follow instead of needing a
// hand-tuned constant.
//
// Three things about the sheets drive the rest of this file:
//
//   * They are positioned by an ANCHOR inside the cell, not by the cell's
//     corner or centre. The anchor is the middle of the unit's ground footprint,
//     and it is identical across every frame, row and variant, so a unit that
//     promotes or gains a chip does not shift. Drawing by the cell box instead
//     would float every unit well above its tile.
//
//   * The variant matrix is SPARSE. Infantry ships all four arrangements;
//     the tier-1 vehicle has veteran but no strength variant, and the tier-2
//     vehicle has none at all. So a unit asks for what it wants and takes the
//     closest thing that exists — see variantFor.
//
//   * They carry 8 orientation rows, and the game has no facing to select one
//     with — `makeUnit` has no such field, src/game/movement.js is explicit that
//     the rules do not need one, and the board camera never rotates. So row 0
//     ("s", facing the camera) is the only row drawn. See FACING_ROW.
// The import attribute is required by Node (Vite does not need it); this module
// is imported headless by scripts/check-unit-variants.mjs.
import manifest from "./unitSprites.json" with { type: "json" };
import { UNIT_UPGRADES } from "./data.js";
import { HEX_W } from "./hexProjection.js";

export const SPRITE_BASE_URL = `${import.meta.env?.BASE_URL ?? "/"}${manifest.baseDir}`;

// A hex, vertex to vertex, in world metres (docs/unit-model-pipeline.md §2).
// The board's own px/m falls out of this and HEX_W.
const HEX_VERTEX_TO_VERTEX_M = 36.95;

// The camera's tilt, which is what compresses ground depth on screen (§2).
const SIN_ELEVATION = Math.sin((34.18 * Math.PI) / 180);

// Row 0. There is no facing in the unit model, so every unit faces the camera.
// If facing is ever added, this becomes a lookup into `spec.rows`.
const FACING_ROW = 0;

// Movement chips promote a unit's model: the squad walks, then rides, then
// crews a landship. Keyed off installed chips rather than effective Movement,
// for the same reason the strength flag is — see variantFor.
//
// `landship` is +3 and has no model of its own, so it clamps onto the tier-2
// vehicle rather than falling back to infantry, which would read as a
// demotion.
const MOVEMENT_TIERS = ["infantry", "vehicle_t1", "vehicle_t2"];

function chipTotals(unit) {
  let str = 0;
  let mov = 0;
  for (const id of unit?.chips || []) {
    const c = UNIT_UPGRADES[id];
    if (!c) continue;
    str += c.str || 0;
    mov += c.mov || 0;
  }
  return { str, mov };
}

// Which model a unit should be drawn as, given its movement chips. Falls back
// down the tiers so a faction missing a vehicle sheet still draws something.
export function unitKeyFor(faction, unit) {
  const have = manifest.units?.[faction];
  if (!have) return null;
  const { mov } = chipTotals(unit);
  const want = Math.min(mov, MOVEMENT_TIERS.length - 1);
  for (let i = want; i >= 0; i--) {
    if (have[MOVEMENT_TIERS[i]]) return MOVEMENT_TIERS[i];
  }
  return Object.keys(have)[0] || null;
}

export function spriteFor(faction, unit) {
  const key = typeof unit === "string" ? unit : unitKeyFor(faction, unit);
  return (key && manifest.units?.[faction]?.[key]) || null;
}

export function hasSprite(faction) {
  return !!manifest.units?.[faction];
}

// Which arrangement of that model to use.
//
// `veteran` is a boolean on the unit. The strength arrangement applies when the
// unit carries a chip that adds Strength — deliberately keyed off installed
// chips rather than effective Strength, because Strength also moves via
// transient effects (Korad's Forge, MODIFY_STAT with duration "this_turn") and
// keying off the total would flip units between sheets turn to turn.
//
// Preference order matters where the matrix is sparse: a veteran vehicle with a
// strength chip has no `vet_str` sheet, and promotion is the more legible state,
// so it draws as `vet` rather than `std_str`.
export function variantFor(unit, spec) {
  const veteran = !!unit?.veteran;
  const strong = chipTotals(unit).str > 0;
  const order = veteran && strong ? ["vet_str", "vet", "std_str", "std"]
    : veteran ? ["vet", "std"]
    : strong ? ["std_str", "std"]
    : ["std"];
  const have = spec?.variants || {};
  for (const v of [...order, "base"]) {
    if (have[v]) return v;
  }
  return Object.keys(have)[0];
}

// Sheet px -> board px at rest. BoardViewport's zoom is a transform on an
// ancestor, so this does not change with zoom.
export function spriteScale(spec) {
  return HEX_W / HEX_VERTEX_TO_VERTEX_M / spec.pixelsPerMetre;
}

// The unit's footprint, in board px across.
function footprintPx(spec) {
  return spec.footprintMetres * spec.pixelsPerMetre * spriteScale(spec);
}

// Everything the token needs to paint one unit, in board px.
export function spriteStyle(spec, variant, { uid = "" } = {}) {
  const s = spriteScale(spec);
  const v = spec.variants[variant] || Object.values(spec.variants)[0];
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
    // the anchor vertically, so this is not translate(-50%, -100%).
    transform: `translate(${(-ax / spec.frameWidth) * 100}%, ${(-ay / spec.frameHeight) * 100}%)`,
    animation: `${animName(spec)} ${spec.frames / spec.fps}s steps(${spec.frames}) infinite`,
    // Desync so twenty units do not breathe in unison (§7).
    animationDelay: `-${idleOffset(uid, spec)}s`,
    imageRendering: "auto",
  };
}

// Click target, in board px, centred on the anchor.
//
// This exists because the sprite's own box is the whole cell, most of which is
// transparent headroom for polearms, banners and gun barrels. Left to take
// clicks, that box is far wider than the spacing between adjacent units, so
// neighbouring tokens steal each other's clicks — the same failure the tile
// layer already solves with a separate hit layer (see HexBoard3D). Sizing the
// target to the unit's footprint instead keeps each unit clickable where it is
// drawn.
//
// The 0.74 is the placed-unit silhouette's aspect from the pipeline figures:
// infantry is 135 px across and about 100 px tall once the camera tilt has
// compressed a 4 m figure. Vehicles are wider, and scale with their footprint.
const SILHOUETTE_ASPECT = 100 / 135;

export function hitBoxStyle(spec) {
  const w = footprintPx(spec);
  return {
    width: w,
    height: w * SILHOUETTE_ASPECT,
    transform: "translate(-50%, -50%)",
  };
}

// Board-space box the drawn figure covers, given the ground point it stands on.
//
// Derived from the footprint rather than the cell: the footprint is a circle of
// `footprintMetres`, so it reaches half that to each side, and its near half
// projects below the anchor by the camera's sin. Upward it is bounded by the
// anchor's own headroom. Verified against every shipped sheet — the drawn pixels
// sit inside this box on all of them except the Plainers tier-1 vehicle, whose
// art overruns its cell.
export function drawnBox(spec, x, y) {
  const s = spriteScale(spec);
  const halfW = footprintPx(spec) / 2;
  return {
    x0: x - halfW,
    x1: x + halfW,
    y0: y - spec.anchor[1] * s,
    y1: y + halfW * SIN_ELEVATION,
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

// One keyframe per sheet width. The cycle scrolls the background by the sheet's
// own width, and infantry, tier-1 and tier-2 sheets are all different widths, so
// a single shared keyframe would slew two of the three out of register.
function animName(spec) {
  return `unit-idle-${spec.sheetWidth}`;
}

const injected = new Set();
export function ensureIdleKeyframes(spec) {
  if (typeof document === "undefined") return;
  const name = animName(spec);
  if (injected.has(name)) return;
  injected.add(name);
  const s = spriteScale(spec);
  const style = document.createElement("style");
  style.dataset.unitSprites = name;
  style.textContent =
    `@keyframes ${name}{` +
    `from{background-position-x:0}` +
    `to{background-position-x:${-spec.sheetWidth * s}px}}` +
    // Respect reduced-motion: hold frame 0 rather than cycling.
    `@media (prefers-reduced-motion: reduce){` +
    `[data-unit-sprite]{animation:none !important}}`;
  document.head.appendChild(style);
}
