"""Fetch a terrain elevation grid from the AWS Terrain Tiles (Terrarium PNG encoding) and save it
as a 16-bit PNG plus a JSON sidecar.

Source: Mapzen/AWS Terrain Tiles, s3://elevation-tiles-prod (Registry of Open Data on AWS). In the
continental US the tiles come from USGS 3DEP 1/3 arc-second (~10 m) data. Attribution: "Terrain
Tiles: Mapzen, USGS 3DEP"; see https://github.com/tilezen/joerd/blob/master/docs/attribution.md.

Usage: python3 assets/tools/fetch_dem.py out.png --lat 43.7535 --lon -110.7195 --west 13 --east 2.5
       --south 11 --north 12 --zoom 14
The grid is resampled to a local east/north metre grid centred on (lat, lon) with spacing `--step`.
Elevation is stored as uint16 decimetres above `base` (in the sidecar).
"""
import argparse
import io
import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (np.asarray(lon) + 180) / 360 * n
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
    return x, y


def fetch(z, x, y, cache):
    path = os.path.join(cache, f'{z}_{x}_{y}.png')
    if not os.path.exists(path):
        with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60) as r:
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--lat', type=float, required=True)
    ap.add_argument('--lon', type=float, required=True)
    ap.add_argument('--west', type=float, default=10, help='km')
    ap.add_argument('--east', type=float, default=10)
    ap.add_argument('--south', type=float, default=10)
    ap.add_argument('--north', type=float, default=10)
    ap.add_argument('--zoom', type=int, default=14)
    ap.add_argument('--step', type=float, default=8.0, help='output grid spacing, m')
    ap.add_argument('--cache', default='/tmp/terrarium')
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    R = 6371008.8
    m_per_deg_lat = math.pi * R / 180
    m_per_deg_lon = m_per_deg_lat * math.cos(math.radians(a.lat))
    lat_n = a.lat + a.north * 1e3 / m_per_deg_lat
    lat_s = a.lat - a.south * 1e3 / m_per_deg_lat
    lon_w = a.lon - a.west * 1e3 / m_per_deg_lon
    lon_e = a.lon + a.east * 1e3 / m_per_deg_lon
    x0, y0 = (float(v) for v in tile_xy(lat_n, lon_w, a.zoom))
    x1, y1 = (float(v) for v in tile_xy(lat_s, lon_e, a.zoom))
    tx = range(int(x0), int(x1) + 1)
    ty = range(int(y0), int(y1) + 1)
    mosaic = np.zeros((len(ty) * 256, len(tx) * 256))
    for j, y in enumerate(ty):
        for i, x in enumerate(tx):
            mosaic[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = fetch(a.zoom, x, y, a.cache)
    # local grid: column = east (west -> east), row = north (north at row 0)
    xs = np.arange(-a.west * 1e3, a.east * 1e3 + 1e-6, a.step)
    ys = np.arange(a.north * 1e3, -a.south * 1e3 - 1e-6, -a.step)
    E, N = np.meshgrid(xs, ys)
    lon = a.lon + E / m_per_deg_lon
    lat = a.lat + N / m_per_deg_lat
    px, py = tile_xy(lat, lon, a.zoom)
    u = (px - tx[0]) * 256 - 0.5
    v = (py - ty[0]) * 256 - 0.5
    u0 = np.clip(np.floor(u).astype(int), 0, mosaic.shape[1] - 2)
    v0 = np.clip(np.floor(v).astype(int), 0, mosaic.shape[0] - 2)
    fu, fv = u - u0, v - v0
    h = (mosaic[v0, u0] * (1 - fu) * (1 - fv) + mosaic[v0, u0 + 1] * fu * (1 - fv)
         + mosaic[v0 + 1, u0] * (1 - fu) * fv + mosaic[v0 + 1, u0 + 1] * fu * fv)
    base = math.floor(h.min() / 100) * 100
    dm = np.clip(np.round((h - base) * 10), 0, 65535).astype(np.uint16)
    Image.fromarray(dm).save(a.out, optimize=True)
    meta = {
        'source': 'AWS Terrain Tiles (Terrarium), zoom %d; USGS 3DEP in the US' % a.zoom,
        'centre_lat': a.lat, 'centre_lon': a.lon, 'step_m': a.step,
        'x_min_m': float(xs[0]), 'y_max_m': float(ys[0]), 'cols': int(len(xs)), 'rows': int(len(ys)),
        'encoding': 'uint16 decimetres above base_m; row 0 = north edge, column 0 = west edge',
        'base_m': base, 'min_m': float(h.min()), 'max_m': float(h.max()),
    }
    with open(os.path.splitext(a.out)[0] + '.json', 'w') as f:
        json.dump(meta, f, indent=1)
    print(json.dumps(meta), os.path.getsize(a.out), 'bytes')


if __name__ == '__main__':
    main()
