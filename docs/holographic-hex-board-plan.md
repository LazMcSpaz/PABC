# Holographic Hex Board — Integration Plan

Turning the 16 hologram hex renders (now `art/hex-tiles/masters/`) into the
live game board, with the hologram recoloured per controlling faction, and the
Loyalty radial lifted off the tile to float above it.

Status: **built and running.** Phases 0–7 below are implemented; the board is
live behind `?board=holo` (the default) with `?board=flat` still rendering the
old one for comparison on the same save. Phase 8 (LOD + perf) and the long tail
in §5 are not done. Open questions are in [Decisions](#6-decisions).

---

## 1. What the art actually is (measured, not eyeballed)

`scripts/hex-tiles/measure-spike.py` measured the renders. The headline is
good news:

| Property | Value | Spread across the 14 |
|---|---|---|
| Canvas | 1024 × 1024 JPEG | — |
| Hex width (vertex→vertex) | **972 px** | ±4 px (0.4%) |
| Hex centre x | **509 px** | ±0.5 px |
| Left/right vertex row (y) | **522 px** | **0 px — pixel-identical** |
| Top/bottom flat edge | **556 px** | ±3 px |
| Projected top-face height | **469 px** | fitted, see below |
| Near-edge slope \|dx/dy\| | **0.887** | 0.851–0.914 |
| Plinth skirt height (at centre) | **81 px** | ±4 px |
| Tallest geometry above centreline | 258–335 px | varies by tile (as expected) |

**The camera is locked.** Every tile was rendered from the same rig, so tile
geometry is a set of constants rather than something to detect per-image. That
is what makes the whole plan cheap.

The height figure is *fitted*, not read off directly, and an earlier pass got
it badly wrong. Measuring where the hologram's far rim sits gives 352 — but the
far half of the top face is hidden behind the terrain, so the rim is not the
hexagon's edge. The honest fit comes from two things that are unobstructed on
every master: the bottom face's flat edge (556 px) and the slope of the near
edges (0.887), which pin the height through `(hexW − hexFlat) / hexH = slope`.
Using 352 packed tiles at 75% of their true vertical pitch, which is what made
the board look flattened and clipped tiles into their neighbours.

Three facts that *don't* match the existing pipeline doc and drive most of the
work below:

1. **The hexes are flat-top** (vertices left and right, flat edges top and
   bottom). `docs/blender-hex-tile-pipeline.md` specifies pointy-top, and the
   live board renders pointy-top.
2. **Camera elevation is ~34°** (vertical squash 0.557), not the 45–55° the
   pipeline doc specifies.
2b. **The tiles are not REGULAR hexagons.** A regular flat-top hexagon has a
   flat edge of exactly half its vertex-to-vertex width; these measure 0.572 of
   it. They still tile the plane exactly — opposite sides are parallel and
   equal, which is all a hexagon needs — but the pitch has to be derived from
   the measured flat edge, not from the textbook `0.75 × W`.
3. **Opaque JPEG, no alpha.** The doc asks for WebP + alpha. The dark misty
   background has to be keyed out.

Inventory, using the author's labels (16 masters, after two coastline
additions): 1 plains, 2 forest, 3 mountain/plateau, 3 inland settlements,
2 inland cities, 3 open coastlines, 1 coastal settlement, 1 coastal city.
Three tiles I had first read as cracked plains, badlands and mesa turned out to
be **coastlines** — the labels caught that, guessing did not.

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
| `<tile>_holo.webp` | Hologram intensity in the **alpha** channel | CSS `mask-image` over a solid faction-colour div, `mix-blend-mode: plus-lighter` |
| `<tile>_core.webp` | Only the white-hot rim lines | `<img>`, `plus-lighter`, ~0.6 opacity — keeps the glow reading as *hot*, not as flat paint |

Separation is deterministic — no ML, no manual masking:

- The plinth silhouette is **analytic** (locked camera ⇒ the prism is a known
  flat-top hexagon plus a 139 px extrusion).
- Hologram vs plinth is a two-line classifier: the hologram is cool and
  emissive (`B − R > 4`, luminance > 50), the plinth is warm and only ever lit.

