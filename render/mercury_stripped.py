"""Mercury when the swarm reaches Earth's limit (~2128): the planet is the quarry.

The model's numbers (src/model/hybrid.js atYear, central case): by 2128 industry has removed 0.145 %
of Mercury, a layer 2.1 km thick if it came evenly off the whole planet. At the heat wall it
digs 2.3e12 kg/s, 0.93 m a day planet-wide. It exports 9.7e11 kg/s through ~1e8 mass-driver
tracks of 10 t/s, one per 0.77 km^2. It sheds 4.6e18 W of heat. Radiators lying flat at 1,500 K (the top of the
model's 1,000-1,500 K: the hotter, the smaller) emit 258 kW/m^2, so they cover a quarter of the
planet.

The scene:
- Excavation: merged open pits 1.6-3.6 km deep, elliptical and irregular, with remnant mesas of
  the old cratered ground between them. Pit count is tuned so the mean depth over the whole view
  matches the model's 2.1 km.
- Walls: 33 deg overall, about Bingham Canyon's. 3.6 km on Mercury loads rock like 1.4 km on
  Earth. Catch berms every 200 m: cohesion-limited wall height scales as 1/g, so Earth's
  150-200 m between ramps becomes ~400-500 m.
- Floors: radiator fields in blocks between track bundles. Each bundle carries 40 tracks, 1 km
  apart, 31.3 km long and straight, so each rises d^2/2R = 200 m off the curved floor at its muzzle.
- Processing halls.
- Shading:
  - Mesas: weathered regolith, Lambert albedo ~0.08 (MESSENGER radiance factor 0.071 at
    i = 30 deg).
  - Cut faces: fresh rock, brighter (immature material is brighter).
  - Deep crust: darker and less red (low-reflectance material).
- Light: the Sun at 0.387 AU, 10 deg up, raking from the right. Black sky. Radiators glow at
  their blackbody luminance, CIE-weighted, in the same units as sunlight.

Usage: blender -b --python render/mercury_stripped.py -- out.exr [--res 2400x1004] [--samples 128]
"""
import argparse
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
from earth_sky import new_mat  # noqa: E402
from mercury_ground import R_M  # noqa: E402
from meshkit import Batch  # noqa: E402

BENCH = 200.0             # m between catch berms
BERM = 0.42               # fraction of each step that is flat berm
SLOPE = math.radians(33)  # overall wall angle
D_MAX = 3600.0            # m, deepest floors
T_RAD = 1500.0            # K, radiator fields (top of the model's 1,000-1,500 K: least area)
EPS_RAD = 0.9
BUNDLE = 1000.0           # m between track bundles
BUNDLE_W = 120.0          # m, 40 tracks side by side
L_TRACK = 31270.0         # m, 7.83 km/s at 100 g (mass_driver.py)
LUMENS_PER_W = 93.0       # sunlight, the repo's radiometric convention


def blackbody_luminance(T, eps):
    """cd/m^2 of a grey body: 683 * integral of eps B_lambda(T) ybar(lambda) (CIE 1931, Wyman 2013 fit)."""
    h, c, k = 6.62607015e-34, 299792458.0, 1.380649e-23
    total = 0.0
    for nm in range(360, 831):
        lam = nm * 1e-9
        B = 2 * h * c * c / lam ** 5 / math.expm1(h * c / (lam * k * T))
        s1 = 46.9 if nm < 568.8 else 40.5
        s2 = 16.3 if nm < 530.9 else 31.1
        ybar = 0.821 * math.exp(-0.5 * ((nm - 568.8) / s1) ** 2) + 0.286 * math.exp(-0.5 * ((nm - 530.9) / s2) ** 2)
        total += B * ybar * 1e-9
    return 683.0 * eps * total


def make_pits(rng, n, y_max=420e3, spread=0.9, margin=40e3, keep_clear=(0.0, 0.0), hero=None):
    """Pits uniform over the view's wedge: centre, semi-axes, rotation, floor depth, rim wobble.
    The camera's own ground (keep_clear) stays unmined; `hero` adds one pit by hand."""
    pits = []
    if hero:
        pits.append(dict({'ph': [0.4, 2.1, 5.0]}, **hero))
    while len(pits) < n:
        cy = y_max * math.sqrt(rng.random())
        cx = (2 * rng.random() - 1) * (spread * cy + margin)
        R = rng.uniform(5e3, 30e3)
        asp = rng.uniform(1.0, 1.6)
        p = dict(cx=cx, cy=cy, a=R * math.sqrt(asp), b=R / math.sqrt(asp), rot=rng.uniform(0, math.pi),
                 dm=rng.uniform(1600.0, D_MAX), ph=[rng.uniform(0, 2 * math.pi) for _ in range(3)])
        if math.hypot(cx - keep_clear[0], cy - keep_clear[1]) < p['a'] * 1.15 + 3000.0:
            continue
        if hero and math.hypot(cx - hero['cx'], cy - hero['cy']) < hero['a'] * 0.9:
            continue
        pits.append(p)
    return pits


def depth_at(X, Y, pits):
    """Excavation depth (m) and floor flag: the union of the pits, each a cone of the overall wall
    slope cut off at its floor depth."""
    D = np.zeros_like(X)
    F = np.zeros(X.shape, bool)
    DM = np.zeros_like(X)
    for p in pits:
        Rb = 1.25 * p['a']
        sel = (np.abs(X - p['cx']) < Rb) & (np.abs(Y - p['cy']) < Rb)
        if not sel.any():
            continue
        dx, dy = X[sel] - p['cx'], Y[sel] - p['cy']
        c, s = math.cos(p['rot']), math.sin(p['rot'])
        u, v = c * dx + s * dy, -s * dx + c * dy
        th = np.arctan2(v, u)
        rho = np.hypot(u / p['a'], v / p['b'])
        wob = 1 + 0.10 * np.sin(3 * th + p['ph'][0]) + 0.06 * np.sin(5 * th + p['ph'][1]) + 0.035 * np.sin(9 * th + p['ph'][2])
        d = np.clip((wob - rho) * math.sqrt(p['a'] * p['b']) * math.tan(SLOPE), 0, p['dm'])
        cur = D[sel]
        win = d > cur
        D[sel] = np.where(win, d, cur)
        F[sel] = np.where(win, d >= p['dm'] - 0.5, F[sel])
        DM[sel] = np.where(win, p['dm'], DM[sel])
    return D, F, DM


