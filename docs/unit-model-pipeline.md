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

## 1. Camera rig — lock this once, never touch it again

| Parameter | Value |
|---|---|
| Projection | **Orthographic** |
| Elevation | **34.2°** above horizontal |
| Azimuth | Square onto a hex flat edge — the same azimuth the tile rig uses |
| Lighting | One sun lamp, fixed angle and colour temperature, identical for every asset |
| Background | Fully transparent |

34.2° is the board's *effective* viewing angle: the tiles project a 966-unit
hexagon to 376 units tall, then the renderer applies a 1.25 vertical stretch,
giving 470 against a true plan height of 837 — `asin(470/837) = 34.2°`.

Do **not** apply the 1.25 stretch to the models. The stretch is a cheat that
opens up the ground plane without foreshortening vertical geometry; applying it
to a soldier would just make them 25% too tall. Rendering at the effective
angle gets the ground contact right, which is the part that matters.

## 2. Scale — readability first, and deliberately not to life

The board is 216 px per hex at rest and zooms from 0.45× to 2.4×, so a hex is
**97–518 px** across in practice.

| Asset | Footprint | On screen @1× | @max zoom | Blender width |
|---|---|---|---|---|
| Infantry group (4–5 soldiers) | 20% of hex width | 43 px | 104 px | **7.4 m** |
| Vehicle, tier 1 (vehicle + escort) | 26% | 56 px | 135 px | **9.6 m** |
| Landship, tier 2 (all units aboard) | 34% | 73 px | 176 px | **12.6 m** |

World scale follows the existing tile pipeline: hex flat-to-flat = 32 m, so
vertex-to-vertex = 37 m.

**Soldiers should stand about 4 m tall.** That is roughly 2.2× life size and it
is intentional — at true scale a soldier is under 2% of a hex and reads as a
speck at every zoom level. The same tile pipeline calls a small building 3–4 m,
so a soldier will be about shack-height. Don't "correct" it. Proportional
truth between asset classes is explicitly not a goal here; reading on the map
is.

Keep all three tiers inside their footprint box. Tier 1 and tier 2 of the same
vehicle must occupy the same *envelope* even though their composition differs,
or units will jump around their slot when they upgrade.

## 3. Canvas, anchor, and oversample

Tiles ship at 3.13× their on-screen size, so units should match — that is what
keeps them sharp at max zoom without shipping 4K sprites.

| Asset | Render canvas | Ground-contact anchor |
|---|---|---|
| Infantry group | 192 × 192 | (96, 150) |
| Vehicle T1 | 256 × 192 | (128, 150) |
| Landship T2 | 320 × 224 | (160, 176) |

**The anchor is the important part.** Every frame of every animation must place
the centre of the group's ground footprint at exactly that pixel. If it drifts,
units jitter as they animate and shift position when they change tier. The
renderer positions sprites by that anchor, not by the canvas centre.

Leave the rest of the canvas as headroom for tall geometry and animation
overshoot.

## 4. No baked shadow, no baked ground

Render the unit alone on transparency. The board already draws a contact
ellipse under each unit, squashed to match the projection, so a baked shadow
would double up and would not scale with zoom.

## 5. Animation — sprite sheets, not GIFs

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

## 6. Faction colour

The tiles are recoloured at runtime — one grayscale mask over a flat faction
colour — rather than shipping four copies of every tile. Units are being
modelled per faction anyway, so baked colour is fine.

But please **also export an 8-bit team-colour mask** per asset (white where the
faction colour should apply, black elsewhere). It is nearly free at render time
and it means faction hues can be retuned later without going back to Blender.
The board's faction palette already had to be re-derived once; it will move
again.

## 7. Silhouette

Units sit on tiles that glow anything from pale cyan to saturated red. A dark
unit on a bright tile reads well; a dark unit on an unlit plinth disappears.

- Give every asset a **rim light from above** so the silhouette separates from
  whatever is behind it.
- Avoid near-black bodies — mid-tone with strong value contrast inside the
  silhouette survives both backgrounds.
- Test each asset against two backdrops: a bright faction-tinted tile and an
  unexplored (unlit) plinth.

## 8. One constraint I still have to solve renderer-side

A hex currently shows up to 5 units, spaced 15.5% of hex width apart. At a 20%
footprint they will overlap by about a quarter. That is my problem, not the
modelling agent's — the likely answer is drawing at most 3 abreast and
collapsing the rest into a count badge — but it is worth knowing that **the
footprint numbers above assume a unit is seen with neighbours**, so a design
that only reads in isolation will not survive on a contested hex.
