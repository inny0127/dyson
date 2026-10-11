"""The swarm from low Earth orbit: Earth's night side, with the Sun hidden behind the planet and
the swarm's glow rising over the limb.

What is there, and what sets each number:
- The swarm at Earth's limit is a shell of sails 0.86 AU from the Sun, covering 0.41 % of it. From
  1 AU it is a disc 59 deg in radius round the Sun. Inside the disc we see the far half's
  sunlit faces through the near half's gaps:
  L = (1 - f) f rho S / pi / (1 - f rho) = 0.0096 W/m^2/sr (0.89 cd/m^2). render/sky_map.py
  glow_radiance gives the disc, and its colour is sunlight off near-neutral hardware plus the film's
  violet anti-reflection residual. From orbit nothing is in the way. When Earth hides the Sun, the
  rest of the disc stands above the limb.
- Earth: NASA Black Marble 2016 lights, the Blue Marble cloud composite, the GEBCO ocean mask and
  Blue Marble land colour (assets/manifest.json). A sphere of 6,360 km.
- Light on the night side: the part of the disc above each point's horizon, through the air
  (transmittance), on land, cloud and ocean. The ocean also mirrors the disc (Fresnel, wave
  slopes from Cox-Munk).
- Air: render/atmosphere.py (Hillaire 2020 LUTs), integrated along each ray from orbit. Rayleigh,
  Mie and ozone; the disc lights it as a set of point sources, and so does the Sun, which is in
  Earth's shadow here. Airglow layers emit: O 557.7 nm, Na 589 nm, O 630 nm.
- Sky: catalogue stars (V <= 8) as points, the Milky Way (calibrated), zodiacal light. All seen
  through the air near the limb.
- Units: the repo's radiometric convention, W/m^2/sr with sunlight at 93 lm/W. The output is a
  scene-linear EXR for render/develop.py.

Usage (system python): python3 render/leo_view.py out.exr [--res 2400x1600] [--lens 16] ...
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import atmosphere as A  # noqa: E402
import ephem  # noqa: E402
import glare  # noqa: E402
import sky_map as SM  # noqa: E402

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
RG, RT = A.RG, A.RT
LM = 93.0
S0 = 1361.0
Image.MAX_IMAGE_PIXELS = None

# Airglow layers: (name, peak height m, Gaussian sigma m, zenith brightness R, line nm, luminous
# efficacy of the line lm/W). Rayleigh -> W/m^2/sr: 1e10/(4 pi) photons/s/m^2/sr times h c / lambda.
AIRGLOW = [
    ('O 557.7', 97e3, 5e3, 250.0, 557.7, 681.0),
    ('Na 589', 92e3, 4e3, 50.0, 589.0, 527.0),
    ('O 630', 250e3, 30e3, 80.0, 630.0, 181.0),
]
LINE_RGB = {557.7: (0.40, 1.0, 0.08), 589.0: (1.0, 0.62, 0.0), 630.0: (1.0, 0.06, 0.0)}


def rayleigh_to_repo(nm, efficacy):
    """1 rayleigh of a line at nm, as luminance in the repo's W/m^2/sr (93 lm/W) units."""
    W = 1e10 / (4 * math.pi) * 6.62607015e-34 * 299792458.0 / (nm * 1e-9)
    return W * efficacy / LM


def unit_rgb(c):
    c = np.asarray(c, float)
    return c / (c @ A.LUMA)


def load_lin(name, mode='RGB'):
    im = Image.open(os.path.join(ASSETS, name)).convert(mode)
    a = np.asarray(im, dtype=np.float32) / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def load_data(name):
    return np.asarray(Image.open(os.path.join(ASSETS, name)).convert('L'), dtype=np.float32) / 255.0


def sample_map(img, lat, lon):
    """Bilinear lookup of an equirectangular map (lon -180 at the left edge, lat +90 at the top)."""
    h, w = img.shape[:2]
    x = (lon + math.pi) / (2 * math.pi) * w - 0.5
    y = (math.pi / 2 - lat) / math.pi * h - 0.5
    if img.ndim == 2:
        return map_coordinates(img, [y, x], order=1, mode='grid-wrap')
    return np.stack([map_coordinates(img[..., c], [y, x], order=1, mode='grid-wrap') for c in range(img.shape[2])], -1)


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0, 0], [0, c, -s], [0, s, c]])


