# Unit Model Pipeline — Parameters for the Modelling Agent

Everything below is derived from the board the models have to sit on, not
chosen by taste. The board's geometry lives in `src/prototype/hexTiles.json`
and `src/prototype/hexProjection.js`; if either changes, re-derive rather than
nudge.

## 0. The one thing that must not be got wrong

**Render orthographic. Not perspective.**

The hex tiles were originally rendered with a perspective camera. Their far
edge came out 25% shorter than their near edge, which meant no two tiles could
ever interlock at any spacing — the flat edges left wedge-shaped gaps and the
slanted edges collided at the points. It cost three attempts to diagnose and
had to be fixed by warping every master through an inverse-perspective
homography (`scripts/hex-tiles/build_tiles.py`).

Units have the same failure mode in a milder form: a perspective unit sitting
on an orthographic board leans the wrong way as it moves off-centre, and two
units on opposite sides of the map appear to face different directions.

So: **orthographic camera, and the same rig for every single asset.**

## 1. There is no .blend to copy the rig from

The hex tiles were **not** rendered in Blender. They are AI-generated images.
Everything in this document about "the tile rig" was reverse-engineered by
measuring the finished images, and the perspective was then removed with an
inverse-perspective homography at build time
(`scripts/hex-tiles/build_tiles.py`).

So there is no camera or lamp to read off a file. The rig below is a
*specification* to build from scratch, not a reconstruction of something that
exists. It is authoritative — the geometry half is derived from the board, and
the lighting half is a choice, made here so every asset shares it.

## 2. Camera rig — lock this once, never touch it again

**Axis convention** (stated because nothing else pins it down):

- Ground plane is **XY**, **+Z up**.
- The camera sits on **−Y** and looks toward **+Y**, tilted down.
- A hex's **vertex-to-vertex** axis runs along **world X** (36.95 m).
- A hex's **flat-to-flat** axis runs along **world Y** (32 m); the flat edges
  themselves run parallel to X.
- So a hex has vertices at `(±18.47, 0)` and flat edges at `y = ±16` spanning
  `x ∈ [−9.24, +9.24]`.

| Parameter | Value |
|---|---|
| Projection | **Orthographic** |
| Elevation | **34.18°** above horizontal |
| Blender camera rotation | **(55.82°, 0°, 0°)** — `90 − 34.18` |
| Ortho scale | `canvas_width_px / 18.30` (see §4) |
| Background | Fully transparent, film transparent on |

34.18° is the board's *effective* viewing angle: the tiles project a 966-unit
hexagon to 376 units tall, then the renderer applies a 1.25 vertical stretch,
giving 470 against a true plan height of 837 — `asin(470/837) = 34.18°`.

Do **not** apply the 1.25 stretch to the models. The stretch is a cheat that
opens up the ground plane without foreshortening vertical geometry; applying it
to a soldier would just make them 25% too tall. Rendering at the effective
angle gets the ground contact right, which is the part that matters.

Two consequences of an orthographic tilt, worth having in front of you:

- horizontal across the screen (world **X**) projects **1:1**;
- ground depth (world **Y**) compresses by **sin 34.18° = 0.562**;
- height (world **Z**) compresses by **cos 34.18° = 0.827**, so a 4 m soldier
  is 61 px tall on screen, not 73.

## 3. Light rig — two lamps, specified not matched

§1 of the first draft said "one sun lamp" and §7 asked for a rim light; that
was a contradiction inherited from the tile pipeline doc. Resolved: **two
lamps, key and rim**, plus a low ambient. There is nothing to match them to —
the tiles have no lamp — so these are chosen, and the only thing that matters
is that every asset uses them unchanged.

Angles are given relative to the camera, which is unambiguous:

