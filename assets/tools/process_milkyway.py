"""Build the sky background from NASA SVS Deep Star Maps 2020 (ID 4851), 8k, ICRS equatorial plate carree
(RA=0h at image centre, RA increasing to the LEFT, Dec +90 at top), linear half-float EXR.

background = milkyway_2020_8k (Gaia DR2 stars, no Hipparcos/Tycho stars)
           + hiptyc_2020_8k with every star of stars.csv (HYG, V <= 8.0) masked out
so that stars.csv can be rendered as point sources without double counting, and stars with
8 < V < ~11.5 (Tycho-2) are still present in the background.

Encoding: pure linear scale then the sRGB transfer function (no tone curve):
   p_svs = srgb_to_linear(pixel/255) * SCALE_INV
Usage: python3 -I process_milkyway.py MW.exr HIPTYC.exr stars.csv OUTDIR
"""
import sys, os, json, csv
import numpy as np
import OpenEXR
from PIL import Image

mw_p, ht_p, stars_p, out = sys.argv[1:5]
mw = OpenEXR.File(mw_p).channels()['RGB'].pixels.astype(np.float32)
ht = OpenEXR.File(ht_p).channels()['RGB'].pixels.astype(np.float32)
H, W, _ = mw.shape

# ---- mask catalogue stars (V <= 8) out of the Hipparcos/Tycho layer ----
st = list(csv.DictReader(open(stars_p)))
ra = np.array([float(s['ra_deg']) for s in st])
de = np.array([float(s['dec_deg']) for s in st])
V = np.array([float(s['vmag']) for s in st])
xc = ((0.5 - ra / 360.0) % 1.0) * W
yc = (90.0 - de) / 180.0 * H


def radius(v):
    # radii (sky pixels) measured from the SVS star profiles: halo < ~1e-4 beyond these
    return np.select([v <= 0.5, v <= 1, v <= 2, v <= 3, v <= 4, v <= 5, v <= 6], [11, 10, 8, 6.5, 5, 4, 3.2], 2.5)


r = radius(V)
mask = np.zeros((H, W), bool)
for x0, y0, rr, d in zip(xc, yc, r, de):
    rx = min(rr / max(np.cos(np.radians(d)), 1e-3), W / 2)
    y_lo, y_hi = int(np.floor(y0 - rr)), int(np.ceil(y0 + rr))
    ys = np.arange(max(y_lo, 0), min(y_hi, H - 1) + 1)
    xs = np.arange(int(np.floor(x0 - rx)), int(np.ceil(x0 + rx)) + 1)
    dy = (ys + 0.5 - y0)[:, None] / rr
    dx = (xs + 0.5 - x0)[None, :] / rx
    m = dx * dx + dy * dy <= 1.0
    yy, xx = np.nonzero(m)
    mask[ys[yy], xs[xx] % W] = True
removed = float((ht.mean(-1) * mask).sum() / max(ht.mean(-1).sum(), 1e-9))
ht_masked = ht * (~mask)[..., None]
sky = mw + ht_masked

L = 0.2126 * sky[..., 0] + 0.7152 * sky[..., 1] + 0.0722 * sky[..., 2]
clip_pct = 99.95
scale_inv = float(np.percentile(L, clip_pct))
x = np.clip(sky / scale_inv, 0.0, 1.0)


def oetf(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


enc = (oetf(x) * 255.0 + 0.5).astype(np.uint8)
Image.fromarray(enc, 'RGB').save(os.path.join(out, 'milkyway_8k.jpg'), quality=80, subsampling=2, optimize=True)

# ---- reference statistics in galactic coordinates ----
Rm = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
               [+0.4941094279, -0.4448296300, +0.7469822445],
               [-0.8676661490, -0.1980763734, +0.4559837762]])
u = (np.arange(W) + 0.5) / W
v = (np.arange(H) + 0.5) / H
RA, DEC = np.meshgrid(np.radians((0.5 - u) * 360.0), np.radians(90.0 - v * 180.0))
xyz = np.stack([np.cos(DEC) * np.cos(RA), np.cos(DEC) * np.sin(RA), np.sin(DEC)], -1)
g = xyz @ Rm.T
b = np.degrees(np.arcsin(np.clip(g[..., 2], -1, 1)))
l = np.degrees(np.arctan2(g[..., 1], g[..., 0])) % 360
w = np.cos(DEC)
gc = (np.minimum(l, 360 - l) < 5) & (np.abs(b) < 5)
pole = np.abs(b) > 75
i = np.unravel_index(np.argmin(np.minimum(l, 360 - l) ** 2 + b ** 2), l.shape)
stats = dict(clip_percentile=clip_pct, scale_inv=scale_inv, frac_pixels_clipped=float((L > scale_inv).mean()),
             masked_pixel_fraction=float(mask.mean()), hiptyc_flux_fraction_removed=removed,
             mean_L_abs_b_gt_75=float(np.average(L[pole], weights=w[pole])),
             median_L_abs_b_gt_75=float(np.median(L[pole])),
             mean_L_gal_centre_5deg=float(np.average(L[gc], weights=w[gc])),
             mean_L_all_sky=float(np.average(L, weights=w)),
             gal_centre_pixel_xy=[int(i[1]), int(i[0])])
print(json.dumps(stats, indent=1))
json.dump(stats, open(os.path.join(out, '_milkyway_stats.json'), 'w'), indent=1)
print('milkyway_8k.jpg', os.path.getsize(os.path.join(out, 'milkyway_8k.jpg')) / 1e6, 'MB')
