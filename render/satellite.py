"""Parametric swarm satellite, our own design: sun-facing PV wings, one concentrated compute
module (synchronous chips), knife-edge double-sided liquid radiators, laser terminals, truss.
Dimensions come from the design spec (render/numbers.json); the defaults below are placeholders
only. Built in metres.

Frame: the Sun is along +Z (light travels -Z). PV wings lie in the XY plane facing +Z and span X.
Radiators lie in the YZ plane (normal +-X): edge-on to the Sun, so they never see sunlight and
radiate from both faces. The compute module sits at the root of the radiators, between the wings.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix

DEFAULT = {                       # placeholders until the design spec is loaded
    'wing_span': 60.0,            # tip to tip (m)
    'wing_height': 10.0,          # chord of each wing (m)
    'wing_gap': 6.0,              # gap between wing roots (m)
    'wing_panels': 8,             # hinged panels per wing (accordion fold lines)
    'radiator_area': 100.0,       # planform m^2 (both faces radiate)
    'radiator_panels': 2,         # one above, one below the bus
    'radiator_depth': 5.0,        # along the Sun line (Z), m
    'bus': (3.0, 3.0, 3.2),       # compute module x, y, z (m)
    'terminals': 4,               # optical inter-satellite links
    'tube_pitch': 0.15,
}


def _box(name, size, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    bev = o.modifiers.new('bevel', 'BEVEL')
    bev.width = min(size) * 0.02
    bev.segments = 2
    return o


def _panel(name, w, h, thickness, loc, rot, mat, edge_mat=None):
    """Thin slab with UV/object coords in metres (pattern stays true scale)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (w, h, thickness)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    if edge_mat:
        o.data.materials.append(edge_mat)
    return o


