"""Load the round-5 body, pose it (A-pose construction pose), weld seam-split vertices."""
import sys; sys.path.insert(0, "/home/claude/work/pipe")
from posing import *
from collections import defaultdict

class BodyPrep:
    def __init__(self, s_arm=0.63):
        self.arm, self.body = open_source()
        a_pose(self.arm, s_arm)
        self.bones = [b.name for b in self.arm.data.bones]
        me = self.body.data
        self.P = eval_verts(self.body)            # posed, per original vertex
        self.R = mesh_arrays(me)                  # rest (T), per original vertex
        W = weights_from_object(self.body, self.bones)
        self.Wn = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
        self.B = bone_matrices(self.arm)
        key = np.round(self.R * 1e5).astype(np.int64)
        _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        self.first, self.inv = first, inv.ravel()
        self.faces_o = [tuple(p.vertices) for p in me.polygons]          # original indices (mask ordinals)
        self.faces = [tuple(int(self.inv[v]) for v in f) for f in self.faces_o]  # welded
        self.Pw, self.Rw, self.Ww = self.P[first], self.R[first], self.Wn[first]
        self.nb = defaultdict(set)
        for f in self.faces:
            for v in f: self.nb[v].update(f)
    def grp(self, pred):
        return sum(self.Ww[:, i] for i, n in enumerate(self.bones) if pred(n))
    def arm_axis(self, s):
        h = np.array(self.arm.pose.bones[f"upper_arm.{s}"].head); t = np.array(self.arm.pose.bones[f"upper_arm.{s}.001"].tail)
        L = np.linalg.norm(t - h); return h, (t - h) / L, L

def boundary_loops(faces):
    ec = defaultdict(int)
    for f in faces:
        for k in range(len(f)): ec[tuple(sorted((f[k], f[(k + 1) % len(f)])))] += 1
    adj = defaultdict(list)
    for (a, b), c in ec.items():
        if c == 1: adj[a].append(b); adj[b].append(a)
    seen = set(); loops = []
    for v in adj:
        if v in seen: continue
        st = [v]; comp = []
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x); comp.append(x); st.extend(adj[x])
        loops.append(comp)
    return loops, sum(1 for c in ec.values() if c > 2)

def largest_component(faces, keep):
    sel = [f for f in faces if all(keep[v] for v in f)]
    adj = defaultdict(set)
    for f in sel:
        for v in f: adj[v].update(f)
    seen = set(); best = set()
    for v in adj:
        if v in seen: continue
        st = [v]; c = set()
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x); c.add(x); st.extend(adj[x] - seen)
        if len(c) > len(best): best = c
    k2 = np.zeros(len(keep), bool); k2[list(best)] = True
    return k2
