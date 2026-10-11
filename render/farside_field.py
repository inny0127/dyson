"""Inside the far-side cloud: what a camera beside one of its sails would record.

The cloud (docs/earth.md, render/farside_sky.py): sun-facing sails in a layer on Earth's orbit,
1 +- dr/2 AU, 90-165 and 195-270 deg of longitude from Earth, within 30 deg of the ecliptic,
covering a fraction tau = f / (150/360 sin 30) of that patch. The camera sits mid-layer, psi deg
from Earth. dr is a design choice: 0.004 AU (600,000 km) lets a collision-free lattice give each
sail its own orbit with eccentricity up to 0.002 (docs/earth.md, "Collisions").

- Sails within dmax are drawn one by one: as their true 279 m squares, facing the Sun with a
  random clock angle, when they span more than 1.5 pixels; as point sources otherwise. A sail
  outward of the camera shows its sunlit front (film diffuse rho_film S / pi), one inward its
  dark back.
- Everything beyond dmax is the integrated sky of farside_sky.far_glow.
- Glints: the front is cover glass over the film with an aluminium mesh in it (the infrared-dark
  front). With ~21 % of the area in Al lines (the cell loses 21 % of its current), the mesh's
  coherent mirror reflection is about (0.21 * 0.95)^2 = 0.04, on top of the film's 0.0013, and
  goes straight back toward the Sun. A camera sees it only near its own antisolar point: the
  counter-sun, from the column of plates straight out beyond it (farside_sky.column_out).
- Vanes: as in swarm_field (4 per sail, 0-40 deg tilts, beams ~1.3 deg).
- Earth and the Moon: points at their true direction and brightness, 1.73 AU away at psi = 120.

Usage: blender -b --python render/farside_field.py -- out.exr [--yaw 90 --pitch -20 --lens 14]
       yaw/pitch: camera axis from the outward direction (+X) toward +Y (prograde) and toward +X...
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
import sail  # noqa: E402
import farside_sky as FS  # noqa: E402

AU_KM = FS.AU_KM
LUMA = np.array([0.2126, 0.7152, 0.0722])
SUN_RGB = np.array([1.0, 0.8791, 0.8211])
MESH_R0 = (0.21 * 0.95) ** 2
TH_SUN = FS.TH_SUN_1AU
glint_intensity = FS.glint_intensity


def norm(c):
    return c / (c @ LUMA)


def camera_axes(yaw, pitch, roll):
    """Forward/up for a camera whose axis is yaw deg from +X (outward) toward +Y (prograde) and
    pitch deg toward -X... expressed simply: start looking along +Y (along the orbit, the layer's
    horizon level), pitch > 0 tilts toward +X (away from the Sun, 'up'), yaw turns toward +Z."""
    y, p, r = (math.radians(v) for v in (yaw, pitch, roll))
    fwd = np.array([math.sin(p), math.cos(p) * math.cos(y), math.cos(p) * math.sin(y)])
    up0 = np.array([1.0, 0.0, 0.0])                      # 'up' is away from the Sun
    right = np.cross(fwd, up0); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    up, right = math.cos(r) * up + math.sin(r) * right, -math.sin(r) * up + math.cos(r) * right
    return fwd, up


def build_far_sky(sc, cam, fwd, w, h, a):
    """The far-side cloud's sky around a camera at the origin (frame: +X away from the Sun):
    near sails, Earth and the Moon, the integrated glow, the counter-sun and the Sun. `a` needs
    f, lat, rho, rho_film, dr, psi, lens, dmax, sky_width, seed. Returns the glow map."""
    fwd = np.asarray(fwd, dtype=float)
    R = getattr(a, 'r_layer', 1.0)                            # layer radius, AU
    if getattr(a, 'mode', 'farside') == 'uniform':
        FS.set_geometry('uniform', R, getattr(a, 'cone', 23.07))
        tau = a.tau
    else:
        FS.set_geometry('farside')
        patch = (180 - 2 * FS.FAR_GAP) / 360 * math.sin(math.radians(a.lat))
        tau = a.f / patch
    S = FS.S0 / R ** 2                                        # sunlight at the layer
    TH_SUN = FS.TH_SUN_1AU / R
    spec = sail.load_spec()
    side_km = spec['parts']['sail_film']['dims_m']['corner_to_corner'] / math.sqrt(2) / 1e3
    A_km2 = side_km ** 2
    n = tau / (A_km2 * a.dr * AU_KM)                         # sails per km^3 in the layer
    hfov = 2 * math.atan(18 / a.lens)
    vfov = 2 * math.atan(18 * h / w / a.lens)
    pix = hfov / w

    # --- sails within dmax, inside the view cone (+margin)
    rnd = np.random.default_rng(a.seed)
    cone = math.hypot(hfov, vfov) / 2 + math.radians(3)
    Omega = 2 * math.pi * (1 - math.cos(cone))
    N = rnd.poisson(n * Omega * a.dmax ** 3 / 3)
    cz = 1 - rnd.random(N) * (1 - math.cos(cone))
    ph = rnd.random(N) * 2 * math.pi
    sz = np.sqrt(1 - cz * cz)
    e1 = np.cross(fwd, [0.0, 0.0, 1.0]) if abs(fwd[2]) < 0.9 else np.cross(fwd, [1.0, 0.0, 0.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(fwd, e1)
    dirs = cz[:, None] * fwd + (sz * np.cos(ph))[:, None] * e1 + (sz * np.sin(ph))[:, None] * e2
    dist = np.maximum(a.dmax * rnd.random(N) ** (1 / 3), 8.0)
    # every sail faces the Sun (-X); the layer is far thicker than dmax, so all of these are in it
    cosv = dirs[:, 0]                                         # >0: beyond the camera, front visible
    ang_px = side_km * np.sqrt(np.abs(cosv) + 0.02) / dist / pix
    E_diff = np.where(cosv > 0, a.rho_film * S * A_km2 * 1e6 * cosv / math.pi / (dist * 1e3) ** 2, 0.0)
    # glints: the camera direction from the sail (-dirs) vs the mirror direction (-X)
    with open(os.path.join(lib.REPO, 'docs', 'data', 'design_spec.json')) as fh:
        dsp = json.load(fh)
    gf = dsp['scene_facts']['glint']
    t_out = gf['half_angle_hinge_edges_deg']
    edge_frac = gf['hinge_edge_area_fraction']
    F0_film = dsp['sail']['appearance_front']['glint']['F0']
    R_glint = F0_film + MESH_R0
    L_sun = S / (math.pi * TH_SUN ** 2)                        # W/m^2/sr of the solar disc at 1 AU
    ang = np.degrees(np.arccos(np.clip(dirs[:, 0], -1, 1)))    # from the antisolar point (+X)
    gi = glint_intensity(ang, t_out, edge_frac, th_sun=TH_SUN)
    E_glint = np.where(cosv > 0, R_glint * S * A_km2 * 1e6 * cosv * gi / (dist * 1e3) ** 2, 0.0)
    E_int = np.where(ang < math.degrees(TH_SUN), E_glint, 0.0)
    E_edge = E_glint - E_int
    # vanes
    vane_half = math.degrees(math.acos(1 - 2 * gf['p_random_direction_per_vane']))
    beam = 2 * math.pi * (1 - math.cos(math.radians(vane_half)))
    E_vane = np.zeros(N)
    nX = np.array([-1.0, 0.0, 0.0])
    t1 = np.array([0.0, 1.0, 0.0]); t2 = np.array([0.0, 0.0, 1.0])
    for k in range(4):
        tilt = np.arccos(1 - rnd.random(N) * (1 - math.cos(math.radians(40))))
        az = rnd.random(N) * 2 * math.pi
        nv = nX[None] * np.cos(tilt)[:, None] + (t1[None] * np.cos(az)[:, None] + t2[None] * np.sin(az)[:, None]) * np.sin(tilt)[:, None]
        din = np.array([1.0, 0.0, 0.0])
        refl = din[None] - 2 * (nv @ din)[:, None] * nv
        va = np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', refl, -dirs), -1, 1)))
        I_vane = 0.9 * S * 87.0 * np.cos(tilt) / beam
        E_vane += np.where(va < vane_half, I_vane / (dist * 1e3) ** 2, 0.0)
    E_pt = E_diff + E_int + E_edge + E_vane
    resolved = ang_px > 1.5
    c_diff = norm((0.91 + 0.09 * norm(np.array(dsp['scene_facts']['sail_brightness']['glint_colour_linear_sRGB_rel']))) * SUN_RGB)
    c_glint = norm(0.3 * norm(np.array(dsp['scene_facts']['sail_brightness']['glint_colour_linear_sRGB_rel'])) * SUN_RGB + 0.7 * SUN_RGB)
    c_vane = norm(SUN_RGB * np.array([0.97, 0.97, 0.98]))
    col = (E_diff[:, None] * c_diff + (E_int + E_edge)[:, None] * c_glint + E_vane[:, None] * c_vane) / np.maximum(E_pt, 1e-300)[:, None]
    D = 1e7                                                     # m, draw distance for points
    stats = {'tau': tau, 'n_per_km3': n, 'spacing_km': n ** (-1 / 3), 'drawn': int(N), 'resolved': int(resolved.sum()),
             'nearest_km': float(dist.min()), 'brightest_point_mag': float(-26.74 - 2.5 * math.log10(max(E_pt.max(), 1e-30) / 1361))}
    print(json.dumps(stats), flush=True)

    # resolved sails: squares 279 m, at true distance, normal -X, random clock angle
    rs = np.where(resolved)[0]
    co, faces, Ls, Cs = [], [], [], []
    half = side_km * 1e3 / 2
    for i_, k in enumerate(rs):
        c = dirs[k] * dist[k] * 1e3
        th = rnd.random() * 2 * math.pi
        u = np.array([0.0, math.cos(th), math.sin(th)]); v = np.array([0.0, -math.sin(th), math.cos(th)])
        corners = [c + half * (su * u + sv * v) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        co.extend(corners)
        faces.append([4 * i_, 4 * i_ + 1, 4 * i_ + 2, 4 * i_ + 3])
        if cosv[k] > 0:
            # radiance: diffuse rho S / pi, glints spread over the sail's solid angle
            Om = A_km2 * 1e6 * cosv[k] / (dist[k] * 1e3) ** 2
            Ls.append(a.rho_film * S / math.pi + (E_int[k] + E_edge[k]) / Om)
            Cs.append(col[k] if (E_int[k] + E_edge[k]) > 0 else c_diff)
        else:
            Ls.append(0.0)                                       # the back: black
            Cs.append(np.zeros(3))
    if rs.size:
        me = bpy.data.meshes.new('NearSails')
        co = np.array(co); faces = np.array(faces)
        me.vertices.add(len(co)); me.vertices.foreach_set('co', co.astype(np.float32).ravel())
        me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
        me.polygons.add(len(faces)); me.polygons.foreach_set('loop_start', np.arange(0, faces.size, 4, dtype=np.int32))
        me.update(calc_edges=True)
        aL = me.attributes.new('L', 'FLOAT', 'FACE'); aL.data.foreach_set('value', np.array(Ls, np.float32))
        aC = me.attributes.new('C', 'FLOAT_COLOR', 'FACE')
        aC.data.foreach_set('color', np.column_stack([np.array(Cs), np.ones(len(Cs))]).astype(np.float32).ravel())
        m = bpy.data.materials.new('NearSail'); m.use_nodes = True
        nt = m.node_tree
        for nd in list(nt.nodes):
            nt.nodes.remove(nd)
        o = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        al = nt.nodes.new('ShaderNodeAttribute'); al.attribute_name = 'L'
        ac = nt.nodes.new('ShaderNodeAttribute'); ac.attribute_name = 'C'
        nt.links.new(ac.outputs['Color'], em.inputs['Color'])
        nt.links.new(al.outputs['Fac'], em.inputs['Strength'])
        nt.links.new(em.outputs[0], o.inputs['Surface'])
        m.cycles.emission_sampling = 'NONE'
        me.materials.append(m)
        ob = bpy.data.objects.new('NearSails', me)
        bpy.context.scene.collection.objects.link(ob)
        # vane flashes of resolved sails stay as points (below)

    # point sources: unresolved sails, and the vane flashes of all
    E_pt_draw = np.where(resolved, E_vane, E_pt)
    vis = E_pt_draw > 0
    sel = np.where(vis)[0]
    rad = D * pix * 0.35
    Lrad = E_pt_draw / (math.pi * (rad / D) ** 2)
    col_draw = np.where(resolved[:, None], c_vane[None], col)
    tg = (1 + 5 ** 0.5) / 2
    iv = np.array([[-1, tg, 0], [1, tg, 0], [-1, -tg, 0], [1, -tg, 0], [0, -1, tg], [0, 1, tg], [0, -1, -tg], [0, 1, -tg],
                   [tg, 0, -1], [tg, 0, 1], [-tg, 0, -1], [-tg, 0, 1]], float)
    iv /= np.linalg.norm(iv, axis=1)[:, None]
    fi = np.array([[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                   [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])

    def points(name, dirs_, L_, C_):
        co_ = (dirs_[:, None, :] * D + iv[None] * rad).reshape(-1, 3)
        fc_ = (fi[None] + 12 * np.arange(len(dirs_))[:, None, None]).reshape(-1, 3)
        me_ = bpy.data.meshes.new(name)
        me_.vertices.add(len(co_)); me_.vertices.foreach_set('co', co_.astype(np.float32).ravel())
        me_.loops.add(fc_.size); me_.loops.foreach_set('vertex_index', fc_.ravel().astype(np.int32))
        me_.polygons.add(len(fc_)); me_.polygons.foreach_set('loop_start', np.arange(0, fc_.size, 3, dtype=np.int32))
        me_.update(calc_edges=True)
        a1 = me_.attributes.new('L', 'FLOAT', 'FACE'); a1.data.foreach_set('value', np.repeat(L_, 20).astype(np.float32))
        a2 = me_.attributes.new('C', 'FLOAT_COLOR', 'FACE')
        a2.data.foreach_set('color', np.repeat(np.column_stack([C_, np.ones(len(C_))]), 20, axis=0).astype(np.float32).ravel())
        m_ = bpy.data.materials.new(name + 'Mat'); m_.use_nodes = True
        nt_ = m_.node_tree
        for nd in list(nt_.nodes):
            nt_.nodes.remove(nd)
        o_ = nt_.nodes.new('ShaderNodeOutputMaterial')
        em_ = nt_.nodes.new('ShaderNodeEmission')
        al_ = nt_.nodes.new('ShaderNodeAttribute'); al_.attribute_name = 'L'
        ac_ = nt_.nodes.new('ShaderNodeAttribute'); ac_.attribute_name = 'C'
        nt_.links.new(ac_.outputs['Color'], em_.inputs['Color'])
        nt_.links.new(al_.outputs['Fac'], em_.inputs['Strength'])
        tr_ = nt_.nodes.new('ShaderNodeBsdfTransparent')
        ad_ = nt_.nodes.new('ShaderNodeAddShader')
        nt_.links.new(em_.outputs[0], ad_.inputs[0]); nt_.links.new(tr_.outputs[0], ad_.inputs[1])
        nt_.links.new(ad_.outputs[0], o_.inputs['Surface'])
        m_.cycles.emission_sampling = 'NONE'
        me_.materials.append(m_)
        ob_ = bpy.data.objects.new(name, me_)
        bpy.context.scene.collection.objects.link(ob_)

    if sel.size:
        points('SailPoints', dirs[sel], Lrad[sel], col_draw[sel])

    # --- Earth and the Moon: Earth at psi from the camera along the orbit (heliocentric -psi)
    lamE = -math.radians(a.psi)
    E_hat = np.array([math.cos(lamE), math.sin(lamE), 0.0])
    E_pos = E_hat / R                                          # Earth at 1 AU, in layer radii
    dE = E_pos - np.array([1.0, 0.0, 0.0])
    dist_E = np.linalg.norm(dE) * R                            # AU
    dE /= np.linalg.norm(dE)
    alpha = math.acos(np.clip(np.dot(-E_hat, -dE), -1, 1))    # Sun-Earth-camera phase angle
    S_E = FS.S0
    lam = (math.sin(alpha) + (math.pi - alpha) * math.cos(alpha)) / math.pi
    trans = math.exp(-tau / 2)                                 # through the inner half of the layer
    E_earth = S_E * 0.434 * (6371.0 / (dist_E * AU_KM)) ** 2 * lam * trans
    E_moon = S_E * 0.12 * (1737.4 / (dist_E * AU_KM)) ** 2 * lam * 0.75 * trans
    off = np.cross(dE, [0.0, 0.0, 1.0]); off /= np.linalg.norm(off)
    dM = dE + off * (3.0e5 / (dist_E * AU_KM)) + np.array([0, 0, 1.0]) * (2.0e5 / (dist_E * AU_KM))
    dM /= np.linalg.norm(dM)
    em_dirs = np.array([dE, dM])
    em_L = np.array([E_earth, E_moon]) / (math.pi * (rad / D) ** 2)
    em_C = np.array([norm(np.array([0.85, 0.92, 1.0]) * SUN_RGB), norm(np.array([1.0, 0.95, 0.9]) * SUN_RGB)])
    points('EarthMoon', em_dirs, em_L, em_C)
    print(json.dumps({'earth_mag': -26.74 - 2.5 * math.log10(E_earth / 1361), 'moon_mag': -26.74 - 2.5 * math.log10(E_moon / 1361),
                      'earth_from_sun_deg': math.degrees(math.acos(np.dot(dE, [-1.0, 0, 0]))), 'earth_dist_AU': dist_E}), flush=True)

    # --- the integrated sky beyond dmax
    sw = a.sky_width
    Dd = FS.directions(sw, sw // 2)
    G = np.concatenate([FS.far_glow(Dd[r0:r0 + 128], tau, a.rho, a.dr, a.psi, a.lat, a.dmax)[0]
                        for r0 in range(0, sw // 2, 128)], 0)
    rgb = G[..., None] * c_diff[None, None, :]
    img = bpy.data.images.new('FarGlow', sw, sw // 2, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    img.pixels.foreach_set(np.concatenate([rgb, np.ones((sw // 2, sw, 1))], -1).astype(np.float32).ravel())
    img.update()
    wo = sc.world; nt = wo.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    e1n = nt.nodes.new('ShaderNodeTexEnvironment'); e1n.image = img
    nt.links.new(tc.outputs['Generated'], e1n.inputs['Vector'])
    b1 = nt.nodes.new('ShaderNodeBackground'); b1.inputs['Strength'].default_value = 1.0
    nt.links.new(e1n.outputs['Color'], b1.inputs['Color'])
    # the counter-sun: glints of the column straight out beyond dmax
    col_out = FS.column_out(tau, a.dr, a.dmax)
    al_ = (np.arange(4096) + 0.5) / 4096 * 10.0                 # deg from the antisolar point
    prof = col_out * R_glint * S * glint_intensity(al_, t_out, edge_frac, th_sun=TH_SUN)
    flux = float(np.sum(prof * 2 * np.pi * np.radians(al_) * np.radians(al_[1] - al_[0])))
    print(json.dumps({'column_out': col_out, 'R_glint': R_glint, 'counter_sun_mag': -26.74 - 2.5 * math.log10(flux / 1361),
                      'counter_sun_peak_W_m2_sr': float(prof[0]), 'sky_max_cd_m2': float(G.max() * 93)}), flush=True)
    pimg = bpy.data.images.new('GlintProfile', len(prof), 1, alpha=True, float_buffer=True)
    pimg.colorspace_settings.name = 'Non-Color'
    pimg.pixels.foreach_set(np.column_stack([prof, prof, prof, np.ones(len(prof))]).astype(np.float32).ravel())
    pimg.update()
    dotn = nt.nodes.new('ShaderNodeVectorMath'); dotn.operation = 'DOT_PRODUCT'
    nt.links.new(tc.outputs['Generated'], dotn.inputs[0]); dotn.inputs[1].default_value = (1, 0, 0)
    acs = nt.nodes.new('ShaderNodeMath'); acs.operation = 'ARCCOSINE'
    nt.links.new(dotn.outputs['Value'], acs.inputs[0])
    uu = nt.nodes.new('ShaderNodeMath'); uu.operation = 'DIVIDE'; uu.inputs[1].default_value = math.radians(10.0)
    nt.links.new(acs.outputs[0], uu.inputs[0])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ'); cmb.inputs['Y'].default_value = 0.5
    nt.links.new(uu.outputs[0], cmb.inputs['X'])
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = pimg; ti.extension = 'CLIP'; ti.interpolation = 'Linear'
    nt.links.new(cmb.outputs[0], ti.inputs['Vector'])
    gl = nt.nodes.new('ShaderNodeEmission')
    gl.inputs['Color'].default_value = (*c_glint, 1)
    nt.links.new(ti.outputs['Color'], gl.inputs['Strength'])
    ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(b1.outputs[0], ad.inputs[0]); nt.links.new(gl.outputs[0], ad.inputs[1])
    # the Sun, dimmed by the plates in front of it
    sun_d = nt.nodes.new('ShaderNodeVectorMath'); sun_d.operation = 'DOT_PRODUCT'
    nt.links.new(tc.outputs['Generated'], sun_d.inputs[0]); sun_d.inputs[1].default_value = (-1, 0, 0)
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = math.cos(TH_SUN)
    nt.links.new(sun_d.outputs['Value'], gt.inputs[0])
    sm = nt.nodes.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = L_sun * trans
    nt.links.new(gt.outputs[0], sm.inputs[0])
    se = nt.nodes.new('ShaderNodeEmission'); se.inputs['Color'].default_value = (*norm(SUN_RGB), 1)
    nt.links.new(sm.outputs[0], se.inputs['Strength'])
    ad2 = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(ad.outputs[0], ad2.inputs[0]); nt.links.new(se.outputs[0], ad2.inputs[1])
    # a scene with its own Sun lamp (sail_shot) leaves the disc out, or it would light the sail twice
    nt.links.new((ad2 if getattr(a, 'sun_disc', True) else ad).outputs[0], out.inputs['Surface'])

    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    near_in = 0
    for k in rs:
        pc = world_to_camera_view(sc, cam, Vector(tuple(dirs[k] * dist[k] * 1e3)))
        if pc.z > 0 and 0 <= pc.x <= 1 and 0 <= pc.y <= 1:
            near_in += 1
            if near_in <= 12:
                print('NEAR', round(pc.x * w), round((1 - pc.y) * h), f'{dist[k]:.0f} km', 'front' if cosv[k] > 0 else 'back',
                      f'{ang_px[k]:.1f}px', flush=True)
    print('NEAR in frame', near_in, flush=True)
    for nm, dv in (('earth', dE), ('counter_sun', np.array([1.0, 0, 0])), ('sun', np.array([-1.0, 0, 0]))):
        pc = world_to_camera_view(sc, cam, Vector(tuple(dv * 1e9)))
        print('PIXEL', nm, round(pc.x * w), round((1 - pc.y) * h), 'in front' if pc.z > 0 else 'behind', flush=True)
    return G


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--f', type=float, default=0.0379)
    ap.add_argument('--lat', type=float, default=30.0)
    ap.add_argument('--rho', type=float, default=0.004, help='all hardware, for the integrated sky')
    ap.add_argument('--rho-film', type=float, default=0.0021, help='film and strips: everything but the vanes')
    ap.add_argument('--dr', type=float, default=0.004, help='layer thickness, AU')
    ap.add_argument('--psi', type=float, default=120.0)
    ap.add_argument('--lens', type=float, default=14.0)
    ap.add_argument('--res', default='2400x1600')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--yaw', type=float, default=0.0)
    ap.add_argument('--pitch', type=float, default=-15.0)
    ap.add_argument('--roll', type=float, default=0.0)
    ap.add_argument('--dmax', type=float, default=3000.0, help='km')
    ap.add_argument('--sky-width', type=int, default=4096)
    ap.add_argument('--seed', type=int, default=5)
    ap.add_argument('--mode', choices=['farside', 'uniform'], default='farside')
    ap.add_argument('--tau', type=float, default=0.881, help='uniform: fill of the layer')
    ap.add_argument('--r-layer', type=float, default=1.0, help='layer radius, AU (uniform: 0.95)')
    ap.add_argument('--cone', type=float, default=23.07, help='uniform: empty cone round the Sun-Earth line, deg')
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 0
    sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0

    fwd, up = camera_axes(a.yaw, a.pitch, a.roll)
    cam = lib.camera(Vector((0, 0, 0)), Vector(tuple(fwd)), lens=a.lens)
    # lib.camera points at a target; set the roll explicitly from 'up'
    zc = -Vector(tuple(fwd)); xc = Vector(tuple(np.cross(fwd, up))).normalized(); yc = zc.cross(xc)
    from mathutils import Matrix
    cam.matrix_world = Matrix(((xc.x, yc.x, zc.x, 0), (xc.y, yc.y, zc.y, 0), (xc.z, yc.z, zc.z, 0), (0, 0, 0, 1)))
    cam.data.clip_start = 0.5
    cam.data.clip_end = 1e13
    G = build_far_sky(sc, cam, fwd, w, h, a)
    G_ref = float(np.percentile(G[G > 0], 50))
    sc.view_settings.exposure = math.log2(0.18 / G_ref)
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    lib.save(sc, a.out)
    print(json.dumps({'glow_p50_W_m2_sr': G_ref, 'exposure': sc.view_settings.exposure}))
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
