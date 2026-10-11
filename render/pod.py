"""A 1 MW pod, built from the design spec (docs/data/design_spec.json, render_spec parts "pod_*").

Pod frame: +Z toward the Sun (light travels -Z). Two PV wings in the XY plane along X; four
knife-edge radiator blades in the YZ plane along Y, edge-on to the Sun; the module at the origin.
In the mature era the module is a shielded block of memory bonded on logic (no HBM); the outside is
the same: an aluminised glass-cloth blanket over Mg/MgO shield panels.

What sunlight does to it (scene facts): the blades are never sunlit except their 25 mm sunward edges
and header lips, so in a photograph exposed for the sunlit module they are black faces with thin
bright lines; the wings are as dark as sail fronts; the module, trusses and loop sleeves are the
bright parts. In thermal infrared the order reverses: the blades at 345-355 K are the brightest.

Usage: blender -b --python render/pod.py -- out.png [--view hero] [--thermal] [--res 2400x1350]
       [--samples 256] [--r 0.88]
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import lib  # noqa: E402
import sail  # noqa: E402
from sail import NT, _new_mat, _principled, simple_material, _obj, _rod, _box  # noqa: E402


def radiator_material(spec, pitch=0.10, ridge=0.003):
    """White Mg/Ca-silicate coated Mg facesheets with heat-pipe ridges along Z every 0.10 m."""
    M = spec['materials']['pod_radiator']
    m = _new_mat('PodRadiator')
    g = NT(m)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    x, y, z = g.sep(tc.outputs['Object'])
    b = _principled(g, M)
    # ridge profile: half-cylinder bumps of the 12 mm pipes under the facesheet
    t = g.math('FRACT', g.math('DIVIDE', y, pitch))
    d = g.math('ABSOLUTE', g.math('SUBTRACT', t, 0.5))
    prof = g.math('SQRT', g.math('MAXIMUM', g.math('SUBTRACT', 1.0, g.math('MULTIPLY', g.math('DIVIDE', d, 0.06), g.math('DIVIDE', d, 0.06))), 0.0))
    bump = g.node('ShaderNodeBump', Strength=1.0, Distance=ridge)
    g.L.new(prof, bump.inputs['Height'])
    nz = g.node('ShaderNodeTexNoise', Scale=2.0, Detail=6.0)
    g.L.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = g.node('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.74, 0.74, 0.72, 1)
    ramp.color_ramp.elements[1].color = (0.84, 0.84, 0.82, 1)
    g.L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    g.L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    g.L.new(bump.outputs['Normal'], b.inputs['Normal'])
    g.L.new(b.outputs[0], out.inputs['Surface'])
    return m


def glass_cloth_material(name='PodGlassCloth'):
    """Outer layer of the module's blanket: woven glass cloth (IR emissivity 0.6) over aluminised
    layers. Diffuse off-white weave with the metal glinting through the crinkles."""
    m = _new_mat(name)
    g = NT(m)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    b = g.node('ShaderNodeBsdfPrincipled')
    b.inputs['Roughness'].default_value = 0.55
    b.inputs['Metallic'].default_value = 0.25
    nz = g.node('ShaderNodeTexNoise', Scale=3.0, Detail=8.0)
    g.L.new(tc.outputs['Object'], nz.inputs['Vector'])
    vor = g.node('ShaderNodeTexVoronoi', Scale=5.0)
    g.L.new(tc.outputs['Object'], vor.inputs['Vector'])
    ramp = g.node('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.50, 0.49, 0.46, 1)
    ramp.color_ramp.elements[1].color = (0.70, 0.69, 0.66, 1)
    g.L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    g.L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    weave = g.node('ShaderNodeTexWave', Scale=180.0, Distortion=0.0)
    g.L.new(tc.outputs['Object'], weave.inputs['Vector'])
    h = g.math('ADD', g.math('ADD', g.math('MULTIPLY', vor.outputs['Distance'], 1.0), nz.outputs['Fac']), g.math('MULTIPLY', weave.outputs['Fac'], 0.05))
    bump = g.node('ShaderNodeBump', Strength=0.45, Distance=0.015)
    g.L.new(h, bump.inputs['Height'])
    g.L.new(bump.outputs['Normal'], b.inputs['Normal'])
    g.L.new(b.outputs[0], out.inputs['Surface'])
    return m


def truss(bm, a, b, side=0.8, rod=0.022, bay=0.8, up=Vector((0, 0, 1))):
    """Triangular truss from a to b: three longerons, battens every bay, one diagonal per face."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    L = (b - a).length
    u = axis.cross(up)
    if u.length < 1e-6:
        u = axis.cross(Vector((1, 0, 0)))
    u.normalize()
    v = u.cross(axis).normalized()
    R = side / math.sqrt(3)
    corners = [u * R * math.cos(t) + v * R * math.sin(t) for t in (math.pi / 2, math.pi / 2 + 2.0944, math.pi / 2 + 4.1888)]
    for c in corners:
        _rod(bm, a + c, b + c, rod, 6)
    n = max(1, int(L / bay))
    for k in range(n + 1):
        p = a + axis * (L * k / n)
        for i in range(3):
            _rod(bm, p + corners[i], p + corners[(i + 1) % 3], rod * 0.6, 4)
        if k < n:
            q = a + axis * (L * (k + 1) / n)
            for i in range(3):
                _rod(bm, p + corners[i], q + corners[(i + 1) % 3], rod * 0.35, 4)


