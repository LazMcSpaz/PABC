# Hex Tile Asset Pipeline — Blender Instance Instructions

Instructions for a Claude instance with Blender MCP access, producing pre-rendered
isometric hex tile sprites for The Remnant Continent. Output is **baked 2D sprites**,
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

**Update (verified, 2026-08-07):** this was originally flagged as a required
code change before tall art could land safely. Turned out not to be true —
verified empirically (an injected marker with real vertical bleed, in an
adjacent row, with conflicting internal z-index values) that draw order
across rows already resolves correctly today. Every hex cell (`Hex.jsx`) sets
a non-`none` CSS `filter` (its drop-shadow), which independently creates a
stacking context per cell per the CSS spec — so row-order-correct painting
already falls out of plain DOM order, no explicit z-index needed. An explicit
`zIndex: rowIdx` was added to each row in `HexBoard.jsx` anyway as defensive
hardening (so this doesn't silently break if a future code path ever renders
a cell with `filter: "none"`), but it's not fixing an observed bug — the
board can already take tall isometric art with no further engine change.

---

## Art resolver — `src/prototype/hexArt.js`

Prep work, built ahead of any real files existing: a pure module that decides
which tile image belongs on a hex, once art lands. Nothing calls it yet —
`Hex.jsx`/`HexBoard.jsx` still render the current flat CSS fills. Wiring it in
(with an `<img onError>` fallback to today's gradient fill for any tile whose
art hasn't shipped yet) is a small follow-up once real files exist, not
included here to avoid broken-image regressions on the live game before then.

- `resolveTerrainArt(hex, owner)` — flat vs. mountain bucket comes from the
  real `hex.elevation` boolean (already mechanically meaningful: it blocks
  line of sight and halts movement — see `src/game/board.js`), not an
  invented/random split. `owner` is a factionId from `regionOwnerMap` below.
- `resolveSettlementArt(locationId)` — tier comes from the real
  `LOCATIONS[id].strategicValue` in `src/game/content.js` (`low`/`medium` →
  small, `high` → medium, `veryHigh` → large — matches the actual
  distribution of the 10 locations defined today). Faction skin comes from
  `LOCATIONS[id].affiliation`, which is permanent content data, decoupled
  from the live, conquest-changeable `controller` — a captured city doesn't
  change its architecture the turn it's captured.
- `regionOwnerMap(state)` — there's no static "which faction's territory is
  this" field on a plain terrain hex; that's normally 100% emergent at
  runtime via Zone of Control (`src/game/influence.js`), which shifts as
  armies move. Art can't work that way without visibly flickering, so this
  computes a **separate, static** region assignment once: a multi-source BFS
  from every faction's permanently-affiliated Location hexes, over the
  existing `state.board.adjacency` — a Voronoi partition seeded by home
  cities, not current front lines. Pure function of already-persisted state;
  no engine/save-format change.
- Both variant-selection and region-assignment are deterministic (a stable
  string hash, not `Math.random` or the engine's seeded `state.rng`) — the
  same hex always resolves to the same art, forever, so tiles don't visibly
  reshuffle their art between renders.
- Verified against 5 seeds × multiple map sizes: 100% terrain-hex region
  coverage, all resolved owners are real playable factions, deterministic
  repeat calls, elevation hexes correctly resolve to the mountain bucket,
  and (on a Huge map) all 3 flat and multiple mountain variants actually get
  used rather than the hash degenerating to one index.

## Roads & rails — current state (informational; not implemented here)

Flagged as future scope, not acted on. Worth knowing before that work starts:

- **Roads are already a real, live mechanic.** `hex.road` (boolean,
  `src/game/board.js`) is laid as a minimum-spanning-tree of shortest paths
  between faction capitals at generation time, and negates both the
  mountain-halt and the forest movement-cost penalty. Cosmetically it's
  already drawn today as `RoadBand` in `Hex.jsx` — a flat band across the
  hex, not edge-connected art. A real connected-road art system (the tile
  showing a path that lines up with its specific neighbors) needs edge-socket
  tile variants — this pipeline's tiles don't have that concept yet.
- **Rail has zero mechanical existence anywhere in the engine.** No
  `hex.rail` field, no rail terrain type, no rail movement rule. The only
  hits for "rail" in the whole codebase are flavor text (an ability named
  `rail-corridor`, a "Rail Walker" encounter character) — unrelated to any
  tile mechanic. Building a rail system means designing the mechanic from
  scratch, not re-skinning roads.
- **The engine already anticipates a fuller terrain sub-type system than
  this pipeline's flat/mountain split.** `hex.terrain` is a real field
  referenced by combat (`contest.js`'s mountain defense bonus) and by
  encounter content filters (`encounters.js`), with a documented intended
  enum of `mountain`/`forest`/`rubble`/`wetland`/… in
  `docs/content-schema-v0.1.md` — but `setup.js` always stamps it `null` in
  real games, so none of that is currently live; only the `elevation`/`cover`
  booleans are. That's the "terrain+roads work track" `encounters.js`'s own
  comments refer to. This pipeline deliberately does not touch it — flagging
  it here since it's the natural next step whenever terrain/road art depth
  becomes a priority, and it would let `resolveTerrainArt`'s flat/mountain
  split grow into the forest/rubble/wetland variety the schema already
  anticipates without changing this module's shape.
