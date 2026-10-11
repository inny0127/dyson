"""A mass driver on Mercury's equator at sunrise, launching at perihelion.

Model numbers (src/model/constants.js INDUSTRY, model.js launchFromMercury):
- launch speed sqrt(v_esc^2 + v_inf^2) = 7.8 km/s onto the transfer to the sail orbit,
  launched tangentially at perihelion (Mercury's 59 km/s orbital speed does most of the work);
- acceleration 100 g, so the track is v^2 / 2a = 31.3 km long.
A straight 31 km track on a 2,440 km planet cannot follow the ground: the surface falls away
beneath it as d^2 / 2R, so the far end stands 200 m up and the track runs over the horizon into
the sky. It is a coilgun (drive coils every 0.5 m), not a railgun: nothing slides, so nothing
erodes at 10 t/s.
Sun: perihelion, 0.307 AU, 14.4 kW/m^2, 1.74 deg across, 4 deg above the horizon.

Usage: blender -b --python render/mass_driver.py -- out.exr [--res 2400x1350] [--samples 192]
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
from mercury_surface import crater_height, regolith_material, R_M  # noqa: E402
from meshkit import Batch  # noqa: E402

G0 = 9.80665
ACCEL = 100 * G0
V_LAUNCH = 7831.5            # m/s, model central case (logistics.sail.vLaunch)
L_TRACK = V_LAUNCH ** 2 / (2 * ACCEL)
H0 = 6.0                     # m, track axis above the ground at the breech
TRACK_X = 0.0


def z_ground(x, y):
    return -(x * x + y * y) / (2 * R_M)


def ground(rng, cam):
    """Polar grid round the camera, curvature, craters; a graded berm under the first km."""
    radii = np.concatenate([[0.0], np.geomspace(0.3, 12000.0, 420)])
    th = np.linspace(-math.pi, math.pi, 1601)[:-1]
    Rr, Th = np.meshgrid(radii, th, indexing='ij')
    X, Y = cam[0] + Rr * np.cos(Th), cam[1] + Rr * np.sin(Th)
    Zc, n = crater_height(X - cam[0], Y - cam[1], rng, area_r=12000.0)
    Zc += 0.8 * np.sin(X / 41.0 + 0.3) * np.sin(Y / 67.0) + 0.3 * np.sin(X / 11.3) * np.cos(Y / 9.1)
    berm = np.clip(1 - (np.abs(X - TRACK_X) - 18) / 25, 0, 1) * np.clip((Y + 60) / 40, 0, 1)
    Z = Zc * (1 - berm) + 0.4 * berm + z_ground(X, Y)
    nr, nt = Z.shape
    co = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()]).astype(np.float32)
    i = (np.arange(nr - 1)[:, None] * nt + np.arange(nt)[None, :])
    j = (np.arange(nr - 1)[:, None] * nt + (np.arange(nt)[None, :] + 1) % nt)
    quads = np.stack([i, j, j + nt, i + nt], -1).reshape(-1, 4)
    me = bpy.data.meshes.new('Ground')
    me.vertices.add(len(co)); me.vertices.foreach_set('co', co.ravel())
    me.loops.add(quads.size); me.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me.polygons.add(len(quads)); me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    at = me.attributes.new('graded', 'FLOAT', 'POINT')
    at.data.foreach_set('value', berm.ravel().astype(np.float32))
    ob = bpy.data.objects.new('Ground', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, n


def boulders(rng, cam, mat, n=260):
    """Ejecta blocks: more and larger near small fresh craters; sizes 0.2-2.5 m within 300 m."""
    bm = bmesh.new()
    for k in range(n):
        d = 4 + 300 * rng.random() ** 1.6
        a = rng.uniform(-math.pi, math.pi)
        x, y = cam[0] + d * math.cos(a), cam[1] + d * math.sin(a)
        if abs(x - TRACK_X) < 22 and y > -50:
            continue
        s = 0.15 + 2.2 * rng.random() ** 3
        pts = []
        for _ in range(16):
            v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
            pts.append(Vector((v.x * s * rng.uniform(0.7, 1.1), v.y * s * rng.uniform(0.7, 1.1), v.z * s * rng.uniform(0.4, 0.8))))
        tmp = bmesh.new()
        vs = [tmp.verts.new(p) for p in pts]
        bmesh.ops.convex_hull(tmp, input=vs)
        z0 = z_ground(x, y) - 0.25 * s
        for f in tmp.faces:
            bm.faces.new([bm.verts.new(v.co + Vector((x, y, z0))) for v in f.verts])
        tmp.free()
    return sail._obj('Boulders', bm, mat)


def track(mats, detail_to=1500.0):
    """Coil tube on a box girder, on pylons every 30 m, straight from the breech to the muzzle;
    pylons grow as the planet falls away beneath (braced every 8 m once over 12 m tall)."""
    steel, coils, power = Batch(), Batch(), Batch()
    seg = 30.0
    ys = np.arange(-20.0, L_TRACK, seg)
    y1 = np.minimum(ys + seg, L_TRACK)
    n = len(ys)
    # girder
    steel.boxes(np.column_stack([np.full(n, TRACK_X), (ys + y1) / 2, np.full(n, H0 - 1.25)]),
                np.column_stack([np.full(n, 1.4), y1 - ys, np.full(n, 0.8)]))
    # pylons
    zg = z_ground(TRACK_X, ys)
    hgt = H0 - 1.65 - zg
    spread = 1.6 + 0.08 * hgt
    A, B, R = [], [], []
    for sgn in (-1, 1):
        A.append(np.column_stack([TRACK_X + sgn * spread, ys, zg - 0.5]))
        B.append(np.column_stack([np.full(n, TRACK_X + sgn * 0.5), ys, np.full(n, H0 - 1.65)]))
        R.append(0.10 + 0.0012 * hgt)
    steel.rods(np.concatenate(A), np.concatenate(B), np.concatenate(R), 8)
    bA, bB = [], []
    for y, z0, hh, sp in zip(ys, zg, hgt, spread):
        if hh <= 12:
            continue
        for zz in np.arange(z0 + 10, H0 - 3, 16.0):
            f = (zz - z0) / hh
            wv = sp * (1 - f) + 0.5 * f
            bA.append((TRACK_X - wv, y, zz)); bB.append((TRACK_X + wv, y, zz))
    steel.rods(np.array(bA), np.array(bB), 0.05, 6)
    # drive coils every 0.5 m near the breech; beyond, the coil stack reads as a ribbed tube
    yc = np.arange(-20.0, detail_to, 0.5)
    coils.rings(np.column_stack([np.full(len(yc), TRACK_X), yc, np.full(len(yc), H0)]), (0, 1, 0), 0.8, 0.6, 0.22, 28)
    far = ys >= detail_to
    coils.rods(np.column_stack([np.full(far.sum(), TRACK_X), ys[far], np.full(far.sum(), H0)]),
               np.column_stack([np.full(far.sum(), TRACK_X), y1[far], np.full(far.sum(), H0)]), 0.8, 24)
    # longitudinal ties round the coils (near part) and busbars along the girder
    near = ys < detail_to
    for ang in (0.3, 2.4, 4.5):
        dx, dz = 0.84 * math.cos(ang), 0.84 * math.sin(ang)
        steel.rods(np.column_stack([np.full(near.sum(), TRACK_X + dx), ys[near], np.full(near.sum(), H0 + dz)]),
                   np.column_stack([np.full(near.sum(), TRACK_X + dx), y1[near], np.full(near.sum(), H0 + dz)]), 0.05, 6)
    for dx in (-0.9, 0.9):
        power.rods(np.column_stack([np.full(n, TRACK_X + dx), ys, np.full(n, H0 - 1.5)]),
                   np.column_stack([np.full(n, TRACK_X + dx), y1, np.full(n, H0 - 1.5)]), 0.09, 6)
    # energy-storage houses every 400 m along the first 6 km (flywheels feeding the coil drivers)
    yh = np.arange(60.0, 6000.0, 400.0)
    zh = z_ground(TRACK_X + 14, yh)
    power.boxes(np.column_stack([np.full(len(yh), TRACK_X + 14), yh, zh + 2.0]), np.tile([8.0, 16.0, 4.0], (len(yh), 1)))
    power.rods(np.column_stack([np.full(len(yh), TRACK_X + 10), yh, zh + 3.0]),
               np.column_stack([np.full(len(yh), TRACK_X + 0.9), yh, np.full(len(yh), H0 - 1.5)]), 0.1, 6)
    power.boxes([[TRACK_X, -45.0, 4.0]], [[14.0, 40.0, 8.0]])
    return (steel.to_object('TrackSteel', mats['steel']), coils.to_object('TrackCoils', mats['coil'], smooth=True),
            power.to_object('TrackPower', mats['house']))


def canister(mats, y, v, shutter):
    """Payload in flight: a 1.4 m canister (folded film roll inside), blurred by its motion."""
    bm = bmesh.new()
    mtx = Matrix.Translation((TRACK_X, y, H0)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.55, radius2=0.55, depth=3.6, matrix=mtx)
    o = sail._obj('Canister', bm, mats['canister'], smooth=True)
    sc = bpy.context.scene
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 1.0
    sc.frame_set(1)
    o.location = (0, -v * shutter / 2, 0)
    o.keyframe_insert('location', frame=1)
    o.location = (0, v * shutter / 2, 0)
    o.keyframe_insert('location', frame=2)
    for fc in o.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    sc.frame_set(1)
    sc.render.motion_blur_position = 'START'
    return o


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--res', default='2400x1350')
    ap.add_argument('--samples', type=int, default=192)
    ap.add_argument('--sun-alt', type=float, default=4.0)
    ap.add_argument('--sun-az', type=float, default=270.0, help='deg from the track direction toward +X; at perihelion the launch site has the Sun on the horizon at 90 deg to the track')
    ap.add_argument('--cam', default='-16,18,4.2')
    ap.add_argument('--target', default='2,480,5.2')
    ap.add_argument('--lens', type=float, default=26.0)
    ap.add_argument('--ev', type=float, default=2.6)
    ap.add_argument('--canister-y', type=float, default=160.0)
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 4
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    rng = random.Random(5)
    cam = tuple(float(v) for v in a.cam.split(','))
    gr, ncr = ground(rng, cam)
    gr.data.materials.append(regolith_material())
    mats = {
        'steel': lib.principled('TrackSteel', (0.30, 0.30, 0.31), rough=0.45, metal=0.85),
        'coil': lib.principled('CoilAl', (0.80, 0.80, 0.80), rough=0.3, metal=1.0),
        'house': lib.principled('StorageHouse', (0.55, 0.54, 0.51), rough=0.7, metal=0.2),
        'canister': lib.principled('Canister', (0.75, 0.74, 0.72), rough=0.35, metal=0.9),
        'rock': lib.principled('Ejecta', (0.11, 0.105, 0.10), rough=0.9),
    }
    boulders(rng, cam, mats['rock'])
    track(mats)
    v = math.sqrt(2 * ACCEL * a.canister_y)
    canister(mats, a.canister_y, v, 1 / 2000)
    # the Sun at perihelion, low over the eastern horizon
    r_au = 0.3075
    alt, az = math.radians(a.sun_alt), math.radians(a.sun_az)
    d = Vector((math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)))
    lib.add_sun(r_au, direction=tuple(-d))
    lib.camera(Vector(cam), Vector(tuple(float(v) for v in a.target.split(','))), lens=a.lens)
    lib.meter(sc, lib.flux(r_au), ev_offset=a.ev)
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    print(json.dumps({'track_m': L_TRACK, 'muzzle_height_m': H0 - z_ground(0, L_TRACK), 'canister_v': v,
                      'craters': ncr, 'exposure': sc.view_settings.exposure}))
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
