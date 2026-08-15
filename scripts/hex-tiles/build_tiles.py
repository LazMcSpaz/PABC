#!/usr/bin/env python3
"""Build recolourable board tiles from the hologram hex masters.

Each master render is split into three layers so the hologram can be tinted
per faction at runtime while the plinth stays warm wood:

    <id>_base.webp   plinth skirt only, background keyed out
    <id>_holo.webp   hologram intensity in the alpha channel (used as a CSS mask)
    <id>_core.webp   the white-hot rim lines only

plus `src/prototype/hexTiles.json`, the manifest the renderer reads for geometry,
per-layer crop offsets, and the tags that decide which hex gets which tile.

Each master is first RECTIFIED -- the renders use a perspective camera, so a
tile's far edge is ~25% shorter than its near edge and the raw shapes cannot
tile no matter how they are spaced. See SRC_QUAD below.

The camera is locked across every master, so after rectification the plinth
silhouette is analytic rather than detected, and hologram-vs-plinth is a
warm/cool luminance test. No matting model, no hand-masking, fully
deterministic.

    pip install pillow numpy scipy
    python3 scripts/hex-tiles/build_tiles.py

Re-run after dropping new masters into art/hex-tiles/masters/. If a future
batch is rendered from a different camera rig, update FRAME below (and only
FRAME) -- the renderer reads all of it from the manifest.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_opening

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MASTERS = os.path.join(ROOT, "art", "hex-tiles", "masters")
OUT = os.path.join(ROOT, "public", "assets", "ui", "board", "tiles")
# The manifest is imported by the renderer, so it lives in src/ (Vite cannot
# import from public/); only the images are served as static assets.
MANIFEST = os.path.join(ROOT, "src", "prototype", "hexTiles.json")

# --- perspective rectification -------------------------------------------
# The masters are rendered with a PERSPECTIVE camera, not an orthographic one:
# a tile's far edge measures ~410px against a ~544px near edge, a 25% taper.
# That is why the tiles would not interlock at any pitch -- the far edge of one
# tile is simply shorter than the near edge of the tile behind it, so the flat
# edges leave a wedge-shaped gap and the slanted edges collide at the points.
# No choice of spacing or vertical stretch can fix a shape that is not
# centrally symmetric.
#
# The world hexagon IS regular, though: the mean of the far and near edges
# (477) matches half the measured vertex-to-vertex width (483) to within 1%.
# So the fix is to undo the camera. The ground hexagon's four non-side vertices
# form a rectangle in world space, which makes a homography from the measured
# trapezoid onto a rectangle an exact inverse-perspective for the ground plane.
# Geometry above the ground (terrain, the plinth) is sheared rather than
# correctly reprojected -- unavoidable without depth, and visually fine at this
# tilt.
#
# SRC_QUAD is measured by fitting the four flank edges of the bright rim and
# intersecting them, on the tiles where the flanks are unobstructed; taking the
# plateau of the rim's top boundary directly does not work, because terrain
# rides above the far edge and eats its ends.
SRC_QUAD = [                       # far-left, far-right, near-right, near-left
    (508.0 - 205.0, 316.0),
    (508.0 + 205.0, 316.0),
    (508.0 + 272.0, 692.0),
    (508.0 - 272.0, 692.0),
]

# --- rectified frame, in output pixels -----------------------------------
# After rectification the tile is a true regular flat-top hexagon: the flat
# edges are exactly half the vertex-to-vertex width, opposite sides are
# parallel and equal, and it tiles the plane with pitch
# ((hexW + hexFlat) / 2, hexH). hexH is now a free choice -- it is the
# apparent camera elevation -- rather than something to measure.
FRAME = {
    "src": 1400,
    "srcH": 1500,
    "cx": 700,
    "cy": 780,
    "hexW": 966,
    "hexFlat": 483,
    "hexH": 376,
    "skirt": 100,   # measured on the rectified frame, consistent to +/-1px
    "orientation": "flat-top",
    "rectified": True,
}

def _rectify_coeffs():
    """Homography mapping OUTPUT pixels back to the master (PIL's convention)."""
    cx, cy, w, f, h = FRAME["cx"], FRAME["cy"], FRAME["hexW"], FRAME["hexFlat"], FRAME["hexH"]
    dst = [(cx - f / 2, cy - h / 2), (cx + f / 2, cy - h / 2),
           (cx + f / 2, cy + h / 2), (cx - f / 2, cy + h / 2)]
    A, B = [], []
    for (x, y), (u, v) in zip(dst, SRC_QUAD):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return tuple(np.linalg.solve(np.array(A, float), np.array(B, float)))

# Resolution of the shipped layers relative to the master. The board draws a
# hex ~216px wide at scale 1 and BoardViewport zooms to 2.4x, so ~520px is the
# most a tile is ever asked for; 0.7 (a 717px frame, 679px hex) keeps headroom
# past that while roughly halving the bytes. Raise it if tiles ever look soft
# at max zoom -- nothing else has to change.
EXPORT_SCALE = 0.7

# --- tile tags -----------------------------------------------------------
# Filenames are the author's labels; `tags` is what the resolver matches
# hexes against:
#   flat / mountain / forest    terrain buckets (hex.elevation, hex.cover)
#   town / city                 settlement tiers for Location hexes
#   coast                       water on the tile. These are ORIENTED — the
#                               sea is on the tile's east side — so they are
#                               only ever placed on the map's eastern rim,
#                               never inland. See eastRimHexes() in
#                               hexProjection.js.
# A tile may carry several (a city on a coastline is both).
TILES = [
    ("plains_hills",                ["flat"]),
    ("flat_forest",                 ["forest"]),
    ("mountains_forest",            ["forest", "mountain"]),
    ("mountain",                    ["mountain"]),
    ("mountain_2",                  ["mountain"]),
    ("mountain_plateau",            ["mountain"]),
    ("plains_settlement",           ["town", "flat"]),
    ("mountain_settlement",         ["town", "mountain"]),
    ("mountain_plateau_settlement", ["town", "mountain"]),
    ("plains_city",                 ["city", "flat"]),
    ("mountain_city",               ["city", "mountain"]),
    ("coastline_easttowest",        ["coast"]),
    ("coastline_NEdiagonal",        ["coast"]),
    ("coastline_NWdiagonal",        ["coast"]),
    ("coastline_settlement",        ["coast", "town"]),
    ("coastline_city",              ["coast", "city"]),
]


def crop_to_content(rgba):
    """Trim fully-transparent margin; return (image, x, y) of the kept box."""
    alpha = np.asarray(rgba)[..., 3]
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        return rgba, 0, 0
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    return rgba.crop((x0, y0, x1, y1)), x0, y0


def layer_entry(img, x, y, path, name):
    # Geometry stays in source units; EXPORT_SCALE only decides how many real
    # pixels back those units. Halving the export does not move anything.
    w, h = img.width, img.height
    if EXPORT_SCALE != 1.0:
        img = img.resize((max(1, round(w * EXPORT_SCALE)), max(1, round(h * EXPORT_SCALE))),
                         Image.LANCZOS)
    img.save(path, "WEBP", quality=88, method=5)
    return {
        "file": name,
        # offset of this layer's top-left from the hex centre, in source units
        "dx": x - FRAME["cx"],
        "dy": y - FRAME["cy"],
        "w": w,
        "h": h,
        "bytes": os.path.getsize(path),
    }


RECTIFY = _rectify_coeffs()


def build(tile_id, tags):
    src = os.path.join(MASTERS, tile_id + ".jpeg")
    if not os.path.exists(src):
        raise SystemExit(f"missing master: {src}")
    master = Image.open(src).convert("RGB")
    flat = master.transform((FRAME["src"], FRAME["srcH"]), Image.PERSPECTIVE,
                            RECTIFY, Image.BICUBIC)
    a = np.asarray(flat).astype(np.float32)
    H, W, _ = a.shape
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    # analytic hexagon, then the same footprint extruded downward. The near
    # boundary is flat out to |x| = hexFlat/2 and then slopes to the vertex,
    # which for a regular hexagon reduces to the familiar 2*(1-u).
    fw = FRAME["hexFlat"] / FRAME["hexW"]
    u = np.abs(xx - FRAME["cx"]) / (FRAME["hexW"] / 2)
    v = (yy - FRAME["cy"]) / (FRAME["hexH"] / 2)
    near_edge = np.minimum(1.0, (1.0 - u) / (1.0 - fw))
    skirt = (u <= 1.0) & (v > near_edge) & (v <= near_edge + FRAME["skirt"] / (FRAME["hexH"] / 2))

    # hologram: cool + emissive. the plinth is warm and only ever lit.
    cool = (B - R > 4) & (lum > 50)
    holo_i = np.clip((lum - 50.0) / 150.0, 0, 1) * cool
    core_i = np.clip((lum - 205.0) / 45.0, 0, 1) * cool

    # base: skirt pixels that are actually warm plinth, morphologically cleaned
    # so JPEG noise doesn't punch holes in it
    warm = (R - B > 6) & (R > 26)
    base_m = binary_opening(binary_closing(skirt & warm, np.ones((5, 5))), np.ones((3, 3)))

    layers = {}
    base_img, bx, by = crop_to_content(
        Image.fromarray(np.dstack([a, base_m * 255.0]).astype(np.uint8), "RGBA"))
    layers["base"] = layer_entry(base_img, bx, by,
                                 os.path.join(OUT, f"{tile_id}_base.webp"), f"{tile_id}_base.webp")

    white = np.full_like(holo_i, 255.0)
    for key, inten in (("holo", holo_i), ("core", core_i)):
        img, x, y = crop_to_content(
            Image.fromarray(np.dstack([white, white, white, inten * 255.0]).astype(np.uint8), "RGBA"))
        layers[key] = layer_entry(img, x, y,
                                  os.path.join(OUT, f"{tile_id}_{key}.webp"), f"{tile_id}_{key}.webp")

    # how far the tallest geometry rises above the hex centreline: the renderer
    # uses this for nothing today, but it is what quantifies tile-on-tile
    # occlusion, so keep it measured rather than guessed.
    lit = np.nonzero((holo_i > 0.05).sum(axis=1) > 4)[0]
    peak = int(FRAME["cy"] - lit.min()) if len(lit) else 0

    return {"id": tile_id, "tags": tags, "peakAbove": peak, "layers": layers}


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles = [build(*t) for t in TILES]
    manifest = {
        "_comment": "Generated by scripts/hex-tiles/build_tiles.py -- do not hand-edit.",
        "frame": FRAME,
        "exportScale": EXPORT_SCALE,
        "tiles": tiles,
    }
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    total = sum(l["bytes"] for t in tiles for l in t["layers"].values())
    for t in tiles:
        per = sum(l["bytes"] for l in t["layers"].values())
        print(f'{t["id"]:30s} {",".join(t["tags"]):16s} peak+{t["peakAbove"]:4d}  {per/1024:6.1f} KiB')
    print(f'\n{len(tiles)} tiles, {total/1024/1024:.2f} MiB total')


if __name__ == "__main__":
    sys.exit(main())