def terminal(bm, bma, base, d, size=0.14, length=0.35):
    """Laser terminal: gimbal post, telescope tube with a dark aperture facing d."""
    d = Vector(d).normalized()
    q = d.to_track_quat('Z', 'Y').to_matrix()
    _rod(bm, base, base + d * 0.08, 0.03, 6)
    c = base + d * (0.08 + length / 2)
    mtx = Matrix.Translation(c) @ q.to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=14, radius1=size / 2, radius2=size / 2, depth=length, matrix=mtx)
    mtx2 = Matrix.Translation(base + d * (0.08 + length + 0.002)) @ q.to_4x4()
    bmesh.ops.create_circle(bma, cap_ends=True, segments=14, radius=0.05, matrix=mtx2)


def build(spec):
    P = spec['parts']
    M = spec['materials']
    mats = {
        'film': sail.film_material(spec, chips=False, hinges=False, name='PodWingFilm'),
        'radiator': radiator_material(spec),
        'blanket': glass_cloth_material(),
        'truss': simple_material('PodTruss', M['boom_mg_oxidised']),
        'sleeve': simple_material('LoopSleeve', M['loop_line_sleeve']),
        'terminal': simple_material('PodTerminal', M['terminal_body']),
        'aperture': lib.principled('PodAperture', M['terminal_body']['aperture']['base_color_linear'], rough=0.05, coat=1.0),
        'black': lib.principled('PodBlack', (0.02, 0.02, 0.022), rough=0.4),
    }
    objs = {}
    # --- module: blanketed cube with seams, a few shell boxes (converters, accumulators, pumps)
    s = P['pod_module']['dims_m'][0]
    bm = bmesh.new()
    _box(bm, Vector((0, 0, 0)), (s, s, s))
    for (cx, cy, cz, sx, sy, sz) in ((0.0, s / 2 + 0.12, -0.25, 0.9, 0.24, 0.7), (0.0, -s / 2 - 0.12, -0.25, 0.9, 0.24, 0.7),
                                     (s / 2 + 0.1, 0.35, -0.4, 0.2, 0.6, 0.5), (-s / 2 - 0.1, -0.35, -0.4, 0.2, 0.6, 0.5),
                                     (0.45, 0.45, -s / 2 - 0.12, 0.6, 0.5, 0.24)):
        _box(bm, Vector((cx, cy, cz)), (sx, sy, sz))
    objs['module'] = _obj('PodModule', bm, mats['blanket'])
    bevel = objs['module'].modifiers.new('bevel', 'BEVEL')
    bevel.width = 0.03
    bevel.segments = 2
    # --- wings: 10 panels each, 0.10 m gaps, z = 0, behind them perimeter tubes at z = -0.05
    W = P['pod_wing']['dims_m']
    pw, ph = P['pod_wing']['panel_m']
    bm = bmesh.new()
    bmt = bmesh.new()
    for sgn in (-1, 1):
        for k in range(P['pod_wing']['panels_per_wing']):
            x0 = sgn * (18.0 + k * pw)
            x1 = sgn * (18.0 + (k + 1) * pw - 0.10)
            xa, xb = min(x0, x1), max(x0, x1)
            vs = [bm.verts.new(p) for p in ((xa, -ph / 2, 0), (xb, -ph / 2, 0), (xb, ph / 2, 0), (xa, ph / 2, 0))]
            bm.faces.new(vs)
            for (p, q) in (((xa, -ph / 2), (xb, -ph / 2)), ((xb, -ph / 2), (xb, ph / 2)), ((xb, ph / 2), (xa, ph / 2)), ((xa, ph / 2), (xa, -ph / 2))):
                _rod(bmt, (p[0], p[1], -0.05), (q[0], q[1], -0.05), 0.02, 6)
            # mid-panel stiffeners
            _rod(bmt, ((xa + xb) / 2, -ph / 2, -0.05), ((xa + xb) / 2, ph / 2, -0.05), 0.012, 6)
    # subdivide the panels so the film's gentle undulation bump has room
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=8, use_grid_fill=True)
    objs['wings'] = _obj('PodWings', bm, mats['film'])
    for sgn in (-1, 1):
        truss(bmt, (sgn * 1.2, 0, -0.5), (sgn * 86.16, 0, -0.5))
        # yoke: struts from the spar to the panel corners near the root
        for yy in (-ph / 2, ph / 2):
            _rod(bmt, (sgn * 18.0, 0, -0.5), (sgn * 18.0, yy, -0.05), 0.03, 6)
            _rod(bmt, (sgn * 40.0, 0, -0.5), (sgn * 18.0, yy, -0.05), 0.02, 6)
    # radiator arms (module to the first blade) and blade root struts
    for sgn in (-1, 1):
        truss(bmt, (0, sgn * 1.2, -0.5), (0, sgn * 20.0, -0.5))
    objs['truss'] = _obj('PodTruss', bmt, mats['truss'])
    # --- radiator blades: 25 mm thick, 6 m tall, edge-on to the Sun
    bm = bmesh.new()
    bms = bmesh.new()
    th, bl, bh = P['pod_radiator_blade']['dims_m']
    for sgn in (-1, 1):
        for (y0, y1) in ((20.0, 60.5), (61.5, 102.1)):
            ya, yb = sorted((sgn * y0, sgn * y1))
            _box(bm, Vector((0, (ya + yb) / 2, 0)), (th, yb - ya, bh))
            # condenser header (spine) along z = 0 on both faces, and end caps
            _rod(bms, (0.05, ya, 0), (0.05, yb, 0), 0.04, 10)
            _rod(bms, (-0.05, ya, 0), (-0.05, yb, 0), 0.04, 10)
        # loop trunks: along the arm and the blade roots, two per side
        for dx in (-0.25, 0.25):
            _rod(bms, (dx, sgn * 0.9, -0.35), (dx, sgn * 20.0, -0.35), 0.075, 10)
            _rod(bms, (dx, sgn * 20.0, -0.35), (0.06 if dx > 0 else -0.06, sgn * 20.0, 0.0), 0.06, 10)
            _rod(bms, (0.06 if dx > 0 else -0.06, sgn * 60.5, 0.0), (0.06 if dx > 0 else -0.06, sgn * 61.5, 0.0), 0.05, 10)
    objs['blades'] = _obj('PodBlades', bm, mats['radiator'])
    objs['sleeves'] = _obj('PodSleeves', bms, mats['sleeve'], smooth=True)
    # --- terminal mast below the module, DWDM ring at 2/3, two handover rings near the tip
    bm = bmesh.new()
    bma = bmesh.new()
    zt = -(s / 2)
    mast_l = P['pod_terminal_mast']['dims_m']['length']
    truss(bm, (0, 0, zt), (0, 0, zt - mast_l), side=0.3, rod=0.012, bay=0.3, up=Vector((1, 0, 0)))
    for ring, (zz, n, tilt) in enumerate(((zt - mast_l * 2 / 3, 8, -0.15), (zt - mast_l + 0.5, 8, -0.35), (zt - mast_l + 0.1, 8, 0.05))):
        for k in range(n):
            az = 2 * math.pi * (k + 0.5 * ring) / n
            d = Vector((math.cos(az), math.sin(az), tilt))
            terminal(bm, bma, Vector((0.18 * math.cos(az), 0.18 * math.sin(az), zz)), d)
    # thrusters on two canted booms; O2 tanks on the -Z face
    for az in (45, 135, 225, 315):
        a = math.radians(az)
        base = Vector((0.6 * math.cos(a), 0.6 * math.sin(a), -0.6))
        tip = base + Vector((2.0 * math.cos(a), 2.0 * math.sin(a), -0.7))
        _rod(bm, base, tip, 0.04, 8)
        d = Vector((math.cos(a), math.sin(a), -0.36)).normalized()
        mtx = Matrix.Translation(tip + d * 0.2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=16, radius1=0.08, radius2=0.125, depth=0.4, matrix=mtx)
    for (x, y) in ((-0.45, 0.4), (0.45, -0.45)):
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.225, matrix=Matrix.Translation((x, y, -s / 2 - 0.25)))
    objs['mast'] = _obj('PodMast', bm, mats['terminal'], smooth=True)
    objs['apertures'] = _obj('PodApertures', bma, mats['aperture'])
    return objs, mats


