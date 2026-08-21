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
| Vehicle, tier 2 (all units aboard) | 34% | 73 px | 176 px | **12.6 m** |

The tier-2 name in earlier drafts of this table was "Landship". The art that
shipped is a canopied troop carrier, and the Landship chip has no model of its
own, so the tier is named for its tier and nothing else.

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
| Vehicle T2 | 12.6 m = 231 px | 320 × **256** | (160, 176) | 17.49 |

The tier-1 and tier-2 canvases grew from the first draft: the near half of
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

## 8.2 What ships now, beyond the three tiers

The set grew past infantry-and-vehicles, and the renderer reads all of it from
the same manifest:

| Art | Who has it | Selected by |
|---|---|---|
| `infantry` — `std`, `std_str`, `vet`, `vet_str`, `bombard` | all 8 factions | veterancy + strength chips |
| `vehicle_t1` — `std`, `vet` | 4 majors | Navigator (+1 Movement) |
| `vehicle_t2` | 4 majors | Troop Carrier (+2 Movement) |
| `landship` | 4 majors | the Landship chip |
| `tollbooth` | 4 majors | a finished blockade on the hex |

**Bombard and Landship override rather than accumulate.** Each is `slots: 2`
against a two-bay unit, so neither can ever share a unit with another upgrade.
That is what lets the renderer treat them as a straight swap instead of folding
them into the movement and strength totals. Bombard also beats promotion: there
is no veteran cut of the siege piece, and the silhouette is the readable thing.

**Minor factions ship infantry only.** A chipped minor unit therefore has to
fall all the way back to the foot model rather than to nothing, or it would
vanish from the board the moment it was upgraded.

**The tollbooth is not a unit.** It lives in `art/units/` because that is where
the pipeline reads from, but no chip combination can select it — the renderer
reaches it through `structureFor`, keyed by hex, never by a unit's chips.

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
  the ring pulls in. A hex full of tier-2 vehicles is tighter than one full of
  infantry, which is honest.
- **The whole ring rotates to dodge a floating radial**, keeping its spacing
  rather than bunching up on one side.
- **`chooseSlots` returns exactly as many positions as there are units.** It
  used to cap at five, and the sixth unit fell through to the lone-unit slot and
  stood on top of the first — which is what made a crowded hex look even worse
  than the spacing alone explains.

## 11. Measured findings — minor factions, landships, tollbooth, bombard (2026-08)

Everything below was measured off the shipped sheets, not assumed. Where a number
here disagrees with an earlier section, this one was taken from the files. §8.2
states what ships and how the renderer selects it; this section is why the art is
shaped the way it is, and what went wrong getting there.

### 11.1 The grids, and the true unions

| class | cell | anchor | sheet | footprint | px/m |
|---|---|---|---|---|---|
| infantry (5 variants), tollbooth | 192×192 | (96, 150) | 1920×1536 | 7.4 m | 18.3 |
| `vehicle_t1_std` / `_t1_vet` | 256×224 | (128, 164) | 2560×1792 | 9.6 m | 18.3 |
| `vehicle_t2`, `landship` | 320×256 | (160, 176) | 3200×2048 | 12.6 m | 18.3 |

True unions, measured across all 80 cells of every shipped sheet:

- **infantry: x 33–158, y 16–183** (L63 R62 U134 D33) — 1 px wider and 1 px
  deeper than the figure that had been circulating (R61/D32). Versari and
  Plainer both already reach R62; Versari reaches D33.
- **vehicle t1: x 19–234, y 31–223** (L109 R106 U133 D59)
- **vehicle t2: x 51–268, y 54–232** (L109 R108 U122 D56)

Camera per grid — all three put the world origin on the exact anchor pixel:

| grid | resolution | `ortho_scale` | `shift_y` |
|---|---|---|---|
| infantry / tollbooth | 192×192 | 10.4918032 | 0.03125 |
| vehicle t1 | 256×224 | 13.9890710 | 0.015625 |
| vehicle t2 / landship | 320×256 | 17.4863396 | 0 |