def blackbody_rgb(T):
    """Linear sRGB of a blackbody, luminance 1 (CIE 1931 via the Wyman 2013 fits)."""
    T = np.atleast_1d(np.asarray(T, float))
    lam = np.arange(380, 781, 5.0)
    def g(x, m, s1, s2):
        return np.exp(-0.5 * ((x - m) / np.where(x < m, s1, s2)) ** 2)
    xb = 1.056 * g(lam, 599.8, 37.9, 31.0) + 0.362 * g(lam, 442.0, 16.0, 26.7) - 0.065 * g(lam, 501.1, 20.4, 26.2)
    yb = 0.821 * g(lam, 568.8, 46.9, 40.5) + 0.286 * g(lam, 530.9, 16.3, 31.1)
    zb = 1.217 * g(lam, 437.0, 11.8, 36.0) + 0.681 * g(lam, 459.0, 26.0, 13.8)
    B = 1 / (lam[None] * 1e-9) ** 5 / np.expm1(1.4388e-2 / (lam[None] * 1e-9 * T[:, None]))
    XYZ = np.stack([B @ xb, B @ yb, B @ zb], -1)
    M = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    rgb = np.clip(XYZ @ M.T, 0, None)
    return rgb / (rgb @ A.LUMA)[:, None]


class Scene:
    def __init__(self, a):
        self.a = a
        y, mo, d = (int(v) for v in a.date.split('-'))
        self.jd = ephem.julian_day(y, mo, d, a.utc)
        self.gmst = math.radians(ephem.lst(self.jd, 0.0))
        ra, dec = (math.radians(v) for v in ephem.sun_radec(self.jd))
        sun_eq = np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])
        self.eq2ecef = rz(-self.gmst)                       # d_ecef = R d_eq
        self.sun = self.eq2ecef @ sun_eq
        eps = math.radians(23.4393)
        self.pole = self.eq2ecef @ np.array([0.0, -math.sin(eps), math.cos(eps)])
        lat, lon = math.radians(a.lat), math.radians(a.lon)
        self.up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
        self.east = np.array([-math.sin(lon), math.cos(lon), 0.0])
        self.north = np.cross(self.up, self.east)
        self.P = (RG + a.alt) * self.up
        g = {'kind': 'shell', 'f': a.f, 'rho': a.rho, 'r_au': a.r, 'r_in': a.r, 'r_out': a.r_out}
        self.glow = g
        self.glow_rgb = SM.GLOW_COLOUR
        # the disc as point sources for lighting the air and the ground
        R_d = math.asin(min(a.r_out, 0.999))
        self.src_dirs, self.src_omega = SM.cap_samples(self.sun, R_d, a.disc_samples)
        Ld = SM.glow_radiance(self.src_dirs, self.sun, g)
        self.src_E = (Ld * self.src_omega)[:, None] * self.glow_rgb[None]          # RGB W/m^2 each
        self.sun_E = A.sun_irradiance_rgb(S0 * (1 - a.f))
        self.atm = A.Atmosphere()
        # the Moon: geocentric position (low-precision series), body frame with lon 0 toward Earth
        (mx, my, mz), dist_km = ephem.moon_eq(self.jd)
        self.moon_c = self.eq2ecef @ np.array([mx, my, mz]) * dist_km * 1e3
        xm = -self.moon_c / np.linalg.norm(self.moon_c)
        zm = self.pole - (self.pole @ xm) * xm
        zm /= np.linalg.norm(zm)
        self.moon_frame = np.stack([xm, np.cross(zm, xm), zm])     # rows: body x, y, z in ECEF
        to_moon = self.moon_c / np.linalg.norm(self.moon_c)
        self.moon_elong = math.degrees(math.acos(np.clip(to_moon @ self.sun, -1, 1)))
        # earthshine: Earth seen from the Moon at phase angle ~ the elongation, Lambert sphere, Bond albedo 0.30
        al = math.radians(self.moon_elong)
        phi = (math.sin(al) + (math.pi - al) * math.cos(al)) / math.pi
        self.earthshine = 0.30 * S0 * (RG / np.linalg.norm(self.moon_c)) ** 2 * phi * 2 / 3

    # --- geometry --------------------------------------------------------------------------
    def camera(self, w, h):
        a = self.a
        az, el, roll = (math.radians(v) for v in (a.az, a.el, a.roll))
        fwd = math.cos(el) * (math.sin(az) * self.east + math.cos(az) * self.north) + math.sin(el) * self.up
        right = np.cross(fwd, self.up); right /= np.linalg.norm(right)
        upv = np.cross(right, fwd)
        right, upv = math.cos(roll) * right + math.sin(roll) * upv, -math.sin(roll) * right + math.cos(roll) * upv
        f = a.lens / 36.0 * w                               # focal length in pixels (36 mm sensor width)
        x = (np.arange(w) + 0.5 - w / 2)
        y = (h / 2 - np.arange(h) - 0.5)
        X, Y = np.meshgrid(x, y)
        D = fwd[None, None] * f + right[None, None] * X[..., None] + upv[None, None] * Y[..., None]
        D /= np.linalg.norm(D, axis=-1, keepdims=True)
        self.fwd, self.right, self.upv, self.fpx = fwd, right, upv, f
        return D

    def project(self, d, w, h):
        """Pixel coordinates of directions d (N x 3); valid where in front of the camera."""
        z = d @ self.fwd
        x = d @ self.right / np.maximum(z, 1e-9) * self.fpx + w / 2 - 0.5
        y = h / 2 - 0.5 - d @ self.upv / np.maximum(z, 1e-9) * self.fpx
        return x, y, z > 0

    @staticmethod
    def sphere(P, D, R):
        """Near and far intersection distances of rays P + t D with a sphere of radius R."""
        b = D @ P
        c = P @ P - R * R
        disc = b * b - c
        s = np.sqrt(np.maximum(disc, 0))
        return -b - s, -b + s, disc >= 0

    # --- air ------------------------------------------------------------------------------
    def march(self, D, t0, t1, steps):
        """In-scattered + airglow radiance and transmittance along P + t D, t in [t0, t1]."""
        n = len(D)
        L = np.zeros((n, 3))
        T = np.ones((n, 3))
        dt = np.maximum(t1 - t0, 0) / steps
        srcs = [(self.src_dirs[i], self.src_E[i]) for i in range(len(self.src_dirs))] + [(self.sun, self.sun_E)]
        glow_layers = [(h0, sg, I * rayleigh_to_repo(nm, eff) * unit_rgb(LINE_RGB[nm]))
                       for _, h0, sg, I, nm, eff in AIRGLOW]
        for k in range(steps):
            t = t0 + (k + 0.5) * dt
            X = self.P + D * t[:, None]
            r = np.linalg.norm(X, axis=1)
            up = X / r[:, None]
            hx = r - RG
            dr, dm, do = A.densities(hx)
            sR = A.B_R * dr[:, None]
            sM = A.B_MS * dm[:, None]
            ext = sR + A.B_ME * dm[:, None] + A.B_O * do[:, None]
            stepT = np.exp(-ext * dt[:, None])
            integ = (1 - stepT) / np.maximum(ext, 1e-15)
            S = np.zeros((n, 3))
            for s, E in srcs:
                mu_s = up @ s
                c = D @ s
                pR = 3 / (16 * math.pi) * (1 + c * c)
                pM = 3 / (8 * math.pi) * (1 - A.G_M ** 2) * (1 + c * c) / ((2 + A.G_M ** 2) * (1 + A.G_M ** 2 - 2 * A.G_M * c) ** 1.5)
                Ts = self.atm.transmittance(r, mu_s)
                S += E * (Ts * (sR * pR[:, None] + sM * pM[:, None]) + (sR + sM) * self.atm.multiple(hx, mu_s))
            for h0, sg, J in glow_layers:                    # volume emission, per metre
                S += (np.exp(-0.5 * ((hx - h0) / sg) ** 2) / (sg * math.sqrt(2 * math.pi)))[:, None] * J[None]
            L += T * S * integ
            T *= stepT
        return L, T

    # --- ground ---------------------------------------------------------------------------
    def ground(self, G, D, maps):
        """Radiance leaving ground points G (N x 3) toward the camera (before the air)."""
        n = G / np.linalg.norm(G, axis=1, keepdims=True)
        lat = np.arcsin(np.clip(n[:, 2], -1, 1))
        lon = np.arctan2(n[:, 1], n[:, 0])
        r0 = np.full(len(G), RG + 1.0)
        # irradiance from the disc (and the Sun) above the local horizon, through the air
        E = np.zeros((len(G), 3))
        for s, Es in list(zip(self.src_dirs, self.src_E)) + [(self.sun, self.sun_E)]:
            mu = n @ s
            E += Es[None] * (np.maximum(mu, 0)[:, None] * self.atm.transmittance(r0, mu))
        # skylight, the air's own scattered glow: ~12 % of the direct light for a clear sky with a
        # vertical optical depth of ~0.15 (coarse; it only softens the night side)
        E = E * 1.12
        land = sample_map(maps['day'], lat, lon) * 0.75             # display-referred -> albedo-ish
        water = sample_map(maps['water'], lat, lon)
        cloud = sample_map(maps['cloud'], lat, lon)
        cloud = np.clip((cloud - 0.08) / 0.85, 0, 1) ** 1.3
        lights = sample_map(maps['lights'], lat, lon)
        # ocean: dark body plus a rough mirror of the sky (Fresnel, Cox-Munk sigma ~0.2 at 7 m/s)
        cos_i = np.clip(-(D * n).sum(1), 0, 1)
        rng = np.random.default_rng(3)
        spec = np.zeros((len(G), 3))
        ns = 8
        for _ in range(ns):
            m = n + 0.2 * rng.standard_normal((len(G), 3))
            m /= np.linalg.norm(m, axis=1, keepdims=True)
            ci = np.clip(-(D * m).sum(1), 0, 1)
            Rv = D + 2 * ci[:, None] * m
            up_ok = (Rv * n).sum(1) > 0
            g = SM.glow_radiance(Rv, self.sun, self.glow)
            Tr = self.atm.transmittance(r0, np.clip((Rv * n).sum(1), -1, 1))
            spec += (fresnel(ci) * g * up_ok)[:, None] * self.glow_rgb[None] * Tr
        spec /= ns
        surf = water[:, None] * (0.03 * E / math.pi + spec) + (1 - water)[:, None] * land * E / math.pi
        # city lights (emission), dimmed by cloud, which also scatters some of it
        Llights = lights[:, None] * self.a.lights_scale * blackbody_rgb(self.a.lights_K)[0][None]
        surf = surf + Llights * (1 - 0.8 * cloud)[:, None]
        cloud_L = 0.65 * E / math.pi
        return surf * (1 - cloud)[:, None] + cloud_L * cloud[:, None]


