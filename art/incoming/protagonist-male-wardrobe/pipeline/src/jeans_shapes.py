"""Construction lines of the jeans in A-pose (x,z) front/back projections. Units metres. Wearer's left = +x."""
import numpy as np
def poly(pts,n=200):
    pts=np.array(pts,float); seg=np.linalg.norm(np.diff(pts,axis=0),axis=1); L=np.r_[0,np.cumsum(seg)]
    t=np.linspace(0,L[-1],n); return np.stack([np.interp(t,L,pts[:,0]),np.interp(t,L,pts[:,1])],1), t
def bez(p0,p1,p2,n=120):
    t=np.linspace(0,1,n)[:,None]; return (1-t)**2*np.array(p0)+2*(1-t)*t*np.array(p1)+t**2*np.array(p2)
BAND_BOTTOM_F=0.928; BAND_BOTTOM_B=0.958
FRONT={}  # name -> polyline in (x,z) on the front
for s in (1,-1):
    FRONT[f"pocket{s}"]=bez((s*0.088,BAND_BOTTOM_F),(s*0.115,0.880),(s*0.168,0.872))         # scoop opening
FRONT["coin"]=np.array([[-0.118,0.920],[-0.158,0.918],[-0.157,0.893],[-0.120,0.895],[-0.118,0.920]])
FRONT["fly"]=np.vstack([np.array([[0.032,BAND_BOTTOM_F],[0.032,0.885]]),bez((0.032,0.885),(0.032,0.862),(0.004,0.856),20)])
BACK={}
for s in (1,-1):
    BACK[f"yoke{s}"]=np.array([[s*0.0,0.905],[s*0.17,0.935]])
    BACK[f"bpocket{s}"]=np.array([[s*0.035,0.902],[s*0.150,0.915],[s*0.142,0.808],[s*0.095,0.792],[s*0.045,0.805],[s*0.035,0.902]])
RIVETS_F=[(0.088,BAND_BOTTOM_F-0.006),(0.164,0.875),(-0.088,BAND_BOTTOM_F-0.006),(-0.164,0.875),(-0.120,0.917),(-0.156,0.915)]
BUTTON_F=(0.0,0.951)
PATCH_B=(-0.115,0.966,0.072,0.040)   # centre x, centre z, width, height on the back waistband (wearer's right)
def honeycombs():
    """Irregular, tapered creases behind each knee, as (x,z) polylines on the back."""
    rng=np.random.default_rng(5); out=[]
    for s in (1,-1):
        for k in range(5):
            zc=0.430+0.021*k+rng.uniform(-0.006,0.006); xc=s*(0.107+rng.uniform(-0.012,0.012)); ln=rng.uniform(0.028,0.055)
            tilt=rng.uniform(-0.18,0.18); bow=rng.uniform(0.002,0.006)
            t=np.linspace(-0.5,0.5,25); x=xc+t*ln; z=zc+tilt*t*ln+bow*(1-(2*t)**2)
            out.append((s,np.stack([x,z],1)))
    return out
HONEY=honeycombs()
