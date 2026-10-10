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


def build(mats, spec=None, origin=(0, 0, 0), name='Sat'):
    s = dict(DEFAULT)
    if spec:
        s.update(spec)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    parts = []

    # Compute module: a box of cold-plated accelerator boards, wrapped in aluminised blanket
    bx, by, bz = s['bus']
    bus = _box('ComputeModule', (bx, by, bz), (0, 0, 0), mats['blanket'])
    parts.append(bus)
    # pumped-loop manifolds on the module
    for sgn in (-1, 1):
        parts.append(_cyl('Manifold', 0.18, by * 0.9, (sgn * (bx / 2 + 0.2), 0, -bz * 0.25), (math.pi / 2, 0, 0), mats['steel']))

    # PV wings: each wing is `wing_panels` panels with small hinge gaps, on a central spar
    half = s['wing_span'] / 2
    root_x = s['wing_gap'] / 2
    wing_len = half - root_x
    pw = wing_len / s['wing_panels']
    for sgn in (-1, 1):
        for i in range(s['wing_panels']):
            cx = sgn * (root_x + pw * (i + 0.5))
            parts.append(_panel(f'PV_{sgn}_{i}', pw - 0.08, s['wing_height'], 0.03, (cx, 0, bz / 2 + 0.6), (0, 0, 0), mats['pv']))
        parts.append(_truss(f'Spar_{sgn}', (sgn * bx / 2, 0, bz / 2 + 0.45), (sgn * half, 0, bz / 2 + 0.45), 0.35, mats['truss']))

    # Radiators: double-sided panels in the YZ plane (edge-on to the Sun), above and below the bus
    n = s['radiator_panels']
    depth = s['radiator_depth']
    height = s['radiator_area'] / (n * depth)
    for k in range(n):
        sgn = 1 if k % 2 == 0 else -1
        cy = sgn * (by / 2 + 0.4 + height / 2)
        rad = _panel(f'Radiator_{k}', 0.06, height, depth, (0, cy, -depth / 2 + bz / 2 - 0.3), (0, 0, 0), mats['radiator'])
        parts.append(rad)
        # header pipes along the radiator root and tip
        for yy in (sgn * (by / 2 + 0.4), sgn * (by / 2 + 0.4 + height)):
            parts.append(_cyl('Header', 0.08, depth, (0, yy, -depth / 2 + bz / 2 - 0.3), (0, 0, 0), mats['steel']))
        parts.append(_truss(f'RadBoom_{k}', (0, sgn * by / 2, -depth - 0.2 + bz / 2), (0, sgn * (by / 2 + 0.4 + height), -depth - 0.2 + bz / 2), 0.3, mats['truss']))

    # Laser terminals: small gimballed telescopes on the module corners (Starlink-style)
    for k in range(s['terminals']):
        a = (k + 0.5) * 2 * math.pi / s['terminals']
        x = math.cos(a) * bx * 0.42
        z = -bz / 2 - 0.25
        y = math.sin(a) * by * 0.42
        base = _cyl('LaserBase', 0.18, 0.3, (x, y, z), (0, 0, 0), mats['black'])
        tel = _cyl('LaserTelescope', 0.11, 0.35, (x, y, z - 0.3), (0.4 * math.cos(a), 0.4 * math.sin(a), 0), mats['aluminium'])
        parts += [base, tel]

    # Ion thrusters (circularisation, station keeping)
    for sgn in (-1, 1):
        parts.append(_cyl('Thruster', 0.25, 0.4, (sgn * bx * 0.3, by / 2 + 0.2, -bz / 2), (math.pi / 2, 0, 0), mats['steel']))

    for p in parts:
        p.parent = root
    root.location = origin
    return root, s
