"""Inside the closed swarm (docs/closed-swarm.md): what a camera a few kilometres sunward of the
innermost sails would record, looking out across them toward the horizon.

A numpy ray caster, because the scene is two planes and a sky.
- Frame: z toward the Sun, the innermost band of sails in the plane z = 0, the camera at height H km.
- The sky (every direction with z > 0, except the Sun): the far side of the swarm, 1.9 AU away,
  where every sail faces the camera with its sunlit front. Its radiance is rho_hw S / pi with
  rho_hw = 0.004, all the hardware's visible reflectance averaged (film 0.0021, the rest the vanes).
  The mirror cap seen from inside reflects that same wall, so it adds nothing. No stars.
- The floor (z < 0): the innermost band's sails, 279 m squares flown as diamonds on a jittered
  lattice covering `cover` of the plane, with their film fronts and the hinge-edge
  glint halo round the antisolar point (design_spec scene_facts.glint). Each front is navy cells
  (albedo 0.0006) with 25 mm hinge strips (0.08) every 1.63 m, which the nearest sails resolve.
  Between them, deeper bands
  at the averaged rho_hw S / pi. Tiles narrower than a pixel blend into the average.
- Vanes: four 87 m^2 aluminium mirrors per sail, tilted 0-40 deg, each throwing the Sun into a beam
  1.3 deg in radius (p = 1.3e-4 for a random viewer). Within d_near every vane is tested and its
  flash splatted as a point; beyond, they are in the average.
- The Sun: a disc at the zenith, radiance S / (pi th_sun^2), out of frame unless the camera looks up.

Usage: python3 render/closed_inside.py out.exr [--h 3 --pitch -12 --lens 14 --res 2400x1600]
"""
import argparse
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glare  # noqa: E402
import farside_sky as FS  # noqa: E402
import sky_map as SM  # noqa: E402

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SUN_RGB = np.array([1.0, 0.8791, 0.8211])
LUMA = np.array([0.2126, 0.7152, 0.0722])
STRIP_PITCH, STRIP_W = 1.63, 0.025                                   # m: hinge strips (design spec)


