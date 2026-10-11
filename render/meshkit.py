"""Vectorised mesh building: thousands of rods, rings and boxes as numpy arrays, written to one
Blender mesh with foreach_set. (bmesh primitive ops slow down as the bmesh grows; a structure with
tens of thousands of members takes minutes that way and seconds this way.)"""
import numpy as np
import bpy


class Batch:
    def __init__(self):
        self.V = []
        self.F = []          # list of (faces array, verts per face)
        self.n = 0

    def _add(self, verts, faces):
        verts = np.asarray(verts, np.float64).reshape(-1, 3)
        faces = np.asarray(faces, np.int64)
        self.V.append(verts)
        self.F.append(faces + self.n)
        self.n += len(verts)

    @staticmethod
    def _frames(axis):
        axis = axis / np.linalg.norm(axis, axis=1)[:, None]
        ref = np.where(np.abs(axis[:, 2:3]) < 0.9, np.array([[0, 0, 1.0]]), np.array([[1.0, 0, 0]]))
        u = np.cross(axis, ref)
        u /= np.linalg.norm(u, axis=1)[:, None]
        v = np.cross(axis, u)
        return axis, u, v

    def rods(self, A, B, r, segs=6):
        """Open cylinders from A[i] to B[i] (N x 3), radius r (scalar or N)."""
        A = np.atleast_2d(np.asarray(A, float))
        B = np.atleast_2d(np.asarray(B, float))
        N = len(A)
        if N == 0:
            return
        r = np.broadcast_to(np.asarray(r, float), (N,))
        _, u, v = self._frames(B - A)
        t = np.linspace(0, 2 * np.pi, segs, endpoint=False)
        ring = np.cos(t)[None, :, None] * u[:, None, :] + np.sin(t)[None, :, None] * v[:, None, :]
        ring = ring * r[:, None, None]
        verts = np.concatenate([A[:, None, :] + ring, B[:, None, :] + ring], 1)      # N x 2s x 3
        j = np.arange(segs)
        q = np.stack([j, (j + 1) % segs, segs + (j + 1) % segs, segs + j], -1)          # s x 4
        faces = (q[None] + (2 * segs) * np.arange(N)[:, None, None]).reshape(-1, 4)
        self._add(verts.reshape(-1, 3), faces)

    def rings(self, C, axis, r_out, r_in, depth, segs=24):
        """Annular coils (flat tubes) centred at C[i], axis direction `axis` (3,), as two
        concentric open cylinders plus front/back annuli."""
        C = np.atleast_2d(np.asarray(C, float))
        N = len(C)
        ax = np.tile(np.asarray(axis, float)[None], (N, 1))
        ax, u, v = self._frames(ax)
        t = np.linspace(0, 2 * np.pi, segs, endpoint=False)
        cs, sn = np.cos(t), np.sin(t)
        out = []
        for rad in (r_out, r_in):
            for s in (-0.5, 0.5):
                out.append(C[:, None, :] + rad * (cs[None, :, None] * u[:, None, :] + sn[None, :, None] * v[:, None, :]) + s * depth * ax[:, None, :])
        verts = np.concatenate(out, 1)       # N x 4s x 3 : [outer front, outer back, inner front, inner back]
        j = np.arange(segs)
        jn = (j + 1) % segs
        o0, o1, i0, i1 = 0, segs, 2 * segs, 3 * segs
        quads = np.concatenate([
            np.stack([o0 + j, o0 + jn, o1 + jn, o1 + j], -1),      # outer wall
            np.stack([i1 + j, i1 + jn, i0 + jn, i0 + j], -1),      # inner wall
            np.stack([i0 + j, i0 + jn, o0 + jn, o0 + j], -1),      # front annulus
            np.stack([o1 + j, o1 + jn, i1 + jn, i1 + j], -1),      # back annulus
        ])
        faces = (quads[None] + (4 * segs) * np.arange(N)[:, None, None]).reshape(-1, 4)
        self._add(verts.reshape(-1, 3), faces)

    def boxes(self, C, S, R=None):
        """Boxes centred at C[i] with sizes S[i] (N x 3) and optional rotations R[i] (N x 3 x 3)."""
        C = np.atleast_2d(np.asarray(C, float))
        S = np.atleast_2d(np.asarray(S, float))
        N = len(C)
        corners = np.array([[x, y, z] for z in (-0.5, 0.5) for y in (-0.5, 0.5) for x in (-0.5, 0.5)])
        loc = corners[None] * S[:, None, :]
        if R is not None:
            loc = np.einsum('nij,nkj->nki', np.asarray(R, float), loc)
        verts = C[:, None, :] + loc
        q = np.array([[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]])
        faces = (q[None] + 8 * np.arange(N)[:, None, None]).reshape(-1, 4)
        self._add(verts.reshape(-1, 3), faces)

    def to_object(self, name, mat=None, smooth=False, collection=None):
        V = np.concatenate(self.V) if self.V else np.zeros((0, 3))
        Q = np.concatenate(self.F) if self.F else np.zeros((0, 4), np.int64)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(V))
        me.vertices.foreach_set('co', V.astype(np.float32).ravel())
        me.loops.add(Q.size)
        me.loops.foreach_set('vertex_index', Q.ravel().astype(np.int32))
        me.polygons.add(len(Q))
        me.polygons.foreach_set('loop_start', np.arange(0, Q.size, 4, dtype=np.int32))
        me.update(calc_edges=True)
        if smooth:
            me.shade_smooth()
        if mat is not None:
            me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob
