"""Outer garment (tee) vs inner garment (jeans): inner-garment vertices above the tee hem that poke outside the tee."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from shell_tools import *
from facetypes import face_types
o=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); i_=np.load("/home/claude/work/jeans_skin.npz",allow_pickle=True)
ov3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True)
Fo=[tuple(int(x) for x in f if x>=0) for f in o["F"]]; fto=face_types(Fo,ov3); Fo_out=[f for f,t in zip(Fo,fto) if t<=1]
arm,body=open_source(); res={}
for act,step in (("Idle",20),("Walk",3),("Run",3)):
    nfr=int(bpy.data.actions[act].frame_range[1])
    for fr in range(1,nfr+1,step):
        set_pose(arm,act,fr); B=bone_matrices(arm)
        G=apply_lbs(lbs_matrices(o["W"],B,list(o["bones"])),o["VT"]); J=apply_lbs(lbs_matrices(i_["W"],B,list(i_["bones"])),i_["VT"])
        bvh=make_bvh(G,Fo_out); hemz=np.percentile(G[:,2],1)+0.03
        cnt=0; worst=0; wp=None
        for k,p in enumerate(J):
            if p[2]<hemz or p[2]>G[:,2].max(): continue
            loc,n,fi,dd=bvh.find_nearest(Vector(p))
            if dd>0.05: continue
            s=(p-np.array(loc))@np.array(n)
            if s>0.0005: cnt+=1; 
            if s>worst: worst=s; wp=np.round(i_["VT"][k],3).tolist()
        res[(act,fr)]=(cnt,worst,wp)
        print(act,fr,"jeans verts outside tee:",cnt,"worst %.4f"%worst,wp,flush=True)
