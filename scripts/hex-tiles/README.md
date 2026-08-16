# Hex tile spikes

Throwaway-quality scripts that de-risked
[`docs/holographic-hex-board-plan.md`](../../docs/holographic-hex-board-plan.md).
They are kept because they are *working* proofs of the two claims the plan
rests on — promote them into a real build script in phase 0 rather than
starting over.

Both run against `public/assets/ui/board/terrain/*.jpeg` and need
`pillow`, `numpy` and `scipy` (not project dependencies — install ad hoc).

### `measure-spike.py`

Measures tile geometry across the whole set and prints per-tile figures plus
spread. This is where the locked-camera constants in the plan come from
(hex width 970 px, centre x 509, vertex row 522, top-face height 352, skirt
139, camera elevation ~24.8°).

```
python3 scripts/hex-tiles/measure-spike.py
```

### `split-spike.py`

Splits one tile into the three recolourable layers — `_base` (plinth skirt,
background keyed out), `_holo` (hologram intensity in alpha, used as a CSS
mask), `_core` (white-hot rim lines). Deterministic: the prism silhouette is
analytic because the camera is locked, and hologram-vs-plinth is a
warm/cool + luminance test.

```
python3 scripts/hex-tiles/split-spike.py <tile.jpeg> <outdir>
```

Known gaps to close when this becomes the real pipeline: it writes PNG rather
than WebP, writes full 1024² frames instead of cropping each layer to its own
bounding box, emits no manifest, and has the camera constants hard-coded at
the top instead of reading them from one shared source.
