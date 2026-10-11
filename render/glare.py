"""Lens glare for scene-linear EXR renders: the light a real camera spreads around very bright points
(the swarm's glints are up to a million times brighter than its glow). The point-spread function
is a narrow bloom plus power-law veiling glare, normalised so energy is conserved:
PSF = (1 - e) delta + e_b Gaussian(sigma) + e_w (1 + (r/r0)^2)^-1.5.

Usage (system python, OpenEXR): python3 render/glare.py in.exr out.exr [--bloom 0.03] [--wings 0.02]
       [--sigma 1.6] [--r0 3.0]
"""
import argparse

import numpy as np
import OpenEXR
import Imath

FLOAT = Imath.PixelType(Imath.PixelType.FLOAT)


def read(path):
    f = OpenEXR.InputFile(path)
    dw = f.header()['dataWindow']
    w, h = dw.max.x - dw.min.x + 1, dw.max.y - dw.min.y + 1
    ch = [np.frombuffer(f.channel(c, FLOAT), dtype=np.float32).reshape(h, w) for c in 'RGB']
    return np.stack(ch, -1).astype(np.float64)


def write(path, img):
    h, w, _ = img.shape
    hdr = OpenEXR.Header(w, h)
    hdr['channels'] = {c: Imath.Channel(FLOAT) for c in 'RGB'}
    f = OpenEXR.OutputFile(path, hdr)
    f.writePixels({c: img[..., i].astype(np.float32).tobytes() for i, c in enumerate('RGB')})
    f.close()


def psf_conv(img, bloom, wings, sigma, r0):
    h, w, _ = img.shape
    H, W = 2 * h, 2 * w
    y = np.fft.fftfreq(H) * H
    x = np.fft.fftfreq(W) * W
    X, Y = np.meshgrid(x, y)
    r2 = X * X + Y * Y
    g = np.exp(-r2 / (2 * sigma * sigma)); g /= g.sum()
    p = (1 + r2 / (r0 * r0)) ** -1.5; p /= p.sum()
    k = bloom * g + wings * p
    K = np.fft.rfft2(k)
    out = np.empty_like(img)
    for c in range(3):
        pad = np.zeros((H, W))
        pad[:h, :w] = img[..., c]
        out[..., c] = np.fft.irfft2(np.fft.rfft2(pad) * K, s=(H, W))[:h, :w]
    return (1 - bloom - wings) * img + out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--bloom', type=float, default=0.03)
    ap.add_argument('--wings', type=float, default=0.02)
    ap.add_argument('--sigma', type=float, default=1.6)
    ap.add_argument('--r0', type=float, default=3.0)
    a = ap.parse_args()
    img = read(a.src)
    write(a.dst, psf_conv(img, a.bloom, a.wings, a.sigma, a.r0))
    print('wrote', a.dst)
