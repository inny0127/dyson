"""Mercury's night side at the heat wall, ~2128: radiator fields, a mass driver, and the sky inside
the swarm.

Numbers:
- Heat: industry sheds the model's 5e18 W (PARAMS.mercuryHeatLimit). Spread over Mercury's whole
  surface that is ~67 kW/m^2; over the night side alone ~134 kW/m^2. Radiators at 1,120-1,280 K
  (eps 0.9) do it. Their glow is the blackbody law: 1,200 K = 141 cd/m^2, deep orange.
- Sky: Mercury sits inside the shell, so in every direction it sees the sunlit fronts of sails:
  L = f rho S(r) / pi ~ 0.9 cd/m^2 at f = 0.41 %. The sails within 0.52 deg (as seen from each sail)
  of the Sun's mirror direction glint at Mercury: from 0.39 AU that is a disc 1.15 deg in radius
  round the antisolar point (0.52 deg x 0.86/0.39), at the film's glint radiance x coverage: a
  violet counter-sun of about magnitude -16.6, with the curled panel edges' halo out to ~17 deg.
- Mass driver: 7.6 km/s launch speed (model), 3 km of track at ~1,000 g.
- Ground: Mercury's curvature (horizon 3 km from eye height), cratered regolith (albedo 0.08-0.12,
  MESSENGER mean), graded flat under the industry.

Usage: blender -b --python render/mercury_surface.py -- out.exr [--res 2400x1600] [--samples 256]
       [--f 0.0041] [--anti-alt 33]
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
import swarm_field  # noqa: E402
from earth_sky import G, new_mat, grid_mesh  # noqa: E402

R_M = 2.4397e6
FIELD = dict(x0=-3200.0, x1=3200.0, y0=34.0, y1=6500.0)
DRIVER_X = 34.0


def crater_height(X, Y, rng, area_r=9000.0):
    """Simple fresh-to-degraded craters, sizes down to ~3 px at their distance."""
    Z = np.zeros_like(X)
    R = np.hypot(X, Y)
    n_made = 0
    for _ in range(9000):
        d = math.sqrt(rng.random()) * area_r
        th = rng.random() * 2 * math.pi
        cx, cy = d * math.cos(th), d * math.sin(th)
        dmin = max(1.5, d * 0.006)
        # power law N(>D) ~ D^-2 between dmin and 400 m
        D = dmin / math.sqrt(1 - rng.random() * (1 - (dmin / 400.0) ** 2))
        if D > 400:
            continue
        fresh = rng.uniform(0.25, 1.0)
        sel = (np.abs(X - cx) < 1.4 * D) & (np.abs(Y - cy) < 1.4 * D)
        if not sel.any():
            continue
        x = np.hypot(X[sel] - cx, Y[sel] - cy) / (D / 2)
        h = np.where(x < 1, D * (0.2 * (x * x - 1) + 0.04), 0.04 * D * np.clip(x, 1, None) ** -3)
        Z[sel] += h * fresh
        n_made += 1
    return Z, n_made


def field_relief(X, Y):
    """Graded, not levelled: the field keeps the plain's long swells (+-2 m over ~0.5 km)."""
    return 1.6 * np.sin(X / 270.0 + 0.7) * np.cos(Y / 410.0) + 0.8 * np.sin((X + Y) / 150.0)