| Lamp | Elevation | Azimuth (0° = behind camera) | Strength | Colour |
|---|---|---|---|---|
| Key (Sun) | 45° | −40° (camera's left) | 3.0 | ~5200 K warm white |
| Rim (Sun) | 65° | +150° (behind subject, right) | 2.0 | ~7000 K cool |
| World ambient | — | uniform | 0.04 | neutral grey |

The cool rim is doing the §9 silhouette job, and the ambient exists so
shadow-side near-blacks do not crush against an unlit plinth.

## 3.1 Scale — readability first, and deliberately not to life

The board is 216 px per hex at rest and zooms from 0.45× to 2.4×, so a hex is
**97–518 px** across in practice.

| Asset | Footprint | On screen @1× | @max zoom | Blender width |
|---|---|---|---|---|
| Infantry group (4–5 soldiers) | 20% of hex width | 43 px | 104 px | **7.4 m** |
| Vehicle, tier 1 (vehicle + escort) | 26% | 56 px | 135 px | **9.6 m** |
| Landship, tier 2 (all units aboard) | 34% | 73 px | 176 px | **12.6 m** |

World scale follows the existing tile pipeline: hex flat-to-flat = 32 m, so
vertex-to-vertex = 36.95 m.

**Soldiers should stand about 4 m tall.** That is roughly 2.2× life size and it
is intentional — at true scale a soldier is under 2% of a hex and reads as a
speck at every zoom level. The same tile pipeline calls a small building 3–4 m,
so a soldier will be about shack-height. Don't "correct" it. Proportional
truth between asset classes is explicitly not a goal here; reading on the map
is.

Keep all three tiers inside their footprint box. Tier 1 and tier 2 of the same
vehicle must occupy the same *envelope* even though their composition differs,
or units will jump around their slot when they upgrade.

## 4. Pixels per metre — the authoritative figure

**18.30 px/m**, horizontal (world X), at render resolution.

Derived, not chosen: a hex is 36.95 m vertex-to-vertex and ships as 676 px of
tile image (`hexW 966 × exportScale 0.7`), which is 3.13× its 216 px on-screen
size at rest. `676 / 36.95 = 18.30`.

Canvas sizes are **derived from this**, not the other way round — inferring
px/m by dividing canvas by footprint conflates the two, since the canvas is
footprint *plus headroom*. Set `ortho_scale = canvas_width_px / 18.30`.

## 5. Canvas, anchor, and oversample

| Asset | Footprint | Canvas | Anchor | Ortho scale |
|---|---|---|---|---|
| Infantry group | 7.4 m = 135 px | 192 × 192 | (96, 150) | 10.49 |
| Vehicle T1 | 9.6 m = 176 px | 256 × **224** | (128, **164**) | 13.99 |
| Landship T2 | 12.6 m = 231 px | 320 × **256** | (160, 176) | 17.49 |

The vehicle and landship canvases grew from the first draft: the near half of
a footprint projects **below** the anchor by `(footprint/2) × 0.562 × 18.30`,
which is 49 px and 65 px respectively, and the original 192/224-tall canvases
only left 42 px and 48 px of room. They would have clipped the front of the
base.

**The anchor is the important part.** Every frame of every animation must place
the centre of the group's ground footprint at exactly that pixel. If it drifts,
units jitter as they animate and shift position when they change tier. The
renderer positions sprites by that anchor, not by the canvas centre.

Leave the rest of the canvas as headroom for tall geometry and animation
overshoot.

## 6. No baked shadow, no baked ground

Render the unit alone on transparency. The board already draws a contact
ellipse under each unit, squashed to match the projection, so a baked shadow
would double up and would not scale with zoom.

## 7. Animation — sprite sheets, not GIFs

GIF is the wrong container here, for two reasons that both bite on this board:

- **1-bit alpha.** GIF pixels are either fully opaque or fully transparent, so
  every edge comes out hard and jagged. Against a glowing hologram tile that
  reads as a cut-out sticker.
- **256-colour palette**, which will band badly on the metal and rim-light.

Two better options, in order:

1. **Sprite sheet — one WebP strip with full alpha, played with CSS
   `steps()`.** One decode, one GPU texture, and the renderer controls
   playback: it can desync units so they don't all breathe in unison, freeze
   them below a zoom threshold, and stop them entirely when a lot are on
   screen. This is what I'd build against. WebP is already the tile format.
2. **Animated WebP or APNG** if a sheet is awkward for the modelling side.
   Full alpha, good compression, but N independently-animating images all
   decoding at once is real per-frame cost, and there is no way to pause them.

Either way:

| Parameter | Value |
|---|---|
| Frames | 8–12 |
| Rate | 3 fps |
| Loop | Seamless — frame N must flow into frame 1 |
| Content | **Idle only** — breathing, a shifting stance, a swaying banner |

Keep it subtle. Twenty units all cycling a big motion turns the board into
noise. For a sheet, lay frames out in a single horizontal strip and ship a
small JSON alongside: frame count, frame size, anchor, fps.

## 8. Faction colour

The tiles are recoloured at runtime — one grayscale mask over a flat faction
colour — rather than shipping four copies of every tile. Units are being
modelled per faction anyway, so baked colour is fine.

But please **also export an 8-bit team-colour mask** per asset. It is nearly
free at render time and means faction hues can be retuned without going back to
Blender — the board's faction palette already had to be re-derived once and
will move again.

What goes in the mask: **every surface that should shift if we retune that
faction's hue.** Dyed cloth and painted panels, yes. Bare steel, leather, skin
and bare wood, no — those should stay what they are under any hue. Painted or
tinted metal counts as livery and should be masked; raw metal should not.

One sizing note: the masked area wants to be roughly **a quarter of the
silhouette or more**. At 43 px on screen at rest, faction identity carried by a
collar and cuffs alone will not survive.

## 8.1 Output location and naming

Drop files at `art/units/<faction>/`, alongside the tile masters in
`art/hex-tiles/masters/` — sources live outside `public/`, and a build step
copies processed output into `public/assets/`.

```
art/units/versari/versari_infantry_sheet.webp
art/units/versari/versari_infantry_mask.webp
art/units/versari/versari_infantry.json
```

Lowercase, underscore-separated, `<faction>_<unit>[_tier]`. Vehicle tiers are
`versari_vehicle_t1`, `versari_vehicle_t2`.

## 9. Silhouette

Units sit on tiles that glow anything from pale cyan to saturated red. A dark
unit on a bright tile reads well; a dark unit on an unlit plinth disappears.

- The rim lamp in §3 does this job so the silhouette separates from
  whatever is behind it.
- Avoid near-black bodies — mid-tone with strong value contrast inside the
  silhouette survives both backgrounds.
- Test each asset against two backdrops: a bright faction-tinted tile and an
  unexplored (unlit) plinth.

## 10. One constraint I still have to solve renderer-side

A hex currently shows up to 5 units, spaced 15.5% of hex width apart. At a 20%
footprint they will overlap by about a quarter. That is my problem, not the
modelling agent's — the likely answer is drawing at most 3 abreast and
collapsing the rest into a count badge — but it is worth knowing that **the
footprint numbers above assume a unit is seen with neighbours**, so a design
that only reads in isolation will not survive on a contested hex.

### 10.1 Solved by standing them in a ring

This was measured once all three tiers existed, and the row lost badly. At the
shipped footprints against the old 33.5 px row pitch (216 px hex at rest):

| Tier | Footprint | On screen | Pairwise overlap | Visible |
|---|---|---|---|---|
| Infantry | 7.4 m | 43.3 px | 23% | 77% |
| Vehicle T1 | 9.6 m | 56.1 px | 40% | 60% |
| Vehicle T2 | 12.6 m | 73.7 px | 55% | 45% |

Only infantry cleared the bar, and six infantry on one hex were an unreadable
smear regardless — the row simply ran out of width.

The fix was not a count badge. Tokens now stand in a **ring** on the top face
(`src/prototype/boardSlots.js`), which spends the tile's depth as well as its
width. Units at different depths may overlap vertically — that reads as depth,
and painting back to front makes it correct — so the rule only has to hold for
units sharing a rank, and there it holds with room to spare: at six per hex no
two tiers share a rank at all, infantry through T2.

Units also **turn to face the middle of their own hex** rather than the camera.
The objective is the tile, so a ring of units looks inward at it. Facing is a
property of where a unit stands, not of its state — the unit model still has no
facing field — and `boardSlots.js` derives the bearing from the stance.

This is what finally puts the eight orientation rows to work, and it raises the
bar on them: a row whose art does not sit on the anchor now visibly slides
sideways as a unit takes up a different stance. `scripts/check-unit-art.py`
treats that as a failure rather than a note.

**Capacity is derived, not chosen.** A hex draws as many units as it can while
every one of them stays at least 70% visible, capped at ten. Vertical overlap
between ranks is depth and does not count against that; only units at the same
depth hide each other. In practice: **ten infantry, six of either vehicle**.
Beyond that the overflow becomes a `+N` badge — §10's count badge, arrived at
from the other direction.

Three things fall out of the ring and are worth knowing:

- **The radius adapts to the widest unit present.** A T2 vehicle is 74 px
  across, and at the infantry radius its flanks hang off onto the next tile, so
  the ring pulls in. A hex full of landships is tighter than one full of
  infantry, which is honest.
- **The whole ring rotates to dodge a floating radial**, keeping its spacing
  rather than bunching up on one side.
- **`chooseSlots` returns exactly as many positions as there are units.** It
  used to cap at five, and the sixth unit fell through to the lone-unit slot and
  stood on top of the first — which is what made a crowded hex look even worse
  than the spacing alone explains.
