"""The swarm from inside, looking away from the Sun: what a camera on a sail would record.

Every number comes from the design spec's scene facts and the model's coverage:
- Sails fill a shell from r_in to r_out with number density n = -ln(1 - f) / (A dR). Within
  D_MAX of the camera each sail is a point source; beyond that the glow is integrated.
- A sail shows the camera its sunlit front when the camera is sunward of it. Diffuse flux
  E = rho S(r) A cos / (pi d^2) with rho the visible reflectance of film plus hardware.
- Glints (design_spec scene_facts.glint): the film reflects the Sun straight back, so every sail
  within 0.52 deg of the camera's antisolar point glints at full strength (mag -12 at 1,000 km), and
  the curled fold-panel edges (21.6 % of the area) within 7.7 deg glint ~800x fainter: a glint halo
  round the antisolar point. The four Al corner vanes, tilted 0-40 deg for control, flash anywhere
  within ~80 deg of the Sun direction, each with probability 1.3e-4 for a given viewer.
- Earth and the Moon, 0.12 AU away, appear near the antisolar point when the camera is on the
  Sun-Earth line.
Output: scene-linear EXR (develop with render/glare.py then render/develop.py).

Usage: blender -b --python render/swarm_field.py -- out.exr [--f 0.0041] [--lens 35]
       [--res 2400x1600] [--yaw 9] [--pitch 4] [--dmax 40000]
"""
import argparse
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
import sail  # noqa: E402

AU_KM = lib.AU / 1e3