The t1 row was not written down anywhere and had to be re-solved by rendering a
0.2 m marker cube at the world origin at two `shift_y` values and interpolating
for anchor y = 164. `ortho_scale` is fixed by px/m (`cell_width / 18.3`); only
`shift_y` is free. ⚠ The camera is shared — check it before every render batch. A
whole day of measurements was invalidated once by inheriting the wrong grid.

### 11.2 ⚠ Pre-existing breach: Plainer t1 touches the bottom cell edge

`plainer_vehicle_t1_std` (30 of 80 cells) and `_t1_vet` (10 of 80) reach **y = 223
in a 224-row cell**, always at the **bottom** edge and only in the `n`, `ne` and
`nw` rows — the facings where the draught team swings toward the camera. It is
vertical, so horizontal re-centring cannot reach it.

**The cell is big enough.** Rotated about its own contact centre the model reaches
only **46.4 px below the anchor against the 59 px available**, so the clipping is
a symptom of the displacement in §11.15 and not a sizing problem. It needs the
model re-centred and re-rendered, not a wider or taller canvas. Until then, do not
treat that sheet as a reference for how low a vehicle may sit.

### 11.3 Owner-colour mask recipes — all six are different

The mask marks the owner-colour region. It is **not** derivable from one faction
to the next; each was solved by rendering each material opaque-white against
opaque-black (occlusion resolves correctly) and searching material subsets
against the shipped mask.

| sheet | owner-colour set | IoU |
|---|---|---|
| laker infantry | navy + canvas + lacquer | 0.9988 |
| versari infantry | trouser + wool | 0.9969 |
| goldgrass infantry | cream + ochre + madder | 0.9982 |
| plainer infantry | cloth + hide + leather + paint | 0.9964 |
| laker vehicle t2 | vcanvas + vlacquer | 0.9972 |
| versari vehicle t2 | vframe + vpaint + wool | 0.9982 |

Six solved, six different. None is predictable from the faction's palette, so it
must be measured against the shipped mask of the base faction every time.

A material-index pass is not a shortcut here: the house shader is part
transparent, so index passes follow the first hit rather than the visible surface.
Force every Mix Shader `Fac` to 1.0 for the solve, then restore.

**Coverage is a useful sanity check on a new asset.** The owner region covers
**0.262–0.535** of the silhouette across shipped t2 vehicles and **0.298–0.845**
across shipped infantry. An asset whose owner set falls outside that band is
probably marking the wrong parts — the Versari landship first measured 0.704
marking tower + upper hull, then 0.214 marking tower + prow once the cabin was
lowered; `tower + prow + lower hull` at 0.289 was the set that sat in band. On a
landship, `wool`-type crew materials drop out because there are no crew.

⚠ Two recipes could not be solved cleanly, both because the blend has drifted from
what shipped. `GG_veh_t2` matches `goldgrass_vehicle_t2` at only **IoU 0.947**;
restricted to the common silhouette it still reached only 0.776, so the Goldgrass
landship mask was inferred from the `vcream + vochre + vmadder` triad rather than
measured. `CRP_group` matches the shipped Croppers `std_str` at silhouette IoU
0.920, which caps its mask solve at 0.857. Reconciling both collections with their
shipped sheets would let them be solved properly.

### 11.4 Opacity, and the metric that actually tracks the holographic look

Figures sit at Mix Shader Fac **0.30**. Vehicles sit at **0.55–0.72** across the
shipped `*_v*` materials — a sparse frame dissolves at figure opacity. A single
sprite carrying both figures and a vehicle would have no correct answer, which is
one reason landships carry no crew.

⚠ **Do not go above the band on a vehicle or vessel.** The Laker landship first
shipped with its hull at Fac 0.84 and was rejected as "not holographic enough".
There is no "solid hull so it can be more opaque" exception.

Opacity was only half that fault. The bigger error was **interior emission far
too low** — 0.356 against the shipped Laker vehicle's 0.594 — which reads as a
dark solid with lit edges however transparent it is. Raise the base `Emission`
until the interior sits in the shipped range.

**Use see-through fraction as the metric**: the proportion of interior pixels
(silhouette eroded by 3 px) with alpha < 250.

