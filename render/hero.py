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
    'module_close': dict(cam=(-0.09, -0.07, -0.06), target=(0.0, 0.0, -0.01), lens=50, tilt=(1.0, -1.0)),
}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('spec')
    ap.add_argument('out')
    ap.add_argument('--r', type=float, default=0.6)
    ap.add_argument('--view', default='three_quarter')
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--res', default='1920x1080')
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
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    main(argv)
