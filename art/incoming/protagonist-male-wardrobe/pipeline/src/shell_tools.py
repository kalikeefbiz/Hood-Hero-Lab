import sys; sys.path.insert(0, "/home/claude/work/pipe")
import numpy as np
from collections import defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def make_bvh(P, faces):
    return BVHTree.FromPolygons([tuple(map(float, p)) for p in P], [tuple(f) for f in faces], all_triangles=False)

def signed_dist(bvh, p):
    """signed distance to the body surface (+ outside), nearest point, normal."""
    loc, n, idx, d = bvh.find_nearest(Vector(p))
    if loc is None: return 1e9, None, None
    s = np.dot(np.array(p) - np.array(loc), np.array(n))
    return (d if s >= 0 else -d), np.array(loc), np.array(n)

def order_loop(loop, faces):
    """Return the boundary vertices of `loop` as an ordered cycle."""
    ls = set(loop); adj = defaultdict(list)
    ec = defaultdict(int)
    for f in faces:
        for k in range(len(f)): ec[tuple(sorted((f[k], f[(k + 1) % len(f)])))] += 1
    for (a, b), c in ec.items():
        if c == 1 and a in ls and b in ls: adj[a].append(b); adj[b].append(a)
    start = loop[0]; cyc = [start]; prev = None; cur = start
    while True:
        nxt = [x for x in adj[cur] if x != prev]
        if not nxt: break
        nx = nxt[0]
        if nx == start: break
        cyc.append(nx); prev, cur = cur, nx
        if len(cyc) > len(loop) + 2: break
    return cyc

def neighbors_from_faces(faces, n):
    nb = [set() for _ in range(n)]
    for f in faces:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            nb[a].add(b); nb[b].add(a)
    return [np.array(sorted(s), dtype=int) for s in nb]

def vertex_normals(V, faces):
    N = np.zeros_like(V)
    for f in faces:
        p = V[list(f)]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        if len(f) == 4: n = n + np.cross(p[2] - p[0], p[3] - p[0])
        for v in f: N[v] += n
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l == 0] = 1
    return N / l

def inside_parity(bvh, p, centre=(0.0, 0.02)):
    """Ray-parity inside test along a horizontal ray pointing away from the torso axis (body is open only at the neck top)."""
    d = np.array([p[0] - centre[0], p[1] - centre[1], 0.0]); n = np.linalg.norm(d)
    d = d / n if n > 1e-6 else np.array([1.0, 0, 0])
    o = Vector(p); dv = Vector(d); hits = 0
    for _ in range(16):
        h = bvh.ray_cast(o, dv)
        if h[0] is None: break
        hits += 1; o = h[0] + dv * 1e-5
    return hits % 2 == 1

def signed_dist(bvh, p):
    loc, n, idx, d = bvh.find_nearest(Vector(p))
    if loc is None: return 1e9, None, None
    n = np.array(n); loc = np.array(loc); v = np.array(p) - loc
    if d < 0.008:   # close to the skin: face normal is reliable
        s = np.dot(v, n); return (d if s >= 0 else -d), loc, n
    ins = inside_parity(bvh, p)   # farther out: normals can lie (creases, flipped faces); use parity
    out = v / d
    return (-d, loc, -out) if ins else (d, loc, out)
