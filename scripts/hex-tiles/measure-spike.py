import glob, os
import numpy as np
from PIL import Image
import statistics as st

rows = []
for p in sorted(glob.glob('/home/user/PABC/public/assets/ui/board/terrain/*.jpeg')):
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    H, W, _ = a.shape
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.2126 * R + 0.7152 * G + 0.0722 * B

    sil = lum > 60                     # tile silhouette vs dark misty bg
    rowc = sil.sum(axis=1)

    widest_y = int(np.argmax(rowc))    # left/right vertex row of the hexagon
    tile_w = int(rowc.max())
    bottom_y = int(np.nonzero(rowc > 0.25 * tile_w)[0].max())
    # far (top) edge of the top face: first row at >=55% of full width
    far_y = int(np.nonzero(rowc > 0.55 * tile_w)[0].min())
    # topmost lit pixel at all = tallest geometry (mountain peak)
    peak_y = int(np.nonzero(rowc > 0)[0].min())

    xs = np.nonzero(sil[widest_y])[0]
    left_x, right_x = int(xs.min()), int(xs.max())
    cx = (left_x + right_x) / 2

    # plinth: warm pixels (R>B) below the widest row
    warm = (R - B > 10) & (lum > 45)
    warm_rows = np.nonzero(warm.sum(axis=1) > 0.10 * tile_w)[0]
    plinth_top = int(warm_rows.min()) if len(warm_rows) else None
    plinth_bot = int(warm_rows.max()) if len(warm_rows) else None

    topface_h = widest_y - far_y            # half-height of projected hexagon
    proj_h = 2 * topface_h                  # full projected top-face height
    squash = proj_h / (0.866 * tile_w)      # 1.0 = flat-on, sin(elevation)
    elev = np.degrees(np.arcsin(min(1.0, squash)))

    rows.append(dict(
        name=os.path.basename(p).replace('.jpeg', ''),
        tile_w=tile_w, cx=round(cx, 1), widest_y=widest_y, far_y=far_y,
        peak_y=peak_y, bottom_y=bottom_y,
        plinth_top=plinth_top, plinth_bot=plinth_bot,
        plinth_h=(plinth_bot - plinth_top) if plinth_top is not None else None,
        proj_h=proj_h, squash=round(float(squash), 3), elev_deg=round(float(elev), 1),
        peak_above=widest_y - peak_y,
    ))

hdr = ['name', 'tile_w', 'cx', 'far_y', 'widest_y', 'proj_h', 'squash', 'elev_deg',
       'plinth_top', 'plinth_bot', 'plinth_h', 'peak_y', 'peak_above', 'bottom_y']
w = [max(len(h), max(len(str(r[h])) for r in rows)) for h in hdr]
print(' '.join(h.ljust(w[i]) for i, h in enumerate(hdr)))
for r in rows:
    print(' '.join(str(r[h]).ljust(w[i]) for i, h in enumerate(hdr)))
print()
for k in ['tile_w', 'cx', 'far_y', 'widest_y', 'proj_h', 'squash', 'elev_deg', 'plinth_h', 'bottom_y', 'peak_above']:
    v = [r[k] for r in rows if r[k] is not None]
    print(f'{k:10s} min={min(v):8.1f} max={max(v):8.1f} mean={st.mean(v):8.1f} spread={max(v)-min(v):7.1f}  ({100*(max(v)-min(v))/st.mean(v):5.1f}% of mean)')