R_MOON = 1737.4e3


def moon_radiance(sc, X, D, albedo_map):
    """Radiance of points X on the Moon seen along D: sunlight (lunar-Lambert, McEwen 1991) and
    earthshine (Lambert), with LRO albedo scaled to a mean normal albedo of 0.12."""
    n = (X - sc.moon_c) / R_MOON
    b = n @ sc.moon_frame.T                                   # body coordinates
    lat = np.arcsin(np.clip(b[:, 2], -1, 1))
    lon = np.arctan2(b[:, 1], b[:, 0])
    alb = sample_map(albedo_map, lat, lon) * 0.40
    mu0 = np.clip(n @ sc.sun, 0, 1)
    mu = np.clip(-(n * D).sum(1), 1e-3, 1)
    alpha = math.degrees(math.acos(np.clip(-D.mean(0) @ sc.sun, -1, 1)))     # phase angle
    # McEwen's limb-darkening weight, fitted to phase angles up to ~100 deg; it goes negative beyond,
    # where the Moon is Lambert-like (a crescent is ~145 deg)
    Lp = min(1.0, max(0.0, 1 - 0.019 * alpha + 2.42e-4 * alpha ** 2 - 1.46e-6 * alpha ** 3))
    shape = 2 * Lp * mu0 / (mu0 + mu) + (1 - Lp) * mu0
    sun = alb * (sc.sun_E[None] / math.pi) * shape[:, None]
    to_earth = -sc.moon_c / np.linalg.norm(sc.moon_c)
    es = alb * (sc.earthshine * np.clip(n @ to_earth, 0, 1) / math.pi)[:, None] * blackbody_rgb(6500.0)[0][None]
    return sun + es