VIEWS = {
    # sunward side, low over the -X wing root, looking across the module toward the +Y radiators
    'hero': dict(cam=(-17, -20, 11.5), target=(2, 24, -1.0), lens=20),
    'close': dict(cam=(-11, -9, 6.5), target=(3, 14, -1.5), lens=20),
    'wide': dict(cam=(-34, -58, 17), target=(0, 22, -1.0), lens=26),
    # close on the module: blanket, mast, loop trunks entering the radiator arm
    'module': dict(cam=(-6.5, -7.5, 2.4), target=(0, 0, -1.6), lens=24),
    # along the radiator line from beyond the last blade: blade edges in perspective
    'blades': dict(cam=(9, 118, 6.5), target=(-1, 40, -0.5), lens=35),
}


def thermal(spec, objs, lo, hi):
    """LWIR (8-14 um) brightness temperature, inferno scale, from the design spec's temperatures."""
    import hero
    L = spec['scene']['lwir']['pod']
    E = spec['materials']
    tb = {
        'blades': (sail.brightness_temp(L['radiator_root_K'], 0.9), sail.brightness_temp(L['radiator_tip_K'], 0.9)),
        'wings_front': sail.brightness_temp(L['wing_K'], E['sail_front_pv']['eps_IR']),
        'wings_back': sail.brightness_temp(L['wing_K'], E['sail_back_enamel']['eps_IR']),
        'module': sail.brightness_temp(L['module_exterior_K'], 0.6),
        'truss': sail.brightness_temp(293.0, 0.3),
        'sleeves': sail.brightness_temp(345.0, 0.5),
        'mast': sail.brightness_temp(300.0, 0.85),
    }

    def col(T):
        return (*hero.inferno(max(0.0, min(1.0, (T - lo) / (hi - lo)))), 1)

    def emit(name, T):
        m = _new_mat(name)
        g = NT(m)
        out = g.node('ShaderNodeOutputMaterial')
        em = g.node('ShaderNodeEmission', Strength=1.0)
        em.inputs['Color'].default_value = col(T)
        g.L.new(em.outputs[0], out.inputs['Surface'])
        return m
    # blades: warm at the root (the vapour enters there), cooler toward the tip; heat-pipe stripes
    m = _new_mat('IR_Blades')
    g = NT(m)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    x, y, z = g.sep(tc.outputs['Object'])
    ay = g.math('ABSOLUTE', y)
    f = g.math('DIVIDE', g.math('SUBTRACT', ay, 20.0), 82.0, clamp=True)
    stripe = g.math('MULTIPLY', g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', y, 0.1)), 0.5)), -2.0)
    T = g.math('ADD', g.math('ADD', tb['blades'][0], g.math('MULTIPLY', f, tb['blades'][1] - tb['blades'][0])), g.math('MULTIPLY', stripe, 0.6))
    # fin efficiency: the blade edges far from the header run ~4 K cooler
    edge = g.math('MULTIPLY', g.math('ABSOLUTE', z), -4.0 / 3.0)
    T = g.math('ADD', T, edge)
    frac = g.math('DIVIDE', g.math('SUBTRACT', T, lo), hi - lo, clamp=True)
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
    wm = _new_mat('IR_Wings')
    g = NT(wm)
    out = g.node('ShaderNodeOutputMaterial')
    geo = g.node('ShaderNodeNewGeometry')
    a = g.node('ShaderNodeEmission', Strength=1.0); a.inputs['Color'].default_value = col(tb['wings_front'])
    b = g.node('ShaderNodeEmission', Strength=1.0); b.inputs['Color'].default_value = col(tb['wings_back'])
    mx = g.node('ShaderNodeMixShader')
    g.L.new(geo.outputs['Backfacing'], mx.inputs['Fac'])
    g.L.new(a.outputs[0], mx.inputs[1]); g.L.new(b.outputs[0], mx.inputs[2])
    g.L.new(mx.outputs[0], out.inputs['Surface'])
    table = {'blades': m, 'wings': wm, 'module': emit('IR_Module', tb['module']), 'truss': emit('IR_Truss', tb['truss']),
             'sleeves': emit('IR_Sleeves', tb['sleeves']), 'mast': emit('IR_Mast', tb['mast']), 'apertures': emit('IR_Ap', tb['mast'])}
    for k, o in objs.items():
        o.data.materials.clear()
        o.data.materials.append(table[k])
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o)
    return tb


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--view', default='hero')
    ap.add_argument('--r', type=float, default=None)
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--res', default='2400x1350')
    ap.add_argument('--thermal', action='store_true')
    ap.add_argument('--lo', type=float, default=280.0)
    ap.add_argument('--hi', type=float, default=360.0)
    ap.add_argument('--ev', type=float, default=0.0)
    a = ap.parse_args(argv)
    spec = sail.load_spec()
    r = a.r or spec['raw']['pod']['power']['r_AU']
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 6
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    objs, mats = build(spec)
    v = VIEWS[a.view]
    # the blades stay edge-on (no X component); a 0.15 deg pitch error tilts the wings' light
    lib.add_sun(r, direction=(0.0, math.sin(math.radians(-0.15)), -1.0))
    lib.camera(Vector(v['cam']), Vector(v['target']), lens=v['lens'])
    lib.meter(sc, lib.flux(r), ev_offset=a.ev)
    if a.thermal:
        tb = thermal(spec, objs, a.lo, a.hi)
        sc.view_settings.use_white_balance = False
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
        sc.view_settings.exposure = 0
        print('BRIGHTNESS_T', {k: (round(t, 1) if isinstance(t, float) else [round(x, 1) for x in t]) for k, t in tb.items()})
    lib.save(sc, a.out)
    print('WROTE', a.out, 'exposure', sc.view_settings.exposure)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