def vnoise(X, Y, cell, seed):
    """Smooth value noise in [-1, 1] on a square lattice of `cell` metres."""
    x, y = X / cell, Y / cell
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)

    def h(a, b):
        v = np.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453
        return 2 * (v - np.floor(v)) - 1
    return (h(ix, iy) * (1 - fx) * (1 - fy) + h(ix + 1, iy) * fx * (1 - fy)
            + h(ix, iy + 1) * (1 - fx) * fy + h(ix + 1, iy + 1) * fx * fy)


def wall_noise(X, Y):
    """Depth offset (m) that makes bench crests and toes wander as blasting leaves them."""
    return 30.0 * vnoise(X, Y, 650.0, 1) + 12.0 * vnoise(X, Y, 170.0, 2)


def _step(f, berm, sharp):
    """Height fraction across one step: flat berm, then a face (smoothstep blended toward a
    straight ramp where the grid cannot resolve it; sharp in [0, 1])."""
    u = np.clip((f - berm) / (1 - berm), 0, 1)
    stepped = u * u * (3 - 2 * u)
    return sharp * stepped + (1 - sharp) * f


def terrace(D, dr):
    """Walls: 200 m segments, each a wide catch berm then a face of four 50 m benches.

    dr is the local grid spacing (m). Geometry the grid cannot resolve becomes a straight slope;
    the shader carries those benches as shading instead."""
    t = D / BENCH
    k = np.floor(t)
    f = t - k
    macro = np.clip((120.0 - dr) / 60.0, 0, 1)
    micro = np.clip((12.0 - dr) / 6.0, 0, 1)
    u = np.clip((f - BERM) / (1 - BERM), 0, 1)              # position across the 200 m face
    s = u * 4
    ks = np.minimum(np.floor(s), 3)
    sub = (ks + _step(s - ks, 0.45, micro)) / 4             # four sub-benches
    face = macro * sub + (1 - macro) * f
    face = np.where(f < BERM, (1 - macro) * f, face)
    return -(k + face) * BENCH


def craters(radii, th, X, Y, rng, c=0.08, d_abs=25.0, d_frac=0.004, d_max=30e3):
    """Old cratered ground near equilibrium: cumulative density N(>D) = c D^-2 per m^2.

    Craters are drawn only down to the size the camera can resolve at their distance, ~4 px.
    Each one is stamped into its own window of the polar grid. Shapes: simple bowls, depth 0.2 D,
    rim 0.035 D, ejecta falling as x^-3. Degradation varies from fresh to softened (x0.25 to x1)."""
    Z = np.zeros_like(X)
    edges = np.geomspace(radii[0], radii[-1], 80)
    t0, t1 = th[0], th[-1]
    n = 0
    for ra, rb in zip(edges[:-1], edges[1:]):
        dmin = max(d_abs, d_frac * ra)
        A = 0.5 * (t1 - t0) * (rb * rb - ra * ra)
        for _ in range(np.random.default_rng(rng.randrange(1 << 30)).poisson(c * A * (dmin ** -2 - d_max ** -2))):
            r = math.sqrt(rng.uniform(ra * ra, rb * rb))
            t = rng.uniform(t0, t1)
            Dd = dmin * (1 - rng.random() * (1 - (dmin / d_max) ** 2)) ** -0.5
            rw = 1.7 * Dd
            i0, i1 = np.searchsorted(radii, [r - rw, r + rw])
            dt = math.pi if r <= rw else math.asin(min(1.0, rw / r))
            j0, j1 = np.searchsorted(th, [t - dt, t + dt])
            if i1 <= i0 or j1 <= j0:
                continue
            cx, cy = r * math.sin(t), r * math.cos(t)
            x = np.hypot(X[i0:i1, j0:j1] - cx, Y[i0:i1, j0:j1] - cy) / (Dd / 2)
            dep = (0.2 if Dd < 10e3 else 0.1) * rng.uniform(0.25, 1.0)
            rim = 0.035 * rng.uniform(0.3, 1.0)
            h = np.where(x < 1, Dd * (dep * (x * x - 1) + rim), rim * Dd * np.clip(x, 1, None) ** -3)
            Z[i0:i1, j0:j1] += h
            n += 1
    return Z, n


def view_wedge(cam_alt, pitch, lens, aspect, margin=0.06):
    """Azimuth half-width (rad) covering the frame's ground footprint."""
    hw, hh = 18.0, 18.0 / aspect
    p = math.radians(pitch)
    worst = 0.0
    for sx in (-1, 1):
        for sy in (-1, 0, 1):
            x, y, z = sx * hw, lens, sy * hh                     # camera frame: x right, y forward, z up
            Y_, Z_ = y * math.cos(p) - z * math.sin(p), y * math.sin(p) + z * math.cos(p)
            worst = max(worst, math.atan2(abs(x), Y_))
    return worst + margin


