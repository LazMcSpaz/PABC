#!/usr/bin/env python3
"""Re-centre a sprite sheet whose model sits off its rotation axis.

    python3 scripts/recentre-unit-sheet.py croppers_infantry          # all cuts
    python3 scripts/recentre-unit-sheet.py croppers_infantry_std -n   # dry run

WHEN TO USE THIS, AND WHEN NOT TO
---------------------------------
Not by default. Registration is an art property and the fix belongs in the blend:
put the centre of the model's ground footprint on the axis it rotates about, and
re-render. That loses nothing and stays fixed.

This is the fallback for the case where the model can no longer be reproduced —
docs/unit-model-pipeline.md §11.15 hit it on three vehicles whose meshes were
`hide_render` or whose arrangement no longer existed in the blend, and §11.16 hit
it again on Croppers, whose `CRP_group` matches the shipped sheet at only IoU
0.920. A sheet that cannot be re-rendered can still be corrected, because the
defect is a RIGID displacement: the model is the right shape in every row, just
standing in the wrong place. Undoing a rigid displacement is a translation, and a
whole-pixel translation of a lossless image loses nothing either.

It only works because the defect is rigid. Check that first — §11.16 shows how,
and `check-unit-art.py`'s `wvar` column is the short version. If the silhouette
changes shape between rows rather than sliding, there is no single shift that
fixes it and this script will make things worse, not better.

WHAT IT DOES
------------
Per ROW (not per frame — the displacement is constant across a row's animation
cycle), it measures how far the art's midpoint sits from the anchor, then shifts
that row of BOTH the sheet and the mask by the negated whole-pixel amount. Sheet
and mask are shifted identically or the owner-colour region would peel off the
figures it belongs to. It refuses to shift a row that would push art off the cell
edge, so no pixel is ever lost, and it re-encodes lossless.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art", "units")


def row_offsets(alpha, spec):
    """Mean bounding-box midpoint of each row's art, relative to the anchor x.

    The same estimator check-unit-art.py reports, deliberately: the thing being
    corrected should be measured the way it is judged.
    """
    cw, ch = spec["frameWidth"], spec["frameHeight"]
    ax = spec["anchor"][0]
    out = []
    for r in range(len(spec["rows"])):
        mids = []
        for c in range(spec["frames"]):
            xs = np.nonzero(alpha[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw].any(0))[0]
            if len(xs):
                mids.append((xs.min() + xs.max()) / 2.0 - ax)
        out.append(float(np.mean(mids)) if mids else 0.0)
    return out


def row_margins(alpha, spec, r):
    """How many empty columns each cell in row `r` has to its left and right."""
    cw, ch = spec["frameWidth"], spec["frameHeight"]
    left = right = cw
    for c in range(spec["frames"]):
        xs = np.nonzero(alpha[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw].any(0))[0]
        if not len(xs):
            continue
        left = min(left, int(xs.min()))
        right = min(right, cw - 1 - int(xs.max()))
    return left, right


def shift_row(arr, spec, r, dx):
    """Slide every cell of row `r` by dx px, filling the vacated edge with zero."""
    cw, ch = spec["frameWidth"], spec["frameHeight"]
    band = arr[r * ch:(r + 1) * ch]
    for c in range(spec["frames"]):
        cell = band[:, c * cw:(c + 1) * cw]
        moved = np.zeros_like(cell)
        if dx > 0:
            moved[:, dx:] = cell[:, :cw - dx]
        elif dx < 0:
            moved[:, :cw + dx] = cell[:, -dx:]
        else:
            moved = cell
        band[:, c * cw:(c + 1) * cw] = moved


def recentre(base, dry):
    spec = json.load(open(os.path.join(ART, faction_dir(base), base + ".json")))
    d = os.path.join(ART, faction_dir(base))
    sheet_p = os.path.join(d, base + "_sheet.webp")
    mask_p = os.path.join(d, base + "_mask.webp")
    sheet = np.asarray(Image.open(sheet_p).convert("RGBA")).copy()
    mask = np.asarray(Image.open(mask_p).convert("RGB")).copy()

    offs = row_offsets(sheet[..., 3], spec)
    shifts = [-int(round(o)) for o in offs]
    print(f"{base}:")
    ok = True
    for r, name in enumerate(spec["rows"]):
        left, right = row_margins(sheet[..., 3], spec, r)
        dx = shifts[r]
        room = left if dx < 0 else right
        fits = abs(dx) <= room
        ok &= fits
        print(f"  {name:3s} off {offs[r]:+6.1f} -> shift {dx:+3d} "
              f"(margin L{left} R{right}){'' if fits else '   REFUSED: would clip'}")
    if not ok:
        print("  no shift applied — a row has no room, so this sheet needs a re-render")
        return False
    if dry:
        print("  dry run, nothing written")
        return True
    for r in range(len(spec["rows"])):
        if shifts[r]:
            shift_row(sheet, spec, r, shifts[r])
            shift_row(mask, spec, r, shifts[r])
    # Lossless: the shift is exact, and re-encoding must not be the thing that
    # degrades a sheet that was correct everywhere except its position.
    Image.fromarray(sheet, "RGBA").save(sheet_p, lossless=True, quality=100, method=6)
    Image.fromarray(mask, "RGB").save(mask_p, lossless=True, quality=100, method=6)
    print(f"  written: {os.path.basename(sheet_p)}, {os.path.basename(mask_p)}")
    return True


def faction_dir(base):
    for d in sorted(os.listdir(ART)):
        if os.path.isdir(os.path.join(ART, d)) and os.path.exists(os.path.join(ART, d, base + ".json")):
            return d
    raise SystemExit(f"no sidecar found for {base}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry = any(a in ("-n", "--dry-run") for a in sys.argv[1:])
    if not args:
        raise SystemExit(__doc__)
    needle = args[0]
    bases = sorted({
        f[:-5] for d in os.listdir(ART)
        if os.path.isdir(os.path.join(ART, d))
        for f in os.listdir(os.path.join(ART, d))
        if f.endswith(".json") and f[:-5].startswith(needle)
    })
    if not bases:
        raise SystemExit(f"nothing matches {needle}")
    good = all(recentre(b, dry) for b in bases)
    print("\nnow: node scripts/build-units.mjs && python3 scripts/check-unit-art.py")
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
