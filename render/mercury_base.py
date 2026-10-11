"""Mercury's industrial base after the factories have moved to orbit (model year 37+, ~2090+):
an open-pit quarry, beneficiation (crushing, sizing, pelletising), stockpiles and conveyors, a
silicon PV field for power, edge-on radiator fins, and the breeches of parallel mass-driver tracks
(docs/data/future/manufacturing.json render_implications).

Numbers:
- Benches 15 m high, 12 m berms, 70 deg faces; a 30 m haul road spirals down at 9 %;
  the pit is 2 km across and 300 m deep (~1e9 t of rock, a few days of one track's
  1e4 kg/s... the industry at the heat wall moves 2.5e12 kg/s: millions of such pits).
- Fresh rock is brighter than weathered regolith (MESSENGER: immature material).
- Mass drivers: 100 g, 31 km, 7.8 km/s (model); here only the breech ends are in view.
- PV: Mercury-made silicon on the day side, dark navy; radiators: white fins edge-on to the Sun.
- Sun: 0.39 AU (9.1 kW/m^2, 1.37 deg), 32 deg up; black sky.

Usage: blender -b --python render/mercury_base.py -- out.exr [--res 2400x1350] [--samples 128]
"""
import argparse
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import lib  # noqa: E402
import sail  # noqa: E402
from earth_sky import G, new_mat  # noqa: E402
from mercury_surface import R_M, instance_field  # noqa: E402
from meshkit import Batch  # noqa: E402

PIT_R = 1000.0
BENCH_H = 15.0
BERM = 12.0
FACE = BENCH_H / math.tan(math.radians(70))
N_BENCH = 20
ROAD_W = 30.0
ROAD_GRADE = 0.09


def pit_height(X, Y):
    """Terraced pit with a spiral haul road; returns (z, fresh-rock mask, road mask)."""
    r = np.hypot(X, Y)
    th = np.arctan2(Y, X)
    step = BERM + FACE
    k = np.clip((PIT_R - r) / step, 0, N_BENCH)
    kf = np.floor(k)
    frac = k - kf
    # within each step: berm (flat) then face (steep drop)
    z = -BENCH_H * (kf + np.clip((frac * step - BERM) / FACE, 0, 1))
    z = np.where(r > PIT_R, 0.0, z)
    floor_r = PIT_R - N_BENCH * step
    z = np.where(r < floor_r, -BENCH_H * N_BENCH, z)
    # spiral road: depth falls ROAD_GRADE per metre of travel; radius shrinks one step per bench
    depth_total = BENCH_H * N_BENCH
    length = depth_total / ROAD_GRADE
    # parametrise by angle travelled phi from the rim entry at th0
    th0 = -0.6
    road = np.zeros_like(z, dtype=bool)
    zr = np.zeros_like(z)
    for wrap in range(3):
        phi = (th - th0) % (2 * math.pi) + 2 * math.pi * wrap
        # radius along the spiral: the road descends inward as it goes round
        s = phi * np.maximum(r, 1.0)                     # approximate path length
        rr = PIT_R - 8.0 - (PIT_R - floor_r - 20.0) * np.clip(phi / (2 * math.pi * 1.6), 0, 1)
        on = (np.abs(r - rr) < ROAD_W / 2) & (phi < 2 * math.pi * 1.6)
        zz = -np.clip(phi / (2 * math.pi * 1.6), 0, 1) * depth_total
        road |= on
        zr = np.where(on, zz, zr)
    z = np.where(road & (r <= PIT_R + 5), zr, z)
    fresh = (r < PIT_R + 3) & ~road
    return z, fresh, road


def spoil_heaps(X, Y):
    """Overburden dumps: flat-topped, benched heaps 40-70 m high round the pits."""
    z = np.zeros_like(X)
    for (cx, cy, r, h) in ((-1700, 900, 520, 60), (-1500, -1300, 430, 48), (300, 1750, 380, 42), (-2300, -200, 300, 36)):
        d = np.hypot(X - cx, Y - cy)
        steps = np.clip((r - d) / 70.0, 0, None)
        prof = np.minimum(np.floor(steps) * 14 + np.clip((steps - np.floor(steps)) * 70 / 22, 0, 1) * 14, h)
        z = np.maximum(z, np.where(d < r, prof, 0))
    return z


def stockpiles(X, Y):
    """Conical stockpiles of crushed ore (angle of repose ~35 deg) by the plant."""
    z = np.zeros_like(X)
    for (cx, cy, h) in ((1450, 260, 38), (1520, 330, 30), (1400, 360, 26), (1600, 210, 34), (1660, 300, 22)):
        d = np.hypot(X - cx, Y - cy)
        z = np.maximum(z, h - d * math.tan(math.radians(35)))
    return z