def build_ground(rng, pits, half_az, r0, r1, rings, az_n):
    radii = np.geomspace(r0, r1, rings)
    dr = radii * (radii[1] / radii[0] - 1)
    th = np.linspace(-half_az, half_az, az_n)
    Rr, Th = np.meshgrid(radii, th, indexing='ij')
    X, Y = Rr * np.sin(Th), Rr * np.cos(Th)
    D, F, DM = depth_at(X, Y, pits)
    # geometric benches where the grid resolves them (radial spacing <= 60 m); beyond, a smooth
    # wall and the shader's contour bands carry the benches. Crests and toes wander (wall_noise),
    # which leaves the berms level and the floors untouched.
    w = np.clip(D / 80.0, 0, 1) * np.clip((DM - D) / 80.0, 0, 1)
    Zt = terrace(D + w * wall_noise(X, Y), np.broadcast_to(dr[:, None], D.shape))
    mesa = np.clip(1 - D / 30.0, 0, 1)
    Zc, n_craters = craters(radii, th, X, Y, rng)
    print('craters', n_craters)
    Z = Zt + Zc * mesa - (X * X + Y * Y) / (2 * R_M)
    nr, nt = Z.shape
    co = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()]).astype(np.float32)
    i = (np.arange(nr - 1)[:, None] * nt + np.arange(nt - 1)[None, :])
    quads = np.stack([i, i + 1, i + nt + 1, i + nt], -1).reshape(-1, 4)
    me = bpy.data.meshes.new('Stripped')
    me.vertices.add(len(co)); me.vertices.foreach_set('co', co.ravel())
    me.loops.add(quads.size); me.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me.polygons.add(len(quads)); me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    for name, arr in (('cut', 1 - mesa), ('depth', D / D_MAX), ('floor', F.astype(np.float32))):
        at = me.attributes.new(name, 'FLOAT', 'POINT')
        at.data.foreach_set('value', arr.ravel().astype(np.float32))
    ob = bpy.data.objects.new('Stripped', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, X, Y, D, F, radii, th, Z


def ground_material(rad_strength):
    m, g = new_mat('StrippedGround')
    geo = g.n('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    cut = g.n('ShaderNodeAttribute', _attribute_name='cut').outputs['Fac']
    dep = g.n('ShaderNodeAttribute', _attribute_name='depth').outputs['Fac']
    flo = g.n('ShaderNodeAttribute', _attribute_name='floor').outputs['Fac']
    n1 = g.n('ShaderNodeTexNoise', Scale=1 / 9000.0, Detail=8.0, Roughness=0.6)
    g.s(n1.inputs['Vector'], pos)
    n2 = g.n('ShaderNodeTexNoise', Scale=1 / 300.0, Detail=10.0, Roughness=0.7)
    g.s(n2.inputs['Vector'], pos)
    # weathered regolith, slightly red-sloped
    mature = g.ramp(n1.outputs['Fac'], [(0.3, (0.064, 0.058, 0.050)), (0.5, (0.080, 0.074, 0.066)), (0.75, (0.098, 0.091, 0.082))])
    # fresh rock in strata (bands follow depth), deeper crust darker and flatter in colour
    bands = g.n('ShaderNodeTexWave', Scale=1.0, Distortion=4.0, Detail=4.0, _wave_type='BANDS', _bands_direction='Z')
    bands.inputs['Scale'].default_value = 1 / 700.0
    g.s(bands.inputs['Vector'], pos)
    fresh = g.ramp(g.m('ADD', g.m('MULTIPLY', bands.outputs['Fac'], 0.55), g.m('MULTIPLY', n2.outputs['Fac'], 0.45)),
                   [(0.12, (0.062, 0.063, 0.066)), (0.3, (0.095, 0.092, 0.087)), (0.55, (0.125, 0.120, 0.112)),
                    (0.7, (0.105, 0.101, 0.095)), (0.85, (0.150, 0.143, 0.134))])
    deep = g.rgb(g.m('MULTIPLY', g.smooth(dep, 0.45, 1.0), 0.75), fresh, (0.070, 0.071, 0.074))
    # berm/face contrast below the mesh resolution: catch berms every 200 m carry rubble that
    # reads lighter than the blasted faces
    berm = g.n('ShaderNodeTexWave', Scale=1.0, Distortion=0.0, _wave_type='BANDS', _bands_direction='Z')
    berm.inputs['Scale'].default_value = 1 / BENCH
    g.s(berm.inputs['Vector'], pos)
    deep = g.rgb(g.m('MULTIPLY', g.smooth(berm.outputs['Fac'], 0.7, 0.95), 0.25), deep, (0.075, 0.073, 0.070))   # berm rubble: finer, darker
    col = g.rgb(g.smooth(cut, 0.0, 0.6), mature, deep)
    # floors: flat radiator panels, 60 m x 300 m, coolant entering at a manifold every 300 m and
    # leaving ~50 K cooler; service roads every 4.8 km; one block in ten is a yard; no panels
    # under the track bundles
    sep = g.n('ShaderNodeSeparateXYZ'); g.s(sep.inputs[0], pos)
    X_, Y_ = sep.outputs['X'], sep.outputs['Y']

    def cellrand(cx, cy, seed):
        v = g.n('ShaderNodeCombineXYZ')
        g.s(v.inputs[0], g.m('FLOOR', g.m('DIVIDE', X_, cx)))
        g.s(v.inputs[1], g.m('FLOOR', g.m('DIVIDE', Y_, cy)))
        g.s(v.inputs[2], float(seed))
        wn = g.n('ShaderNodeTexWhiteNoise', _noise_dimensions='3D')
        g.s(wn.inputs['Vector'], v.outputs[0])
        return wn.outputs['Value']
    panelv = cellrand(60.0, 300.0, 1)
    yard = g.m('LESS_THAN', cellrand(BUNDLE, 4800.0, 2), 0.1)
    flow = g.m('FRACT', g.m('DIVIDE', Y_, 300.0))
    seam = g.m('GREATER_THAN', g.m('ABSOLUTE', g.m('SUBTRACT', g.m('FRACT', g.m('DIVIDE', X_, 60.0)), 0.5)), 0.5 - 5.0 / 60.0)
    manifold = g.m('LESS_THAN', g.m('FRACT', g.m('DIVIDE', Y_, 300.0)), 8.0 / 300.0)
    half = g.m('LESS_THAN', g.m('FRACT', g.m('DIVIDE', X_, BUNDLE)), 0.5)   # radiators on one half of each row
    road = g.m('LESS_THAN', g.m('FRACT', g.m('DIVIDE', Y_, 4800.0)), 50.0 / 4800.0)
    under = g.m('LESS_THAN', g.m('ABSOLUTE', g.m('SUBTRACT', X_, g.m('MULTIPLY', g.m('ROUND', g.m('DIVIDE', X_, BUNDLE)), BUNDLE))), BUNDLE_W / 2)
    keep = g.m('MULTIPLY', g.m('MULTIPLY', g.m('SUBTRACT', 1.0, g.m('MAXIMUM', g.m('MAXIMUM', yard, road), under)), flo), half)
    is_rad = g.m('MULTIPLY', keep, g.m('SUBTRACT', 1.0, g.m('MAXIMUM', g.m('MULTIPLY', seam, 0.85), g.m('MULTIPLY', manifold, 0.6))))
    rad_col = (0.040, 0.040, 0.040)
    plant = g.ramp(n2.outputs['Fac'], [(0.3, (0.050, 0.049, 0.047)), (0.7, (0.075, 0.073, 0.070))])
    col = g.rgb(flo, col, plant)                                   # plant ground: graded, dark
    col = g.rgb(keep, col, rad_col)
    bsdf = g.n('ShaderNodeBsdfDiffuse', Roughness=1.0)
    g.s(bsdf.inputs['Color'], col)
    # small-scale relief: sub-benches, rubble, craters on the mesas
    sub = g.n('ShaderNodeTexWave', Scale=1.0, Distortion=0.5, _wave_type='BANDS', _bands_direction='Z')
    sub.inputs['Scale'].default_value = 1 / 40.0
    g.s(sub.inputs['Vector'], pos)
    vo = g.n('ShaderNodeTexVoronoi', Scale=1 / 900.0)
    g.s(vo.inputs['Vector'], pos)
    crat = g.m('MULTIPLY', g.smooth(vo.outputs['Distance'], 0.22, 0.05), g.m('SUBTRACT', 1.0, cut))
    blocks = g.n('ShaderNodeTexVoronoi', Scale=1 / 7.0, _feature='DISTANCE_TO_EDGE')
    g.s(blocks.inputs['Vector'], pos)
    fine = g.n('ShaderNodeTexNoise', Scale=1 / 2.5, Detail=6.0, Roughness=0.65)
    g.s(fine.inputs['Vector'], pos)
    near = g.m('ADD', g.m('MULTIPLY', g.smooth(blocks.outputs['Distance'], 0.0, 0.12), 0.25), g.m('MULTIPLY', fine.outputs['Fac'], 0.15))
    hgt = g.m('ADD', g.m('ADD', g.m('MULTIPLY', sub.outputs['Fac'], g.m('MULTIPLY', cut, 0.6)),
                         g.m('MULTIPLY', n2.outputs['Fac'], 0.8)), g.m('MULTIPLY', crat, -1.5))
    hgt = g.m('ADD', hgt, g.m('MULTIPLY', near, g.m('MULTIPLY', cut, 0.04)))
    bump = g.n('ShaderNodeBump', Strength=0.8, Distance=25.0)
    g.s(bump.inputs['Height'], hgt)
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    # glow: blackbody colour (luminance-normalised) times luminance / 93 lm/W. Luminance goes as
    # ~T^16 at 1,500 K: the 3.3 % fall along each panel halves it; panels differ by +-0.5 %.
    bb = g.n('ShaderNodeBlackbody', Temperature=T_RAD)
    em = g.n('ShaderNodeEmission')
    g.s(em.inputs['Color'], bb.outputs['Color'])
    tr = g.m('ADD', g.m('SUBTRACT', 1.0, g.m('MULTIPLY', flow, 0.033)), g.m('MULTIPLY', g.m('SUBTRACT', panelv, 0.5), 0.01))
    strength = g.m('MULTIPLY', is_rad, g.m('POWER', tr, 16.0))
    g.s(em.inputs['Strength'], g.m('MULTIPLY', strength, rad_strength))
    add = g.n('ShaderNodeAddShader')
    g.s(add.inputs[0], bsdf.outputs[0])
    g.s(add.inputs[1], em.outputs[0])
    out = [n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    g.s(out.inputs['Surface'], add.outputs[0])
    return m


def floor_runs(pits, x, y0, y1, step=400.0):
    """Stretches along a bundle line (constant x) that stay on one flat floor: (y_start, y_end, depth)."""
    ys = np.arange(y0, y1, step)
    D, F, _ = depth_at(np.full(len(ys), x), ys, pits)
    runs, start = [], None
    for i in range(len(ys)):
        ok = F[i] and (start is None or abs(D[i] - D[start]) < 1.0)
        if ok and start is None:
            start = i
        elif not ok and start is not None:
            runs.append((ys[start], ys[i - 1], D[start]))
            start = i if F[i] else None
    if start is not None:
        runs.append((ys[start], ys[-1], D[start]))
    return runs


def _ridge(b, x, y, z, h, L, repose=math.radians(35)):
    """A stockpile ridge along Y: triangular section at the angle of repose, half-cone ends."""
    w = h / math.tan(repose)
    n = 12
    t = np.linspace(0, np.pi, n + 1)
    V, Q = [], []
    for ye, sgn in ((y + L / 2, 1.0), (y - L / 2, -1.0)):
        o = len(V)
        for ti in t:
            V.append((x + 1.0 * math.cos(ti), ye + sgn * 1.0 * math.sin(ti), z + h))
        for ti in t:
            V.append((x + w * math.cos(ti), ye + sgn * w * math.sin(ti), z))
        for i in range(n):
            Q.append((o + i, o + n + 1 + i, o + n + 2 + i, o + i + 1))
    a0, b0 = 0, 2 * (n + 1)                       # first top vertex of each end
    Q.append((a0, b0, b0 + n + 1, a0 + n + 1))    # +x flank
    Q.append((a0 + n, a0 + 2 * n + 1, b0 + 2 * n + 1, b0 + n))   # -x flank
    Q.append((a0, a0 + n, b0 + n, b0))            # top
    b._add(np.array(V, float), np.array(Q))


def tracks_and_halls(pits, mats, rng, half_az, y0, y1):
    """Track bundles: straight 31.3 km ramps end to end along each run of floor, pylons every
    1.5 km. Halls between the bundles."""
    deck, pyl, halls, piles = Batch(), Batch(), Batch(), Batch()
    piles.ridge = lambda x, y, z, hh, L: _ridge(piles, x, y, z, hh, L)
    n_tracks = 0
    for x in np.arange(-y1 * math.tan(half_az), y1 * math.tan(half_az), BUNDLE):
        for ya, yb, d in floor_runs(pits, x, max(y0, abs(x) / math.tan(half_az)), y1):
            ys = np.arange(ya + 300.0, yb - L_TRACK, L_TRACK + 600.0)
            for s in ys:
                z0 = -d - (x * x + s * s) / (2 * R_M) + 4.0
                phi = math.atan2(-s, R_M)
                c, si = math.cos(phi), math.sin(phi)
                Rm = np.array([[1, 0, 0], [0, c, -si], [0, si, c]])
                mid = np.array([x, s, z0]) + Rm @ np.array([0, L_TRACK / 2, 0])
                deck.boxes([mid], [[BUNDLE_W, L_TRACK, 5.0]], [Rm])
                py = np.arange(1500.0, L_TRACK, 1500.0)
                h = py ** 2 / (2 * R_M)
                tops = np.array([x, s, z0])[None] + (Rm @ np.stack([np.zeros_like(py), py, np.zeros_like(py)]))[:, :].T
                ok = h > 8
                cz = tops[ok, 2] - h[ok] / 2
                pyl.boxes(np.column_stack([tops[ok, 0], tops[ok, 1], cz]), np.column_stack([np.full(ok.sum(), BUNDLE_W * 0.8), np.full(ok.sum(), 14.0), h[ok]]))
                n_tracks += 40
    # halls on floors, centred between bundles
    cand = []
    for _ in range(9000):
        r = 45e3 * math.sqrt(rng.uniform((y0 / 45e3) ** 2, 1.0)) if rng.random() < 0.7 else y1 * math.sqrt(rng.uniform((y0 / y1) ** 2, 0.55))
        a = rng.uniform(-half_az, half_az)
        x = (math.floor(r * math.sin(a) / BUNDLE) + 0.75) * BUNDLE
        cand.append((x, r * math.cos(a)))
    cand = np.array(cand)
    D, F, _ = depth_at(cand[:, 0], cand[:, 1], pits)
    D2, F2, _ = depth_at(cand[:, 0], cand[:, 1] + 1500.0, pits)
    keep = F & F2 & (np.abs(D - D2) < 1)
    sel = np.flatnonzero(keep)[:700]
    for j in sel:
        x, y = cand[j]
        z = -D[j] - (x * x + y * y) / (2 * R_M)
        # heat-pump stations lifting the plants' waste heat to the radiators' 1,500 K: low dark
        # halls with a compressor block and header pipes running out along the panel rows
        if rng.random() < 0.45:      # an ore stockpile: a long ridge of fresh rock at its angle of repose
            hpile = rng.uniform(30, 90)
            piles.ridge(x, y, z, hpile, rng.uniform(600, 2400))
            continue
        w, l, h = rng.uniform(200, 420), rng.uniform(300, 900), rng.uniform(30, 70)
        halls.boxes([[x, y, z + h / 2]], [[w, l, h]])
        halls.boxes([[x + rng.uniform(-0.3, 0.3) * w, y + rng.uniform(-0.3, 0.3) * l, z + h + 12]], [[w * 0.3, l * 0.25, 24]])
        for side in (-1, 1):
            halls.boxes([[x - w / 4, y + side * (l / 2 + 700), z + 6]], [[10, 1400, 10]])
            halls.boxes([[x + w / 4, y + side * (l / 2 + 700), z + 6]], [[10, 1400, 10]])
    return (deck.to_object('TrackDecks', mats['deck']), pyl.to_object('Pylons', mats['deck']),
            halls.to_object('Halls', mats['hall']), piles.to_object('Stockpiles', mats['pile']), n_tracks, len(sel))


def _wob(th, ph):
    return 1 + 0.10 * np.sin(3 * th + ph[0]) + 0.06 * np.sin(5 * th + ph[1]) + 0.035 * np.sin(9 * th + ph[2])


def berm_points(hero, th, depth):
    """Points on the hero pit (round) where the perturbed depth equals `depth`: positions follow
    the wandering benches (two fixed-point passes through wall_noise)."""
    R = hero['a']
    k = R * math.tan(SLOPE)
    target = np.full_like(th, depth, dtype=float)
    d = target.copy()
    for _ in range(3):
        rho = _wob(th - hero.get('rot', 0.0), hero['ph']) - d / k
        x = hero['cx'] + rho * R * np.cos(th)
        y = hero['cy'] + rho * R * np.sin(th)
        d = target - wall_noise(x, y)
    return x, y


def ground_z(radii, th_grid, Zg, x, y):
    """Height of the built ground mesh at (x, y): nearest vertex of the polar grid."""
    r = np.hypot(x, y)
    t = np.arctan2(x, y)
    i = np.clip(np.searchsorted(radii, r), 0, len(radii) - 1)
    j = np.clip(np.searchsorted(th_grid, t), 0, len(th_grid) - 1)
    return Zg[i, j]


def excavator(b, pos, heading):
    """A bucket-wheel excavator of Bagger 288's class (220 m long, 96 m tall, 21.6 m wheel).
    Local frame: +y toward the face it cuts, z up."""
    c, s = math.cos(heading), math.sin(heading)
    Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    P = lambda *v: np.asarray(pos) + Rz @ np.array(v, float)
    Rs = Rz[None]
    b['body'].boxes([P(-16, 0, 5), P(16, 0, 5)], [[13, 52, 10], [13, 52, 10]], np.repeat(Rs, 2, 0))        # crawlers
    b['body'].boxes([P(0, -4, 20), P(0, -10, 38), P(0, -64, 50)], [[34, 38, 20], [24, 30, 16], [22, 16, 14]], np.repeat(Rs, 3, 0))
    b['steel'].rods(np.array([P(0, 6, 38), P(0, -12, 46), P(0, -6, 30), P(0, -20, 26)]),
                    np.array([P(0, 86, 22), P(0, -66, 56), P(0, -6, 96), P(10, -100, 16)]), [4.0, 3.0, 2.2, 2.0], 8)
    b['cable'].rods(np.array([P(0, -6, 96), P(0, -6, 96)]), np.array([P(0, 84, 26), P(0, -64, 58)]), 0.8, 4)
    b['steel'].rings(np.array([P(0, 92, 17)]), Rz @ np.array([1.0, 0, 0]), 10.8, 7.5, 3.5, 32)


def pit_machinery(hero, mats, rng, half_az, radii, th_grid, Zg, n_machines=12):
    """Bucket-wheel excavators on the near catch berms, cutting the lowest 50 m bench of the
    face above. Belt conveyors along every catch berm of the hero pit."""
    b = {'body': Batch(), 'steel': Batch(), 'cable': Batch(), 'belt': Batch()}
    R = hero['a']
    placed, tries = 0, 0
    while placed < n_machines and tries < 4000:
        tries += 1
        k = rng.randint(1, 9)
        th = np.array([rng.uniform(0, 2 * math.pi)])
        x, y = berm_points(hero, th, k * BENCH + 50.0)
        dist, az = math.hypot(x[0], y[0]), math.atan2(x[0], y[0])
        if not (1500 < dist < 9000 and abs(az) < half_az - 0.12):
            continue
        z = ground_z(radii, th_grid, Zg, x, y)[0]
        if abs(z + k * BENCH + (x[0] ** 2 + y[0] ** 2) / (2 * R_M)) > 3:
            continue                                       # not on this berm after all
        heading = math.atan2(math.sin(th[0]), math.cos(th[0])) - math.pi / 2   # local +y = outward
        excavator(b, (x[0], y[0], z), heading)
        placed += 1
    for k in range(1, int(D_MAX / BENCH)):
        n = int(2 * math.pi * R / 120.0)
        th = np.linspace(0, 2 * math.pi, n + 1)
        x, y = berm_points(hero, th, k * BENCH + 0.95 * BERM * BENCH)
        z = -k * BENCH - (x * x + y * y) / (2 * R_M) + 5.0
        zg = ground_z(radii, th_grid, Zg, x, y)
        ok = np.abs(zg - (z - 5.0)) < 3.0                 # still this berm (other pits cut some away)
        ok &= np.hypot(x, y) < 26e3
        seg = ok[:-1] & ok[1:]
        A = np.column_stack([x[:-1], y[:-1], z[:-1]])[seg]
        B = np.column_stack([x[1:], y[1:], z[1:]])[seg]
        if len(A):
            b['belt'].rods(A, B, 2.5, 6)
    objs = [b['body'].to_object('Excavators', mats['machine']), b['steel'].to_object('ExcavatorSteel', mats['machine']),
            b['cable'].to_object('Stays', mats['machine']), b['belt'].to_object('BermConveyors', mats['belt'], smooth=True)]
    return objs, placed


def truss(b, A, B, w, h, bays, rc, rd, up=(0.0, 0.0, 1.0)):
    """Lattice girder from A to B: four chords, a frame and a diagonal on every face of every bay."""
    A, B = np.asarray(A, float), np.asarray(B, float)
    t = B - A
    L = np.linalg.norm(t)
    t = t / L
    side = np.cross(t, up)
    side /= np.linalg.norm(side)
    upv = np.cross(side, t)
    off = [side * sx * w / 2 + upv * sz * h / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    S, E, R = [], [], []
    for o in off:
        S.append(A + o); E.append(B + o); R.append(rc)
    for i in range(bays + 1):
        p0 = A + t * L * i / bays
        for c in range(4):
            S.append(p0 + off[c]); E.append(p0 + off[(c + 1) % 4]); R.append(rd)
        if i < bays:
            p1 = A + t * L * (i + 1) / bays
            for c in range(4):
                a, bb = (c, (c + 1) % 4) if i % 2 == 0 else ((c + 1) % 4, c)
                S.append(p0 + off[a]); E.append(p1 + off[bb]); R.append(rd)
    b.rods(np.array(S), np.array(E), np.array(R), 6)


def bwe_parts():
    """One bucket-wheel excavator of Bagger 288's class in its own frame (+y toward the face it
    cuts, z up, origin on the ground under the slewing ring): 96 m tall, 220 m long with its
    discharge bridge, 21.6 m wheel with 18 buckets. Painted white (solar absorptance ~0.15), as
    machinery at 0.39 AU would be to stay cool; buckets, crawlers and teeth bare steel."""
    paint, steel, belt = Batch(), Batch(), Batch()
    paint.boxes([[0, -2, 11], [0, -4, 22], [0, -10, 33], [5, 76, 27], [0, -80, 48], [14, -112, 7]],
                [[34, 36, 7], [22, 36, 14], [16, 22, 9], [5, 5, 4], [18, 14, 12], [11, 13, 9]])
    paint.rings([[0, -2, 15.5]], (0, 0, 1), 15.0, 11.0, 3.0, 40)                      # slewing ring
    steel.boxes([[0, 18, 3], [-16, -14, 3], [16, -14, 3], [14, -112, 2]], [[13, 22, 6], [13, 22, 6], [13, 22, 6], [9, 14, 4]])
    for x0, y0 in ((0, 18), (-16, -14), (16, -14)):                                   # crawler plates
        steel.boxes([[x0 + sx * 4.2, y0 + dy, 0.6] for sx in (-1, 1) for dy in np.arange(-10, 10.1, 1.25)],
                    [[4.0, 0.9, 1.2]] * 34)
    truss(paint, (0, 8, 30), (0, 88, 24), 10, 8, 12, 0.7, 0.35)                         # wheel boom
    truss(paint, (0, -14, 34), (0, -78, 52), 8, 6, 9, 0.6, 0.3)                          # counterweight boom
    truss(paint, (0, -20, 24), (14, -108, 14), 5, 4, 12, 0.45, 0.22)                     # discharge bridge
    paint.rods([[-8, -4, 28], [8, -4, 28], [-8, -4, 28], [8, -4, 28]], [[0, -2, 92], [0, -2, 92], [0, 10, 60], [0, 10, 60]], 1.2, 8)
    paint.rods([[-1, -2, 92], [1, -2, 92], [-1, -2, 92], [1, -2, 92]], [[-1, 86, 28], [1, 86, 28], [-1, -76, 56], [1, -76, 56]], 0.35, 4)
    belt.boxes([[0, 48, 27.5], [7, -64, 19]], [[1.8, 78, 0.5], [1.4, 86, 0.5]],
               [np.eye(3), np.array([[1, 0, 0], [0, 0.997, -0.074], [0, 0.074, 0.997]])])
    # the wheel: rim, hub, spokes, 18 buckets with teeth
    C = np.array([0.0, 95.0, 22.0])
    paint.rings([C + [-1.6, 0, 0], C + [1.6, 0, 0]], (1, 0, 0), 10.0, 9.0, 0.8, 48)
    paint.rings([C], (1, 0, 0), 2.6, 0.0, 4.0, 16)
    ang = np.arange(9) * 2 * np.pi / 9
    paint.rods(np.tile(C, (9, 1)), C + np.column_stack([np.zeros(9), 9.2 * np.cos(ang), 9.2 * np.sin(ang)]), 0.5, 6)
    paint.boxes([C + [6.0, 0, 0]], [[5.0, 6.0, 6.0]])                                     # wheel drive
    ang = np.arange(18) * 2 * np.pi / 18
    Rb = [np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]]) for a in ang]
    steel.boxes([C + Rm @ np.array([0, 0, 10.6]) for Rm in Rb], [[3.2, 2.6, 2.4]] * 18, Rb)
    steel.boxes([C + Rm @ np.array([0, 1.3, 12.0]) for Rm in Rb], [[3.0, 0.5, 0.9]] * 18, Rb)
    return paint, steel, belt


def bwe_fleet(hero, rng, radii, th_grid, Zg, spacing=500.0, cam_xy=(0.0, 0.0), r_max=40e3):
    """Bucket-wheel excavators along every catch berm of the hero pit, one per `spacing` m of berm.
    At the heat wall the model digs 2.3e12 kg/s (export 9.7e11 kg/s; 2.38 kg dug per kg in orbit).
    That is ~3.1e8 machines of this class (Bagger 288: 240,000 m^3/day, ~7.5 t/s), one per
    0.24 km^2 of the planet. Every 500 m along berms 308 m apart puts one per 0.15 km^2 of wall,
    which is one per 0.24 km^2 of this pit (walls are 63 % of it). Returns (x, y, z, heading)."""
    R = hero['a']
    out = []
    for k in range(1, int(D_MAX / BENCH)):
        rk = R - (k * BENCH + 50.0) / math.tan(SLOPE)
        n = int(2 * math.pi * rk / spacing)
        th = (np.arange(n) + rng.random()) * 2 * math.pi / n + np.array([rng.uniform(-0.3, 0.3) for _ in range(n)]) * spacing / rk
        x, y = berm_points(hero, th, k * BENCH + 50.0)
        z = ground_z(radii, th_grid, Zg, x, y)
        on = np.abs(z + k * BENCH + (x * x + y * y) / (2 * R_M)) < 3
        on &= np.hypot(x - cam_xy[0], y - cam_xy[1]) < r_max
        for i in np.flatnonzero(on):
            out.append((x[i], y[i], z[i], th[i] - math.pi / 2))
    return out


def instance_fleet(fleet, mats):
    """Build the excavator once, in a collection excluded from the view layer, and instance it."""
    coll = bpy.data.collections.new('BWE')
    bpy.context.scene.collection.children.link(coll)
    paint, steel, belt = bwe_parts()
    for name, bt, mat in (('BWE_paint', paint, mats['paint']), ('BWE_steel', steel, mats['steel']), ('BWE_belt', belt, mats['belt'])):
        bt.to_object(name, mat, collection=coll)
    bpy.context.view_layer.layer_collection.children['BWE'].exclude = True
    for i, (x, y, z, hd) in enumerate(fleet):
        e = bpy.data.objects.new('bwe%04d' % i, None)
        e.instance_type = 'COLLECTION'
        e.instance_collection = coll
        e.location = (x, y, z)
        e.rotation_euler = (0, 0, hd)
        bpy.context.scene.collection.objects.link(e)
    return coll


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--res', default='2400x1004')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--view', default='bwe', choices=['bwe', 'lip', 'rim', 'high'])
    ap.add_argument('--bwe-berm', type=int, default=2, help='bwe view: hero machine on this berm; camera over the one above')
    ap.add_argument('--bwe-drop', type=int, default=1, help='bwe view: camera over the berm this many above the machine')
    ap.add_argument('--bwe-look', type=float, default=55.0, help='bwe view: deg in from the wall direction')
    ap.add_argument('--bwe-theta', type=float, default=180.0, help='bwe view: hero machine, deg round the pit')
    ap.add_argument('--bwe-dist', type=float, default=480.0, help='bwe view: camera this far back along the berm (m)')
    ap.add_argument('--bwe-in', type=float, default=0.0, help='bwe view: camera this far in from the machine line (m)')
    ap.add_argument('--bwe-up', type=float, default=55.0, help='bwe view: camera height above the berm (m)')
    ap.add_argument('--bwe-left', type=float, default=28.0, help='bwe view: machine this many deg left of centre')
    ap.add_argument('--pit-az', type=float, default=20.0, help='lip view: pit centre, deg right of the view')
    ap.add_argument('--pit-r', type=float, default=14e3)
    ap.add_argument('--inside', type=float, default=300.0, help='lip view: camera this far inside the rim (m)')
    ap.add_argument('--alt', type=float, default=None)
    ap.add_argument('--pitch', type=float, default=None)
    ap.add_argument('--lens', type=float, default=20.0)
    ap.add_argument('--sun-alt', type=float, default=7.0)
    ap.add_argument('--sun-az', type=float, default=110.0, help='deg from the view direction toward +X (right)')
    ap.add_argument('--ev', type=float, default=0.0)
    ap.add_argument('--meter', default='sun', choices=['glow', 'sun'],
                    help='glow: the radiator floor at 0.5 scene-linear; sun: grey card in full sunlight +1.5 EV')
    ap.add_argument('--pits', type=int, default=None)
    ap.add_argument('--rings', type=int, default=3600)
    ap.add_argument('--az-n', type=int, default=3000)
    ap.add_argument('--r1', type=float, default=None)
    a = ap.parse_args(argv)
    # rim: 1.8 km above the old surface, 4 km back from the lip of a 72 x 48 km pit, looking
    # down its long axis. high: 20 km up, the whole landscape to the horizon.
    V = {'bwe': dict(alt=0.0, pitch=-8.0, pits=170, r1=160e3, hero=None),
         'lip': dict(alt=500.0, pitch=-14.0, pits=170, r1=160e3, hero=None),
         'rim': dict(alt=1800.0, pitch=-13.0, pits=160, r1=200e3,
                     hero=dict(cx=2500.0, cy=40e3, a=36e3, b=24e3, rot=math.pi / 2, dm=D_MAX)),
         'high': dict(alt=20000.0, pitch=-15.0, pits=230, r1=400e3, hero=None)}[a.view]
    for k in ('alt', 'pitch', 'pits', 'r1'):
        if getattr(a, k) is None:
            setattr(a, k, V[k])
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 3
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    rng = random.Random(21)
    hero = V['hero']
    if a.view == 'lip':
        # a round pit whose rim passes `inside` metres behind the camera, centred pit-az right of the view
        R, az0 = a.pit_r, math.radians(a.pit_az)
        ph = [0.4, 2.1, 5.0]
        th_c = math.atan2(-math.cos(az0), -math.sin(az0))
        wob_c = 1 + 0.10 * math.sin(3 * th_c + ph[0]) + 0.06 * math.sin(5 * th_c + ph[1]) + 0.035 * math.sin(9 * th_c + ph[2])
        dist = (wob_c - a.inside / R) * R
        hero = dict(cx=dist * math.sin(az0), cy=dist * math.cos(az0), a=R, b=R, rot=0.0, dm=D_MAX)
    if a.view == 'bwe':
        # pit frame first (centre at the origin): the camera hovers over a berm crest, looking
        # bwe-look deg in from the wall's direction (enough to see the floor); the hero machine
        # is the spot on a lower berm that sits bwe-left deg left of centre. Then rotate and
        # shift so the camera is at the world origin looking along +Y.
        R, ph = a.pit_r, [0.4, 2.1, 5.0]
        base = dict(cx=0.0, cy=0.0, a=R, b=R, rot=0.0, dm=D_MAX, ph=ph)
        k = a.bwe_berm
        tb = math.radians(a.bwe_theta)
        bx, by = (float(v[0]) for v in berm_points(base, np.array([tb]), k * BENCH + 50.0))
        tx, ty = math.sin(tb), -math.cos(tb)                 # along the berm (decreasing theta)
        nx, ny = -math.cos(tb), -math.sin(tb)                # inward, toward the pit centre
        cxp = bx - a.bwe_dist * tx + a.bwe_in * nx
        cyp = by - a.bwe_dist * ty + a.bwe_in * ny
        view = math.atan2(by - cyp, bx - cxp) - math.radians(a.bwe_left)
        kc = k
        alpha = math.pi / 2 - view
        ca, sa = math.cos(alpha), math.sin(alpha)
        rot = lambda x, y: (ca * x - sa * y, sa * x + ca * y)
        hcx, hcy = rot(-cxp, -cyp)
        hero = dict(cx=hcx, cy=hcy, a=R, b=R, rot=alpha, dm=D_MAX)
        bwe_hero = rot(bx - cxp, by - cyp) + (tb + alpha - math.pi / 2,)
        print('hero machine at', bwe_hero, 'distance', math.hypot(bx - cxp, by - cyp),
              'view deg in from the wall', math.degrees(math.atan2(ty, tx) - view))
        a.alt = -kc * BENCH + a.bwe_up
        # never inside the wall: at least bwe-up above the ground under the camera
        d0, _, _ = depth_at(np.array([0.0]), np.array([0.0]), [dict(hero, ph=ph)])
        a.alt = max(a.alt, float(terrace(d0, np.array([1.0]))[0]) + a.bwe_up)
    pits = make_pits(rng, a.pits, y_max=a.r1 + 20e3, hero=hero)
    half_az = view_wedge(a.alt, a.pitch, a.lens, w / h)
    # nearest ground in frame: bottom ray over the deepest floor
    bottom = math.radians(-a.pitch) + math.atan(18.0 / (w / h) / a.lens)
    r0 = {'high': 0.85 * a.alt / math.tan(max(bottom, 0.05)), 'rim': 400.0, 'lip': 120.0, 'bwe': 100.0}[a.view]
    ob, X, Y, D, F, radii, th, Zg = build_ground(rng, pits, half_az, r0, a.r1, a.rings, a.az_n)
    L = blackbody_luminance(T_RAD, EPS_RAD)
    ob.data.materials.append(ground_material(L / LUMENS_PER_W))
    mats = {
        'deck': lib.principled('TrackDeck', (0.16, 0.16, 0.16), rough=0.5, metal=0.5),
        'hall': lib.principled('Hall', (0.10, 0.10, 0.10), rough=0.6, metal=0.3),
        'machine': lib.principled('Machine', (0.36, 0.35, 0.33), rough=0.55, metal=0.4),
        'pile': lib.principled('OrePile', (0.13, 0.125, 0.118), rough=1.0),
        'belt': lib.principled('Belt', (0.28, 0.28, 0.27), rough=0.5, metal=0.5),
        'paint': lib.principled('WhitePaint', (0.78, 0.78, 0.76), rough=0.7),
        'steel': lib.principled('BareSteel', (0.30, 0.29, 0.28), rough=0.45, metal=0.8),
        'rubber': lib.principled('BeltRubber', (0.03, 0.03, 0.03), rough=0.8),
    }
    n_machines = 0
    if a.view == 'lip':
        _, n_machines = pit_machinery(pits[0], mats, rng, half_az, radii, th, Zg)
    if a.view == 'bwe':
        pit_machinery(pits[0], mats, rng, half_az, radii, th, Zg, n_machines=0)
        fleet = [f for f in bwe_fleet(pits[0], rng, radii, th, Zg)
                 if math.hypot(f[0] - bwe_hero[0], f[1] - bwe_hero[1]) > 400]
        zh = float(ground_z(radii, th, Zg, np.array([bwe_hero[0]]), np.array([bwe_hero[1]]))[0])
        fleet.append((bwe_hero[0], bwe_hero[1], zh, bwe_hero[2]))
        instance_fleet(fleet, dict(mats, belt=mats['rubber']))
        n_machines = len(fleet)
    _, _, _, _, n_tracks, n_halls = tracks_and_halls(pits, mats, rng, half_az, max(r0, 3000.0), min(a.r1, 330e3))
    alt, az = math.radians(a.sun_alt), math.radians(a.sun_az)
    d = Vector((math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)))
    lib.add_sun(0.387, direction=tuple(-d))
    eye = Vector((0.0, 0.0, a.alt))
    print('camera height above the old surface', a.alt)
    p = math.radians(a.pitch)
    cam = lib.camera(eye, eye + Vector((0, math.cos(p), math.sin(p))), lens=a.lens)
    cam.data.clip_start = 50.0
    cam.data.clip_end = 2e6
    if a.meter == 'sun':
        lib.meter(sc, lib.flux(0.387), ev_offset=1.5 + a.ev)
    else:
        sc.view_settings.exposure = math.log2(0.5 / (L / LUMENS_PER_W)) + a.ev
    if a.view == 'bwe' and a.meter == 'sun':
        sc.view_settings.exposure -= 0.5
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    cutm = D > 30
    print(json.dumps({
        'mean_depth_over_view_m': float(D.mean()),  # polar grid: weighted toward far rings; area-weighted below
        'mean_depth_area_weighted_m': float((D * (X * X + Y * Y)).sum() / (X * X + Y * Y).sum()),
        'cut_fraction_area_weighted': float((cutm * (X * X + Y * Y)).sum() / (X * X + Y * Y).sum()),
        'floor_fraction_area_weighted': float((F * (X * X + Y * Y)).sum() / (X * X + Y * Y).sum()),
        'radiator_luminance_cd_m2': L, 'radiator_strength': L / LUMENS_PER_W,
        'tracks_drawn': n_tracks, 'halls': n_halls, 'excavators': n_machines, 'r0_km': r0 / 1e3, 'half_az_deg': math.degrees(half_az),
        'horizon_km': math.sqrt(2 * R_M * max(a.alt, 1.0)) / 1e3, 'exposure': sc.view_settings.exposure}))
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