def _cyl(name, r, depth, loc, rot, mat, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def _truss(name, start, end, width, mat, bays=None):
    """Triangular lattice truss between two points (simple rods)."""
    start, end = Vector(start), Vector(end)
    axis = end - start
    length = axis.length
    bays = bays or max(2, int(length / width))
    q = axis.to_track_quat('Z', 'Y')
    objs = []
    r = width * 0.04
    corners = [Vector((math.cos(a), math.sin(a), 0)) * width * 0.5 for a in (0, 2.094, 4.189)]
    for c in corners:
        p0 = start + q @ c
        p1 = end + q @ c
        mid = (p0 + p1) / 2
        o = _cyl(f'{name}_long', r, length, mid, (p1 - p0).to_track_quat('Z', 'Y').to_euler(), mat, 8)
        objs.append(o)
    for i in range(bays):
        t0 = i / bays
        t1 = (i + 1) / bays
        for k in range(3):
            a = start + axis * t0 + q @ corners[k]
            b = start + axis * t1 + q @ corners[(k + 1) % 3]
            mid = (a + b) / 2
            o = _cyl(f'{name}_diag', r * 0.7, (b - a).length, mid, (b - a).to_track_quat('Z', 'Y').to_euler(), mat, 6)
            objs.append(o)
    # join
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def _sphere(name, r, loc, mat, half=False):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def _cone(name, r1, r2, depth, loc, rot, mat):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=24)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def build(mats, spec=None, origin=(0, 0, 0), name='Sat', seed=3):
    """Build the satellite. Returns (root empty, resolved spec)."""
    import random
    rnd = random.Random(seed)
    s = dict(DEFAULT)
    if spec:
        s.update(spec)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    parts = []

    # ---- compute module: accelerator trays on cold plates inside an aluminised glass-cloth blanket
    bx, by, bz = s['bus']
    parts.append(_box('ComputeModule', (bx, by, bz), (0, 0, 0), mats['blanket']))
    for sx in (-1, 1):                                    # edge rails of the primary structure
        for sy in (-1, 1):
            parts.append(_box('Rail', (0.08, 0.08, bz * 1.02), (sx * bx / 2, sy * by / 2, 0), mats['truss']))
    parts.append(_box('AvionicsRadiator', (bx * 0.5, 0.02, bz * 0.35), (0, -by / 2 - 0.011, bz * 0.18), mats['radiator']))
    for sgn in (-1, 1):                                   # star trackers with sun baffles
        parts.append(_cyl('StarTracker', 0.07, 0.25, (sgn * bx * 0.3, by / 2 + 0.12, -bz * 0.3), (math.pi / 2, 0, 0), mats['black']))
    for sgn in (-1, 1):                                   # pumped-loop manifolds and pump packages
        parts.append(_cyl('Manifold', 0.16, by * 0.85, (sgn * (bx / 2 + 0.18), 0, -bz * 0.25), (math.pi / 2, 0, 0), mats['steel']))
        parts.append(_box('PumpPackage', (0.35, 0.5, 0.35), (sgn * (bx / 2 + 0.2), 0, bz * 0.2), mats['steel']))

    # ---- PV wings (cells face +Z), panels on a spar, each panel slightly out of plane like real arrays
    half = s['wing_span'] / 2
    root_x = s['wing_gap'] / 2
    wing_len = half - root_x
    npan = s['wing_panels']
    pw = wing_len / npan
    zw = bz / 2 + 0.6
    H = s['wing_height']
    for sgn in (-1, 1):
        for i in range(npan):
            cx = sgn * (root_x + pw * (i + 0.5))
            rot = (math.radians(rnd.uniform(-0.25, 0.25)), math.radians(rnd.uniform(-0.25, 0.25)), 0)
            parts.append(_panel(f'PV_{sgn}_{i}', pw - 0.10, H, 0.025, (cx, 0, zw), rot, mats['pv']))
            for yy in (-H / 2, H / 2):                    # frame rails along the long edges
                parts.append(_box('PVFrame', (pw - 0.06, 0.05, 0.05), (cx, yy, zw - 0.02), mats['aluminium']))
            for xx in (cx - sgn * (pw / 2 - 0.03), cx + sgn * (pw / 2 - 0.03)):
                parts.append(_box('PVFrameEnd', (0.04, H, 0.04), (xx, 0, zw - 0.03), mats['aluminium']))
            if i < npan - 1:                              # hinge blocks between panels
                hx = sgn * (root_x + pw * (i + 1))
                for yy in (-H * 0.42, 0, H * 0.42):
                    parts.append(_box('Hinge', (0.12, 0.18, 0.08), (hx, yy, zw - 0.04), mats['steel']))
        parts.append(_truss(f'Spar_{sgn}', (sgn * bx / 2, 0, zw - 0.35), (sgn * half, 0, zw - 0.35), 0.4, mats['truss']))
        parts.append(_box('Yoke', (root_x - bx / 2 + 0.2, 0.25, 0.25), (sgn * (bx / 2 + (root_x - bx / 2) / 2), 0, zw - 0.2), mats['truss']))

    # ---- radiator blades: double-sided, knife-edge to the Sun, segmented, with headers and MMOD lip
    n = s['radiator_panels']
    depth = s['radiator_depth']
    height = s['radiator_area'] / (n * depth)
    nseg = max(2, int(round(height / 3.0)))
    seg_h = height / nseg
    zc = -depth / 2 + bz / 2 - 0.3
    for k in range(n):
        sgn = 1 if k % 2 == 0 else -1
        y0 = sgn * (by / 2 + 0.5)
        for j in range(nseg):
            cy = y0 + sgn * (seg_h * (j + 0.5))
            parts.append(_panel(f'Radiator_{k}_{j}', 0.05, seg_h - 0.06, depth, (0, cy, zc), (0, 0, 0), mats['radiator']))
        for yy in (y0, y0 + sgn * height):
            parts.append(_cyl('Header', 0.075, depth, (0, yy, zc), (0, 0, 0), mats['steel']))
        # leading edge toward the Sun: a narrow guard rail that shades the blade edge
        parts.append(_cyl('EdgeGuard', 0.05, height, (0, y0 + sgn * height / 2, zc + depth / 2 + 0.05), (math.pi / 2, 0, 0), mats['aluminium']))
        parts.append(_truss(f'RadBoom_{k}', (0, sgn * by / 2, zc - depth / 2 - 0.25), (0, y0 + sgn * height, zc - depth / 2 - 0.25), 0.3, mats['truss']))
        for sx in (-1, 1):                                # flex lines from the manifolds to the blade root
            parts.append(_cyl('FlexLine', 0.045, 0.9, (sx * 0.12, sgn * (by / 2 + 0.25), zc + depth * 0.3), (math.pi / 2, 0, 0), mats['black']))

    # ---- laser terminals on the anti-Sun face: gimbal base, dome, telescope with dark aperture
    for k in range(s['terminals']):
        a = (k + 0.5) * 2 * math.pi / s['terminals']
        x, y = math.cos(a) * bx * 0.38, math.sin(a) * by * 0.38
        z = -bz / 2
        parts.append(_cyl('LaserBase', 0.2, 0.18, (x, y, z - 0.09), (0, 0, 0), mats['truss']))
        parts.append(_sphere('LaserDome', 0.17, (x, y, z - 0.22), mats['aluminium']))
        tilt = (0.5 * math.sin(a), -0.5 * math.cos(a), 0)
        parts.append(_cyl('LaserTube', 0.09, 0.32, (x, y, z - 0.42), tilt, mats['aluminium']))

    # ---- electric thrusters (circularisation and station keeping)
    for sgn in (-1, 1):
        parts.append(_cyl('ThrusterBody', 0.22, 0.25, (sgn * bx * 0.28, -by / 2 - 0.15, -bz * 0.3), (math.pi / 2, 0, 0), mats['steel']))
        parts.append(_cone('ThrusterExit', 0.24, 0.30, 0.12, (sgn * bx * 0.28, -by / 2 - 0.32, -bz * 0.3), (math.pi / 2, 0, 0), mats['black']))

    for p in parts:
        p.parent = root
    root.location = origin
    return root, s