def terrain(rng):
    """3 m grid over 5.4 km round the pit, then a polar ring to the horizon, on Mercury's curve."""
    n = 1800
    xs = np.linspace(-2700, 2700, n)
    X, Y = np.meshgrid(xs, xs[::-1])
    zp, fresh, road = pit_height(X, Y)
    zs = stockpiles(X, Y) + spoil_heaps(X, Y)
    # second, younger pit to the north-east
    zp2, fr2, rd2 = pit_height((X - 600) * 1.9, (Y - 2050) * 1.9)
    zp2 = zp2 * 0.6
    in2 = np.hypot((X - 600) * 1.9, (Y - 2050) * 1.9) < PIT_R + 5
    fresh = fresh | (in2 & fr2)
    road = road | (in2 & rd2)
    # weathered plain: gentle swells and old degraded craters
    zn = 2.0 * np.sin(X / 310.0 + 0.4) * np.cos(Y / 460.0) + 0.6 * np.sin((X - Y) / 97.0)
    for _ in range(140):
        cx, cy = rng.uniform(-2700, 2700), rng.uniform(-2700, 2700)
        D = 20 + 380 * rng.random() ** 3
        if math.hypot(cx, cy) < PIT_R + D:
            continue
        x = np.hypot(X - cx, Y - cy) / (D / 2)
        sel = x < 3
        zn[sel] += np.where(x[sel] < 1, D * (0.12 * (x[sel] ** 2 - 1) + 0.03), 0.03 * D * x[sel] ** -3) * rng.uniform(0.3, 1)
    # graded industrial pads (plant, PV, track heads) are flat
    pad = ((X > 1150) & (X < 2600) & (Y > -900) & (Y < 900))
    zn = np.where(pad, 0.0, zn)
    inpit = np.hypot(X, Y) < PIT_R + 5
    Z = np.where(inpit, zp, np.where(in2, zp2, zn)) + zs - (X * X + Y * Y) / (2 * R_M)
    co = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()]).astype(np.float32)
    i = np.arange(n - 1)[:, None] * n + np.arange(n - 1)[None, :]
    quads = np.stack([i, i + n, i + n + 1, i + 1], -1).reshape(-1, 4)
    me = bpy.data.meshes.new('Quarry')
    me.vertices.add(len(co)); me.vertices.foreach_set('co', co.ravel())
    me.loops.add(quads.size); me.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me.polygons.add(len(quads)); me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    for name, arr in (('fresh', fresh.astype(np.float32) + (zs > 0.5).astype(np.float32)), ('road', road.astype(np.float32)),
                      ('pad', pad.astype(np.float32))):
        at = me.attributes.new(name, 'FLOAT', 'POINT')
        at.data.foreach_set('value', np.clip(arr, 0, 1).ravel())
    ob = bpy.data.objects.new('Quarry', me)
    bpy.context.scene.collection.objects.link(ob)
    # far ring to the horizon (66 km from 900 m)
    radii = np.geomspace(2650.0, 90000.0, 220)
    th = np.linspace(-math.pi, math.pi, 1201)[:-1]
    Rr, Th = np.meshgrid(radii, th, indexing='ij')
    Xf, Yf = Rr * np.cos(Th), Rr * np.sin(Th)
    Zf = 3.0 * np.sin(Xf / 900.0) * np.cos(Yf / 1300.0) + 12 * np.sin(Xf / 7000.0 + 1) * np.sin(Yf / 9000.0) - (Xf ** 2 + Yf ** 2) / (2 * R_M)
    nr, nt = Zf.shape
    co = np.column_stack([Xf.ravel(), Yf.ravel(), Zf.ravel()]).astype(np.float32)
    i = (np.arange(nr - 1)[:, None] * nt + np.arange(nt)[None, :])
    j = (np.arange(nr - 1)[:, None] * nt + (np.arange(nt)[None, :] + 1) % nt)
    quads = np.stack([i, j, j + nt, i + nt], -1).reshape(-1, 4)
    me2 = bpy.data.meshes.new('Plain')
    me2.vertices.add(len(co)); me2.vertices.foreach_set('co', co.ravel())
    me2.loops.add(quads.size); me2.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me2.polygons.add(len(quads)); me2.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me2.update(calc_edges=True)
    me2.shade_smooth()
    ob2 = bpy.data.objects.new('Plain', me2)
    bpy.context.scene.collection.objects.link(ob2)
    return ob, ob2