def ground(rng):
    """Polar grid round the camera (resolution proportional to distance), Mercury's curvature,
    craters, graded flat under the radiator field and along the mass driver."""
    radii = np.concatenate([[0.0], np.geomspace(0.3, 9500.0, 460)])
    th = np.linspace(-math.pi, math.pi, 1441)[:-1]
    Rr, Th = np.meshgrid(radii, th, indexing='ij')
    X, Y = Rr * np.cos(Th), Rr * np.sin(Th)
    Zc, n = crater_height(X, Y, rng)
    # regolith undulation
    Zc += 0.6 * np.sin(X / 37.0 + 1.3) * np.sin(Y / 53.0) + 0.25 * np.sin(X / 9.3) * np.cos(Y / 11.7)
    f = FIELD
    inx = np.clip(np.minimum(X - f['x0'], f['x1'] - X) / 40.0, 0, 1)
    iny = np.clip(np.minimum(Y - (f['y0'] - 20), f['y1'] - Y) / 40.0, 0, 1)
    graded = inx * iny
    Z = Zc * (1 - graded) + (field_relief(X, Y) + 0.02 * np.sin(X / 3.1) * np.sin(Y / 2.7)) * graded
    Z -= (X * X + Y * Y) / (2 * R_M)
    # polar grid -> quads
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
    at.data.foreach_set('value', graded.ravel().astype(np.float32))
    ob = bpy.data.objects.new('Ground', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, n


def regolith_material():
    """Mercury regolith: dark grey (albedo ~0.08), slightly brighter graded/compacted ground with
    vehicle tracks, rough (Oren-Nayar-like)."""
    m, g = new_mat('Regolith')
    geo = g.n('ShaderNodeNewGeometry')
    at = g.n('ShaderNodeAttribute', _attribute_name='graded')
    n1 = g.n('ShaderNodeTexNoise', Scale=0.08, Detail=8.0, Roughness=0.6)
    g.s(n1.inputs['Vector'], geo.outputs['Position'])
    n2 = g.n('ShaderNodeTexNoise', Scale=3.0, Detail=10.0, Roughness=0.65)
    g.s(n2.inputs['Vector'], geo.outputs['Position'])
    vor = g.n('ShaderNodeTexVoronoi', Scale=1.4)
    g.s(vor.inputs['Vector'], geo.outputs['Position'])
    base = g.ramp(n1.outputs['Fac'], [(0.3, (0.060, 0.058, 0.055)), (0.7, (0.095, 0.091, 0.086))])
    graded = g.ramp(n2.outputs['Fac'], [(0.3, (0.085, 0.082, 0.078)), (0.7, (0.12, 0.115, 0.11))])
    col = g.rgb(at.outputs['Fac'], base, graded)
    pebbles = g.smooth(vor.outputs['Distance'], 0.06, 0.0)
    col = g.rgb(g.m('MULTIPLY', pebbles, 0.4), col, (0.14, 0.135, 0.13))
    bsdf = g.n('ShaderNodeBsdfDiffuse')
    g.s(bsdf.inputs['Color'], col)
    bsdf.inputs['Roughness'].default_value = 1.0
    h = g.m('ADD', g.m('MULTIPLY', n2.outputs['Fac'], 0.6), g.m('MULTIPLY', pebbles, 0.4))
    bump = g.n('ShaderNodeBump', Strength=0.6, Distance=0.04)
    g.s(bump.inputs['Height'], h)
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    out = [n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    g.s(out.inputs['Surface'], bsdf.outputs[0])
    return m


def radiator_emission_material(T_mean=1200.0):
    """Hot radiator panel (eps 0.9 oxide). Temperature varies panel to panel (+-50 K) and falls
    ~140 K from the inlet end to the outlet end; glow = blackbody luminance at that temperature
    (ln L fitted to the CIE-weighted Planck integral: 0.25 / 1.52 / 7.04 W/m^2/sr in the repo's
    photometric units at 1100 / 1200 / 1300 K)."""
    m, g = new_mat('RadiatorHot')
    ob = g.n('ShaderNodeObjectInfo')
    tc = g.n('ShaderNodeTexCoord')
    sep = g.n('ShaderNodeSeparateXYZ'); g.s(sep.inputs[0], tc.outputs['Object'])
    # inlet at local x = -6, outlet at +6
    grad = g.m('MULTIPLY', sep.outputs['X'], -140.0 / 12.0)
    jitter = g.m('MULTIPLY', g.m('SUBTRACT', ob.outputs['Random'], 0.5), 50.0)
    nz = g.n('ShaderNodeTexNoise', Scale=0.7, Detail=3.0)
    g.s(nz.inputs['Vector'], tc.outputs['Object'])
    blk = g.n('ShaderNodeAttribute', _attribute_name='toff', _attribute_type='INSTANCER')
    T = g.m('ADD', g.m('ADD', T_mean, grad), g.m('ADD', jitter, g.m('MULTIPLY', g.m('SUBTRACT', nz.outputs['Fac'], 0.5), 30.0)))
    T = g.m('ADD', T, blk.outputs['Fac'])
    x = g.m('SUBTRACT', T, 1200.0)
    lnL = g.m('ADD', g.m('ADD', 0.416, g.m('MULTIPLY', x, 0.01669)), g.m('MULTIPLY', g.m('MULTIPLY', x, x), -1.335e-5))
    L = g.m('MULTIPLY', g.m('EXPONENT', lnL), 0.9)
    bb = g.n('ShaderNodeBlackbody')
    g.s(bb.inputs['Temperature'], T)
    bw = g.n('ShaderNodeRGBToBW')
    g.s(bw.inputs['Color'], bb.outputs['Color'])
    em = g.n('ShaderNodeEmission')
    g.s(em.inputs['Color'], bb.outputs['Color'])
    g.s(em.inputs['Strength'], g.m('DIVIDE', L, g.m('MAXIMUM', bw.outputs['Val'], 1e-6)))
    out = [n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    g.s(out.inputs['Surface'], em.outputs[0])
    m.cycles.emission_sampling = 'NONE'
    return m


def radiator_panel(mat_hot, mat_leg):
    """12 x 4 m plate, 0.12 m thick, on four 1.1 m legs; manifolds along both short ends."""
    bm = bmesh.new()
    sail._box(bm, Vector((0, 0, 1.2)), (12.0, 4.0, 0.12))
    for x in (-6.05, 6.05):
        sail._rod(bm, (x, -2.0, 1.2), (x, 2.0, 1.2), 0.14, 10)
    me = bpy.data.meshes.new('Panel'); bm.to_mesh(me); bm.free()
    me.materials.append(mat_hot)
    bm = bmesh.new()
    for x in (-5.5, 5.5):
        for y in (-1.7, 1.7):
            sail._rod(bm, (x, y, 0.0), (x, y, 1.14), 0.06, 6)
    me2 = bpy.data.meshes.new('Legs'); bm.to_mesh(me2); bm.free()
    me2.materials.append(mat_leg)
    p = bpy.data.objects.new('Panel', me)
    legs = bpy.data.objects.new('Legs', me2)
    return p, legs


def instance_field(proto_objs, pts, rots, name='Field', extra=None):
    """Instance the prototype objects at points (N x 3) with z-rotations via Geometry Nodes."""
    coll = bpy.data.collections.new(name + 'Proto')
    for o in proto_objs:
        coll.objects.link(o)
    bpy.context.scene.collection.children.link(coll)
    coll.hide_render = True
    me = bpy.data.meshes.new(name + 'Pts')
    me.vertices.add(len(pts)); me.vertices.foreach_set('co', pts.astype(np.float32).ravel())
    at = me.attributes.new('rotz', 'FLOAT', 'POINT'); at.data.foreach_set('value', rots.astype(np.float32))
    for k, v in (extra or {}).items():
        ae = me.attributes.new(k, 'FLOAT', 'POINT'); ae.data.foreach_set('value', np.asarray(v, np.float32))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ng = bpy.data.node_groups.new(name + 'GN', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    m2p = N.new('GeometryNodeMeshToPoints')
    L.new(gi.outputs[0], m2p.inputs['Mesh'])
    ci = N.new('GeometryNodeCollectionInfo')
    ci.inputs['Collection'].default_value = coll
    ci.inputs['Separate Children'].default_value = True    # a whole-collection instance would inherit its hidden render state
    ci.inputs['Reset Children'].default_value = True
    inst = N.new('GeometryNodeInstanceOnPoints')
    L.new(m2p.outputs[0], inst.inputs['Points'])
    L.new(ci.outputs[0], inst.inputs['Instance'])
    na = N.new('GeometryNodeInputNamedAttribute'); na.data_type = 'FLOAT'; na.inputs['Name'].default_value = 'rotz'
    cx = N.new('ShaderNodeCombineXYZ')
    L.new(na.outputs['Attribute'], cx.inputs['Z'])
    L.new(cx.outputs[0], inst.inputs['Rotation'])
    L.new(inst.outputs[0], go.inputs[0])
    mod = ob.modifiers.new('GN', 'NODES'); mod.node_group = ng
    return ob


def pump_house(center, mat, mat_hot):
    """Loop pump and heat-exchanger house at a block corner: a blanketed box with hot manifold
    pipes running out along the block edge."""
    bm = bmesh.new()
    c = Vector(center)
    sail._box(bm, c + Vector((0, 0, 3.0)), (14.0, 9.0, 6.0))
    sail._box(bm, c + Vector((-4.0, 2.0, 7.0)), (3.0, 3.0, 2.0))
    o = sail._obj('PumpHouse', bm, mat)
    bmh = bmesh.new()
    for dy in (-1.2, 1.2):
        sail._rod(bmh, c + Vector((7.0, dy, 1.0)), c + Vector((7.0 + 13 * 13.0, dy, 1.0)), 0.25, 12)
    sail._obj('Manifolds', bmh, mat_hot, smooth=True)
    return o


def mass_driver(mat_struct, mat_coil, length=3000.0):
    """Elevated launch track along +Y: box girder on pylons every 25 m, drive coils every 2 m,
    rising 1 in 400 so it stays clear of the curved ground to the horizon."""
    bm = bmesh.new()
    bmc = bmesh.new()
    y0 = 30.0
    seg = 25.0
    k = 0
    y = y0
    while y < y0 + length:
        y1 = min(y + seg, y0 + length)
        zb = lambda yy: 4.0 + (yy - y0) / 400.0 - (DRIVER_X ** 2 + yy ** 2) / (2 * R_M)
        a, b = Vector((DRIVER_X, y, zb(y))), Vector((DRIVER_X, y1, zb(y1)))
        mid = (a + b) / 2
        d = (b - a)
        rot = d.to_track_quat('Y', 'Z').to_matrix()
        sail._box(bm, mid, (1.6, d.length, 0.9), rot)
        # pylon (A-frame) down to the ground
        zg = -(DRIVER_X ** 2 + y ** 2) / (2 * R_M)
        for dx in (-1.6, 1.6):
            sail._rod(bm, (DRIVER_X + dx, y, zg), (DRIVER_X, y, zb(y) - 0.45), 0.18, 8)
        # coils
        yy = y
        while yy < y1:
            c = Vector((DRIVER_X, yy, zb(yy) + 1.0))
            mtx = Matrix.Translation(c) @ Matrix.Rotation(math.pi / 2, 4, 'X')
            bmesh.ops.create_cone(bmc, cap_ends=False, segments=24, radius1=0.95, radius2=0.95, depth=0.35, matrix=mtx)
            yy += 2.0
        y = y1
        k += 1
    o1 = sail._obj('DriverGirder', bm, mat_struct)
    o2 = sail._obj('DriverCoils', bmc, mat_coil, smooth=True)
    return o1, o2


def sky_world(sc, f, rho, anti_dir, r_shell=0.86, r_merc=0.387):
    """Uniform swarm glow + the counter-sun and its halo round the antisolar direction."""
    spec = sail.load_spec()
    g = spec['scene']['glint']
    S = lib.flux(r_shell)
    L_glow = f * rho * S / math.pi                               # all sail fronts, cos ~ 1
    t_in, t_out = g['half_angle_interior_deg'], g['half_angle_hinge_edges_deg']
    mag = r_shell / r_merc                                       # glint cone seen from Mercury
    al, core, halo = swarm_field.glint_profile(t_in, t_out, alpha_max=12.0)
    L_g = spec['scene']['sail_brightness']['glint_radiance_W_m2_sr'] * S / lib.flux(0.919)
    ef = g['hinge_edge_area_fraction']
    prof = f * L_g * ((1 - ef) * core + ef * halo)                # vs angle in the sail frame
    al_m = al * mag                                              # vs angle seen from Mercury
    film = np.array(spec['scene']['sail_brightness']['glint_colour_linear_sRGB_rel'])
    sun = np.array([1.0, 0.8791, 0.8211])
    luma = np.array([0.2126, 0.7152, 0.0722])
    c_glint = film * sun / ((film * sun) @ luma)
    c_diff = (0.91 + 0.09 * film / (film @ luma)) * sun
    c_diff = c_diff / (c_diff @ luma)
    pimg = bpy.data.images.new('CounterSun', len(prof), 1, alpha=True, float_buffer=True)
    pimg.colorspace_settings.name = 'Non-Color'
    pimg.pixels.foreach_set(np.column_stack([prof, prof, prof, np.ones(len(prof))]).astype(np.float32).ravel())
    pimg.update()
    nt = sc.world.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (*c_diff, 1)
    bg.inputs['Strength'].default_value = L_glow
    mw = nt.nodes.new('ShaderNodeTexEnvironment')
    mw.image = bpy.data.images.load(os.path.join(lib.REPO, 'assets', 'milkyway_8k.jpg'))
    nt.links.new(tc.outputs['Generated'], mw.inputs['Vector'])
    bmw = nt.nodes.new('ShaderNodeBackground'); bmw.inputs['Strength'].default_value = 3.7e-5
    nt.links.new(mw.outputs['Color'], bmw.inputs['Color'])
    dotn = nt.nodes.new('ShaderNodeVectorMath'); dotn.operation = 'DOT_PRODUCT'
    nt.links.new(tc.outputs['Generated'], dotn.inputs[0]); dotn.inputs[1].default_value = tuple(anti_dir)
    acs = nt.nodes.new('ShaderNodeMath'); acs.operation = 'ARCCOSINE'
    nt.links.new(dotn.outputs['Value'], acs.inputs[0])
    uu = nt.nodes.new('ShaderNodeMath'); uu.operation = 'DIVIDE'; uu.inputs[1].default_value = math.radians(12.0 * mag)
    nt.links.new(acs.outputs[0], uu.inputs[0])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ'); cmb.inputs['Y'].default_value = 0.5
    nt.links.new(uu.outputs[0], cmb.inputs['X'])
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = pimg; ti.extension = 'CLIP'
    nt.links.new(cmb.outputs[0], ti.inputs['Vector'])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*c_glint, 1)
    nt.links.new(ti.outputs['Color'], em.inputs['Strength'])
    # below the horizon the ground hides everything; the world is the sky only
    a1 = nt.nodes.new('ShaderNodeAddShader'); a2 = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(bg.outputs[0], a1.inputs[0]); nt.links.new(bmw.outputs[0], a1.inputs[1])
    nt.links.new(a1.outputs[0], a2.inputs[0]); nt.links.new(em.outputs[0], a2.inputs[1])
    nt.links.new(a2.outputs[0], out.inputs['Surface'])
    sc.world.cycles.sampling_method = 'MANUAL'
    sc.world.cycles.sample_map_resolution = 2048
    core_flux = float(np.sum(prof * 2 * np.pi * np.radians(al_m) * np.radians(al_m[1] - al_m[0])))
    return {'L_glow': L_glow, 'glow_cd_m2': L_glow * 93, 'counter_sun_W_m2_sr': float(prof[0]),
            'counter_sun_radius_deg': t_in * mag, 'halo_radius_deg': t_out * mag,
            'counter_sun_flux_W_m2': core_flux, 'counter_sun_mag': -26.74 - 2.5 * math.log10(core_flux / 1361),
            'ground_lux_from_glints': core_flux * 93}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--res', default='2400x1600')
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--f', type=float, default=0.0041)
    ap.add_argument('--rho', type=float, default=0.004)
    ap.add_argument('--anti-alt', type=float, default=27.0)
    ap.add_argument('--anti-az', type=float, default=36.0, help='deg from +Y (east of north)')
    ap.add_argument('--lens', type=float, default=24.0)
    ap.add_argument('--T', type=float, default=1200.0)
    ap.add_argument('--ev', type=float, default=0.0)
    ap.add_argument('--field-step', type=float, default=1.0, help='thin the panel field for previews')
    ap.add_argument('--cam', default='-128,16,7', help='camera position x,y,z (m)')
    ap.add_argument('--look', default='0.55,1,-0.07', help='view direction')
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 3
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    rng = random.Random(9)
    gr, ncr = ground(rng)
    gr.data.materials.append(regolith_material())
    hot = radiator_emission_material(a.T)
    leg = lib.principled('RadiatorLeg', (0.05, 0.048, 0.045), rough=0.6, metal=0.5)
    panel, legs = radiator_panel(hot, leg)
    # blocks of 13 x 12 panels (13 m pitch along a row, 10 m between rows) separated by 16 m
    # roads; each block has its own loop temperature (+-40 K); ~7 % of blocks idle (cooled to
    # ~1,000 K for maintenance); ~3 % of panels missing
    f = FIELD
    rngp = np.random.default_rng(4)
    bx, by = 13 * 13.0 + 16.0, 12 * 10.0 + 16.0
    pts, rots, toff = [], [], []
    for jb, y0 in enumerate(np.arange(f['y0'], f['y1'], by)):
        for ib, x0 in enumerate(np.arange(f['x0'], f['x1'], bx)):
            if x0 < DRIVER_X + 14 and x0 + bx > DRIVER_X - 14:
                continue
            if math.hypot(x0, y0) > 7200:
                continue
            idle = rngp.random() < 0.07
            dT = -200.0 if idle else rngp.normal(0, 40)
            gx, gy = np.meshgrid(x0 + 6.5 + 13.0 * np.arange(13), y0 + 5.0 + 10.0 * np.arange(12))
            ok = rngp.random(gx.shape) > 0.03
            far = math.hypot(x0, y0) > 900
            if far and a.field_step > 1:
                ok &= rngp.random(gx.shape) < 1.0 / a.field_step
            pts.append(np.column_stack([gx[ok], gy[ok]]))
            rots.append(np.where(rngp.random(ok.sum()) < 0.5, 0.0, math.pi))
            toff.append(np.full(ok.sum(), dT))
    P = np.concatenate(pts)
    X, Y = P[:, 0], P[:, 1]
    Z = field_relief(X, Y) - (X * X + Y * Y) / (2 * R_M)
    pts = np.column_stack([X, Y, Z])
    rots = np.concatenate(rots) + rngp.normal(0, 0.006, len(X))
    toff = np.concatenate(toff)
    instance_field([panel, legs], pts, rots, extra={'toff': toff})
    struct = lib.principled('DriverSteel', (0.12, 0.12, 0.125), rough=0.45, metal=0.8)
    coil = lib.principled('DriverCoil', (0.55, 0.32, 0.18), rough=0.35, metal=1.0)
    mass_driver(struct, coil)
    house = lib.principled('HouseBlanket', (0.32, 0.31, 0.29), rough=0.7, metal=0.2)
    bx0 = FIELD['x0'] + math.floor((-60 - FIELD['x0']) / (13 * 13.0 + 16.0)) * (13 * 13.0 + 16.0)
    pump_house((bx0 - 9.0, FIELD['y0'] - 2.0, 0.0), house, hot)
    anti = Vector((math.sin(math.radians(a.anti_az)) * math.cos(math.radians(a.anti_alt)),
                   math.cos(math.radians(a.anti_az)) * math.cos(math.radians(a.anti_alt)),
                   math.sin(math.radians(a.anti_alt))))
    info = sky_world(sc, a.f, a.rho, anti)
    eye = Vector(tuple(float(v) for v in a.cam.split(',')))
    look = Vector(tuple(float(v) for v in a.look.split(',')))
    cam = lib.camera(eye, eye + look, lens=a.lens)
    cam.data.shift_y = 0.15
    cam.data.clip_start = 0.1
    cam.data.clip_end = 1e6
    # meter on the radiators (1,200 K blackbody, eps 0.9 = 1.36 W/m^2/sr in the repo's units)
    L_rad = 0.9 * math.exp(0.416 + 0.01669 * (a.T - 1200) - 1.335e-5 * (a.T - 1200) ** 2)
    sc.view_settings.exposure = math.log2(0.22 / L_rad) + a.ev
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    print(json.dumps({'craters': ncr, 'panels': int(len(X)), 'exposure': sc.view_settings.exposure, 'radiator_L': L_rad, **info}))
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
