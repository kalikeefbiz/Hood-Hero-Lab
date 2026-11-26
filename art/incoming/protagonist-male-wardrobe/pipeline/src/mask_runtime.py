"""Map source-polygon masks to runtime Body triangle ordinals and write body-masks.json (contract format)."""
import sys, json; sys.path.insert(0,"/home/claude/work/pipe")
from common import *
from scipy.spatial import cKDTree
rt=json.load(open("/home/claude/work/body_runtime_tris.json")); C=np.array(rt["cent"])
arm,body=open_source(); me=body.data; R=mesh_arrays(me)
src=np.array([R[list(p.vertices)].mean(0) for p in me.polygons]); src_gl=np.c_[src[:,0],src[:,2],-src[:,1]]
tr=cKDTree(src_gl); dd,ii=tr.query(C)
# resolve the few quantization collisions greedily with the next-nearest unused source triangle
from collections import Counter
cnt=Counter(ii.tolist()); used=set(ii.tolist())
for t in np.where([cnt[i]>1 for i in ii])[0]:
    if cnt[ii[t]]<=1: continue
    d2,i2=tr.query(C[t],k=6)
    for dk,ik in zip(d2,i2):
        if ik not in used: cnt[ii[t]]-=1; ii[t]=ik; dd[t]=dk; used.add(ik); cnt[ik]=1; break
print("centroid match: max %.6f m, p99 %.6f, unique sources %d / %d"%(dd.max(),np.percentile(dd,99),len(set(ii)),len(C)))
assert len(set(ii))==len(C) and dd.max()<0.002
out={"bodySha256":rt["sha"],"node":"Body","primitive":0,"indexCount":rt["indexCount"],
     "encoding":"zero-based triangle ordinal ranges [start,count]","maxSourceTriangleMatchErrorMeters":round(float(dd.max()),6),"wearables":{}}
spec=json.loads(sys.argv[1])   # {"tee-white":{"slot":"top","mask":"/path.npy","regions":[...]}, ...}
for wid,s in spec.items():
    hid=np.load(s["mask"])[ii]           # runtime ordinal -> source polygon hidden flag
    ranges=[]; t=0
    while t<len(hid):
        if hid[t]:
            st=t
            while t<len(hid) and hid[t]: t+=1
            ranges.append([st,t-st])
        else: t+=1
    out["wearables"][wid]={"slot":s["slot"],"regions":s.get("regions",[]),"triangles":int(hid.sum()),"ranges":ranges}
    print(wid,"hidden runtime triangles",int(hid.sum()),"ranges",len(ranges))
json.dump(out,open(sys.argv[2],"w"),separators=(",",":"))
