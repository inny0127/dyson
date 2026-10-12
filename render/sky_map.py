"""Night and twilight sky for a place and time on Earth, with or without a swarm, as an
equirectangular radiance map in the scene frame (+X east, +Y north, +Z up), plus a star list.

Components (all in the repo's radiometric units, W/(m^2 sr); 93 lm/W converts to cd/m^2):
- Twilight: the Sun lighting the atmosphere (render/atmosphere.py, multiple scattering). The
  clean-air model overstates deep twilight 2-4x, so the Sun's sky is scaled to the measured clear-sky
  twilight illuminance on level ground (Bond & Henderson 1963 / USNO: 3.4 lux at -6 deg, 0.0083 lux at
  -12 deg, log-linear between and beyond).
- Swarm glow: a shell of radius r around the Sun with coverage f seen through its own gaps:
  L = (1 - f) f rho S(r) / pi / (1 - f rho), uniform out to asin(r) from the Sun, softened by the
  shell's radial spread. Its colour is sunlight reflected by the sail hardware (near-white) plus the
  film's violet AR residual (design_spec scene facts). Seen through the atmosphere (transmittance),
  and scattered by it (the same model, the disc split into point sources).
- Far-side cloud (option): two wings along the ecliptic, 7.5-45 deg from the Sun, profile from
  docs/data/earth_safe.json.
- Natural night: the Milky Way (assets/milkyway_8k.jpg, calibrated), airglow (van Rhijn), zodiacal
  light (Leinert et al. 1998, simplified), catalogue stars V <= 8 as points (returned separately).
- Closed swarm (kind closed): no glow, no zodiacal light, no planets; stars and Milky Way hidden
  within cap_deg of the Sun (the outer shell's limb) by the mirror cap's cold back.

Usage (system python): python3 render/sky_map.py spec.json out_prefix
spec keys: lat, lst_deg, sun_alt, sun_az, width, h_cam, glow {kind: shell|farside|uniform|mix|closed, ...},
           moon {alt, az, lux} (optional)
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, zoom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atmosphere as A  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
ASSETS = os.path.join(REPO, 'assets')
LM = 93.0
S0 = 1361.0
FARSIDE_LAT = 30.0                 # deg, the cloud's default half-height in heliocentric latitude
FARSIDE_L3_GAP = 15.0              # deg either side of L3 kept empty (near-IR would return to Earth)
FARSIDE_EDGE_DEG = 3.0
S10 = 2.74e-8 * 10 ** (-0.4 * 10) * (180 / math.pi) ** 2      # one V=10 star per deg^2, W/m^2/sr
# glow colour: hardware near-neutral, ~9 % of the reflectance from the film's violet AR residual
# (design_spec scene_facts.sail_brightness.glint_colour_linear_sRGB_rel), times sunlight
_film = np.array([0.3898, 0.0991, 1.0])
_film = _film / (_film @ A.LUMA)
GLOW_COLOUR = (0.91 + 0.09 * _film) * A.SUN_RGB
GLOW_COLOUR = GLOW_COLOUR / (GLOW_COLOUR @ A.LUMA)


def twilight_lux(alt):
    """Measured clear-sky illuminance on level ground from the twilight sky (lux)."""
    pts = [(5, 4000.0), (0, 600.0), (-6, 3.4), (-12, 0.0083), (-18, 2e-5), (-30, 1e-9)]
    for (a0, l0), (a1, l1) in zip(pts, pts[1:]):
        if a1 <= alt <= a0:
            t = (alt - a0) / (a1 - a0)
            return 10 ** (math.log10(l0) + t * (math.log10(l1) - math.log10(l0)))
    return 0.0 if alt < -30 else 4000.0


def vec(alt, az):
    alt, az = math.radians(alt), math.radians(az)
    return np.array([math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)])


def horizon_basis(lat, lst):
    """Columns: equatorial coordinates of the horizon frame's east, north and up."""
    p, t = math.radians(lat), math.radians(lst)
    E = np.array([-math.sin(t), math.cos(t), 0.0])
    N = np.array([-math.sin(p) * math.cos(t), -math.sin(p) * math.sin(t), math.cos(p)])
    Z = np.array([math.cos(p) * math.cos(t), math.cos(p) * math.sin(t), math.sin(p)])
    return np.stack([E, N, Z], 1)