def fresnel(c, n2=1.333):
    c = np.clip(c, 1e-6, 1)
    s2 = 1 - c * c
    t = np.sqrt(np.maximum(1 - s2 / n2 ** 2, 0))
    rs = (c - n2 * t) / (c + n2 * t)
    rp = (t - n2 * c) / (t + n2 * c)
    return 0.5 * (rs * rs + rp * rp)


def render(sc, w, h, steps, chunk=60000):
    D = sc.camera(w, h).reshape(-1, 3)
    N = len(D)
    out = np.zeros((N, 3))
    maps = {'day': load_lin('earth_day_8k.jpg'), 'water': load_data('earth_water_mask_4k.png'),
            'cloud': load_data('earth_clouds_8k.jpg'), 'lights': load_lin('earth_night_lights_8k.jpg', 'L'),
            'moon': load_lin('moon_albedo_2k.jpg')}
    moon_mask = np.zeros(N, bool)
    for a in range(0, N, chunk):
        d = D[a:a + chunk]
        tg0, tg1, hitg = Scene.sphere(sc.P, d, RG)
        hitg &= tg0 > 0
        ta0, ta1, hita = Scene.sphere(sc.P, d, RT)
        t0 = np.maximum(ta0, 0)
        t1 = np.where(hitg, tg0, ta1)
        L = np.zeros((len(d), 3))
        T = np.ones((len(d), 3))
        if hita.any():
            Li, Ti = sc.march(d[hita], t0[hita], t1[hita], steps)
            L[hita], T[hita] = Li, Ti
        bg = np.zeros((len(d), 3))
        sky = ~hitg
        if sky.any():
            ds = d[sky]
            g = SM.glow_radiance(ds, sc.sun, sc.glow)[:, None] * sc.glow_rgb[None]
            zod = (SM.zodiacal(ds, sc.sun, sc.pole))[:, None] * A.SUN_RGB[None] / (A.SUN_RGB @ A.LUMA)
            bg[sky] = g + zod
        if hitg.any():
            G = sc.P + d[hitg] * tg0[hitg][:, None]
            bg[hitg] = sc.ground(G, d[hitg], maps)
        tm0, _, hitm = Scene.sphere(sc.P - sc.moon_c, d, R_MOON)
        hitm &= (tm0 > 0) & ~hitg
        if hitm.any():
            Xm = sc.P + d[hitm] * tm0[hitm][:, None]
            bg[hitm] = moon_radiance(sc, Xm, d[hitm], maps['moon'])
        moon_mask[a:a + chunk] = hitm
        out[a:a + chunk] = bg * T + L
        print('chunk', a // chunk + 1, '/', (N + chunk - 1) // chunk, flush=True)
    img = out.reshape(h, w, 3)
    keep = ~moon_mask.reshape(h, w, 1)                        # the Moon hides what lies behind it
    img += milky(sc, D, h, w) * keep
    img += star_layer(sc, w, h, steps) * keep
    return img


def milky(sc, D, h, w):
    """The Milky Way above the air, seen through it (transmittance re-used per pixel)."""
    tg0, _, hitg = Scene.sphere(sc.P, D, RG)
    hitg &= tg0 > 0
    mw = np.zeros((len(D), 3))
    sky = ~hitg
    mw[sky] = SM.milky_way(D[sky], sc.eq2ecef.T)
    # transmittance for sky rays through the air (coarse: 24 steps; the Milky Way is faint)
    ta0, ta1, hita = Scene.sphere(sc.P, D, RT)
    sel = sky & hita
    if sel.any():
        _, T = Scene.march_T(sc, D[sel], np.maximum(ta0[sel], 0), ta1[sel])
        mw[sel] *= T
    return mw.reshape(h, w, 3)


def _march_T(sc, D, t0, t1, steps=48):
    T = np.ones((len(D), 3))
    dt = (t1 - t0) / steps
    for k in range(steps):
        t = t0 + (k + 0.5) * dt
        X = sc.P + D * t[:, None]
        hx = np.linalg.norm(X, axis=1) - RG
        T *= np.exp(-A.extinction(hx) * dt[:, None])
    return None, T


Scene.march_T = _march_T


def star_layer(sc, w, h, steps):
    import csv
    rows = []
    with open(os.path.join(ASSETS, 'stars.csv')) as f:
        for row in csv.DictReader(f):
            rows.append((float(row['ra_deg']), float(row['dec_deg']), float(row['vmag']), float(row['bv'])))
    a = np.array(rows)
    ra, dec = np.radians(a[:, 0]), np.radians(a[:, 1])
    d = (sc.eq2ecef @ np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)])).T
    x, y, front = sc.project(d, w, h)
    ok = front & (x > -1) & (x < w) & (y > -1) & (y < h)
    tg0, _, hitg = Scene.sphere(sc.P, d, RG)
    ok &= ~(hitg & (tg0 > 0))
    d, x, y = d[ok], x[ok], y[ok]
    E = 2.74e-8 * 10 ** (-0.4 * a[ok, 2])
    bv = a[ok, 3]
    Tk = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
    col = blackbody_rgb(Tk)
    ta0, ta1, hita = Scene.sphere(sc.P, d, RT)
    T = np.ones((len(d), 3))
    if hita.any():
        _, T[hita] = sc.march_T(d[hita], np.maximum(ta0[hita], 0), ta1[hita])
    pix_sr = (1.0 / sc.fpx) ** 2                            # solid angle of a pixel near the axis
    img = np.zeros((h, w, 3))
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    val = (E / pix_sr)[:, None] * col * T
    for dx, dy, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi, yi = x0 + dx, y0 + dy
        m = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
        np.add.at(img, (yi[m], xi[m]), val[m] * wt[m][:, None])
    return img


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--res', default='2400x1600')
    ap.add_argument('--lat', type=float, default=31.0)
    ap.add_argument('--lon', type=float, default=29.0)
    ap.add_argument('--alt', type=float, default=400e3)
    ap.add_argument('--date', default='2128-03-28', help='a waning crescent 35 deg from the Sun')
    ap.add_argument('--utc', type=float, default=1.4, help='UTC hour')
    ap.add_argument('--az', type=float, default=80.0, help='view azimuth, deg from north through east')
    ap.add_argument('--el', type=float, default=-14.0)
    ap.add_argument('--roll', type=float, default=0.0)
    ap.add_argument('--lens', type=float, default=16.0)
    ap.add_argument('--f', type=float, default=0.00411)
    ap.add_argument('--rho', type=float, default=0.004)
    ap.add_argument('--r', type=float, default=0.8604, help='inner radius of the shell, AU')
    ap.add_argument('--r-out', type=float, default=0.92, help='outer radius of the shell, AU')
    ap.add_argument('--disc-samples', type=int, default=24)
    ap.add_argument('--steps', type=int, default=48)
    ap.add_argument('--aim-moon', action='store_true', help='point at the Moon (az/el become offsets in deg)')
    ap.add_argument('--lights-scale', type=float, default=3.8e-3, help='repo radiance of map value 1')
    ap.add_argument('--lights-K', type=float, default=3500.0)
    a = ap.parse_args(argv)
    w, h = (int(v) for v in a.res.split('x'))
    sc = Scene(a)
    if a.aim_moon:
        tm = sc.moon_c - sc.P
        tm /= np.linalg.norm(tm)
        a.az += math.degrees(math.atan2(tm @ sc.east, tm @ sc.north))
        a.el += math.degrees(math.asin(tm @ sc.up))
    sun_alt = math.degrees(math.asin(sc.sun @ sc.up))
    sun_az = math.degrees(math.atan2(sc.sun @ sc.east, sc.sun @ sc.north)) % 360
    dip = math.degrees(math.acos(RG / (RG + a.alt)))
    to_moon = sc.moon_c - sc.P
    to_moon /= np.linalg.norm(to_moon)
    info = {'moon_alt_deg': math.degrees(math.asin(to_moon @ sc.up)),
            'moon_az_deg': math.degrees(math.atan2(to_moon @ sc.east, to_moon @ sc.north)) % 360,
            'moon_elongation_deg': sc.moon_elong, 'earthshine_W_m2': sc.earthshine,
            'sun_alt_deg': sun_alt, 'sun_az_deg': sun_az, 'limb_dip_deg': dip,
            'sun_below_limb_deg': -dip - sun_alt,
            'disc_radiance': float(SM.glow_radiance(sc.sun[None], sc.sun, sc.glow)[0])}
    print(json.dumps(info), flush=True)
    img = render(sc, w, h, a.steps)
    glare.write(a.out, img)
    info['exposure_for_disc'] = math.log2(0.30 / info['disc_radiance'])
    print(json.dumps(info))
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[1:])
