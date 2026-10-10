"""The evening sky from Earth with a swarm inside Earth's orbit.

Physics (per sr of sky, repo radiometric units W/(m^2 sr)):
- A swarm shell of radius r (AU) and coverage f around the Sun. From Earth, sight lines within the
  angle asin(r) of the Sun cross the shell twice. Through the near layer's gaps (probability 1 - f)
  you see the far layer's sun-facing fronts (probability f), lit by S(r) and diffusely reflecting
  rho: radiosity B = rho S(r) / (1 - f rho). Dome radiance L = (1 - f) f B / pi, uniform out to
  asin(r) from the Sun, then zero. (Near-layer backs are unlit.) The Sun itself is dimmed by (1 - f)
  unless the orbit design keeps the Sun-Earth line clear.
- Stars from assets/stars.csv as point emitters: E = 2.74e-8 * 10^(-0.4 V) W/m^2 (manifest).
- Atmosphere: Nishita sky for the twilight; the dome glow is attenuated by airmass extinction.
Usage: blender -b --python render/earth_sky.py -- out.png [--r 0.65] [--f 0.1] [--sun-alt -14]
       [--rho 0.03] [--res 1920x1080] [--samples 64] [--az 270] [--ev 0]
"""
import sys
import os
import math
import argparse
import csv
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import lib  # noqa: E402

ASSETS = os.path.join(lib.REPO, 'assets')
LUM_EFF = 93.0   # lm/W for sunlight


def dome_radiance(r_au, f, rho):
    S = lib.flux(r_au)
    B = rho * S / (1 - f * rho)
    return (1 - f) * f * B / math.pi


def direction(alt_deg, az_deg):
    """Horizon frame: +Y north, +X east, +Z up; azimuth from north through east."""
    alt, az = math.radians(alt_deg), math.radians(az_deg)
    return Vector((math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)))


def world(sc, sun_dir, dome_L, dome_radius, ev_target_L):
    w = sc.world
    nt = w.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputWorld')
    sky = N.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = False
    sky.sun_elevation = math.asin(max(-1.0, min(1.0, sun_dir.z)))
    sky.sun_rotation = math.atan2(sun_dir.x, sun_dir.y)
    sky.altitude = 300
    sky.air_density = 1.0
    sky.dust_density = 1.0
    bg = N.new('ShaderNodeBackground')
    # Nishita output is ~W/(m^2 sr) for a 1361 W/m^2 sun when strength is 1
    L.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    # swarm dome: uniform radiance inside the cone around the Sun, extinguished near the horizon
    tc = N.new('ShaderNodeTexCoord')
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L.new(tc.outputs['Generated'], dot.inputs[0])
    dot.inputs[1].default_value = tuple(sun_dir)
    inside = N.new('ShaderNodeMapRange')
    # aerosol forward scattering blurs the shell's limb by a few degrees
    inside.inputs['From Min'].default_value = math.cos(dome_radius + math.radians(4))
    inside.inputs['From Max'].default_value = math.cos(dome_radius - math.radians(2))
    inside.inputs['To Min'].default_value = 0
    inside.inputs['To Max'].default_value = 1
    L.new(dot.outputs['Value'], inside.inputs['Value'])
    # extinction: transmission ~ exp(-0.2 * airmass), airmass ~ 1/max(sin alt, 0.05)
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Generated'], sep.inputs[0])
    clamp = N.new('ShaderNodeMath'); clamp.operation = 'MAXIMUM'; clamp.inputs[1].default_value = 0.05
    L.new(sep.outputs['Z'], clamp.inputs[0])
    am = N.new('ShaderNodeMath'); am.operation = 'DIVIDE'; am.inputs[0].default_value = -0.2
    L.new(clamp.outputs[0], am.inputs[1])
    ex = N.new('ShaderNodeMath'); ex.operation = 'EXPONENT'
    L.new(am.outputs[0], ex.inputs[0])
    above = N.new('ShaderNodeMath'); above.operation = 'GREATER_THAN'; above.inputs[1].default_value = -0.01
    L.new(sep.outputs['Z'], above.inputs[0])
    m1 = N.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'
    L.new(inside.outputs['Result'], m1.inputs[0]); L.new(ex.outputs[0], m1.inputs[1])
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'
    L.new(m1.outputs[0], m2.inputs[0]); L.new(above.outputs[0], m2.inputs[1])
    dome = N.new('ShaderNodeEmission')
    dome.inputs['Color'].default_value = (0.86, 0.90, 1.0, 1)   # sunlight off dark-blue AR-coated Si: slightly blue
    # Rayleigh/Mie scattering of the dome's own light fills the rest of the sky at ~2% of the dome,
    # rising toward the horizon (longer air path)
    glow = N.new('ShaderNodeMath'); glow.operation = 'MULTIPLY'; glow.inputs[1].default_value = 0.02
    airm = N.new('ShaderNodeMath'); airm.operation = 'DIVIDE'; airm.inputs[0].default_value = 1.0
    L.new(clamp.outputs[0], airm.inputs[1])
    airc = N.new('ShaderNodeMath'); airc.operation = 'MINIMUM'; airc.inputs[1].default_value = 6.0
    L.new(airm.outputs[0], airc.inputs[0])
    L.new(airc.outputs[0], glow.inputs[0])
    glow2 = N.new('ShaderNodeMath'); glow2.operation = 'MULTIPLY'
    L.new(glow.outputs[0], glow2.inputs[0]); L.new(above.outputs[0], glow2.inputs[1])
    tot = N.new('ShaderNodeMath'); tot.operation = 'ADD'
    L.new(m2.outputs[0], tot.inputs[0]); L.new(glow2.outputs[0], tot.inputs[1])
    sc_ = N.new('ShaderNodeMath'); sc_.operation = 'MULTIPLY'; sc_.inputs[1].default_value = dome_L
    L.new(tot.outputs[0], sc_.inputs[0])
    L.new(sc_.outputs[0], dome.inputs['Strength'])
    add = N.new('ShaderNodeAddShader')
    L.new(bg.outputs[0], add.inputs[0]); L.new(dome.outputs[0], add.inputs[1])
    L.new(add.outputs[0], out.inputs['Surface'])


