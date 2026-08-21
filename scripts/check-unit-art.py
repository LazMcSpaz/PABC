#!/usr/bin/env python3
"""Art QA for unit sprite sheets — the checks that need actual pixels.

build-units.mjs validates what the JSON *claims*; this validates what the sheets
contain. Run it whenever new unit art lands.

    python3 scripts/check-unit-art.py            # all factions
    python3 scripts/check-unit-art.py plainers   # filter by substring

Needs pillow and numpy (not project dependencies — install ad hoc), same as
scripts/hex-tiles/*.py.

What it checks, and why each one matters:

  dimensions      the sheet and mask must match the declared grid
  straight alpha  the board composites in the DOM, which expects
                  non-premultiplied alpha; premultiplied would dark-fringe the
                  glow edges. RGB > A anywhere proves straight.
  clipping        art touching a cell edge has been cut off
  registration    every row's art must sit on the anchor. All eight rows are
                  drawn now — units turn to face the middle of their hex — so a
                  row that wanders off the anchor visibly slides sideways as a
                  unit takes up a different stance
  footprint       the drawn art should sit inside the footprint it declares,
                  since the slot chooser and hit target are sized from it
  livery share    masked fraction of the silhouette, against §8's 25% floor
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "src", "prototype", "unitSprites.json")
ASSETS = os.path.join(ROOT, "public", "assets", "units")

SIN_ELEVATION = math.sin(math.radians(34.18))
LIVERY_FLOOR = 25.0        # §8: masked area wants to be a quarter of the silhouette or more
ROW0_TOLERANCE = 4.0       # px; the front-facing row must sit on the anchor
DRIFT_TOLERANCE = 12.0     # px; how far any other row may wander from it

problems = []
warnings = []


def main():
    needle = sys.argv[1] if len(sys.argv) > 1 else ""
    if not os.path.exists(MANIFEST):
        print("no manifest — run: node scripts/build-units.mjs")
        return 1
    manifest = json.load(open(MANIFEST))["units"]

    print(f"{'asset':34s} {'part%':>6s} {'liv%':>5s} {'row0':>6s} {'drift':>6s} {'clip':>4s}  notes")
    for faction, units in sorted(manifest.items()):
        for unit, spec in sorted(units.items()):
            for variant, files in sorted(spec["variants"].items()):
                name = f"{faction}/{unit}/{variant}"
                if needle and needle not in name:
                    continue
                check_one(name, spec, files)

    print()
    for w in warnings:
        print(f"note: {w}")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("unit art OK")
    return 0


def check_one(name, spec, files):
    cw, ch = spec["frameWidth"], spec["frameHeight"]
    rows, nf = spec["rows"], spec["frames"]
    ax, ay = spec["anchor"]

    sheet = np.asarray(Image.open(os.path.join(ASSETS, files["sheet"])).convert("RGBA")).astype(np.int16)
    # No mask key means the manifest is declaring an asset nobody owns (see
    # build-units.mjs). Derived from the manifest rather than a name list,
    # because a name list needs editing again for the next ownerless asset.
    mask = None
    if "mask" in files:
        mask = np.asarray(Image.open(os.path.join(ASSETS, files["mask"])).convert("RGB")).astype(np.int16)
    A = sheet[..., 3]

    notes = []
    if sheet.shape[1] != spec["sheetWidth"] or sheet.shape[0] != spec["sheetHeight"]:
        problems.append(f"{name}: sheet is {sheet.shape[1]}x{sheet.shape[0]}, manifest says "
                        f"{spec['sheetWidth']}x{spec['sheetHeight']}")
    if mask is not None and mask.shape[:2] != sheet.shape[:2]:
        problems.append(f"{name}: mask is {mask.shape[1]}x{mask.shape[0]}, sheet is {sheet.shape[1]}x{sheet.shape[0]}")

    partial = 100.0 * ((A > 0) & (A < 255)).sum() / A.size
    # Premultiplied alpha cannot have any channel exceed alpha; straight can.
    if not (sheet[..., :3] > A[..., None]).any():
        problems.append(f"{name}: no pixel has RGB > A — sheet looks premultiplied, "
                        f"which will dark-fringe the glow edges")

    sil = A > 0
    # The floor is right for anything a player must recognise as THEIRS. It
    # cannot apply to something nobody owns, so an ownerless asset is not
    # measured against it and reports no share rather than 0.0%.
    livery = None
    if mask is not None:
        livery = 100.0 * ((mask[..., 0] > 127) & sil).sum() / max(1, sil.sum())
        if livery < LIVERY_FLOOR:
            problems.append(f"{name}: livery is {livery:.1f}% of the silhouette, under the {LIVERY_FLOOR:.0f}% floor (§8)")
        stray = ((mask[..., 0] > 127) & ~sil).sum()
        if stray:
            notes.append(f"{stray}px of mask outside the silhouette")
    else:
        notes.append("ownerless — no livery")

    clipped = 0
    row_off = []
    reach_x = reach_below = 0
    for r in range(len(rows)):
        mids = []
        for c in range(nf):
            cell = A[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            ys, xs = np.nonzero(cell)
            if len(xs) == 0:
                continue
            if xs.min() == 0 or ys.min() == 0 or xs.max() == cw - 1 or ys.max() == ch - 1:
                clipped += 1
            mids.append((xs.min() + xs.max()) / 2.0 - ax)
            if r == 0:
                reach_x = max(reach_x, ax - xs.min(), xs.max() - ax)
                reach_below = max(reach_below, ys.max() - ay)
        row_off.append(float(np.mean(mids)) if mids else 0.0)

    row0 = row_off[0]
    drift = max(abs(o - row0) for o in row_off)
    worst = rows[max(range(len(row_off)), key=lambda i: abs(row_off[i] - row0))]

    if abs(row0) > ROW0_TOLERANCE:
        problems.append(f"{name}: row 0 art sits {row0:+.1f}px off the anchor, so the unit will not line "
                        f"up with its contact ellipse")
    if clipped:
        problems.append(f"{name}: {clipped} of {len(rows) * nf} cells have art touching the cell edge (clipped)")
    if drift > DRIFT_TOLERANCE:
        problems.append(f"{name}: art drifts {drift:.0f}px off the anchor by row '{worst}' — every row is "
                        f"drawn now, so the unit slides sideways when it turns to face the hex centre")

    # The slot chooser and click target are sized from the declared footprint.
    half_w = spec["footprintMetres"] * spec["pixelsPerMetre"] / 2.0
    if reach_x > half_w:
        warnings.append(f"{name}: row 0 art reaches {reach_x:.0f}px from the anchor but its "
                        f"{spec['footprintMetres']}m footprint is only {half_w:.0f}px — wider than the hit target")
    if reach_below > half_w * SIN_ELEVATION + 1:
        warnings.append(f"{name}: row 0 art reaches {reach_below:.0f}px below the anchor, past the "
                        f"{half_w * SIN_ELEVATION:.0f}px its footprint projects")

    liv = f"{livery:5.1f}" if livery is not None else "    -"
    print(f"{name:34s} {partial:6.2f} {liv} {row0:+6.1f} {drift:6.1f} {clipped:4d}  {'; '.join(notes)}")


if __name__ == "__main__":
    sys.exit(main())