def cap_samples(centre, radius, n):
    """n roughly uniform points inside a spherical cap, each with solid angle cap/n."""
    c = centre / np.linalg.norm(centre)
    a = np.array([1.0, 0, 0]) if abs(c[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(c, a); u /= np.linalg.norm(u)
    v = np.cross(c, u)
    k = np.arange(n) + 0.5
    cos_t = 1 - (1 - math.cos(radius)) * k / n
    phi = math.pi * (1 + 5 ** 0.5) * k
    s = np.sqrt(1 - cos_t ** 2)
    pts = cos_t[:, None] * c + (s * np.cos(phi))[:, None] * u + (s * np.sin(phi))[:, None] * v
    return pts, 2 * math.pi * (1 - math.cos(radius)) / n


R_CAP = 0.98                                                         # AU: the outer shell, where the mirror cap flies


def sphere_depth(dirs, sun, g):
    """The symmetric sphere (docs/closed-swarm.md): the share of the shell's depth a line of sight
    from Earth crosses on each side of its closest approach to the Sun, 0..1. Sails fill r_in..r_out
    AU and Earth is d AU from the Sun, so inside asin(r_in / d) a line crosses the whole layer twice;
    beyond, both halves thin out until asin(r_out / d), the sphere's limb."""
    ang = np.arccos(np.clip(dirs @ sun, -1, 1))
    b = np.where(ang < math.pi / 2, g.get('d', 1.0) * np.sin(ang), 2.0)
    return np.clip((g['r_out'] - b) / (g['r_out'] - g['r_in']), 0, 1)


def sphere_half(dirs, sun, g):
    """Light one half of such a line lets through. Sails in different orbits are uncorrelated along a
    slanted line, so the shell is a random layer: (1 - f) to the power of the share of depth crossed,
    whatever the slant (for sun-facing plates the slant cancels)."""
    return (1.0 - g['f']) ** sphere_depth(dirs, sun, g)


def sphere_transmission(dirs, sun, g):
    """Starlight through the sphere at coverage f: in through the near half and out through the far."""
    return sphere_half(dirs, sun, g) ** 2


def closed_cap_deg(d):
    """From Earth d AU from the Sun, the closed sphere hides the sky out to its limb, asin(R_CAP / d):
    74.6 deg in early July, 85.3 deg in early January."""
    return math.degrees(math.asin(min(R_CAP / d, 0.999)))


def glow_radiance(dirs, sun, g):
    """Radiance of the swarm glow above the atmosphere (W/m^2/sr, luminance channel)."""
    cosang = dirs @ sun
    if g['kind'] == 'sphere':
        # the far half's sunlit fronts, seen through the gaps of the near half: inside asin(r_in / d)
        # f (1 - f) rho S / pi; toward the limb both halves thin, so at high f the glow peaks in a ring
        t = sphere_half(dirs, sun, g)
        r = 0.5 * (g['r_in'] + g['r_out'])
        return (1 - t) * t * g['rho'] * S0 / r ** 2 / math.pi
    if g['kind'] == 'uniform':
        # near-uniform swarm (docs/full-swarm.md): sun-facing sails between r_in and r_out AU all round
        # the Sun, filled to tau, empty within acos(r_in) of the Sun-Earth line (so every line of sight
        # from Earth misses the near layer) and within 15 deg of L3, which from Earth is a dark hole
        # ~7 deg round the Sun. Earth sees the far hemisphere's sunlit fronts: tau rho S / pi.
        tau, rho = g['tau'], g['rho']
        ang = np.arccos(np.clip(cosang, -1, 1))
        b = np.where(ang < math.pi / 2, np.sin(ang), 2.0)
        frac = np.clip((g['r_out'] - b) / (g['r_out'] - g['r_in']), 0, 1)
        r = 0.5 * (g['r_in'] + g['r_out'])
        # the L3 gap's edge, 165 deg round the orbit from Earth, seen from Earth
        hole = math.atan2(r * math.sin(math.radians(15)), 1 + r * math.cos(math.radians(15)))
        w = math.radians(1.0)
        open_ = np.clip((ang - hole + w / 2) / w, 0, 1)
        open_ = open_ * open_ * (3 - 2 * open_)
        return tau * frac * open_ * rho * S0 / r ** 2 / math.pi / (1 - tau * rho)
    if g['kind'] == 'mix':
        # the far-side cloud (f_far) plus sails inside Earth's orbit (f_in, r_in..r_out AU) kept out of
        # a cone round the Sun-Earth line wide enough (acos r) that Earth sees none of their backs:
        # within asin(r) of the Sun only the far hemisphere's sunlit fronts show, and they stand in
        # front of the far-side band, dimming it by their coverage
        far = glow_radiance(dirs, sun, {**g, 'kind': 'farside', 'f': g['f_far']})
        f, rho = g['f_in'], g['rho']
        ang = np.arccos(np.clip(cosang, -1, 1))
        b = np.where(ang < math.pi / 2, np.sin(ang), 2.0)
        frac = np.clip((g['r_out'] - b) / (g['r_out'] - g['r_in']), 0, 1)
        r = 0.5 * (g['r_in'] + g['r_out'])
        return f * frac * rho * S0 / r ** 2 / math.pi / (1 - f * rho) + far * (1 - f * frac)
    if g['kind'] == 'shell':
        r, f, rho = g['r_au'], g['f'], g['rho']
        S = S0 / r ** 2
        L = (1 - f) * f * rho * S / math.pi / (1 - f * rho)
        ang = np.arccos(np.clip(cosang, -1, 1))
        if 'r_out' in g:
            # a shell from r_in to r_out (AU), seen from 1 AU. Coverage accrues as f dr / (r_out - r_in)
            # along any path for sun-facing sails, so a line of sight passing b = sin(angle) from the
            # Sun crosses (r_out - b) of it on each side of its closest approach. Inside asin(r_in),
            # full depth; beyond, near and far halves both thin out linearly in b.
            b = np.where(ang < math.pi / 2, np.sin(ang), 2.0)
            frac = np.clip((g['r_out'] - b) / (g['r_out'] - g['r_in']), 0, 1)
            return (1 - f * frac) * f * frac * rho * S / math.pi / (1 - f * rho) * np.where(frac > 0, 1.0, 0.0)
        R = math.asin(min(r, 0.999))
        # the swarm spans a range of radii (thermal orbits of sails of different ages), so the
        # limb is a few degrees soft
        edge = np.clip((R + math.radians(2.5) - ang) / math.radians(5.0), 0, 1)
        edge = edge * edge * (3 - 2 * edge)
        return L * edge
    # Far-side cloud (docs/earth.md): sun-facing sails in a thin layer on Earth's orbit, 90-165 and
    # 195-270 deg of heliocentric longitude from Earth and within g['lat'] (30) deg of the ecliptic,
    # covering a fraction tau = f / patch of it, patch = (150/360) sin(lat) of the sphere. A line of sight from Earth meets
    # the 1 AU sphere once more, at P = -sun + 2 cos(angle) d (in AU, Sun at the origin); a Lambertian
    # sail front there in full sunlight has radiance rho S / pi from any angle Earth sees it at, so
    # the glow is tau rho S / pi wherever P lies in the patch. Orbital scatter softens the edges by a
    # couple of degrees.
    pole = np.asarray(g['ecliptic_pole'], dtype=float)
    f, rho = g['f'], g['rho']
    lat_max = g.get('lat', FARSIDE_LAT)
    tau = f / ((180 - 2 * FARSIDE_L3_GAP) / 360 * math.sin(math.radians(lat_max)))
    c = np.clip(cosang, 0.0, 1.0)
    P = -sun[None, :] + 2.0 * c[:, None] * dirs
    b = np.degrees(np.arcsin(np.clip(P @ pole, -1, 1)))
    E = -np.asarray(sun, dtype=float)
    psi = np.degrees(np.arctan2(np.cross(np.broadcast_to(E, P.shape), P) @ pole, P @ E))
    w = FARSIDE_EDGE_DEG

    def smooth(x):
        x = np.clip(x, 0, 1)
        return x * x * (3 - 2 * x)
    inside = (smooth((lat_max + w / 2 - np.abs(b)) / w) * smooth((np.abs(psi) - 90 + w / 2) / w)
              * smooth((180 - FARSIDE_L3_GAP + w / 2 - np.abs(psi)) / w))
    return np.where(cosang > 0, tau * inside * rho * S0 / math.pi, 0.0)


def zodiacal(dirs, sun, pole):
    """Natural zodiacal light, S10 units -> W/m^2/sr (Leinert et al. 1998, coarse)."""
    eps = np.degrees(np.arccos(np.clip(dirs @ sun, -1, 1)))
    beta = np.abs(np.degrees(np.arcsin(np.clip(dirs @ pole, -1, 1))))
    eq = np.interp(eps, [15, 30, 45, 60, 75, 90, 120, 150, 180], [9000, 3000, 1300, 600, 330, 260, 200, 170, 200])
    fall = np.interp(beta, [0, 15, 30, 45, 60, 90], [1, 0.62, 0.40, 0.28, 0.22, 0.2])
    pole_floor = 60
    return np.maximum(eq * fall, pole_floor) * S10


def airglow(dirs, zenith_s10=110):
    """Airglow from a thin layer at 90 km: van Rhijn brightening toward the horizon."""
    z = np.clip(dirs[:, 2], 0, 1)
    sin_zen2 = 1 - z * z
    k = 6371.0 / 6461.0
    vr = 1 / np.sqrt(1 - k * k * sin_zen2)
    return zenith_s10 * S10 * vr


AIRGLOW_COLOUR = np.array([0.78, 1.0, 0.72])           # 557.7 nm green with some 630 nm red, in sum
AIRGLOW_COLOUR = AIRGLOW_COLOUR / (AIRGLOW_COLOUR @ A.LUMA)


def milky_way(dirs, M):
    """assets/milkyway_8k.jpg in the horizon frame; M maps horizon -> equatorial."""
    img = np.asarray(Image.open(os.path.join(ASSETS, 'milkyway_8k.jpg')).convert('RGB'), dtype=np.float32) / 255
    lin = np.where(img <= 0.04045, img / 12.92, ((img + 0.055) / 1.055) ** 2.4)
    h, w, _ = lin.shape
    d = dirs @ M.T
    ra = np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 360
    dec = np.degrees(np.arcsin(np.clip(d[:, 2], -1, 1)))
    u = (0.5 - ra / 360) % 1.0
    x = u * w - 0.5
    y = (90 - dec) / 180 * h - 0.5
    out = np.stack([map_coordinates(lin[..., c], [y, x], order=1, mode='wrap') for c in range(3)], -1)
    return out * 0.126568 * 2.9e-4                        # manifest calibration


def stars(M, limit_v=8.0):
    """Catalogue stars above the horizon: direction, irradiance (W/m^2, luminance), colour."""
    rows = []
    import csv
    with open(os.path.join(ASSETS, 'stars.csv')) as f:
        for row in csv.DictReader(f):
            v = float(row['vmag'])
            if v > limit_v:
                break
            rows.append((float(row['ra_deg']), float(row['dec_deg']), v, float(row['bv'])))
    a = np.array(rows)
    ra, dec = np.radians(a[:, 0]), np.radians(a[:, 1])
    d_eq = np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], 1)
    d_h = d_eq @ M                                         # M is orthonormal: horizon = M^T eq
    E = 2.74e-8 * 10 ** (-0.4 * a[:, 2])
    bv = a[:, 3]
    T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
    keep = d_h[:, 2] > -0.02
    return d_h[keep], E[keep], T[keep]