| | see-through |
|---|---|
| shipped t2 vehicles | **0.124 – 0.348** |
| shipped infantry (Fac 0.30) | **0.542 – 0.801** |
| landship at Fac 0.84 (rejected) | 0.145 |
| Versari landship (shipped) | 0.226 |
| Goldgrass landship (shipped) | 0.220 |
| ⚠ Laker landship (shipped) | **0.415 — OUT OF BAND, needs re-export** |

⚠ **The infantry band above was wrong in this document for most of 2026-08**, and
quoted as 0.778–0.920. That figure came from a handful of sheets, not the set. Re-
measured across all eight shipped infantry sheets it is 0.542–0.801 — the low end
is 0.24 lower. It was caught only by comparing a new asset against *its own
faction's shipped sheet* rather than against the band: the bombard variants came
out at 0.589–0.823, apparently failing, but sitting at a mean delta of **+0.004**
against their own baselines, with six of eight slightly *more* transparent than the
sheet they were derived from. **Compare against the base faction's own sheet.** A
band quoted from elsewhere in a document is a secondary source.

⚠ **Do not use rim-to-interior luminance ratio.** It looks like a shader property
and is not — it is dominated by *composition*. Shipped vehicles read "rim darker
than interior" because their dark wheels and chassis sit at the perimeter and a
bright canopy sits in the middle. On the landship the ratio was further skewed by
glowing thruster rings sitting low on the flanks, inside the rim band: excluding
the brightest 8% of pixels moved it from 1.308 to 1.096.

**Buildings are a third case.** The tollbooth is masonry drawn at unit scale.
Target the *outcome*, not the Fac number: a thin-walled building has 1–2
overlapping surfaces where a vehicle body has 3–4, so it needs a much higher Fac
to reach the same solidity. The transition is a cliff — 0.840 → 0.393, 0.845 →
0.368, **0.848 → 0.206**, 0.850 → 0.081. Fac 0.848 lands it inside the vehicle
band, which is right for stone.

### 11.5 Asymmetry is a per-figure cue, not a per-unit one

A one-sided silhouette feature (single shoulder cap, one hip item) does **not**
survive at unit level. Six copies of one lopsided figure at six facings average
out: measured as silhouette-vs-mirror IoU, a deliberately one-sided build scored
0.554 against a shipped range of 0.459–0.584 — mid-pack.

What works is **variety between figures**. Three distinct models distributed
across the unit moved it to 0.536, and more usefully produced a within-unit
spread of 14.9 px in height and 9.3 px in width where every single-model faction
has a spread of zero. Use that spread as the metric for "irregular mob", not
mirror symmetry.

When building multiple models, check them against **each other**: a first pass
that differed only in which panel sat where scored pairwise IoU 0.858–0.911 —
*more similar than two different factions* (Croppers vs Goldgrass = 0.819). Vary
the outline (one taller, one wider, one leaner), not the ornament.

Per-*object* asymmetry is fine — a single object is rendered at eight facings and
its asymmetry is visible at every one. The Goldgrass landship carries canvas over
one outrigger only for exactly this reason.

### 11.6 Spatial contrast is a usable axis once mean luminance runs out

Shipped mean luminances are crowded: 0.48 / 0.62 / 0.63 / 0.67 / 0.74 / 0.82 /
0.86. There is no empty slot left. But every shipped faction sits in a narrow
**stdL band of 0.0999–0.1284**, and none has both a high bright fraction and a
high dark fraction.

A faction of bright metal on a dark body reaches stdL 0.1713 — 33% above the
whole set — while its *mean* overlaps the Plainers and Lakers outright. When mean
luminance is exhausted, measure variance.

### 11.7 Three Blender traps that produced silently wrong output

- **A per-figure orientation baked into mesh data breaks when the figure moves.**
  Scythe blades were rotated tangentially to the ring at their home stations to
  keep plan radius down; in the other three arrangements the figures sit
  elsewhere, the baked angle no longer pointed tangentially, and the blades swung
  outward — envelope x 25–167 against a limit of 33–158. Make orientation a
  per-variant object rotation recomputed from the figure's actual station.
