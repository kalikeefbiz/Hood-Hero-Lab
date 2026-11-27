import numpy as np
def face_types(F, v3, keys=("collar","hemL","hemR","hemB"), collar_keys=("collar",)):
    """0 shell, 1 outer band, 2 lip, 3 inner facing. Collar-style bands have 2 outer rings, hem-style 1."""
    ringidx={}
    for key in keys:
        if key not in v3: continue
        for r,ring in enumerate(v3[key]):
            for v in ring: ringidx.setdefault(int(v),{})[key]=r
    out=[]
    for f in F:
        keys_=set(k for v in f for k in ringidx.get(v,{}))
        if not keys_: out.append(0); continue
        k=keys_.pop(); rs=[ringidx[v][k] for v in f if k in ringidx.get(v,{})]
        if len(rs)<len(f): out.append(0); continue
        lo=min(rs)
        if k in collar_keys: out.append(1 if lo<=1 else (2 if lo==2 else 3))
        else: out.append(1 if lo==0 else (2 if lo==1 else 3))
    return np.array(out)