def planets(M, jd):
    """The naked-eye planets for julian day jd, as point sources like stars."""
    import ephem
    rows = [(np.array(u) @ M, 2.74e-8 * 10 ** (-0.4 * V), ephem.PLANET_K[n]) for n, u, V, _ in ephem.planets(jd)]
    d = np.array([r[0] for r in rows])
    keep = d[:, 2] > -0.02
    return d[keep], np.array([r[1] for r in rows])[keep], np.array([r[2] for r in rows])[keep]


H_AIR = 2300.0                    # mean height of the lines of sight to the terrain, m
AEROSOL = 2.5e-6                  # extra summer valley aerosol (scattering, Mie phase), 1/m


def air_coefficients(h=H_AIR):
    """Scattering (Rayleigh RGB, Mie) and extinction RGB per metre near the ground."""
    sR = A.B_R * math.exp(-h / A.H_R)
    sM = A.B_MS * math.exp(-h / A.H_M) + AEROSOL
    ext = sR + A.B_ME * math.exp(-h / A.H_M) + AEROSOL
    return sR, sM, ext


def inscatter_source(L, w, h, out_w=128, out_h=64, ground_albedo=0.12):
    """Single-scattering source J(v) of near-ground air lit by the whole sky (and the ground):
    J = (sR * int L p_R + sM * int L p_M) / ext. Radiance seen along a path of length d is then
    L_surface T + J (1 - T). In twilight the air near the ground is in Earth's shadow and lit only by
    the sky, so J is far below the bright horizon arch."""
    img = L.reshape(h, w, 3)
    # downsample the sky to 128 x 64 for the integral
    fy, fx = h // 64, w // 128
    small = img[:64 * fy, :128 * fx].reshape(64, fy, 128, fx, 3).mean((1, 3))
    dirs = A.equirect_dirs(128, 64)
    lat = (np.arange(64) + 0.5) / 64 * math.pi - math.pi / 2
    dO = np.repeat((2 * math.pi / 128) * (math.pi / 64) * np.cos(lat), 128)
    Lflat = small.reshape(-1, 3).copy()
    E_down = (Lflat * (np.maximum(dirs[:, 2], 0) * dO)[:, None]).sum(0)
    below = dirs[:, 2] < 0
    Lflat[below] = ground_albedo * E_down / math.pi
    sR, sM, ext = air_coefficients()
    v = A.equirect_dirs(out_w, out_h)
    c = v @ dirs.T                                   # cos of scattering angle
    pR = 3 / (16 * math.pi) * (1 + c * c)
    g = A.G_M
    pM = 3 / (8 * math.pi) * (1 - g * g) * (1 + c * c) / ((2 + g * g) * (1 + g * g - 2 * g * c) ** 1.5)
    WR = pR * dO[None, :]
    WM = pM * dO[None, :]
    J = (sR * (WR @ Lflat) + sM * (WM @ Lflat)) / ext
    return J.reshape(out_h, out_w, 3)


