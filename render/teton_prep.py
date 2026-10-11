"""Prepare the Jenny Lake terrain for render/earth_sky.py (system python: numpy, scipy, Pillow).

The 3DEP surface is the lake's water level (2068.4 m) over Jenny Lake, so a bed is carved under it:
depth grows ~0.25 m per metre from the shore (glacial lake, ~70 m deep in the middle; the real lake
reaches 129 m), so shallow cobbles show near the shore and the water goes dark a few tens of metres
out. Also writes a foreground cobble beach around the camera as its own height field (5 cm grid).

Usage: python3 render/teton_prep.py out_dir cam_x cam_y lake_z
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')


def main(out, cam_x, cam_y, lake_z):
    meta = json.load(open(os.path.join(ASSETS, 'teton_dem.json')))
    z = np.asarray(Image.open(os.path.join(ASSETS, 'teton_dem.png'))).astype(np.float32) / 10 + meta['base_m']
    st = meta['step_m']
    col = lambda x: int(round((x - meta['x_min_m']) / st))
    row = lambda y: int(round((meta['y_max_m'] - y) / st))
    # Jenny Lake: connected low, flat region containing the middle of the lake
    # the water surface is flat and at the lake's level; String Lake and the valley floor are not
    gy, gx = np.gradient(z, st)
    flat = (np.hypot(gx, gy) < 0.004) & (np.abs(z - (lake_z - 0.15)) < 0.2)
    box = np.zeros_like(flat)
    box[row(3100):row(-700), col(-2300):col(400)] = True
    lab, _ = ndimage.label(ndimage.binary_closing(flat & box, iterations=2))
    seed = lab[row(1200), col(-900)]
    lakem = ndimage.binary_fill_holes(lab == seed)
    dist = ndimage.distance_transform_edt(lakem) * st
    # a gentle cobble shelf for the first ~15 m, then the glacial basin drops away
    bed = lake_z - np.minimum(0.05 + 0.08 * np.minimum(dist, 15) + 0.25 * np.maximum(dist - 15, 0), 70.0)
    z = np.where(lakem, bed, z).astype(np.float32)
    np.save(os.path.join(out, 'teton_dem.npy'), z)
    # foreground beach: 5 cm grid around the camera, base from the (carved) DEM, cobbles on top
    x0, x1, y0, y1 = cam_x - 46, cam_x + 10, cam_y - 40, cam_y + 40
    h = 0.05
    xs = np.arange(x0, x1 + 1e-6, h)
    ys = np.arange(y1, y0 - 1e-6, -h)
    X, Y = np.meshgrid(xs, ys)
    c = (X - meta['x_min_m']) / st
    r = (meta['y_max_m'] - Y) / st
    base = ndimage.map_coordinates(z, [r, c], order=3, mode='nearest')
    # wave-built foreshore: the 8 m DEM spreads the waterline over metres of flat shelf; real beaches
    # step down ~0.5 m across a 2-4 m beach face (berm above, cobble shelf below)
    base = base + 0.25 * np.tanh((base - lake_z) / 0.12)
    # the 8 m DEM smears the shoreline; give the beach a natural profile: dry gravel above the
    # waterline, a shelf of cobbles out to ~6-12 m, then a steeper drop
    hf, stone = cobble_beach(X, Y, base)
    np.save(os.path.join(out, 'beach.npy'), hf.astype(np.float32))
    np.save(os.path.join(out, 'beach_stone.npy'), stone.astype(np.float32))
    json.dump({'x0': float(x0), 'y1': float(y1), 'h': h, 'nx': len(xs), 'ny': len(ys)}, open(os.path.join(out, 'beach.json'), 'w'))
    print('lake cells', int(lakem.sum()), 'beach', hf.shape, 'range', float(hf.min()), float(hf.max()))


def _hash(cx, cy, seed):
    """Uniform [0, 1) per integer cell (PCG-style integer hash)."""
    h = (cx.astype(np.int64) * 374761393 + cy.astype(np.int64) * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = (h ^ (h >> 16)) & 0xFFFFFFFF
    return h / 4294967296.0


def cobble_beach(X, Y, base):
    """Glacial-outwash beach: rounded granite, gneiss, quartzite and diabase cobbles of mixed size,
    elongated and randomly oriented, partly buried in coarse sand. Returns heights and a per-vertex
    stone id in [0, 1) (-1 for sand)."""
    rng = np.random.default_rng(5)
    sand = base + ndimage.gaussian_filter(rng.normal(size=X.shape), 1.5) * 0.006 \
        + ndimage.gaussian_filter(rng.normal(size=X.shape), 12) * 0.025
    top = sand.copy()
    stone = np.full(X.shape, -1.0)
    for li, (cell, fill) in enumerate(((0.42, 0.75), (0.24, 0.8), (0.13, 0.7))):
        gx = np.floor(X / cell).astype(np.int64)
        gy = np.floor(Y / cell).astype(np.int64)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                cx, cy = gx + dx, gy + dy
                u = [_hash(cx, cy, 17 * li + k) for k in range(8)]
                present = u[0] < fill
                px = (cx + 0.2 + 0.6 * u[1]) * cell
                py = (cy + 0.2 + 0.6 * u[2]) * cell
                r = cell * (0.28 + 0.30 * u[3])          # semi-minor axis
                asp = 1.0 + 0.8 * u[4]
                th = u[5] * np.pi
                bur = 0.35 + 0.4 * u[6]                   # height / r
                ddx, ddy = X - px, Y - py
                ex = (ddx * np.cos(th) + ddy * np.sin(th)) / (r * asp)
                ey = (-ddx * np.sin(th) + ddy * np.cos(th)) / r
                d2 = ex * ex + ey * ey
                hgt = r * bur * np.sqrt(np.clip(1 - d2, 0, 1)) ** 0.8
                z = sand - 0.25 * r * bur + hgt
                win = present & (d2 < 1) & (z > top)
                top = np.where(win, z, top)
                stone = np.where(win, u[7], stone)
    return top, stone


if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]))
