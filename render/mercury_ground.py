"""Mercury ground for the surface scenes: curvature, simple craters, regolith, and Geometry Nodes
instancing for large fields of identical parts (panels, fins)."""
import math

import bpy
import numpy as np

from earth_sky import new_mat

R_M = 2.4397e6


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