- **An object tilt rotates about the object origin, not the part's centre.** The
  landship gun barrel carries a −7° X tilt; because the mesh is authored in ship
  space with the object at the ship origin, the tilt swung the muzzle 0.3 m
  forward past the bow and set plan radius to 6.05 against a 6.3 limit. Rank
  objects by plan radius to find the culprit rather than inspecting by eye.
- **`matrix_parent_inverse` cancels the parent transform.** Parts parented to a
  scaled armature must use an identity parent inverse, matching the existing
  parts, or they render at 1/scale in the wrong place.

A fourth, cheaper trap: **a collection excluded from the view layer is absent from
the depsgraph**, so `evaluated_get` returns nothing and a measurement silently
reads zero geometry. Un-exclude before measuring, not just before rendering.

### 11.8 Sideways-projecting kit is the footprint risk, and orientation is the lever

A scythe blade sits 1.90 m from the figure's axis. Carried identically on every
figure it puts group plan radius at **4.434 m** against a 3.7 m limit. Carried
**tangentially to the ring** it costs nothing — 3.185 m, below the body's own
3.279 m. The same trick placed the Steel Traders' wide hubcap model at the two
stations whose left side faces inward, at zero cost.

What cannot be fixed this way is a **symmetric pair** — sheaves at both shoulders
always have one pointing outward. Those went from 4.036 m to 3.560 m by reducing
the outward lean from 32° to 15°, not by re-orienting.

### 11.9 Landships

Single sheet per faction, no std/vet split, no crew figures, built on the t2 grid.
Naming and selection are in §8.1 and §8.2.

**Width binds before height, on every hull shape tried.** All three vessels max
out at width with vertical to spare — Laker 12 px unused at the top, Versari 25,
Goldgrass none only because its lookout tower was sized to the measured budget
rather than to a ratio. Confirmed by scale sweep in each case *after* lowering
superstructure. Do not plan on trading height for size.

Sizing a tall element to the envelope is worth doing explicitly. For a centred
element `py = 176 − (y·10.281 + z·15.139)`; holding the top edge at the union
gives the maximum height directly. On the Goldgrass ship that produced a 7.14 m
tower — about 20 px of extra presence over a naive rescale.

Fitted scales: **Laker 0.998** (11.88 × 7.01 × 6.94 m, plan radius 5.987),
**Versari 0.930** (5.938), **Goldgrass 1.004** (6.190). All flush on x 51–268.

⚠ **Sideways structure can saturate both axes at once.** The Goldgrass
outriggers set plan radius to 6.262 of a 6.3 limit *and* width to 218 of 218
simultaneously — no slack either way, unlike the steel ships which had 0.3 m of
footprint spare. Slatting the outrigger decks pulled plan radius to 6.190 and
bought a scale increase from 0.995 to 1.004, so the fix paid for itself.

⚠ **A shape whose widest direction is not a sampled facing is fragile.** The
Goldgrass ship's true maximum caliper is 12.555 m at 18°, exceeding the 11.913 m
width budget. It fits only because 18° is never rendered — the sheet samples 8
facings at 45° steps and the widest of those is 218 px. If the row set ever went
to 16 facings, that vessel would no longer fit.

Faction contrast is carried by hull shape: Laker rounded (meanL 0.519, solidity
0.968, elongation 1.70), Versari faceted (0.410 / 0.921 / 2.25), Goldgrass timber
(0.589). Silhouette IoU between Laker and Versari 0.552.

### 11.10 Three shape metrics that lied, and the one that didn't

- **Sobel edge-orientation histogram** said the *rounded* Laker hull was more
  faceted than the *faceted* Versari one, 0.628 vs 0.594. It was measuring the
  Laker's boxy deckhouse, not either hull.
- **Turning concentration** agreed, 0.310 vs 0.260 — confounded the other way, by
  the Versari's proud thruster bumps adding curvature along the flank.
- **Solidity moved the wrong way under a change that improved the asset.**
  Recessing those bumps flush took solidity 0.873 → 0.921 (*more* convex) because
  the bumps had been creating real concavity. The change was still right.
- **Silhouette IoU between the two assets was the honest measure** and improved
  on the same change, 0.613 → 0.552. Elongation agreed, 2.01 → 2.25.

