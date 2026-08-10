# Hex Tile Asset Pipeline — Blender Instance Instructions

Instructions for a Claude instance with Blender MCP access, producing pre-rendered
isometric hex tile sprites for Ashland Conquest. Output is **baked 2D sprites**,
not live 3D — this game's board (`src/prototype/HexBoard.jsx`) is plain 2D
CSS/DOM with no WebGL. Poly counts below are for *your* iteration speed in
Blender, not phone performance — there is no runtime GPU cost to any of this.

Work **one faction at a time**. The user provides all building and terrain
reference images for a faction up front; work the phases below in order,
independently, pausing only at the checkpoint gates.

---

## 0. Setup (once, reused for every faction)

Before touching any faction's references, build and save these as reusable
templates — every asset in every faction must share them exactly, or tiles
won't look like they belong on the same board.

**Hex guide mesh.** A flat pointy-top hexagon at the exact in-game ratio:
flat-to-flat width : vertex-to-vertex height = **1 : 1.1547**. Orientation is
pointy-top — vertex points toward camera-top and camera-bottom, flat edges
left/right. Keep this as a non-rendering reference plane in every scene; every
asset's ground footprint must sit exactly inside it.

**Scale reference.** 1 Blender unit = 1 meter. Hex flat-to-flat diameter =
**32m**. This is the shared ruler for everything below — use it, don't eyeball
proportions per-asset:

| Element | Height (world) |
|---|---|
| Small building | 3–4m |
| Medium building | 6–9m |
| Large / hero building | 12–18m |
| Hill/mountain relief (mountainous terrain tier) | 8–16m above ground |

**Pivot convention (every single asset, no exceptions):** object origin at the
hex center, Z=0 at the ground plane. This is what lets buildings drop onto
terrain with a simple X/Y offset instead of manual alignment hunting every time.

**Camera + light rig.** Save this as its own template scene, reused unmodified
for every render in every phase:
- **Orthographic camera**, not perspective — perspective breaks edge alignment
  between tiles.
- **Elevation 45–55° from horizontal.** Steeper than "true" isometric (35.264°)
  on purpose — a hex strategy board needs the ground plane to read clearly more
  than it needs diorama drama, and true-isometric causes tall tiles to occlude
  their neighbors too aggressively in a dense grid.
- **Azimuth: pick one, lock it, never touch it again for the rest of this
  project.** Align it so the camera looks squarely at one of the hex's flat
  edges, not at a vertex — keeps every render left-right symmetric, which
  matters once tiles get rotated in 60° steps for cheap variety later.
- **One Sun lamp** (parallel rays — not a point light), same angle and color
  temperature for every render, forever. Keep it soft/high-angled. Tiles get
  shuffled into arbitrary map positions next to unrelated neighbors, so any
  shadow that reads as "directional" will look broken sitting next to a tile
  lit identically but with different geometry. Shadows should read as
  ambient occlusion, not as cast shadows with an obvious sun direction.
- Transparent background, alpha on, for every render.

**Placement slots for settlements** (used in Phase 3): a concentric-ring
system so building placement is a decision, not an improvisation, every time:
- **Center slot** (1): the hero/largest building, dead center of the hex.
- **Inner ring** (3 slots, 120° apart, ~8m radius): secondary buildings.
- **Outer ring** (6 slots, 60° apart, ~14m radius): small/tertiary buildings.
- Leave the outer ~10–15% of the hex radius clear of tall geometry — that
  margin, plus the canvas padding in Phase 4, is what keeps a tall building's
  isometric overhang from visually spilling into a neighboring tile's render.

---

## 1. Building library (per faction)

The user provides reference images for this faction's buildings. For each:

- Model, texture, set pivot per the convention above.
- Reference images are a **style guide, not a blueprint** — extract silhouette,
  proportions, material language, and key details; don't chase photoreal
  reproduction of a real-world reference photo. Match the low-poly, stylized
  direction the tri budget implies.
- **Establish a per-faction style note as you go**: primary material, accent
  material, palette. Once set from the first building, every subsequent
  building in this faction's batch should stay consistent with it rather than
  re-deriving material choices per-asset.
