"""Compute sail, built from the design spec (docs/data/design_spec.json, block render_spec).

A 279 m square of 80 um PV laminate flown as a diamond, its edges bowed inward along catenaries.
Four diagonal truss booms behind it tension the film at its corners. Every chiplet, terminal and
boom sits behind the film; only the four mirror vanes and the boom-tip tensioners reach past the
corners. Frame: +Z toward the Sun (light travels -Z), film in XY at z = 0, corners on the axes.

The front face is AR-coated cover glass over textured c-Si. It is modelled physically: a glass
specular at n = 1.47 with a 110 nm porous-silica film (n = 1.25), whose interference leaves the
magenta-blue residual of a real AR coat. Beneath it sits the measured-scatter diffuse base.
Fold panels curl up to ~3.7 deg at their hinge strips (laminate CTE mismatch, research spec). That
curl breaks the Sun's reflection into stripes.
"""
import sys
import os
import math
import json
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
import lib  # noqa: E402

SPEC_PATH = os.path.join(lib.REPO, 'docs', 'data', 'design_spec.json')


def load_spec(path=SPEC_PATH):
    with open(path) as f:
        d = json.load(f)
    rs = d['render_spec']
    return {
        'parts': {p['name']: p for p in rs['parts']},
        'materials': rs['materials'],
        'sun': rs['sun'],
        'sail': d['sail'],
        'scene': d['scene_facts'],
        'raw': d,
    }


# ---------------------------------------------------------------------------------------------
# Node helpers
# ---------------------------------------------------------------------------------------------

