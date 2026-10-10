"""A synchronous compute cluster: N identical satellites in a tight, sun-pointing formation
(Project Suncatcher-style), built once and instanced. Units: metres; Sun along +Z."""
import bpy
import math
import random
from mathutils import Vector

import satellite


def make_prototype(mats, spec=None):
    coll = bpy.data.collections.new('SatProto')
    bpy.context.scene.collection.children.link(coll)
    root, s = satellite.build(mats, spec)
    # move the satellite and all its parts into the prototype collection
    for o in [root] + list(root.children_recursive):
        for c in o.users_collection:
            c.objects.unlink(o)
        coll.objects.link(o)
    bpy.context.view_layer.layer_collection.children[coll.name].exclude = True
    return coll, s


def formation(n, spacing, layers=1, jitter=0.03, seed=7):
    """Hexagonal lattice in the plane facing the Sun (XY), nearest first; optional stacked layers
    are offset along the Sun line so nobody shades a neighbour more than the tiling allows."""
    rnd = random.Random(seed)
    pts = []
    k = int(math.sqrt(n)) + 3
    for i in range(-k, k + 1):
        for j in range(-k, k + 1):
            x = (i + 0.5 * (j & 1)) * spacing
            y = j * spacing * math.sqrt(3) / 2
            pts.append((math.hypot(x, y), x, y))
    pts.sort()
    out = []
    for _, x, y in pts[:n]:
        out.append(Vector((x + rnd.uniform(-jitter, jitter) * spacing,
                           y + rnd.uniform(-jitter, jitter) * spacing,
                           rnd.uniform(-jitter, jitter) * spacing)))
    return out


def instance(coll, positions, name='Sat'):
    objs = []
    for i, p in enumerate(positions):
        o = bpy.data.objects.new(f'{name}{i:03d}', None)
        o.instance_type = 'COLLECTION'
        o.instance_collection = coll
        o.location = p
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    return objs


def laser_overlay(positions, pairs, radius=0.12, color=(0.25, 1.0, 0.45), strength=6.0):
    """Optical links drawn as thin emissive rods. In vacuum a 1550 nm beam is invisible; this is an
    explicitly labelled data overlay and is only added when asked for."""
    mat = bpy.data.materials.new('LinkOverlay')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    for a, b in pairs:
        pa, pb = positions[a], positions[b]
        mid = (pa + pb) / 2
        d = pb - pa
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=d.length, location=mid, vertices=6)
        o = bpy.context.object
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        o.data.materials.append(mat)
        o.visible_shadow = False
        o.visible_diffuse = False
        o.visible_glossy = False


def neighbour_pairs(positions, k=4, max_dist=None):
    pairs = set()
    for i, p in enumerate(positions):
        d = sorted(((p - q).length, j) for j, q in enumerate(positions) if j != i)
        for dist, j in d[:k]:
            if max_dist is None or dist <= max_dist:
                pairs.add(tuple(sorted((i, j))))
    return sorted(pairs)
