import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
bp=BodyPrep()
P,bones=bp.Pw,bp.bones
wA=bp.grp(lambda n:n.startswith(("upper_arm","forearm","hand")))
wL=bp.grp(lambda n:n.startswith(("thigh","shin","foot","toe")))
print("welded verts",len(P),"faces",len(bp.faces))
T_END=0.58
keep=(P[:,2]>=0.85)&(wL<0.5)
for s in "LR":
    h,dv,L=bp.arm_axis(s)
    side=(P[:,0]>0) if s=="L" else (P[:,0]<0)
    t=((P-h)@dv)/L
    keep[side&(wA>0.5)&(t>T_END)]=False
    keep[side&(t>T_END)&(np.abs(P[:,0])>0.2)]=False
yc,a,b=0.036,0.092,0.088
keep&=~(((P[:,0]/a)**2+((P[:,1]-yc)/b)**2<1)&(P[:,2]>1.38))
keep=largest_component(bp.faces,keep)
sel=[f for f in bp.faces if all(keep[v] for v in f)]
loops,nm=boundary_loops(sel)
print("faces",len(sel),"verts",keep.sum(),"loops",len(loops),"nonmanifold",nm)
for lp in sorted(loops,key=len,reverse=True)[:10]:
    c=P[lp]; print("  loop n=%d centroid=(%.2f,%.2f,%.2f) z[%.3f,%.3f] x[%.2f,%.2f]"%(len(lp),*c.mean(0),c[:,2].min(),c[:,2].max(),c[:,0].min(),c[:,0].max()))
from PIL import Image, ImageDraw
def plot(path, axes, keep, loops=None, sz=900, zr=(0.8,1.56), xr=(-0.6,0.6)):
    im=Image.new("RGB",(sz*2//1,sz),(30,30,36)); d=ImageDraw.Draw(im)
    for vi,(ax_u,sign) in enumerate(axes):
        for i,p in enumerate(P):
            if not (zr[0]<=p[2]<=zr[1]): continue
            u=(p[ax_u]*sign-xr[0])/(xr[1]-xr[0])*sz*0.98+sz*vi+ 0; v=(1-(p[2]-zr[0])/(zr[1]-zr[0]))*sz*0.98
            col=(240,200,60) if keep[i] else (90,90,100)
            d.point((u,v),fill=col)
    if loops:
        for lp in loops:
            for i in lp:
                p=P[i]
                for vi,(ax_u,sign) in enumerate(axes):
                    u=(p[ax_u]*sign-xr[0])/(xr[1]-xr[0])*sz*0.98+sz*vi; v=(1-(p[2]-zr[0])/(zr[1]-zr[0]))*sz*0.98
                    d.ellipse((u-2,v-2,u+2,v+2),fill=(255,60,60))
    im.save(path)
plot("/home/claude/work/tee_sel.png",[(0,1),(1,-1)],keep,loops)