def norm(c):
    return c / (c @ LUMA)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--r', type=float, default=0.92, help='radius of the innermost band, AU')
    ap.add_argument('--h', type=float, default=3.0, help='camera height above the band, km')
    ap.add_argument('--cover', type=float, default=0.25, help='share of the plane the innermost band covers')
    ap.add_argument('--pitch', type=float, default=-12.0, help='deg below the horizon')
    ap.add_argument('--lens', type=float, default=14.0)
    ap.add_argument('--res', default='2400x1600')
    ap.add_argument('--ss', type=int, default=3, help='supersamples per axis')
    ap.add_argument('--d-near', type=float, default=400.0, help='km within which vanes are drawn one by one')
    ap.add_argument('--seed', type=int, default=11)
    a = ap.parse_args(argv)
    w, h = (int(v) for v in a.res.split('x'))
    with open(os.path.join(REPO, 'docs', 'data', 'design_spec.json')) as fh:
        dsp = json.load(fh)
    gf = dsp['scene_facts']['glint']
    R_glint = dsp['sail']['appearance_front']['glint']['F0']         # glass, no mesh in a closed swarm
    t_out, edge_frac = gf['half_angle_hinge_edges_deg'], gf['hinge_edge_area_fraction']
    vane_half = math.degrees(math.acos(1 - 2 * gf['p_random_direction_per_vane']))
    S = 1361.0 / a.r ** 2
    th_sun = math.radians(0.2666) / a.r
    L_sun = S / (math.pi * th_sun ** 2)
    rho_hw = 0.004
    L_avg = rho_hw * S / math.pi
    side = 279.01e-3                                                 # km
    pitch_km = side / math.sqrt(a.cover)
    rng = np.random.default_rng(a.seed)

    def cell(ci, cj):
        """Centre (km) and clock angle of the sail in lattice cell (ci, cj): jitter from a hash."""
        k = ((ci * 73856093) ^ (cj * 19349663) ^ a.seed) & 0x0FFFFFFF
        u1, u2, u3 = ((k * 2654435761) % 1000003) / 1000003.0, ((k * 40503) % 999983) / 999983.0, ((k * 97) % 99991) / 99991.0
        j = max(0.0, 1 - 2 * side / math.sqrt(2) / pitch_km)          # jitter that keeps each diamond in its cell
        return (ci + 0.5 + (u1 - 0.5) * j) * pitch_km, (cj + 0.5 + (u2 - 0.5) * j) * pitch_km, u3 * math.pi / 2

    # camera: looking along +x, pitched down; image rows top to bottom
    f_px = a.lens / 36.0 * w
    p = math.radians(a.pitch)
    fwd = np.array([math.cos(p), 0.0, math.sin(p)])
    right = np.array([0.0, -1.0, 0.0])
    up = np.cross(right, fwd)
    img = np.zeros((h, w, 3))
    # film: navy cells (albedo ~0.0006, violet-blue scatter) and lighter hinge strips (0.08 over 1.5 %
    # of the area), mixed below a pixel; the average of all hardware: sky_map's glow colour
    c_cell, c_strip = norm(SUN_RGB * np.array([0.40, 0.45, 1.0])), norm(SUN_RGB)
    L_cell, L_strip = 0.0006 * S / math.pi, 0.08 * S / math.pi
    f_strip = STRIP_W / STRIP_PITCH
    L_film = (1 - f_strip) * L_cell + f_strip * L_strip
    c_film = ((1 - f_strip) * L_cell * c_cell + f_strip * L_strip * c_strip) / L_film
    c_avg = SM.GLOW_COLOUR
    c_glint = norm(np.array([1.0, 0.85, 1.05]) * SUN_RGB)            # magenta-blue AR residual
    offs = (np.arange(a.ss) + 0.5) / a.ss - 0.5
    for r0 in range(0, h, 100):
        rows = np.arange(r0, min(h, r0 + 100))
        acc = np.zeros((len(rows), w, 3))
        for oy in offs:
            for ox in offs:
                X, Y = np.meshgrid(np.arange(w) + 0.5 + ox, rows + 0.5 + oy)
                d = fwd[None, None] * f_px + right[None, None] * (X - w / 2)[..., None] - up[None, None] * (Y - h / 2)[..., None]
                d /= np.linalg.norm(d, axis=-1, keepdims=True)
                L = np.zeros(d.shape)
                sky = d[..., 2] > 0
                L[sky] = L_avg * c_avg
                sun = d[..., 2] > math.cos(th_sun)
                L[sun] = L_sun * norm(SUN_RGB)
                fl = ~sky
                dz = -d[..., 2][fl]
                t = a.h / dz
                P = d[fl] * t[:, None]
                # pixel footprint on the floor (km): beyond a tile's size, use the average
                foot = t / f_px / np.maximum(dz, 1e-6) ** 0.5
                ci, cj = np.floor(P[:, 0] / pitch_km).astype(np.int64), np.floor(P[:, 1] / pitch_km).astype(np.int64)
                cx, cy, ang = cell(ci, cj)
                lx, ly = P[:, 0] - cx, P[:, 1] - cy
                sx = lx * np.cos(ang) + ly * np.sin(ang)
                qx, qy = np.abs(sx), np.abs(-lx * np.sin(ang) + ly * np.cos(ang))
                inside = (qx < side / 2) & (qy < side / 2)
                # hinge strips, 25 mm every 1.63 m, resolved on the nearest sails
                strip = ((sx + side / 2) * 1000.0) % STRIP_PITCH < STRIP_W
                fine = np.clip((foot * 1000.0 - 0.3) / 0.5, 0, 1)[:, None]      # footprint (m) vs the pitch
                # the hinge-edge glint halo round the antisolar point (straight down)
                a_nadir = np.degrees(np.arccos(np.clip(dz, -1, 1)))
                gi = FS.glint_intensity(a_nadir, t_out, edge_frac, th_sun=th_sun)
                L_cells = np.where(strip[:, None], L_strip * c_strip[None], L_cell * c_cell[None])
                L_tile = (1 - fine) * L_cells + fine * (L_film * c_film[None]) + (R_glint * S * gi)[:, None] * c_glint[None]
                L_deep = L_avg * c_avg[None] + (R_glint * S * gi)[:, None] * c_glint[None]
                blend = np.clip((foot - side / 3) / side, 0, 1)[:, None]
                sharp = np.where(inside[:, None], L_tile, L_deep)
                mean = a.cover * L_tile + (1 - a.cover) * L_deep
                L[fl] = (1 - blend) * sharp + blend * mean
                acc += L
        img[rows] = acc / a.ss ** 2
        print('rows', rows[-1] + 1, '/', h, flush=True)

    # vanes within d_near: every tile's four corner vanes, flash if the camera is in its beam
    nmax = int(a.d_near / pitch_km)
    ii, jj = np.meshgrid(np.arange(-nmax, nmax + 1), np.arange(-nmax, nmax + 1), indexing='ij')
    ii, jj = ii.ravel(), jj.ravel()
    cx, cy, ang = cell(ii, jj)
    beam = 2 * math.pi * (1 - math.cos(math.radians(vane_half)))
    A_vane = 87e-6                                                   # km^2
    n_flash, img_pts = 0, np.zeros_like(img)
    half_d = side / math.sqrt(2)
    for q in range(4):
        th = ang + q * math.pi / 2
        vx, vy = cx + half_d * np.cos(th), cy + half_d * np.sin(th)
        tilt = np.arccos(1 - rng.random(len(vx)) * (1 - math.cos(math.radians(40))))
        az = rng.random(len(vx)) * 2 * math.pi
        nv = np.stack([np.sin(tilt) * np.cos(az), np.sin(tilt) * np.sin(az), np.cos(tilt)], -1)
        din = np.array([0.0, 0.0, -1.0])                             # sunlight travels away from the Sun
        refl = din[None] - 2 * (nv @ din)[:, None] * nv
        to_cam = np.stack([-vx, -vy, np.full_like(vx, a.h)], -1)
        dist = np.linalg.norm(to_cam, axis=1)
        to_cam /= dist[:, None]
        va = np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', refl, to_cam), -1, 1)))
        hit = (va < vane_half) & (dist < a.d_near)
        if not hit.any():
            continue
        E = 0.9 * S * A_vane * 1e6 * np.cos(tilt[hit]) / beam / (dist[hit] * 1e3) ** 2   # W/m^2 at the camera
        dirs = -to_cam[hit]
        xc, yc, zc = dirs @ right, dirs @ up, dirs @ fwd
        ok = zc > 0
        px = w / 2 + f_px * xc[ok] / zc[ok]
        py = h / 2 - f_px * yc[ok] / zc[ok]
        val = E[ok] * f_px ** 2                                        # irradiance over one pixel's solid angle
        x0, y0 = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - x0, py - y0
        for dx, dy, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            xi, yi = x0 + dx, y0 + dy
            m = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
            np.add.at(img_pts, (yi[m], xi[m]), (val[m] * wt[m])[:, None] * norm(SUN_RGB)[None])
        n_flash += int(ok.sum())
    img += img_pts
    glare.write(a.out, img)
    info = {'S_W_m2': S, 'sky_cd_m2': L_avg * 93, 'film_cd_m2': L_film * 93, 'tile_pitch_km': pitch_km,
            'vane_flashes_in_frame': n_flash, 'vane_half_deg': vane_half,
            'exposure_for_sky': math.log2(0.18 / L_avg)}
    print(json.dumps(info))
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[1:])