def ground_material():
    """Weathered regolith (albedo ~0.07, slightly red-sloped grey); freshly cut rock and crushed
    ore ~1.6x brighter and less red; haul roads compacted and lighter."""
    m, g = new_mat('MercuryGround')
    geo = g.n('ShaderNodeNewGeometry')
    fr = g.n('ShaderNodeAttribute', _attribute_name='fresh')
    rd = g.n('ShaderNodeAttribute', _attribute_name='road')
    pd = g.n('ShaderNodeAttribute', _attribute_name='pad')
    sep = g.n('ShaderNodeSeparateXYZ'); g.s(sep.inputs[0], geo.outputs['Position'])
    n1 = g.n('ShaderNodeTexNoise', Scale=0.004, Detail=8.0, Roughness=0.6)
    g.s(n1.inputs['Vector'], geo.outputs['Position'])
    n2 = g.n('ShaderNodeTexNoise', Scale=0.2, Detail=10.0, Roughness=0.7)
    g.s(n2.inputs['Vector'], geo.outputs['Position'])
    old = g.ramp(g.m('ADD', g.m('MULTIPLY', n1.outputs['Fac'], 0.7), g.m('MULTIPLY', n2.outputs['Fac'], 0.3)),
                 [(0.3, (0.050, 0.047, 0.043)), (0.55, (0.075, 0.071, 0.066)), (0.75, (0.095, 0.090, 0.084))])
    # fresh rock: banded by depth (layered crust), brighter, greyer
    layers = g.n('ShaderNodeTexWave', Scale=0.0, Distortion=3.0, Detail=3.0)
    layers.wave_type = 'BANDS'
    layers.bands_direction = 'Z'
    layers.inputs['Scale'].default_value = 0.02
    g.s(layers.inputs['Vector'], geo.outputs['Position'])
    freshc = g.ramp(g.m('ADD', g.m('MULTIPLY', layers.outputs['Fac'], 0.6), g.m('MULTIPLY', n2.outputs['Fac'], 0.4)),
                    [(0.2, (0.09, 0.088, 0.085)), (0.5, (0.13, 0.127, 0.122)), (0.8, (0.17, 0.165, 0.16))])
    col = g.rgb(fr.outputs['Fac'], old, freshc)
    col = g.rgb(g.m('MULTIPLY', rd.outputs['Fac'], 0.8), col, (0.15, 0.145, 0.14))
    col = g.rgb(g.m('MULTIPLY', pd.outputs['Fac'], 0.7), col, (0.12, 0.116, 0.11))
    # crater-saturated plain: bowls with raised rims at 3 scales (cells 40, 140, 450 m), off the
    # fresh ground and pads; small fresh craters slightly brighter
    craters = None
    for scale, depth in ((1 / 40.0, 0.6), (1 / 140.0, 1.0), (1 / 450.0, 1.6)):
        vo = g.n('ShaderNodeTexVoronoi', Scale=scale, Randomness=1.0)
        g.s(vo.inputs['Vector'], geo.outputs['Position'])
        rad = g.m('ADD', 0.10, g.m('MULTIPLY', g.m('POWER', g.n('ShaderNodeSeparateColor').outputs[0] if False else vo.outputs['Color'], 2.0), 0.34))
        d = g.m('DIVIDE', vo.outputs['Distance'], rad)            # crater radius 0.10-0.44 cell
        bowl = g.m('MULTIPLY', g.m('SUBTRACT', g.m('MULTIPLY', d, d), 1.0), g.m('LESS_THAN', d, 1.0))
        rim = g.m('MULTIPLY', g.m('MULTIPLY', g.m('GREATER_THAN', d, 1.0), g.m('POWER', g.m('MAXIMUM', d, 1.0), -3.0)), 0.25)
        hcr = g.m('MULTIPLY', g.m('ADD', bowl, rim), depth)
        craters = hcr if craters is None else g.m('ADD', craters, hcr)
    plain = g.m('MULTIPLY', g.m('SUBTRACT', 1.0, g.m('MAXIMUM', fr.outputs['Fac'], pd.outputs['Fac'])), g.m('SUBTRACT', 1.0, rd.outputs['Fac']))
    hgt = g.m('ADD', g.m('MULTIPLY', craters, plain), g.m('MULTIPLY', n2.outputs['Fac'], 0.3))
    bsdf = g.n('ShaderNodeBsdfDiffuse')
    g.s(bsdf.inputs['Color'], col)
    bsdf.inputs['Roughness'].default_value = 1.0
    bump = g.n('ShaderNodeBump', Strength=1.0, Distance=4.0)
    g.s(bump.inputs['Height'], hgt)
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    out = [n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    g.s(out.inputs['Surface'], bsdf.outputs[0])
    return m


def plant(mats):
    """Beneficiation plant on the east pad: primary crushers at the pit rim, conveyors to a
    screening/pelletising hall, pellet silos feeding the track breeches."""
    bm = bmesh.new()      # buildings
    bmc = bmesh.new()     # conveyors and trestles
    zc = lambda x, y: -(x * x + y * y) / (2 * R_M)
    # primary crushers at the rim
    for ang in (-0.35, 0.25):
        x, y = (PIT_R + 40) * math.cos(ang), (PIT_R + 40) * math.sin(ang)
        sail._box(bm, Vector((x, y, zc(x, y) + 18)), (40, 30, 36))
        sail._box(bm, Vector((x + 28, y, zc(x, y) + 8)), (16, 18, 16))
        # conveyor to the hall
        a = Vector((x + 36, y, zc(x, y) + 20))
        b = Vector((1500, 0, 24))
        sail._box(bmc, (a + b) / 2, (4, (b - a).length, 2.5), (b - a).to_track_quat('Y', 'Z').to_matrix())
        for t in np.linspace(0.05, 0.95, 12):
            p = a.lerp(b, t)
            sail._rod(bmc, (p.x, p.y, zc(p.x, p.y)), (p.x, p.y, p.z - 1.2), 0.6, 6)
    # screening and pelletising hall
    sail._box(bm, Vector((1520, 0, 22)), (110, 260, 44))
    sail._box(bm, Vector((1520, 0, 48)), (60, 220, 8))
    # a line of pelletising halls to the north and south
    for k, yy in enumerate((-420, -300, 300, 420)):
        sail._box(bm, Vector((1560, yy, 16)), (90, 70, 32))
        a = Vector((1520, 0, 24)); b = Vector((1560, yy, 30))
        sail._box(bmc, (a + b) / 2, (4, (b - a).length, 2.5), (b - a).to_track_quat('Y', 'Z').to_matrix())
    # pellet silos
    for k in range(6):
        y = -100 + 40 * k
        mtx = Matrix.Translation((1660, y, 30))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=14, radius2=14, depth=60, matrix=mtx)
    return sail._obj('Plant', bm, mats['plant']), sail._obj('Conveyors', bmc, mats['steel'])


