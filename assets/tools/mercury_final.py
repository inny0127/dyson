"""Build Mercury albedo (sRGB JPEG) and height (16-bit PNG) maps from the reduced 8k arrays.
Usage: python3 -I mercury_final.py WORK_DIR OUT_DIR
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

WORK, OUT = sys.argv[1], sys.argv[2]
loi = np.load(os.path.join(WORK, 'loi_8k.npy'))     # DN (8-bit stretched I/F, i=30 e=0 normalised), NaN = no data/shadow
md3 = np.load(os.path.join(WORK, 'md3_8k.npy'))     # (3,H,W) DN for 1000, 750, 430 nm
dem = np.load(os.path.join(WORK, 'dem_8k.npy'))     # metres above 2,439,400 m sphere
H, W = loi.shape
lat = 90.0 - (np.arange(H) + 0.5) / H * 180.0
coslat = np.cos(np.radians(lat))[:, None] * np.ones((1, W))


def fill_nan(a, sigmas=(2, 4, 8, 16, 32, 64)):
    """Normalised-convolution inpainting with wrap in longitude."""
    a = a.copy()
    for s in sigmas:
        m = ~np.isnan(a)
        if m.all():
            break
        num = ndimage.gaussian_filter(np.where(m, a, 0.0), s, mode=('nearest', 'wrap'))
        den = ndimage.gaussian_filter(m.astype(np.float32), s, mode=('nearest', 'wrap'))
        fill = (~m) & (den > 0.05)
        a[fill] = num[fill] / den[fill]
    a[np.isnan(a)] = np.nanmean(a)
    return a


# ---------- albedo luminance ----------
band = np.abs(lat) < 50
med = float(np.nanmedian(loi[band]))
loi_f = fill_nan(loi.astype(np.float32))
# undo part of the 8-bit display stretch: assume DN ~ k*(I/F - c) with c = 0.3*median I/F
rel = 0.3 + 0.7 * (loi_f / med)
rel = np.clip(rel, 0.15, 4.0)

# ---------- colour from MD3 band ratios ----------
valid = ~np.isnan(md3).any(0)
with np.errstate(invalid='ignore', divide='ignore'):
    rb = np.log(md3[2] / md3[1])   # ln(430/750)
    rr = np.log(md3[0] / md3[1])   # ln(1000/750)
rb0 = float(np.nanmedian(rb[valid & band[:, None]]))
rr0 = float(np.nanmedian(rr[valid & band[:, None]]))
ALPHA = 0.35   # attenuation of the independently-stretched MD3 colour contrast
rb = np.where(valid, (rb - rb0) * ALPHA, np.nan)
rr = np.where(valid, (rr - rr0) * ALPHA, np.nan)
# fade colour variation to neutral above |lat| 70 (MD3 polar coverage is poor) and in gaps
fade = np.clip((75.0 - np.abs(lat)) / 10.0, 0, 1)[:, None]
rb = fill_nan(np.where(np.isnan(rb), np.nan, rb), sigmas=(2, 4, 8, 16, 32)) * fade
rr = fill_nan(np.where(np.isnan(rr), np.nan, rr), sigmas=(2, 4, 8, 16, 32)) * fade
rb = ndimage.gaussian_filter(rb, 1.0, mode=('nearest', 'wrap'))
rr = ndimage.gaussian_filter(rr, 1.0, mode=('nearest', 'wrap'))

# Mercury mean relative reflectance (normalised at 750 nm): red-sloped spectrum
S430, S750, S1000 = 0.70, 1.00, 1.12
s430 = S430 * np.exp(rb)
s1000 = S1000 * np.exp(rr)


def spec(wl):
    # quadratic Lagrange through (430, s430), (750, 1), (1000, s1000)
    x0, x1, x2 = 430.0, 750.0, 1000.0
    l0 = (wl - x1) * (wl - x2) / ((x0 - x1) * (x0 - x2))
    l1 = (wl - x0) * (wl - x2) / ((x1 - x0) * (x1 - x2))
    l2 = (wl - x0) * (wl - x1) / ((x2 - x0) * (x2 - x1))
    return l0 * s430 + l1 * S750 + l2 * s1000


Rc, Gc, Bc = spec(610.0), spec(545.0), spec(465.0)
Yc = 0.2126 * Rc + 0.7152 * Gc + 0.0722 * Bc
Rc, Gc, Bc = Rc / Yc, Gc / Yc, Bc / Yc

# ---------- absolute scale ----------
TARGET_MEAN_ALBEDO = 0.08   # area-weighted mean linear luminance (Lambert-equivalent, see CREDITS/manifest)
k = TARGET_MEAN_ALBEDO / float(np.average(rel, weights=coslat))
Y = rel * k
lin = np.stack([Y * Rc, Y * Gc, Y * Bc], -1)
lin = np.clip(lin, 0, 1)


def oetf(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


enc = (oetf(lin) * 255 + 0.5).astype(np.uint8)
im = Image.fromarray(enc, 'RGB')
im.save(os.path.join(OUT, 'mercury_albedo_8k.jpg'), quality=90, subsampling=2, optimize=True)
im4 = im.resize((4096, 2048), Image.LANCZOS)
im4.save(os.path.join(OUT, 'mercury_albedo_4k.jpg'), quality=90, subsampling=2, optimize=True)

# ---------- height ----------
H0, DH = -6000.0, 1.0       # h_m = H0 + DH * v16  (1 m steps)
v = np.clip(np.round((dem - H0) / DH), 0, 65535).astype(np.uint16)
Image.fromarray(v).save(os.path.join(OUT, 'mercury_height_8k.jp2'), irreversible=False)  # lossless JPEG 2000 (reversible 5/3 wavelet)
dem4 = np.asarray(Image.fromarray(dem.astype(np.float32), 'F').resize((4096, 2048), Image.BOX))
v4 = np.clip(np.round((dem4 - H0) / DH), 0, 65535).astype(np.uint16)
Image.fromarray(v4).save(os.path.join(OUT, 'mercury_height_4k.png'), optimize=True)

stats = dict(loi_median_dn=med, md3_median_ln430_750=rb0, md3_median_ln1000_750=rr0, alpha=ALPHA,
             mean_colour_rgb_lin_rel=[float(np.average(Rc, weights=coslat)), float(np.average(Gc, weights=coslat)), float(np.average(Bc, weights=coslat))],
             target_mean_albedo=TARGET_MEAN_ALBEDO,
             albedo_Y_percentiles_2_50_98=[float(x) for x in np.percentile(Y[np.abs(lat) < 60], [2, 50, 98])],
             dem_min_m=float(dem.min()), dem_max_m=float(dem.max()), H0=H0, DH=DH,
             v16_min=int(v.min()), v16_max=int(v.max()))
json.dump(stats, open(os.path.join(OUT, '_mercury_stats.json'), 'w'), indent=1)
print(json.dumps(stats, indent=1))
for n in ['mercury_albedo_8k.jpg', 'mercury_albedo_4k.jpg', 'mercury_height_8k.jp2', 'mercury_height_4k.png']:
    print(n, os.path.getsize(os.path.join(OUT, n)) / 1e6, 'MB')
