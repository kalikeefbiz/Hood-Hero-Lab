import numpy as np
d=np.load("/home/claude/work/tee_v2.npz",allow_pickle=True); V=d["V"]; L=d["neck"]
seg=np.linalg.norm(V[np.roll(L,-1)]-V[L],axis=1)
print("neck rim n",len(L),"seg min %.4f max %.4f median %.4f"%(seg.min(),seg.max(),np.median(seg)), "argmin",seg.argmin(),"argmax",seg.argmax())
print("unique verts",len(set(L.tolist())))
