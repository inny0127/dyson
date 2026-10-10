"""Photographic finishing for Cycles renders: what a real camera adds and a renderer does not.

- natural vignetting (cos^4 falloff for the lens' field angle)
- lateral chromatic aberration (sub-pixel radial R/B scale difference)
- veiling glare: a faint wide halo around very bright pixels (lens/sensor scatter)
- sensor noise: shot noise that scales with sqrt(signal) plus a little read noise
Usage: python3 render/post.py in.png out.jpg [--fov 54] [--noise 1.0] [--quality 90]
Runs with system python (Pillow + numpy), not Blender.
"""
import sys
import argparse
import numpy as np
from PIL import Image, ImageFilter


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)


def finish(img, fov_deg=54.0, noise=1.0, ca=0.6, glare=0.04, seed=1):
    a = np.asarray(img.convert('RGB'), dtype=np.float64) / 255.0
    lin = srgb_to_lin(a)
    h, w, _ = lin.shape
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = (w - 1) / 2, (h - 1) / 2
    r = np.hypot(xx - cx, yy - cy) / np.hypot(cx, cy)            # 0 centre .. 1 corner
    # lateral CA: red slightly larger, blue slightly smaller
    if ca:
        out = lin.copy()
        for ch, k in ((0, 1 + ca * 1e-3), (2, 1 - ca * 1e-3)):
            sx = cx + (xx - cx) / k
            sy = cy + (yy - cy) / k
            x0 = np.clip(sx.astype(int), 0, w - 1)
            y0 = np.clip(sy.astype(int), 0, h - 1)
            out[..., ch] = lin[y0, x0, ch]
        lin = out
    # veiling glare from highlights
    if glare:
        hi = np.clip(lin - 0.9, 0, None)
        if hi.max() > 0:
            g = Image.fromarray((np.clip(hi / hi.max(), 0, 1) * 255).astype(np.uint8))
            g = g.filter(ImageFilter.GaussianBlur(radius=w * 0.02))
            lin = lin + glare * hi.max() * (np.asarray(g, dtype=np.float64) / 255.0)
    # cos^4 vignetting for the half field angle at the corner
    half = np.radians(fov_deg / 2) * r
    lin = lin * (np.cos(half) ** 4)[..., None]
    # sensor noise (in linear light)
    if noise:
        rng = np.random.default_rng(seed)
        shot = rng.normal(0, 1, lin.shape) * np.sqrt(np.clip(lin, 0, None) / 4000.0) * noise
        read = rng.normal(0, 1, lin.shape[:2])[..., None] * 0.0012 * noise
        lin = lin + shot + read
    return Image.fromarray((lin_to_srgb(lin) * 255 + 0.5).astype(np.uint8))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--fov', type=float, default=54.0)
    ap.add_argument('--noise', type=float, default=1.0)
    ap.add_argument('--ca', type=float, default=0.6)
    ap.add_argument('--glare', type=float, default=0.04)
    ap.add_argument('--quality', type=int, default=90)
    ap.add_argument('--width', type=int, default=0)
    a = ap.parse_args()
    im = finish(Image.open(a.src), a.fov, a.noise, a.ca, a.glare)
    if a.width and im.width > a.width:
        im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
    kw = {'quality': a.quality}
    if a.dst.lower().endswith(('.jpg', '.jpeg')):
        kw.update(optimize=True, progressive=True, subsampling=0)
    im.save(a.dst, **kw)
    print('wrote', a.dst, im.size)
