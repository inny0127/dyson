"""The symmetric sphere from outside: a camera 3 AU from the Sun, 25 deg above the plane of the
planets, looking at the Sun, in visible light (scene-linear EXR) and through a thermal camera
(8-14 um, false colour PNG). docs/closed-swarm.md; a ray caster, because the scene is two spheres.

- Sails: sun-facing plates filling r_in..r_out AU (0.92-0.98) at coverage f, as a random layer of
  radial optical depth tau = -ln(1 - f). For plates facing the Sun the optical depth of a path is
  tau times the share of the layer's depth it crosses, whatever its slant.
- Visible: the near side shows the camera the plates' backs, unlit and black; through its gaps the
  far side shows their sunlit fronts, rho S(r) / pi (rho 0.004, all hardware), and the Sun, and
  behind everything the stars and the Milky Way.
- Thermal: the backs radiate at the film temperature T(f) (eps 0.9); the fronts, dark in the
  infrared while the sphere is open (eps 0.1), are seen through the gaps. The patch in front of Earth
  (23 deg round the Sun-Earth line) is flown by mirror sails whose backs are cold (~170 K at ε 0.03; drawn as a 176 K blackbody,
  black on the 150-450 K scale either way).
- Earth: a point at its true brightness (lit through its window), 70 deg of longitude from the
  camera.
- The visible frame is taken through a coronagraph: a disc 1.6 deg in radius over the Sun, as
  solar telescopes in space use, or the Sun's glare would hide everything else.

Usage: python3 render/sphere_space.py out_prefix --f 0.5 --T 402 [--res 2400x1600 --lens 28]
"""
import argparse
import csv
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glare  # noqa: E402
import sky_map as SM  # noqa: E402

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
AU = 1.495978707e11
R_SUN = 6.957e8 / AU
S0 = 1361.0
H_, C_, K_ = 6.62607015e-34, 299792458.0, 1.380649e-23
INFERNO = [(0.0015, 0.0005, 0.0139), (0.0874, 0.0447, 0.2245), (0.2582, 0.0386, 0.4065),
           (0.4162, 0.0902, 0.4329), (0.5783, 0.148, 0.4044), (0.7357, 0.2159, 0.3302),
           (0.8650, 0.3168, 0.2261), (0.9540, 0.4692, 0.0992), (0.9876, 0.6453, 0.0399),
           (0.9640, 0.8434, 0.2730), (0.9884, 0.9984, 0.6449)]