- **Canonical facing:** every building's primary facade faces world -Y by
  default at its library origin. (Individual placements in Phase 3 may rotate
  instances for natural variation — real settlements don't have every
  building facing the same way — but the library version stays canonical.)
- **Tri budget** (per building, not per tile):

| Tier | Tris |
|---|---|
| Small (hut, shed, stall) | 300–800 |
| Medium (hall, workshop, barracks) | 800–2,000 |
| Large / hero (keep, landmark, faction seat) | 2,000–5,000 |

- Model at least: several small, a few medium, and 1–2 hero/large buildings —
  enough variety to fill 2 large + 3 medium + 2 small settlement tiles later
  without every settlement looking identical.

**Checkpoint gate:** once the building set is modeled and textured, render a
quick low-res contact sheet (all buildings, front-facing, neutral lighting —
doesn't need the final rig) and pause for the user's approval before starting
terrain. Catching a style problem here is cheap; catching it after it's baked
into 7 finished settlement tiles is not.

---

## 2. Terrain tiles (per faction)

The user provides terrain reference images for this faction's territory. Build:

- **3 flat variants** — 500–2,000 tris each.
- **3 mountainous variants** — 2,000–6,000 tris each, using the 8–16m relief
  height from the scale table.
- Ground footprint must sit exactly inside the hex guide mesh from Phase 0 —
  verify alignment before moving on; drift here becomes a visible seam once
  tiles are on the actual board.
- Same style-extraction rule as buildings: reference images guide material and
  mood, not literal reproduction.

**Checkpoint gate:** render the 6 terrain tiles through the real camera/light
rig (this is worth doing at final quality, since it's also useful as a
standalone deliverable) and pause for approval before combining into
settlements.

---

## 3. Settlement tiles (combine, don't remodel)

No new geometry here — this phase is placement, not modeling.

- Start from one of the 3 flat terrain tiles as the base (mountainous
  settlement bases are a fine stretch goal later, not required for v1).
  Optionally dress the ground with paths/cleared patches between buildings,
  reusing the terrain tile's own material language.
- Place buildings from the library into the ring-slot system from Phase 0,
  sized to the settlement tier:

| Tier | Count needed | Suggested building mix |
|---|---|---|
| Small | 2 | center slot + 0–1 inner slot, small/medium buildings only |
| Medium | 3 | center + 2–3 inner/outer slots, mix of small + medium |
| Large | 2 | center (hero building) + most inner/outer slots filled |

- Duplicated buildings may be rotated per-instance for natural variation
  (see canonical facing note in Phase 1) but should not be rescaled —
  scale consistency is what makes the size tiers read correctly.

---

## 4. Final render pass

Render **every** tile — all 6 pure terrain (if not already done at final
quality in the Phase 2 gate) and all 7 settlement tiles — through the exact
same locked camera/light rig from Phase 0. No exceptions, no per-tile tweaks.

- **Resolution:** 1024–1152px wide (flat-to-flat), canvas height ≈1.6–1.9× the
  hex's own height to leave headroom for tall geometry without clipping.
- **Format:** WebP (matches existing project art in `public/assets/`), sRGB,
  alpha channel. Also keep a PNG master per tile in case a re-export at a
  different resolution is ever needed without re-rendering from Blender.
- **Naming:** `terrain_<faction>_flat_0{1-3}.webp`, `terrain_<faction>_mountain_0{1-3}.webp`,
  `settlement_<faction>_{small|medium|large}_0{n}.webp`.

**Definition of done, per faction:** 13 rendered hex tiles (3 flat + 3
mountain + 2 large + 3 medium + 2 small settlements) + the underlying building
and terrain library files, kept and organized by faction so they can be
referenced or reused later.

---

## Integration note (for whoever wires the art in, not the modeling instance)

The current board renderer has no notion of draw order beyond row position —
it draws flat gradient fills today. Once tiles have real vertical relief, a
tall tile needs to visually occlude the tile "above" it in screen space, which
requires back-to-front (row-by-row) paint order — standard painter's-algorithm
handling for isometric tile grids. This is a code change on the game side, not
something the asset pipeline needs to solve, but land it before the first real
tile set ships or tall settlement tiles will render with visible glitches.