def glow_map(f, rho, r_c, r_in, r_out, n_km3, a_km2, dmax, w=512, h=256):
    """Radiance of all sails beyond dmax, per direction (camera frame: +X away from the Sun),
    in W/m^2/sr: L = n A rho / pi  * integral S(r) max(0, r_hat . v) ds over the shell."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    lon = (0.5 - u) * 2 * math.pi
    lat = (v - 0.5) * math.pi
    LON, LAT = np.meshgrid(lon, lat)
    d = np.stack([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)], -1).reshape(-1, 3)
    c = np.array([r_c * AU_KM, 0, 0])
    L = np.zeros(len(d))
    s_max = (r_out + r_in) * AU_KM
    steps = 600
    edges = dmax + (s_max - dmax) * (np.arange(steps + 1) / steps) ** 2
    for k in range(steps):
        s0, s1 = edges[k], edges[k + 1]
        s = 0.5 * (s0 + s1)
        P = c + d * s
        r = np.linalg.norm(P, axis=1)
        inside = (r >= r_in * AU_KM) & (r <= r_out * AU_KM)
        cosv = np.einsum('ij,ij->i', P / r[:, None], d)
        S = lib.L_SUN / (4 * math.pi * (r * 1e3) ** 2)
        L += np.where(inside, n_km3 * a_km2 * rho / math.pi * S * np.maximum(cosv, 0) * (s1 - s0), 0.0)
    return L.reshape(h, w)


def glint_profile(t_in, t_out, alpha_max=10.0, n=4096):
    """Radiance of the integrated film glints vs angle from the antisolar point, per unit of
    (outward column coverage x glint radiance): the interior's mirror image of the Sun (0.52 deg,
    soft-edged by the Sun's own 0.29 deg radius) and the curled panel edges, whose maximum slope
    varies panel to panel (u = 0.3-1 of the 3.7 deg curl), each spreading its light as 1/alpha^2."""
    a = (np.arange(n) + 0.5) / n * alpha_max
    core = np.clip((t_in + 0.15 - a) / 0.3, 0, 1)
    halo = np.zeros(n)
    # panel-to-panel residual moment: u uniform in 0.3-1, with a tail to 1.3 (lamination scatter)
    us = np.linspace(0.3, 1.3, 41)
    wts = np.where(us <= 1.0, 1.0, (1.3 - us) / 0.3)
    for u, wt in zip(us, wts):
        tu = max(t_out * u, t_in * 1.2)
        prof = tu ** 2 / (2 * math.log(tu / t_in) * np.maximum(a, t_in) ** 2)
        halo += wt * np.where(a < tu, prof, 0) * (t_in / tu) ** 2
    halo /= wts.sum()
    return a, core, halo


def build_sky(sc, a, cam, fwd, w, h, own_sun=True):
    """The swarm's sky in this scene's frame (+X away from the Sun): point-source sails within
    dmax inside the camera's view, the integrated glow beyond, the counter-sun and its halo, the
    Milky Way, and (optionally) Earth and the Moon. Returns the glow map.

    own_sun=False: the scene already has a Sun lamp for the camera's distance r_cam; Earth and the
    Moon are then darkened by r_cam^2 so they still look lit at 1 AU."""
    spec = sail.load_spec()
    sf = spec['scene']
    side = spec['parts']['sail_film']['dims_m']['corner_to_corner'] / math.sqrt(2) / 1e3
    A_km2 = side * side
    dR = (a.r_out - a.r_in) * AU_KM
    n = -math.log(1 - a.f) / (A_km2 * dR)                  # sails per km^3
    eo = math.radians(a.earth_offset)
    ed = Vector((math.cos(eo), -math.sin(eo) * 0.6, -math.sin(eo) * 0.8)).normalized()
    hfov = 2 * math.atan(18 / a.lens)
    vfov = 2 * math.atan(18 * h / w / a.lens)
    pix = hfov / w
    # --- point sources within dmax inside the view frustum (+ margin)
    rnd = np.random.default_rng(a.seed)
    cone = math.hypot(hfov, vfov) / 2 + math.radians(2)
    Omega = 2 * math.pi * (1 - math.cos(cone))
    N = rnd.poisson(n * Omega * a.dmax ** 3 / 3)
    cz = 1 - rnd.random(N) * (1 - math.cos(cone))
    ph = rnd.random(N) * 2 * math.pi
    sz = np.sqrt(1 - cz * cz)
    local = np.stack([cz, sz * np.cos(ph), sz * np.sin(ph)], 1)
    # rotate cone axis (+X) onto fwd
    f3 = np.array(fwd)
    up = np.array([0, 0, 1.0])
    yv = np.cross(up, f3); yv /= np.linalg.norm(yv)
    zv = np.cross(f3, yv)
    dirs = local[:, :1] * f3 + local[:, 1:2] * yv + local[:, 2:3] * zv
    dist = a.dmax * rnd.random(N) ** (1 / 3)
    dist = np.maximum(dist, 50.0)
    C = np.array([a.r_cam * AU_KM, 0, 0])
    P = C + dirs * dist[:, None]
    r = np.linalg.norm(P, axis=1)
    keep = (r >= a.r_in * AU_KM) & (r <= a.r_out * AU_KM)
    dirs, dist, P, r = dirs[keep], dist[keep], P[keep], r[keep]
    rhat = P / r[:, None]
    to_cam = -dirs
    S = lib.L_SUN / (4 * math.pi * (r * 1e3) ** 2)
    cosv = np.einsum('ij,ij->i', -rhat, to_cam)              # front normal (toward the Sun) . to camera
    front = cosv > 0
    # resolved sails: film and hardware diffuse; the vanes are drawn as their own flashes below
    E_diff = np.where(front, a.rho_film * S * A_km2 * 1e6 * cosv / math.pi / (dist * 1e3) ** 2, 0.0)
    # glints: angle between the camera direction from the sail and the Sun's mirror direction (-rhat)
    ang = np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', to_cam, -rhat), -1, 1)))
    g = sf['glint']
    E_int = np.where(ang < g['half_angle_interior_deg'], 1.835e-3 * (1000 / dist) ** 2, 0.0)
    # curled edges: slope decays exponentially from each hinge strip, so the area per slope goes as
    # 1/s and the reflected intensity per solid angle as 1/alpha^2 out to the 7.7 deg maximum;
    # normalised to the same total edge flux as a uniform cone
    t_in, t_out = g['half_angle_interior_deg'], g['half_angle_hinge_edges_deg']
    edge_ratio = (g['hinge_edge_area_fraction'] / (1 - g['hinge_edge_area_fraction'])) * (t_in / t_out) ** 2
    prof = t_out ** 2 / (2 * math.log(t_out / t_in) * np.maximum(ang, t_in) ** 2)
    E_edge = np.where(ang < t_out, 1.835e-3 * edge_ratio * prof * (1000 / dist) ** 2, 0.0)
    # vanes: 4 per sail, 87 m2 of wrinkled aluminium (R 0.9), tilted 0-40 deg for control (uniform
    # over that cap). The reflected beam is the Sun's disc broadened by wrinkles to ~1.3 deg
    # half-angle; intensity = reflected power / beam solid angle (energy-conserving).
    vane_half = math.degrees(math.acos(1 - 2 * g['p_random_direction_per_vane']))
    beam = 2 * math.pi * (1 - math.cos(math.radians(vane_half)))
    E_vane = np.zeros(len(r))
    for k in range(4):
        tilt = np.arccos(1 - rnd.random(len(r)) * (1 - math.cos(math.radians(40))))
        az = rnd.random(len(r)) * 2 * math.pi
        t1 = np.cross(-rhat, np.array([0, 0, 1.0])); t1 /= np.linalg.norm(t1, axis=1)[:, None]
        t2 = np.cross(-rhat, t1)
        nv = (-rhat) * np.cos(tilt)[:, None] + (t1 * np.cos(az)[:, None] + t2 * np.sin(az)[:, None]) * np.sin(tilt)[:, None]
        din = rhat                                              # sunlight travels outward
        refl = din - 2 * np.einsum('ij,ij->i', din, nv)[:, None] * nv
        va = np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', refl, to_cam), -1, 1)))
        I_vane = 0.9 * S * 87.0 * np.cos(tilt) / beam             # W/sr
        E_vane += np.where(va < vane_half, I_vane / (dist * 1e3) ** 2, 0.0)
    E_tot = E_diff + E_int + E_edge + E_vane
    vis = E_tot > 0
    print(json.dumps({'n_per_km3': n, 'sails_drawn': int(vis.sum()), 'interior_glints': int((E_int > 0).sum()),
                      'edge_glints': int((E_edge > 0).sum()), 'vane_glints': int((E_vane > 0).sum()),
                      'nearest_km': float(dist.min()), 'brightest_mag': float(-26.74 - 2.5 * math.log10(E_tot.max() / 1361))}))
    # colours: diffuse = sunlight off near-neutral hardware with the film's violet AR residual;
    # film glints = the AR coat's residual reflection (violet); vanes = sunlight off aluminium
    film = np.array(sf['sail_brightness']['glint_colour_linear_sRGB_rel'])
    sun = np.array([1.0, 0.8791, 0.8211])
    luma = np.array([0.2126, 0.7152, 0.0722])
    c_diff = (0.91 + 0.09 * film / (film @ luma)) * sun
    c_glint = film * sun
    c_vane = sun * np.array([0.97, 0.97, 0.98])
    def norm(c):
        return c / (c @ luma)
    col = (E_diff[:, None] * norm(c_diff) + (E_int + E_edge)[:, None] * norm(c_glint) + E_vane[:, None] * norm(c_vane)) / np.maximum(E_tot, 1e-300)[:, None]
    # --- emissive points: icosahedra 0.7 px across at their true direction, one mesh
    D = 1e7                                                     # m, draw distance
    rad = D * pix * 0.35
    Lrad = E_tot / (math.pi * (rad / D) ** 2)
    sel = np.where(vis)[0]
    t = (1 + 5 ** 0.5) / 2
    iv = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                   [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    iv /= np.linalg.norm(iv, axis=1)[:, None]
    fi = np.array([[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                   [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])
    co = (dirs[sel][:, None, :] * D + iv[None] * rad).reshape(-1, 3)
    faces = (fi[None] + 12 * np.arange(len(sel))[:, None, None]).reshape(-1, 3)
    me = bpy.data.meshes.new('Sails')
    me.vertices.add(len(co)); me.vertices.foreach_set('co', co.astype(np.float32).ravel())
    me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
    me.polygons.add(len(faces)); me.polygons.foreach_set('loop_start', np.arange(0, faces.size, 3, dtype=np.int32))
    me.update(calc_edges=True)
    aL = me.attributes.new('L', 'FLOAT', 'FACE'); aL.data.foreach_set('value', np.repeat(Lrad[sel], 20).astype(np.float32))
    aC = me.attributes.new('C', 'FLOAT_COLOR', 'FACE')
    aC.data.foreach_set('color', np.repeat(np.column_stack([col[sel], np.ones(len(sel))]), 20, axis=0).astype(np.float32).ravel())
    m = bpy.data.materials.new('SailPoint'); m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    al = nt.nodes.new('ShaderNodeAttribute'); al.attribute_name = 'L'
    ac = nt.nodes.new('ShaderNodeAttribute'); ac.attribute_name = 'C'
    nt.links.new(ac.outputs['Color'], em.inputs['Color'])
    nt.links.new(al.outputs['Fac'], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs[0], ad.inputs[0]); nt.links.new(tr.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], o.inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'
    me.materials.append(m)
    ob = bpy.data.objects.new('Sails', me)
    bpy.context.scene.collection.objects.link(ob)
    # --- glow of everything beyond dmax, and the stars behind it (equatorial frame not needed:
    #     the Milky Way's place is arbitrary for this view; its brightness is real)
    G = glow_map(a.f, a.rho, a.r_cam, a.r_in, a.r_out, n, A_km2, a.dmax)
    gh, gw = G.shape
    rgb = G[..., None] * norm(c_diff)[None, None, :]
    mwp = os.path.join(lib.REPO, 'assets', 'milkyway_8k.jpg')
    img_mw = bpy.data.images.load(mwp)
    img = bpy.data.images.new('Glow', gw, gh, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    img.pixels.foreach_set(np.concatenate([rgb, np.ones((gh, gw, 1))], -1).astype(np.float32).ravel())
    img.update()
    w_ = sc.world; nt = w_.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    e1 = nt.nodes.new('ShaderNodeTexEnvironment'); e1.image = img
    e2 = nt.nodes.new('ShaderNodeTexEnvironment'); e2.image = img_mw
    nt.links.new(tc.outputs['Generated'], e1.inputs['Vector'])
    nt.links.new(tc.outputs['Generated'], e2.inputs['Vector'])
    b1 = nt.nodes.new('ShaderNodeBackground'); b1.inputs['Strength'].default_value = 1.0
    b2 = nt.nodes.new('ShaderNodeBackground'); b2.inputs['Strength'].default_value = 3.7e-5
    nt.links.new(e1.outputs['Color'], b1.inputs['Color']); nt.links.new(e2.outputs['Color'], b2.inputs['Color'])
    ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(b1.outputs[0], ad.inputs[0]); nt.links.new(b2.outputs[0], ad.inputs[1])
    # the integrated glints of every unresolved sail beyond dmax: the counter-sun and its halo
    t_in, t_out = g['half_angle_interior_deg'], g['half_angle_hinge_edges_deg']
    path_km = (a.r_out - a.r_cam) * AU_KM - a.dmax
    f_out = n * A_km2 * path_km                                  # outward column coverage
    S_mid = lib.flux(0.5 * (a.r_cam + a.r_out))
    L_g = sf['glint']['glint_radiance_W_m2_sr'] if 'glint_radiance_W_m2_sr' in sf['glint'] else sf['sail_brightness']['glint_radiance_W_m2_sr']
    L_g = L_g * S_mid / lib.flux(0.919)
    edge_frac = g['hinge_edge_area_fraction']
    al, core, halo = glint_profile(t_in, t_out)
    prof = f_out * L_g * ((1 - edge_frac) * core + edge_frac * halo)
    print(json.dumps({'counter_sun_W_m2_sr': float(prof[0]), 'f_out': f_out,
                      'counter_sun_mag': float(-26.74 - 2.5 * math.log10(np.sum(prof * 2 * np.pi * np.radians(al) * np.radians(al[1] - al[0])) / 1361)),
                      'halo_2deg_W_m2_sr': float(np.interp(2.0, al, prof))}))
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
    gl.inputs['Color'].default_value = (*norm(c_glint), 1)
    nt.links.new(ti.outputs['Color'], gl.inputs['Strength'])
    ad2 = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(ad.outputs[0], ad2.inputs[0]); nt.links.new(gl.outputs[0], ad2.inputs[1])
    nt.links.new(ad2.outputs[0], out.inputs['Surface'])
    # --- Earth and Moon (full phase, 0.12 AU), lit by the Sun at 1 AU
    if a.earth_offset:
        de = 0.12 * AU_KM * 1e3
        bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=6.371e6, location=ed * de)
        earth = bpy.context.object
        em_ = bpy.data.materials.new('Earth'); em_.use_nodes = True
        bsdf = em_.node_tree.nodes['Principled BSDF']
        tex = em_.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.join(lib.REPO, 'assets', 'earth_day_4k.jpg'))
        em_.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.9
        earth.data.materials.append(em_)
        mo = ed * de + Vector((0.0, 3.84e8 * 0.8, 3.84e8 * 0.6))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.737e6, location=mo)
        moon = bpy.context.object
        moon.data.materials.append(lib.principled('Moon', (0.12, 0.115, 0.11), rough=1.0))
        # Earth sits 1/0.88^2 = 1.29x farther from the Sun than the camera: dim the lamp's effect by
        # lighting with the 1 AU flux
        if own_sun:
            lib.add_sun(1.0, direction=(1.0, 0, 0))
        else:
            k = a.r_cam ** 2
            bsdf.inputs['Base Color'].default_value = (k, k, k, 1)
            mix = em_.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            em_.node_tree.links.new(tex.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = (k, k, k, 1)
            em_.node_tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
            moon.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12 * k, 0.115 * k, 0.11 * k, 1)
        from bpy_extras.object_utils import world_to_camera_view
        for ob_, nm in ((earth, 'earth'), (moon, 'moon')):
            pc = world_to_camera_view(sc, cam, ob_.location)
            print('PIXEL', nm, round(pc.x * w), round((1 - pc.y) * h), 'depth', pc.z)
    return G


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--f', type=float, default=0.0041)
    ap.add_argument('--rho', type=float, default=0.004, help='visible reflectance, film + all hardware incl. vanes (model rhoVis)')
    ap.add_argument('--rho-film', type=float, default=0.0021, help='film, hinge strips, scribes, hems: everything but the vanes')
    ap.add_argument('--r-in', type=float, default=0.86)
    ap.add_argument('--r-out', type=float, default=0.92)
    ap.add_argument('--r-cam', type=float, default=0.88)
    ap.add_argument('--lens', type=float, default=35.0)
    ap.add_argument('--res', default='2400x1600')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--yaw', type=float, default=9.0, help='camera axis from the antisolar point, deg (to +Y)')
    ap.add_argument('--pitch', type=float, default=4.0)
    ap.add_argument('--dmax', type=float, default=40000.0, help='km; point sources inside, glow beyond')
    ap.add_argument('--seed', type=int, default=3)
    ap.add_argument('--earth-offset', type=float, default=3.2, help='deg from the antisolar point (0 = none)')
    ap.add_argument('--aim-earth', action='store_true', help='yaw/pitch relative to Earth instead of the antisolar point')
    a = ap.parse_args(argv)
    w, h = (int(x) for x in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 0
    # sub-pixel point sources on a smooth background: no denoiser (it smears undersampled points)
    sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    # Earth (if shown) sits earth_offset deg from the antisolar point, down and to the left
    eo = math.radians(a.earth_offset)
    ed = Vector((math.cos(eo), -math.sin(eo) * 0.6, -math.sin(eo) * 0.8)).normalized()
    # camera: +X points away from the Sun; yaw/pitch put the antisolar point (or Earth) off-centre
    yaw, pitch = math.radians(a.yaw), math.radians(a.pitch)
    base = ed if a.aim_earth else Vector((1, 0, 0))
    b_yaw = math.atan2(base.y, base.x)
    b_pitch = math.asin(base.z)
    fwd = Vector((math.cos(b_pitch + pitch) * math.cos(b_yaw + yaw), math.cos(b_pitch + pitch) * math.sin(b_yaw + yaw), math.sin(b_pitch + pitch)))
    cam = lib.camera(Vector((0, 0, 0)), fwd, lens=a.lens)
    cam.data.clip_start = 1.0
    cam.data.clip_end = 1e12
    G = build_sky(sc, a, cam, fwd, w, h)
    G_ref = float(np.percentile(G[G > 0], 75)) if (G > 0).any() else 1e-3
    sc.view_settings.exposure = math.log2(0.10 / G_ref)
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    lib.save(sc, a.out)
    print(json.dumps({'glow_p75_W_m2_sr': G_ref, 'glow_cd_m2': G_ref * 93, 'exposure': sc.view_settings.exposure}))
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