def stars(limit_v=6.5, max_n=6000):
    """Stars above the horizon as tiny emissive spheres at 1 km; brightness from V magnitude."""
    path = os.path.join(ASSETS, 'stars.csv')
    rows = []
    with open(path) as f:
        rd = csv.DictReader(f)
        for row in rd:
            v = float(row['vmag'])
            if v > limit_v:
                break
            rows.append((float(row['ra_deg']), float(row['dec_deg']), v, float(row['bv'])))
            if len(rows) >= max_n:
                break
    # observer at latitude 40 N, local sidereal time 18h: equatorial -> horizon frame
    lat = math.radians(40.0)
    lst = math.radians(18 * 15)
    D = 1000.0
    rad = 1.2
    mat_cache = {}
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rad)
    proto = bpy.context.object
    proto.name = 'StarProto'
    objs = []
    for ra, dec, v, bv in rows:
        H = lst - math.radians(ra)
        d = math.radians(dec)
        alt = math.asin(math.sin(d) * math.sin(lat) + math.cos(d) * math.cos(lat) * math.cos(H))
        if alt < math.radians(2):
            continue
        az = math.atan2(-math.cos(d) * math.sin(H), math.sin(d) * math.cos(lat) - math.cos(d) * math.sin(lat) * math.cos(H))
        p = direction(math.degrees(alt), math.degrees(az)) * D
        E = 2.74e-8 * 10 ** (-0.4 * v)                      # W/m^2 at the observer
        # an emissive sphere of radius a at distance D gives irradiance L * pi a^2 / D^2
        Lrad = E * D * D / (math.pi * rad * rad)
        Lrad *= math.exp(-0.2 / max(math.sin(alt), 0.05))   # extinction
        T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))   # Ballesteros B-V -> T
        key = (round(math.log10(Lrad), 1), round(T, -2))
        if key not in mat_cache:
            m = bpy.data.materials.new(f'star{len(mat_cache)}')
            m.use_nodes = True
            nt = m.node_tree
            for n in list(nt.nodes):
                nt.nodes.remove(n)
            o_ = nt.nodes.new('ShaderNodeOutputMaterial')
            em = nt.nodes.new('ShaderNodeEmission')
            bb = nt.nodes.new('ShaderNodeBlackbody'); bb.inputs['Temperature'].default_value = T
            nt.links.new(bb.outputs[0], em.inputs['Color'])
            em.inputs['Strength'].default_value = 10 ** key[0]
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            ad = nt.nodes.new('ShaderNodeAddShader')
            nt.links.new(em.outputs[0], ad.inputs[0]); nt.links.new(tr.outputs[0], ad.inputs[1])
            nt.links.new(ad.outputs[0], o_.inputs['Surface'])
            mat_cache[key] = m
        ob = proto.copy()
        ob.data = proto.data.copy()
        ob.data.materials.append(mat_cache[key])
        ob.location = p
        ob.visible_shadow = False
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    bpy.data.objects.remove(proto)
    return len(objs)


