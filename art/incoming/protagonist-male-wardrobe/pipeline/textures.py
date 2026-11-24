"""Create the wardrobe's UV textile and stitch maps from repeatable patterns."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def fabric(asset, color, size=512):
    dest = ROOT/"materials"/asset
    dest.mkdir(parents=True, exist_ok=True)
    y,x = np.indices((size,size), dtype=np.float32)
    rng = np.random.default_rng(63)
    grain = rng.normal(0,1,(size,size))
    weave = np.cos(x*2*np.pi/3.2 + .75*np.sin(y*2*np.pi/4.7))*np.cos(y*2*np.pi/4.7)
    slub = np.sin(x*.19+y*.054)*np.sin(y*.114-x*.028)
    trim = y < 24
    rib = np.cos(x * 2*np.pi/4.4) * trim
    dashes = np.clip(np.cos(x*2*np.pi/6.0), 0, 1)**.5
    stitch = trim*dashes*(np.exp(-((y-13)/.7)**2)+np.exp(-((y-17)/.7)**2))
    shade = weave*2.3+grain*1.2+slub*2.1+rib*2.7+stitch*9-trim*8
    albedo = np.array(color)[None,None,:]+shade[:,:,None]
    Image.fromarray(np.uint8(np.clip(albedo,0,255))).save(dest/"fabric_basecolor.png")
    height = weave*.24 + grain*.08 + rib*.32 + stitch*.90
    gy,gx = np.gradient(height)
    normal = np.stack((-gx,gy,np.ones_like(gx)),axis=-1)
    normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8((normal*.5+.5)*255)).save(dest/"fabric_normal.png")


def denim():
    dest = ROOT/"materials"/"jeans-denim-standard"
    dest.mkdir(parents=True,exist_ok=True)
    size = 1024
    y,x = np.indices((size,size),dtype=np.float32)
    u,v = x/size, 1-y/size
    rng = np.random.default_rng(92)
    yarn = np.sin(x*1.57 + .43*np.cos(y*1.83))
    twill = np.sin(x*1.56-y*1.51) + .25*np.cos(y*2.88+x*.31)
    noise = rng.normal(0,1,(size,size))
    col = np.where(u<.5,(u-.02)/.47,(u-.51)/.47)
    leg = v<.65
    fades = 15*np.exp(-((col-.24)/.12)**2)*np.exp(-((v-.47)/.14)**2)*leg
    fades += 11*np.exp(-((col-.63)/.15)**2)*np.exp(-((v-.47)/.13)**2)*leg
    fades += 7*np.sin(v*228+col*21)*np.exp(-((v-.31)/.07)**2)*leg*np.exp(-((col-.23)/.17)**2)
    fades += 6*np.cos(col*4-v*19)*np.sin(v*16+col*13)
    seam = np.exp(-((col-.50)/.009)**2)*leg + np.exp(-((col-.86)/.009)**2)*leg
    hem = np.exp(-((v-.081)/.004)**2)*leg + np.exp(-((v-.096)/.002)**2)*leg
    shade = yarn*2+twill*3+noise*2+fades-seam*13-hem*9
    rgb = np.clip(shade[:,:,None]+np.array([46,63,86])[None,None,:],0,255)
    image = Image.fromarray(np.uint8(rgb))
    relief = Image.new("L",image.size,0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(image)
    hdraw = ImageDraw.Draw(relief)

    def pixels(points):
        return [(int(a*size),int((1-b)*size)) for a,b in points]

    def sewn(points, width=3):
        points = pixels(points)
        draw.line(points,fill=(34,47,64),width=width+4,joint="curve")
        hdraw.line(points,fill=100,width=width+4,joint="curve")
        for p,q in zip(points,points[1:]):
            distance = np.hypot(q[0]-p[0],q[1]-p[1])
            if distance==0:
                continue
            for t in np.arange(0,distance,7):
                a,b = t/distance,min(t+4,distance)/distance
                segment = [(p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f) for f in (a,b)]
                draw.line(segment,fill=(153,119,78),width=width)
                hdraw.line(segment,fill=220,width=width)

    # Atlas-aligned fly, curved front pockets, yoke and patch pocket stitching.
    sewn([(.02,.854),(.49,.854)])
    sewn([(.51,.854),(.98,.854)])
    sewn([(.02,.926),(.49,.926)],2)
    sewn([(.51,.926),(.98,.926)],2)
    sewn([(.253,.854),(.253,.731),(.267,.702),(.285,.696)],2)
    sewn([(.02,.763),(.077,.768),(.117,.790),(.140,.820),(.145,.854)],2)
    sewn([(.49,.763),(.428,.768),(.392,.790),(.365,.827),(.362,.854)],2)
    sewn([(.037,.845),(.103,.845),(.102,.804),(.051,.803)],2)
    sewn([(.51,.855),(.745,.806),(.98,.855)],2)
    for cx in (.625,.865):
        sewn([(cx-.078,.798),(cx+.078,.798),(cx+.073,.701),(cx,.679),(cx-.070,.701),(cx-.078,.798)],2)
        sewn([(cx-.065,.763),(cx-.035,.748),(cx,.743),(cx+.042,.752),(cx+.065,.765)],1)
    for base in (.02,.51):
        sewn([(base+.47*.50,.059),(base+.47*.50,.641)],1)
        sewn([(base+.47*.86,.059),(base+.47*.86,.641)],1)
        sewn([(base,.084),(base+.47,.084)],2)
    for center,r in (((.253,.882),7),((.141,.840),3),((.366,.840),3),((.062,.805),3),((.444,.805),3)):
        px,py=pixels([center])[0]
        draw.ellipse((px-r,py-r,px+r,py+r),fill=(120,104,79),outline=(48,40,34),width=2)
        draw.arc((px-r+2,py-r+2,px+r-2,py+r-2),195,310,fill=(199,185,148),width=2)
        hdraw.ellipse((px-r,py-r,px+r,py+r),fill=245)
    for a in (.074,.173,.329,.444,.552,.715,.776,.940):
        pts = [(a-.009,.851),(a-.009,.945),(a+.009,.945),(a+.009,.851)]
        draw.polygon(pixels(pts), fill=(57,75,99))
        sewn(pts,1)
    image.save(dest/"denim_basecolor.png")
    height = .19*twill+.055*noise+.10*yarn+.87*np.asarray(relief,dtype=np.float32)/255
    gy,gx = np.gradient(height)
    normal = np.stack((-gx,gy,np.ones_like(gx)),axis=-1)
    normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8((normal*.5+.5)*255)).save(dest/"denim_normal.png")


def leather():
    size=512
    dest = ROOT/"materials"/"court-sneakers-white"
    dest.mkdir(parents=True,exist_ok=True)
    y,x = np.indices((size,size),dtype=np.float32)
    u,v=x/size,1-y/size
    rng=np.random.default_rng(59)
    pebble = 1.9*np.cos(x*1.92+np.sin(y*1.52))*np.cos(y*1.63+np.cos(x*1.37))
    texture = pebble + rng.normal(0,1.1,(size,size))
    rubber = v<.28
    collar = (u>.743)&(v>.29)&(v<.47)
    sole_tread = (u>.742)&(v<.27)
    lace = (u>.74)&(v>.49)
    side_tread = (u<.73)&(v>.057)&(v<.12)
    texture += side_tread*(1.4*np.cos(x*2.7)) + sole_tread*(4*np.sin(v*300+u*19)*np.cos(u*380-v*9))
    texture += lace*(3*np.cos(x*2.5+y*.43)) - 10*sole_tread - 43*collar
    from PIL import ImageDraw
    rgb=np.uint8(np.clip(texture[:,:,None]+np.array([226,224,217])[None,None,:]+rubber[:,:,None]*3,0,255))
    img=Image.fromarray(rgb)
    relief=Image.new("L",img.size,0)
    draw, bump = ImageDraw.Draw(img), ImageDraw.Draw(relief)
    def pt(u,v):
        return round(u*size),round((1-v)*size)
    def stitched(points):
        xy=[pt(*p) for p in points]
        draw.line(xy,fill=(150,148,139),width=3,joint="curve")
        bump.line(xy,fill=172,width=3,joint="curve")
        for a,b in zip(xy,xy[1:]):
            d=np.hypot(b[0]-a[0],b[1]-a[1])
            if d==0:
                continue
            for k in np.arange(0,d,6):
                ab=[(a[0]+(b[0]-a[0])*j/d,a[1]+(b[1]-a[1])*j/d) for j in (k,min(k+3,d))]
                draw.line(ab,fill=(247,243,230),width=1)
    stitched([(.02,.53),(.09,.53),(.147,.52),(.192,.496),(.228,.451),(.261,.402),(.30,.38)])
    stitched([(.72,.53),(.65,.53),(.593,.52),(.548,.496),(.512,.451),(.479,.402),(.44,.38)])
    stitched([(.02,.347),(.72,.347)])
    stitched([(.265,.347),(.269,.59),(.258,.73),(.230,.82),(.18,.862)])
    stitched([(.475,.347),(.471,.59),(.482,.73),(.510,.82),(.56,.862)])
    stitched([(.315,.347),(.318,.53),(.336,.69),(.362,.73),(.415,.73),(.441,.69),(.461,.53),(.467,.347)])
    stitched([(.03,.887),(.714,.887)])
    for s in (1,-1):
        for row in range(4):
            v0=.56+row*.05
            for i in range(4):
                u0=(.027+(.017*i)+.007*(row%2))
                if s<0:
                    u0=.74-u0
                cx,cy=pt(u0,v0)
                draw.ellipse((cx-1,cy-1,cx+1,cy+1),fill=(100,98,92))
                bump.ellipse((cx-1,cy-1,cx+1,cy+1),fill=220)
    img.save(dest/"leather_basecolor.png")
    height = .040*texture+.62*np.asarray(relief,dtype=np.float32)/255
    gy,gx=np.gradient(height)
    normal=np.stack((-gx,gy,np.ones_like(gx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8((normal*.5+.5)*255)).save(dest/"leather_normal.png")


if __name__ == "__main__":
    fabric("tee-white",(225,224,220))
    denim()
    leather()
