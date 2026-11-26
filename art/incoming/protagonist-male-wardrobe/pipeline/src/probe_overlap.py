import numpy as np
from PIL import Image, ImageDraw
U=np.load("/home/claude/work/tee_uv.npz",allow_pickle=True); uv=U["uv"]; lab=U["lab"]
d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
R=1024; cnt=np.zeros((R,R),int); lp=0; own=np.full((R,R),-1)
for k,f in enumerate(F):
    im=Image.new("L",(R,R),0); ImageDraw.Draw(im).polygon([(uv[lp+j,0]*R,(1-uv[lp+j,1])*R) for j in range(len(f))],fill=1); lp+=len(f)
    a=np.array(im)>0; cnt+=a
    if lab[k]=="collar": own[a]=1
ov=cnt>1
print("overlapping texels",ov.sum(),"of which in collar",(ov&(own==1)).sum())
ys,xs=np.where(ov&(own==1)); print("collar overlap bbox",(xs.min(),xs.max(),ys.min(),ys.max()) if len(xs) else None)
labs=sorted(set(lab)); lid={l:i for i,l in enumerate(labs)}
masks={l:np.zeros((R,R),bool) for l in labs}; lp=0
for k,f in enumerate(F):
    im=Image.new("L",(R,R),0); ImageDraw.Draw(im).polygon([(uv[lp+j,0]*R,(1-uv[lp+j,1])*R) for j in range(len(f))],fill=1); lp+=len(f)
    masks[lab[k]]|=np.array(im)>0
from scipy import ndimage
for a in labs:
    for b in labs:
        if a<b:
            o=ndimage.binary_erosion(masks[a],iterations=1)&ndimage.binary_erosion(masks[b],iterations=1)
            if o.sum(): ys,xs=np.where(o); print(a,b,"overlap texels",o.sum(),"bbox",xs.min(),xs.max(),ys.min(),ys.max())
