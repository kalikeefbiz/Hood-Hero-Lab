import numpy as np
def value_noise3(P, scale, seed=0, aniso=(1,1,1)):
    """Smooth 3D value noise in [-1,1]; scale = feature size in metres; aniso stretches axes."""
    rng=np.random.default_rng(seed); G=rng.uniform(-1,1,(64,64,64))
    Q=P/np.array(aniso)/scale; Q=Q+np.array([17.3,9.1,4.7])
    i=np.floor(Q).astype(int); f=Q-i; f=f*f*f*(f*(f*6-15)+10)
    out=0
    for dx in (0,1):
        for dy in (0,1):
            for dz in (0,1):
                w=(f[:,0] if dx else 1-f[:,0])*(f[:,1] if dy else 1-f[:,1])*(f[:,2] if dz else 1-f[:,2])
                out=out+w*G[(i[:,0]+dx)%64,(i[:,1]+dy)%64,(i[:,2]+dz)%64]
    return out
def fbm3(P, scale, octaves=4, seed=0, aniso=(1,1,1), gain=0.5):
    tot=0; amp=1; norm=0
    for o in range(octaves):
        tot=tot+amp*value_noise3(P, scale/(2**o), seed+o, aniso); norm+=amp; amp*=gain
    return tot/norm
