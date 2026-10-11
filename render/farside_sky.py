"""The sky from inside the far-side cloud: every sail beyond `dmax` integrated, per direction.

The cloud (docs/earth.md): sun-facing sails in a layer on Earth's orbit, heliocentric radius
1 +- dr/2 AU, 90-165 and 195-270 deg of longitude from Earth, within `lat` deg of the ecliptic,
covering a fraction tau of that patch as seen from the Sun. The camera sits mid-layer at `psi`
deg from Earth on the ecliptic.

Frame (AU, Sun at the origin): +X outward through the camera (away from the Sun), +Y prograde
along the orbit (toward L3 for psi < 180), +Z ecliptic north. The camera is at (1, 0, 0).

Along each ray the layer is a uniform medium of sun-facing plates: coverage per unit radial
depth kappa = tau / dr. A plate at P is seen face-on by cos = |d . r_hat|; it shows the camera
its sunlit front when d . r_hat > 0 (the camera is sunward of it), its dark back otherwise.
  - emission: rho S(r) / pi * kappa * max(0, d . r_hat) ds, times the sunlight that reaches P
    through the plates inward of it, exp(-kappa (r - r_in));
  - extinction: kappa |d . r_hat| ds, for fronts and backs alike.
Rays that dip below the camera's tangent plane cross the inner half of the layer (backs), the
empty inside of Earth's orbit, and meet the layer again from inside, where every plate shows its
front: the rest of the cloud, as Earth sees it but from its own rim.

Usage (preview): python3 render/farside_sky.py out.exr [--tau 0.182] [--w 2048]
"""
import argparse
import json
import math

import numpy as np

S0 = 1361.0
AU_KM = 1.495978707e8
FAR_GAP = 15.0                   # deg either side of L3 kept empty
EDGE_DEG = 3.0                   # orbital scatter softens the patch edges


TH_SUN_1AU = math.radians(0.2666)            # the Sun's angular radius at 1 AU

# Layer geometry. 'farside': on Earth's orbit, the far-side patch. 'uniform' (docs/full-swarm.md):
# radius r AU, all round the Sun except `cone` deg round the Sun-Earth line and FAR_GAP round L3.
# Inside these functions lengths are in layer radii; callers pass AU and km as before.
GEOM = {'kind': 'farside', 'r': 1.0, 'cone': 23.07}


def set_geometry(kind='farside', r=1.0, cone=23.07):
    GEOM.update(kind=kind, r=r, cone=cone)


def glint_intensity(ang_deg, t_out_deg, edge_frac, th_sun=TH_SUN_1AU):
    """Glint of one sun-facing sail toward a direction ang_deg from its mirror direction, as
    intensity per unit (R * S * projected area), sr^-1 (design spec, scene_facts.glint). The flat
    interior (slope 0.016 deg) mirrors the Sun's disc: radiance R L_sun = R S / (pi th_sun^2), seen
    only within th_sun. The curled hinge-edge zones (edge_frac of the area) spread their share out
    to t_out as 1/alpha^2. Both conserve the reflected power R S A."""
    a = np.radians(np.asarray(ang_deg, dtype=float))
    core = np.where(a < th_sun, (1 - edge_frac) / (math.pi * th_sun ** 2), 0.0)
    # the edges' maximum slope varies panel to panel (0.3-1 of the 7.7 deg curl, a tail to 1.3 for
    # lamination scatter), which softens the halo's rim; each panel's share conserves its power
    us = np.linspace(0.3, 1.3, 41)
    wts = np.where(us <= 1.0, 1.0, (1.3 - us) / 0.3)
    wts = wts / wts.sum()
    halo = np.zeros_like(a)
    for u, wt in zip(us, wts):
        tu = np.maximum(math.radians(t_out_deg) * u, th_sun * 1.2)
        halo += wt * np.where((a >= th_sun) & (a < tu),
                              edge_frac / (2 * math.pi * np.log(tu / th_sun) * np.maximum(a, th_sun) ** 2), 0.0)
    return core + halo


def smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def patch_mask(P, psi_cam, lat_max):
    """Soft membership of points P (AU, camera frame) in the far-side patch."""
    w = EDGE_DEG
    if GEOM['kind'] == 'uniform':
        E = np.array([math.cos(math.radians(-psi_cam)), math.sin(math.radians(-psi_cam)), 0.0])
        ang = np.degrees(np.arccos(np.clip((P @ E) / np.linalg.norm(P, axis=-1), -1, 1)))
        return smooth((ang - GEOM['cone'] + w / 2) / w) * smooth((180.0 - FAR_GAP - ang + w / 2) / w)
    lam = np.degrees(np.arctan2(P[..., 1], P[..., 0]))           # longitude from the camera
    psi = (lam + psi_cam) % 360.0                                  # longitude from Earth
    r = np.linalg.norm(P, axis=-1)
    b = np.degrees(np.arcsin(np.clip(P[..., 2] / r, -1, 1)))
    w = EDGE_DEG
    d_from_l3 = np.abs(psi - 180.0)                                # 0 at L3, 90 at the patch's outer ends
    lon = smooth((90.0 + w / 2 - d_from_l3) / w) * smooth((d_from_l3 - FAR_GAP + w / 2) / w)
    return lon * smooth((lat_max + w / 2 - np.abs(b)) / w)