Built by `scripts/hex-tiles/build_tiles.py`; the original proof is kept as
`split-spike.py`.

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

These live next to `FACTIONS` in `data.js` behind `holoColor(id)` so the two
palettes stay visibly related but independently tunable.

### 2.3 Board geometry: one projection module

`src/prototype/hexProjection.js` holds the measured constants and every
screen-space derivation: `buildHexGeometry(rows)`, `paintOrder(centers)`,
`topFacePolygon(inset, cx, cy)` and `tileFor(hex, value)`. `hexDims.js` stays
for the flat board, which keeps its own pointy-top geometry.

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

### 2.8 Roads and rails ride over the tiles

`hex.road` is a per-hex boolean, not an edge list, so `RouteNetwork.jsx`
recovers a drawable network by linking each road hex to its road neighbours —
re-deriving adjacency with the engine's own rule rather than from screen
distance, so it survives any projection change.

Two things decide how they're drawn. The background is never the same colour
twice (a route crosses hexes glowing in whatever colour their owner is), so
every route gets a **dark casing** under a bright core — the standard
cartographic trick — and is legible over any tint. And the two types are
distinguished by more than hue: roads are one solid amber line, rails carry
cross-ties, which survives both a recolour and colour-vision deficiency.

Routes stop short of a Location's centre, trimmed against an ellipse that
matches the board's vertical squash so the clearance reads as circular on the
projected ground.

Layer order is tiles → routes → tokens → radials → hit layer. Getting tokens
above the routes is why they moved out of `HexTile` into `BoardTokens.jsx`: a
tile is its own stacking context, so nothing inside one can rise above a
sibling tile.

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

### …and here it is running

![The live board](images/holo-board-live.png)

The real thing, turn 1 of a 30-hex `testMap`, with fog, packed at `GAP = 1.0`.
Unexplored hexes keep an unlit plinth so the board's extent still reads;
territory is Versari red, Goldgrass green, Croppers yellow, Plainers purple,
unheld ground cyan. The Loyalty radials hang above their Locations on a dashed
tether, and the road network runs over the tiles and under the unit tokens.

![Zoomed in](images/holo-board-live-zoom.png)

---

## 4. Implementation phases

Each phase is independently shippable and leaves the game working.

| # | Phase | State | Where it landed |
|---|---|---|---|
| 0 | Asset pipeline | done | `scripts/hex-tiles/build_tiles.py` → 42 layers + `src/prototype/hexTiles.json`. Masters moved out of `public/` to `art/hex-tiles/masters/` so they stop shipping; output is 2.44 MiB of WebP for all 14 tiles. |
| 1 | Projection module | done | `hexProjection.js`. `CameraController.buildHexGeometry` takes a `{holo}` flag and delegates, so the replay camera pans to the right hex on either board. |
| 2 | `HexTile` component | done | `HexTile.jsx` — three-layer stack, tint, fog, tokens, rings, road, loot. |
| 3 | Board rewrite | done | `HexBoard3D.jsx` — absolute placement, y-sorted z-index, SVG hit layer. |
| 4 | Re-site the overlays | mostly | Unit tokens, ghosts, ZoC ring, road, encounter mark and loot are all on the projected top face. The terrain elevation/cover badge was dropped: the art now says it. |
| 5 | Floating radial | done | `FloatingControlMeter.jsx` — tether, contact ellipse, unsquashed billboard. |
| 6 | Tint source of truth | done | `holoTint.js` + `holoColor` in `data.js`; 0.45s colour transition on control flips, contested pulses. |
| 7 | Fog treatment | done | Unexplored = plinth with an unlit top face; explored = projection at 0.34. |
| 8 | **Perf + LOD pass** | **not done** | No LOD swap below ~0.6 scale, `MIN_SCALE`/`MAX_SCALE` not re-tuned. Fine at 30 hexes; do this before a larger map. |

The flag is `?board=holo` / `?board=flat` (remembered in localStorage under
`pc.board`, default holo), so both boards run against the same save until the
new one is unambiguously better.

---

## 5. Pitfalls

