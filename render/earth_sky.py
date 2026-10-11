"""Jenny Lake, Grand Teton National Park, looking west at dusk or night: the sky Earth has tonight,
and the sky with a swarm at Earth's limit. Same place, same camera, metered like a photograph.

- Terrain: USGS 3DEP elevation via AWS Terrain Tiles (assets/teton_dem.png, 8 m grid), with
  procedural rock, scree, meadow, forest floor and late-summer snowfields from slope, height and
  aspect. Conifer forest instanced below the 2,900 m treeline. The lake surface at 2068.5 m.
- Sky: render/sky_map.py (multiple-scattering twilight, swarm glow and its scattered light, Milky
  Way, airglow, zodiacal light) as the world, and the star catalogue as point sources.
- Aerial perspective on every surface: transmittance over the ray length with Rayleigh + aerosol
  extinction at ~2.5 km altitude, and in-scatter equal to the horizon sky in that direction.

Usage: blender -b --python render/earth_sky.py -- out.png --sun-alt -9 [--glow shell --f 0.00411
       --rho 0.004 --r 0.8604] [--exposure EV | --meter dusk|night|glow] [--res 2400x1350]
       [--samples 128] [--date 2026-08-22]
"""
import argparse
import hashlib
import json
import math
import os
import random
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import lib  # noqa: E402
import ephem  # noqa: E402

ASSETS = os.path.join(lib.REPO, 'assets')
SITE = {'lat': 43.7535, 'lon': -110.7195}
LAKE_Z = 2068.55
CAM_XY = (204.0, 1205.0)
LUMA = np.array([0.2126, 0.7152, 0.0722])
SCRATCH = os.environ.get('SKY_CACHE', '/tmp/sky_cache')


# ---------------------------------------------------------------------------------------------
# terrain
# ---------------------------------------------------------------------------------------------

def load_dem():
    """3DEP terrain with Jenny Lake's bed carved below the water level, and the foreground beach
    height field (render/teton_prep.py, system python)."""
    meta = json.load(open(os.path.join(ASSETS, 'teton_dem.json')))
    out = os.path.join(SCRATCH, 'teton_%d_%d' % CAM_XY)
    if not os.path.exists(os.path.join(out, 'beach.npy')):
        os.makedirs(out, exist_ok=True)
        subprocess.run(['python3', os.path.join(lib.HERE, 'teton_prep.py'), out, str(CAM_XY[0]), str(CAM_XY[1]), str(LAKE_Z)], check=True)
    z = np.load(os.path.join(out, 'teton_dem.npy'))
    beach = np.load(os.path.join(out, 'beach.npy'))
    bmeta = json.load(open(os.path.join(out, 'beach.json')))
    bmeta['stone'] = np.load(os.path.join(out, 'beach_stone.npy'))
    return z, meta, beach, bmeta


def dem_height(z, meta, x, y):
    st = meta['step_m']
    c = (x - meta['x_min_m']) / st
    r = (meta['y_max_m'] - y) / st
    c0, r0 = int(c), int(r)
    fc, fr = c - c0, r - r0
    return float(z[r0, c0] * (1 - fc) * (1 - fr) + z[r0, c0 + 1] * fc * (1 - fr) + z[r0 + 1, c0] * (1 - fc) * fr + z[r0 + 1, c0 + 1] * fc * fr)


def grid_mesh(name, X, Y, Z, keep=None):
    """Quad mesh over a regular grid (rows north -> south); `keep` masks quads."""
    ny, nx = Z.shape
    co = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()]).astype(np.float32)
    i = np.arange(ny - 1)[:, None] * nx + np.arange(nx - 1)[None, :]
    quads = np.stack([i, i + nx, i + nx + 1, i + 1], -1)
    if keep is not None:
        quads = quads[keep]
    quads = quads.reshape(-1, 4)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.ravel())
    me.loops.add(quads.size)
    me.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me.polygons.add(len(quads))
    me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def terrain_mesh(z, meta, bmeta, x_range=(-10500, 1200), y_range=(-9500, 11500)):
    st = meta['step_m']
    c0 = int((x_range[0] - meta['x_min_m']) / st)
    c1 = int((x_range[1] - meta['x_min_m']) / st)
    r0 = int((meta['y_max_m'] - y_range[1]) / st)
    r1 = int((meta['y_max_m'] - y_range[0]) / st)
    sub = z[r0:r1, c0:c1]
    xs = meta['x_min_m'] + (np.arange(c0, c1)) * st
    ys = meta['y_max_m'] - (np.arange(r0, r1)) * st
    X, Y = np.meshgrid(xs, ys)
    # hole under the foreground beach (its edges overlap the DEM by ~8 m)
    bx0, by1 = bmeta['x0'], bmeta['y1']
    bx1, by0 = bx0 + (bmeta['nx'] - 1) * bmeta['h'], by1 - (bmeta['ny'] - 1) * bmeta['h']
    qx, qy = X[:-1, :-1], Y[:-1, :-1]
    inside = (qx > bx0 + 8) & (qx + st < bx1 - 8) & (qy - st > by0 + 8) & (qy < by1 - 8)
    ob = grid_mesh('Terrain', X, Y, sub, keep=~inside)
    return ob, (X, Y, sub)


def beach_mesh(beach, bmeta):
    h = bmeta['h']
    xs = bmeta['x0'] + np.arange(bmeta['nx']) * h
    ys = bmeta['y1'] - np.arange(bmeta['ny']) * h
    X, Y = np.meshgrid(xs, ys)
    ob = grid_mesh('Beach', X, Y, beach)
    at = ob.data.attributes.new('stone', 'FLOAT', 'POINT')
    at.data.foreach_set('value', bmeta['stone'].ravel().astype(np.float32))
    return ob


