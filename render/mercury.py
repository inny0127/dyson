"""Mercury from orbit, from MESSENGER data, lit by the Sun at Mercury's distance.

- Albedo: MESSENGER MDIS mosaic calibrated to a mean linear albedo of 0.080 (assets/manifest.json).
- Relief: USGS MESSENGER 665 m DEM, as true displacement on a dense sphere plus shader bump, so the
  terminator shows real craters.
- Regolith scattering: rough Oren-Nayar diffuse (airless, lunar-like: flat-looking disc, sharp terminator).
- Industry layer (optional): fresh excavated ground (brighter, unweathered), and the night side covered by
  ~1000 K radiator fields once mining is heat-limited (glow computed from the blackbody law).
Units: km. Usage:
  blender -b --python render/mercury.py -- out.png [--phase 70] [--radius-km 2439.4] [--industry 0..1]
         [--night-glow-K 0] [--expose day|night] [--res 1600x1600] [--samples 128] [--lon 0]
"""
import sys
import os
import math
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402

ASSETS = os.path.join(lib.REPO, 'assets')
R_REF_KM = 2439.4
SIGMA = 5.670374419e-8


def planet_material(radius_km, industry, glow_K, hires=True, sun_dir=(1, 0, 0)):
    m = bpy.data.materials.new('MercurySurface')
    m.use_nodes = True
    m.displacement_method = 'BOTH'
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping'); mp.vector_type = 'VECTOR'; mp.inputs['Scale'].default_value = (1, -1, 1)
    L.new(tc.outputs['Object'], mp.inputs['Vector'])

    alb = N.new('ShaderNodeTexEnvironment')
    alb.image = bpy.data.images.load(os.path.join(ASSETS, 'mercury_albedo_8k.jpg' if hires else 'mercury_albedo_4k.jpg'))
    alb.image.colorspace_settings.name = 'sRGB'
    L.new(mp.outputs['Vector'], alb.inputs['Vector'])

    hgt = N.new('ShaderNodeTexEnvironment')
    hgt.image = bpy.data.images.load(os.path.join(ASSETS, 'mercury_height_8k.jp2' if hires else 'mercury_height_4k.png'))
    hgt.image.colorspace_settings.name = 'Non-Color'
    hgt.interpolation = 'Cubic'
    L.new(mp.outputs['Vector'], hgt.inputs['Vector'])

    # height (km) = (-6000 + 65535 n) / 1000 ; displacement along the normal
    disp = N.new('ShaderNodeDisplacement')
    disp.inputs['Midlevel'].default_value = 6000 / 65535
    disp.inputs['Scale'].default_value = 65.535                    # km per unit of n
    L.new(hgt.outputs['Color'], disp.inputs['Height'])
    L.new(disp.outputs['Displacement'], out.inputs['Displacement'])

    # industry: processed ground is darker (fines and slag, albedo ~0.05) in a noise-shaped footprint
    col = alb.outputs['Color']
    if industry > 0:
        # industrial footprint: Voronoi 'fields' separated by corridors, switched on by a coarse noise
        # so coverage grows with `industry` (fraction of the surface)
        vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'
        vor.inputs['Scale'].default_value = 180.0 / radius_km
        L.new(tc.outputs['Object'], vor.inputs['Vector'])
        edge = N.new('ShaderNodeMath'); edge.operation = 'GREATER_THAN'; edge.inputs[1].default_value = 0.035
        L.new(vor.outputs['Distance'], edge.inputs[0])
        cell = N.new('ShaderNodeTexVoronoi'); cell.inputs['Scale'].default_value = 180.0 / radius_km
        L.new(tc.outputs['Object'], cell.inputs['Vector'])
        on = N.new('ShaderNodeMath'); on.operation = 'LESS_THAN'; on.inputs[1].default_value = industry
        L.new(cell.outputs['Color'], on.inputs[0])
        both = N.new('ShaderNodeMath'); both.operation = 'MULTIPLY'
        L.new(edge.outputs[0], both.inputs[0]); L.new(on.outputs[0], both.inputs[1])
        ramp = N.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        L.new(both.outputs[0], ramp.inputs['Fac'])
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        part = N.new('ShaderNodeMath'); part.operation = 'MULTIPLY'; part.inputs[1].default_value = 0.55
        L.new(ramp.outputs['Color'], part.inputs[0])
        L.new(part.outputs[0], mix.inputs['Factor'])
        L.new(col, mix.inputs[6])
        # excavation exposes unweathered rock, brighter than space-weathered regolith (as fresh crater rays are)
        mix.inputs[7].default_value = (0.140, 0.130, 0.116, 1)
        col = mix.outputs[2]
        industry_mask = ramp.outputs['Color']
    else:
        industry_mask = None

    dif = N.new('ShaderNodeBsdfDiffuse')
    dif.inputs['Roughness'].default_value = 1.0
    L.new(col, dif.inputs['Color'])
    shader = dif.outputs['BSDF']

    if glow_K > 0:
        # radiator fields at glow_K cover the industrial footprint; emission = sigma T^4 / pi per m^2
        bb = N.new('ShaderNodeBlackbody'); bb.inputs['Temperature'].default_value = glow_K
        em = N.new('ShaderNodeEmission')
        L.new(bb.outputs['Color'], em.inputs['Color'])
        radiance = 0.9 * SIGMA * glow_K ** 4 / math.pi                 # W/(m^2 sr), all wavelengths
        # Cycles' emission strength is radiance in our convention; the blackbody node's colour is
        # luminance-normalised, so scale by the visible fraction instead of the bolometric total
        em.inputs['Strength'].default_value = radiance * visible_fraction(glow_K)
        add = N.new('ShaderNodeAddShader')
        # radiators work on the night side only: fade in over ~4 deg past the terminator
        geo = N.new('ShaderNodeNewGeometry')
        dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        L.new(geo.outputs['Normal'], dot.inputs[0]); dot.inputs[1].default_value = sun_dir
        night = N.new('ShaderNodeMapRange'); night.inputs['From Min'].default_value = 0.0
        night.inputs['From Max'].default_value = -0.07; night.inputs['To Min'].default_value = 0; night.inputs['To Max'].default_value = 1
        L.new(dot.outputs['Value'], night.inputs['Value'])
        if industry_mask is not None:
            gate = N.new('ShaderNodeMath'); gate.operation = 'MULTIPLY'
            L.new(industry_mask, gate.inputs[0]); L.new(night.outputs['Result'], gate.inputs[1])
            mul = N.new('ShaderNodeMixShader')
            L.new(gate.outputs[0], mul.inputs['Fac'])
            transparent_black = N.new('ShaderNodeEmission'); transparent_black.inputs['Strength'].default_value = 0
            L.new(transparent_black.outputs[0], mul.inputs[1])
            L.new(em.outputs[0], mul.inputs[2])
            L.new(shader, add.inputs[0]); L.new(mul.outputs[0], add.inputs[1])
        else:
            L.new(shader, add.inputs[0]); L.new(em.outputs[0], add.inputs[1])
        shader = add.outputs[0]
    L.new(shader, out.inputs['Surface'])
    return m