def band(T):
    """8-14 um blackbody radiance (W/m^2/sr) for an array of temperatures."""
    T = np.atleast_1d(np.asarray(T, float))
    lam = np.linspace(8e-6, 14e-6, 121)[:, None]
    B = 2 * H_ * C_ ** 2 / lam ** 5 / np.expm1(np.minimum(H_ * C_ / (lam * K_ * np.maximum(T, 1.0)), 700))
    return np.trapezoid(B, lam[:, 0], axis=0) if hasattr(np, 'trapezoid') else np.trapz(B, lam[:, 0], axis=0)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--f', type=float, required=True)
    ap.add_argument('--T', type=float, required=True, help='film temperature at this coverage, K (closedFilmT)')
    ap.add_argument('--dist', type=float, default=3.0)
    ap.add_argument('--elev', type=float, default=25.0)
    ap.add_argument('--earth-lon', type=float, default=70.0)
    ap.add_argument('--lens', type=float, default=28.0)
    ap.add_argument('--res', default='2400x1600')
    ap.add_argument('--rho', type=float, default=0.004)
    ap.add_argument('--r-in', type=float, default=0.92)
    ap.add_argument('--r-out', type=float, default=0.98)
    ap.add_argument('--occulter', type=float, default=1.6, help='coronagraph: disc over the Sun, deg (0: none)')
    a = ap.parse_args(argv)
    w, h = (int(v) for v in a.res.split('x'))
    # closed (f = 1): a tiling with no gaps at any depth, so no grazing line of sight gets through
    f = min(a.f, 1 - 1e-12)
    tau = 1e4 if a.f >= 1 else -math.log(1 - f)
    be = math.radians(a.elev)
    C = a.dist * np.array([math.cos(be), 0.0, math.sin(be)])            # ecliptic frame, Sun at origin
    fwd = -C / np.linalg.norm(C)
    right = np.cross(fwd, [0.0, 0.0, 1.0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    f_px = a.lens / 36.0 * w
    X, Y = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    D = fwd[None, None] * f_px + right[None, None] * (X - w / 2)[..., None] - up[None, None] * (Y - h / 2)[..., None]
    D = (D / np.linalg.norm(D, axis=-1, keepdims=True)).reshape(-1, 3)
    E = np.array([math.cos(math.radians(a.earth_lon)), math.sin(math.radians(a.earth_lon)), 0.0])

    cd = D @ C
    bb = np.sqrt(np.maximum(0.0, C @ C - cd ** 2))                        # closest approach to the Sun, AU
    tmid = -cd
    dr = a.r_out - a.r_in
    frac = np.clip((a.r_out - bb) / dr, 0, 1)                             # share of the layer crossed per side
    tn, tf_ = tau * frac, tau * frac
    Tn, Tf = np.exp(-tn), np.exp(-tf_)
    hit_out = bb < a.r_out
    # where the near and far crossings are (mid-layer), for the cold patch and the far wall's sunlight
    rm = np.clip(0.5 * (a.r_in + a.r_out), bb, None)
    half = np.sqrt(np.maximum(rm ** 2 - bb ** 2, 0))
    Pn = C[None] + D * (tmid - half)[:, None]
    Pn /= np.maximum(np.linalg.norm(Pn, axis=1, keepdims=True), 1e-9)
    in_patch = (Pn @ E) > math.cos(math.radians(23.07))
    sun_hit = bb < R_SUN

    # ---- visible (W/m^2/sr, luminance-normalised colour)
    S = S0 / (0.5 * (a.r_in + a.r_out)) ** 2
    L_sun = S0 / (math.pi * (R_SUN / 1.0) ** 2)                           # solar disc radiance
    glow = np.where(hit_out & ~sun_hit, (1 - Tf) * a.rho * S / math.pi * Tn, 0.0) if a.f < 1 else np.zeros(len(D))
    vis = glow[:, None] * SM.GLOW_COLOUR[None]
    sunc = np.array([1.0, 0.8791, 0.8211]); sunc /= sunc @ np.array([0.2126, 0.7152, 0.0722])
    vis[sun_hit] += (L_sun * Tn[sun_hit])[:, None] * sunc[None]
    behind = np.where(hit_out, Tn * Tf, 1.0) * ~sun_hit
    eps = math.radians(23.4393)
    Rx = np.array([[1, 0, 0], [0, math.cos(eps), -math.sin(eps)], [0, math.sin(eps), math.cos(eps)]])
    D_eq = D @ Rx.T
    vis += SM.milky_way(D_eq, np.eye(3)) * behind[:, None]
    # stars
    rows = []
    with open(os.path.join(ASSETS, 'stars.csv')) as fh:
        for row in csv.DictReader(fh):
            if float(row['vmag']) > 8:
                break
            rows.append((float(row['ra_deg']), float(row['dec_deg']), float(row['vmag']), float(row['bv'])))
    st = np.array(rows)
    ra, dec = np.radians(st[:, 0]), np.radians(st[:, 1])
    d_eq = np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], 1)
    d_ec = d_eq @ Rx                                                      # back to ecliptic
    Est = 2.74e-8 * 10 ** (-0.4 * st[:, 2])
    bv = st[:, 3]
    Tk = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
    img = vis.reshape(h, w, 3)

    def splat(dirs, Ein, cols):
        xc, yc, zc = dirs @ right, dirs @ up, dirs @ fwd
        ok = zc > 0
        px = w / 2 + f_px * xc[ok] / zc[ok]
        py = h / 2 - f_px * yc[ok] / zc[ok]
        val = (Ein[ok] * f_px ** 2)[:, None] * cols[ok]
        x0, y0 = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - x0, py - y0
        for dx, dy, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            xi, yi = x0 + dx, y0 + dy
            m = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
            np.add.at(img, (yi[m], xi[m]), val[m] * wt[m][:, None])
    # starlight through the sphere
    sd_c = d_ec @ C
    sb = np.sqrt(np.maximum(0, C @ C - sd_c ** 2))
    sfr = np.clip((a.r_out - sb) / dr, 0, 1)
    sT = np.where((sb < a.r_out) & (sd_c < 0), np.exp(-2 * tau * sfr), 1.0) * (sb > R_SUN * 1.5)
    import leo_view as LV
    splat(d_ec, Est * sT, LV.blackbody_rgb(Tk))
    # Earth: a point lit through its window, phase from its position
    vE = E - C
    dE = vE / np.linalg.norm(vE)
    alpha = math.acos(np.clip((-E) @ (-dE), -1, 1))                       # Sun-Earth-camera angle
    lam_ph = (math.sin(alpha) + (math.pi - alpha) * math.cos(alpha)) / math.pi
    E_earth = S0 * 0.30 * 2 / 3 * (6.371e6 / (np.linalg.norm(vE) * AU)) ** 2 * lam_ph
    splat(dE[None], np.array([E_earth]), np.array([[0.85, 0.95, 1.25]]))
    # a coronagraph's occulting disc over the Sun, as solar telescopes fly them (applied before glare)
    if a.occulter > 0:
        img.reshape(-1, 3)[(D @ (-C / np.linalg.norm(C))) > math.cos(math.radians(a.occulter))] = 0.0
    glare.write(a.out + '_vis.exr', img)

    # ---- thermal (8-14 um), brightness temperature in false colour
    B_back, B_front = band(a.T)[0], band(a.T)[0]
    B_cold = band(176.0)[0]
    back = np.where(in_patch, 0.9 * B_cold, 0.9 * B_back)
    ir = np.where(hit_out, back * (1 - Tn) + Tn * np.where(sun_hit, band(5772.0)[0], 0.1 * B_front * (1 - Tf)), 0.0)
    ir = np.where(~hit_out & sun_hit, band(5772.0)[0], ir)
    tgrid = np.linspace(30, 6000, 4000)
    bgrid = band(tgrid)
    Tb = np.interp(ir, bgrid, tgrid, left=0.0)
    lo, hi = 150.0, 450.0
    t = np.clip((Tb - lo) / (hi - lo), 0, 1) * (len(INFERNO) - 1)
    i = np.minimum(len(INFERNO) - 2, t.astype(int))
    fr = (t - i)[:, None]
    pal = np.array(INFERNO)
    rgb = pal[i] * (1 - fr) + pal[i + 1] * fr
    rgb[Tb < lo * 0.5] = pal[0]
    Image.fromarray((np.clip(rgb.reshape(h, w, 3), 0, 1) * 255 + 0.5).astype(np.uint8)).save(a.out + '_ir.png')
    info = {'f': a.f, 'tau': tau, 'T_film': a.T, 'sphere_radius_deg': math.degrees(math.asin(a.r_out / a.dist)),
            'glow_W_m2_sr': float(a.rho * S / math.pi * f * (1 - f)), 'sun_through': float(1 - f),
            'earth_mag': -26.74 - 2.5 * math.log10(E_earth / S0),
            'exposure_for_glow': math.log2(0.18 / max(a.rho * S / math.pi * f * (1 - f), 1e-12))}
    print(json.dumps(info))


if __name__ == '__main__':
    main(sys.argv[1:])
