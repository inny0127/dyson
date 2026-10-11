"""A co-orbital chip foundry on Mercury's orbit, after the factories leave the surface (~2090+).

Design (docs/data/future/manufacturing.json: space-native wafer fab, render_implications):
- Dry vacuum processing in open-frame tool modules under blankets, no building, no cleanroom air,
  no water; 450 mm wafers / panels moved between modules on a maglev spine.
- EUV light from a shared free-electron laser: a ~400 m superconducting linac (cryomodules)
  and undulator, with beamlines branching to the scanner modules.
- Process chemistry without hydrogen: a chlorine loop (SiCl4 distillation, Zn/Mg reduction, float-
  zone refining) in a refinery module whose radiators run at ~1,000 K and glow dull red.
- Cryo-panels at 40-80 K recapture Cl2, SiCl4, O2 and S behind stacked multilayer sunshades.
- Fab radiators at 320 K, held edge-on to the Sun.
Sizing for one foundry making 1e5 m^2/yr of die (~1/8 of today's world leading-edge output):
  tools 40 kg per m^2/yr -> 4,000 t; sails 0.0251 m^2 of die per kg -> 4e6 kg/yr (~280 sails);
  1,150 MJ/kg -> 146 MW; PV at 0.387 AU tilted 80 deg from the Sun (cos 80 x 9.1 kW/m^2 =
  1.6 kW/m^2, so the cells run at ~335 K instead of ~540 K face-on) at 20 % -> 0.46 km^2;
  radiators at 320 K, two-sided, eps 0.9 (1.07 kW/m^2) -> 0.14 km^2.
Mercury hangs 60,000 km away. Frame: +Z toward the Sun.

Usage: blender -b --python render/foundry.py -- out.exr [--thermal] [--res 2400x1350]
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import lib  # noqa: E402
import sail  # noqa: E402
import pod  # noqa: E402
from meshkit import Batch  # noqa: E402

R_AU = 0.387


def truss(b, A, B, side=6.0, rod=0.25, bay=6.0):
    """Triangular truss (vectorised members) from A to B."""
    A, B = np.asarray(A, float), np.asarray(B, float)
    ax = (B - A) / np.linalg.norm(B - A)
    ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, ref); u /= np.linalg.norm(u)
    v = np.cross(u, ax)
    R = side / math.sqrt(3)
    cs = [u * R * math.cos(t) + v * R * math.sin(t) for t in (math.pi / 2, math.pi / 2 + 2.0944, math.pi / 2 + 4.1888)]
    L = np.linalg.norm(B - A)
    n = max(1, int(L / bay))
    t = np.linspace(0, 1, n + 1)[:, None]
    P = A + t * (B - A)
    for c in cs:
        b.rods([A + c], [B + c], rod, 8)
    for i in range(3):
        b.rods(P + cs[i], P + cs[(i + 1) % 3], rod * 0.6, 6)
        b.rods(P[:-1] + cs[i], P[1:] + cs[(i + 1) % 3], rod * 0.4, 6)


def build(spec):
    M = spec['materials']
    mats = {
        'blanket': pod.glass_cloth_material('FoundryBlanket'),
        'truss': lib.principled('FoundryTruss', (0.42, 0.42, 0.41), rough=0.5, metal=0.6),
        'pv': sail.film_material(spec, chips=False, hinges=False, name='FoundryPV'),
        'radiator': pod.radiator_material(spec),
        'shade': lib.principled('Shade', (0.92, 0.92, 0.93), rough=0.12, metal=1.0),
        'linac': lib.principled('Cryomodule', (0.78, 0.78, 0.76), rough=0.5, metal=0.4),
        'refinery_rad': lib.principled('RefineryRad', (0.08, 0.075, 0.07), rough=0.6),
        'roll': lib.principled('FilmRoll', (0.05, 0.06, 0.12), rough=0.25, metal=0.2),
    }
    objs = {}
    # --- spine and maglev rail
    st = Batch()
    truss(st, (-340, 0, 0), (340, 0, 0), side=8.0, rod=0.3, bay=8.0)
    objs['spine'] = st
    # --- process modules: blanketed tool frames along the spine, both sides
    mod = Batch()
    xs = np.arange(-260, 261, 40.0)
    C, S = [], []
    for x in xs:
        for sgn in (-1, 1):
            C.append((x, sgn * 22, -2)); S.append((30, 26, 16))
    mod.boxes(C, S)
    # scanner modules (larger) at the FEL end, fed by beamlines
    Cs = [(-300 + 24 * k, sgn * 30, -2) for k in range(4) for sgn in (-1, 1)]
    mod.boxes(Cs, [(20, 18, 20)] * len(Cs))
    objs['modules'] = mod
    det = Batch()
    rng = np.random.default_rng(7)
    for (x, y, z) in C:
        # vacuum load locks, gas cabinets (Cl2, O2 recapture), robot rails on each module
        for _ in range(5):
            det.boxes([[x + rng.uniform(-13, 13), y + rng.uniform(-11, 11), z + 8 + rng.uniform(0.5, 2.5)]],
                      [[rng.uniform(2, 6), rng.uniform(2, 6), rng.uniform(1, 4)]])
        det.rods([[x - 15, y + np.sign(y) * 13.5, z + 4]], [[x + 15, y + np.sign(y) * 13.5, z + 4]], 0.5, 10)
        det.rods([[x, y - np.sign(y) * 13.5, z - 6]], [[x, 0, -1]], 0.4, 8)
    for k in range(10):
        x = -300 + 66 * k
        det.rods([[x, -4, 6]], [[x + 60, -4, 6]], 1.2, 16)      # chlorine/SiCl4 header
        det.rods([[x, 4, 6]], [[x + 60, 4, 6]], 0.8, 12)
    objs['detail'] = det
    # --- FEL: superconducting linac (cryomodules) and undulator below the spine, beamlines up
    lin = Batch()
    xc = np.arange(-340, 80, 12.4)
    lin.rods(np.column_stack([xc, np.full(len(xc), 0.0), np.full(len(xc), -16.0)]),
             np.column_stack([xc + 12.0, np.full(len(xc), 0.0), np.full(len(xc), -16.0)]), 0.6, 20)
    lin.rods([[80, 0, -16]], [[200, 0, -16]], 0.35, 12)             # undulator
    for (x, y, z) in Cs:
        lin.rods([[200, 0, -16]], [[x, y, z - 6]], 0.08, 6)        # EUV beamlines
    objs['linac'] = lin
    # --- PV: four arrays 340 x 340 m at the ends, tilted 80 deg from the Sun (nearly edge-on)
    pv = Batch()
    pvt = Batch()
    tilt = math.radians(80)
    for xc0 in (-560, 560):
        for yc0 in (-190, 190):
            # plane containing X, normal tilted 80 deg from +Z toward +Y
            n = np.array([0, math.sin(tilt), math.cos(tilt)])
            u = np.array([1.0, 0, 0])
            v = np.cross(n, u)
            c = np.array([xc0, yc0, 0])
            # 20 strips so the film bump has room; seams every 17 m
            for k in range(20):
                a0 = -170 + 17 * k
                corners = [c + u * a0 + v * -170, c + u * (a0 + 16.8) + v * -170, c + u * (a0 + 16.8) + v * 170, c + u * a0 + v * 170]
                pv._add(np.array(corners), np.array([[0, 1, 2, 3]]))
            truss(pvt, (xc0 - 170, yc0, 0), (xc0 + 170, yc0, 0), side=3.0, rod=0.15, bay=6)
        truss(pvt, (np.sign(xc0) * 340, 0, 0), (xc0, 0, 0), side=6.0, rod=0.25, bay=8)
        for yc0 in (-190, 190):
            truss(pvt, (xc0, 0, 0), (xc0, yc0, 0), side=4.0, rod=0.2, bay=8)
    objs['pv'] = pv
    objs['pvtruss'] = pvt
    # --- radiators: 12 blades 100 x 57 m in planes containing the Sun line (edge-on), off the spine
    rad = Batch()
    rt = Batch()
    for x in np.arange(-250, 251, 100.0):
        for sgn in (-1, 1):
            y0, y1 = sgn * 45, sgn * 145
            rad.boxes([[x, (y0 + y1) / 2, -10]], [[0.05, abs(y1 - y0), 57.0]])
            rt.rods([[x, sgn * 30, -10]], [[x, y0, -10]], 0.3, 8)
            for zz in np.arange(-37, 19.5, 8.0):
                rt.rods([[x, y0, zz]], [[x, y1, zz]], 0.12, 6)       # header ribs
    objs['radiators'] = rad
    objs['radtruss'] = rt
    # --- cryo-panel bay at the +X end under four stacked multilayer shades
    sh = Batch()
    for k, z in enumerate((14, 18, 22, 26)):
        s = 70 - 4 * k
        sh.boxes([[300, 0, z]], [[s, s * 0.8, 0.02]])
    objs['shades'] = sh
    cry = Batch()
    cry.boxes([[300, 0, 4]], [[50, 36, 10]])
    objs['cryo'] = cry
    # --- refinery: chlorine-loop module with its 1,000 K radiators (two 12 x 12 m panels)
    ref = Batch()
    ref.boxes([[-330, 40, -2]], [[36, 30, 20]])
    objs['refinery'] = ref
    rr = Batch()
    # faces toward +-Y: edge-on to the Sun, broadside to the camera
    rr.boxes([[-336, 62, 4]], [[14, 0.05, 14]])
    rr.boxes([[-336, 74, 4]], [[14, 0.05, 14]])
    objs['refinery_rad'] = rr
    # --- a finished pair of film rolls (14.4 t sail) on a departing tug
    roll = Batch()
    for dy in (-1.0, 1.0):
        roll.rods([[120, 300 + dy * 1.0, 40]], [[123.4, 300 + dy * 1.0, 40]], 0.75, 32)
    objs['roll'] = roll
    out = {}
    matmap = {'detail': 'linac', 'spine': 'truss', 'modules': 'blanket', 'linac': 'linac', 'pv': 'pv', 'pvtruss': 'truss',
              'radiators': 'radiator', 'radtruss': 'truss', 'shades': 'shade', 'cryo': 'blanket',
              'refinery': 'blanket', 'refinery_rad': 'refinery_rad', 'roll': 'roll'}
    for k, b in objs.items():
        out[k] = b.to_object('F_' + k, mats[matmap[k]], smooth=(k in ('linac', 'roll')))
    return out, mats


def mercury(cam, target, dist=7.5e6):
    """Mercury (MESSENGER albedo) 9,000 km below the foundry, its day side toward us: the Sun is
    overhead (+Z) for both, so the planet fills the lower frame as a bright, cratered backdrop."""
    import mercury as merc
    v = (Vector(target) - Vector(cam)).normalized()
    d = (v + Vector((0.12, 0.10, -0.42))).normalized()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=2.4397e6, location=d * dist)
    o = bpy.context.object
    mat = merc.planet_material(2439.4, 0.0, 0.0, hires=False)
    o.data.materials.append(mat)
    o.scale = (1, 1, 1)
    bpy.ops.object.shade_smooth()
    return o


def thermal(objs, lo=250.0, hi=360.0):
    import hero
    E = {'detail': 0.6, 'pv': 0.85, 'radiators': 0.9, 'modules': 0.6, 'cryo': 0.6, 'refinery': 0.6, 'refinery_rad': 0.9,
         'spine': 0.3, 'pvtruss': 0.3, 'radtruss': 0.3, 'linac': 0.6, 'shades': 0.05, 'roll': 0.85}
    T = {'detail': 310.0, 'pv': 336.0, 'radiators': 320.0, 'modules': 300.0, 'cryo': 290.0, 'refinery': 340.0, 'refinery_rad': 1000.0,
         'spine': 330.0, 'pvtruss': 340.0, 'radtruss': 330.0, 'linac': 300.0, 'shades': 380.0, 'roll': 300.0}
    tb = {}
    for k, o in objs.items():
        t = sail.brightness_temp(T[k], E[k])
        tb[k] = round(t, 1)
        m = sail._new_mat('IR_' + k)
        g = sail.NT(m)
        out = g.node('ShaderNodeOutputMaterial')
        tc = g.node('ShaderNodeTexCoord')
        nz = g.node('ShaderNodeTexNoise', Scale=0.02, Detail=3.0)
        g.L.new(tc.outputs['Object'], nz.inputs['Vector'])
        x, y, z = g.sep(tc.outputs['Object'])
        spread = 10.0 if k in ('radiators', 'pv') else 4.0
        # radiators run hottest at their roots on the spine (vapour enters there)
        root = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, g.math('DIVIDE', g.math('ABSOLUTE', y), 150.0, clamp=True)), 8.0) if k == 'radiators' else 0.0
        Tn = g.math('ADD', g.math('ADD', t - spread / 2, g.math('MULTIPLY', nz.outputs['Fac'], spread)), root)
        frac = g.math('DIVIDE', g.math('SUBTRACT', Tn, lo), hi - lo, clamp=True)
        ramp = g.node('ShaderNodeValToRGB')
        cr = ramp.color_ramp
        for i in range(9):
            cr.elements.new(0.5)
        for el, sx in zip(cr.elements, [i / 10 for i in range(11)]):
            el.position = sx
            el.color = (*hero.inferno(sx), 1)
        g.L.new(frac, ramp.inputs['Fac'])
        em = g.node('ShaderNodeEmission', Strength=1.0)
        g.L.new(ramp.outputs['Color'], em.inputs['Color'])
        g.L.new(em.outputs[0], out.inputs['Surface'])
        o.data.materials.clear()
        o.data.materials.append(m)
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o)
    return tb


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--res', default='2400x1350')
    ap.add_argument('--samples', type=int, default=192)
    ap.add_argument('--thermal', action='store_true')
    ap.add_argument('--cam', default='-520,-430,330')
    ap.add_argument('--target', default='60,40,-40')
    ap.add_argument('--lens', type=float, default=24.0)
    ap.add_argument('--ev', type=float, default=0.0)
    a = ap.parse_args(argv)
    spec = sail.load_spec()
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 5
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    objs, mats = build(spec)
    # attitude error 0.4 deg in the radiators' own plane, so edge-on stays edge-on
    lib.add_sun(R_AU, direction=(0.0, math.sin(math.radians(0.4)), -1.0))
    cam = lib.camera(Vector(tuple(float(v) for v in a.cam.split(','))), Vector(tuple(float(v) for v in a.target.split(','))), lens=a.lens)
    cam.data.clip_end = 2e8
    if not a.thermal:
        mercury(tuple(float(v) for v in a.cam.split(',')), tuple(float(v) for v in a.target.split(',')))
    lib.meter(sc, lib.flux(R_AU), ev_offset=a.ev)
    info = {}
    if a.thermal:
        info['brightness_T'] = thermal(objs)
        sc.view_settings.use_white_balance = False
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
        sc.view_settings.exposure = 0
    sc.render.image_settings.file_format = 'PNG' if a.thermal else 'OPEN_EXR'
    sc.render.image_settings.color_depth = '16' if a.thermal else '32'
    print(json.dumps({'exposure': sc.view_settings.exposure, **info}))
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