def landscape(seed=4):
    """Rolling grassland with a few trees and a small observatory, lit only by the sky."""
    bpy.ops.mesh.primitive_plane_add(size=80000, location=(0, 0, -30))
    g = bpy.context.object
    g.name = 'Ground'
    mod = g.modifiers.new('sub', 'SUBSURF'); mod.levels = 0; mod.render_levels = 0
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=200)
    bpy.ops.object.mode_set(mode='OBJECT')
    tex = bpy.data.textures.new('hills', 'CLOUDS')
    tex.noise_scale = 4000
    disp = g.modifiers.new('hills', 'DISPLACE'); disp.texture = tex; disp.strength = 260; disp.mid_level = 0.5
    m = lib.principled('Grass', (0.06, 0.07, 0.035), rough=0.9)
    g.data.materials.append(m)
    rnd = random.Random(seed)
    trunk = lib.principled('Bark', (0.05, 0.04, 0.03), rough=0.9)
    leaves = lib.principled('Leaves', (0.03, 0.05, 0.025), rough=0.8)
    for i in range(140):
        a = rnd.uniform(-math.pi, math.pi)
        d = rnd.uniform(40, 1400)
        x, y = math.cos(a) * d, math.sin(a) * d
        h = rnd.uniform(9, 24)
        if rnd.random() < 0.6:
            # conifer: stacked jittered cones
            for k in range(4):
                rr = h * (0.22 - 0.045 * k)
                bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=rr, radius2=0, depth=h * 0.42,
                                                location=(x + rnd.uniform(-0.3, 0.3), y + rnd.uniform(-0.3, 0.3), h * (0.25 + 0.17 * k)))
                bpy.context.object.rotation_euler = (rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), rnd.uniform(0, 6.3))
                bpy.context.object.data.materials.append(leaves)
        else:
            # broadleaf: trunk + a few overlapping irregular blobs
            bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=h * 0.55, location=(x, y, h * 0.27), vertices=8)
            bpy.context.object.data.materials.append(trunk)
            for k in range(5):
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=h * rnd.uniform(0.16, 0.26),
                                                      location=(x + rnd.uniform(-h * 0.2, h * 0.2), y + rnd.uniform(-h * 0.2, h * 0.2), h * rnd.uniform(0.55, 0.85)))
                o = bpy.context.object
                o.scale = (rnd.uniform(0.8, 1.2), rnd.uniform(0.8, 1.2), rnd.uniform(0.7, 1.0))
                tx = bpy.data.textures.new('leafnoise', 'CLOUDS'); tx.noise_scale = 1.2
                dm = o.modifiers.new('rough', 'DISPLACE'); dm.texture = tx; dm.strength = h * 0.06
                o.data.materials.append(leaves)
    # observatory dome to the west
    white = lib.principled('Dome', (0.6, 0.6, 0.6), rough=0.4)
    bpy.ops.mesh.primitive_cylinder_add(radius=4, depth=5, location=(-140, 260, 2.5))
    bpy.context.object.data.materials.append(white)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=4, location=(-140, 260, 5))
    bpy.context.object.data.materials.append(white)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--r', type=float, default=0.65)
    ap.add_argument('--f', type=float, default=0.1)
    ap.add_argument('--rho', type=float, default=0.03)
    ap.add_argument('--sun-alt', type=float, default=-14.0)
    ap.add_argument('--sun-az', type=float, default=295.0)
    ap.add_argument('--az', type=float, default=290.0, help='camera azimuth')
    ap.add_argument('--alt', type=float, default=14.0, help='camera altitude angle')
    ap.add_argument('--lens', type=float, default=20)
    ap.add_argument('--res', default='1920x1080')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--ev', type=float, default=0.0)
    ap.add_argument('--no-stars', action='store_true')
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 4
    sun_dir = direction(a.sun_alt, a.sun_az)
    L_dome = dome_radiance(a.r, a.f, a.rho)
    world(sc, sun_dir, L_dome, math.asin(min(0.999, a.r)), L_dome)
    landscape()
    n = 0 if a.no_stars else stars()
    eye = Vector((0, 0, 1.7))
    cam = lib.camera(eye, eye + direction(a.alt, a.az), lens=a.lens)
    # eye adaptation: meter on the brightest broad source in view (the dome, or the natural night)
    L_ref = max(L_dome * 0.5, 2e-6)
    sc.view_settings.exposure = math.log2(0.18 / L_ref) + a.ev
    print(f'dome radiance {L_dome:.3g} W/m2/sr = {L_dome * LUM_EFF:.3g} cd/m2; stars {n}; exposure {sc.view_settings.exposure:.2f}')
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