A metric that scores a single asset in isolation is easy to confound with
incidental features. **Prefer a direct A-vs-B comparison of the two things that
must not be confused**, and sanity-check any single-asset descriptor against a
change already known to be an improvement.

The same trap caught the tollbooth tints: sampling "top-10% chroma pixels" picked
up stone and edges and gave a misleading matrix. Sampling *through the mask* —
which marks exactly the tinted region — gave clean numbers.

### 11.11 Tollbooth

Generic road furniture, four faction tints. It is drawn on the **infantry grid**
because it is unit-scale masonry, but it is **not a unit** and no chip can select
it — the renderer reaches it through `structureFor`, keyed by hex (§8.2). The grid
is about pixel geometry; the selection path is about what it is.

**Sized by width, not height.** Shipped unit widths span 118–126 px (6.5%);
heights span 118–166 px (41%) depending on polearms and banners. Scaling by
height would mean a different building per faction. 75% of the 124 px median
gives **93 px**, which is the whole asset — building plus boom plus bollards.

The mask is **identical across all four tints** — it is one asset in four
colours, not four derived assets, so the owner region is the same geometry.
Carrier is panels + boom + watch roof + roof slab, coverage 0.434 (infantry band
0.298–0.845); panels and boom alone gave 0.210, below the floor.

Frames: a static object renders 10 byte-identical frames. Shipped *vehicles* hold
alpha constant across the loop but are not byte-identical — that residual is
Cycles sampling noise, not motion. Shipped infantry genuinely animates (alpha
8198–8217 px).

⚠ **Tint separation keeps relocating.** Worst-pair RGB distance went 40.3
(goldgrass/plainer, both red) → 45.5 (versari/plainer) → 44.0 (laker/plainer,
navy vs violet — neighbouring hues, both dark). Three of the four tints are dark
and only Goldgrass's yellow sits clear, at 166+ from everything. The lever is
**value, not hue**.

### 11.12 ⚠ Untracked files are not safe — and this has now happened twice

**First instance.** The 2026-08 delivery — 69 art files and an earlier draft of
this section — was written into the repo, verified present by `ls`, and removed by
an unrelated branch operation. An `ls` immediately after copying proves nothing.

**Second instance, same week, worse.** This section was rewritten, left in the
working tree, and never committed — not in any commit, including the one that
looked like it carried the art. Restoring four files to `HEAD` in order to pull
deleted **32,841 bytes that existed in exactly one place on disk**. It survived
only because it had been copied out beforehand *and the copy verified by reading
it back and counting its subsections*, rather than trusting that the copy
succeeded.

The rule is not "back things up". It is:

- **Commit art and docs promptly.** A pull or checkout will not delete untracked
  files, but `git clean`, a hard reset, and `git checkout HEAD -- <path>` on a
  never-committed change all will, and the third one looks harmless.
- **Verify a backup by reading it back**, not by the copy call returning.
- **Check `git ls-files` before assuming something is committed.** "It is in the
  working tree and the tree looks clean" is not the same claim.

### 11.13 Bombard — the chip-driven strength asset (2026-08)

`bombard` is a fifth infantry arrangement, one sheet per faction, on the normal
192 px infantry grid. Selection, and why it overrides rather than accumulates,
are in §8.2.

**The gun stands at the formation centre.** A ring station does not work. At a
station radius of ~2.3 m the gun's own half-length pushes plan radius to 4.2–5.0 m
against a 3.7 m limit, and orienting it tangentially does not save it. Centred, it
costs nothing: the combined envelope stayed **figure-dominated at every scale
tried from 1.00 to 1.45** — worst plan radius 3.542, worst x 34.1–157.0, all of it
contributed by the figures. The gun was never the binding constraint.

⚠ **Do not size a centred element against its own headroom.** The first sizing
allowed +15% because the gun alone had 1.48 m of plan radius spare. That number
was meaningless — the figures already occupy the ring. The scale that actually
mattered was the one at which the gun's muzzle clears the figures' *polearms*,
which is 1.35, not 1.15. Measured against figure *bodies* the gun cleared by 51 px
at 1.15; against the weapons they carry it was 12 px short on three factions. Both
numbers were correct measurements of different things, and the first one was the
wrong thing.