def visible_fraction(T):
    """Fraction of blackbody power between 380 and 780 nm (numerical Planck integral)."""
    h, c, k = 6.62607015e-34, 299792458.0, 1.380649e-23
    def B(l):
        return 2 * h * c * c / l ** 5 / math.expm1(h * c / (l * k * T))
    vis = sum(B(l * 1e-9) for l in range(380, 781, 2)) * 2e-9
    total = SIGMA * T ** 4 / math.pi
    return vis / total


def build(radius_km, industry=0.0, glow_K=0.0, subdiv=8, hires=True, sun_dir=(1, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius_km)
    o = bpy.context.object
    o.name = 'Mercury'
    bpy.ops.object.shade_smooth()
    o.data.materials.append(planet_material(radius_km, industry, glow_K, hires, tuple(sun_dir)))
    return o


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--phase', type=float, default=70.0, help='Sun-Mercury-camera angle (deg)')
    ap.add_argument('--radius-km', type=float, default=R_REF_KM)
    ap.add_argument('--industry', type=float, default=0.0)
    ap.add_argument('--night-glow-K', type=float, default=0.0)
    ap.add_argument('--expose', default='day')
    ap.add_argument('--lon', type=float, default=0.0, help='sub-camera longitude (deg)')
    ap.add_argument('--res', default='1600x1600')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--subdiv', type=int, default=8)
    ap.add_argument('--dist', type=float, default=3.6, help='camera distance in planet radii')
    ap.add_argument('--lens', type=float, default=50)
    ap.add_argument('--ev', type=float, default=0.6)
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 2
    lon = math.radians(a.lon)
    cam_dir = Vector((math.cos(lon), math.sin(lon), 0.18)).normalized()
    # Sun direction: rotate the camera direction by the phase angle about +Z
    ph = math.radians(a.phase)
    sun_dir = Vector((math.cos(lon + ph), math.sin(lon + ph), 0.05)).normalized()   # points from planet to Sun
    build(a.radius_km, a.industry, a.night_glow_K, a.subdiv, sun_dir=sun_dir)
    lib.add_sun(0.387098, direction=tuple(-sun_dir))
    lib.camera(cam_dir * a.radius_km * a.dist, (0, 0, 0), lens=a.lens)
    if a.expose == 'day':
        lib.meter(sc, lib.flux(0.387098), card=0.08, target=0.12, ev_offset=a.ev)
    else:
        # meter on the radiator glow (night side)
        lum = 0.9 * SIGMA * a.night_glow_K ** 4 / math.pi * visible_fraction(a.night_glow_K)
        sc.view_settings.exposure = math.log2(0.25 / max(lum, 1e-12))
    lib.save(sc, a.out)
    print('WROTE', a.out, 'exposure', sc.view_settings.exposure)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
