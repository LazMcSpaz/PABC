"""Spike: split a hex tile JPEG into recolourable layers.

  <stem>_base.png  plinth skirt only, background keyed out, RGBA
  <stem>_holo.png  hologram intensity in the alpha channel (CSS mask)
  <stem>_core.png  the white-hot rim lines only (kept near-white after tint)

Deterministic, no ML: the camera is locked across all 14 renders, so the
prism silhouette is analytic and only the hologram needs a luminance key.
"""
import sys, os
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
stem = os.path.splitext(os.path.basename(SRC))[0]

# --- locked camera constants, measured across all 14 tiles ---------------
CX, W, VY, HH, DROP = 509.0, 970.0, 522.0, 176.0, 139.0  # DROP = skirt height at centre

a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, Wpx, _ = a.shape
R, G, B = a[..., 0], a[..., 1], a[..., 2]
lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
yy, xx = np.mgrid[0:H, 0:Wpx].astype(np.float32)

u = np.abs(xx - CX) / (W / 2)
v = (yy - VY) / HH
inhex = (u <= 1.0) & (np.abs(v) <= np.minimum(1.0, 2.0 * (1.0 - u)))
# skirt = the extruded sides: below the top-face hexagon's lower boundary,
# down to the bottom face (same hexagon translated down by `drop`).
drop = DROP
low_edge = np.minimum(1.0, 2.0 * (1.0 - u))          # v of the near boundary
skirt = (u <= 1.0) & (v > low_edge) & (v <= low_edge + drop / HH)

# --- hologram: cool + emissive -------------------------------------------
cool = (B - R > 4) & (lum > 50)
holo_i = np.clip((lum - 50.0) / 150.0, 0, 1) * cool
core_i = np.clip((lum - 205.0) / 45.0, 0, 1) * cool

# --- base: skirt only, hologram bloom scrubbed off it --------------------
warm = (R - B > 6)
base_a = (skirt & (R > 26) & warm).astype(np.float32)
# close the 1px specks the warm test drops out of a JPEG-noisy skirt
from scipy.ndimage import binary_closing, binary_opening  # noqa: E402
base_m = binary_closing(base_a > 0.5, np.ones((5, 5)))
base_m = binary_opening(base_m, np.ones((3, 3)))
base = np.dstack([a, base_m.astype(np.float32) * 255]).astype(np.uint8)
Image.fromarray(base, 'RGBA').save(f'{OUT}/{stem}_base.png')

white = np.full_like(holo_i, 255)
Image.fromarray(np.dstack([white, white, white, holo_i * 255]).astype(np.uint8),
                'RGBA').save(f'{OUT}/{stem}_holo.png')
Image.fromarray(np.dstack([white, white, white, core_i * 255]).astype(np.uint8),
                'RGBA').save(f'{OUT}/{stem}_core.png')

print(f'{stem:14s} holo {100*(holo_i>0).mean():5.1f}%  core {100*(core_i>0).mean():5.2f}%  '
      f'skirt {100*base_m.mean():5.2f}%')