def smooth_field(shape, cell, seed):
    """Smooth random field (unit variance) by bilinear upsampling of coarse noise."""
    rng = np.random.default_rng(seed)
    ny, nx = shape
    gy, gx = ny // cell + 3, nx // cell + 3
    n = rng.normal(size=(gy, gx))
    yi = np.arange(ny) / cell
    xi = np.arange(nx) / cell
    y0 = yi.astype(int); x0 = xi.astype(int)
    fy = (yi - y0)[:, None]; fx = (xi - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = n[y0][:, x0]; b = n[y0][:, x0 + 1]; c = n[y0 + 1][:, x0]; d = n[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def forest_density(X, Y, Z, cam):
    """Trees per m^2 at each DEM vertex: lodgepole/fir/spruce below the treeline, none on cliffs,
    the lake, or the sagebrush flats; thinned with distance to keep the instance count sane."""
    gy, gx = np.gradient(Z, 8.0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    field = 0.7 * smooth_field(Z.shape, 30, 3) + 0.5 * smooth_field(Z.shape, 7, 4)
    field /= field.std()
    tree_line = 2870 + 90 * field
    d = np.hypot(X - cam[0], Y - cam[1])
    dens = np.full(Z.shape, 0.045)
    dens *= np.clip((tree_line - Z) / 120, 0, 1)
    dens *= np.clip((42 - slope) / 10, 0, 1)
    dens *= (Z > LAKE_Z + 0.4)
    # Jackson Hole's sagebrush flats: open valley floor east of the moraines, with forest on them
    flats = (Z < 2100) & (slope < 4) & (X > 600)
    dens *= np.where(flats, 0.08, 1.0)
    dens *= np.clip(0.75 + 0.45 * field, 0.15, 1.3)
    dens *= np.clip(900 / np.maximum(d, 1), 0.18, 1.0)
    dens[d < 25] = 0
    return dens.astype(np.float32), slope


# ---------------------------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------------------------

class G:
    def __init__(self, nt):
        self.nt, self.N, self.L = nt, nt.nodes, nt.links

    def n(self, kind, **kw):
        node = self.N.new(kind)
        for k, v in kw.items():
            if k.startswith('_'):
                setattr(node, k[1:], v)
            else:
                self.s(node.inputs[k], v)
        return node

    def s(self, sock, v):
        if hasattr(v, 'is_output') or hasattr(v, 'links'):
            self.L.new(v, sock)
        elif isinstance(v, tuple) and len(v) == 3 and len(sock.default_value) == 4:
            sock.default_value = (*v, 1.0)
        else:
            sock.default_value = v

    def m(self, op, a, b=None, clamp=False):
        node = self.N.new('ShaderNodeMath')
        node.operation = op
        node.use_clamp = clamp
        self.s(node.inputs[0], a)
        if b is not None:
            self.s(node.inputs[1], b)
        return node.outputs[0]

    def rgb(self, fac, a, b):
        node = self.N.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        self.s(node.inputs['Factor'], fac)
        self.s(node.inputs[6], a)
        self.s(node.inputs[7], b)
        return node.outputs[2]

    def ramp(self, fac, stops):
        node = self.N.new('ShaderNodeValToRGB')
        cr = node.color_ramp
        rgba = lambda c: (*c, 1) if len(c) == 3 else c
        cr.elements[0].position, cr.elements[0].color = stops[0][0], rgba(stops[0][1])
        cr.elements[1].position, cr.elements[1].color = stops[-1][0], rgba(stops[-1][1])
        for p, c in stops[1:-1]:
            cr.elements.new(p).color = rgba(c)
        self.s(node.inputs['Fac'], fac)
        return node.outputs['Color']

    def smooth(self, x, a, b):
        node = self.N.new('ShaderNodeMapRange')
        node.interpolation_type = 'SMOOTHSTEP'
        self.s(node.inputs['Value'], x)
        node.inputs['From Min'].default_value = a
        node.inputs['From Max'].default_value = b
        return node.outputs['Result']


def aerial_group(src_img, beta):
    """Node group: surface shader -> as seen through the air along the ray that reached it:
    L T + J (1 - T), T = exp(-beta d) per channel, J the air's single-scattering source in the
    ray's direction (render/sky_map.py inscatter_source)."""
    ng = bpy.data.node_groups.new('Aerial', 'ShaderNodeTree')
    ng.interface.new_socket('Shader', in_out='INPUT', socket_type='NodeSocketShader')
    ng.interface.new_socket('Shader', in_out='OUTPUT', socket_type='NodeSocketShader')
    g = G(ng)
    gin = g.n('NodeGroupInput')
    gout = g.n('NodeGroupOutput')
    lp = g.n('ShaderNodeLightPath')
    geo = g.n('ShaderNodeNewGeometry')
    neg = g.n('ShaderNodeVectorMath', _operation='SCALE')
    g.s(neg.inputs[0], geo.outputs['Incoming'])
    neg.inputs['Scale'].default_value = -1
    env = g.n('ShaderNodeTexEnvironment')
    env.image = src_img
    env.interpolation = 'Linear'
    g.s(env.inputs['Vector'], neg.outputs[0])
    Ts = [g.m('EXPONENT', g.m('MULTIPLY', lp.outputs['Ray Length'], -b)) for b in beta]
    T = g.n('ShaderNodeCombineColor')
    for k, t in enumerate(Ts):
        g.s(T.inputs[k], t)
    F = g.m('SUBTRACT', 1.0, Ts[1])
    one_minus = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='SUBTRACT')
    one_minus.inputs['Factor'].default_value = 1
    one_minus.inputs[6].default_value = (1, 1, 1, 1)
    g.s(one_minus.inputs[7], T.outputs[0])
    ins = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY')
    ins.inputs['Factor'].default_value = 1
    g.s(ins.inputs[6], env.outputs['Color'])
    g.s(ins.inputs[7], one_minus.outputs[2])
    em = g.n('ShaderNodeEmission')
    g.s(em.inputs['Color'], ins.outputs[2])
    g.s(em.inputs['Strength'], g.m('DIVIDE', 1.0, g.m('MAXIMUM', F, 1e-6)))
    mix = g.n('ShaderNodeMixShader')
    g.s(mix.inputs['Fac'], F)
    g.s(mix.inputs[1], gin.outputs[0])
    g.s(mix.inputs[2], em.outputs[0])
    g.s(gout.inputs[0], mix.outputs[0])
    return ng


def finish(m, shader_out, aerial):
    """Route a material's surface through the aerial-perspective group."""
    nt = m.node_tree
    out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    grp = nt.nodes.new('ShaderNodeGroup')
    grp.node_tree = aerial
    nt.links.new(shader_out, grp.inputs[0])
    nt.links.new(grp.outputs[0], out.inputs['Surface'])


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    for n in list(m.node_tree.nodes):
        m.node_tree.nodes.remove(n)
    m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    return m, G(m.node_tree)


def terrain_material(aerial):
    m, g = new_mat('TetonTerrain')
    tc = g.n('ShaderNodeTexCoord')
    geo = g.n('ShaderNodeNewGeometry')
    sepP = g.n('ShaderNodeSeparateXYZ'); g.s(sepP.inputs[0], geo.outputs['Position'])
    sepN = g.n('ShaderNodeSeparateXYZ'); g.s(sepN.inputs[0], geo.outputs['Normal'])
    z = sepP.outputs['Z']
    nz = sepN.outputs['Z']
    # noise fields (object/world metres)
    n_big = g.n('ShaderNodeTexNoise', Scale=0.004, Detail=6.0, Roughness=0.55)
    g.s(n_big.inputs['Vector'], geo.outputs['Position'])
    n_mid = g.n('ShaderNodeTexNoise', Scale=0.05, Detail=8.0, Roughness=0.6)
    g.s(n_mid.inputs['Vector'], geo.outputs['Position'])
    n_fine = g.n('ShaderNodeTexNoise', Scale=0.6, Detail=10.0, Roughness=0.65)
    g.s(n_fine.inputs['Vector'], geo.outputs['Position'])
    vor = g.n('ShaderNodeTexVoronoi', Scale=0.08)
    g.s(vor.inputs['Vector'], geo.outputs['Position'])
    # slope steepness 0 (flat) .. 1 (vertical)
    steep = g.m('SUBTRACT', 1.0, nz)
    jitter = g.m('MULTIPLY', g.m('SUBTRACT', n_big.outputs['Fac'], 0.5), 0.25)
    rock_mask = g.smooth(g.m('ADD', steep, jitter), 0.24, 0.36)          # ~40-50 deg
    alt_n = g.m('ADD', z, g.m('MULTIPLY', g.m('SUBTRACT', n_big.outputs['Fac'], 0.5), 260))
    alpine = g.smooth(alt_n, 2820, 3000)
    valley = g.smooth(alt_n, 2160, 2100)
    # colours (linear albedo)
    granite = g.ramp(g.m('ADD', g.m('MULTIPLY', n_mid.outputs['Fac'], 0.7), g.m('MULTIPLY', n_fine.outputs['Fac'], 0.3)),
                     [(0.30, (0.085, 0.082, 0.078)), (0.50, (0.17, 0.165, 0.155)), (0.72, (0.26, 0.25, 0.235))])
    # dark banding of the Teton gneiss (diabase dikes, lichen)
    bands = g.n('ShaderNodeTexWave', Scale=0.004, Distortion=6.0, Detail=4.0)
    g.s(bands.inputs['Vector'], geo.outputs['Position'])
    granite = g.rgb(g.m('MULTIPLY', g.smooth(bands.outputs['Fac'], 0.75, 0.9), 0.55), granite, (0.05, 0.05, 0.05))
    scree = g.ramp(n_fine.outputs['Fac'], [(0.3, (0.16, 0.15, 0.14)), (0.7, (0.27, 0.255, 0.24))])
    meadow = g.ramp(n_mid.outputs['Fac'], [(0.3, (0.075, 0.075, 0.035)), (0.7, (0.13, 0.115, 0.06))])
    forest_floor = g.ramp(n_mid.outputs['Fac'], [(0.3, (0.022, 0.03, 0.016)), (0.7, (0.05, 0.055, 0.03))])
    sage = g.ramp(n_fine.outputs['Fac'], [(0.3, (0.10, 0.105, 0.08)), (0.7, (0.16, 0.155, 0.12))])
    low = g.rgb(valley, forest_floor, sage)
    vegetated = g.rgb(alpine, low, meadow)
    talus = g.rgb(g.m('MULTIPLY', alpine, g.smooth(steep, 0.12, 0.24)), vegetated, scree)
    col = g.rgb(rock_mask, talus, granite)
    # late-August snow: high, not too steep, facing north to east, patchy
    aspect = g.m('ADD', sepN.outputs['Y'], g.m('MULTIPLY', sepN.outputs['X'], 0.6))
    snow = g.m('MULTIPLY', g.smooth(z, 3050, 3250), g.smooth(steep, 0.42, 0.30))
    snow = g.m('MULTIPLY', snow, g.smooth(aspect, -0.05, 0.25))
    snow = g.m('MULTIPLY', snow, g.smooth(g.m('ADD', n_mid.outputs['Fac'], g.m('MULTIPLY', vor.outputs['Distance'], 0.4)), 0.62, 0.70))
    col = g.rgb(snow, col, (0.80, 0.82, 0.86))
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.s(bsdf.inputs['Base Color'], col)
    g.s(bsdf.inputs['Roughness'], g.m('ADD', 0.75, g.m('MULTIPLY', snow, -0.35)))
    bsdf.inputs['Specular IOR Level'].default_value = 0.35
    # relief finer than the 8 m grid: rock blocks and gullies
    bump_h = g.m('ADD', g.m('MULTIPLY', n_fine.outputs['Fac'], 1.0), g.m('MULTIPLY', vor.outputs['Distance'], 1.5))
    bump = g.n('ShaderNodeBump', Strength=0.6, Distance=1.2)
    g.s(bump.inputs['Height'], bump_h)
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    finish(m, bsdf.outputs[0], aerial)
    return m


def water_material(aerial):
    """Clear mountain lake: refracting surface with wind ripples; absorption ~0.1-0.25 per metre
    (red first), so the shelf shows near shore and the basin is dark."""
    m, g = new_mat('Lake')
    geo = g.n('ShaderNodeNewGeometry')
    n1 = g.n('ShaderNodeTexNoise', Scale=0.9, Detail=6.0, Roughness=0.6)
    sc = g.n('ShaderNodeMapping', _vector_type='POINT')
    sc.inputs['Scale'].default_value = (1.0, 3.0, 1.0)
    g.s(sc.inputs['Vector'], geo.outputs['Position'])
    g.s(n1.inputs['Vector'], sc.outputs[0])
    n2 = g.n('ShaderNodeTexNoise', Scale=0.01, Detail=3.0)
    g.s(n2.inputs['Vector'], geo.outputs['Position'])
    slick = g.smooth(n2.outputs['Fac'], 0.45, 0.62)
    bump = g.n('ShaderNodeBump', Distance=0.02)
    g.s(bump.inputs['Strength'], g.m('ADD', 0.04, g.m('MULTIPLY', slick, 0.2)))
    g.s(bump.inputs['Height'], n1.outputs['Fac'])
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Roughness'].default_value = 0.01
    bsdf.inputs['IOR'].default_value = 1.333
    bsdf.inputs['Transmission Weight'].default_value = 1.0
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    finish(m, bsdf.outputs[0], aerial)
    out = [n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    vol = g.n('ShaderNodeVolumeAbsorption', Density=0.22)
    vol.inputs['Color'].default_value = (0.45, 0.80, 0.78, 1)
    g.s(out.inputs['Volume'], vol.outputs[0])
    return m


def foliage_material(aerial, name='Needles', col=(0.018, 0.032, 0.016)):
    m, g = new_mat(name)
    ob = g.n('ShaderNodeObjectInfo')
    tc = g.n('ShaderNodeTexCoord')
    nz = g.n('ShaderNodeTexNoise', Scale=3.0, Detail=4.0)
    g.s(nz.inputs['Vector'], tc.outputs['Object'])
    base = g.ramp(ob.outputs['Random'], [(0.0, (col[0] * 0.75, col[1] * 0.8, col[2] * 0.8)), (1.0, (col[0] * 1.35, col[1] * 1.25, col[2] * 1.1))])
    shade = g.rgb(g.m('MULTIPLY', nz.outputs['Fac'], 0.5), base, (col[0] * 0.5, col[1] * 0.5, col[2] * 0.5))
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.s(bsdf.inputs['Base Color'], shade)
    bsdf.inputs['Roughness'].default_value = 0.65
    bsdf.inputs['Subsurface Weight'].default_value = 0.0
    bsdf.inputs['Specular IOR Level'].default_value = 0.3
    finish(m, bsdf.outputs[0], aerial)
    return m


def bark_material(aerial):
    m, g = new_mat('Bark')
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.05, 0.035, 0.025, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    finish(m, bsdf.outputs[0], aerial)
    return m


def rock_material(aerial):
    m, g = new_mat('Boulder')
    tc = g.n('ShaderNodeTexCoord')
    n = g.n('ShaderNodeTexNoise', Scale=2.2, Detail=14.0, Roughness=0.7)
    g.s(n.inputs['Vector'], tc.outputs['Object'])
    v = g.n('ShaderNodeTexVoronoi', Scale=6.0)
    g.s(v.inputs['Vector'], tc.outputs['Object'])
    col = g.ramp(n.outputs['Fac'], [(0.35, (0.10, 0.098, 0.092)), (0.55, (0.20, 0.19, 0.18)), (0.75, (0.30, 0.29, 0.275))])
    lichen = g.smooth(v.outputs['Distance'], 0.05, 0.0)
    col = g.rgb(g.m('MULTIPLY', lichen, 0.6), col, (0.16, 0.17, 0.09))
    # wet band at the waterline
    geo = g.n('ShaderNodeNewGeometry')
    sep = g.n('ShaderNodeSeparateXYZ'); g.s(sep.inputs[0], geo.outputs['Position'])
    wet = g.smooth(sep.outputs['Z'], LAKE_Z + 0.25, LAKE_Z + 0.02)
    col = g.rgb(g.m('MULTIPLY', wet, 0.6), col, (0.03, 0.03, 0.028))
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.s(bsdf.inputs['Base Color'], col)
    g.s(bsdf.inputs['Roughness'], g.m('SUBTRACT', 0.85, g.m('MULTIPLY', wet, 0.6)))
    grain = g.n('ShaderNodeTexNoise', Scale=60.0, Detail=4.0)
    g.s(grain.inputs['Vector'], tc.outputs['Object'])
    crack = g.n('ShaderNodeTexVoronoi', Scale=3.0, _feature='DISTANCE_TO_EDGE')
    g.s(crack.inputs['Vector'], tc.outputs['Object'])
    cr = g.smooth(crack.outputs['Distance'], 0.0, 0.025)
    col = g.rgb(g.m('MULTIPLY', g.m('SUBTRACT', 1, cr), 0.7), col, (0.02, 0.02, 0.02))
    col = g.rgb(g.m('MULTIPLY', g.smooth(grain.outputs['Fac'], 0.62, 0.7), 0.5), col, (0.55, 0.53, 0.5))
    hgt = g.m('ADD', g.m('ADD', n.outputs['Fac'], g.m('MULTIPLY', grain.outputs['Fac'], 0.15)), g.m('MULTIPLY', cr, 0.3))
    bump = g.n('ShaderNodeBump', Strength=0.6, Distance=0.02)
    g.s(bump.inputs['Height'], hgt)
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    finish(m, bsdf.outputs[0], aerial)
    return m


# ---------------------------------------------------------------------------------------------
# trees
# ---------------------------------------------------------------------------------------------

def conifer(name, height, crown_base, radius, seed, needles, bark, spacing=0.42, droop=0.3, lollipop=False, branches=6):
    """A conifer modelled to the twig: tapered trunk; whorls of drooping branches; along each branch,
    alternating twigs carrying crossed needle sprays (bottle-brush), so the crown is ragged and
    see-through at the scale of centimetres, as real spruce, fir and lodgepole crowns are.
    Metres, base at the origin. ~15-30 k triangles."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    layer_mat = []

    def quad(a, b, c, d, mat):
        vs = [bm.verts.new(p) for p in (a, b, c, d)]
        f = bm.faces.new(vs)
        f.material_index = mat

    # trunk: 8-sided, tapering, slight lean and wobble
    seg, rings = 8, 10
    prev = None
    lean = Vector((rnd.uniform(-0.01, 0.01), rnd.uniform(-0.01, 0.01), 0))
    r_base = 0.012 * height + 0.05
    for k in range(rings + 1):
        t = k / rings
        zc = height * t
        rr = r_base * (1 - t) ** 1.1 + 0.01
        off = lean * zc + Vector((rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), 0))
        ring = [bm.verts.new((off.x + rr * math.cos(2 * math.pi * j / seg), off.y + rr * math.sin(2 * math.pi * j / seg), zc)) for j in range(seg)]
        if prev:
            for j in range(seg):
                f = bm.faces.new((prev[j], prev[(j + 1) % seg], ring[(j + 1) % seg], ring[j]))
                f.material_index = 1
        prev = ring

    def spray(p, d, length, width):
        """Two crossed needle strips along d (unit) from p."""
        d = d.normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        upv = side.cross(d).normalized()
        tip = p + d * length
        mid = p + d * (length * 0.45)
        for w in (side, (side * 0.5 + upv * 0.87).normalized()):
            a = p + w * (width * 0.25)
            b = p - w * (width * 0.25)
            c = mid - w * width
            e = mid + w * width
            vs = [bm.verts.new(x) for x in (a, e, tip, c, b)]
            f = bm.faces.new(vs)
            f.material_index = 0

    zc = crown_base
    whorl = 0
    while zc < height - 0.3:
        t = (zc - crown_base) / max(height - crown_base, 1e-3)
        env = (1 - t) ** 0.95
        if lollipop:
            env = min(1.0, 0.25 + 2.5 * t) * (1 - t) ** 0.7
        L = max(0.15, radius * env * rnd.uniform(0.8, 1.1))
        nb = branches if L > 0.5 else max(3, branches - 2)
        off = rnd.uniform(0, 2 * math.pi)
        for b in range(nb):
            az = off + 2 * math.pi * b / nb + rnd.uniform(-0.3, 0.3)
            dirh = Vector((math.cos(az), math.sin(az), 0))
            # branch: rises a little near the trunk, droops at the tip
            pts = []
            n_s = 6
            for i in range(n_s + 1):
                u = i / n_s
                pts.append(Vector((0, 0, zc)) + dirh * (L * u) + Vector((0, 0, 0.12 * L * u - droop * L * u * u)))
            for i in range(n_s):
                a, c = pts[i], pts[i + 1]
                w0 = 0.025 * (1 - i / n_s) + 0.006
                side = dirh.cross(Vector((0, 0, 1))) * w0
                quad(a - side, a + side, c + side * 0.8, c - side * 0.8, 1)
            # twigs with sprays
            n_tw = max(2, int(L / 0.16))
            for i in range(n_tw):
                u = 0.12 + 0.88 * (i + rnd.random() * 0.5) / n_tw
                k = min(int(u * n_s), n_s - 1)
                p = pts[k].lerp(pts[k + 1], u * n_s - k)
                bd = (pts[k + 1] - pts[k]).normalized()
                for sgn in (-1, 1):
                    ang = sgn * rnd.uniform(0.6, 1.1)
                    td = (bd * math.cos(ang) + bd.cross(Vector((0, 0, 1))).normalized() * math.sin(ang))
                    td.z -= rnd.uniform(0.1, 0.45)
                    ln = rnd.uniform(0.18, 0.38) * (1.15 - 0.5 * u) * (1.6 if lollipop and u > 0.6 else 1.0)
                    spray(p, td, ln, rnd.uniform(0.035, 0.06))
            # leading spray at the tip
            spray(pts[-1], (pts[-1] - pts[-2]), 0.3, 0.05)
        zc += spacing * rnd.uniform(0.75, 1.25)
        whorl += 1
    # leader
    spray(Vector((0, 0, height - 0.35)), Vector((0, 0, 1)), 0.7, 0.04)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(needles)
    me.materials.append(bark)
    ob = bpy.data.objects.new(name, me)
    return ob


def forest(terrain, dens, X, Y, needles, bark, seed=7):
    """Scatter the conifer variants over the terrain with Geometry Nodes, density per vertex."""
    me = terrain.data
    attr = me.attributes.new('tree_density', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', dens.ravel())
    coll = bpy.data.collections.new('Trees')
    variants = [
        conifer('Fir', 17, 0.6, 1.9, 1, needles, bark, spacing=0.38, droop=0.22),
        conifer('Spruce', 23, 0.8, 2.8, 2, needles, bark, spacing=0.45, droop=0.42, branches=7),
        conifer('Lodgepole', 22, 9.5, 1.9, 3, needles, bark, spacing=0.7, droop=0.15, lollipop=True, branches=5),
        conifer('Lodgepole2', 16, 6.5, 1.6, 4, needles, bark, spacing=0.65, droop=0.18, lollipop=True, branches=5),
        conifer('FirYoung', 8, 0.3, 1.2, 5, needles, bark, spacing=0.3, droop=0.15),
    ]
    print('TREE TRIS', [sum(len(p.vertices) - 2 for p in v.data.polygons) for v in variants])
    for v in variants:
        coll.objects.link(v)
    bpy.context.scene.collection.children.link(coll)
    coll.hide_render = True
    ng = bpy.data.node_groups.new('Forest', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gin = N.new('NodeGroupInput')
    gout = N.new('NodeGroupOutput')
    named = N.new('GeometryNodeInputNamedAttribute')
    named.data_type = 'FLOAT'
    named.inputs['Name'].default_value = 'tree_density'
    dist = N.new('GeometryNodeDistributePointsOnFaces')
    dist.distribute_method = 'RANDOM'
    dist.inputs['Density'].default_value = 1.0
    dist.inputs['Seed'].default_value = seed
    L.new(gin.outputs[0], dist.inputs['Mesh'])
    L.new(named.outputs['Attribute'], dist.inputs['Density'])
    ci = N.new('GeometryNodeCollectionInfo')
    ci.inputs['Collection'].default_value = coll
    ci.inputs['Separate Children'].default_value = True
    ci.inputs['Reset Children'].default_value = True
    inst = N.new('GeometryNodeInstanceOnPoints')
    inst.inputs['Pick Instance'].default_value = True
    L.new(dist.outputs['Points'], inst.inputs['Points'])
    L.new(ci.outputs[0], inst.inputs['Instance'])
    rid = N.new('FunctionNodeRandomValue')
    rid.data_type = 'INT'
    rid.inputs[4].default_value = 0
    rid.inputs[5].default_value = len(variants) - 1
    rid.inputs['Seed'].default_value = seed + 1
    L.new(rid.outputs[2], inst.inputs['Instance Index'])
    rs = N.new('FunctionNodeRandomValue')
    rs.data_type = 'FLOAT'
    rs.inputs[2].default_value = 0.55
    rs.inputs[3].default_value = 1.35
    rs.inputs['Seed'].default_value = seed + 2
    L.new(rs.outputs[1], inst.inputs['Scale'])
    rr = N.new('FunctionNodeRandomValue')
    rr.data_type = 'FLOAT_VECTOR'
    rr.inputs[0].default_value = (-0.03, -0.03, 0)
    rr.inputs[1].default_value = (0.03, 0.03, 6.283)
    rr.inputs['Seed'].default_value = seed + 3
    L.new(rr.outputs[0], inst.inputs['Rotation'])
    join = N.new('GeometryNodeJoinGeometry')
    L.new(gin.outputs[0], join.inputs[0])
    L.new(inst.outputs[0], join.inputs[0])
    L.new(join.outputs[0], gout.inputs[0])
    mod = terrain.modifiers.new('Forest', 'NODES')
    mod.node_group = ng
    return variants


def boulder_mesh(name, rnd, size):
    """Glacial granite boulder: convex hull of jittered points (angular), Catmull-Clark rounded
    edges, a flattened base."""
    bm = bmesh.new()
    pts = []
    for _ in range(26):
        v = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        pts.append(bm.verts.new((v.x * rnd.uniform(0.75, 1.0), v.y * rnd.uniform(0.75, 1.0), v.z * rnd.uniform(0.7, 1.0))))
    bmesh.ops.convex_hull(bm, input=pts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sub = ob.modifiers.new('round', 'SUBSURF')
    sub.levels = sub.render_levels = 3
    tx = bpy.data.textures.new(name + 'n', 'CLOUDS')
    tx.noise_scale = 0.35
    tx.noise_depth = 4
    dm = ob.modifiers.new('grain', 'DISPLACE')
    dm.texture = tx
    dm.strength = 0.05
    sub2 = ob.modifiers.new('fine', 'SUBSURF')
    sub2.levels = sub2.render_levels = 1
    ob.scale = (size * rnd.uniform(1.0, 1.5), size * rnd.uniform(0.8, 1.2), size * rnd.uniform(0.55, 0.8))
    return ob


def boulders(height, cam, rock):
    """Granite erratics along the shore and in the shallows in front of the camera."""
    rnd = random.Random(11)
    spots = []
    for k in range(24):
        ang = math.radians(rnd.uniform(185, 300))
        d = rnd.uniform(5.0, 34.0) * (1 if k < 16 else 1.5)
        x, y = cam[0] + d * math.sin(ang), cam[1] + d * math.cos(ang)
        size = rnd.uniform(0.25, 1.1) * (1.5 if d > 15 else 1.0)
        spots.append((x, y, size))
    spots += [(cam[0] - 5.5, cam[1] - 3.0, 0.95), (cam[0] - 9.0, cam[1] + 2.5, 0.7), (cam[0] - 4.0, cam[1] + 1.4, 0.45)]
    for i, (x, y, sz) in enumerate(spots):
        zg = height(x, y)
        ob = boulder_mesh(f'Boulder{i}', rnd, sz)
        ob.location = (x, y, zg + sz * 0.15)
        ob.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 6.3))
        ob.data.materials.append(rock)
        ob.data.shade_smooth()


# ---------------------------------------------------------------------------------------------
# sky
# ---------------------------------------------------------------------------------------------

def sky_assets(spec):
    key = hashlib.sha1(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:12]
    prefix = os.path.join(SCRATCH, 'sky_' + key)
    if not os.path.exists(prefix + '_sky.npy'):
        os.makedirs(SCRATCH, exist_ok=True)
        with open(prefix + '.json', 'w') as f:
            json.dump(spec, f)
        subprocess.run(['python3', os.path.join(lib.HERE, 'sky_map.py'), prefix + '.json', prefix], check=True)
    info = json.load(open(prefix + '_info.json'))
    return prefix, info


def float_image(name, arr):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    # colour space first: changing it later regenerates (blanks) a generated image's buffer
    img.colorspace_settings.name = 'Linear Rec.709'
    rgba = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
    img.pixels.foreach_set(rgba.ravel())
    img.update()
    return img


def sky_image(prefix):
    arr = np.load(prefix + '_sky.npy')
    return float_image('SkyMap', arr), arr


def world(sc, img):
    w = sc.world
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = img
    env.interpolation = 'Linear'
    nt.links.new(tc.outputs['Generated'], env.inputs['Vector'])
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    w.cycles.sampling_method = 'MANUAL'
    w.cycles.sample_map_resolution = 2048


def star_points(prefix, pix_rad, dist=4.0e5):
    """Stars as tiny emissive icosahedra about 0.6 px across, one mesh, colour from B-V."""
    a = np.load(prefix + '_stars.npy')
    d, E, T = a[:, :3], a[:, 3], a[:, 4]
    keep = (d[:, 2] > 0.0) & (E > 0)
    d, E, T = d[keep], E[keep], T[keep]
    rad = dist * pix_rad * 0.6
    L = E * dist ** 2 / (math.pi * rad ** 2)
    # icosahedron
    t = (1 + 5 ** 0.5) / 2
    iv = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                   [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    iv /= np.linalg.norm(iv, axis=1)[:, None]
    fi = np.array([[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                   [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])
    n = len(d)
    co = (d[:, None, :] * dist + iv[None, :, :] * rad).reshape(-1, 3)
    faces = (fi[None, :, :] + 12 * np.arange(n)[:, None, None]).reshape(-1, 3)
    me = bpy.data.meshes.new('Stars')
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.astype(np.float32).ravel())
    me.loops.add(faces.size)
    me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', np.arange(0, faces.size, 3, dtype=np.int32))
    me.update(calc_edges=True)
    aL = me.attributes.new('L', 'FLOAT', 'FACE')
    aL.data.foreach_set('value', np.repeat(L, 20).astype(np.float32))
    aT = me.attributes.new('T', 'FLOAT', 'FACE')
    aT.data.foreach_set('value', np.repeat(T, 20).astype(np.float32))
    m = bpy.data.materials.new('Star')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'T'
    al = nt.nodes.new('ShaderNodeAttribute'); al.attribute_name = 'L'
    bb = nt.nodes.new('ShaderNodeBlackbody')
    nt.links.new(at.outputs['Fac'], bb.inputs['Temperature'])
    nt.links.new(bb.outputs['Color'], em.inputs['Color'])
    nt.links.new(al.outputs['Fac'], em.inputs['Strength'])
    # the atmosphere's own light lies in front of the star: let the ray continue to the sky
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs[0], ad.inputs[0])
    nt.links.new(tr.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], o.inputs['Surface'])
    # point sources for the camera and reflections only: 4e5 emissive triangles in the light tree
    # would cost ~9 GB and light nothing visible
    m.cycles.emission_sampling = 'NONE'
    me.materials.append(m)
    ob = bpy.data.objects.new('Stars', me)
    ob.visible_shadow = False
    ob.visible_diffuse = False
    bpy.context.scene.collection.objects.link(ob)
    return n


def lake():
    """Jenny Lake's water as a closed body (surface at LAKE_Z) so camera rays refract into it and are
    absorbed with depth; the cobble shelf shows through near the shore. The surface casts no shadow
    (Cycles cannot light through refraction without caustics), so the bed is lit by the sky directly."""
    bm = bmesh.new()
    x0, x1, y0, y1, zb = -2300.0, 400.0, -700.0, 3100.0, LAKE_Z - 80.0
    v = [bm.verts.new(p) for p in ((x0, y0, zb), (x1, y0, zb), (x1, y1, zb), (x0, y1, zb),
                                    (x0, y0, LAKE_Z), (x1, y0, LAKE_Z), (x1, y1, LAKE_Z), (x0, y1, LAKE_Z))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])
    # subdivide the surface so the ripple bump has geometry-scale normals near the camera
    me = bpy.data.meshes.new('Lake')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Lake', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.visible_shadow = False
    return ob


def beach_material(aerial):
    """Each cobble its own rock (stone id from render/teton_prep.py): grey Teton gneiss and granite,
    pink feldspar granite, white quartzite, dark diabase; coarse sand between. Wet and darker at the
    waterline, with a film of algae just below it."""
    m, g = new_mat('Beach')
    geo = g.n('ShaderNodeNewGeometry')
    sep = g.n('ShaderNodeSeparateXYZ'); g.s(sep.inputs[0], geo.outputs['Position'])
    at = g.n('ShaderNodeAttribute', _attribute_name='stone')
    sid = at.outputs['Fac']
    pal = g.ramp(sid, [(0.0, (0.21, 0.205, 0.195)), (0.22, (0.30, 0.29, 0.275)), (0.38, (0.36, 0.26, 0.22)),
                       (0.52, (0.15, 0.145, 0.14)), (0.66, (0.52, 0.51, 0.49)), (0.80, (0.06, 0.06, 0.058)),
                       (0.92, (0.27, 0.21, 0.15))])
    pal.node.color_ramp.interpolation = 'CONSTANT'
    nz = g.n('ShaderNodeTexNoise', Scale=24.0, Detail=10.0, Roughness=0.65)
    g.s(nz.inputs['Vector'], geo.outputs['Position'])
    speck = g.n('ShaderNodeTexNoise', Scale=180.0, Detail=2.0)
    g.s(speck.inputs['Vector'], geo.outputs['Position'])
    col = g.rgb(g.m('MULTIPLY', g.m('SUBTRACT', nz.outputs['Fac'], 0.3), 0.6), pal, (0.10, 0.10, 0.095))
    col = g.rgb(g.m('MULTIPLY', g.smooth(speck.outputs['Fac'], 0.6, 0.7), 0.5), col, (0.55, 0.55, 0.53))
    sand = g.ramp(speck.outputs['Fac'], [(0.35, (0.16, 0.145, 0.12)), (0.65, (0.25, 0.23, 0.2))])
    is_sand = g.m('LESS_THAN', sid, 0.0)
    col = g.rgb(is_sand, col, sand)
    wet = g.smooth(sep.outputs['Z'], LAKE_Z + 0.3, LAKE_Z + 0.02)
    algae = g.smooth(sep.outputs['Z'], LAKE_Z - 0.1, LAKE_Z - 0.6)
    darker = g.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    g.s(darker.inputs[6], col)
    darker.inputs[7].default_value = (0.4, 0.4, 0.4, 1)
    col = g.rgb(wet, col, darker.outputs[2])
    col = g.rgb(g.m('MULTIPLY', algae, 0.55), col, (0.05, 0.06, 0.03))
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.s(bsdf.inputs['Base Color'], col)
    g.s(bsdf.inputs['Roughness'], g.m('SUBTRACT', g.m('ADD', 0.62, g.m('MULTIPLY', is_sand, 0.25)), g.m('MULTIPLY', wet, 0.5)))
    bump = g.n('ShaderNodeBump', Strength=0.3, Distance=0.003)
    g.s(bump.inputs['Height'], nz.outputs['Fac'])
    g.s(bsdf.inputs['Normal'], bump.outputs['Normal'])
    finish(m, bsdf.outputs[0], aerial)
    return m


# ---------------------------------------------------------------------------------------------

def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--date', default='2026-08-22')
    ap.add_argument('--sun-alt', type=float, default=-9.0)
    ap.add_argument('--glow', choices=['none', 'shell', 'farside'], default='none')
    ap.add_argument('--f', type=float, default=0.00411)
    ap.add_argument('--rho', type=float, default=0.004)
    ap.add_argument('--r-out', type=float, default=0.92, help='outer radius of the shell (AU): the disc edge fades between asin(r) and asin(r_out)')
    ap.add_argument('--r', type=float, default=0.8604)
    ap.add_argument('--az', type=float, default=245.0)
    ap.add_argument('--lens', type=float, default=14.0)
    ap.add_argument('--shift', type=float, default=0.13)
    ap.add_argument('--res', default='2400x1350')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--sky-width', type=int, default=4096)
    ap.add_argument('--exposure', type=float, default=None)
    ap.add_argument('--meter', choices=['dusk', 'night', 'glow'], default='dusk')
    ap.add_argument('--ev', type=float, default=0.0)
    ap.add_argument('--no-trees', action='store_true')
    ap.add_argument('--crop', default=None, help='x0,y0,x1,y1 render border (fractions)')
    ap.add_argument('--exr', action='store_true', help='write scene-linear EXR (develop with render/develop.py)')
    a = ap.parse_args(argv)
    y, mo, d = (int(v) for v in a.date.split('-'))
    ev = ephem.evening(y, mo, d, SITE['lat'], SITE['lon'], a.sun_alt)
    spec = {'lat': SITE['lat'], 'lst_deg': round(ev['lst_deg'], 3), 'sun_alt': round(ev['sun_alt'], 3),
            'sun_az': round(ev['sun_az'], 3), 'width': a.sky_width, 'h_cam': 2070.0, 'jd': round(ev['jd'], 6)}
    if a.glow != 'none':
        spec['glow'] = {'kind': a.glow, 'f': a.f, 'rho': a.rho, 'r_au': a.r}
        if a.glow == 'shell':
            spec['glow'].update(r_in=a.r, r_out=a.r_out)
    prefix, info = sky_assets(spec)
    w, h = (int(v) for v in a.res.split('x'))
    sc = lib.reset(samples=a.samples, res=(w, h))
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 4
    sc.cycles.volume_bounces = 0
    sc.cycles.transparent_max_bounces = 2
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = False
    # daylight white balance, as a landscape photographer shoots the blue hour: sunlight is neutral
    sc.view_settings.use_white_balance = True
    sc.view_settings.white_balance_temperature = 5772
    sc.view_settings.white_balance_tint = 0.0
    img, arr = sky_image(prefix)
    world(sc, img)
    aerial = aerial_group(float_image('Inscatter', np.load(prefix + '_inscatter.npy')), info['air_extinction_per_m'])
    z, meta, beach, bmeta = load_dem()
    terrain, (X, Y, Z) = terrain_mesh(z, meta, bmeta)
    terrain.data.materials.append(terrain_material(aerial))
    bch = beach_mesh(beach, bmeta)
    bch.data.materials.append(beach_material(aerial))
    hb = bmeta['h']
    r = int(round((bmeta['y1'] - CAM_XY[1]) / hb))
    c = int(round((CAM_XY[0] - bmeta['x0']) / hb))
    cam_z = float(beach[r, c]) + 1.65
    cam_xy = CAM_XY
    if not a.no_trees:
        dens, _ = forest_density(X, Y, Z, cam_xy)
        forest(terrain, dens, X, Y, foliage_material(aerial), bark_material(aerial))
    lk = lake()
    lk.data.materials.append(water_material(aerial))

    def height(x, y):
        rr = (bmeta['y1'] - y) / hb
        cc = (x - bmeta['x0']) / hb
        if 0 <= rr < bmeta['ny'] - 1 and 0 <= cc < bmeta['nx'] - 1:
            return float(beach[int(rr), int(cc)])
        return dem_height(z, meta, x, y)
    boulders(height, cam_xy, rock_material(aerial))
    # camera: level, rise via lens shift (verticals stay vertical, like a landscape photographer)
    eye = Vector((cam_xy[0], cam_xy[1], cam_z))
    az = math.radians(a.az)
    cam = lib.camera(eye, eye + Vector((math.sin(az), math.cos(az), 0)), lens=a.lens)
    cam.data.shift_y = a.shift
    cam.data.clip_start = 0.1
    cam.data.clip_end = 2e6
    pix_rad = 2 * math.atan(18 / a.lens) / w
    n_st = star_points(prefix, pix_rad)
    if a.crop:
        x0, y0, x1, y1 = (float(v) for v in a.crop.split(','))
        sc.render.use_border = True
        sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = x0, y0, x1, y1
    # metering, in the repo's radiometric units (AgX maps scene-linear 0.18 to mid-grey)
    H_, W_ = arr.shape[:2]

    def sky_L(alt, az_deg):
        dvec = np.array([math.cos(math.radians(alt)) * math.sin(math.radians(az_deg)),
                         math.cos(math.radians(alt)) * math.cos(math.radians(az_deg)), math.sin(math.radians(alt))])
        u = (0.5 - math.atan2(dvec[1], dvec[0]) / (2 * math.pi)) % 1
        v = math.asin(dvec[2]) / math.pi + 0.5
        return float(arr[min(int(v * H_), H_ - 1), min(int(u * W_), W_ - 1)] @ LUMA)
    if a.exposure is not None:
        sc.view_settings.exposure = a.exposure
    else:
        if a.meter == 'dusk':
            ref = sky_L(25, ev['sun_az'])          # the blue sky above the twilight arch
            target = 0.10
        elif a.meter == 'glow':
            ref = sky_L(25, ev['sun_az'])
            target = 0.30
        else:
            ref = sky_L(35, (ev['sun_az'] + 180) % 360)   # dark sky away from the Sun
            target = 0.045
        sc.view_settings.exposure = math.log2(target / ref) + a.ev
    print(json.dumps({'local_time': ev['local_hour'], 'sun_alt': ev['sun_alt'], 'sun_az': ev['sun_az'],
                      'exposure': sc.view_settings.exposure, 'stars': n_st, 'cam_z': cam_z, **info}))
    if a.exr:
        sc.render.image_settings.file_format = 'OPEN_EXR'
        sc.render.image_settings.color_depth = '16'
        sc.render.image_settings.exr_codec = 'ZIP'
    lib.save(sc, a.out)
    print('WROTE', a.out)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