⚠ **The biggest failure here was invisible to every metric.** Built with the
barrel pointing directly away from the camera, the gun passed on height,
clearance, envelope, plan radius, mask coverage and see-through — and rendered as
a **vertical scaffold**. A 55° barrel seen end-on foreshortens into a mast.
Nothing numeric caught it; one look at a contact sheet did, after eighty cells had
already been exported. Fixed by yawing the piece **30°** off the camera axis, which
triples the visible barrel length (silhouette width 41 px → 74 px) at a cost of
2.5 px of height.

| yaw | silhouette width | py top | reads as |
|---|---|---|---|
| 0° | 41 px | 32.6 | a mast |
| **30°** | **74 px** | **35.1** | **a gun; clears every figure** |
| 45° | 91 px | 39.4 | a gun; loses Versari clearance |
| 90° | 103 px | 60.1 | a gun, but shorter than the crowd |

The lesson generalises past this asset: **the metrics in §11.10 test whether a
shape is distinct, not whether it is legible as the thing it is meant to be.**
Render a contact sheet and look at it before exporting eighty cells.

**It reads as the dominant feature in all eight facings**, measured at true game
size (a 192 px cell draws at 61 px on a 216 px hex). Decomposed against a
figures-only render of the same arrangement — alignment IoU 1.000 in every row, so
the split is exact:

| | row `s` (the approved case) | range over 8 rows | `s` ranks |
|---|---|---|---|
| gun share of token area | 18.1% | 18.1 – 37.8% | 8th of 8 |
| gun share of mass above the crowd | 65.0% | 61.6 – 72.1% | 5th of 8 |
| gun share of the brightest quartile | 38.6% | 36.9 – 74.5% | 7th of 8 |

The gun also runs **+13.6 to +28.3 luminance above the figures** in every facing.
The facing that was signed off ranks at or near the *bottom* on every measure, so
no facing is worse than the one already accepted.

⚠ **The count that raised the alarm was measuring the wrong thing.** "Is the gun
the topmost pixel" said 20 of 80 cells, which sounds damning and is not: it asks
whether a sub-pixel polearm filament pokes above a 3.6 px barrel, and at 61 px the
downscale erases the filament and keeps the barrel. Largest-connected-component
was no better — the gun touches the crew, so the whole token is one blob and the
measure only reports that blob's composition. Both were discarded.

**The gun's frame carries owner colour.** With `BM_steel` excluded, owner-mask
coverage fell to 0.184–0.212 on the navy factions — below the 0.298 floor, because
the gun adds a large un-liveried area. Adding the frame to each faction's owner set
put all eight back in band at 0.383–0.794.

⚠ **A fixed accent colour cannot survive an owner-coloured frame.** The insulator
stack was maroon, then cream; cream collided with Croppers (ΔE 10.4) and Goldgrass
(14.9), both of which have cream in their own palette. There is no hue that clears
all eight once the surrounding frame takes an arbitrary faction colour. Resolved by
dropping the accent to dark iron and letting **value**, not hue, carry the detail.

**Tempest's banner cannot stay at the formation centre**, because the gun is there.
It also cannot simply move: the banner at centre already tops out at py 16.03,
flush with the cell edge, so at any ring radius the rearmost of the eight facings
pushes it out of the cell. Moving it 1.30 m off centre costs `r·10.281 = 13.4 px`
of vertical budget in the worst facing. Paid for by **sinking the assembly 0.95 m**
rather than shortening it — the flag, finial and staff are geometrically untouched,
and the banner simply stands lower. Worst-facing py top 17.8, 26.7 px of depth
swing across the eight facings.

### 11.14 Known gaps, not fixed

- `oldHands` — **the renderer and the rules disagree about who is a veteran.** The
  rules honour it: `old-hands` carries `veteranEquiv: true` and `effectiveVeteran()`
  is used in `contest.js` and `actions.js`. But `variantFor` reads the raw
  `unit.veteran`, so a unit that fights as a veteran draws as a non-veteran.
- `laker_landship_sheet.webp` has see-through **0.415** against a shipped t2
  vehicle band of 0.124–0.348. Needs re-export at a higher Mix Shader Fac.
