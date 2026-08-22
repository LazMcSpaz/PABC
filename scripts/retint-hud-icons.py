#!/usr/bin/env python3
"""Normalize the HUD's line-art icons to the holo accent (C.holo in HudChrome.jsx).

The source art arrived as flat teal line work at roughly #047e8a — noticeably
darker than the holo cyan the rest of the chrome is drawn in — and the scrap
crate additionally shipped as RGB with an opaque white matte instead of an
alpha channel, so it rendered as a white tile over the dark panels.

For each icon this recovers a coverage mask (the existing alpha channel, or an
unmatte against white when there isn't one), then rewrites every pixel to the
target colour with that coverage as its alpha. Anti-aliasing survives because
it lives in the coverage, not in the RGB.

Idempotent: re-running on an already-retinted icon is a no-op.

    python3 scripts/retint-hud-icons.py [--check]
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public/assets/ui/icons"

# Keep in sync with C.holo in src/prototype/HudChrome.jsx.
TARGET = (0x56, 0xD3, 0xC6)

# Every icon reachable through the ICON map in HudChrome.jsx that is drawn as
# holo line art. The victory-point and unit-strength icons are rendered pieces
# in their own palettes and are deliberately left alone.
FILES = [
    "resources/scrap_icon.png",
    "resources/unit_icon.png",
    "resources/research_icon.png",
    "stats/garrison_icon.png",
    "actions/diplomacy_icon.png",
]

# Compression noise leaves the matte a hair off pure white; anything under this
# much coverage is background, not ink.
NOISE_FLOOR = 0.02


def coverage(rgba):
    """Per-pixel ink coverage in 0..1.

    An existing alpha channel is authoritative and passes through untouched —
    reprocessing it would eat a sliver of every anti-aliased edge on each run.
    """
    alpha = rgba[..., 3]
    if alpha.min() < 255:
        return alpha / 255.0

    # No alpha channel: the art is matted onto white. Solve px = ink*a +
    # 255*(1-a) for a, per channel, and take the channel that separates ink
    # from white most confidently.
    rgb = rgba[..., :3]
    ink = np.median(rgb[rgb.sum(axis=2) < np.percentile(rgb.sum(axis=2), 5)], axis=0)
    spread = np.maximum(255.0 - ink, 1.0)
    cov = np.clip((255.0 - rgb) / spread, 0.0, 1.0).max(axis=2)
    # Only the unmatted path carries the matte's compression noise.
    return np.clip((cov - NOISE_FLOOR) / (1.0 - NOISE_FLOOR), 0.0, 1.0)


def retint(path):
    rgba = np.asarray(Image.open(path).convert("RGBA")).astype(np.float64)
    cov = coverage(rgba)

    out = np.zeros(rgba.shape, dtype=np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = TARGET
    out[..., 3] = np.rint(cov * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    check = "--check" in sys.argv[1:]
    dirty = []
    for rel in FILES:
        path = ICONS / rel
        new = retint(path)
        before = np.asarray(Image.open(path).convert("RGBA"))
        if np.array_equal(before, np.asarray(new)):
            print(f"  ok      {rel}")
            continue
        dirty.append(rel)
        if check:
            print(f"  STALE   {rel}")
        else:
            new.save(path, optimize=True)
            print(f"  retint  {rel}")
    if check and dirty:
        print(f"\n{len(dirty)} icon(s) out of sync with #{'%02x%02x%02x' % TARGET}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
