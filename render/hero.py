"""Hero photograph of one swarm satellite in heliocentric orbit.

Lighting is only what exists out there: the Sun at its true irradiance and angular size for the
orbit, nothing else (no fill light, no environment glow). The radiator blades are held knife-edge
to the Sun; a realistic attitude error of ~1 deg gives them a grazing light that shows the coolant
ribs. Exposure is metered like a camera on a sunlit subject.

Usage: blender -b --python render/hero.py -- <spec.json|-> <out.png> [--r 0.6] [--view three_quarter]
       [--samples 256] [--res 1920x1080]
"""
import sys
import os
import json
import math
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
import satellite  # noqa: E402

VIEWS = {
    # camera position relative to the satellite, target, lens (mm), sun tilt (deg off knife-edge)
    'three_quarter': dict(cam=(-0.55, -0.70, 0.45), target=(0.03, 0.0, -0.02), lens=35, tilt=(1.2, -0.8)),
    'raking_radiator': dict(cam=(0.10, -0.32, 0.10), target=(0.0, -0.18, -0.03), lens=28, tilt=(0.6, -2.0)),
    'backlit': dict(cam=(0.35, 0.25, -0.75), target=(0.0, 0.0, 0.15), lens=24, tilt=(2.5, 1.5)),
    # camera on the sunward side looking down the wing: the Sun's reflection in the cover glass sits
    # at the antisolar point, which this framing puts on the left wing
    'glint': dict(cam=(-0.30, -0.05, 0.72), target=(-0.14, 0.06, 0.0), lens=28, tilt=(0.4, -0.3)),
    'module_close': dict(cam=(-0.09, -0.07, -0.06), target=(0.0, 0.0, -0.01), lens=50, tilt=(1.0, -1.0)),
}


INFERNO = [(0.0015, 0.0005, 0.0139), (0.0874, 0.0447, 0.2245), (0.2582, 0.0386, 0.4065),
           (0.4162, 0.0902, 0.4329), (0.5783, 0.148, 0.4044), (0.7357, 0.2159, 0.3302),
           (0.8650, 0.3168, 0.2261), (0.9540, 0.4692, 0.0992), (0.9876, 0.6453, 0.0399),
           (0.9640, 0.8434, 0.2730), (0.9884, 0.9984, 0.6449)]


def inferno(t):
    t = min(1, max(0, t)) * (len(INFERNO) - 1)
    i = min(len(INFERNO) - 2, int(t))
    f = t - i
    c = [a + (b - a) * f for a, b in zip(INFERNO[i], INFERNO[i + 1])]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]   # to linear


def thermal_view(sc, root, temps, lo=250.0, hi=450.0):
    """Replace every material by its brightness temperature in false colour (like an LWIR camera
    with a fixed 250-450 K scale) and remove the Sun: a thermal camera sees emitted light only."""
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o)
    def kind(name):
        n = name.split('.')[0]
        if n.startswith('PV_'):
            return 'pv'
        if n.startswith(('Radiator', 'Header', 'EdgeGuard', 'FlexLine')):
            return 'rad'
        if n.startswith(('ComputeModule', 'Manifold', 'PumpPackage', 'AvionicsRadiator', 'Rail')):
            return 'module'
        if n.startswith('PVFrame'):
            return 'pv'
        return 'structure'
    cache = {}
    # coolant enters each blade at the root and leaves 10 K cooler at the tip
    blades = [o for o in root.children_recursive if o.name.startswith('Radiator_')]
    ymax = max((abs(o.location.y) for o in blades), default=1.0)
    ymin = min((abs(o.location.y) for o in blades), default=0.0)
    for o in root.children_recursive:
        if o.type != 'MESH':
            continue
        k = kind(o.name)
        T = temps.get(k, temps.get('structure', 300))
        if o.name.startswith('Radiator_') and ymax > ymin:
            frac = (abs(o.location.y) - ymin) / (ymax - ymin)
            T = T + 5 - 10 * frac
            k = f'rad{round(T)}'
        if k not in cache:
            m = bpy.data.materials.new(f'IR_{k}')
            m.use_nodes = True
            nt = m.node_tree
            for n in list(nt.nodes):
                nt.nodes.remove(n)
            out = nt.nodes.new('ShaderNodeOutputMaterial')
            em = nt.nodes.new('ShaderNodeEmission')
            em.inputs['Color'].default_value = (*inferno((T - lo) / (hi - lo)), 1)
            em.inputs['Strength'].default_value = 1.0
            nt.links.new(em.outputs[0], out.inputs['Surface'])
            cache[k] = m
        o.data.materials.clear()
        o.data.materials.append(cache[k])
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('spec')
    ap.add_argument('out')
    ap.add_argument('--r', type=float, default=0.6)
    ap.add_argument('--view', default='three_quarter')
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--res', default='1920x1080')
    ap.add_argument('--thermal', default='', help='JSON {"pv":K,"rad":K,"module":K,"structure":K}: render as an 8-14 um camera')
    a = ap.parse_args(argv)
    spec = None
    if a.spec != '-':
        with open(a.spec) as f:
            spec = json.load(f)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    mats = lib.mat_library()
    root, s = satellite.build(mats, spec)
    span = s['wing_span']
    v = VIEWS[a.view]
    tx, ty = (math.radians(t) for t in v['tilt'])
    # light travels mostly -Z (from the Sun at +Z), tilted slightly so blades catch grazing light
    lib.add_sun(a.r, direction=(math.sin(tx), math.sin(ty), -1.0))
    cam = Vector(v['cam']) * span
    tgt = Vector(v['target']) * span
    lib.camera(cam, tgt, lens=v['lens'], dof=8.0)
    lib.meter(sc, lib.flux(a.r), ev_offset=-0.3)
    if a.thermal:
        thermal_view(sc, root, json.loads(a.thermal))
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    main(argv)
