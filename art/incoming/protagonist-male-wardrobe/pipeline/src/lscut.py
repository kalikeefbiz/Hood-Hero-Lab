import numpy as np
from collections import defaultdict
def levelset_cut(V, F, g, snap=0.12):
    """Keep the region g<=0 of a triangle mesh, cutting triangles exactly along g=0.
    Returns V2, F2, interp list [(i,j,w)] such that V2[k] = (1-w)V[i] + wV[j] (w=0 for original verts),
    and the old->new index map for kept original verts."""
    g = g.copy()
    # snap near-zero values to avoid slivers: scale by local edge length via |g| relative spread
    eps = snap * np.median(np.abs(g[np.abs(g) > 0])) * 0.05
    g[np.abs(g) < eps] = 0.0
    keepv = g <= 0
    newV = []; interp = []; o2n = -np.ones(len(V), int)
    for i in np.where(keepv)[0]:
        o2n[i] = len(newV); newV.append(V[i]); interp.append((i, i, 0.0))
    ecache = {}
    def ev(a, b):
        key = (a, b) if a < b else (b, a)
        if key not in ecache:
            i, j = key; w = g[i] / (g[i] - g[j])
            ecache[key] = len(newV); newV.append((1 - w) * V[i] + w * V[j]); interp.append((i, j, w))
        return ecache[key]
    F2 = []
    for f in F:
        s = [g[v] for v in f]
        if all(x <= 0 for x in s): F2.append(tuple(o2n[v] for v in f)); continue
        if all(x >= 0 for x in s): continue
        poly = []
        for k in range(3):
            a, b = f[k], f[(k + 1) % 3]
            if g[a] <= 0: poly.append(o2n[a])
            if (g[a] < 0 and g[b] > 0) or (g[a] > 0 and g[b] < 0): poly.append(ev(a, b))
        for k in range(1, len(poly) - 1): F2.append((poly[0], poly[k], poly[k + 1]))
    return np.array(newV), F2, interp, o2n

def interp_attr(A, interp):
    A = np.asarray(A)
    i = np.array([t[0] for t in interp]); j = np.array([t[1] for t in interp]); w = np.array([t[2] for t in interp])
    if A.ndim == 1: return (1 - w) * A[i] + w * A[j]
    return (1 - w)[:, None] * A[i] + w[:, None] * A[j]

def compact(V, F, keep_mask=None):
    used = np.zeros(len(V), bool)
    for f in F: used[list(f)] = True
    m = -np.ones(len(V), int); m[used] = np.arange(used.sum())
    return V[used], [tuple(m[v] for v in f) for f in F], used