Ordered roughly by how much damage each does if it's discovered late.

**P1 — Orientation mismatch (structural).** The art is flat-top; the board, the
CSS clip-path, the token slots, the ZoC polygon and the replay camera all assume
pointy-top. Every one of those has to move together. The engine is unaffected.

**P2 — Occlusion (measured).** Tall geometry reaches up to 332 px above the hex
centreline against a 469 px vertical pitch, so a tall tile hides roughly the
back two-thirds of the tile behind it at `GAP = 1.0`. Accepted (Q3).

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

**P9 — Missing tile types.** Coastlines have landed (5 of them). Still no
rubble/wetland, though `docs/content-schema-v0.1.md` anticipates them and
`hex.terrain` already exists in the engine (currently always `null`). Roads and
rails are drawn as a **vector network over** the tiles rather than as
edge-socket art (§2.8), so they need no new tile variants — but they also do
not blend into the terrain they cross.

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

## 6. Decisions

### Settled

- **Q1 Orientation — transpose.** Engine rows render as screen columns; the art
  stays flat-top and is not re-rendered for orientation.
- **Q2 Spacing — packed, `GAP = 1.0`.** Plinths meet and the board reads as one
  continuous map table. Tile-on-tile occlusion is accepted (Q3).
- **Q3 Camera — keep 24.8°.** Not re-rendering for the angle; a tile in front
  hiding part of the one behind it is fine.
- **Q5 Tint source — split.** Location hexes tint by `controller`, terrain and
  encounter hexes by `zocOwner`, contested stays neutral with a slow pulse.
- **Q6 Plinth — uniform.** Never recoloured, no per-faction material.

### Open

- **Q3 Camera elevation — deferred, pending the cost of regenerating (Q4).**
  Not a blocker: the pipeline and the renderer both read their geometry from
  `tiles.json`, so a re-rendered set at a different elevation is a manifest
  change plus a rebuild, not a code change. Phases 0–3 proceed either way.
- **Q4, Q6–Q9** below.

### Still needed from you

**Q4 — More flat inland masters.** The single biggest visual gap now. After
tagging, the pools are: inland flat **1**, forest 2, mountain 4, town 3, city 2,
open coast 3, coast town 1, coast city 1. Flat is the pool that matters most —
`CONFIG.hexSplit` gives the map 13 encounter hexes, none of which ever carry
`elevation` or `cover`, so they all resolve flat, and every one of them draws
the same `plains_hills`. Two or three more plain/rolling inland masters would
fix roughly half the board.

**Q10 — Where does rail come from?** `RouteNetwork.jsx` draws rails today, but
`hex.rail` does not exist: no field, no generator, no movement rule (P9). The
renderer reads the field, so rails appear the moment the board stamps them.
Either the engine grows a real rail network (a second pass like `assignRoads`,
plus whatever rail is supposed to *do*), or say the word and I'll generate a
display-only one at setup.

**Q11 — Should Dambar still be a Versari home Location?** The capital bug is
fixed (see below), but one question survives it: `src/game/content.js` lists
**dambar** among Versari's two affiliated Locations, while the fiction has
Dambar as the Denver analogue and the Dambarans plainly from there. Moving it
would leave Versari with one home Location, and `generateLayout` assumes every
major faction has exactly two — so this is a content change with a generator
consequence, not a one-line edit.

**Q12 — Should the generator force the coastal factions east?** Coast art is
positional, so Lakers (chigan + droit) and Tempest currently start wherever
`generateLayout`'s farthest-point sampling puts them, which is often inland.
Pinning their anchor to the eastern rim is a contained change to
`generateLayout`, but it is a real map-generation change — it re-rolls every
existing seed — so I have not made it.

**Q13 — Vertical stretch.** `STRETCH` in `hexProjection.js` fakes a higher
camera by scaling every vertical measurement; it is at **1.25** (reads as
~45°). 1.0 is the art exactly as rendered (~34°). It is a cheat: a real camera
lift would foreshorten tall geometry as it opened up the ground plane, and this
only does the second half, so mountains grow along with the ground. Fine at
1.25, breaks down well before 2.

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