def tracks(mats, n=12):
    """Breech ends of parallel mass-driver tracks heading east, 60 m apart, straight off the curve
    (only the first 12 km are modelled; the far ends are below the horizon from here)."""
    base, tubes = Batch(), Batch()
    for k in range(n):
        y0 = -330 + 60 * k
        base.boxes([[1780, y0, 6]], [[60, 16, 12]])
        xs = np.arange(1810.0, 1810.0 + 12000, 40.0)
        m = len(xs)
        tubes.rods(np.column_stack([xs, np.full(m, y0), np.full(m, 6.0)]),
                   np.column_stack([xs + 40.0, np.full(m, y0), np.full(m, 6.0)]), 0.8, 16)
        zg = -(xs ** 2 + y0 ** 2) / (2 * R_M)
        for dy in (-2.0, 2.0):
            base.rods(np.column_stack([xs, np.full(m, y0 + dy), zg]), np.column_stack([xs, np.full(m, y0), np.full(m, 4.8)]), 0.25, 6)
    return base.to_object('TrackBase', mats['steel']), tubes.to_object('TrackTubes', mats['coil'], smooth=True)


def pv_and_radiators(mats, sun_rotz=0.0):
    """PV blocks (tilted 20 deg toward the morning Sun) north of the plant; radiator fins
    (vertical, aligned with the Sun's azimuth, so edge-on) south of it."""
    pv = bmesh.new()
    sail._box(pv, Vector((0, 0, 1.2)), (10.0, 4.0, 0.05), Matrix.Rotation(math.radians(20), 3, 'Y'))
    for (x, y) in ((-4.8, 0), (4.8, 0)):
        sail._rod(pv, (x, -1.5, 0), (x, -1.5, 1.1), 0.05, 6)
        sail._rod(pv, (x, 1.5, 0), (x, 1.5, 1.1), 0.05, 6)
    me = bpy.data.meshes.new('PVPanel'); pv.to_mesh(me); pv.free()
    me.materials.append(mats['pv'])
    pvo = bpy.data.objects.new('PVPanel', me)
    xs = np.arange(1200, 2550, 13.0)
    ys = np.arange(380, 880, 7.0)
    X, Y = np.meshgrid(xs, ys)
    keep = (np.random.default_rng(3).random(X.shape) > 0.01)
    P = np.column_stack([X[keep], Y[keep], -(X[keep] ** 2 + Y[keep] ** 2) / (2 * R_M)])
    instance_field([pvo], P, np.zeros(len(P)), name='PVField')
    rad = bmesh.new()
    sail._box(rad, Vector((0, 0, 7.0)), (30.0, 0.05, 14.0))
    sail._rod(rad, (-15, 0, 0.5), (15, 0, 0.5), 0.3, 8)
    me = bpy.data.meshes.new('Fin'); rad.to_mesh(me); rad.free()
    me.materials.append(mats['radiator'])
    fo = bpy.data.objects.new('Fin', me)
    xs = np.arange(1250, 2450, 34.0)
    ys = np.arange(-860, -420, 6.0)
    X, Y = np.meshgrid(xs, ys)
    P = np.column_stack([X.ravel(), Y.ravel(), -(X.ravel() ** 2 + Y.ravel() ** 2) / (2 * R_M)])
    # fins turned to the Sun's azimuth, so the light only grazes their top edges
    return instance_field([fo], P, np.full(len(P), sun_rotz), name='Radiators')