- `plainer_vehicle_t1` still clips at the bottom edge — §11.2.
- `GG_veh_t2` and `CRP_group` have drifted from their shipped sheets — §11.3.

### 11.15 Anchor registration — the ground footprint must sit on the pivot

Once all eight rows began to be drawn (§10.1), art that does not sit on its anchor
visibly slides sideways as a unit turns. Three assets failed. **The rule is one
rule**: the centre of the object's ground footprint must coincide with the axis it
rotates about, which is the anchor. It was broken in two different ways.

| asset | mechanism | row 0 | drift | after |
|---|---|---|---|---|
| `*_tollbooth` ×4 | pivot at the origin, **geometry modelled 0.42 m off-centre** | −7.5 | 18.0 | +0.0 / 3.5 |
| `goldgrass_vehicle_t1` | contact patch ~0.9 m off the rotation centre | +9.2 | 12.7 | +1.2 / 3.7 |
| `plainer_vehicle_t1` | contact patch ~1.5 m off the rotation centre | −0.5 | 42.1 | +0.5 / 2.0 |
| `plainer_vehicle_t2` | same, found later by the stricter check | −0.5 | 19.0 | +1.5 / 2.0 |

For the tollbooth the mechanism was confirmed analytically before any fix: rotating
the measured geometry about the measured pivot predicted per-row offsets of
`[−6.9, −0.4, 3.0, 11.2, 6.9, 0.4, −3.0, −11.2]` against a measured
`[−7.5, −0.5, 2.5, 10.5, 6.5, 0.0, −3.5, −11.5]` — **within 0.6 px on every row**.
That is the standard of proof to aim for before touching anything.

**Fix at source where the model still reproduces.** The tollbooth reproduces from
the blend at IoU **1.0000 in all eight rows**, so its geometry was moved onto the
pivot and the four sheets re-rendered. The three vehicles do not: every mesh in
`GG_veh_t1` and `FP_veh_t1` is `hide_render`, the `std` arrangement no longer
exists in the blend, and even for `vet` only row 0 reproduces — rotating the root
and rotating the world origin both top out at IoU 0.94 on rows 1–7. Those were
re-centred instead by **rigid per-row integer pixel translation**: lossless, no
pixel lost, sheet and mask shifted identically, everything else untouched. It is a
worse fix than a re-render and it is the right one when the model cannot be
reproduced.

**Measure registration on the footprint ellipse, not the whole silhouette.** The
rule names the ground footprint, so restrict to pixels within
`footprintMetres/2 · sin(34.18°) · px_per_m` of the anchor row. `check-unit-art.py`
currently takes the bounding-box midpoint of the entire silhouette, which is a
different quantity — on `goldgrass_vehicle_t1` the two disagreed by 6 px.

#### Two things I got wrong here, and what caught them

**A metric that cannot pass known-good art is not evidence about unknown art.** I
built an edge-travel test to separate "rigid translation" from "internal
rearrangement" and it labelled `lakers/vehicle_t1` — which is correct and passes
everything — as non-rigid, because a group's projected width naturally changes with
viewing angle. Thrown out. Every estimator used above was validated against that
same known-good asset first: on it, the footprint-ellipse midpoint drifts 2.5 px,
which is the noise floor everything else is judged against.

**I called an 11.5 px defect an artifact and defended it with a mechanism that
owned 1.2 px of it.** Goldgrass's 12.7 px drift looked like a bounding-box
artifact — a raised whip entering the box at different rows — and the whole-
silhouette centroid appeared to confirm it at 1.1 px of swing. Both readings were
real and both were beside the point. Restricting to the footprint ellipse moved
12.7 → 11.5, so raised geometry accounted for **9% of it**; the rest was the
contact patch genuinely travelling. The whole-silhouette centroid was stable only
because the stationary escorts dominate the pixel mass and the cart does not.
What settled it was overlaying the eight rows' ground band with the anchor pinned
and looking: the dense core sat visibly left of the anchor. **The composite decided
it, not the estimator** — the same conclusion as the bombard that passed every
numeric check while reading as a scaffold. When a metric and a picture disagree at
this size, the picture is the evidence.
