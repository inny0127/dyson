"""Photographs of one compute sail at its orbit (0.919 AU by default).

Only real light: the Sun at its true irradiance and angular size, black sky. A camera exposed for a
sunlit subject does not record stars (they are ~20 stops fainter), so none are drawn.
Exposure is metered on an 18 % grey card in full sunlight, as a photographer would.

Usage: blender -b --python render/sail_shot.py -- out.png [--view overhead_glint] [--r 0.919]
       [--samples 256] [--res 1920x1080] [--thermal] [--ev 0]
"""
import sys
import os
import math
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
import sail  # noqa: E402

# camera position and target in metres (sail frame: +Z sunward, corners on the axes at ~197 m),
# lens in mm, sun tilt (deg about x, y) for the attitude error of the sail
VIEWS = {
    # high above the sunward face, 12 deg off the normal: the Sun's reflection falls near the camera's
    # nadir, and the curled fold-panel edges turn it into lines along the hinge strips
    'overhead_glint': dict(cam=(-75, -45, 1020), target=(0, 0, 0), lens=42, tilt=(0.15, -0.1)),
    # lower, more oblique: the film recedes; no glint on the film
    'glint_zoom': dict(cam=(-150, -110, 880), target=(-78, -76, 0), lens=150, tilt=(0.15, -0.1)),
    'oblique': dict(cam=(-330, -260, 260), target=(20, 20, -10), lens=30, tilt=(0.15, -0.1)),
    # close to a corner on the sunward side: tensioner, tethers, doubler, vane, hinge strips
    'corner': dict(cam=(176, -14, 9), target=(199, 0, -0.3), lens=28, tilt=(0.15, -0.1)),
    # behind the sail (anti-sun side), looking at the back across the booms
    'back': dict(cam=(140, -120, -70), target=(-10, 10, -1.5), lens=28, tilt=(0.15, -0.1)),
    # sunward of the sail, looking away from the Sun: the counter-sun (the swarm's glint of the Sun)
    # just beyond the +X corner, its halo behind the sail, Earth a few degrees off it (--swarm-sky)
    'counter_sun': dict(cam=(300, 60, 420), target=(105, 18, 0), lens=20, tilt=(0.15, -0.1)),
    # 30 m sunward of a corner and just beyond its tip: tensioner, tethers and vane in front, the film
    # receding, and the counter-sun straight down past the tip
    'corner_counter_sun': dict(cam=(214, 9, 30), target=(190, 3, -12), lens=14, tilt=(0.15, -0.1)),
    # macro on the back: chiplets, a laser terminal, a hinge strip
    'back_macro': dict(cam=(58.0, -4.2, -0.75), target=(59.0, -2.6, -0.02), lens=35, tilt=(0.15, -0.1)),
    # behind the hub: the 30 cm long-range terminals and the boom roots
    'hub_back': dict(cam=(9.0, -7.0, -6.5), target=(0.0, 0.0, -1.6), lens=35, tilt=(0.15, -0.1)),
}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--view', default='overhead_glint')
    ap.add_argument('--r', type=float, default=None)
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--res', default='1920x1080')
    ap.add_argument('--thermal', action='store_true')
    ap.add_argument('--ev', type=float, default=0.0)
    ap.add_argument('--lo', type=float, default=300.0, help='LWIR scale bottom (K, brightness temperature)')
    ap.add_argument('--hi', type=float, default=350.0)
    ap.add_argument('--no-denoise', action='store_true')
    ap.add_argument('--era', default='mid', help="'2026' (design spec) or a model era: low, mid, high")
    ap.add_argument('--swarm-sky', action='store_true', help='the swarm behind: counter-sun, glow, sails as stars, Earth')
    ap.add_argument('--earth-offset', type=float, default=2.6)
    a = ap.parse_args(argv)
    spec = sail.load_spec()
    num = lib.load_numbers()[a.era]['sparse']          # model v4 (node scripts/export-numbers.mjs)
    r = a.r or num['r_AU']
    pitch = num['chip_pitch_m'] if a.era != '2026' else None
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 4
    if a.no_denoise:
        sc.cycles.use_denoising = False
    root, _ = sail.build(spec, era=a.era, pitch=pitch)
    v = VIEWS[a.view]
    tx, ty = (math.radians(t) for t in v['tilt'])
    if not a.swarm_sky:
        lib.add_sun(r, direction=(math.sin(tx), math.sin(ty), -1.0))
        lib.camera(Vector(v['cam']), Vector(v['target']), lens=v['lens'])
    else:
        # swarm_field's frame has +X pointing away from the Sun; turn the sail (sunward +Z) to face -X
        import swarm_field
        R = lambda p: Vector((-p[2], p[1], p[0]))          # rotation of -90 deg about Y
        root.rotation_euler = (0.0, -math.pi / 2, 0.0)
        lib.add_sun(r, direction=tuple(R((math.sin(tx), math.sin(ty), -1.0))))
        cam = lib.camera(R(v['cam']), R(v['target']), lens=v['lens'])
        cam.data.clip_end = 1e12
        fwd = (R(v['target']) - R(v['cam'])).normalized()
        sk = argparse.Namespace(f=0.0041, rho=0.004, rho_film=0.0021, r_in=0.86, r_out=0.92, r_cam=r,
                                lens=v['lens'], dmax=40000.0, seed=3, earth_offset=a.earth_offset)
        sc.cycles.use_adaptive_sampling = False
        swarm_field.build_sky(sc, sk, cam, fwd, w, h, own_sun=False)
        from bpy_extras.object_utils import world_to_camera_view
        bpy.context.view_layer.update()
        pc = world_to_camera_view(sc, cam, cam.location + Vector((1e9, 0, 0)))
        print('PIXEL counter_sun', round(pc.x * w), round((1 - pc.y) * h), 'in front' if pc.z > 0 else 'behind')
        # scene-linear output: the counter-sun and the vanes need real lens glare (render/glare.py)
        sc.render.image_settings.file_format = 'OPEN_EXR'
        sc.render.image_settings.color_depth = '32'
    lib.meter(sc, lib.flux(r), ev_offset=a.ev)
    if a.thermal:
        tb = sail.thermal_view(sc, spec, a.lo, a.hi, pitch=pitch,
                               film_K=num['film_K'] if a.era != '2026' else None,
                               chip_K=num['chip_K'] if a.era != '2026' else None)
        print('BRIGHTNESS_T', {k: round(t, 1) for k, t in tb.items()})
    lib.save(sc, a.out)
    print('WROTE', a.out, 'exposure', sc.view_settings.exposure)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