def build(spec, out_prefix):
    W = spec.get('width', 4096)
    H = W // 2
    sun = vec(spec['sun_alt'], spec['sun_az'])
    M = horizon_basis(spec['lat'], spec['lst_deg'])
    eps = math.radians(23.4393)
    pole = M.T @ np.array([0.0, -math.sin(eps), math.cos(eps)])     # ecliptic north pole
    atm = A.Atmosphere()
    Esun = A.sun_irradiance_rgb()
    # 1) scattering, on a coarse map (smooth), then upsampled
    w0, h0 = 512, 256
    d0 = A.equirect_dirs(w0, h0)
    sky_sun, T0 = atm.sky(d0, [(sun, Esun)], h_cam=spec.get('h_cam', 2070.0))
    E_model = A.horizontal_illuminance(sky_sun, w0, h0) @ A.LUMA * LM
    E_ref = twilight_lux(spec['sun_alt'])
    k_sun = E_ref / E_model * spec.get('sun_scale', 1.0) if E_model > 0 else 0.0     # sun_scale: an L1 shade
    sky0 = sky_sun * k_sun
    g = spec.get('glow')
    # closed: the Sun enclosed (docs/closed-swarm.md). Nothing glows; the mirror cap's cold back hides
    # the sky within cap_deg of the Sun (the sphere's limb, closed_cap_deg), its edge softened over
    # about a degree by the cap's radial spread. The zodiacal dust and the planets are unlit.
    closed = bool(g) and g['kind'] == 'closed'
    if closed:
        cap_deg = spec['glow'].get('cap_deg') or closed_cap_deg(spec['glow'].get('d', 1.0))
        g, cap_cos = None, math.cos(math.radians(cap_deg))
    glow_sources = []
    if g:
        if g['kind'] in ('farside', 'mix'):
            g['ecliptic_pole'] = pole.tolist()
        cap = {'shell': 62.0, 'farside': 50.0}.get(g['kind']) or math.degrees(math.asin(min(g.get('r_out', 0.92), 0.999)))
        if g['kind'] in ('uniform', 'sphere'):
            cap = 80.0
        pts, dO = cap_samples(sun, math.radians(cap), 160)
        Lp = glow_radiance(pts, sun, g)
        glow_sources = [(p, GLOW_COLOUR * L * dO) for p, L in zip(pts, Lp) if L > 0]
        sky_glow, _ = atm.sky(d0, glow_sources, h_cam=spec.get('h_cam', 2070.0), steps=40)
        sky0 = sky0 + sky_glow
    moon = spec.get('moon')
    if moon:
        mdir = vec(moon['alt'], moon['az'])
        sky_moon, _ = atm.sky(d0, [(mdir, A.sun_irradiance_rgb(moon['lux'] / LM, np.array([1.0, 0.86, 0.72])))], h_cam=spec.get('h_cam', 2070.0))
        sky0 = sky0 + sky_moon
    up = (H / h0, W / w0, 1)
    sky = zoom(sky0.reshape(h0, w0, 3), up, order=1, mode='nearest')
    T = zoom(T0.reshape(h0, w0, 3), up, order=1, mode='nearest')
    dirs = A.equirect_dirs(W, H)
    T = T.reshape(-1, 3)
    # 2) sources above the atmosphere, seen through it
    direct = np.zeros((W * H, 3))
    if g:
        direct += glow_radiance(dirs, sun, g)[:, None] * GLOW_COLOUR
    if g and g['kind'] == 'sphere':
        # stars, Milky Way and zodiacal light seen through the sphere; the dust beyond it is lit only
        # by the sunlight that escapes (1 - f)
        Tsph = sphere_transmission(dirs, sun, g)
        direct += milky_way(dirs, M) * Tsph[:, None]
        direct += (zodiacal(dirs, sun, pole) * (1 - g['f']) * Tsph)[:, None] * A.SUN_RGB / (A.SUN_RGB @ A.LUMA)
    elif closed:
        open_sky = np.clip((cap_cos - dirs @ sun) / 0.01 + 0.5, 0, 1)            # ~1 deg soft edge
        direct += milky_way(dirs, M) * open_sky[:, None]
    else:
        direct += zodiacal(dirs, sun, pole)[:, None] * A.SUN_RGB / (A.SUN_RGB @ A.LUMA)
        direct += milky_way(dirs, M)
    # airglow is emitted at 90 km: only the lower atmosphere's extinction applies (~ T)
    direct += airglow(dirs)[:, None] * AIRGLOW_COLOUR
    total = sky.reshape(-1, 3) + direct * T
    total[dirs[:, 2] < -0.05] = sky.reshape(-1, 3)[dirs[:, 2] < -0.05]
    np.save(out_prefix + '_sky.npy', total.reshape(H, W, 3).astype(np.float32))
    np.save(out_prefix + '_inscatter.npy', inscatter_source(total, W, H).astype(np.float32))
    np.save(out_prefix + '_trans.npy', T.reshape(H, W, 3)[::4, ::4].astype(np.float32))
    sd, sE, sT = stars(M)
    if g and g['kind'] == 'sphere':
        sE = sE * sphere_transmission(sd, sun, g)
        if 'jd' in spec:                                           # planets: lit by the escaping light
            pd_, pE, pT = planets(M, spec['jd'])
            pE = pE * (1 - g['f']) * sphere_transmission(pd_, sun, g)
            sd, sE, sT = np.concatenate([sd, pd_]), np.concatenate([sE, pE]), np.concatenate([sT, pT])
    elif closed:
        keep = sd @ sun < cap_cos
        sd, sE, sT = sd[keep], sE[keep], sT[keep]
    elif 'jd' in spec:
        pd_, pE, pT = planets(M, spec['jd'])
        sd, sE, sT = np.concatenate([sd, pd_]), np.concatenate([sE, pE]), np.concatenate([sT, pT])
    # star extinction from the transmittance map (luminance channel)
    alt = np.arcsin(np.clip(sd[:, 2], -1, 1))
    tz = np.exp(-0.17 / np.maximum(np.sin(alt) + 0.025 * np.exp(-11 * np.sin(alt)), 1e-3))
    np.save(out_prefix + '_stars.npy', np.column_stack([sd, sE * tz, sT]).astype(np.float64))
    info = {
        'k_sun': k_sun, 'twilight_lux_model': E_model, 'twilight_lux_ref': E_ref,
        'glow_peak_W_m2_sr': float(glow_radiance(sun[None, :], sun, g)[0]) if g and g['kind'] == 'shell' else None,
        'closed_cap_deg': cap_deg if closed else None,
        'earth_sun_au': spec['glow'].get('d') if spec.get('glow') else None,
        'glow_colour': GLOW_COLOUR.tolist(),
        'ground_lux_total': float(A.horizontal_illuminance(total, W, H) @ A.LUMA * LM),
        'ground_lux_sun_sky': E_ref,
        'n_stars': int(len(sd)), 'width': W,
        'air_extinction_per_m': air_coefficients()[2].tolist(),
    }
    with open(out_prefix + '_info.json', 'w') as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))
    return info


if __name__ == '__main__':
    with open(sys.argv[1]) as f:
        spec = json.load(f)
    build(spec, sys.argv[2])