def trucks(mats, rng, n=70):
    """Haul trucks (14 m, ~300 t class) on the spiral road."""
    floor_r = PIT_R - N_BENCH * (BERM + FACE)
    C, S, R = [], [], []
    for _ in range(n):
        phi = rng.uniform(0, 2 * math.pi * 1.6)
        f = min(phi / (2 * math.pi * 1.6), 1)
        rr = PIT_R - 8.0 - (PIT_R - floor_r - 20.0) * f
        th = -0.6 + phi
        x, y = rr * math.cos(th), rr * math.sin(th)
        z = -f * BENCH_H * N_BENCH - (x * x + y * y) / (2 * R_M)
        C.append((x, y, z + 3.0)); S.append((6.0, 14.0, 5.0))
        R.append(np.array(Matrix.Rotation(th + math.pi / 2, 3, 'Z')))
    b = Batch()
    b.boxes(C, S, np.array(R))
    return b.to_object('Trucks', mats['truck'])


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--res', default='2400x1350')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--cam', default='-700,-2300,430')
    ap.add_argument('--target', default='1500,250,-20')
    ap.add_argument('--lens', type=float, default=28.0)
    ap.add_argument('--sun-alt', type=float, default=16.0)
    ap.add_argument('--sun-az', type=float, default=150.0)
    ap.add_argument('--ev', type=float, default=1.0)
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 3
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    rng = random.Random(11)
    q, plain = terrain(rng)
    gm = ground_material()
    q.data.materials.append(gm)
    plain.data.materials.append(gm)
    spec = sail.load_spec()
    mats = {
        'plant': lib.principled('PlantClad', (0.42, 0.41, 0.39), rough=0.6, metal=0.3),
        'steel': lib.principled('Steel', (0.30, 0.30, 0.31), rough=0.45, metal=0.85),
        'coil': lib.principled('CoilAl', (0.78, 0.78, 0.78), rough=0.3, metal=1.0),
        'truck': lib.principled('Truck', (0.55, 0.52, 0.45), rough=0.5, metal=0.4),
        'pv': sail.film_material(spec, chips=False, hinges=False, name='PVFilm'),
        'radiator': lib.radiator_material('Fins'),
    }
    plant(mats)
    tracks(mats)
    sun_vec = (math.sin(math.radians(a.sun_az)), math.cos(math.radians(a.sun_az)))
    pv_and_radiators(mats, sun_rotz=math.atan2(sun_vec[1], sun_vec[0]))
    trucks(mats, rng)
    r_au = 0.387
    alt, az = math.radians(a.sun_alt), math.radians(a.sun_az)
    d = Vector((math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)))
    lib.add_sun(r_au, direction=tuple(-d))
    cam = lib.camera(Vector(tuple(float(v) for v in a.cam.split(','))), Vector(tuple(float(v) for v in a.target.split(','))), lens=a.lens)
    cam.data.clip_end = 2e5
    lib.meter(sc, lib.flux(r_au), ev_offset=a.ev)
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    print(json.dumps({'pit_depth_m': BENCH_H * N_BENCH, 'pit_volume_m3': math.pi * PIT_R ** 2 * BENCH_H * N_BENCH / 3,
                      'exposure': sc.view_settings.exposure}))
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