def directions(w, h):
    """Equirectangular directions, Blender's environment convention in this frame: u = 0.5 looks
    along +X, u increases toward -Y... (lon = (0.5 - u) * 2 pi measured from +X toward +Y)."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    lon = (0.5 - u) * 2 * math.pi
    lat = (v - 0.5) * math.pi
    LON, LAT = np.meshgrid(lon, lat)
    return np.stack([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)], -1)


def far_glow(D, tau, rho, dr, psi_cam, lat_max, dmax_km, n_seg=48):
    """Radiance (W/m^2/sr) of everything beyond dmax along unit directions D (..., 3)."""
    shp = D.shape[:-1]
    d = D.reshape(-1, 3)
    C = np.array([1.0, 0.0, 0.0])
    R = GEOM['r']
    dr = dr / R
    h = dr / 2
    r_in, r_out = 1 - h, 1 + h
    kappa = tau / dr
    cd = d @ C                                                    # = d . r_hat at the camera
    s_out = -cd + np.sqrt(cd * cd + 2 * h + h * h)                 # exit through the outer sphere
    disc_in = cd * cd - 2 * h + h * h
    hits_in = (cd < 0) & (disc_in > 0)
    sq = np.sqrt(np.maximum(disc_in, 0))
    s_in1 = np.where(hits_in, -cd - sq, s_out)                     # leave the layer inward
    s_in2 = np.where(hits_in, -cd + sq, s_out)                     # re-enter it on the far side
    dmax = dmax_km / (AU_KM * R)
    L = np.zeros(len(d))
    T = np.ones(len(d))
    for a0, a1 in ((np.full(len(d), dmax), s_in1), (s_in2, s_out)):
        a0 = np.minimum(a0, a1)
        ds = (a1 - a0) / n_seg
        for k in range(n_seg):
            s = a0 + (k + 0.5) * ds
            P = C + d * s[:, None]
            r = np.linalg.norm(P, axis=1)
            rh = P / r[:, None]
            c = np.einsum('ij,ij->i', d, rh)
            inside = (r >= r_in) & (r <= r_out)
            m = patch_mask(P, psi_cam, lat_max) * inside
            sun = np.exp(-kappa * np.clip(r - r_in, 0, dr))
            dtau = kappa * np.abs(c) * ds * m
            L += T * rho * S0 / (r * R) ** 2 / math.pi * kappa * np.maximum(c, 0) * ds * m * sun * np.exp(-dtau / 2)
            T *= np.exp(-dtau)
    return L.reshape(shp), T.reshape(shp)


def column_out(tau, dr, dmax_km, n=400):
    """Glint-weighted column of plates straight out (+X) beyond dmax: each plate's glint reaches the
    camera through the backs between, and is lit through the fronts inward of it."""
    R = GEOM['r']
    dr = dr / R
    h = dr / 2
    kappa = tau / dr
    dm = dmax_km / (AU_KM * R)
    s = dm + (np.arange(n) + 0.5) / n * (h - dm)
    ds = (h - dm) / n
    r = 1 + s
    return float(np.sum(kappa * ds * np.exp(-kappa * (r - (1 - h))) * np.exp(-kappa * s) / r ** 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--tau', type=float, default=0.0379 / (150 / 360 * 0.5))
    ap.add_argument('--rho', type=float, default=0.004)
    ap.add_argument('--dr', type=float, default=0.004, help='layer thickness, AU')
    ap.add_argument('--psi', type=float, default=120.0, help="camera's longitude from Earth, deg")
    ap.add_argument('--lat', type=float, default=30.0)
    ap.add_argument('--dmax', type=float, default=3000.0, help='km; nearer sails are drawn one by one')
    ap.add_argument('--w', type=int, default=2048)
    a = ap.parse_args()
    D = directions(a.w, a.w // 2)
    L, T = far_glow(D, a.tau, a.rho, a.dr, a.psi, a.lat, a.dmax)
    out = {'tau': a.tau, 'L_max': float(L.max()), 'L_out_axis': float(L[a.w // 4, a.w // 2]),
           'cd_m2_max': float(L.max() * 93), 'column_out': column_out(a.tau, a.dr, a.dmax)}
    print(json.dumps(out))
    np.save(a.out, L.astype(np.float32))
    # preview: log-scaled panorama, +X (away from the Sun) in the middle
    from PIL import Image
    v = np.log10(np.maximum(L, 1e-6))
    v = np.clip((v + 4) / 4, 0, 1)
    Image.fromarray((v[::-1] * 255).astype(np.uint8)).save(a.out.replace('.npy', '') + '_preview.png')


if __name__ == '__main__':
    main()