class NT:
    """Tiny wrapper so node graphs read like formulas."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.N, self.L = self.nt.nodes, self.nt.links

    def node(self, kind, **inputs):
        n = self.N.new(kind)
        for k, v in inputs.items():
            if k.startswith('_'):
                setattr(n, k[1:], v)
            else:
                self.set(n.inputs[k], v)
        return n

    def set(self, sock, v):
        if hasattr(v, 'is_output') or hasattr(v, 'links'):
            self.L.new(v, sock)
        else:
            sock.default_value = v

    def math(self, op, a, b=None, clamp=False):
        n = self.N.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        return n.outputs[0]

    def sep(self, vec):
        n = self.N.new('ShaderNodeSeparateXYZ')
        self.L.new(vec, n.inputs[0])
        return n.outputs['X'], n.outputs['Y'], n.outputs['Z']

    def mix_rgb(self, fac, a, b):
        n = self.N.new('ShaderNodeMix')
        n.data_type = 'RGBA'
        self.set(n.inputs['Factor'], fac)
        self.set(n.inputs[6], a)
        self.set(n.inputs[7], b)
        return n.outputs[2]

    def mix_f(self, fac, a, b):
        n = self.N.new('ShaderNodeMix')
        n.data_type = 'FLOAT'
        self.set(n.inputs['Factor'], fac)
        self.set(n.inputs[2], a)
        self.set(n.inputs[3], b)
        return n.outputs[0]

    def stripe(self, coord, period, offset, width):
        """1 inside lines of `width` centred at offset + k*period along `coord`, else 0 (hard edge)."""
        t = self.math('DIVIDE', self.math('SUBTRACT', coord, offset), period)
        fr = self.math('SUBTRACT', self.math('FRACT', self.math('ADD', t, 0.5)), 0.5)
        d = self.math('ABSOLUTE', self.math('MULTIPLY', fr, period))
        return self.math('LESS_THAN', d, width / 2), d, t


def _new_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    for n in list(m.node_tree.nodes):
        m.node_tree.nodes.remove(n)
    return m


def _principled(g, spec):
    p = spec.get('principled', spec)
    b = g.node('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*p['base_color_linear'], 1)
    b.inputs['Roughness'].default_value = p.get('roughness', 0.5)
    b.inputs['Metallic'].default_value = p.get('metallic', 0.0)
    if 'specular_ior_level' in p:
        b.inputs['Specular IOR Level'].default_value = p['specular_ior_level']
    return b


def simple_material(name, spec):
    m = _new_mat(name)
    g = NT(m)
    out = g.node('ShaderNodeOutputMaterial')
    b = _principled(g, spec)
    g.L.new(b.outputs[0], out.inputs['Surface'])
    return m


# ---------------------------------------------------------------------------------------------
# Film material (front + back in one, chosen by Backfacing)
# ---------------------------------------------------------------------------------------------

def film_material(spec, seed=1, pitch=None, lanes=False, chips=True, hinges=True, name='SailFilm'):
    M = spec['materials']
    parts = spec['parts']
    seg = spec['sail']['segmentation']
    pitch_tile = pitch or parts['tile_grid_front']['dims_m']['pitch']  # 25.4 mm (2026 spec) or from the model
    scribe_w = parts['tile_grid_front']['dims_m']['scribe_width']
    hinge_p = seg['fold_panel_width_m']                                # 1.6256 m
    hinge_w = seg['hinge_strips']['width_m']                           # 25.4 mm
    hinge_y0 = 63.5 * pitch_tile                                       # y = (64k + 63.5) p
    flat = spec['sail']['structure']['flatness']
    ell = flat['ell_m']
    curl = math.radians(flat['edge_rotation_deg_at_3K_residual'])
    die = parts['chiplet']['dims_m'][0]
    die_h = parts['chiplet']['dims_m'][2]

    m = _new_mat(name)
    g = NT(m)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    x, y, _ = g.sep(tc.outputs['Object'])

    # --- hinge strips (both faces) and the curl of each fold panel's edges next to them.
    # The curl zone (~0.18 m) is far below a pixel at a distance, so the normal is computed
    # analytically per sample (a Bump node would finite-difference across the pixel footprint
    # and smear the slope away). Height h(d) = -A exp(-(|d| - w/2)/ell) beside each strip, so the
    # slope is tan(curl) * u * exp(...) * sign(d), with u = 0.3-1 per panel (residual moment 0-3 K).
    hinge, dist, t = g.stripe(y, hinge_p, hinge_y0, hinge_w)
    signed = g.math('SUBTRACT', g.math('FRACT', g.math('ADD', t, 0.5)), 0.5)
    sgn = g.math('SIGN', signed)
    panel = g.math('FLOOR', g.math('ADD', t, 0.5))
    wn = g.node('ShaderNodeTexWhiteNoise', _noise_dimensions='1D')
    g.L.new(g.math('ADD', panel, seed * 17.0), wn.inputs['W'])
    u = g.math('ADD', g.math('MULTIPLY', wn.outputs['Value'], 0.7), 0.3)
    dd = g.math('MAXIMUM', g.math('SUBTRACT', dist, hinge_w / 2), 0.0)
    inside = g.math('GREATER_THAN', dist, hinge_w / 2)
    slope = g.math('MULTIPLY', g.math('MULTIPLY', g.math('EXPONENT', g.math('DIVIDE', dd, -ell)), u),
                   g.math('MULTIPLY', sgn, math.tan(curl)))
    slope = g.math('MULTIPLY', slope, inside)
    if not hinges:                       # pod wing film: plain panels, no fold strips
        hinge = g.math('MULTIPLY', hinge, 0.0)
        slope = g.math('MULTIPLY', slope, 0.0)
    nvec = g.node('ShaderNodeCombineXYZ')
    g.set(nvec.inputs['X'], 0.0)
    g.L.new(g.math('MULTIPLY', slope, -1.0), nvec.inputs['Y'])
    g.set(nvec.inputs['Z'], 1.0)
    nrm = g.node('ShaderNodeVectorMath', _operation='NORMALIZE')
    g.L.new(nvec.outputs[0], nrm.inputs[0])
    n_world = g.node('ShaderNodeVectorTransform', _vector_type='NORMAL', _convert_from='OBJECT', _convert_to='WORLD')
    g.L.new(nrm.outputs[0], n_world.inputs[0])
    # very gentle large-scale undulation (thermal/tension residuals, slope ~0.1 deg): fine as a bump
    nz = g.node('ShaderNodeTexNoise', Scale=1 / 40.0, Detail=3.0, Roughness=0.5)
    g.L.new(tc.outputs['Object'], nz.inputs['Vector'])
    height = g.math('MULTIPLY', g.math('SUBTRACT', nz.outputs['Fac'], 0.5), 0.08)

    # --- chiplets on the back: 2.45 mm squares, 50 um proud, at tile centres
    cx = g.math('ABSOLUTE', g.math('MULTIPLY', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', x, pitch_tile)), 0.5), pitch_tile))
    cy = g.math('ABSOLUTE', g.math('MULTIPLY', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', y, pitch_tile)), 0.5), pitch_tile))
    chip = g.math('MULTIPLY', g.math('LESS_THAN', cx, die / 2), g.math('LESS_THAN', cy, die / 2))
    chip = g.math('MULTIPLY', chip, g.math('SUBTRACT', 1.0, hinge))
    if not chips:                        # pod wing film: PV only, no chiplets
        chip = g.math('MULTIPLY', chip, 0.0)

    # --- tile scribes on the front: lines every 25.4 mm in x and y, plus the half-cell scribe along x
    sx, _, _ = g.stripe(x, pitch_tile, 0.0, scribe_w)
    sy, _, _ = g.stripe(y, pitch_tile, 0.0, scribe_w)
    sh, _, _ = g.stripe(y, pitch_tile, pitch_tile / 2, scribe_w)
    scribe = g.math('MINIMUM', g.math('ADD', g.math('ADD', sx, sy), sh), 1.0)

    # --- front BSDF: AR-coated glass (thin film) over the dark textured silicon
    fs = M['sail_front_pv']['principled']
    front = g.node('ShaderNodeBsdfPrincipled')
    base = g.mix_rgb(scribe, (*fs['base_color_linear'], 1), (*parts['tile_grid_front']['material']['scribe']['base_color_linear'], 1))
    hs = M['hinge_strip']['principled']
    base = g.mix_rgb(hinge, base, (*hs['base_color_linear'], 1))
    g.L.new(base, front.inputs['Base Color'])
    g.set(front.inputs['Roughness'], g.mix_f(hinge, M['sail_front_pv']['principled']['coat_roughness'], hs['roughness']))
    front.inputs['IOR'].default_value = 1.47                           # SiO2-rich Mg-aluminosilicate cover
    front.inputs['Thin Film Thickness'].default_value = 110.0          # porous silica AR, nm
    front.inputs['Thin Film IOR'].default_value = 1.25
    bump_f = g.node('ShaderNodeBump', Strength=1.0, Distance=1.0)
    g.L.new(height, bump_f.inputs['Height'])
    g.L.new(n_world.outputs[0], bump_f.inputs['Normal'])
    g.L.new(bump_f.outputs['Normal'], front.inputs['Normal'])

    # --- back BSDF: microtextured silicate enamel, chiplets as raised dies
    be = M['sail_back_enamel']['principled']
    ch = M['chiplet_die']['principled']
    back = g.node('ShaderNodeBsdfPrincipled')
    bcol = g.mix_rgb(chip, (*be['base_color_linear'], 1), (*ch['base_color_linear'], 1))
    bcol = g.mix_rgb(hinge, bcol, (*hs['base_color_linear'], 1))
    if lanes:
        lx, _, _ = g.stripe(x, 2.0, 1.0, 0.008)
        ly, _, _ = g.stripe(y, 2.0, 1.0, 0.008)
        lane = g.math('MINIMUM', g.math('ADD', lx, ly), 1.0)
        bcol = g.mix_rgb(lane, bcol, (0.075, 0.07, 0.064, 1))
    g.L.new(bcol, back.inputs['Base Color'])
    g.set(back.inputs['Roughness'], g.mix_f(chip, be['roughness'], ch['roughness']))
    back.inputs['Specular IOR Level'].default_value = be.get('specular_ior_level', 0.5)
    bh = g.math('MULTIPLY', chip, die_h)
    bump_b = g.node('ShaderNodeBump', Strength=1.0, Distance=1.0)
    g.L.new(bh, bump_b.inputs['Height'])
    g.L.new(bump_b.outputs['Normal'], back.inputs['Normal'])

    geo = g.node('ShaderNodeNewGeometry')
    mix = g.node('ShaderNodeMixShader')
    g.L.new(geo.outputs['Backfacing'], mix.inputs['Fac'])
    g.L.new(front.outputs[0], mix.inputs[1])
    g.L.new(back.outputs[0], mix.inputs[2])
    g.L.new(mix.outputs[0], out.inputs['Surface'])
    return m


def vane_material(spec):
    """Aluminised membrane: mirror front with 0.3-1 m wrinkles, dark enamel back."""
    M = spec['materials']
    m = _new_mat('VaneMirror')
    g = NT(m)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    f = _principled(g, M['vane_reflector_front'])
    b = _principled(g, M['vane_back'])
    nz = g.node('ShaderNodeTexNoise', Scale=1 / 0.6, Detail=4.0, Roughness=0.55)
    g.L.new(tc.outputs['Object'], nz.inputs['Vector'])
    bump = g.node('ShaderNodeBump', Strength=1.0, Distance=0.004)
    g.L.new(nz.outputs['Fac'], bump.inputs['Height'])
    g.L.new(bump.outputs['Normal'], f.inputs['Normal'])
    geo = g.node('ShaderNodeNewGeometry')
    mix = g.node('ShaderNodeMixShader')
    g.L.new(geo.outputs['Backfacing'], mix.inputs['Fac'])
    g.L.new(f.outputs[0], mix.inputs[1])
    g.L.new(b.outputs[0], mix.inputs[2])
    g.L.new(mix.outputs[0], out.inputs['Surface'])
    return m


def materials(spec, pitch=None, lanes=False):
    M = spec['materials']
    return {
        'film': film_material(spec, pitch=pitch, lanes=lanes),
        'hem': simple_material('EdgeHem', M['edge_hem_and_doubler']),
        'boom': simple_material('BoomMgOxide', M['boom_mg_oxidised']),
        'vane': vane_material(spec),
        'hub': lib.blanket_material('HubBlanket'),
        'terminal': simple_material('TerminalBody', M['terminal_body']),
        'aperture': lib.principled('TerminalAperture', M['terminal_body']['aperture']['base_color_linear'], rough=0.05, coat=1.0),
    }


# ---------------------------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------------------------

def _obj(name, bm, mat, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def _rod(bm, a, b, r, verts=6):
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    if L < 1e-9:
        return
    q = d.to_track_quat('Z', 'Y')
    mtx = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=r, radius2=r, depth=L, matrix=mtx)


def _box(bm, center, size, rot=None):
    mtx = Matrix.Translation(center)
    if rot is not None:
        mtx = mtx @ rot.to_4x4()
    mtx = mtx @ Matrix.Diagonal((*size, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mtx)


def film_mesh(spec, n=240):
    """Coons-patch diamond: square side a rotated 45 deg, each edge bowed inward by
    sag (1 - s^2) (catenary approximated by a parabola, as in the spec)."""
    p = spec['parts']['sail_film']['dims_m']
    LD = p['corner_to_corner'] / 2
    a = LD * math.sqrt(2)
    sag = p['sag_at_mid_edge']
    bm = bmesh.new()
    verts = []
    rot = Matrix.Rotation(math.radians(45), 3, 'Z')
    for j in range(n + 1):
        tv = -1 + 2 * j / n
        row = []
        for i in range(n + 1):
            sv = -1 + 2 * i / n
            s = sv * (a / 2 - sag * (1 - tv * tv))
            t = tv * (a / 2 - sag * (1 - sv * sv))
            row.append(bm.verts.new(rot @ Vector((s, t, 0.0))))
        verts.append(row)
    for j in range(n):
        for i in range(n):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    bm.normal_update()
    edge = []
    for i in range(n + 1):
        edge.append(verts[0][i].co.copy())
    for j in range(1, n + 1):
        edge.append(verts[j][n].co.copy())
    for i in range(n - 1, -1, -1):
        edge.append(verts[n][i].co.copy())
    for j in range(n - 1, 0, -1):
        edge.append(verts[j][0].co.copy())
    return bm, edge, LD


def build(spec=None, mats=None, seed=4, vane_tilt_deg=6.0, terminals=True, booms=True, era='2026', pitch=None):
    """era '2026': 60 per-patch terminals on masts (design spec). Any later era: ~12 consolidated
    terminals (8 x 10 cm at the boom tips and hub, 4 x 30 cm on the hub), optical lanes in the film."""
    spec = spec or load_spec()
    mats = mats or materials(spec, pitch=pitch, lanes=(era != '2026'))
    P = spec['parts']
    rnd = random.Random(seed)
    root = bpy.data.objects.new('Sail', None)
    bpy.context.scene.collection.objects.link(root)
    objs = []

    bm, edge, LD = film_mesh(spec)
    film = _obj('SailFilm', bm, mats['film'])
    objs.append(film)

    # hem: 50 mm ribbon just inside the boundary
    hw = P['edge_hem']['dims_m']['width']
    bm = bmesh.new()
    ring = [Vector((v.x, v.y, 0.0)) for v in edge]
    inner = []
    for i, v in enumerate(ring):
        inner.append(v - v.normalized() * hw)
    vo = [bm.verts.new(v + Vector((0, 0, 0.0005))) for v in ring]
    vi = [bm.verts.new(v + Vector((0, 0, 0.0005))) for v in inner]
    for i in range(len(ring)):
        k = (i + 1) % len(ring)
        bm.faces.new((vo[i], vo[k], vi[k], vi[i]))
    objs.append(_obj('EdgeHem', bm, mats['hem']))

    # corner doublers (2.5 m legs) and tethers to the tensioners
    leg = P['corner_doubler']['dims_m']['leg']
    tip = LD + 2.0
    bm = bmesh.new()
    bmt = bmesh.new()
    for ang in (0, 90, 180, 270):
        R = Matrix.Rotation(math.radians(ang), 3, 'Z')
        c = R @ Vector((LD, 0, 0.0006))
        u = R @ Vector((-leg / math.sqrt(2), leg / math.sqrt(2), 0))
        w = R @ Vector((-leg / math.sqrt(2), -leg / math.sqrt(2), 0))
        bm.faces.new((bm.verts.new(c), bm.verts.new(c + u), bm.verts.new(c + w)))
        for side in (-1, 1):
            a0 = R @ Vector((LD - 0.4, side * 0.25, 0))
            a1 = R @ Vector((tip, side * 0.1, -0.2))
            _rod(bmt, a0, a1, P['corner_tether']['dims_m']['diameter'] / 2, 5)
    objs.append(_obj('CornerDoublers', bm, mats['hem']))
    objs.append(_obj('CornerTethers', bmt, mats['hem']))

    # booms: triangular trusses behind the film along +-X, +-Y
    if booms:
        B = P['boom']['dims_m']
        side, bay = B['triangle_side'], B['bay']
        r_long, r_bat, r_wire = B['longeron_od'] / 2, B['batten_od'] / 2, B['diagonal_wire'] / 2
        z0 = -0.30
        n_bays = P['boom']['n_bays']
        L = P['boom']['dims_m']['length']
        bm = bmesh.new()
        for ang in (0, 90, 180, 270):
            R = Matrix.Rotation(math.radians(ang), 3, 'Z')
            x0 = 1.7
            c = [Vector((0, -side / 2, z0)), Vector((0, side / 2, z0)), Vector((0, 0, z0 - 0.866 * side))]
            def pt(x, k):
                return R @ (Vector((x, 0, 0)) + c[k])
            for k in range(3):
                _rod(bm, pt(x0, k), pt(L, k), r_long, 8)
            xs = [x0 + (L - x0) * i / n_bays for i in range(n_bays + 1)]
            for i, xb in enumerate(xs):
                for k in range(3):
                    _rod(bm, pt(xb, k), pt(xb, (k + 1) % 3), r_bat, 6)
                if i < n_bays:
                    xn = xs[i + 1]
                    for k in range(3):
                        k2 = (k + 1) % 3
                        _rod(bm, pt(xb, k), pt(xn, k2), r_wire, 4)
                        _rod(bm, pt(xb, k2), pt(xn, k), r_wire, 4)
        objs.append(_obj('Booms', bm, mats['boom'], smooth=True))

    # hub: octagonal prism behind the film, star trackers on its back face
    H = P['hub']['dims_m']
    bm = bmesh.new()
    rh = H['across_flats'] / 2 / math.cos(math.pi / 8)
    mtx = Matrix.Translation((0, 0, -0.30 - H['depth'] / 2)) @ Matrix.Rotation(math.pi / 8, 4, 'Z')
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=rh, radius2=rh, depth=H['depth'], matrix=mtx)
    objs.append(_obj('Hub', bm, mats['hub']))
    bm = bmesh.new()
    zb = -0.30 - H['depth']
    for k in range(3):
        az = math.radians(120 * k + 30)
        d = Vector((math.sin(math.radians(20)) * math.cos(az), math.sin(math.radians(20)) * math.sin(az), -math.cos(math.radians(20))))
        base = Vector((0.9 * math.cos(az), 0.9 * math.sin(az), zb))
        _rod(bm, base, base + d * 0.25, 0.05, 16)
        _rod(bm, base + d * 0.25, base + d * 0.40, 0.09, 16)
    objs.append(_obj('StarTrackers', bm, mats['terminal'], smooth=True))

    # tensioners, sun sensors, vane gimbals, vanes and vane booms at the four tips
    V = P['vane']['dims_m']
    vside = V['side']
    vR = float(P['vane']['position_rule'].split('R=')[1].split(' ')[0])
    bm_t, bm_v, bm_vb = bmesh.new(), bmesh.new(), bmesh.new()
    for ang in (0, 90, 180, 270):
        R = Matrix.Rotation(math.radians(ang), 3, 'Z')
        _box(bm_t, R @ Vector((tip, 0, -0.30)), (0.3, 0.2, 0.2), R)
        _box(bm_t, R @ Vector((tip, 0, -0.17)), (0.08, 0.08, 0.04), R)            # sun sensor
        _box(bm_t, R @ Vector((tip + 0.2 + 0.2, 0, -0.2)), (0.4, 0.4, 0.4), R)    # vane gimbal
        # vane: diamond aligned with the sail, tilted a few degrees by its control law
        tx = math.radians(rnd.uniform(-vane_tilt_deg, vane_tilt_deg))
        ty = math.radians(rnd.uniform(-vane_tilt_deg, vane_tilt_deg))
        T = Matrix.Rotation(tx, 3, 'X') @ Matrix.Rotation(ty, 3, 'Y')
        cen = R @ Vector((vR, 0, 0.05))
        hd = vside / math.sqrt(2)
        quad = [Vector((hd, 0, 0)), Vector((0, hd, 0)), Vector((-hd, 0, 0)), Vector((0, -hd, 0))]
        vs = [bm_v.verts.new(cen + R @ (T @ q)) for q in quad]
        bm_v.faces.new(vs)
        for q0, q1 in ((quad[0], quad[2]), (quad[1], quad[3])):
            _rod(bm_vb, cen + R @ (T @ q0) - Vector((0, 0, 0.03)), cen + R @ (T @ q1) - Vector((0, 0, 0.03)), 0.02, 6)
        _rod(bm_vb, R @ Vector((tip + 0.4, 0, -0.2)), cen - Vector((0, 0, 0.03)), 0.03, 8)
    objs.append(_obj('Tensioners', bm_t, mats['terminal']))
    vane = _obj('Vanes', bm_v, mats['vane'])
    bmesh_sub = vane.modifiers.new('sub', 'SUBSURF')
    bmesh_sub.subdivision_type = 'SIMPLE'
    bmesh_sub.levels = bmesh_sub.render_levels = 5
    objs.append(vane)
    objs.append(_obj('VaneBooms', bm_vb, mats['boom'], smooth=True))

    # laser terminals on the back face: service plate, mast, yoke, telescope with sunshade
    def terminal(bm, bma, base, size, d, mast=0.6):
        top = base + Vector((0, 0, -mast))
        _rod(bm, base, top, max(0.04, size * 0.4), 12)
        _box(bm, top + Vector((0, 0, -0.05)), (size * 2.2, size, 0.1))
        c0 = top + Vector((0, 0, -0.15))
        L = size * 2.5
        _rod(bm, c0 - d * L / 2, c0 + d * L / 2, size / 2 + 0.02, 20)
        _rod(bm, c0 + d * L / 2, c0 + d * (L / 2 + size * 1.4), size / 2 + 0.03, 20)
        _rod(bma, c0 + d * (L / 2 - 0.01), c0 + d * (L / 2 + 0.005), size / 2, 20)

    def aim():
        az = rnd.uniform(0, 2 * math.pi)
        el = math.radians(rnd.uniform(-70, -8))                        # into the -Z hemisphere
        return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))

    if terminals and era == '2026':
        T = P['patch_terminal']['dims_m']
        bm, bma = bmesh.new(), bmesh.new()
        for (xx, yy) in P['patch_terminal']['xy_m']:
            _box(bm, Vector((xx, yy, -0.011)), (1.0, 1.0, 0.02))
            terminal(bm, bma, Vector((xx, yy, -0.02)), T['telescope']['aperture'], aim())
        objs.append(_obj('Terminals', bm, mats['terminal'], smooth=True))
        objs.append(_obj('TerminalApertures', bma, mats['aperture'], smooth=True))
    elif terminals:
        bm, bma = bmesh.new(), bmesh.new()
        zb = -0.30 - H['depth']
        # 8 x 10 cm neighbour terminals: one on each boom-tip tensioner, four round the hub
        for ang in (0, 90, 180, 270):
            R = Matrix.Rotation(math.radians(ang), 3, 'Z')
            terminal(bm, bma, R @ Vector((tip - 0.6, 0, -0.4)), 0.10, aim(), mast=0.3)
            terminal(bm, bma, R @ Vector((2.6, 2.6, -0.32)), 0.10, aim(), mast=0.4)
        # 4 x 30 cm long-range terminals on the hub's back face
        for k in range(4):
            a = math.radians(45 + 90 * k)
            terminal(bm, bma, Vector((1.0 * math.cos(a), 1.0 * math.sin(a), zb)), 0.30, aim(), mast=0.5)
        objs.append(_obj('Terminals', bm, mats['terminal'], smooth=True))
        objs.append(_obj('TerminalApertures', bma, mats['aperture'], smooth=True))

    for o in objs:
        o.parent = root
    info = {'half_diagonal': LD, 'tip': tip, 'vane_R': vR, 'vane_side': vside}
    return root, info


# ---------------------------------------------------------------------------------------------
# Thermal (LWIR 8-14 um) view: brightness temperature = band radiance of eps * B(T)
# ---------------------------------------------------------------------------------------------

H_, C_, K_ = 6.62607015e-34, 299792458.0, 1.380649e-23


def band_radiance(T, l0=8e-6, l1=14e-6, n=200):
    s = 0.0
    dl = (l1 - l0) / n
    for i in range(n):
        lam = l0 + (i + 0.5) * dl
        s += 2 * H_ * C_ ** 2 / lam ** 5 / math.expm1(H_ * C_ / (lam * K_ * T)) * dl
    return s


def brightness_temp(T, eps):
    """Temperature of a blackbody with the same 8-14 um radiance as a surface at T with emissivity
    eps facing cold space (reflected sky ~3 K adds nothing)."""
    target = eps * band_radiance(T)
    lo, hi = 20.0, T
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if band_radiance(mid) < target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def thermal_view(sc, spec, lo=200.0, hi=360.0, pitch=None, film_K=None, chip_K=None):
    import hero
    M = spec['materials']
    tmp = dict(spec['sail']['temperatures'])
    if film_K:
        tmp['film_K'] = tmp['hinge_K'] = film_K
    if chip_K:
        tmp['chiplet_die_K'] = [chip_K - 1.5, chip_K + 1.5]
    e = M
    tb = {
        'film_front': brightness_temp(tmp['film_K'], e['sail_front_pv']['eps_IR']),
        'film_back': brightness_temp(tmp['film_K'], e['sail_back_enamel']['eps_IR']),
        'chip': brightness_temp(sum(tmp['chiplet_die_K']) / 2, e['sail_back_enamel']['eps_IR']),
        'hinge': brightness_temp(tmp['hinge_K'], e['hinge_strip']['eps_IR']),
        'boom': brightness_temp(tmp['booms_K'], e['boom_mg_oxidised']['eps_IR']),
        'vane_front': brightness_temp(sum(tmp['vanes_K']) / 2, e['vane_reflector_front']['eps_IR']),
        'vane_back': brightness_temp(sum(tmp['vanes_K']) / 2, e['vane_back']['eps_IR']),
        'hub': brightness_temp(sum(tmp['hub_K']) / 2, e['hub_blanket']['eps_IR']),
        'terminal': brightness_temp(sum(tmp['terminals_K']) / 2, 0.85),
    }
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o)

    def col(T):
        return (*hero.inferno((T - lo) / (hi - lo)), 1)

    def emit_mat(name, T):
        m = _new_mat(name)
        g = NT(m)
        out = g.node('ShaderNodeOutputMaterial')
        em = g.node('ShaderNodeEmission', Strength=1.0)
        em.inputs['Color'].default_value = col(T)
        g.L.new(em.outputs[0], out.inputs['Surface'])
        return m

    # film: chiplet dots and hinge strips on the back, uniform front
    P = spec['parts']
    pitch = pitch or P['tile_grid_front']['dims_m']['pitch']
    die = P['chiplet']['dims_m'][0]
    seg = spec['sail']['segmentation']
    fm = _new_mat('IR_Film')
    g = NT(fm)
    out = g.node('ShaderNodeOutputMaterial')
    tc = g.node('ShaderNodeTexCoord')
    x, y, _ = g.sep(tc.outputs['Object'])
    # heat spreads from each die: show the 7-10 K mound as a soft spot ~3 die widths across
    cx = g.math('MULTIPLY', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', x, pitch)), 0.5), pitch)
    cy = g.math('MULTIPLY', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', y, pitch)), 0.5), pitch)
    r2 = g.math('ADD', g.math('MULTIPLY', cx, cx), g.math('MULTIPLY', cy, cy))
    mound = g.math('EXPONENT', g.math('DIVIDE', r2, -(1.5 * die) ** 2))
    hinge, _, _ = g.stripe(y, seg['fold_panel_width_m'], 63.5 * pitch, seg['hinge_strips']['width_m'])
    Tb = g.math('ADD', tb['film_back'], g.math('MULTIPLY', mound, tb['chip'] - tb['film_back']))
    Tb = g.mix_f(hinge, Tb, tb['hinge'])
    geo = g.node('ShaderNodeNewGeometry')
    Tsurf = g.mix_f(geo.outputs['Backfacing'], tb['film_front'], Tb)
    frac = g.math('DIVIDE', g.math('SUBTRACT', Tsurf, lo), hi - lo, clamp=True)
    ramp = g.node('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    stops = [i / 10 for i in range(11)]
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for el, s in zip(cr.elements, stops):
        el.position = s
        el.color = (*hero.inferno(s), 1)
    g.L.new(frac, ramp.inputs['Fac'])
    em = g.node('ShaderNodeEmission', Strength=1.0)
    g.L.new(ramp.outputs['Color'], em.inputs['Color'])
    g.L.new(em.outputs[0], out.inputs['Surface'])

    kinds = {
        'SailFilm': fm, 'EdgeHem': emit_mat('IR_Hem', tb['hinge']), 'CornerDoublers': emit_mat('IR_Dbl', tb['hinge']),
        'CornerTethers': emit_mat('IR_Teth', tb['hinge']), 'Booms': emit_mat('IR_Boom', tb['boom']),
        'Hub': emit_mat('IR_Hub', tb['hub']), 'StarTrackers': emit_mat('IR_ST', tb['terminal']),
        'Tensioners': emit_mat('IR_Ten', tb['terminal']), 'VaneBooms': emit_mat('IR_VB', tb['boom']),
        'Terminals': emit_mat('IR_Term', tb['terminal']), 'TerminalApertures': emit_mat('IR_Ap', tb['terminal']),
    }
    vm = _new_mat('IR_Vane')
    g = NT(vm)
    out = g.node('ShaderNodeOutputMaterial')
    geo = g.node('ShaderNodeNewGeometry')
    a = g.node('ShaderNodeEmission', Strength=1.0); a.inputs['Color'].default_value = col(tb['vane_front'])
    b = g.node('ShaderNodeEmission', Strength=1.0); b.inputs['Color'].default_value = col(tb['vane_back'])
    mx = g.node('ShaderNodeMixShader')
    g.L.new(geo.outputs['Backfacing'], mx.inputs['Fac'])
    g.L.new(a.outputs[0], mx.inputs[1]); g.L.new(b.outputs[0], mx.inputs[2])
    g.L.new(mx.outputs[0], out.inputs['Surface'])
    kinds['Vanes'] = vm
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name in kinds:
            o.data.materials.clear()
            o.data.materials.append(kinds[o.name])
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    return tb
