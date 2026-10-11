"""A Mediterranean Europe: the July Blue Marble with the dry-summer belt moved poleward.

docs/full-swarm.md ("Can more land be made Mediterranean?"): sunlight shaped by latitude and season
can push the summer subtropical high, and with it the dry-summer belt, a few degrees toward the
pole. Nothing here is painted. The new belt takes the July colours of today's belt, and the belt's
old equator-side edge takes those of today's steppe at the desert's edge, by histogram matching.
That keeps every field, forest and city of the real image and changes only the season's palette.
Summer skies over the new belt clear, as they do under the subtropical high today.

- New Mediterranean belt: 44-51 deg N (fading over 41-44 and 51-56), west of 12 deg E, fading out
  by 25 deg E as the winter rain from the Atlantic gives out. Reference: Iberia and the south of
  Italy and Greece, 37-42 deg N.
- Drier edge: 33-37.5 deg N (fading over 30-33 and 37.5-40.5), 11 deg W to 30 deg E. Reference: the
  steppe south of the Atlas, 29-32.5 deg N.
- Mountains above ~1,500 m keep their colours (snow and alpine meadows follow altitude).

North America's Pacific coast is done differently, because its dry-summer belt is a narrow coastal
strip that already reaches Seattle. Each 1-degree band of the strip within ~4 deg of the coast
(fading out by 7 deg, east of the Cascades and the Sierra) takes the July colours of the strip 5 deg
further south, from 32 to 58 deg N: British Columbia's coast takes Washington's and Oregon's,
Oregon takes northern California's, and southern California takes Baja's desert. Summer cloud over
the new belt (48-57 deg N) and its sea thins.

Usage: python3 render/med_earth.py OUT_DIR   (writes earth_day_med_8k.jpg, earth_clouds_med_8k.jpg)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')


def srgb_to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def ramp(x, a, b, c, d):
    """0 below a, rising to 1 over a-b, 1 over b-c, falling to 0 over c-d."""
    return smooth((x - a) / (b - a)) * smooth((d - x) / (d - c))


def pacific_shift(out, day, LAT, LON, land, lowland, shift=5, lat0=32, lat1=58):
    """North America's Pacific coast: each 1-degree band of the coastal strip takes the July palette of
    the strip `shift` degrees further south (per-channel quantile mapping, blended between bands)."""
    H, W = day.shape[:2]
    rows = np.where((LAT[:, 0] > lat0 - shift - 1) & (LAT[:, 0] < lat1 + 2))[0]
    cols = np.where((LON[0] > -140) & (LON[0] < -105))[0]
    # the coast: the westernmost land in each row, smoothed over ~1 deg so islands do not jump it
    coast = np.full(H, np.nan)
    for r in rows:
        lnd = np.where(land[r, cols] > 0.5)[0]
        if len(lnd):
            coast[r] = LON[0, cols[lnd[0]]]
    k = int(1.0 / (180 / H))
    sm = coast.copy()
    for r in rows:
        win = coast[max(0, r - k):r + k + 1]
        sm[r] = np.nanmedian(win) if np.isfinite(win).any() else np.nan
    d = LON - sm[:, None]
    strip = np.where(np.isfinite(d), smooth((7 - d) / 3) * (d > -1.0), 0.0) * (LON > -140) * (LON < -105)
    wsel = strip * land * lowland
    centres = np.arange(lat0, lat1 + 1) + 0.5
    q = np.linspace(0, 1, 513)

    def curves(c):
        tgt = (np.abs(LAT - c) < 0.5) & (wsel > 0.3)
        src = (np.abs(LAT - (c - shift)) < 0.5) & (wsel > 0.3)
        if tgt.sum() < 200 or src.sum() < 200:
            return None
        return [(np.quantile(day[tgt][:, ch], q), np.quantile(day[src][:, ch], q)) for ch in range(3)]

    cv = [curves(c) for c in centres]
    fade = smooth((LAT - (lat0 - 0.5)) / 1.5) * smooth((lat1 + 1.5 - LAT) / 2)
    w = wsel * fade
    changed = 0.0
    for i in range(len(centres) - 1):
        a, b = cv[i], cv[i + 1]
        if a is None and b is None:
            continue
        a, b = a or b, b or a
        m = (LAT >= centres[i]) & (LAT < centres[i + 1]) & (w > 0.01)
        t = (LAT[m] - centres[i])[:, None]
        x = day[m]
        ma = np.stack([np.interp(x[:, ch], *a[ch]) for ch in range(3)], -1)
        mb = np.stack([np.interp(x[:, ch], *b[ch]) for ch in range(3)], -1)
        mapped = (1 - t) * ma + t * mb
        out[m] = (1 - w[m, None]) * out[m] + w[m, None] * mapped
        changed += float((w[m] * np.cos(np.radians(LAT[m]))).sum())
    cloud_w = smooth((LAT - 47) / 2) * smooth((58 - LAT) / 2) * np.where(np.isfinite(d), smooth((d + 9) / 2) * smooth((6 - d) / 2), 0.0)
    return {'cloud_w': cloud_w, 'km2': changed * (40075 / W) * (20004 / H)}


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    day = srgb_to_lin(np.asarray(Image.open(os.path.join(ASSETS, 'earth_day_8k.jpg')).convert('RGB'), np.float32) / 255)
    H, W = day.shape[:2]
    lat = 90 - (np.arange(H) + 0.5) / H * 180
    lon = -180 + (np.arange(W) + 0.5) / W * 360
    LON, LAT = np.meshgrid(lon, lat)
    up = lambda name: np.asarray(Image.open(os.path.join(ASSETS, name)).convert('L').resize((W, H), Image.BILINEAR), np.float32) / 255
    land = 1 - up('earth_water_mask_4k.png')
    topo = up('earth_topo_4k.jpg')
    # the topography map has no documented scale: tie it to Mont Blanc (4,808 m) and the Paris basin
    px = lambda la, lo: topo[int((90 - la) / 180 * H), int((lo + 180) / 360 * W)]
    t_blanc, t_paris = float(topo[int((90 - 45.83) / 180 * H) - 6:int((90 - 45.83) / 180 * H) + 6,
                                    int((6.86 + 180) / 360 * W) - 6:int((6.86 + 180) / 360 * W) + 6].max()), float(px(48.86, 2.35))
    elev = (topo - t_paris) / max(t_blanc - t_paris, 1e-3) * 4700 + 60
    lowland = smooth((2000 - elev) / 500)

    w_new = ramp(LAT, 41, 44, 51, 56) * smooth((25 - LON) / 13) * smooth((LON + 12) / 2)
    w_dry = ramp(LAT, 30, 33, 37.5, 40.5) * smooth((30 - LON) / 3) * smooth((LON + 12) / 2)
    ref_med = (LAT > 37) & (LAT < 42) & (((LON > -8.5) & (LON < -1)) | ((LON > 14) & (LON < 17)) | ((LON > 21) & (LON < 23))) & (land > 0.9) & (lowland > 0.9)
    ref_dry = (LAT > 29) & (LAT < 32.5) & (LON > -8) & (LON < 8) & (land > 0.9) & (lowland > 0.9)

    out = day.copy()
    for w, ref in ((w_new, ref_med), (w_dry, ref_dry)):
        wl = w * land * lowland
        tgt = wl > 0.02
        core = (w > 0.9) & (land > 0.9) & (lowland > 0.9)
        # map the core region's July palette onto the reference's, then blend by weight
        sq = np.linspace(0, 1, 513)
        mapped = np.empty_like(day[tgt])
        for c in range(3):
            s_q = np.quantile(day[core][:, c], sq)
            r_q = np.quantile(day[ref][:, c], sq)
            mapped[:, c] = np.interp(day[tgt][:, c], s_q, r_q)
        out[tgt] = (1 - wl[tgt, None]) * out[tgt] + wl[tgt, None] * mapped

    na = pacific_shift(out, day, LAT, LON, land, lowland)

    Image.fromarray((lin_to_srgb(out) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out_dir, 'earth_day_med_8k.jpg'), quality=95)

    cloud = np.asarray(Image.open(os.path.join(ASSETS, 'earth_clouds_8k.jpg')).convert('L'), np.float32) / 255
    # summer skies clear over the new belt and its seas, a little over the drier edge
    wn = ramp(LAT, 40, 43, 52, 57) * smooth((27 - LON) / 14) * smooth((LON + 22) / 6)
    wd = ramp(LAT, 29, 32, 38, 41) * smooth((32 - LON) / 4) * smooth((LON + 20) / 6)
    cloud = cloud * (1 - 0.75 * wn) * (1 - 0.4 * wd)
    cloud = cloud * (1 - 0.6 * na['cloud_w'])
    Image.fromarray((np.clip(cloud, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out_dir, 'earth_clouds_med_8k.jpg'), quality=95)
    print(json.dumps({'mont_blanc_topo': t_blanc, 'paris_topo': t_paris, 'ref_med_px': int(ref_med.sum()), 'ref_dry_px': int(ref_dry.sum()),
                      'new_belt_land_km2': float((w_new * land * lowland).sum() * (20037.5 * 2 / W) * (20037.5 / H) * np.cos(np.radians(46))),
                      'drier_land_km2': float((w_dry * land * lowland).sum() * (20037.5 * 2 / W) * (20037.5 / H) * np.cos(np.radians(35))),
                      'pacific_changed_km2': na['km2']}))


if __name__ == '__main__':
    main(sys.argv[1])
