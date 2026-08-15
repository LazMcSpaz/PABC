# Holographic Hex Board — Integration Plan

Turning the 14 hologram hex renders in `public/assets/ui/board/terrain/` into the
live game board, with the hologram recoloured per controlling faction, and the
Loyalty radial lifted off the tile to float above it.

Status: **plan + de-risking spike**. Nothing in `src/` has been changed yet.
Two of the three risky assumptions have been proven with working code (see
[What's already proven](#whats-already-proven)); the open decisions are in
[Decisions I need from you](#decisions-i-need-from-you).

---

## 1. What the art actually is (measured, not eyeballed)

`scripts/hex-tiles/measure-spike.py` measured all 14 renders. The headline is
good news:

| Property | Value | Spread across the 14 |
|---|---|---|
| Canvas | 1024 × 1024 JPEG | — |
| Hex width (vertex→vertex) | **970 px** | ±4 px (0.4%) |
| Hex centre x | **509 px** | ±0.5 px |
| Left/right vertex row (y) | **522 px** | **0 px — pixel-identical** |
| Projected top-face height | **352 px** | ±2 px on flat tiles |
| Plinth skirt height (at centre) | **139 px** | ±4 px |
| Tallest geometry above centreline | 258–335 px | varies by tile (as expected) |

**The camera is locked.** Every tile was rendered from the same rig, so tile
geometry is a set of constants rather than something to detect per-image. That
is what makes the whole plan cheap.

Three facts that *don't* match the existing pipeline doc and drive most of the
work below:

1. **The hexes are flat-top** (vertices left and right, flat edges top and
   bottom). `docs/blender-hex-tile-pipeline.md` specifies pointy-top, and the
   live board renders pointy-top.
2. **Camera elevation is ~24.8°** (vertical squash 0.419), not the 45–55° the
   pipeline doc specifies. Much more dramatic, much more occlusion.
3. **Opaque JPEG, no alpha.** The doc asks for WebP + alpha. The dark misty
   background has to be keyed out.

Content inventory of the 14: 4 flat/rolling plains, 5 mountain/mesa/badlands,
2 forest, 3 with settlements (2 small towns, 2 cities — one of each also sits in
a mountain bowl). **No coastline tile in the set**, despite the brief.

---

## 2. Recommended architecture

### 2.1 Recolour: three baked layers + a runtime tint

Do **not** hue-rotate the whole image (it drags the wooden plinth with it and
barely moves near-white pixels), and do **not** regenerate 4 coloured copies per
tile (56 files, colour drift, no smooth transitions, no contested states).

Split each source JPEG, offline, into three layers:

| Layer | Contents | How it's used |
|---|---|---|
| `<tile>_base.webp` | Plinth skirt only, background keyed out | plain `<img>`, never recoloured |
| `<tile>_holo.png` | Hologram intensity in the **alpha** channel | CSS `mask-image` over a solid faction-colour div, `mix-blend-mode: plus-lighter` |
| `<tile>_core.png` | Only the white-hot rim lines | `<img>`, `plus-lighter`, ~0.6 opacity — keeps the glow reading as *hot*, not as flat paint |

Separation is deterministic — no ML, no manual masking:

- The plinth silhouette is **analytic** (locked camera ⇒ the prism is a known
  flat-top hexagon plus a 139 px extrusion).
- Hologram vs plinth is a two-line classifier: the hologram is cool and
  emissive (`B − R > 4`, luminance > 50), the plinth is warm and only ever lit.

`scripts/hex-tiles/split-spike.py` is the working version of this. It runs on
all 14 tiles today.

### 2.2 A dedicated "holo palette", not the raw UI colours

Additively tinting a white-hot glow with a mid-tone colour produces mud. The
raw `data.js` faction colours are mid-tone. Compare rows 1 and 2 of the proof
image below — same tile, same pipeline, only the palette differs.

| Faction | UI colour (`data.js`) | Proposed holo colour |
|---|---|---|
| Versari | `#d2453f` | `#ff5f52` |
| Lakers | `#3f84c4` | `#58b6ff` |
| Goldgrass | `#85ab3e` | `#b8e04e` |
| Plainers | `#9d70c4` | `#c08cff` |
| Neutral / unheld | — | `#9fd8ff` (close to as-generated) |

These live next to `FACTIONS` in `data.js` as a `holoColor` field so the two
palettes stay visibly related but independently tunable.

### 2.3 Board geometry: one projection module

Replace `hexDims.js` with `src/prototype/hexProjection.js` holding the measured
constants and every screen-space derivation:

```
hexScreenPos(hex, {gap})   -> {x, y}   // centre of the tile's top face
topFacePolygon(scale)      -> points   // for hit-testing + the ZoC ring
boardBounds(hexes, {gap})  -> {w, h}
```

Because the art is flat-top, **engine rows render as screen columns**. Crucially
this needs no new math: `buildHexGrid` already stamps every hex with
`x = col - (width-1)/2`, which encodes the half-row interlock. So:

```js
screenX = hex.row * (0.75 * HEX_W * gap)
screenY = hex.x   * (HEX_H * gap)
```

The engine's adjacency graph is purely topological (`board.js:buildHexGrid`) —
it does not care which way the hexes point, so **no engine or save-format change
is needed anywhere**. This is entirely a display-layer change.

`CONFIG.testMap` is `[3,4,5,6,5,4,3]`, near-symmetric, so transposing keeps the
board roughly the same shape — it just becomes wider and shorter (~2.4:1), which
suits a widescreen viewport.

### 2.4 Absolute positioning + per-tile z-order

The current flex-rows-with-negative-margin layout can't express this. Move to a
single absolutely-positioned container, tiles placed at their projected centre,
`zIndex` assigned by sorting **every tile by screen y** (not by row — with a
flat-top grid, adjacent columns are offset by half a step, so rows no longer
share a y).

### 2.5 A dedicated hit-test layer

With heavy overlap, rectangular tile divs will steal each other's clicks. Put
one SVG on top of the board with a `<polygon>` per hex using
`topFacePolygon()`, `fill="transparent"`, carrying all pointer events. Tiles
themselves become `pointer-events: none`. This also fixes hover precision and
makes the ZoC ring and the hit target the same shape by construction.

### 2.6 The floating Loyalty radial

Render `ControlMeter` into a **separate overlay layer above all tiles**, at the
tile's centre lifted ~300 source-units upward, plus:

- a dashed vertical **tether** down to the tile, and
- a small **ground ellipse** on the top face where the tether lands.

The tether and ellipse are what keep it attached — without them a floating
circle just reads as UI clutter. The meter stays a true circle (it is *not*
squashed by the projection), which is what sells it as a billboard hovering in
3D space.

Consequence to accept deliberately: in the overlay layer, a nearer tile never
occludes a farther tile's meter. That costs a little depth realism and buys
guaranteed legibility. I think that's the right trade for a meter you have to
read every turn.

### 2.7 Fog of war gets better, not worse

The hologram fiction maps onto `hex.fog` almost for free:

- `unexplored` → plinth only, projector off (base layer, no holo layers).
- `explored` → holo layers at low opacity, desaturated toward neutral: a stale
  recording.
- `visible` → full tint.

This is a genuine upgrade over the current black/50%-dim treatment.

---

## 3. What's already proven

Both images below were produced by the spike scripts in `scripts/hex-tiles/`
running on the real assets.

### Recolour works

![Hologram recolour proof](images/holo-tint-proof.png)

Four tile types × five palettes. The plinth stays warm wood in every cell; only
the hologram takes the faction colour. Row 2 is the same tile with the raw UI
colours — visibly darker and muddier, which is the evidence for §2.2.

### The board reads

![Board layout mock](images/holo-board-mock.png)

A full 30-hex `testMap` on the flat-top grid, tinted by territory. **A** is
tight-packed (gap 1.00), **B** is floating (gap 1.22).

Territory-by-hologram-colour is instantly legible at a glance — the core idea
works. Tight packing fuses the tiles into an unreadable slab and tall art buries
its neighbour; floating gives every plinth a silhouette and drops occlusion a
lot. **I recommend B.**

Also visible in the mock, and worth looking at closely: tile repetition. 14
tiles over 30 hexes puts duplicates side by side in places.

---

## 4. Implementation phases

Each phase is independently shippable and leaves the game working.

| # | Phase | Touches | Notes |
|---|---|---|---|
| 0 | **Asset pipeline** | `scripts/hex-tiles/`, `public/assets/ui/board/tiles/` | Promote the spike to a real build script. Semantic filenames, a `tiles.json` manifest (geometry + tags), layers cropped to their own bbox with the offset in the manifest, WebP out. Move the JPEG masters out of `public/` so they stop shipping. |
| 1 | **Projection module** | new `hexProjection.js`, `hexDims.js` (deleted), `aiReplay/CameraController.js` | Pure geometry, unit-testable headless. Camera controller must be updated in lockstep or replay panning breaks. |
| 2 | **`HexTile` component** | new `HexTile.jsx` | The three-layer stack + tint + fog states. Renders standalone before the board uses it. |
| 3 | **Board rewrite** | `HexBoard.jsx`, hit-test layer | Absolute positioning, y-sorted z-index, SVG polygon hit layer. |
| 4 | **Re-site the overlays** | `Hex.jsx` (dismantled into `HexTile` + overlays) | Unit tokens, ghosts, ZoC ring, road band, terrain badge, loot marker all move onto the projected top face. This is the biggest single chunk of work — see P5. |
| 5 | **Floating radial** | `ControlMeter.jsx`, overlay layer | Tether + ground ellipse + billboard sizing. |
| 6 | **Tint source of truth** | new `holoTint.js`, `data.js` | `holoColor(hex)` resolution order, contested handling, CSS colour transition on control flips. |
| 7 | **Fog treatment** | `HexTile.jsx` | §2.7. |
| 8 | **Perf + LOD pass** | `HexTile.jsx`, `BoardViewport.jsx` | Below ~0.6 scale, swap the three-layer stack for a single flat tinted polygon. Re-tune `MIN_SCALE`/`MAX_SCALE`. Capture before/after with `npm run shots`. |

Suggested sequencing guard: build phases 1–5 behind a `boardV2` flag so the
current board stays available for comparison until the new one is clearly
better.

---

## 5. Pitfalls

Ordered roughly by how much damage each does if it's discovered late.

**P1 — Orientation mismatch (structural).** The art is flat-top; the board, the
CSS clip-path, the token slots, the ZoC polygon and the replay camera all assume
pointy-top. Every one of those has to move together. The engine is unaffected.

**P2 — Occlusion at 24.8° (measured).** Tall geometry reaches up to 335 px above
the hex centreline against a 352 px vertical pitch. At gap 1.00, a tall tile
hides essentially all of the tile behind it. Gap ≥1.2 makes it acceptable;
re-rendering at ~40° elevation would fix it properly. See Q3.

**P3 — Lossy masters.** JPEG ringing around the glow leaves faint speckle in the
alpha mask. The analytic prism mask keeps it out of the plinth, but PNG/WebP
masters would produce visibly cleaner edges.

**P4 — Palette.** Covered in §2.2. Additional risk: Versari red and Goldgrass
green are the two hardest to tell apart for the most common colour-vision
deficiencies, and they are adjacent on the map. The tint should not be the
*only* ownership cue — keep a shape or pattern cue (the rim, the radial) as
backup.

**P5 — Overlay re-siting is the long tail.** `Hex.jsx` has seven separate things
positioned in flat-hex percentage coordinates: unit tokens (5 slots), ghost
tokens, the ZoC dashed ring, the ZoC area tint, the road band, the terrain
badge, and the loot marker. Every one needs projected coordinates. Budget real
time for this; it's more work than the tinting.

**P6 — Baked art has no depth buffer.** A unit token "standing on" a mountain
summit will float or sink, because nothing knows how tall the terrain is under
it. Practical answer: place tokens on the **front apron** of the top face, where
the ground plane is reliable across all 14 tiles, with a contact ellipse. Don't
try to place them on the terrain surface.

**P7 — Draw order.** Must be per-tile by screen y, not per-row. The existing
`zIndex: rowIdx` hardening in `HexBoard.jsx` becomes wrong, not just redundant.

**P8 — Variety.** 14 tiles across 30 hexes (more on larger maps) repeats
visibly. A horizontal flip would double the pool to 28 cheaply — the lighting in
these renders looks close to frontal, so flipping is *probably* safe, but it
needs an eyeball check before relying on it.

**P9 — Missing tile types.** No coastline (asked for in the brief, absent from
the set). No rubble/wetland, though `docs/content-schema-v0.1.md` anticipates
them and `hex.terrain` already exists in the engine (currently always `null`).
No edge-socket variants, so **roads cannot be drawn as connected art** — the
existing flat `RoadBand` will look wrong lying across a 3D tile and needs its
own answer.

**P10 — Stale prep work.** `src/prototype/hexArt.js` is built on the assumption
of *per-faction* art sets chosen by a static region BFS. Generic art plus a
runtime tint makes that premise obsolete: `resolveTerrainArt`,
`resolveSettlementArt` and `regionOwnerMap` should be deleted or repurposed
rather than wired up. `docs/blender-hex-tile-pipeline.md` also needs
reconciling — the delivered art contradicts three of its locked specifications
(orientation, camera elevation, alpha).

**P11 — Performance.** Per tile: 2 images, 1 masked div, 2 blend-mode layers,
its own stacking context. At 30 hexes this is fine; on a larger map with 120 it
needs the LOD in phase 8. Bake glow into the layers rather than using CSS
`drop-shadow`, which is the expensive one.

**P12 — Browser support.** `mix-blend-mode: plus-lighter` needs Firefox 113+;
older Firefox needs a `screen` fallback. CSS masks still want `-webkit-` prefixes
for Safari. Also noted from the spike: masks referencing local files are blocked
on `file://` origins — irrelevant to the dev server and to production, but it
will silently break for anyone who opens a built `index.html` directly from disk.

**P13 — Zoom range.** The board becomes ~2.4:1. At the current `MIN_SCALE` of
0.45 the hologram detail turns to mush; `MAX_SCALE` 2.4 is fine against a 1024 px
source. Both want re-tuning alongside the LOD switch.

**P14 — Encounter and wasteland hexes.** The `?` glyph and the "Wasteland" label
are flat-board idioms. They need a hologram-native treatment (a glitching
projection, an unresolved wireframe) or they'll look pasted on.

---

## 6. Decisions I need from you

Ordered by how much they block. Q1–Q3 gate the phase-0/1 work; the rest can be
answered as we go.

**Q1 — Orientation.** Transpose the board to flat-top (no re-render, engine rows
become screen columns), or re-render the art pointy-top to match the existing
board and pipeline doc? *My recommendation: transpose.* The art is good, the
transpose is cheap, and `testMap` is near-symmetric so the board barely changes
shape.

**Q2 — Packed or floating.** Mock A vs mock B above. *My recommendation:
floating (gap ~1.2)* — it matches how the source art presents itself, it makes
each plinth read, and it's far more forgiving.

**Q3 — Re-render at a higher camera?** Keeping 24.8° means living with P2's
occlusion. Re-rendering at ~40° would cut it a lot and make settlements more
readable, at the cost of some drama — and if you're re-rendering anyway, that's
the moment to also fix orientation (Q1), get PNG/alpha masters (P3), and add the
missing tile types (P9).

**Q4 — Can you regenerate, and with what?** Do you still have the generation
workflow and prompt for these? Knowing whether more tiles are cheap or expensive
changes the answer to Q3 and P8 completely.

**Q5 — What drives the tint?** There are two different ownership signals in the
engine. *My recommendation:* Location hexes tint by `controller` (hard
ownership), terrain hexes tint by `zocOwner` (soft influence, already computed
in `influence.js`), contested hexes stay neutral with a slow pulse. Confirm, and
tell me what a contested hex should look like.

**Q6 — Does the plinth change per faction too,** or does it stay uniform wood
everywhere? Uniform reads as "one shared map table", per-faction reads as
"territory". I lean uniform, since the hologram already carries the colour.

**Q7 — Approve the holo palette** in §2.2, or adjust the four colours.

**Q8 — Unit tokens.** Keep them as the current 2D chips floating over the tile,
or restyle them as part of the hologram? P6 constrains where they can sit either
way.

**Q9 — Scope.** Does this replace the board everywhere (Prototype, HudShowcase,
the AI replay), or ship behind a flag first? *My recommendation: flag.*

---

## 7. What this does not change

Worth stating plainly, because it bounds the blast radius: no engine file, no
game rule, no save format, and no content data changes. `buildHexGrid`'s
adjacency is topological, ZoC is already computed every turn, and Loyalty and
control already exist. Everything above lives in `src/prototype/` and
`public/assets/`.
